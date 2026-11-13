/**
 * POST /api/v1/m/pos/orders/:id/qr/renew — "Tạo mã mới" cho đơn QR đang chờ (NT-BH-009): dời hạn thêm 5 phút, chỉ trong ngày bán
 * (POS_QR_EXPIRED). Đơn đã hoàn tất → trả đơn; đã huỷ → POS_ORDER_CANCELLED. Sau đó máy gọi cổng QR website tạo mã với hạn mới.
 */
import { Errors, defineAction, z } from '@bizcity/module-sdk';
import { QR_HOLD_MS } from '../domain/order.js';
import { lockKey } from '../order-service.js';
import { emitOrderChange, saveOrderChange, type OrderChange } from '../order-update.js';
import { todayVn } from '../read.js';
import { findOrder } from '../return-service.js';

export default defineAction({
  id: 'pos.order.qr-renew', title: 'Gia hạn mã QR của đơn chờ trả tiền', tags: ['Máy bán POS'],
  permission: 'pos:sell', effect: 'write', sideEffects: ['documents'], idempotency: 'required',
  errors: ['VALIDATION_ERROR', 'CONFLICT', 'NOT_FOUND'],
  input: z.object({ id: z.string().trim().min(1).max(64) }).passthrough(),
  output: z.record(z.unknown()),
  expose: { http: { method: 'POST', path: '/orders/:id/qr/renew' }, mcp: false, ai: 'deny' },
  evidence: { objectType: 'pos.order', objectId: (input) => input.id },
  handler: async (ctx, { id }) => {
    let change: OrderChange | null = null;
    const out = await ctx.data.module(async (tx) => {
    const order = await findOrder(tx, id);
    await lockKey(tx, `pos:order:${order.order_id}`);
    const fresh = await findOrder(tx, order.order_id);
    if (fresh.status === 'completed') return fresh.snapshot;
    if (fresh.status === 'cancelled') throw Errors.conflict(`Đơn ${fresh.code} đã huỷ`, { reason: 'POS_ORDER_CANCELLED', code: fresh.code });
    if (fresh.business_date !== todayVn()) {
      throw Errors.conflict(`Đơn ${fresh.code} bán ngày ${fresh.business_date} — không tạo mã mới sau ngày bán, huỷ đơn và bán lại`, { reason: 'POS_QR_EXPIRED', businessDate: fresh.business_date });
    }
    const qr = (fresh.snapshot as { qr?: Record<string, unknown> }).qr ?? {};
    const snapshot = { ...fresh.snapshot, qr: { ...qr, status: 'waiting', expiresAt: new Date(Date.now() + QR_HOLD_MS).toISOString() } };
    change = await saveOrderChange(tx, fresh, snapshot);
    return snapshot;
    });
    if (change) await emitOrderChange(ctx, change);
    return out;
  },
});
