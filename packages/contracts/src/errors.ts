// [2026-10-30 12:10 PM Johnny Chu - Chu Hoàng Anh] ADR-0007 — chuẩn hoá mã lỗi, quan sát, bộ giám sát, cài nhanh, kiến trúc, đóng góp.
/**
 * Danh mục mã lỗi (bizcity_errors@1) — NGUỒN DUY NHẤT cho: HTTP status, có thử lại được không, thông báo mặc định, gợi ý.
 * API (core/errors.ts) lấy thông báo mặc định, MCP lấy hint, giao diện lấy cách xử lý. Bảng người đọc:
 * docs/contracts/BIZCITY-ERRORS-v1.md §3 — check SC-ERR-1 so hai nơi. Mỗi mã một dòng (bộ kiểm đọc tệp này bằng regex).
 */
import type { ErrorCode } from './api.js';
import { SCREENS, STOP_THE_LINE_STEP, type Remedy } from './remedy.js';

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
  // [2026-11-09 10:44 PM Johnny Chu - Chu Hoàng Anh] PHASE-022 — S022-21 (BIZCITY-ERRORS 1.6.0 §4c, chủ dự án duyệt): mã chi tiết theo vùng; nối chỗ ném ở PR của chủ tệp
  // Chứng từ, phiên bản
  VERSION_STALE: 'Đã có phiên bản mới hơn bản gửi lên',
  VERSION_CONTENT_MISMATCH: 'Cùng docKey và version nhưng nội dung khác bản đã ghi sổ / chờ ghi (DOCUMENT §7.3)',
  DOC_NOT_DRAFT: 'Thao tác chỉ cho phiếu nháp; phiếu đã ghi sổ hoặc đang chờ huỷ',
  DOC_CANCELLED: 'Phiếu đã huỷ',
  DOC_SOURCE_READONLY: 'Chứng từ nhận từ hệ thống khác: sửa ở nguồn rồi gửi lại',
  DOC_ALREADY_CONFIRMED: 'Đã xác nhận nhận tiền trước đó',
  INTAKE_ITEM_CLOSED: 'Mục bể chờ đã đóng, không sửa được',
  // Sổ cái
  LEDGER_ALREADY_REVERSED: 'Bút toán đã đảo trước đó',
  LEDGER_NO_SOURCE_EVENT: 'Bút toán không gắn sự việc gốc',
  LEDGER_HEADER_EDIT_FROM_APP: 'Lần sửa đầu bút toán đã đi qua ứng dụng, không cần xác nhận',
  // Định khoản
  POSTING_RULE_MISSING: 'Chưa có luật định khoản cho loại chứng từ',
  POSTING_CONFIG_MISSING: 'Thiếu lý do / tài khoản / nhóm hạch toán mặc định',
  POSTING_REASON_KIND: 'Lý do sai loại cho chứng từ',
  // Phân quyền (1 : 1 với mã quyết định AUTHZ-*, đổi - thành _)
  AUTHZ_PERM_UNKNOWN: 'Quyền không có trong sổ quyền',
  AUTHZ_PERM_REMOVED: 'Quyền đã bỏ',
  AUTHZ_PERM_NOT_GRANTED_YET: 'Quyền chưa được duyệt cấp',
  AUTHZ_HIGH_RISK_DELEGATION: 'Quyền rủi ro cao: khoá API / trợ lý không làm thay được',
  AUTHZ_DENIED_BY_RULE: 'Luật quyền cấm thao tác này',
  AUTHZ_CONDITION: 'Điều kiện của luật quyền không đạt',
  AUTHZ_NO_ALLOW: 'Không luật nào cho phép',
  AUTHZ_NO_ASSIGNMENT: 'Chưa được gán vai trò',
  AUTHZ_SCOPE_NO_LOCATION: 'Tài nguyên không có vị trí (chi nhánh / kho) để xét phạm vi',
  AUTHZ_SCOPE_NOT_USER: 'Phạm vi chỉ áp cho người dùng đăng nhập',
  AUTHZ_SCOPE_TENANT: 'Tài nguyên thuộc đơn vị khác',
  AUTHZ_USER_ONLY: 'Thao tác chỉ cho người đăng nhập, không qua khoá API',
  AUTHZ_OWN_DOCUMENT_ONLY: 'Chỉ thao tác trên phiếu do mình lập',
  AUTHZ_SELF_ASSIGN: 'Không tự gán / thu hồi vai trò của chính mình',
  AUTHZ_ROLE_EXCEEDS_GRANTOR: 'Vai trò có quyền người gán không có',
  AUTHZ_LAST_OWNER: 'Phải còn ít nhất một chủ sở hữu đang hoạt động',
  // Thư viện
  LIBRARY_BLOCKED: 'Mục thư viện chặn giá trị (details.code = LIB-…)',
  LIBRARY_DISABLED: 'Đơn vị đã tắt thư viện',
  LIBRARY_PROPOSAL_STATE: 'Phiếu đề xuất thư viện không chuyển được từ trạng thái hiện tại',
  // Chính sách
  POLICY_VERSION_GAP: 'Bản chính sách không nối tiếp bản trước',
  POLICY_VERSION_CLOSED: 'Bản chính sách trước đã đóng hiệu lực',
  POLICY_RETIRED: 'Chính sách đã ngừng, dùng mã mới',
  POLICY_BACKDATED: 'Ngày áp sớm hơn bản trước (không viết lại quá khứ)',
  POLICY_REVIEW_NOT_OPEN: 'Sự việc không có phát hiện chính sách cần xem',
  // [2026-11-10 04:10 PM Võ Hoàng] POS-W1 — module pos: họ mã POS_* của module pos (R-ERR-6, R-ERR-11; BIZCITY-ERRORS 1.7.0-draft §4c, đề xuất P-MP-5, đóng góp)
  // Máy bán POS (modules/pos)
  POS_NOT_SUPPORTED_YET: 'Máy chủ POS chưa nhận loại đơn / dòng / thanh toán này ở đợt hiện tại (khuyến mại, quà, QR, ghi nợ, bill Z); kèm field, billZ',
  POS_UNKNOWN_SKU: 'Mã hàng không có (hoặc ngừng bán) trong danh mục kế toán; items: [{ sku }]',
  POS_TAX_NOT_DECLARED: 'Mặt hàng chưa khai mã thuế đầu ra; items: [{ sku }]',
  POS_PRICE_CHANGED: 'Giá / tổng máy bán tính khác máy chủ (hàng Nội bộ phải 0đ); kèm clientTotal, total hoặc items',
  POS_DISCOUNT_TOO_LARGE: 'Tiền giảm tay lớn hơn thành tiền dòng',
  POS_CASH_INSUFFICIENT: 'Tiền khách đưa ít hơn số phải thu',
  POS_NO_CASH_METHOD: 'Danh mục hình thức thanh toán chưa có tiền mặt',
  POS_UNKNOWN_METHOD: 'Hình thức thanh toán không có trong danh mục',
  POS_DUPLICATE_METHOD: 'Một hình thức thanh toán lặp lại trong chia tiền',
  POS_SPLIT_MISMATCH: 'Các phần chia tiền cộng không bằng tổng đơn',
  POS_UNKNOWN_CUSTOMER: 'Mã khách không có trong danh mục',
  POS_BAD_PHONE: 'SĐT khách mới sai khuôn',
  POS_MISSING_NAME: 'Khách mới thiếu tên',
  POS_UNKNOWN_BRANCH: 'Chi nhánh máy gửi không có trong danh mục / đơn vị chưa khai chi nhánh',
  POS_BRANCH_REQUIRED: 'Đơn vị nhiều chi nhánh mà máy không gửi branchCode / mã phiếu có ở nhiều chi nhánh',
  POS_ORDER_ID_REUSED: 'Cùng id đơn đã nhận với nội dung khác (máy phải tạo đơn mới)',
  POS_CODE_TAKEN: 'Mã phiếu / id đơn vừa được máy khác dùng đồng thời (gửi lại)',
  // [2026-11-11 03:30 PM Võ Hoàng] POS-W2 — họ mã POS_* đợt W2 — hoàn / đổi / huỷ (BIZCITY-ERRORS 1.8.0-draft §4c, phiếu NT-BH-005, đóng góp)
  POS_RETURN_QTY: 'Trả quá số còn trả được của dòng, hoặc dòng không có trong đơn gốc',
  POS_RETURN_EXPIRED: 'Quá hạn trả (tham số, hiện 3 ngày theo ngày bán) mà thiếu người duyệt / lý do duyệt; kèm deadline',
  POS_RETURN_OTHER_SHOP: 'Đơn gốc của chi nhánh khác: đợt này chỉ trả ở cửa hàng đã bán',
  POS_ORDER_NOT_RETURNABLE: 'Đơn gốc chưa hoàn tất / đã huỷ: không trả hàng',
  POS_RETURN_REASON: 'Thiếu lý do trả hàng',
  POS_REFUND_METHOD: 'Hình thức trả tiền khách không phải tiền mặt / chuyển khoản (đối trừ chỉ trong đổi hàng)',
  POS_GIFT_REQUIRED: 'Trả hàng chính mà không trả kèm phần quà vượt suất; kèm gifts',
  POS_EXCHANGE_LOWER: 'Đổi hàng: đơn mới thấp hơn giá trị hàng trả; kèm credit, total',
  POS_EXCHANGE_CUSTOMER: 'Đổi hàng: khách của đơn mới khác khách của đơn gốc',
  POS_CANCEL_COMPLETED: 'Đơn đã thu tiền xong không huỷ được — lập phiếu trả hàng',
  POS_RETURN_ID_REUSED: 'Cùng id phiếu trả đã nhận với nội dung khác (máy phải lập phiếu mới)',
  // [2026-11-12 04:00 PM Võ Hoàng] POS-W3 — họ mã ca bán của module pos (BIZCITY-ERRORS 1.9.0-draft §4c, phiếu NT-BH-007, đóng góp)
  POS_SHIFT_ALREADY_OPEN: 'Chi nhánh đang có ca mở — không mở ca thứ hai',
  POS_SHIFT_CLOSED: 'Ca đã chốt — không chốt lại',
  POS_SHIFT_BLOCKED: 'Còn việc dở (đơn chờ trả tiền…) — chốt bất chấp phải ghi lý do',
  // [2026-11-13 12:20 AM Võ Hoàng] POS-QR — họ mã QR / ca bắt buộc của module pos (BIZCITY-ERRORS 1.10.0-draft §4c, phiếu NT-BH-009, NT-BH-011, đóng góp)
  POS_QR_EXPIRED: 'Sau ngày bán của đơn — không gia hạn mã QR, không xác nhận tay',
  POS_PAYMENT_MISMATCH: 'Số tiền báo về khác phần QR của đơn',
  POS_ORDER_CANCELLED: 'Đơn đã huỷ — không nhận tiền về / không lập hoá đơn',
  POS_SHIFT_REQUIRED: 'Chưa mở ca — Cài đặt bán hàng bắt buộc mở ca trước khi bán',
} as const;
export type ErrorReason = keyof typeof ERROR_REASONS;

