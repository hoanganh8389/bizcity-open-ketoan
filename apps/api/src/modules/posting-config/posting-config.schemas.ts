// @bizcity-layer K kernel/config
import { z } from 'zod';

const acc = z.string().trim().max(20);

export const reasonSchema = z.object({
  code: z.string().trim().min(1).max(32),
  name: z.string().trim().min(1).max(255),
  kind: z.enum(['out', 'in', 'receipt', 'payment']),
  counterAccount: acc.optional(),
  revenueAccount: acc.optional(),
  expenseAccount: acc.optional(),
  cashflowCode: z.string().trim().max(16).optional(),
  flags: z.record(z.unknown()).default({}),
  isActive: z.boolean().default(true),
});
export type ReasonInput = z.infer<typeof reasonSchema>;

export const groupSchema = z.object({
  code: z.string().trim().min(1).max(32),
  name: z.string().trim().min(1).max(255),
  inventoryAccount: acc.min(3),
  cogsAccount: acc.min(3),
  revenueAccount: acc.min(3),
  discountAccount: acc.optional(),
  salesReturnAccount: acc.min(3),
  isDefault: z.boolean().default(false),
});
export type GroupInput = z.infer<typeof groupSchema>;

export const paymentMethodSchema = z.object({
  code: z.string().trim().min(1).max(32),
  name: z.string().trim().min(1).max(255),
  accountCode: acc.min(3),
  /** Tài khoản ngân hàng nhận / chi tiền; có thì tài khoản kế toán lấy theo tài khoản ngân hàng. */
  bankAccountCode: z.string().trim().max(64).nullish(),
  isReceivable: z.boolean().default(false),
  isActive: z.boolean().default(true),
  note: z.string().trim().max(500).default(''),
  sortOrder: z.coerce.number().int().min(0).max(100000).nullish(),
  discountRate: z.coerce.number().min(0).max(100).nullish(),
  /** Đối tượng nhận tiền hộ (QR, thẻ vào tài khoản công ty): dòng tiền gắn đối tượng này thay cho khách. */
  partnerCode: z.string().trim().max(64).nullish(),
});
export type PaymentMethodInput = z.infer<typeof paymentMethodSchema>;

/**
 * Các khoá tài khoản ngầm định. Mười một khoá đầu là form ACC41 (đúng thứ tự trên màn); các khoá sau
 * là nguồn cuối cùng của bộ định khoản khi lý do / hình thức thanh toán / loại thuế không chỉ định.
 */
export const DEFAULT_KEYS = {
  cash: 'TK tiền mặt mặc định',
  tax_output: 'TK thuế đầu ra ngầm định',
  tax_input: 'TK thuế đầu vào ngầm định',
  goods_in_transit: 'TK hàng gửi đi bán',
  internal_receivable_goods: 'TK phải thu nội bộ hàng',
  internal_payable_goods: 'TK phải trả nội bộ hàng',
  internal_receivable: 'TK phải thu nội bộ tiền',
  internal_payable: 'TK phải trả nội bộ tiền',
  internal_cogs: 'TK ghi nhận giá vốn nội bộ khi chuyển kho',
  commission_debit: 'TK Nợ mặc định ghi nhận hoa hồng',
  commission_credit: 'TK Có mặc định ghi nhận hoa hồng',
  receivable: 'Phải thu khách hàng (khi lý do không chỉ định)',
  payable: 'Phải trả nhà cung cấp (khi lý do nhập mua không chỉ định)',
  promotion_expense: 'Chi phí hàng khuyến mãi, tặng khách',
  cash_in_transit: 'Tiền đang chuyển giữa các chi nhánh (chuyển tiền)',
  stock_surplus: 'Hàng thừa chờ xử lý (điều chỉnh tăng)',
  stock_shortage: 'Hàng thiếu chờ xử lý (điều chỉnh giảm)',
} as const;
/** Khoá thuộc form ACC41 (phần trên); các khoá còn lại hiện ở phần "Bộ định khoản". */
export const FORM_KEYS = ['cash', 'tax_output', 'tax_input', 'goods_in_transit', 'internal_receivable_goods', 'internal_payable_goods', 'internal_receivable', 'internal_payable', 'internal_cogs', 'commission_debit', 'commission_credit'] as const;

export const defaultsSchema = z.record(z.enum(Object.keys(DEFAULT_KEYS) as [keyof typeof DEFAULT_KEYS]), acc.min(3));
