/**
 * Khuôn đơn máy bán gửi lên (OrderDraft của hợp đồng tgs_pos_react/openapi/pos.yaml), phần module pos đọc ở W1.
 * Trường máy gửi mà W1 chưa dùng vẫn nhận (passthrough) để lưu nguyên văn vào mod_pos.orders.draft.
 */
import { z } from '@bizcity/module-sdk';

const vnd = z.number().int('Tiền là số nguyên đồng');

export const manualDiscountSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('amount'), value: vnd.min(0, 'Tiền giảm không được âm') }),
  z.object({ kind: z.literal('percent'), value: z.number().gt(0).max(100, 'Giảm % tối đa 100') }),
]);

export const orderLineDraftSchema = z.object({
  lineId: z.string().min(1).max(64),
  productId: z.string().max(64).optional(),
  sku: z.string().trim().min(1).max(64),
  unitName: z.string().trim().min(1).max(40),
  unitQty: z.number().gt(0, 'Số lượng phải lớn hơn 0'),
  /** Tỉ lệ ĐVT bán / đơn vị nhỏ nhất (máy biết từ bảng giá WP); thiếu = 1. */
  unitRatio: z.number().gt(0).optional(),
  clientUnitPrice: vnd.min(0, 'Giá không được âm'),
  manualDiscount: manualDiscountSchema.optional(),
  note: z.string().max(500).optional(),
  isGift: z.boolean().optional(),
  giftKey: z.string().optional(),
  giftSourceLineId: z.string().optional(),
  promotionId: z.number().int().optional(),
  // [2026-11-12 10:35 PM Võ Hoàng] POS-KM — NT-BH-003 (đóng góp): dòng sinh ra / được giảm theo chương trình bán (Core tính, POST /api/v1/policies/evaluate).
  /** Chương trình của dòng: dòng quà (`line: gift`) hoặc dòng được giảm (`line: discount`). Key phải có trong `policyRefs` của đơn. */
  policyRef: z.object({ key: z.string().trim().min(1).max(64), version: z.number().int().min(1), line: z.enum(['gift', 'discount']).optional() }).optional(),
  /** Tiền giảm theo chương trình (gồm thuế) của cả dòng — đúng `discounts[].amount` Core trả. */
  promoDiscount: vnd.min(0, 'Tiền giảm không được âm').optional(),
}).passthrough();

export const paymentDraftSchema = z.discriminatedUnion('mode', [
  z.object({ mode: z.literal('cash'), cashGiven: vnd.min(0) }),
  z.object({ mode: z.literal('qr') }),
  z.object({
    mode: z.literal('split'),
    parts: z.array(z.object({ method: z.string().min(1).max(32), amount: vnd.gt(0, 'Mỗi phần phải lớn hơn 0'), voucherCount: z.number().int().optional() })).min(1),
  }),
  z.object({ mode: z.literal('credit') }),
]);

export const customerDraftSchema = z.union([
  z.object({ partnerId: z.string().trim().min(1).max(64) }),
  z.object({ retail: z.literal(true) }),
  z.object({ phone: z.string().trim().min(1).max(20), name: z.string().trim().max(200) }),
]);

export const orderDraftSchema = z.object({
  id: z.string().trim().min(8).max(64),
  /** Chi nhánh bán. Hợp đồng gửi ở header X-Branch; ctx của module chưa đọc được header (P-MP-3) nên máy gửi thêm ở thân. */
  branchCode: z.string().trim().min(1).max(32).optional(),
  reservedCode: z.string().max(12).optional(),
  businessDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Ngày bán dạng YYYY-MM-DD'),
  shiftId: z.string().max(64),
  exportReasonCode: z.string().max(32),
  saleSource: z.string().max(32).optional(),
  customer: customerDraftSchema,
  lines: z.array(orderLineDraftSchema).min(1, 'Giỏ hàng trống').max(500),
  promotionSelections: z.array(z.unknown()),
  payment: paymentDraftSchema,
  note: z.string().max(1000).optional(),
  clientTotal: vnd.min(0),
  coreVersion: z.string().max(40),
  promotionsVersion: z.string().max(80),
  offlineCreatedAt: z.string().optional(),
  loyalty: z.object({ redeem: z.array(z.string()) }).optional(),
  policyRefs: z.array(z.object({ key: z.string(), version: z.number().int().min(0), hash: z.string().optional() })).optional(),
}).passthrough();

export type OrderDraft = z.infer<typeof orderDraftSchema>;
export type OrderLineDraft = z.infer<typeof orderLineDraftSchema>;
export type ManualDiscount = z.infer<typeof manualDiscountSchema>;
export type PaymentDraft = z.infer<typeof paymentDraftSchema>;
