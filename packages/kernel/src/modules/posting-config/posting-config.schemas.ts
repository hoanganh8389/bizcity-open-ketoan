// @bizcity-layer K kernel/config
// [2026-10-29 10:24 PM Johnny Chu - Chu Hoàng Anh] INIT — khởi tạo Bizcity Core Framework: sổ cái chỉ thêm, cửa nạp sự việc, CANON, hợp đồng, bộ kiểm chuẩn.
// [2026-10-30 09:58 AM Johnny Chu - Chu Hoàng Anh] PHASE-002 — nhãn lớp @bizcity-layer, đồ thị phụ thuộc mốc, bản nháp API module-sdk.
// [2026-11-01 04:39 PM Johnny Chu - Chu Hoàng Anh] PHASE-010 — dời từ apps/api/src/modules/posting-config/posting-config.schemas.ts sang packages/kernel (@bizcity/kernel, D010-7 chặng 3); import Platform qua @bizcity/platform
// [2026-11-02 08:45 PM Johnny Chu - Chu Hoàng Anh] PHASE-011 — 3.15: lý do kind "journal" + debitAccount / creditAccount
import { z } from 'zod';
import { RULE_KEYS } from './scheme.js';

const acc = z.string().trim().max(20);

export const reasonSchema = z.object({
  code: z.string().trim().min(1).max(32),
  name: z.string().trim().min(1).max(255),
  kind: z.enum(['out', 'in', 'receipt', 'payment', 'journal']),
  counterAccount: acc.optional(),
  revenueAccount: acc.optional(),
  expenseAccount: acc.optional(),
  cashflowCode: z.string().trim().max(16).optional(),
  /** Lý do journal (manual_journal): tài khoản Nợ / Có của mỗi dòng — bắt buộc cả hai, khác nhau; loại khác bỏ trống. */
  debitAccount: acc.optional(),
  creditAccount: acc.optional(),
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
// [2026-11-15 Nguyễn Văn Thủy] khoá tài khoản của quy tắc lấy từ scheme.ts (một nguồn: màn Quy tắc hạch toán, API, tài liệu) (đóng góp)
export const DEFAULT_KEYS: Record<string, string> = Object.fromEntries(Object.entries(RULE_KEYS).map(([k, v]) => [k, v.label]));

export const defaultsSchema = z.record(z.enum(Object.keys(RULE_KEYS) as [string, ...string[]]), acc.min(3));
