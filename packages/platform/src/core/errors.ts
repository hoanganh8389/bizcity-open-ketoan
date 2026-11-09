// @bizcity-layer P actions
// [2026-10-29 10:24 PM Johnny Chu - Chu Hoàng Anh] INIT — khởi tạo Bizcity Core Framework: sổ cái chỉ thêm, cửa nạp sự việc, CANON, hợp đồng, bộ kiểm chuẩn.
// [2026-10-30 09:58 AM Johnny Chu - Chu Hoàng Anh] PHASE-002 — nhãn lớp @bizcity-layer, đồ thị phụ thuộc mốc, bản nháp API module-sdk.
// [2026-10-30 10:29 AM Johnny Chu - Chu Hoàng Anh] PHASE-003 — tự chẩn đoán L1 / L3, diagnostic_runs, khoá kỳ chặn khi sổ lỗi (PHASES 2.10).
// [2026-10-30 11:10 AM Johnny Chu - Chu Hoàng Anh] PHASE-003 — runtime action defineAction, idempotency, dry-run (PHASES 2.5).
// [2026-10-30 12:10 PM Johnny Chu - Chu Hoàng Anh] ADR-0007 — chuẩn hoá mã lỗi, quan sát, bộ giám sát, cài nhanh, kiến trúc, đóng góp.
// [2026-11-01 04:20 PM Johnny Chu - Chu Hoàng Anh] PHASE-010 — dời từ apps/api/src/core/errors.ts sang packages/platform (@bizcity/platform, D010-7 chặng 2); import tương đối viết lại theo chỗ mới
/**
 * Lỗi nghiệp vụ có mã ổn định. Service ném các lỗi này; bộ xử lý lỗi chung
 * (core/http.ts) đổi thành phản hồi { ok: false, error: {...} } với mã HTTP phù hợp.
 */
import { ZodError } from 'zod';
import { ERROR_CATALOG, ERROR_CODES, ERROR_CONTEXT_KEYS, ERROR_REMEDY, type ErrorCode, type ErrorContext, type ErrorReason } from '@ketoan/contracts';

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
  // [2026-11-02 07:40 PM Johnny Chu - Chu Hoàng Anh] PHASE-021 — W2 (ADR-0014 D2): thông tin bể chờ gắn vào lỗi cửa nạp — trả ở error.intake, không đổi khuôn details
  /** Cửa nạp từ chối và đã giữ chứng từ ở bể chờ: { id, score, findings, url }. */
  intake?: unknown;
}

/** Lỗi theo danh mục (bizcity_errors@1): HTTP status và thông báo mặc định lấy từ ERROR_CATALOG — một nguồn cho API, MCP, tài liệu. */
const make = (code: ErrorCode, message?: string, details?: unknown) => new AppError(code, message ?? ERROR_CATALOG[code].message, ERROR_CATALOG[code].http, details);

// [2026-11-10 10:50 AM Johnny Chu - Chu Hoàng Anh] PHASE-022 — S022-17 (RV-R1-06, BIZCITY-ERRORS-v1 §4b): lỗi Kernel mang phương án khắc phục (details.remedy) và ngữ cảnh chứng từ (details.context)
const isPlain = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
/** Gắn `remedy` của mã (hoặc của `reason`, thắng) vào details dạng object; details dạng khác (mảng câu của lỗi kiểm) đi nguyên. */
export function withRemedy(code: ErrorCode, details?: unknown, reason?: ErrorReason): unknown {
  if (details !== undefined && !isPlain(details)) return details;
  const base = { ...(details ?? {}) } as Record<string, unknown>;
  const r = (reason ? ERROR_REMEDY[reason] : undefined) ?? ERROR_REMEDY[code];
  if (r && base.remedy === undefined) base.remedy = r;
  return Object.keys(base).length ? base : undefined;
}
/** Mã mang ngữ cảnh chứng từ (§4b mục 3): UNBALANCED_ENTRY, PERIOD_LOCKED, POSTING_FAILED, và CONFLICT kèm reason LEDGER_*. */
const wantsContext = (e: AppError) => e.code === 'UNBALANCED_ENTRY' || e.code === 'PERIOD_LOCKED' || e.code === 'POSTING_FAILED'
  || (e.code === 'CONFLICT' && isPlain(e.details) && typeof e.details.reason === 'string' && e.details.reason.startsWith('LEDGER_'));
/**
 * Bổ sung ngữ cảnh chứng từ vào `details.context` của lỗi Kernel: chỉ khoá còn THIẾU, không đổi code / message / details khác, không ghi đè khoá có sẵn.
 * Lỗi không phải AppError, mã ngoài danh sách, hoặc details không phải object đi qua nguyên vẹn.
 */