// [2026-11-10 10:30 AM Johnny Chu - Chu Hoàng Anh] PHASE-022 — S022-17 (RV-R1-06, chữ chốt BIZCITY-ERRORS-v1 §4b, 1.4.0-draft): ngữ cảnh chuẩn + phương án khắc phục của lỗi Kernel
/** Bước của đường ghi sổ nơi lỗi xảy ra (`details.context.step`). */
export const ERROR_STEPS = ['intake', 'posting-rules', 'ledger-validate', 'ledger-insert', 'period-check', 'db-trigger'] as const;
export type ErrorStep = (typeof ERROR_STEPS)[number];

/** Khoá được phép của `details.context` (mọi khoá tuỳ chọn; không SQL, tên bảng, đường dẫn, dữ liệu cá nhân — R-ERR-3). */
export const ERROR_CONTEXT_KEYS = ['docKey', 'docType', 'docNo', 'eventId', 'version', 'entryNo', 'period', 'branchCode', 'postingDate', 'step'] as const;
export type ErrorContextKey = (typeof ERROR_CONTEXT_KEYS)[number];
export interface ErrorContext {
  docKey?: string;
  docType?: string;
  docNo?: string;
  eventId?: string;
  version?: number;
  entryNo?: string;
  /** Kỳ kế toán dạng `YYYY-MM`. */
  period?: string;
  branchCode?: string;
  postingDate?: string;
  step?: ErrorStep;
}

