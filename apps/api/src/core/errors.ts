/**
 * Lỗi nghiệp vụ có mã ổn định. Service ném các lỗi này; bộ xử lý lỗi chung
 * (core/http.ts) đổi thành phản hồi { ok: false, error: {...} } với mã HTTP phù hợp.
 */
import { ERROR_CODES, type ErrorCode } from '@ketoan/contracts';

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

export const Errors = {
  validation: (message: string, details?: unknown) => new AppError(ERROR_CODES.VALIDATION, message, 400, details),
  unauthorized: (message = 'Chưa đăng nhập hoặc phiên đã hết hạn') => new AppError(ERROR_CODES.UNAUTHORIZED, message, 401),
  forbidden: (message = 'Bạn không có quyền truy cập chức năng này!') => new AppError(ERROR_CODES.FORBIDDEN, message, 403),
  notFound: (what: string) => new AppError(ERROR_CODES.NOT_FOUND, `Không tìm thấy ${what}`, 404),
  conflict: (message: string, details?: unknown) => new AppError(ERROR_CODES.CONFLICT, message, 409, details),
  periodLocked: (message = 'Kỳ kế toán đã được khóa. Bạn cần mở khóa trước khi thêm/sửa/xóa phiếu!') =>
    new AppError(ERROR_CODES.PERIOD_LOCKED, message, 409),
  posting: (message: string, details?: unknown) => new AppError(ERROR_CODES.POSTING_FAILED, message, 422, details),
  unbalanced: (message = 'Tổng nợ và có không bằng nhau, bạn kiểm tra lại thông tin!', details?: unknown) =>
    new AppError(ERROR_CODES.UNBALANCED, message, 422, details),
};
