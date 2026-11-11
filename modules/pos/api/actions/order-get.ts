/** GET /api/v1/m/pos/orders/:id — chi tiết đơn đã nhận (bản chụp lúc bán). */
import { Errors, defineAction, sql, z } from '@bizcity/module-sdk';

export default defineAction({
  id: 'pos.order.get', title: 'Chi tiết đơn máy POS', tags: ['Máy bán POS'],
  permission: 'pos:sell', effect: 'read', idempotency: 'none',
  errors: ['VALIDATION_ERROR', 'NOT_FOUND'],
  // id: id đơn (UUID máy sinh) hoặc mã phiếu. Mã phiếu chỉ duy nhất trong một chi nhánh → tra theo mã thì kèm branch.
  input: z.object({ id: z.string().trim().min(1).max(64), branch: z.string().trim().max(32).optional() }),
  output: z.record(z.unknown()),
  expose: { http: { method: 'GET', path: '/orders/:id' }, mcp: false, ai: 'read' },
  handler: async (ctx, { id, branch }) => ctx.data.module(async (tx) => {
    const byId = (await sql<{ snapshot: Record<string, unknown> }>`
      SELECT snapshot FROM mod_pos.orders WHERE order_id = ${id}`.execute(tx)).rows[0];
    if (byId) return byId.snapshot;
    const byCode = (await sql<{ snapshot: Record<string, unknown> }>`
      SELECT snapshot FROM mod_pos.orders WHERE code = ${id} ${branch ? sql`AND branch_code = ${branch}` : sql``} ORDER BY id LIMIT 2`.execute(tx)).rows;
    if (byCode.length > 1) throw Errors.validation(`Mã phiếu ${id} có ở nhiều chi nhánh — gửi kèm branch`, { reason: 'POS_BRANCH_REQUIRED' });
    if (!byCode.length) throw Errors.notFound(`đơn ${id}`);
    return byCode[0]!.snapshot;
  }),
});
