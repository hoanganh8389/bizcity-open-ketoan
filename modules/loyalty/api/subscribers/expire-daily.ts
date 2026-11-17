// [2026-11-16 10:30 AM Võ Hoàng] LOYALTY — NT-BH-020 bước 3: hết hạn lô điểm hằng ngày (đóng góp)
/**
 * Nghe `bizcity.clock.daily` (01:00 giờ Việt Nam, mỗi đơn vị một lần mỗi ngày): mỗi lô đã quá hạn còn điểm → một dòng hết hạn
 * = −phần còn (luật expireDue của sổ lô). Khoá theo lô (ref manual `expire:<lô>`): giao lại / chạy lại không ghi thêm. Không hạch
 * toán (điểm chỉ hạch toán lúc đổi — NT-BH-020 Q1).
 */
import { randomUUID } from 'node:crypto';
import { defineSubscriber } from '@bizcity/module-sdk';
import { expireDue } from '../domain/ledger.js';
import { entriesOf, insertEntry, lockCustomer, partnersWithDueLots, type Tx } from '../store.js';

export default defineSubscriber({
  id: 'loyalty.expire-daily', module: 'loyalty', on: ['bizcity.clock.daily'],
  handle: async (ctx, evt) => {
    const now = String((evt.data as { at?: string }).at ?? new Date().toISOString());
    await ctx.module(async (raw) => {
      const tx = raw as unknown as Tx;
      for (const code of await partnersWithDueLots(tx, now)) {
        await lockCustomer(tx, code);
        for (const e of expireDue(await entriesOf(tx, code), now, randomUUID)) {
          const lot = e.allocations![0]!.lotId;
          await insertEntry(tx, ctx.tenantId, {
            id: e.id, partnerCode: code, kind: 'expire', points: e.points, at: now, allocations: e.allocations!,
            ref: { type: 'manual', id: `expire:${lot}` }, ...(e.note ? { note: e.note } : {}),
          });
        }
      }
    });
  },
});