/** Khoá bị khoá của `PERIOD_LOCKED.details.scope`. */
export type PeriodLockScope = 'period' | 'branch' | 'doc-type';

/**
 * Phương án khắc phục theo `reason` (thắng) hoặc `code` — một nguồn cho mọi nơi trả lỗi (§4b mục 2). Màn dẫn tới là SCREENS (SC-FIX-1).
 * Không chứa lệnh sửa dữ liệu (R-FIX-2).
 */
export const ERROR_REMEDY: Partial<Record<ErrorCode | ErrorReason, Remedy>> = {
  UNBALANCED_ENTRY: {
    steps: [STOP_THE_LINE_STEP, { text: 'Mở chứng từ theo khoá trong ngữ cảnh, xem nhật ký định khoản', screen: SCREENS.ACC14 }, { text: 'Báo nhóm Lõi kèm mã tra cứu: luật định khoản sinh bút toán lệch', role: 'core_team' }],
    owner: 'core_team', verify: { code: 'LEDGER_BALANCED' }, stopTheLine: true, forbid: ['Không sửa tay bút toán cho cân'],
  },
  PERIOD_LOCKED: {
    steps: [{ text: 'Xem kỳ và phạm vi khoá trong ngữ cảnh', screen: SCREENS.ACC2 }, { text: 'Kế toán trưởng mở khoá kỳ (hoặc lập chứng từ ở kỳ đang mở)', screen: SCREENS.ACC2, role: 'chief_accountant' }, { text: 'Gửi lại chứng từ sau khi mở khoá' }],
    owner: 'chief_accountant', verify: { screen: SCREENS.ACC2 },
  },
  POSTING_FAILED: {
    steps: [{ text: 'Mở chứng từ theo khoá trong ngữ cảnh, xem nhật ký định khoản và lý do', screen: SCREENS.ACC14 }, { text: 'Bổ sung cấu hình định khoản còn thiếu (lý do, tài khoản ngầm định)', screen: SCREENS.ACC18, role: 'chief_accountant' }, { text: 'Định khoản lại chứng từ', screen: SCREENS.ACC14, role: 'accountant' }],
    owner: 'accountant', verify: { screen: SCREENS.ACC14 },
  },
  LEDGER_APPEND_ONLY: {
    steps: [{ text: 'Không sửa hay xoá sổ cái: ghi bút toán đảo qua định khoản lại chứng từ', screen: SCREENS.ACC14, role: 'accountant' }, { text: 'Nghi có đường ghi vòng qua ứng dụng: báo nhóm Lõi kèm mã tra cứu', role: 'core_team' }],
    owner: 'accountant', verify: { code: 'LEDGER_TRIGGERS' }, forbid: ['Không tắt trigger bảo vệ sổ'],
  },
};
