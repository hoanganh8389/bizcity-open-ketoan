/** POST /api/v1/m/phieu-ban/orders/:id/cancel — huỷ đơn chưa giao gì (đã giao một phần → PHIEU_BAN_ORDER_STATE, dùng Đóng đơn); đang giữ hàng thì trả về kho bán. */
// [2026-11-17 Võ Hoàng] NGHIEM-THU — NT-BH-023: action đơn đặt hàng (đóng góp)
import { defineAction, z } from '@bizcity/module-sdk';
import { cancelOrder } from '../order-service.js';

export default defineAction({
  id: 'phieu-ban.order.cancel', title: 'Huỷ đơn đặt hàng chưa giao', tags: ['Đơn đặt hàng'],
  permission: 'phieu-ban:write', effect: 'write', sideEffects: ['documents', 'ledger'], idempotency: 'required',
  errors: ['VALIDATION_ERROR', 'CONFLICT', 'NOT_FOUND', 'PERIOD_LOCKED'],
  input: z.object({ id: z.string().trim().min(1).max(64), note: z.string().trim().max(500).default('') }),
  output: z.record(z.unknown()),
  expose: { http: { method: 'POST', path: '/orders/:id/cancel' }, mcp: false, ai: 'deny' },
  evidence: { objectType: 'phieu-ban.order', objectId: (input) => input.id },
  handler: async (ctx, i) => cancelOrder(ctx, i.id, i.note),
});
