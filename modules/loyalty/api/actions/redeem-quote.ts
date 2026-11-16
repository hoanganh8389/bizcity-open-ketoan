// [2026-11-15 07:20 PM Võ Hoàng] LOYALTY — NT-BH-020 bước 2: module pos hỏi trước khi nhận đơn đổi điểm / dùng voucher (đóng góp)
/**
 * Action đọc `loyalty.redeem.quote` — module pos gọi chéo (ctx.actions.call, quyền của thu ngân `loyalty:read`) lúc nhận đơn có khách
 * hoặc có voucher: phần thưởng đổi được không, cần bao nhiêu điểm, quà gì, voucher sẽ phát (mã định theo đơn); voucher khách dùng giảm
 * bao nhiêu; điểm đơn này dự kiến tích (in bill). Không ghi gì: trừ điểm / phát / đánh dấu voucher làm khi nhận sự kiện đơn đã ghi
 * sổ. Chi nhánh chưa có chính sách → enabled = false (máy bán vẫn bán, không đổi được). Không mở HTTP: chỉ module gọi chéo.
 */
import { defineAction, z } from '@bizcity/module-sdk';
import { balanceOf } from '../domain/ledger.js';
import { quoteRedeem, voucherDiscount } from '../domain/redeem.js';
import { planEarn } from '../domain/settle.js';
import { entriesOf, latestProgram, voucherByCode } from '../store.js';

export default defineAction({
  id: 'loyalty.redeem.quote', title: 'Báo giá đổi điểm / voucher cho một đơn máy bán', tags: ['Điểm thành viên'],
  permission: 'loyalty:read', effect: 'read', idempotency: 'none',
  input: z.object({
    customer: z.string().trim().max(64).optional(), branch: z.string().trim().min(1).max(32), orderId: z.string().trim().min(1).max(64),
    orderTotal: z.number().nonnegative(), items: z.array(z.object({ sku: z.string(), qty: z.number() })).max(500).default([]),
    redeem: z.array(z.string().max(120)).max(50).default([]), voucher: z.string().trim().max(64).optional(),
  }),
  output: z.record(z.unknown()),
  expose: { mcp: false, ai: 'deny' },
  handler: async (ctx, i) => ctx.data.module(async (tx) => {
    const now = new Date().toISOString();
    const program = await latestProgram(tx, i.branch);
    const history = i.customer ? await entriesOf(tx, i.customer) : [];
    const problems: string[] = [];
    let voucher: { code: string; name: string; amount: number } | undefined;
    if (i.voucher) {
      const v = await voucherByCode(tx, i.voucher);
      const amount = v ? voucherDiscount(v, { cartTotal: i.orderTotal, ...(i.customer ? { customer: i.customer } : {}), now }) : `Không có voucher ${i.voucher.toUpperCase()}`;
      if (typeof amount === 'string') problems.push(amount);
      else voucher = { code: v!.code, name: v!.name, amount };
    }
    if (!program) {
      if (i.redeem.length) problems.push(`Cửa hàng ${i.branch} chưa có chính sách tích điểm — không đổi điểm được`);
      return { enabled: false, problems, ...(voucher ? { voucher } : {}), rewards: [], points: 0, earned: 0 };
    }
    if (i.redeem.length && !i.customer) problems.push('Đổi điểm phải chọn khách thành viên');
    const quote = quoteRedeem(program.program, history, { orderId: i.orderId, orderTotal: i.orderTotal, redeem: i.customer ? i.redeem : [], storeId: program.storeId, now });
    const payable = i.orderTotal - (voucher?.amount ?? 0);
    const earn = i.customer
      ? planEarn(program.program, program.storeId, history, {
          id: i.orderId, code: '', status: 'completed', total: payable, createdAt: now, customer: { id: i.customer },
          lines: i.items.map((x) => ({ sku: x.sku, unitQty: x.qty, unitRatio: 1 })),
        })
      : null;
    return {
      enabled: true, programVersion: program.version, tierKey: quote.tierKey, tierName: quote.tierName,
      balance: balanceOf(history), available: quote.available, rewards: quote.rewards, points: quote.points,
      earned: earn?.points ?? 0, ...(voucher ? { voucher } : {}), problems: [...problems, ...quote.problems],
    };
  }),
});
