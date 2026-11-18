/** POST /api/v1/m/phieu-ban/orders/:id/close — đóng đơn đã gửi: phần chưa giao thôi giữ, chuyển từ kho KCB về kho bán. */
// [2026-11-17 Võ Hoàng] NGHIEM-THU — NT-BH-023: action đơn đặt hàng (đóng góp)
import { defineAction, z } from '@bizcity/module-sdk';
import { closeOrder } from '../order-service.js';

export default defineAction({
  id: 'phieu-ban.order.close', title: 'Đóng đơn đặt hàng (trả phần còn giữ về kho bán)', tags: ['Đơn đặt hàng'],
  permission: 'phieu-ban:write', effect: 'write', sideEffects: ['documents', 'ledger'], idempotency: 'required',
  errors: ['VALIDATION_ERROR', 'CONFLICT', 'NOT_FOUND', 'PERIOD_LOCKED'],
  input: z.object({ id: z.string().trim().min(1).max(64), note: z.string().trim().max(500).default('') }),
  output: z.record(z.unknown()),
  expose: { http: { method: 'POST', path: '/orders/:id/close' }, mcp: false, ai: 'deny' },
  evidence: { objectType: 'phieu-ban.order', objectId: (input) => input.id },
  handler: async (ctx, i) => closeOrder(ctx, i.id, i.note),
});
