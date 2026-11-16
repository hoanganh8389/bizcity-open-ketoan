// [2026-11-15 03:50 PM Võ Hoàng] LOYALTY — NT-BH-020 bước 1: hoàn điểm khi trả hàng (đóng góp)
/**
 * Nghe `pos.return.recorded`: phiếu trả của đơn đã tích điểm → một dòng hoàn = điểm đã tích × tiền trả / tổng đơn (cộng dồn các
 * phiếu trả, làm tròn xuống), trừ lô của chính đơn trước. Không để số dư âm (thiếu thì trừ hết phần còn, ghi chú). Một phiếu trả
 * chỉ một dòng hoàn; dòng 0 điểm vẫn ghi để cộng dồn tiền trả cho phiếu sau.
 */
import { randomUUID } from 'node:crypto';
import { defineSubscriber } from '@bizcity/module-sdk';
import { planReverse } from '../domain/settle.js';
import { entriesOf, entryByRef, insertEntry, lockCustomer, refundedBefore, type Tx } from '../store.js';

type Data = { returnId: string; code: string; orderId: string; orderCode: string; branchCode: string; return: { createdAt: string; refundTotal: number } };

export default defineSubscriber({
  id: 'loyalty.return-reverse', module: 'loyalty', on: ['pos.return.recorded'],
  handle: async (ctx, evt) => {
    const d = evt.data as Data;
    await ctx.module(async (raw) => {
      const tx = raw as unknown as Tx;
      const earned = await entryByRef(tx, 'order', d.orderId, 'earn');
      if (!earned) return;
      await lockCustomer(tx, earned.partnerCode);
      if (await entryByRef(tx, 'return', d.returnId, 'reverse')) return;
      const at = d.return.createdAt;
      const plan = planReverse(await entriesOf(tx, earned.partnerCode), earned.entry, Number(d.return.refundTotal), await refundedBefore(tx, d.orderId), at);
      if (!plan) return;
      await insertEntry(tx, ctx.tenantId, {
        id: randomUUID(), partnerCode: earned.partnerCode, kind: 'reverse', points: -plan.points, at,
        ...(plan.allocations.length ? { allocations: plan.allocations } : {}),
        ref: { type: 'return', id: d.returnId, code: d.code }, branchCode: d.branchCode,
        meta: { ...plan.meta, orderId: d.orderId, orderCode: d.orderCode }, ...(plan.note ? { note: plan.note } : {}),
      });
    });
  },
});
