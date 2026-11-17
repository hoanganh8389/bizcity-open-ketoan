/** GET /api/v1/m/phieu-ban/orders/:id/history — lịch sử đơn: người, lúc, việc, giá trị cũ → mới, ghi chú (NT-BH-023 Q3). */
// [2026-11-17 Võ Hoàng] NGHIEM-THU — NT-BH-023: action đơn đặt hàng (đóng góp)
import { defineAction, z } from '@bizcity/module-sdk';
import { orderHistory } from '../order-service.js';

export default defineAction({
  id: 'phieu-ban.order.history', title: 'Lịch sử đơn đặt hàng', tags: ['Đơn đặt hàng'],
  permission: 'phieu-ban:read', effect: 'read', idempotency: 'none', errors: ['NOT_FOUND'],
  input: z.object({ id: z.string().trim().min(1).max(64) }),
  output: z.record(z.unknown()),
  expose: { http: { method: 'GET', path: '/orders/:id/history' }, mcp: true, ai: 'read' },
  handler: async (ctx, { id }) => orderHistory(ctx, id),
});
