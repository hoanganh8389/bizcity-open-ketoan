// [2026-11-15 03:50 PM Võ Hoàng] LOYALTY — NT-BH-020 bước 1: tích điểm khi đơn máy bán ghi sổ (đóng góp)
/**
 * Nghe `pos.order.recorded` (đơn mới và mọi phiên bản sau: xác nhận QR, chuyển bill Z…): đơn HOÀN TẤT có khách → một dòng tích theo
 * chính sách mới nhất của chi nhánh. Một đơn chỉ một dòng tích (khoá ref order + earn): phiên bản sau / giao lại không tích thêm;
 * đơn QR tích ở phiên bản hoàn tất. Chi nhánh chưa có chính sách → không tích (website chưa đẩy sang).
 */
import { randomUUID } from 'node:crypto';
import { defineSubscriber } from '@bizcity/module-sdk';
import { planEarn, type OrderSnap } from '../domain/settle.js';
import { entriesOf, entryByRef, insertEntry, latestProgram, lockCustomer, type Tx } from '../store.js';

type Data = { orderId: string; code: string; branchCode: string; order: OrderSnap };

export default defineSubscriber({
  id: 'loyalty.order-earn', module: 'loyalty', on: ['pos.order.recorded'],
  handle: async (ctx, evt) => {
    const d = evt.data as Data;
    const customer = d.order?.customer?.id;
    if (!customer || d.order.status !== 'completed') return;
    await ctx.module(async (raw) => {
      const tx = raw as unknown as Tx;
      await lockCustomer(tx, customer);
      if (await entryByRef(tx, 'order', d.orderId, 'earn')) return;
      const program = await latestProgram(tx, d.branchCode);
      if (!program) return;
      const plan = planEarn(program.program, program.storeId, await entriesOf(tx, customer), { ...d.order, id: d.orderId, code: d.code });
      if (!plan) return;
      await insertEntry(tx, ctx.tenantId, {
        id: randomUUID(), partnerCode: customer, kind: 'earn', points: plan.points, at: d.order.createdAt, expiresAt: plan.expiresAt,
        ref: { type: 'order', id: d.orderId, code: d.code }, branchCode: d.branchCode, programVersion: program.version, meta: plan.meta,
      });
    });
  },
});
