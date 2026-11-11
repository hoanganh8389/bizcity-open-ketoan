/** GET /api/v1/m/pos/customers/:id/orders?page&pageSize — đơn máy bán của khách (mới nhất trước); meta: page, pageSize, total, sums.total. */
import { Errors, defineAction, sql, z } from '@bizcity/module-sdk';
import { customerByCode } from '../customers.js';

export default defineAction({
  id: 'pos.customer.orders', title: 'Đơn máy POS của khách', tags: ['Máy bán POS'],
  permission: 'pos:sell', effect: 'read', idempotency: 'none',
  errors: ['VALIDATION_ERROR', 'NOT_FOUND'],
  input: z.object({
    id: z.string().trim().min(1).max(64),
    page: z.coerce.number().int().min(1).default(1), pageSize: z.coerce.number().int().min(1).max(200).default(20),
  }),
  output: z.array(z.record(z.unknown())),
  expose: { http: { method: 'GET', path: '/customers/:id/orders' }, mcp: false, ai: 'read' },
  handler: async (ctx, { id, page, pageSize }) => ctx.data.module(async (tx) => {
    if (!(await customerByCode(tx, id))) throw Errors.notFound(`khách ${id}`);
    const agg = (await sql<{ n: string; s: string | null }>`
      SELECT count(*) AS n, sum(total) FILTER (WHERE status = 'completed') AS s FROM mod_pos.orders WHERE customer_code = ${id}`.execute(tx)).rows[0]!;
    const rows = (await sql<{ snapshot: Record<string, unknown> }>`
      SELECT snapshot FROM mod_pos.orders WHERE customer_code = ${id} ORDER BY created_at DESC, id DESC
       LIMIT ${pageSize} OFFSET ${(page - 1) * pageSize}`.execute(tx)).rows;
    ctx.meta('page', page);
    ctx.meta('pageSize', pageSize);
    ctx.meta('total', Number(agg.n));
    ctx.meta('sums', { total: Number(agg.s ?? 0) });
    return rows.map((r) => r.snapshot);
  }),
});
