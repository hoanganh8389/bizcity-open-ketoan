/** GET /api/v1/m/phieu-ban/orders/:id — một đơn đặt hàng đầy đủ (dòng: đã giao, đang giữ; các lần giao; lý do chờ duyệt). */
// [2026-11-17 Võ Hoàng] NGHIEM-THU — NT-BH-023: action đơn đặt hàng (đóng góp)
import { defineAction, z } from '@bizcity/module-sdk';
import { orderDetail } from '../order-service.js';

export default defineAction({
  id: 'phieu-ban.order.get', title: 'Xem đơn đặt hàng', tags: ['Đơn đặt hàng'],
  permission: 'phieu-ban:read', effect: 'read', idempotency: 'none', errors: ['NOT_FOUND'],
  input: z.object({ id: z.string().trim().min(1).max(64) }),
  output: z.record(z.unknown()),
  expose: { http: { method: 'GET', path: '/orders/:id' }, mcp: true, ai: 'read' },
  handler: async (ctx, { id }) => orderDetail(ctx, id),
});
