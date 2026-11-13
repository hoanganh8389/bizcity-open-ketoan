/** GET /api/v1/m/pos/admin/returns?from&to&branches&q&page&pageSize — BH14 Phiếu trả hàng máy POS: phiếu trả nối đơn gốc, nhiều chi nhánh; meta.sums: returns, refundTotal (NT-BH-008). */
import { defineAction, z } from '@bizcity/module-sdk';
import { adminReturns, branchList } from '../admin.js';
import { todayVn } from '../read.js';

const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const range = { from: day.optional(), to: day.optional(), branches: z.string().max(4000).optional() };
const page = { page: z.coerce.number().int().min(1).default(1), pageSize: z.coerce.number().int().min(1).max(500).default(100) };

export default defineAction({
  id: 'pos.admin.returns', title: 'Phiếu trả hàng máy POS (quản trị, nhiều chi nhánh)', tags: ['Quản trị bán lẻ'],
  permission: 'pos:report', effect: 'read', idempotency: 'none',
  errors: ['VALIDATION_ERROR'],
  input: z.object({ ...range, ...page, q: z.string().max(100).optional() }),
  output: z.array(z.record(z.unknown())),
  expose: { http: { method: 'GET', path: '/admin/returns' }, mcp: false, ai: 'read' },
  handler: async (ctx, i) => ctx.data.module(async (tx) => {
    const from = i.from ?? todayVn();
    const r = await adminReturns(tx, { ...i, from, to: i.to ?? from, branches: branchList(i.branches) });
    ctx.meta('page', r.meta.page);
    ctx.meta('pageSize', r.meta.pageSize);
    ctx.meta('total', r.meta.total);
    ctx.meta('sums', r.meta.sums);
    return r.items;
  }),
});
