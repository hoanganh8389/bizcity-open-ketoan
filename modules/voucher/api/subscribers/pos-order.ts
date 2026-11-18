// [2026-11-18 Võ Hoàng] NGHIEM-THU — NT-BH-026: voucher theo đơn máy bán (đóng góp)
/**
 * Nghe `pos.order.recorded` / `pos.order.cancelled` của module pos:
 * - Đơn HOÀN TẤT: mã khách dùng (order.voucherUses — module pos đã kiểm qua voucher.order.quote + khoá theo mã) → đánh dấu đã dùng ở đơn đó
 *   (số tiền thực trừ; phần dư mất). Mã đã dùng ở nơi khác (cửa sổ giữa hai nơi chưa nhận sự kiện) → nhật ký "dùng trùng", giữ lần đầu.
 *   Mã tự phát "lần mua sau" (order.issuedVouchers — đã in trên bill) → thêm mã gắn SĐT khách.
 * - Huỷ đơn chờ thanh toán: mã đã dùng về "còn"; mã tự phát của đơn (nếu có) thu hồi.
 * Mỗi việc một lần (mã đã dùng ở chính đơn / mã tự phát đã có → bỏ qua): phiên bản sau của đơn, giao lại sự kiện không làm thêm.
 */
import { defineSubscriber } from '@bizcity/module-sdk';
import { activeIssuedBy, insertAuto, markUsed, releaseUsed, revokeCode, type Tx } from '../store.js';

type Use = { code: string; amount: number };
type Issued = { code: string; campaignId: string; phone: string; expiresOn: string | null };
type Data = {
  orderId: string; code: string; branchCode: string;
  order?: { status?: string; businessDate?: string; customer?: { id?: string }; voucherUses?: Use[]; issuedVouchers?: Issued[] };
};

export default defineSubscriber({
  id: 'voucher.pos-order', module: 'voucher', on: ['pos.order.recorded', 'pos.order.cancelled'],
  handle: async (ctx, evt) => {
    const d = evt.data as Data;
    await ctx.module(async (raw) => {
      const tx = raw as unknown as Tx;
      if (evt.type === 'pos.order.cancelled') {
        await releaseUsed(tx, ctx.tenantId, 'pos', d.orderId, `Huỷ đơn ${d.code} chờ thanh toán`);
        for (const code of await activeIssuedBy(tx, d.orderId)) await revokeCode(tx, ctx.tenantId, code, `Huỷ đơn gốc ${d.code}`, 'system', { source: 'pos', refId: d.orderId, refCode: d.code, branch: d.branchCode });
        return;
      }
      const o = d.order;
      if (o?.status !== 'completed') return;
      const date = o.businessDate ?? new Date().toISOString().slice(0, 10);
      for (const u of o.voucherUses ?? []) {
        await markUsed(tx, ctx.tenantId, { code: u.code, source: 'pos', refId: d.orderId, refCode: d.code, branch: d.branchCode, date, amount: Number(u.amount) });
      }
      for (const v of o.issuedVouchers ?? []) {
        await insertAuto(tx, ctx.tenantId, {
          code: v.code, campaignId: v.campaignId, phone: v.phone, partnerCode: o.customer?.id || null, expiresOn: v.expiresOn, orderId: d.orderId, orderCode: d.code, branch: d.branchCode,
        });
      }
    });
  },
});
