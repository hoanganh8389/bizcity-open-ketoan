// [2026-11-15 07:20 PM Võ Hoàng] LOYALTY — NT-BH-020 bước 2: máy bán tra voucher đổi điểm theo mã (đóng góp)
/** GET /api/v1/m/loyalty/vouchers/:code — voucher đổi điểm (khuôn LoyaltyVoucher của máy bán); đã dùng / hết hạn vẫn trả kèm trạng thái. */
import { Errors, defineAction, z } from '@bizcity/module-sdk';
import { voucherByCode } from '../store.js';

export default defineAction({
  id: 'loyalty.voucher.get', title: 'Tra voucher đổi điểm', tags: ['Điểm thành viên'],
  permission: 'loyalty:read', effect: 'read', idempotency: 'none', errors: ['NOT_FOUND'],
  input: z.object({ code: z.string().trim().min(1).max(64) }),
  output: z.record(z.unknown()),
  expose: { http: { method: 'GET', path: '/vouchers/:code' }, mcp: false, ai: 'read' },
  handler: async (ctx, { code }) => ctx.data.module(async (tx) => {
    const v = await voucherByCode(tx, code);
    if (!v) throw Errors.notFound(`Không có voucher ${code.toUpperCase()}`);
    return {
      code: v.code, name: v.name, customerId: v.partnerCode, discountType: v.discountType, discountValue: v.discountValue, maxDiscount: v.maxDiscount,
      minOrderAmount: v.minOrderAmount, expiresAt: v.expiresAt, status: v.status, ...(v.usedOrderCode ? { usedOrderCode: v.usedOrderCode } : {}),
    };
  }),
});
