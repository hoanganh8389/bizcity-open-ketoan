/** GET /api/v1/m/pos/returns?from&to&q&page&pageSize&branch — phiếu trả của chi nhánh; meta: page, pageSize, total, sums.refundTotal. */
import { defineAction, sql, z } from '@bizcity/module-sdk';
import { resolveBranch } from '../read.js';

const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

export default defineAction({
  id: 'pos.return.list', title: 'Danh sách phiếu trả máy POS', tags: ['Máy bán POS'],
  permission: 'pos:return', effect: 'read', idempotency: 'none',
  errors: ['VALIDATION_ERROR'],
  input: z.object({
    from: date.optional(), to: date.optional(), q: z.string().trim().max(64).optional(), branch: z.string().trim().max(32).optional(),
    page: z.coerce.number().int().min(1).default(1), pageSize: z.coerce.number().int().min(1).max(200).default(50),
  }),
  output: z.array(z.record(z.unknown())),
  expose: { http: { method: 'GET', path: '/returns' }, mcp: false, ai: 'read' },
  handler: async (ctx, input) => ctx.data.module(async (tx) => {
    const branch = await resolveBranch(tx, input.branch);
    const like = input.q ? `%${input.q.toUpperCase()}%` : null;
    const where = sql`branch_code = ${branch.code}
      ${input.from ? sql`AND business_date >= ${input.from}` : sql``} ${input.to ? sql`AND business_date <= ${input.to}` : sql``}
      ${like ? sql`AND (upper(code) LIKE ${like} OR upper(snapshot->>'orderCode') LIKE ${like})` : sql``}`;
    const agg = (await sql<{ n: string; s: string | null }>`SELECT count(*) AS n, sum(refund_total) AS s FROM mod_pos.returns WHERE ${where}`.execute(tx)).rows[0]!;
    const rows = (await sql<{ snapshot: Record<string, unknown> }>`
      SELECT snapshot FROM mod_pos.returns WHERE ${where} ORDER BY created_at DESC, id DESC
       LIMIT ${input.pageSize} OFFSET ${(input.page - 1) * input.pageSize}`.execute(tx)).rows;
    ctx.meta('page', input.page);
    ctx.meta('pageSize', input.pageSize);
    ctx.meta('total', Number(agg.n));
    ctx.meta('sums', { refundTotal: Number(agg.s ?? 0) });
    return rows.map((r) => r.snapshot);
  }),
});
