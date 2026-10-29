/**
 * Khuôn chứng từ kế toán NHẬP TAY.
 *
 * 1. Phiếu thu, phiếu chi, phiếu báo có, phiếu báo nợ, phiếu kế toán
 *    (API: POST /api/v1/vouchers, PUT /api/v1/vouchers/:id).
 *    Mỗi dòng là một cặp định khoản Nợ / Có với một số tiền dương.
 *      - Phiếu thu    : tài khoản Nợ phải là tiền mặt (111).
 *      - Phiếu chi    : tài khoản Có phải là tiền mặt (111).
 *      - Phiếu báo có : tài khoản Nợ phải là tiền gửi / tiền đang chuyển (112, 113).
 *      - Phiếu báo nợ : tài khoản Có phải là tiền gửi / tiền đang chuyển (112, 113).
 *      - Phiếu kế toán: tự do, miễn tài khoản là tài khoản chi tiết đang dùng.
 *
 * 2. Số dư tài khoản đầu kỳ (API: POST /api/v1/opening-balances, PUT /api/v1/opening-balances/:id).
 *    Mỗi dòng là số dư Nợ HOẶC số dư Có của một tài khoản (kèm đối tượng nếu tài khoản theo dõi đối tượng).
 */
import { z } from 'zod';

export const VOUCHER_TYPES = ['receipt', 'payment', 'bank_receipt', 'bank_payment', 'manual'] as const;
export type VoucherType = (typeof VOUCHER_TYPES)[number];

/** Tiền tố số phiếu tự cấp: PT26-000001, PC…, BC…, BN…, PK…; số dư đầu kỳ: SD…. */
export const VOUCHER_PREFIX: Record<VoucherType | 'opening', string> = {
  receipt: 'PT',
  payment: 'PC',
  bank_receipt: 'BC',
  bank_payment: 'BN',
  manual: 'PK',
  opening: 'SD',
};

/**
 * Luật tài khoản tiền của từng loại phiếu: phía nào (Nợ / Có) phải là tài khoản tiền,
 * và được dùng những đầu số nào. Phiếu kế toán không ràng buộc.
 */
export const VOUCHER_MONEY: Record<VoucherType, { side: 'debit' | 'credit'; prefixes: readonly string[]; label: string } | null> = {
  receipt: { side: 'debit', prefixes: ['111'], label: 'Phiếu thu: tài khoản Nợ phải là tiền mặt (111)' },
  payment: { side: 'credit', prefixes: ['111'], label: 'Phiếu chi: tài khoản Có phải là tiền mặt (111)' },
  bank_receipt: { side: 'debit', prefixes: ['112', '113'], label: 'Phiếu báo có: tài khoản Nợ phải là tiền gửi ngân hàng (112, 113)' },
  bank_payment: { side: 'credit', prefixes: ['112', '113'], label: 'Phiếu báo nợ: tài khoản Có phải là tiền gửi ngân hàng (112, 113)' },
  manual: null,
};

/** Tài khoản có hợp lệ làm tài khoản tiền của loại phiếu không. */
export const isMoneyAccountFor = (type: VoucherType, code: string): boolean => {
  const rule = VOUCHER_MONEY[type];
  return !rule || rule.prefixes.some((p) => code.startsWith(p));
};

const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Ngày dạng YYYY-MM-DD');

