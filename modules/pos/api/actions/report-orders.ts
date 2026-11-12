/** GET /api/v1/m/pos/reports/orders?from&to&q&status&saleSource&page&pageSize&branch — danh sách đơn của chi nhánh (màn Đơn hàng), mới nhất trước. */
import { defineAction, z } from '@bizcity/module-sdk';
import { resolveBranch, todayVn } from '../read.js';
import { listOrders } from '../shifts.js';

const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

export default defineAction({
  id: 'pos.report.orders', title: 'Danh sách đơn máy POS của chi nhánh', tags: ['Máy bán POS'],
  permission: 'pos:sell', effect: 'read', idempotency: 'none',
  errors: ['VALIDATION_ERROR'],
  input: z.object({
    from: day.optional(), to: day.optional(), q: z.string().max(100).optional(),
    status: z.enum(['completed', 'awaiting_payment', 'cancelled']).optional(), saleSource: z.string().max(32).optional(),
    page: z.coerce.number().int().min(1).default(1), pageSize: z.coerce.number().int().min(1).max(200).default(50),
    branch: z.string().trim().max(32).optional(),
  }),
  output: z.array(z.record(z.unknown())),
  expose: { http: { method: 'GET', path: '/reports/orders' }, mcp: false, ai: 'read' },
  handler: async (ctx, input) => ctx.data.module(async (tx) => {
    const today = todayVn();
    const from = input.from ?? today;
    const r = await listOrders(tx, (await resolveBranch(tx, input.branch || undefined)).code, { ...input, from, to: input.to ?? from });
    ctx.meta('page', r.meta.page);
    ctx.meta('pageSize', r.meta.pageSize);
    ctx.meta('total', r.meta.total);
    ctx.meta('sums', r.meta.sums);
    return r.items;
  }),
});