export function withErrorContext<E>(err: E, ctx: ErrorContext): E {
  if (!(err instanceof AppError) || !wantsContext(err)) return err;
  if (err.details !== undefined && !isPlain(err.details)) return err;
  const base = (err.details ?? {}) as Record<string, unknown>;
  const cur = isPlain(base.context) ? base.context : {};
  const add: Record<string, unknown> = {};
  for (const k of ERROR_CONTEXT_KEYS) if (ctx[k] !== undefined && ctx[k] !== null && cur[k] === undefined) add[k] = ctx[k];
  if (!Object.keys(add).length) return err;
  const out = new AppError(err.code, err.message, err.httpStatus, { ...base, context: { ...cur, ...add } });
  out.intake = err.intake;
  out.stack = err.stack;
  return out as E;
}

export const Errors = {
  validation: (message: string, details?: unknown) => make(ERROR_CODES.VALIDATION, message, details),
  unauthorized: (message?: string) => make(ERROR_CODES.UNAUTHORIZED, message),
  forbidden: (message?: string) => make(ERROR_CODES.FORBIDDEN, message),
  notFound: (what: string) => make(ERROR_CODES.NOT_FOUND, `Không tìm thấy ${what}`),
  conflict: (message: string, details?: unknown) => make(ERROR_CODES.CONFLICT, message, details),
  periodLocked: (message = 'Kỳ kế toán đã khoá: cần mở khoá kỳ trước khi thêm, sửa, xoá phiếu', details?: unknown) => make(ERROR_CODES.PERIOD_LOCKED, message, withRemedy(ERROR_CODES.PERIOD_LOCKED, details)),
  posting: (message: string, details?: unknown) => make(ERROR_CODES.POSTING_FAILED, message, withRemedy(ERROR_CODES.POSTING_FAILED, details)),
  unbalanced: (message = 'Tổng Nợ và tổng Có không bằng nhau — kiểm tra lại các dòng', details?: unknown) => make(ERROR_CODES.UNBALANCED, message, withRemedy(ERROR_CODES.UNBALANCED, isPlain(details) && typeof details.debit === 'number' && typeof details.credit === 'number' ? { ...details, difference: Math.round((details.debit - details.credit) * 100) / 100 } : details)),
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

// [2026-11-08 02:05 PM Johnny Chu - Chu Hoàng Anh] PHASE-029 — S029-33: ánh xạ lỗi trigger sổ cái đúng BIZCITY-ERRORS-v1 §5 (1.3.0-draft); một nơi cho core/http.ts và errorCodeOf
/**
 * Lỗi do trigger bảo vệ sổ cái ném ra (BIZCITY-ERRORS-v1 §5, 1.3.0-draft). Các trigger này ném `check_violation` (23514) và
 * `insufficient_privilege` (42501), KHÔNG ném P0001, nên chỉ nhận ra được bằng câu chữ của trigger — câu chữ là một phần của hợp đồng
 * (đổi câu của trigger thì đổi bảng §5 cùng PR). Trả undefined khi không phải ba trường hợp này: bên gọi rơi về POSTING_FAILED (CHECK / quyền khác).
 */
export function classifyLedgerTriggerError(err: unknown): { code: ErrorCode; reason?: ErrorReason } | undefined {
  const pg = (err as { code?: unknown } | null)?.code;
  const msg = String((err as { message?: unknown } | null)?.message ?? '');
  if (pg === '23514' && /không cân/i.test(msg)) return { code: ERROR_CODES.UNBALANCED };
  if (pg === '23514' && /^PERIOD_LOCKED:/.test(msg)) return { code: ERROR_CODES.PERIOD_LOCKED };
  if (pg === '42501' && /chỉ được thêm|chỉ thêm/i.test(msg)) return { code: ERROR_CODES.CONFLICT, reason: 'LEDGER_APPEND_ONLY' };
  return undefined;
}

/**
 * Mã lỗi (bizcity_errors@1) của một lỗi bất kỳ, khớp cách core/http.ts trả cho người gọi: AppError giữ mã; lỗi kiểm dữ liệu →
 * VALIDATION_ERROR; lỗi trigger / ràng buộc của CSDL theo SQLSTATE; còn lại INTERNAL_ERROR. Dùng cho trace (core/tracing.ts).
 */
export function errorCodeOf(err: unknown): ErrorCode {
  if (err instanceof AppError) return err.code;
  if (err instanceof ZodError || (err as { validation?: unknown } | null)?.validation) return ERROR_CODES.VALIDATION;
  const trigger = classifyLedgerTriggerError(err);
  if (trigger) return trigger.code;
  const pg = (err as { code?: unknown } | null)?.code;
  if (pg === '23514' || pg === '42501') return ERROR_CODES.POSTING_FAILED;
  if (pg === 'P0001') return /không cân/i.test(String((err as Error).message)) ? ERROR_CODES.UNBALANCED : ERROR_CODES.CONFLICT;
  if (pg === '23505') return ERROR_CODES.CONFLICT;
  if (pg === '23503') return /update or delete/i.test(String((err as Error).message)) ? ERROR_CODES.CONFLICT : ERROR_CODES.VALIDATION;
  return ERROR_CODES.INTERNAL;
}
