/**
 * POST /api/v1/m/pos/orders — nhận đơn bán tại quầy (kế hoạch module POS đợt W1, phiếu NT-BH-004).
 *
 * Một giao dịch (runtime bọc cả handler): kiểm + tính lại tiền theo danh mục kế toán → cấp mã phiếu → nộp chứng từ `sale`
 * (ctx.ledger.submit) → lưu đơn + dòng đơn ở mod_pos. Lỗi ở bước nào (kể cả định khoản) thì không bước nào được ghi.
 * Gửi lại cùng id đơn, cùng nội dung → trả đơn cũ; cùng id mà khác nội dung → CONFLICT (không trả nhầm đơn cũ).
 * Thân xử lý dùng chung với đơn mới của đổi hàng: ../order-service.ts.
 */
import { defineAction, z } from '@bizcity/module-sdk';
import { orderDraftSchema } from '../domain/schema.js';
import { createOrder } from '../order-service.js';

export const createOrderResult = z.object({
  order: z.record(z.unknown()),
  nextReservedCodes: z.array(z.string()),
  einvoiceReview: z.object({ required: z.boolean(), lines: z.array(z.unknown()), warnings: z.array(z.string()) }),
});

export default defineAction({
  id: 'pos.order.create', title: 'Nhận đơn bán từ máy POS', tags: ['Máy bán POS'],
  description: 'Đơn bán tại quầy → chứng từ sale (bizcity_ledger_intake@1) qua cửa nạp, cùng giao dịch với đơn.',
  permission: 'pos:sell', effect: 'write', sideEffects: ['documents', 'ledger'], idempotency: 'required', dryRun: true,
  // STD-ACT-8: action chạm sổ khai PERIOD_LOCKED, POSTING_FAILED.
  errors: ['VALIDATION_ERROR', 'CONFLICT', 'PERIOD_LOCKED', 'POSTING_FAILED'],
  input: orderDraftSchema,
  output: createOrderResult,
  expose: { http: { method: 'POST', path: '/orders', status: 201 }, mcp: false, ai: 'deny' },
  evidence: { objectType: 'pos.order', objectId: (input) => input.id },
  handler: async (ctx, draft) => {
    const { order, nextReservedCodes, einvoiceReview } = await createOrder(ctx, draft);
    return { order, nextReservedCodes, einvoiceReview };
  },
});
