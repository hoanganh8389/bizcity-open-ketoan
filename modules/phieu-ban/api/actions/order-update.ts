/** PUT /api/v1/m/phieu-ban/orders/:id — sửa đơn (Nháp; Chờ duyệt → về Nháp; Đã gửi → chuyển bù hàng giữ). Ghi lịch sử cũ → mới. */
// [2026-11-17 Võ Hoàng] NGHIEM-THU — NT-BH-023: action đơn đặt hàng (đóng góp)
import { defineAction, z } from '@bizcity/module-sdk';
import { orderInput } from '../domain/order.js';
import { updateOrderFlow } from '../order-service.js';

export default defineAction({
  id: 'phieu-ban.order.update', title: 'Sửa đơn đặt hàng', tags: ['Đơn đặt hàng'],
  permission: 'phieu-ban:write', effect: 'write', sideEffects: ['documents', 'ledger'], idempotency: 'required',
  errors: ['VALIDATION_ERROR', 'CONFLICT', 'NOT_FOUND', 'PERIOD_LOCKED'],
  input: orderInput.extend({ id: z.string().trim().min(1).max(64) }),
  output: z.record(z.unknown()),
  expose: { http: { method: 'PUT', path: '/orders/:id' }, mcp: false, ai: 'propose' },
  evidence: { objectType: 'phieu-ban.order', objectId: (input) => input.id },
  handler: async (ctx, { id, ...input }) => updateOrderFlow(ctx, id, input),
});
