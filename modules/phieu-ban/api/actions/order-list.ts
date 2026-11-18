/** GET /api/v1/m/phieu-ban/orders?from&to&branchCodes&status&source&search&page&pageSize — danh sách đơn đặt hàng (mới nhất trước), meta.total. */
// [2026-11-17 Võ Hoàng] NGHIEM-THU — NT-BH-023: action đơn đặt hàng (đóng góp)
import { defineAction, z } from '@bizcity/module-sdk';
import { ORDER_SOURCES, ORDER_STATUSES } from '../domain/order.js';
import { listOrdersOf } from '../order-service.js';

const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().or(z.literal('').transform(() => undefined));

export default defineAction({
  id: 'phieu-ban.order.list', title: 'Danh sách đơn đặt hàng', tags: ['Đơn đặt hàng'],
  permission: 'phieu-ban:read', effect: 'read', idempotency: 'none',
  input: z.object({
    from: day, to: day, branchCodes: z.string().trim().max(2000).optional(),
    status: z.enum(ORDER_STATUSES).optional().or(z.literal('').transform(() => undefined)),
    source: z.enum(ORDER_SOURCES).optional().or(z.literal('').transform(() => undefined)),
    search: z.string().trim().max(100).optional(),
    page: z.coerce.number().int().min(1).default(1), pageSize: z.coerce.number().int().min(1).max(500).default(50),
  }),
  output: z.array(z.record(z.unknown())),
  expose: { http: { method: 'GET', path: '/orders' }, mcp: true, ai: 'read' },
  handler: async (ctx, i) => listOrdersOf(ctx, {
    from: i.from, to: i.to, branches: (i.branchCodes ?? '').split(',').map((s) => s.trim()).filter(Boolean), status: i.status, source: i.source,
    search: i.search, page: i.page, pageSize: i.pageSize,
  }),
});
