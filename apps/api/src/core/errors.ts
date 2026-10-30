// @bizcity-layer P actions
/**
 * Lỗi nghiệp vụ có mã ổn định. Service ném các lỗi này; bộ xử lý lỗi chung
 * (core/http.ts) đổi thành phản hồi { ok: false, error: {...} } với mã HTTP phù hợp.
 */
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