export const voucherLineSchema = z.object({
  debitAccount: z.string().trim().min(3).max(20),
  creditAccount: z.string().trim().min(3).max(20),
  amount: z.number().finite().positive('Số tiền phải lớn hơn 0'),
  description: z.string().trim().max(500).default(''),
  /** Đối tượng của riêng dòng này; để trống thì dùng đối tượng chung của phiếu. */
  partnerCode: z.string().trim().max(64).optional(),
  /** Đối tượng riêng của bên Có (cấn trừ / chuyển nợ giữa hai đối tượng); trống = như bên Nợ. */
  creditPartnerCode: z.string().trim().max(64).optional(),

  // --- Chiều phân tích (mã ở các danh mục Khoản mục, Bộ phận, Hợp đồng). Bắt buộc khi tài khoản có bật theo dõi.
  costItem: z.string().trim().max(64).optional(),
  department: z.string().trim().max(64).optional(),
  contract: z.string().trim().max(64).optional(),
  /** Nhân viên phụ trách khoản tiền / công nợ (mã ở danh mục Nhân viên). */
  employee: z.string().trim().max(64).optional(),
  /** Vụ việc, dự án, nguồn vốn (mã ở các danh mục tương ứng). */
  case: z.string().trim().max(64).optional(),
  project: z.string().trim().max(64).optional(),
  capitalSource: z.string().trim().max(64).optional(),
  /** Mã chỉ tiêu lưu chuyển tiền tệ (01, 02…) của dòng tiền; chỉ dùng khi tài khoản tiền có theo dõi dòng tiền. */
  cashflowCode: z.string().trim().max(16).optional(),

  // --- Thuế GTGT của dòng (ví dụ phiếu chi mua dịch vụ có hoá đơn). `amount` là tiền CHƯA thuế.
  /** Mã loại thuế (V10, V08… cho thuế đầu vào; R10… cho thuế đầu ra). */
  taxCode: z.string().trim().max(16).optional(),
  taxAmount: z.number().finite().min(0).default(0),
  invoiceNo: z.string().trim().max(32).optional(),
  invoiceSerial: z.string().trim().max(32).optional(),
  invoiceForm: z.string().trim().max(32).optional(),
  invoiceDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  /** Tên và mã số thuế của đơn vị trên hoá đơn (người bán với thuế đầu vào). */
  invoicePartnerName: z.string().trim().max(255).optional(),
  invoicePartnerTaxCode: z.string().trim().max(32).optional(),

  // --- Chứng từ còn nợ mà dòng này thanh toán (chọn ở nút "Tìm chứng từ" của phiếu thu / chi).
  /** id khoản công nợ (/api/v1/debt-items); số tiền của dòng là số trả cho khoản đó. */
  settleItemId: z.string().regex(/^[1-9][0-9]*$/).optional(),
  /** Số hoá đơn, ngày, tổng tiền, số còn nợ của chứng từ tại lúc chọn (để hiện lại trên phiếu). */
  settleDocNo: z.string().trim().max(64).optional(),
  settleDocDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  settleTotal: z.number().finite().optional(),
  settleRemaining: z.number().finite().optional(),

  // --- Phiếu kế toán nhập theo kiểu "dòng chính + tài khoản đối ứng": các cặp cùng `group` thuộc một dòng chính;
  // `mainSide` là phía của tài khoản dòng chính (debit: dòng chính ghi Nợ, các tài khoản đối ứng ghi Có).
  group: z.number().int().min(0).optional(),
  mainSide: z.enum(['debit', 'credit']).optional(),
});
export type VoucherLine = z.infer<typeof voucherLineSchema>;

/** Danh mục chiều phân tích. */
/** Danh mục dùng chung bảng dimensions. tool_group, usage_purpose chỉ gắn trên thẻ tài sản, không phải chiều phân tích dòng phiếu. */
export const DIMENSION_KINDS = ['cost_item', 'department', 'contract', 'employee', 'case', 'project', 'capital_source', 'tool_group', 'usage_purpose'] as const;
export type DimensionKind = (typeof DIMENSION_KINDS)[number];
export const DIMENSION_LABELS: Record<DimensionKind, string> = { cost_item: 'Khoản mục', department: 'Bộ phận', contract: 'Hợp đồng', employee: 'Nhân viên', case: 'Vụ việc', project: 'Dự án', capital_source: 'Nguồn vốn', tool_group: 'Nhóm công cụ dụng cụ', usage_purpose: 'Mục đích sử dụng' };

/**
 * Các chiều phân tích ghi trên dòng phiếu: tên trường trên dòng phiếu và trong cột dims của dòng sổ (field),
 * loại danh mục (kind), cờ theo dõi trên tài khoản (flag). Thêm chiều mới: thêm vào đây, DIMENSION_KINDS,
 * migration (CHECK của dimensions + cột cờ trên accounts).
 */
export const ANALYSIS_DIMS = [
  { field: 'costItem', kind: 'cost_item', flag: 'trackCostItem', label: 'Khoản mục' },
  { field: 'department', kind: 'department', flag: 'trackDepartment', label: 'Bộ phận' },
  { field: 'contract', kind: 'contract', flag: 'trackContract', label: 'Hợp đồng' },
  { field: 'employee', kind: 'employee', flag: 'trackEmployee', label: 'Nhân viên' },
  { field: 'case', kind: 'case', flag: 'trackCase', label: 'Vụ việc' },
  { field: 'project', kind: 'project', flag: 'trackProject', label: 'Dự án' },
  { field: 'capitalSource', kind: 'capital_source', flag: 'trackCapitalSource', label: 'Nguồn vốn' },
] as const;
export type AnalysisDimField = (typeof ANALYSIS_DIMS)[number]['field'];

