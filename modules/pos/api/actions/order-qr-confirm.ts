/**
 * POST /api/v1/m/pos/orders/:id/qr/confirm — đơn QR đã nhận tiền (NT-BH-009): ngân hàng báo có (cổng QR website thấy giao dịch khớp)
 * hoặc thu ngân bấm "Xác nhận đã nhận tiền" (như POS cũ, ghi người bấm). Đơn chờ → hoàn tất, phát bản sao sổ. Gọi lại → trả đơn.
 * Bấm tay sau ngày bán → POS_QR_EXPIRED (ngân hàng báo có vẫn nhận: khách đã trả). Đơn đã huỷ → POS_ORDER_CANCELLED.
 * Đợt này máy bán chuyển tiếp xác nhận (website chưa tự gọi module được — khoá app chỉ xin quyền Core), nên ghi rõ nguồn.
 */
import { Errors, defineAction, z } from '@bizcity/module-sdk';
import { lockKey } from '../order-service.js';
import { emitOrderChange, saveOrderChange, type OrderChange } from '../order-update.js';
import { todayVn } from '../read.js';
import { findOrder } from '../return-service.js';

type Qr = { amount: number; status: string; expiresAt: string; paidAt?: string; paymentRef?: string; source?: string; manual?: Record<string, unknown> };

export default defineAction({
  id: 'pos.order.qr-confirm', title: 'Xác nhận đơn QR đã nhận tiền', tags: ['Máy bán POS'],
  permission: 'pos:sell', effect: 'write', sideEffects: ['documents'], idempotency: 'required',
  errors: ['VALIDATION_ERROR', 'CONFLICT', 'NOT_FOUND'],
  input: z.object({
    id: z.string().trim().min(1).max(64), source: z.enum(['bank', 'manual']), amount: z.number().nonnegative(),
    paymentRef: z.string().trim().max(100).optional(), paidAt: z.string().max(40).optional(), note: z.string().trim().max(500).optional(),
  }).passthrough(),
  output: z.record(z.unknown()),
  expose: { http: { method: 'POST', path: '/orders/:id/qr/confirm' }, mcp: false, ai: 'deny' },
  evidence: { objectType: 'pos.order', objectId: (input) => input.id },
  handler: async (ctx, { id, source, amount, paymentRef, paidAt, note }) => {
    let change: OrderChange | null = null;
    const out = await ctx.data.module(async (tx) => {
    const order = await findOrder(tx, id);
    await lockKey(tx, `pos:order:${order.order_id}`);
    const fresh = await findOrder(tx, order.order_id);
    if (fresh.status === 'completed') return fresh.snapshot;
    if (fresh.status === 'cancelled') throw Errors.conflict(`Đơn ${fresh.code} đã huỷ — tiền về thì kế toán hoàn tay`, { reason: 'POS_ORDER_CANCELLED', code: fresh.code });
    const qr = (fresh.snapshot as { qr?: Qr }).qr;
    if (!qr || amount !== qr.amount) {
      throw Errors.validation(`Số tiền ${amount} khác phần QR của đơn (${qr?.amount ?? 0})`, { reason: 'POS_PAYMENT_MISMATCH', expected: qr?.amount ?? 0, amount });
    }
    if (source === 'manual' && fresh.business_date !== todayVn()) {
      throw Errors.conflict(`Đơn ${fresh.code} bán ngày ${fresh.business_date} — không xác nhận tay sau ngày bán`, { reason: 'POS_QR_EXPIRED', businessDate: fresh.business_date });
    }
    const at = new Date().toISOString();
    const snapshot = {
      ...fresh.snapshot, status: 'completed',
      qr: {
        ...qr, status: 'paid', paidAt: paidAt ?? at, source, ...(paymentRef ? { paymentRef } : {}),
        ...(source === 'manual' ? { manual: { by: ctx.actor.name, at, ...(note ? { note } : {}) } } : {}),
      },
    };
    change = await saveOrderChange(tx, fresh, snapshot, 'completed');
    ctx.evidence.note('pos.order.qr-confirm', { code: fresh.code, amount, source, paymentRef: paymentRef ?? null });
    return snapshot;
    });
    if (change) await emitOrderChange(ctx, change);
    return out;
  },
});
