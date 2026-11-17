// [2026-11-18 Võ Hoàng] NGHIEM-THU — NT-BH-026: trả hàng đơn gốc → thu hồi voucher lần mua sau chưa dùng (đóng góp)
/**
 * Nghe `pos.return.recorded`: phiếu trả làm đơn gốc trả hết (module pos báo `orderFullyReturned`) → mã tự phát "lần mua sau" của đơn đó chưa
 * dùng bị thu hồi (Q6). Mã đã dùng thì giữ (ghi chú ở nhật ký). Trả một phần: chưa thu hồi (điều kiện tự phát tính trên cả đơn).
 */
import { defineSubscriber } from '@bizcity/module-sdk';
import { activeIssuedBy, revokeCode, type Tx } from '../store.js';

type Data = { returnId: string; code: string; orderId: string; orderCode: string; branchCode: string; orderFullyReturned?: boolean };

export default defineSubscriber({
  id: 'voucher.pos-return', module: 'voucher', on: ['pos.return.recorded'],
  handle: async (ctx, evt) => {
    const d = evt.data as Data;
    if (!d.orderFullyReturned) return;
    await ctx.module(async (raw) => {
      const tx = raw as unknown as Tx;
      for (const code of await activeIssuedBy(tx, d.orderId)) {
        await revokeCode(tx, ctx.tenantId, code, `Trả hàng đơn gốc ${d.orderCode} (phiếu ${d.code})`, 'system', { source: 'pos', refId: d.returnId, refCode: d.code, branch: d.branchCode });
      }
    });
  },
});