/** Loại hợp đồng (lưu ở extra.type của danh mục hợp đồng). */
export const CONTRACT_TYPES = [
  ['rent', 'Thuê nhà, mặt bằng'],
  ['goods_supplier', 'Nhà cung cấp hàng hoá'],
  ['asset_service', 'Mua tài sản, chi phí, dịch vụ'],
  ['credit', 'Tín dụng, vay'],
  ['sale', 'Bán hàng'],
  ['other', 'Khác'],
] as const;

export const dimensionInputSchema = z.object({
  name: z.string().trim().min(1).max(255),
  parentCode: z.string().trim().max(64).optional(),
  note: z.string().trim().max(500).default(''),
  isActive: z.boolean().default(true),
  /** Thông tin thêm của hợp đồng: type, signedDate, endDate, value, partnerCode, landlordTax. */
  extra: z.record(z.unknown()).default({}),
});
export type DimensionInput = z.infer<typeof dimensionInputSchema>;

/**
 * Mục đích của phiếu nhập tay (để lọc danh sách và mở đúng màn):
 *   offset            cấn trừ công nợ
 *   ar_increase / ar_decrease   ghi tăng / ghi giảm công nợ phải thu
 *   ap_increase / ap_decrease   ghi tăng / ghi giảm công nợ phải trả
 *   deposit_received  khách đặt cọc, trả trước        deposit_paid  đặt cọc, trả trước cho nhà cung cấp
 */
export const VOUCHER_PURPOSES = {
  offset: 'Cấn trừ công nợ',
  ar_increase: 'Ghi tăng công nợ phải thu',
  ar_decrease: 'Ghi giảm công nợ phải thu',
  ap_increase: 'Ghi tăng công nợ phải trả',
  ap_decrease: 'Ghi giảm công nợ phải trả',
  deposit_received: 'Khách đặt cọc, trả trước',
  deposit_paid: 'Đặt cọc, trả trước cho nhà cung cấp',
} as const;
export type VoucherPurpose = keyof typeof VOUCHER_PURPOSES;
export const VOUCHER_PURPOSE_CODES = ['offset', 'ar_increase', 'ar_decrease', 'ap_increase', 'ap_decrease', 'deposit_received', 'deposit_paid'] as const;

/** Loại chứng từ nguồn nhận từ hệ thống mua hàng, bán hàng (chỉ lưu để tham chiếu khi lập phiếu công nợ). */
export const REFERENCE_DOC_KINDS = {
  purchase_order: 'Đơn đặt hàng mua',
  purchase_quotation: 'Báo giá mua',
  goods_receipt: 'Phiếu nhập hàng',
  purchase_return: 'Phiếu xuất trả nhà cung cấp',
  sales_order: 'Đơn bán hàng',
  sales_quotation: 'Báo giá bán',
  goods_issue: 'Phiếu xuất hàng',
  sales_return: 'Phiếu khách trả hàng',
  purchase_invoice: 'Hoá đơn mua vào (từ cổng hoá đơn điện tử)',
  sales_invoice: 'Hoá đơn bán ra (từ cổng hoá đơn điện tử)',
  other: 'Khác',
} as const;
export type ReferenceDocKind = keyof typeof REFERENCE_DOC_KINDS;

export const voucherInputSchema = z.object({
  docType: z.enum(VOUCHER_TYPES),
  branchCode: z.string().trim().min(1).max(32),
  docDate: day,
  /** Để trống: hệ thống tự cấp số theo loại phiếu và năm. */
  docNo: z.string().trim().max(64).optional(),
  description: z.string().trim().min(1, 'Cần nhập diễn giải').max(1000),
  /** Người nộp tiền / người nhận tiền (ghi trên phiếu in). */
  counterparty: z.string().trim().max(255).default(''),
  /** Đối tượng công nợ chung của phiếu (mã ở danh mục Đối tượng). */
  partnerCode: z.string().trim().max(64).optional(),
  /** Số chứng từ gốc kèm theo (hoá đơn, giấy báo có…). */
  reference: z.string().trim().max(255).default(''),
  /** Lý do thu / chi (mã ở danh mục Lý do); ghi lên bút toán. */
  reasonCode: z.string().trim().max(64).optional(),
  /** Nhân viên lập / phụ trách phiếu (mã ở danh mục Nhân viên); dòng chưa chọn nhân viên lấy theo ô này. */
  employeeCode: z.string().trim().max(64).optional(),
  /** Tên, điện thoại, địa chỉ của khách hàng / nhà cung cấp in trên phiếu. */
  partnerName: z.string().trim().max(255).optional(),
  phone: z.string().trim().max(64).optional(),
  address: z.string().trim().max(500).optional(),
  /** Mục đích của phiếu (xem VOUCHER_PURPOSES); để trống với phiếu thường. */
  purpose: z.enum(VOUCHER_PURPOSE_CODES).optional(),
  /** Hạn thanh toán của khoản công nợ phiếu này sinh ra; trống = ngày phiếu + hạn thanh toán của đối tượng. */
  dueDate: day.optional(),
  /** Khoá chứng từ nguồn (reference_documents.doc_key) mà phiếu này lập từ đó; chứng từ nguồn chuyển sang "đã dùng". */
  sourceDocKey: z.string().trim().max(160).optional(),
  /** Phiếu này thanh toán cho các khoản công nợ nào (id ở /api/v1/debt-items) và mỗi khoản bao nhiêu. */
  settle: z.array(z.object({ debtItemId: z.string().regex(/^[1-9][0-9]*$/), amount: z.number().finite().positive() })).max(500).optional(),
  lines: z.array(voucherLineSchema).min(1, 'Phiếu phải có ít nhất một dòng').max(500),
});
export type VoucherInput = z.infer<typeof voucherInputSchema>;

