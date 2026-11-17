// [2026-11-18 Võ Hoàng] NGHIEM-THU — NT-BH-026: voucher dùng ở phiếu bán nhập tay BH10 (đóng góp)
/**
 * Nghe `phieu-ban.doc.recorded` / `phieu-ban.doc.cancelled`: phiếu BÁN đã duyệt có voucher (doc.vouchers — module phieu-ban đã kiểm qua
 * voucher.order.quote + khoá theo mã lúc duyệt) → đánh dấu đã dùng ở phiếu đó; bỏ duyệt → mã về "còn".
 */
import { defineSubscriber } from '@bizcity/module-sdk';
import { markUsed, releaseUsed, type Tx } from '../store.js';

type Data = { docId: string; kind: string; branchCode: string; doc?: { docNo?: string; docDate?: string; vouchers?: { code: string; amount: number }[] } };

export default defineSubscriber({
  id: 'voucher.phieu-ban-doc', module: 'voucher', on: ['phieu-ban.doc.recorded', 'phieu-ban.doc.cancelled'],
  handle: async (ctx, evt) => {
    const d = evt.data as Data;
    if (d.kind !== 'sale') return;
    await ctx.module(async (raw) => {
      const tx = raw as unknown as Tx;
      if (evt.type === 'phieu-ban.doc.cancelled') {
        await releaseUsed(tx, ctx.tenantId, 'phieu-ban', d.docId, 'Bỏ duyệt phiếu bán');
        return;
      }
      for (const v of d.doc?.vouchers ?? []) {
        await markUsed(tx, ctx.tenantId, {
          code: v.code, source: 'phieu-ban', refId: d.docId, refCode: d.doc?.docNo ?? '', branch: d.branchCode, date: d.doc?.docDate ?? new Date().toISOString().slice(0, 10), amount: Number(v.amount),
        });
      }
    });
  },
});
