// @bizcity-layer P actions
// [2026-10-29 10:24 PM Johnny Chu - Chu Hoàng Anh] INIT — khởi tạo Bizcity Core Framework: sổ cái chỉ thêm, cửa nạp sự việc, CANON, hợp đồng, bộ kiểm chuẩn.
// [2026-10-30 09:58 AM Johnny Chu - Chu Hoàng Anh] PHASE-002 — nhãn lớp @bizcity-layer, đồ thị phụ thuộc mốc, bản nháp API module-sdk.
// [2026-10-30 10:29 AM Johnny Chu - Chu Hoàng Anh] PHASE-003 — tự chẩn đoán L1 / L3, diagnostic_runs, khoá kỳ chặn khi sổ lỗi (PHASES 2.10).
// [2026-10-30 11:10 AM Johnny Chu - Chu Hoàng Anh] PHASE-003 — runtime action defineAction, idempotency, dry-run (PHASES 2.5).
// [2026-10-30 12:10 PM Johnny Chu - Chu Hoàng Anh] ADR-0007 — chuẩn hoá mã lỗi, quan sát, bộ giám sát, cài nhanh, kiến trúc, đóng góp.
/**
 * Lỗi nghiệp vụ có mã ổn định. Service ném các lỗi này; bộ xử lý lỗi chung
 * (core/http.ts) đổi thành phản hồi { ok: false, error: {...} } với mã HTTP phù hợp.
 */
import { ZodError } from 'zod';
import { ERROR_CATALOG, ERROR_CODES, type ErrorCode } from '@ketoan/contracts';

export class AppError extends Error {
  constructor(
    public readonly code: ErrorCode,
    message: string,
    public readonly httpStatus: number,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = 'AppError';
  }
}

/** Lỗi theo danh mục (bizcity_errors@1): HTTP status và thông báo mặc định lấy từ ERROR_CATALOG — một nguồn cho API, MCP, tài liệu. */
const make = (code: ErrorCode, message?: string, details?: unknown) => new AppError(code, message ?? ERROR_CATALOG[code].message, ERROR_CATALOG[code].http, details);

export const Errors = {
  validation: (message: string, details?: unknown) => make(ERROR_CODES.VALIDATION, message, details),
  unauthorized: (message?: string) => make(ERROR_CODES.UNAUTHORIZED, message),
  forbidden: (message?: string) => make(ERROR_CODES.FORBIDDEN, message),
  notFound: (what: string) => make(ERROR_CODES.NOT_FOUND, `Không tìm thấy ${what}`),
  conflict: (message: string, details?: unknown) => make(ERROR_CODES.CONFLICT, message, details),
  periodLocked: (message = 'Kỳ kế toán đã khoá: cần mở khoá kỳ trước khi thêm, sửa, xoá phiếu') => make(ERROR_CODES.PERIOD_LOCKED, message),
  posting: (message: string, details?: unknown) => make(ERROR_CODES.POSTING_FAILED, message, details),
  unbalanced: (message = 'Tổng Nợ và tổng Có không bằng nhau — kiểm tra lại các dòng', details?: unknown) => make(ERROR_CODES.UNBALANCED, message, details),
  notReady: (message: string, details?: unknown) => make(ERROR_CODES.NOT_READY, message, details),
  idempotencyConflict: (message?: string) => make(ERROR_CODES.IDEMPOTENCY_CONFLICT, message),
  capabilityMissing: (capability: string) => make(ERROR_CODES.CAPABILITY_MISSING, `Core chưa có năng lực ${capability}`, { capability }),
  moduleDisabled: (moduleKey: string) => make(ERROR_CODES.MODULE_DISABLED, `Phân hệ ${moduleKey} chưa bật cho đơn vị`, { module: moduleKey }),
  rateLimited: (message?: string) => make(ERROR_CODES.RATE_LIMITED, message),
};

// [2026-11-01 04:13 PM Johnny Chu - Chu Hoàng Anh] ADR-0010 — OpenTelemetry từ lõi (PHASE-018 W5): span ở khớp nối Platform + cổng Kernel, lọc thuộc tính, traceparent qua outbox
/** Nhóm category của bizcity_errors@1 là từ chối nghiệp vụ đúng luật (D018-5); còn lại / mã lạ là lỗi kỹ thuật. */
const BUSINESS_CATEGORIES = new Set(['ledger', 'input', 'state', 'auth']);

/** Từ chối nghiệp vụ (kỳ khoá, không cân, thiếu cấu hình, không quyền…) hay lỗi kỹ thuật — một quy tắc cho số đo ghi sổ và trace. */
export function errorKind(code: string | null | undefined): 'rejected' | 'error' {
  const entry = code ? (ERROR_CATALOG as Record<string, { category: string } | undefined>)[code] : undefined;
  return entry && BUSINESS_CATEGORIES.has(entry.category) ? 'rejected' : 'error';
}

/**
 * Mã lỗi (bizcity_errors@1) của một lỗi bất kỳ, khớp cách core/http.ts trả cho người gọi: AppError giữ mã; lỗi kiểm dữ liệu →
 * VALIDATION_ERROR; lỗi trigger / ràng buộc của CSDL theo SQLSTATE; còn lại INTERNAL_ERROR. Dùng cho trace (core/tracing.ts).
 */
export function errorCodeOf(err: unknown): ErrorCode {
  if (err instanceof AppError) return err.code;
  if (err instanceof ZodError || (err as { validation?: unknown } | null)?.validation) return ERROR_CODES.VALIDATION;
  const pg = (err as { code?: unknown } | null)?.code;
  if (pg === '23514' || pg === '42501') return ERROR_CODES.POSTING_FAILED;
  if (pg === 'P0001') return /không cân/i.test(String((err as Error).message)) ? ERROR_CODES.UNBALANCED : ERROR_CODES.CONFLICT;
  if (pg === '23505') return ERROR_CODES.CONFLICT;
  if (pg === '23503') return /update or delete/i.test(String((err as Error).message)) ? ERROR_CODES.CONFLICT : ERROR_CODES.VALIDATION;
  return ERROR_CODES.INTERNAL;
}
