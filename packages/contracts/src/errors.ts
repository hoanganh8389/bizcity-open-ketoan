/**
 * Danh mục mã lỗi (bizcity_errors@1) — NGUỒN DUY NHẤT cho: HTTP status, có thử lại được không, thông báo mặc định, gợi ý.
 * API (core/errors.ts) lấy thông báo mặc định, MCP lấy hint, giao diện lấy cách xử lý. Bảng người đọc:
 * docs/contracts/BIZCITY-ERRORS-v1.md §3 — check SC-ERR-1 so hai nơi. Mỗi mã một dòng (bộ kiểm đọc tệp này bằng regex).
 */
import type { ErrorCode } from './api.js';

export type ErrorCategory = 'input' | 'auth' | 'state' | 'ledger' | 'platform' | 'server';

export interface ErrorSpec {
  http: number;
  category: ErrorCategory;
  retryable: boolean;
  owner: 'core' | 'kernel' | 'platform';
  /** Thông báo mặc định cho người dùng cuối (tiếng Việt, R-ERR-3). */
  message: string;
  /** Làm gì tiếp — Cell / MCP đọc cho người dùng, tài liệu tích hợp. */
  hint: string;
}

// prettier-ignore
export const ERROR_CATALOG: Record<ErrorCode, ErrorSpec> = {
  VALIDATION_ERROR: { http: 400, category: 'input', retryable: false, owner: 'core', message: 'Dữ liệu gửi lên không hợp lệ', hint: 'Sửa các trường nêu trong error.details rồi gửi lại; gửi y nguyên sẽ bị từ chối tiếp.' },
  UNAUTHORIZED: { http: 401, category: 'auth', retryable: false, owner: 'core', message: 'Chưa đăng nhập hoặc phiên đã hết hạn', hint: 'Đăng nhập lại, hoặc kiểm khoá API còn hiệu lực.' },
  FORBIDDEN: { http: 403, category: 'auth', retryable: false, owner: 'core', message: 'Bạn không có quyền truy cập chức năng này', hint: 'Nhờ chủ đơn vị cấp quyền, hoặc dùng khoá API có phạm vi phù hợp.' },
  NOT_FOUND: { http: 404, category: 'input', retryable: false, owner: 'core', message: 'Không tìm thấy dữ liệu', hint: 'Kiểm lại mã hoặc đường dẫn; dữ liệu có thể đã bị huỷ.' },
  CONFLICT: { http: 409, category: 'state', retryable: false, owner: 'core', message: 'Thao tác xung đột với trạng thái hiện tại của dữ liệu', hint: 'Đọc lại dữ liệu mới nhất rồi làm lại; gửi chứng từ thì tăng version.' },
  PERIOD_LOCKED: { http: 409, category: 'ledger', retryable: false, owner: 'kernel', message: 'Kỳ kế toán đã khoá', hint: 'Nhờ kế toán trưởng mở kỳ, hoặc chọn ngày thuộc kỳ còn mở.' },
  POSTING_FAILED: { http: 422, category: 'ledger', retryable: false, owner: 'kernel', message: 'Chưa định khoản được chứng từ', hint: 'Kế toán bổ sung cấu hình định khoản ở ACC14 rồi định khoản lại; bên gửi không cần gửi lại.' },
  UNBALANCED_ENTRY: { http: 422, category: 'ledger', retryable: false, owner: 'kernel', message: 'Bút toán không cân Nợ = Có', hint: 'Lỗi luật định khoản: báo nhóm Lõi kèm requestId; không tự sửa sổ.' },
  IDEMPOTENCY_CONFLICT: { http: 409, category: 'input', retryable: false, owner: 'platform', message: 'Idempotency-Key đã dùng cho yêu cầu có nội dung khác', hint: 'Sinh khoá mới cho thao tác mới; gửi lại thì giữ nguyên cả khoá lẫn nội dung.' },
  CAPABILITY_MISSING: { http: 501, category: 'platform', retryable: false, owner: 'platform', message: 'Core chưa có năng lực mà module cần', hint: 'Nâng cấp Core lên bản có năng lực này, hoặc tắt module (xem /system/capabilities).' },
  MODULE_DISABLED: { http: 403, category: 'platform', retryable: false, owner: 'platform', message: 'Phân hệ chưa bật cho đơn vị', hint: 'Chủ đơn vị bật phân hệ trong cấu hình.' },
  RATE_LIMITED: { http: 429, category: 'platform', retryable: true, owner: 'platform', message: 'Gọi quá nhiều lần', hint: 'Chờ theo header Retry-After rồi gửi lại, giãn nhịp gọi.' },
  NOT_READY: { http: 503, category: 'platform', retryable: true, owner: 'platform', message: 'Hệ thống chưa sẵn sàng', hint: 'Chờ vận hành áp migration hoặc khôi phục CSDL rồi thử lại.' },
  INTERNAL_ERROR: { http: 500, category: 'server', retryable: true, owner: 'core', message: 'Lỗi hệ thống', hint: 'Thử lại sau ít phút; lặp lại thì gửi requestId cho bộ phận hỗ trợ.' },
};

/** Mã của giao thức MCP (trong kết quả công cụ, không phải HTTP) — bizcity_mcp@1 STD-MCP-4. */
// prettier-ignore
export const MCP_ERROR_CATALOG = {
  MCP_CONFIRM_INVALID: { retryable: false, message: 'Token xác nhận sai, hết hạn, đã dùng, hoặc không thuộc công cụ / người gọi này', hint: 'Gọi lại không kèm confirm_token để xem trước và xin xác nhận lại.' },
  MCP_CONFIRM_ARGS_CHANGED: { retryable: false, message: 'Tham số khác bản đã xem trước', hint: 'Gọi lại không kèm confirm_token để xem trước bản mới.' },
} as const;
export type McpErrorCode = keyof typeof MCP_ERROR_CATALOG;

/** Mã chi tiết `details.reason` của Core (BIZCITY-ERRORS-v1 §4); module khai thêm với tiền tố key module. */
export const ERROR_REASONS = {
  LEDGER_DIAGNOSTICS_FAILED: 'Khoá kỳ bị chặn vì tự chẩn đoán L3 có lỗi trong kỳ (R-DIAG-4)',
  LEDGER_APPEND_ONLY: 'Trigger chặn sửa / xoá sổ cái hoặc bằng chứng',
  DB_UNIQUE_VIOLATION: 'Trùng mã / khoá duy nhất',
  DB_IN_USE: 'Xoá một mã còn dữ liệu khác trỏ tới',
  DB_REFERENCE_MISSING: 'Tham chiếu tới mã chưa khai báo',
} as const;
export type ErrorReason = keyof typeof ERROR_REASONS;