/**
 * Bút toán mẫu: thân phiếu nhập tay không có ngày, số phiếu; số tiền dòng được để 0 (nhập khi lập phiếu).
 * Diễn giải (chung và từng dòng) dùng được {ky} (10/2026, Q4/2026, 2026 tuỳ chu kỳ), {thang}, {nam}.
 */
export const voucherTemplateLineSchema = voucherLineSchema.extend({ amount: z.number().finite().min(0).default(0) });
export const voucherTemplateInputSchema = z.object({
  name: z.string().trim().min(1, 'Cần nhập tên mẫu').max(255),
  docType: z.enum(VOUCHER_TYPES),
  isActive: z.boolean().default(true),
  branchCode: z.string().trim().max(32).default(''),
  description: z.string().trim().min(1, 'Cần nhập diễn giải').max(1000),
  counterparty: z.string().trim().max(255).default(''),
  partnerCode: z.string().trim().max(64).optional(),
  reference: z.string().trim().max(255).default(''),
  lines: z.array(voucherTemplateLineSchema).min(1, 'Mẫu phải có ít nhất một dòng').max(500),
});
export type VoucherTemplateInput = z.infer<typeof voucherTemplateInputSchema>;

export const RECURRENCE_FREQUENCIES = { monthly: 'Hằng tháng', quarterly: 'Hằng quý', yearly: 'Hằng năm' } as const;
export type RecurrenceFrequency = keyof typeof RECURRENCE_FREQUENCIES;
const month = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, 'Tháng dạng YYYY-MM');
export const voucherRecurrenceInputSchema = z.object({
  templateCode: z.string().trim().min(1).max(64),
  name: z.string().trim().max(255).default(''),
  frequency: z.enum(['monthly', 'quarterly', 'yearly']),
  /** Ngày phiếu trong tháng; tháng ngắn hơn lấy ngày cuối tháng. */
  dayOfMonth: z.number().int().min(1).max(31),
  startMonth: month,
  endMonth: month.optional(),
  /** Chi nhánh của phiếu sinh ra; trống = chi nhánh trên mẫu. */
  branchCode: z.string().trim().max(32).optional(),
  isActive: z.boolean().default(true),
});
export type VoucherRecurrenceInput = z.infer<typeof voucherRecurrenceInputSchema>;

/** Nhãn kỳ của ngày phiếu theo chu kỳ: 10/2026 (tháng), Q4/2026 (quý), 2026 (năm). */
export function periodLabel(docDate: string, frequency: RecurrenceFrequency = 'monthly'): string {
  const [y, m] = docDate.split('-');
  if (frequency === 'yearly') return y!;
  if (frequency === 'quarterly') return `Q${Math.ceil(Number(m) / 3)}/${y}`;
  return `${m}/${y}`;
}

/** Thay {ky}, {thang}, {nam} trong diễn giải của bút toán mẫu theo ngày phiếu. */
export function fillPeriodText(text: string, docDate: string, frequency: RecurrenceFrequency = 'monthly'): string {
  const [y, m] = docDate.split('-');
  return text.replace(/\{ky\}/g, periodLabel(docDate, frequency)).replace(/\{thang\}/g, m!).replace(/\{nam\}/g, y!);
}

