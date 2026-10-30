// [2026-10-29 10:24 PM Johnny Chu - Chu Hoàng Anh] INIT — khởi tạo Bizcity Core Framework: sổ cái chỉ thêm, cửa nạp sự việc, CANON, hợp đồng, bộ kiểm chuẩn.
// [2026-10-30 10:29 AM Johnny Chu - Chu Hoàng Anh] PHASE-003 — tự chẩn đoán L1 / L3, diagnostic_runs, khoá kỳ chặn khi sổ lỗi (PHASES 2.10).
// [2026-10-30 11:10 AM Johnny Chu - Chu Hoàng Anh] PHASE-003 — runtime action defineAction, idempotency, dry-run (PHASES 2.5).
/**
 * Khuôn phản hồi chung của API.
 *
 * Thành công:  { "ok": true,  "data": ..., "meta": {...} }
 * Thất bại:    { "ok": false, "error": { "code": "...", "message": "...", "details": ... } }
 *
 * Mọi endpoint trả đúng một trong hai dạng này, để phía gọi chỉ cần một cách xử lý.
 */

export interface ApiSuccess<T> {
  ok: true;
  data: T;
  meta?: PageMeta | Record<string, unknown>;
}

export interface ApiFailure {
  ok: false;
  error: {
    code: ErrorCode;
    message: string;
    details?: unknown;
  };
}

export type ApiResponse<T> = ApiSuccess<T> | ApiFailure;

export interface PageMeta {
  page: number;
  pageSize: number;
  total: number;
}

/** Mã lỗi ổn định, phía gọi dựa vào mã này để xử lý (không dựa vào câu chữ). */
export const ERROR_CODES = {
  VALIDATION: 'VALIDATION_ERROR',
  UNAUTHORIZED: 'UNAUTHORIZED',
  FORBIDDEN: 'FORBIDDEN',
  NOT_FOUND: 'NOT_FOUND',
  CONFLICT: 'CONFLICT',
  PERIOD_LOCKED: 'PERIOD_LOCKED',
  POSTING_FAILED: 'POSTING_FAILED',
  UNBALANCED: 'UNBALANCED_ENTRY',
  INTERNAL: 'INTERNAL_ERROR',
  /** Bản cài chưa sẵn sàng phục vụ (L1: còn migration chưa áp, mất trigger bảo vệ sổ, CSDL chỉ đọc) — GET /system/health/ready. */
  NOT_READY: 'NOT_READY',
  /** bizcity_action@1 §7–8: cùng Idempotency-Key, khác nội dung. */
  IDEMPOTENCY_CONFLICT: 'IDEMPOTENCY_CONFLICT',
  /** Module cần năng lực Core chưa có (bizcity-standard.json: planned). */
  CAPABILITY_MISSING: 'CAPABILITY_MISSING',
  /** Module chưa bật cho đơn vị. */
  MODULE_DISABLED: 'MODULE_DISABLED',
  /** Quá hạn mức gọi (khoá API, AI). */
  RATE_LIMITED: 'RATE_LIMITED',
} as const;
export type ErrorCode = (typeof ERROR_CODES)[keyof typeof ERROR_CODES];

/** Mục menu. Dùng cho menu lõi lẫn menu do add-in khai báo. */
export interface MenuItem {
  key: string;
  label: string;
  /** Đường dẫn trên giao diện; mục cha có thể để trống. */
  path?: string;
  /** Mã chức năng hiển thị cạnh tên, ví dụ "ACC10". */
  code?: string;
  /** Chỉ hiện với người có quyền này (ví dụ "users:write"). Để trống = ai cũng thấy. */
  permission?: string;
  children?: MenuItem[];
}
