/** GET /api/v1/m/pos/admin/orders?from&to&branches&q&status&cashier&stockShort&page&pageSize — BH13 Đơn bán máy POS: đơn của nhiều chi nhánh (rỗng = mọi chi nhánh), mới nhất trước; meta.sums: orders, total, returned, net của cả kết quả lọc (NT-BH-008). stockShort=1: chỉ đơn bán quá tồn khi mất mạng (NT-BH-021). saleSource=<mã kênh>: chỉ đơn của kênh (NT-BH-031). */
import { defineAction, z } from '@bizcity/module-sdk';
import { adminOrders, branchList } from '../admin.js';
import { todayVn } from '../read.js';
// [2026-11-18 Võ Hoàng] NGHIEM-THU — NT-BH-031: lọc theo kênh bán (saleSource = mã kênh) (đóng góp)
import { channelNames } from '../channels.js';

const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const range = { from: day.optional(), to: day.optional(), branches: z.string().max(4000).optional() };
const page = { page: z.coerce.number().int().min(1).default(1), pageSize: z.coerce.number().int().min(1).max(500).default(100) };

export default defineAction({
  id: 'pos.admin.orders', title: 'Đơn bán máy POS (quản trị, nhiều chi nhánh)', tags: ['Quản trị bán lẻ'],
  permission: 'pos:report', effect: 'read', idempotency: 'none',
  errors: ['VALIDATION_ERROR'],
  input: z.object({ ...range, ...page, q: z.string().max(100).optional(), status: z.enum(['completed', 'awaiting_payment', 'cancelled']).optional(), cashier: z.string().max(100).optional(), stockShort: z.coerce.number().int().min(0).max(1).optional().transform((v) => v === 1), saleSource: z.string().trim().max(100).optional() }),
  output: z.array(z.record(z.unknown())),
  expose: { http: { method: 'GET', path: '/admin/orders' }, mcp: false, ai: 'read' },
  handler: async (ctx, i) => ctx.data.module(async (tx) => {
    const from = i.from ?? todayVn();
    const r = await adminOrders(tx, { ...i, from, to: i.to ?? from, branches: branchList(i.branches), channelNames: await channelNames(tx, ctx.tenant.id) });
    ctx.meta('page', r.meta.page);
    ctx.meta('pageSize', r.meta.pageSize);
    ctx.meta('total', r.meta.total);
    ctx.meta('sums', r.meta.sums);
    return r.items;
  }),
});
