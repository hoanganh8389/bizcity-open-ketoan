/** POST /api/v1/m/phieu-ban/orders/:id/reject — từ chối đơn chờ duyệt (ghi lý do) → về Nháp. */
// [2026-11-17 Võ Hoàng] NGHIEM-THU — NT-BH-023: action đơn đặt hàng (đóng góp)
import { defineAction, z } from '@bizcity/module-sdk';
import { rejectOrder } from '../order-service.js';

export default defineAction({
  id: 'phieu-ban.order.reject', title: 'Từ chối đơn đặt hàng chờ duyệt', tags: ['Đơn đặt hàng'],
  permission: 'phieu-ban:order-approve', effect: 'write', sideEffects: ['documents'], idempotency: 'required',
  errors: ['VALIDATION_ERROR', 'CONFLICT', 'NOT_FOUND', 'FORBIDDEN'],
  input: z.object({ id: z.string().trim().min(1).max(64), note: z.string().trim().min(1, 'Ghi lý do từ chối').max(500) }),
  output: z.record(z.unknown()),
  expose: { http: { method: 'POST', path: '/orders/:id/reject' }, mcp: false, ai: 'deny' },
  evidence: { objectType: 'phieu-ban.order', objectId: (input) => input.id },
  handler: async (ctx, i) => rejectOrder(ctx, i.id, i.note),
});
