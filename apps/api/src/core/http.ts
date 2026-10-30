// @bizcity-layer P actions
// [2026-10-29 10:24 PM Johnny Chu - Chu Hoàng Anh] INIT — khởi tạo Bizcity Core Framework: sổ cái chỉ thêm, cửa nạp sự việc, CANON, hợp đồng, bộ kiểm chuẩn.
// [2026-10-30 09:58 AM Johnny Chu - Chu Hoàng Anh] PHASE-002 — nhãn lớp @bizcity-layer, đồ thị phụ thuộc mốc, bản nháp API module-sdk.
// [2026-10-30 12:10 PM Johnny Chu - Chu Hoàng Anh] ADR-0007 — chuẩn hoá mã lỗi, quan sát, bộ giám sát, cài nhanh, kiến trúc, đóng góp.
/**
 * Tiện ích HTTP dùng chung: khuôn phản hồi, phân trang, bộ xử lý lỗi.
 */
import type { FastifyError, FastifyInstance } from 'fastify';
import { ZodError, z } from 'zod';
import { ERROR_CATALOG, ERROR_CODES, type ApiSuccess, type ErrorCode, type ErrorReason, type PageMeta } from '@ketoan/contracts';
import { AppError } from './errors.js';

/** Phản hồi thành công. */
export function ok<T>(data: T, meta?: ApiSuccess<T>['meta']): ApiSuccess<T> {
  return meta ? { ok: true, data, meta } : { ok: true, data };
}

/**
 * Tham số true/false trên URL. KHÔNG dùng z.coerce.boolean() vì nó biến chuỗi "false" thành true.
 * Nhận: true/false/1/0 (không phân biệt hoa thường); bỏ trống = undefined.
 */
export const queryBool = z
  .union([z.boolean(), z.string()])
  .optional()
  .transform((v) => (v === undefined || v === '' ? undefined : typeof v === 'boolean' ? v : ['true', '1', 'on', 'yes'].includes(v.toLowerCase())));

/** Tham số phân trang chuẩn cho mọi danh sách. */
/** Mã id trong đường dẫn (/…/:id): bigint tự tăng (1, 2, 3…), truyền dạng chuỗi số. */
export const idSchema = z.string().regex(/^[1-9][0-9]{0,18}$/, 'Mã không hợp lệ');
export const idParamSchema = z.object({ id: idSchema });

export const pageQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  /** Màn danh sách của phần mềm lấy toàn bộ (1.000.000); tích hợp ngoài có thể chia trang nhỏ. */
  pageSize: z.coerce.number().int().min(1).max(1_000_000).default(50),
});
export type PageQuery = z.infer<typeof pageQuerySchema>;

export function pageMeta(q: PageQuery, total: number): PageMeta {
  return { page: q.page, pageSize: q.pageSize, total };
}

/** Khuôn mô tả phản hồi cho tài liệu OpenAPI. */
export function okSchema<T extends z.ZodTypeAny>(data: T) {
  return z.object({ ok: z.literal(true), data, meta: z.record(z.unknown()).optional() });
}

/**
 * Gắn bộ xử lý lỗi chung: mọi lỗi đều về khuôn { ok: false, error: { code, message, requestId, details? } } (bizcity_errors@1).
 * HTTP status theo ERROR_CATALOG; mọi phản hồi lỗi có requestId (R-ERR-5); lỗi CSDL ánh xạ cố định (R-ERR-8, BIZCITY-ERRORS §5);
 * 5xx chỉ trả "Lỗi hệ thống", chi tiết vào log (R-ERR-4). Mỗi lỗi ghi log có errCode để Loki / cảnh báo lọc theo mã (R-ERR-9).
 */
