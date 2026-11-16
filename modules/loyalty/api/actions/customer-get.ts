// [2026-11-15 03:45 PM Võ Hoàng] LOYALTY — NT-BH-020 bước 1: điểm của khách cho máy bán (đóng góp)
/** GET /api/v1/m/loyalty/customers/:id?branch= — số dư, điểm dùng được, hạng, lô, lịch sử (khuôn CustomerLoyalty). id = mã khách. */
import { defineAction, z } from '@bizcity/module-sdk';
import { customerLoyalty } from '../domain/settle.js';
import { entriesOf, latestProgram, vouchersOf } from '../store.js';

export default defineAction({
  id: 'loyalty.customer.get', title: 'Điểm thành viên của khách', tags: ['Điểm thành viên'],
  permission: 'loyalty:read', effect: 'read', idempotency: 'none',
  input: z.object({ id: z.string().trim().min(1).max(64), branch: z.string().trim().max(32).optional() }),
  output: z.record(z.unknown()),
  expose: { http: { method: 'GET', path: '/customers/:id' }, mcp: false, ai: 'read' },
  handler: async (ctx, { id, branch }) => ctx.data.module(async (tx) => {
    const program = branch ? await latestProgram(tx, branch) : null;
    const now = new Date().toISOString();
    // Voucher còn dùng được của khách (NT-BH-020 bước 2): máy bán hiện ở khung điểm, bấm Dùng.
    const vouchers = (await vouchersOf(tx, id)).filter((v) => v.status === 'active' && (!v.expiresAt || v.expiresAt > now))
      .map((v) => ({ code: v.code, name: v.name, customerId: v.partnerCode, discountType: v.discountType, discountValue: v.discountValue, maxDiscount: v.maxDiscount, minOrderAmount: v.minOrderAmount, expiresAt: v.expiresAt, status: v.status }));
    return { ...customerLoyalty(program?.program ?? null, id, await entriesOf(tx, id), now), vouchers };
  }),
});
