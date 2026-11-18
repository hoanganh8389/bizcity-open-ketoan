// [2026-11-18 Võ Hoàng] NGHIEM-THU — NT-BH-025: lượt khuyến mại của phiếu bán BH10 tính chung hạn mức với máy bán (đóng góp)
/**
 * Nghe `phieu-ban.doc.recorded` / `phieu-ban.doc.cancelled` của module phieu-ban: phiếu BÁN đã duyệt có dòng mang chương trình khuyến mại
 * → ghi lượt dùng (mod_pos.promo_uses, source phieu-ban) để hạn mức lượt theo cửa hàng đếm chung máy bán + phiếu bán; bỏ duyệt → trả lượt.
 * Ghi sau commit (outbox): phiếu bán đã kiểm lượt còn lúc duyệt (pos.promo.quota) — cửa sổ nhỏ giữa duyệt và lúc nhận sự kiện chấp nhận.
 * Phiếu trả hàng BH11 (NT-BH-030 Q4): trả hết hàng bán của phiếu gốc (module phieu-ban báo originalFullyReturned) → trả lượt của phiếu gốc
 * như máy bán trả cả đơn; trả một phần không trả lượt. Bỏ duyệt phiếu trả đó → lấy lại lượt (lượt đã trả vì phiếu trả).
 */
// [2026-11-18 Võ Hoàng] NGHIEM-THU — NT-BH-030 Q4: BH11 trả cả phiếu bán gốc → trả lượt khuyến mại có hạn mức (đóng góp)
import { defineSubscriber } from '@bizcity/module-sdk';
import { usesOf } from '../domain/promo.js';
import { recordUses, releaseUses, restoreReturnedUses, type Tx } from '../promo.js';

type Line = { isGift?: boolean; qty: number; discount?: number; policyRef?: { key: string } };
type Data = {
  docId: string; kind: string; branchCode: string; doc?: { docNo?: string; docDate?: string; lines?: Line[] };
  /** Phiếu trả: phiếu bán gốc của module phieu-ban; originalFullyReturned = sau phiếu trả này hàng bán của phiếu gốc đã trả hết. */
  originalDocId?: string; originalFullyReturned?: boolean;
};

export default defineSubscriber({
  id: 'pos.promo-use-phieu-ban', module: 'pos', on: ['phieu-ban.doc.recorded', 'phieu-ban.doc.cancelled'],
  handle: async (ctx, evt) => {
    const d = evt.data as Data;
    if (d.kind === 'sale_return') {
      if (!d.originalDocId) return;
      const orig = d.originalDocId;
      await ctx.module(async (raw) => {
        const tx = raw as unknown as Tx;
        if (evt.type === 'phieu-ban.doc.recorded') {
          if (d.originalFullyReturned) await releaseUses(tx, 'phieu-ban', orig, 'return');
          return;
        }
        await restoreReturnedUses(tx, 'phieu-ban', orig);
      });
      return;
    }
    if (d.kind !== 'sale') return;
    await ctx.module(async (raw) => {
      const tx = raw as unknown as Tx;
      if (evt.type === 'phieu-ban.doc.cancelled') return releaseUses(tx, 'phieu-ban', d.docId, 'unapprove');
      const uses = usesOf(d.doc?.lines ?? []);
      if (!uses.length || !d.doc?.docDate) return;
      await recordUses(tx, ctx.tenantId, { source: 'phieu-ban', refId: d.docId, refCode: d.doc.docNo ?? '', branch: d.branchCode, date: d.doc.docDate, uses });
    });
  },
});