/** Một dòng số dư đầu kỳ: đúng một trong hai cột Dư Nợ / Dư Có lớn hơn 0. */
export const openingLineSchema = z
  .object({
    accountCode: z.string().trim().min(3).max(20),
    partnerCode: z.string().trim().max(64).optional(),
    debit: z.number().finite().min(0).default(0),
    credit: z.number().finite().min(0).default(0),
  })
  .refine((l) => l.debit > 0 !== l.credit > 0, { message: 'Mỗi dòng nhập Dư Nợ hoặc Dư Có (không nhập cả hai, không để trống cả hai)' });
export type OpeningLine = z.infer<typeof openingLineSchema>;

export const openingInputSchema = z.object({
  branchCode: z.string().trim().min(1).max(32),
  /** Ngày chốt số dư: thường là ngày cuối của kỳ trước kỳ bắt đầu dùng phần mềm. */
  docDate: day,
  docNo: z.string().trim().max(64).optional(),
  description: z.string().trim().max(1000).default('Số dư đầu kỳ'),
  /**
   * Tài khoản nhận phần chênh lệch khi tổng Dư Nợ ≠ tổng Dư Có (ví dụ nhập số dư riêng từng chi nhánh).
   * Để trống thì hai tổng phải bằng nhau.
   */
  balancingAccount: z.string().trim().max(20).optional(),
  lines: z.array(openingLineSchema).min(1, 'Cần ít nhất một dòng số dư').max(5000),
});
export type OpeningInput = z.infer<typeof openingInputSchema>;

/** Cách kết chuyển của một bút toán kết chuyển mẫu. */
export const CLOSING_MODES = {
  /** Kết chuyển bên Nợ (chi phí, giảm trừ): Nợ TK đích / Có TK nguồn = Nợ − Có trong kỳ. */
  DEBIT: 'debit',
  /** Kết chuyển bên Có (doanh thu, thu nhập): Nợ TK nguồn / Có TK đích = Có − Nợ trong kỳ. */
  CREDIT: 'credit',
  /** Theo số dư (lãi lỗ): bên nào lớn hơn thì chuyển phần chênh sang TK đích. */
  BALANCE: 'balance',
} as const;
export type ClosingMode = (typeof CLOSING_MODES)[keyof typeof CLOSING_MODES];

export const closingRuleSchema = z.object({
  seq: z.number().int().min(0).max(9999),
  fromAccount: z.string().trim().min(3).max(20).describe('Đầu số tài khoản nguồn (gồm mọi tài khoản con)'),
  toAccount: z.string().trim().min(3).max(20).describe('Tài khoản đích (tài khoản chi tiết)'),
  mode: z.enum(['debit', 'credit', 'balance']),
  description: z.string().trim().max(255).default(''),
  isActive: z.boolean().default(true),
  /** Lấy cả số dư đầu kỳ của tài khoản nguồn (dùng cho bước kết chuyển lãi lỗ 911 → 421). */
  includeOpening: z.boolean().default(false),
});
export type ClosingRule = z.infer<typeof closingRuleSchema>;

export const closingRunSchema = z.object({
  /** Kỳ kết chuyển, dạng YYYY-MM. */
  period: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, 'Kỳ dạng YYYY-MM'),
  branchCodes: z.array(z.string().trim().min(1)).min(1, 'Bạn chưa chọn chi nhánh kết chuyển').max(500),
  /** Kết chuyển xong thì kết chuyển lại luôn các tháng sau (cùng năm) đã kết chuyển của chi nhánh. */
  cascade: z.boolean().default(false),
});
export type ClosingRunInput = z.input<typeof closingRunSchema>;

/** Lưu danh sách bút toán kết chuyển mẫu: kèm lý do sửa, ghi vào lịch sử phiên bản. */
export const closingRulesSaveSchema = z.object({
  rules: z.array(closingRuleSchema).max(200),
  note: z.string().trim().max(500).default(''),
});

/**
 * Kết chuyển lợi nhuận năm trước khi sang năm mới: số dư của tài khoản lợi nhuận năm nay (4212) đến hết
 * 31/12 năm trước chuyển sang lợi nhuận năm trước (4211), ghi ngày 01/01 của năm mới.
 */
export const yearEndRunSchema = z.object({
  /** Năm MỚI (năm ghi bút toán 01/01). */
  year: z.number().int().min(2000).max(2100),
  branchCodes: z.array(z.string().trim().min(1)).min(1, 'Bạn chưa chọn chi nhánh').max(500),
  fromAccount: z.string().trim().min(3).max(20).default('4212'),
  toAccount: z.string().trim().min(3).max(20).default('4211'),
  /** true: chỉ tính, không ghi. */
  dryRun: z.boolean().default(false),
});
export type YearEndRunInput = z.infer<typeof yearEndRunSchema>;
