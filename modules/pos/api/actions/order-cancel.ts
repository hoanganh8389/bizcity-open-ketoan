/**
 * POST /api/v1/m/pos/orders/:id/cancel — huỷ đơn chờ thanh toán (QR chưa về). Đơn đã hoàn tất không huỷ: khách trả thì lập
 * phiếu trả hàng (NT-BH-005, lệch chuẩn 11). Huỷ = ctx.ledger.cancel (đảo bút toán, hoặc "chờ huỷ" khi loại chứng từ đặt chờ
 * duyệt — kế toán huỷ thật ở ACC14). Gọi lại với đơn đã huỷ thì trả đơn đó.
 */
import { Errors, defineAction, sql, z } from '@bizcity/module-sdk';
import { findOrder } from '../return-service.js';
import { lockKey } from '../order-service.js';

export default defineAction({
  id: 'pos.order.cancel', title: 'Huỷ đơn máy POS đang chờ thanh toán', tags: ['Máy bán POS'],
  permission: 'pos:cancel', effect: 'write', sideEffects: ['documents', 'ledger'], idempotency: 'required',
  errors: ['VALIDATION_ERROR', 'CONFLICT', 'NOT_FOUND', 'PERIOD_LOCKED', 'POSTING_FAILED'],
  input: z.object({ id: z.string().trim().min(1).max(64), reason: z.string().trim().max(500).optional() }).passthrough(),
  output: z.record(z.unknown()),
  expose: { http: { method: 'POST', path: '/orders/:id/cancel' }, mcp: false, ai: 'deny' },
  evidence: { objectType: 'pos.order', objectId: (input) => input.id },
  handler: async (ctx, { id, reason }) => {
    const order = await ctx.data.module(async (tx) => {
      const o = await findOrder(tx, id);
      await lockKey(tx, `pos:order:${o.order_id}`);
      return o;
    });
    if (order.status === 'cancelled') return order.snapshot;
    if (order.status === 'completed') {
      throw Errors.conflict('Đơn đã thu tiền xong không huỷ được — khách trả hàng thì lập phiếu trả hàng', { reason: 'POS_CANCEL_COMPLETED', code: order.code });
    }
    const why = reason?.trim() || 'Huỷ đơn chờ thanh toán từ máy bán';
    await ctx.ledger.cancel(order.doc_key, why);
    const snapshot = { ...order.snapshot, status: 'cancelled' };
    const version = await ctx.data.module(async (tx) => (await sql<{ version: number }>`UPDATE mod_pos.orders SET status = 'cancelled', cancelled_at = now(), cancel_reason = ${why}, snapshot = ${JSON.stringify(snapshot)}::jsonb,
                 version = version + 1 WHERE order_id = ${order.order_id} RETURNING version`.execute(tx)).rows[0]!.version);
    ctx.evidence.note('pos.order.cancel', { code: order.code, docKey: order.doc_key, reason: why });
    await ctx.events.emit('pos.order.cancelled', { orderId: order.order_id, code: order.code, branchCode: order.branch_code, docKey: order.doc_key, reason: why, version, order: snapshot }, {
      subject: `pos.order:${order.order_id}`, dedupeKey: `pos.order.cancelled:${order.order_id}`,
    });
    return snapshot;
  },
});
