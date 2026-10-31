// [2026-10-29 10:24 PM Johnny Chu - Chu Hoàng Anh] INIT — khởi tạo Bizcity Core Framework: sổ cái chỉ thêm, cửa nạp sự việc, CANON, hợp đồng, bộ kiểm chuẩn.
/**
 * Hằng số nghiệp vụ dùng chung.
 * Khai báo dạng `as const` để vừa dùng làm giá trị lúc chạy, vừa sinh kiểu TypeScript.
 */

/** Loại chứng từ gốc nhận từ hệ thống nghiệp vụ hoặc nhập tay. */
export const DOC_TYPES = {
  SALE: 'sale',
  SALE_RETURN: 'sale_return',
  RECEIPT: 'receipt',
  PAYMENT: 'payment',
  /** Báo có: tiền về tài khoản ngân hàng. */
  BANK_RECEIPT: 'bank_receipt',
  /** Báo nợ: tiền ra khỏi tài khoản ngân hàng. */
  BANK_PAYMENT: 'bank_payment',
  MANUAL: 'manual',
  /** Số dư tài khoản đầu kỳ (nhập một lần khi bắt đầu dùng phần mềm). */
  OPENING: 'opening',
  CLOSING: 'closing',
  /** Nhập mua hàng từ nhà cung cấp (kèm hoá đơn đầu vào). */
  PURCHASE: 'purchase',
  /** Trả hàng cho nhà cung cấp. */
  PURCHASE_RETURN: 'purchase_return',
  /** Chuyển kho giữa hai chi nhánh / cửa hàng (phiếu xuất kho kiêm vận chuyển nội bộ). */
  TRANSFER: 'transfer',
  /** Điều chỉnh kho: kiểm kê thừa / thiếu, hàng hỏng, xuất dùng nội bộ. */
  STOCK_ADJUSTMENT: 'stock_adjustment',
  /** Giá vốn hàng xuất trong tháng (phần mềm tự sinh khi tính giá vốn bình quân). */
  COGS: 'cogs',
  /** Chuyển tiền giữa hai chi nhánh, hoặc giữa quỹ và ngân hàng trong một chi nhánh. */
  CASH_TRANSFER: 'cash_transfer',
  /** Thu tiền khách hàng trả nợ (kể cả thu hộ công nợ của chi nhánh khác). */
  CUSTOMER_PAYMENT: 'customer_payment',
  /** Trả tiền nhà cung cấp (kể cả trả hộ công nợ của chi nhánh khác). */
  SUPPLIER_PAYMENT: 'supplier_payment',
  /** Khấu hao tài sản cố định, phân bổ công cụ dụng cụ / chi phí trả trước trong tháng (phần mềm tự sinh). */
  DEPRECIATION: 'depreciation',
} as const;
export type DocType = (typeof DOC_TYPES)[keyof typeof DOC_TYPES];

export const DOC_TYPE_LABELS: Record<DocType, string> = {
  sale: 'Hoá đơn bán hàng',
  sale_return: 'Hàng bán trả lại',
  receipt: 'Phiếu thu',
  payment: 'Phiếu chi',
  bank_receipt: 'Phiếu báo có',
  bank_payment: 'Phiếu báo nợ',
  manual: 'Phiếu kế toán',
  opening: 'Số dư đầu kỳ',
  closing: 'Kết chuyển',
  purchase: 'Nhập mua hàng',
  purchase_return: 'Trả hàng nhà cung cấp',
  transfer: 'Chuyển kho',
  stock_adjustment: 'Điều chỉnh kho',
  cogs: 'Giá vốn hàng xuất',
  cash_transfer: 'Chuyển tiền',
  customer_payment: 'Thanh toán khách hàng',
  supplier_payment: 'Thanh toán nhà cung cấp',
  depreciation: 'Khấu hao, phân bổ',
};

/** Nhóm loại chứng từ ở màn đóng / mở kỳ (ACC2): mỗi nhóm một dải cột trên lưới khoá. */
export const DOC_TYPE_GROUPS: { label: string; types: DocType[] }[] = [
  { label: 'Bán hàng', types: ['sale', 'sale_return', 'customer_payment'] },
  { label: 'Mua hàng, kho', types: ['purchase', 'purchase_return', 'supplier_payment', 'transfer', 'stock_adjustment', 'cogs'] },
  { label: 'Tiền', types: ['receipt', 'payment', 'bank_receipt', 'bank_payment', 'cash_transfer'] },
  { label: 'Kế toán', types: ['manual', 'depreciation', 'closing', 'opening'] },
];

/** Thứ tự loại chứng từ dùng cho bộ lọc ở các sổ. */
export const DOC_TYPE_LIST = Object.keys(DOC_TYPE_LABELS) as DocType[];

/** Trạng thái xử lý của chứng từ gốc. */
export const SOURCE_DOC_STATUS = {
  PENDING: 'pending',
  POSTED: 'posted',
  ERROR: 'error',
  CANCELLED: 'cancelled',
} as const;
export type SourceDocStatus = (typeof SOURCE_DOC_STATUS)[keyof typeof SOURCE_DOC_STATUS];

/** Trạng thái bút toán trên sổ cái. */
export const ENTRY_STATUS = {
  POSTED: 'posted',
  REVERSED: 'reversed',
} as const;
export type EntryStatus = (typeof ENTRY_STATUS)[keyof typeof ENTRY_STATUS];

/**
 * Phần của chứng từ mà một dòng sổ cái thuộc về.
 * Giúp đối chiếu riêng tiền hàng, thuế, giá vốn, thanh toán với chứng từ gốc.
 */
export const LINE_PARTS = {
  GOODS: 'goods',
  TAX: 'tax',
  COGS: 'cogs',
  DISCOUNT: 'discount',
  PAYMENT: 'payment',
  OTHER: 'other',
} as const;
export type LinePart = (typeof LINE_PARTS)[keyof typeof LINE_PARTS];

/** Chiều thuế. */
export const TAX_DIRECTION = { OUTPUT: 'output', INPUT: 'input' } as const;
export type TaxDirection = (typeof TAX_DIRECTION)[keyof typeof TAX_DIRECTION];

/** Bên số dư thông thường của tài khoản. */
export const NORMAL_SIDE = { DEBIT: 'debit', CREDIT: 'credit', BOTH: 'both' } as const;
export type NormalSide = (typeof NORMAL_SIDE)[keyof typeof NORMAL_SIDE];

/** Vai trò người dùng. Quyền chi tiết theo vai trò nằm ở API (core/auth). */
export const ROLES = {
  OWNER: 'owner',
  CHIEF_ACCOUNTANT: 'chief_accountant',
  ACCOUNTANT: 'accountant',
  VIEWER: 'viewer',
} as const;
export type Role = (typeof ROLES)[keyof typeof ROLES];

export const ROLE_LABELS: Record<Role, string> = {
  owner: 'Chủ sở hữu',
  chief_accountant: 'Kế toán trưởng',
  accountant: 'Kế toán',
  viewer: 'Chỉ xem',
};
