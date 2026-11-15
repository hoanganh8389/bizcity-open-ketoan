// [2026-11-15 01:45 PM Võ Hoàng] POS-BILLZ — NT-BH-019 bước 2: chuyển dòng 0đ của đơn đã xong sang bill Z (đóng góp)
/**
 * POST /api/v1/m/pos/orders/:id/lines/:lineId/move-to-z — chuyển một dòng 0đ của bill chính sang bill Z (như nút "Chuyển sang bill Z"
 * của POS cũ): dòng không lên hoá đơn điện tử, bản sao website ghi lại phiên bản mới (zsale / zexport). Chỉ đổi cách trình bày
 * đơn — dòng 0đ không có doanh thu / thuế nên chứng từ bán và sổ không đổi. Gọi lại khi dòng đã ở bill Z → trả đơn như đã chuyển.
 * Chặn: dòng có tiền (đã thu tiền phải lên hoá đơn), đơn chưa hoàn tất, đơn đã huỷ.
 */
import { Errors, defineAction, z } from '@bizcity/module-sdk';
import { lockKey } from '../order-service.js';
import { emitOrderChange, saveOrderChange, type OrderChange } from '../order-update.js';
import { findOrder } from '../return-service.js';

type Line = { lineId: string; amount: number; taxAmount: number; sendTax?: boolean } & Record<string, unknown>;
type Snap = { lines?: Line[]; zBill?: { code: string; lines: Line[] } } & Record<string, unknown>;

/** Bản chụp mới sau khi chuyển dòng; null = dòng đã ở bill Z (gọi lại). Ném lỗi nghiệp vụ khi không chuyển được. */
export function moveLineToZ(snap: Snap, orderCode: string, lineId: string): Snap | null {
  if (snap.zBill?.lines.some((l) => l.lineId === lineId)) return null;
  const line = (snap.lines ?? []).find((l) => l.lineId === lineId);
  if (!line) throw Errors.notFound(`Không có dòng ${lineId} ở bill chính của đơn ${orderCode}`);
  if (Number(line.amount) + Number(line.taxAmount) !== 0) {
    throw Errors.conflict('Chỉ chuyển được dòng 0đ sang bill Z (dòng đã thu tiền phải lên hoá đơn)', { lineId });
  }
  return {
    ...snap,
    lines: (snap.lines ?? []).filter((l) => l !== line),
    zBill: { code: snap.zBill?.code ?? `${orderCode}Z`, lines: [...(snap.zBill?.lines ?? []), { ...line, sendTax: false }] },
  };
}

export default defineAction({
  id: 'pos.order.move-to-z', title: 'Chuyển dòng 0đ của đơn máy POS sang bill Z', tags: ['Máy bán POS'],
  permission: 'pos:sell', effect: 'write', sideEffects: ['documents'], idempotency: 'required',
  errors: ['VALIDATION_ERROR', 'CONFLICT', 'NOT_FOUND'],
  input: z.object({ id: z.string().trim().min(1).max(64), lineId: z.string().trim().min(1).max(64) }).passthrough(),
  output: z.record(z.unknown()),
  expose: { http: { method: 'POST', path: '/orders/:id/lines/:lineId/move-to-z' }, mcp: false, ai: 'deny' },
  evidence: { objectType: 'pos.order', objectId: (input) => input.id },
  handler: async (ctx, { id, lineId }) => {
    let change: OrderChange | null = null;
    const out = await ctx.data.module(async (tx) => {
      const order = await findOrder(tx, id);
      await lockKey(tx, `pos:order:${order.order_id}`);
      const fresh = await findOrder(tx, order.order_id);
      if (fresh.status === 'cancelled') throw Errors.conflict(`Đơn ${fresh.code} đã huỷ`, { reason: 'POS_ORDER_CANCELLED', code: fresh.code });
      if (fresh.status !== 'completed') throw Errors.conflict(`Chỉ chuyển dòng của đơn đã hoàn tất (đơn ${fresh.code} đang chờ thanh toán)`, { status: fresh.status });
      const snapshot = moveLineToZ(fresh.snapshot as Snap, fresh.code, lineId);
      if (!snapshot) return fresh.snapshot;
      change = await saveOrderChange(tx, fresh, snapshot);
      ctx.evidence.note('pos.order.move-to-z', { code: fresh.code, lineId });
      return snapshot;
    });
    if (change) await emitOrderChange(ctx, change);
    return out;
  },
});
