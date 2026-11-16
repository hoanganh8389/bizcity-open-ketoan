// [2026-11-15 03:50 PM Võ Hoàng] LOYALTY — NT-BH-020 bước 1: tích điểm khi đơn máy bán ghi sổ (đóng góp)
// [2026-11-15 07:30 PM Võ Hoàng] LOYALTY — NT-BH-020 bước 2: trừ điểm đổi, phát voucher, đánh dấu voucher đã dùng (đóng góp)
/**
 * Nghe `pos.order.recorded` (đơn mới và mọi phiên bản sau: xác nhận QR, chuyển bill Z…). Đơn HOÀN TẤT:
 * 1. Voucher khách dùng (order.usedVouchers) → đánh dấu đã dùng; đơn khác đã dùng trước → ghi chú ở voucher (dùng trùng hai máy).
 * 2. Có khách và đổi điểm (order.loyalty.rewards — module pos đã hỏi loyalty.redeem.quote lúc nhận đơn) → một dòng đổi, trừ lô hết
 *    hạn sớm nhất trước (thiếu thì trừ phần còn, ghi chú); phát voucher của phần thưởng loại voucher (mã đã in trên bill).
 * 3. Có khách → một dòng tích theo chính sách mới nhất của chi nhánh (hạng theo tổng điểm đã tích trước đơn).
 * Mỗi việc một lần theo đơn (khoá ref order + loại dòng / mã voucher): phiên bản sau, giao lại không làm thêm.
 */
import { randomUUID } from 'node:crypto';
import { defineSubscriber } from '@bizcity/module-sdk';
import { planRedeem, type QuotedReward } from '../domain/redeem.js';
import { planEarn, type OrderSnap } from '../domain/settle.js';
import { entriesOf, entryByRef, insertEntry, insertVoucher, latestProgram, lockCustomer, markVoucherUsed, type Tx } from '../store.js';

type Snap = OrderSnap & { usedVouchers?: string[]; loyalty?: { rewards?: QuotedReward[] } };
type Data = { orderId: string; code: string; branchCode: string; order: Snap };

export default defineSubscriber({
  id: 'loyalty.order-earn', module: 'loyalty', on: ['pos.order.recorded'],
  handle: async (ctx, evt) => {
    const d = evt.data as Data;
    if (d.order?.status !== 'completed') return;
    const customer = d.order.customer?.id;
    await ctx.module(async (raw) => {
      const tx = raw as unknown as Tx;
      const at = d.order.createdAt;
      for (const code of d.order.usedVouchers ?? []) await markVoucherUsed(tx, code, { id: d.orderId, code: d.code, at });
      if (!customer) return;
      await lockCustomer(tx, customer);

      const rewards = d.order.loyalty?.rewards ?? [];
      if (rewards.length && !(await entryByRef(tx, 'order', d.orderId, 'redeem'))) {
        const need = rewards.reduce((t, r) => t + r.points, 0);
        const plan = planRedeem(await entriesOf(tx, customer), need, at);
        if (plan) {
          await insertEntry(tx, ctx.tenantId, {
            id: randomUUID(), partnerCode: customer, kind: 'redeem', points: -plan.points, at, allocations: plan.allocations,
            ref: { type: 'order', id: d.orderId, code: d.code }, branchCode: d.branchCode,
            meta: { rewards: rewards.map((r) => ({ index: r.index, kind: r.kind, points: r.points, ...(r.sku ? { sku: r.sku, quantity: r.quantity } : {}), ...(r.voucher ? { voucher: r.voucher.code } : {}) })) },
            ...(plan.note ? { note: plan.note } : {}),
          });
        }
        for (const r of rewards) {
          if (r.kind !== 'voucher' || !r.voucher) continue;
          await insertVoucher(tx, ctx.tenantId, {
            code: r.voucher.code, partnerCode: customer, name: r.voucher.name, discountType: r.voucher.discountType, discountValue: r.voucher.discountValue,
            maxDiscount: r.voucher.maxDiscount, minOrderAmount: r.voucher.minOrderAmount, expiresAt: r.voucher.expiresAt, rewardIndex: r.index,
            orderId: d.orderId, orderCode: d.code,
          });
        }
      }

      if (await entryByRef(tx, 'order', d.orderId, 'earn')) return;
      const program = await latestProgram(tx, d.branchCode);
      if (!program) return;
      // Hạng theo tổng điểm ĐÃ TÍCH trước đơn: dòng đổi vừa ghi không làm giảm tổng đã tích (chỉ đếm tích / hoàn).
      const plan = planEarn(program.program, program.storeId, await entriesOf(tx, customer), { ...d.order, id: d.orderId, code: d.code });
      if (!plan) return;
      await insertEntry(tx, ctx.tenantId, {
        id: randomUUID(), partnerCode: customer, kind: 'earn', points: plan.points, at, expiresAt: plan.expiresAt,
        ref: { type: 'order', id: d.orderId, code: d.code }, branchCode: d.branchCode, programVersion: program.version, meta: plan.meta,
      });
    });
  },
});