export function registerErrorHandler(app: FastifyInstance): void {
  app.setErrorHandler((err: FastifyError | AppError | ZodError, req, reply) => {
    const send = (code: ErrorCode, message: string, details?: unknown, status = ERROR_CATALOG[code].http) => {
      reply.errCode = code;
      if (status >= 500) req.log.error({ err, errCode: code }, 'lỗi hệ thống');
      else req.log.info({ errCode: code, status }, message);
      return reply.status(status).send({ ok: false, error: { code, message, requestId: String(req.id), ...(details === undefined ? {} : { details }) } });
    };
    const withReason = (reason: ErrorReason, extra?: Record<string, unknown>) => ({ reason, ...extra });

    if (err instanceof AppError) return send(err.code, err.message, err.details, err.httpStatus);
    if (err instanceof ZodError) return send(ERROR_CODES.VALIDATION, ERROR_CATALOG.VALIDATION_ERROR.message, err.issues.map(issueText));
    // Lỗi kiểm tra dữ liệu của fastify-type-provider-zod
    const anyErr = err as FastifyError & { validation?: unknown };
    if (anyErr.validation) return send(ERROR_CODES.VALIDATION, ERROR_CATALOG.VALIDATION_ERROR.message, validationTexts(anyErr.validation));
    // Lỗi ràng buộc / trigger ở CSDL: thông điệp tiếng Việt có chủ đích (bút toán không cân, sổ cái chỉ thêm…)
    const pgCode = (err as { code?: string }).code;
    if (pgCode === '23514' || pgCode === '42501') return send(ERROR_CODES.POSTING_FAILED, err.message);
    if (pgCode === '23505') return send(ERROR_CODES.CONFLICT, 'Dữ liệu bị trùng (mã đã tồn tại)', withReason('DB_UNIQUE_VIOLATION'));
    if (pgCode === '23503' && /update or delete/i.test(err.message)) {
      // Xoá một mã còn dữ liệu khác trỏ tới.
      return send(ERROR_CODES.CONFLICT, 'Mã đang được dùng ở dữ liệu khác nên không xoá được: bỏ tích theo dõi / đang dùng để ngừng', withReason('DB_IN_USE'));
    }
    if (pgCode === '23503') return send(ERROR_CODES.VALIDATION, 'Tham chiếu tới mã chưa khai báo trong danh mục', withReason('DB_REFERENCE_MISSING'), 422);
    if (pgCode === 'P0001') {
      // RAISE EXCEPTION của trigger bảo vệ sổ / bằng chứng: câu đã viết cho người dùng, không phải lỗi hệ thống.
      return /không cân/i.test(err.message)
        ? send(ERROR_CODES.UNBALANCED, err.message)
        : send(ERROR_CODES.CONFLICT, err.message, withReason('LEDGER_APPEND_ONLY'));
    }
    const status = anyErr.statusCode && anyErr.statusCode < 500 ? anyErr.statusCode : 500;
    return status >= 500
      ? send(ERROR_CODES.INTERNAL, ERROR_CATALOG.INTERNAL_ERROR.message, undefined, 500)
      : send(ERROR_CODES.VALIDATION, err.message, undefined, status);
  });

  app.setNotFoundHandler((req, reply) => {
    reply.errCode = ERROR_CODES.NOT_FOUND;
    reply.status(404).send({ ok: false, error: { code: ERROR_CODES.NOT_FOUND, message: `Không có đường dẫn ${req.method} ${req.url}`, requestId: String(req.id) } });
  });
}

declare module 'fastify' {
  interface FastifyReply {
    /** Mã lỗi của phản hồi (để log / số đo bizcity_http_errors_total đọc ở onResponse). */
    errCode?: string;
  }
}

/** Tên tiếng Việt của các trường hay gặp trong lỗi kiểm tra dữ liệu. */
const FIELD_LABEL: Record<string, string> = {
  items: 'Danh sách', lines: 'Dòng phiếu', code: 'Mã', name: 'Tên', amount: 'Số tiền', note: 'Ghi chú', description: 'Diễn giải',
  period: 'Kỳ', from: 'Từ ngày', to: 'Đến ngày', docDate: 'Ngày chứng từ', branchCode: 'Chi nhánh', departmentCode: 'Bộ phận',
  costItemCode: 'Khoản mục', costItem: 'Khoản mục', accountCode: 'Tài khoản', debitAccount: 'TK Nợ', creditAccount: 'TK Có',
  partnerCode: 'Đối tượng', taxCode: 'Mã số thuế', quantity: 'Số lượng', price: 'Đơn giá', reasonCode: 'Lý do', sku: 'Mã hàng',
};

/** Câu tiếng Việt cho một lỗi kiểm tra dữ liệu của zod (đường dẫn trường + lý do). */
function issueText(i: { code: string; path: (string | number)[]; message: string; type?: string; minimum?: unknown; maximum?: unknown; received?: unknown; expected?: unknown; options?: unknown[] }): string {
  const where = i.path.length ? i.path.map((p) => (typeof p === 'number' ? `dòng ${p + 1}` : FIELD_LABEL[p] ?? p)).join(' › ') : 'dữ liệu';
  let why = i.message;
  switch (i.code) {
    case 'invalid_type': why = i.received === 'undefined' ? 'thiếu' : `sai kiểu (cần ${String(i.expected)})`; break;
    case 'too_small': why = i.type === 'array' ? `phải có ít nhất ${String(i.minimum)} dòng` : i.type === 'string' ? (Number(i.minimum) <= 1 ? 'không được để trống' : `ít nhất ${String(i.minimum)} ký tự`) : `không được nhỏ hơn ${String(i.minimum)}`; break;
    case 'too_big': why = i.type === 'array' ? `tối đa ${String(i.maximum)} dòng` : i.type === 'string' ? `tối đa ${String(i.maximum)} ký tự` : `không được lớn hơn ${String(i.maximum)}`; break;
    case 'invalid_enum_value': why = `phải là một trong: ${(i.options ?? []).join(', ')}`; break;
    case 'invalid_date': why = 'ngày không hợp lệ'; break;
    default: if (/^[ -~]*$/.test(why)) why = 'không hợp lệ'; // câu tiếng Anh mặc định của zod
  }
  return `${where}: ${why}`;
}

/** Lỗi kiểm tra của fastify-type-provider-zod → danh sách câu tiếng Việt. */
function validationTexts(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  return v.map((x: { params?: { issue?: Parameters<typeof issueText>[0] }; instancePath?: string; message?: string }) =>
    x.params?.issue ? issueText(x.params.issue) : `${(x.instancePath ?? '').replace(/^\//, '').replace(/\//g, ' › ') || 'dữ liệu'}: ${x.message ?? 'không hợp lệ'}`);
}
