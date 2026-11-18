/**
 * GET /api/v1/m/voucher/customer?phone&customer&skus=A,B&total&refId — voucher còn hạn của khách cho máy bán chọn ở bước thanh toán (và kiểm
 * một mã khách đọc: `code`). Mỗi mã kèm mệnh giá, người phát (TGS = chiết khấu, hãng = dòng thanh toán theo hình thức), mã hàng trong giỏ
 * được trừ, và lý do không dùng được với giỏ này (đơn tối thiểu, giỏ không có sản phẩm / nhãn áp dụng…). Máy chủ kiểm lại khi nhận đơn.
 */
// [2026-11-18 Võ Hoàng] NGHIEM-THU — NT-BH-026: action voucher (đóng góp)
import { defineAction, z } from '@bizcity/module-sdk';
import { checkCode, normalizeCode, normalizePhone } from '../domain/voucher.js';
import { campaignsByIds, cartOf, codesByCode, listCodes, phonesOf } from '../store.js';
import { todayVn } from '../today.js';

export default defineAction({
  id: 'voucher.customer.available', title: 'Voucher còn hạn của khách (máy bán)', tags: ['Voucher'],
  permission: 'voucher:use', effect: 'read', idempotency: 'none',
  errors: ['VALIDATION_ERROR'],
  input: z.object({
    phone: z.string().trim().max(20).optional(), customer: z.string().trim().max(64).optional(), code: z.string().trim().max(64).optional(),
    skus: z.string().trim().max(4000).default(''), total: z.coerce.number().nonnegative().default(0), refId: z.string().trim().max(64).default(''),
  }),
  output: z.array(z.record(z.unknown())),
  expose: { http: { method: 'GET', path: '/customer' }, mcp: false, ai: 'read' },
  handler: async (ctx, i) => ctx.data.module(async (tx) => {
    const today = todayVn();
    const phones = await phonesOf(tx, i.customer, i.phone);
    const cart = await cartOf(tx, i.skus.split(',').map((s) => s.trim()).filter(Boolean).map((sku) => ({ sku, qty: 1, amount: 1 })));
    const rows = i.code
      ? [...(await codesByCode(tx, [normalizeCode(i.code)])).values()]
      : (await Promise.all([...phones].map((p) => listCodes(tx, { phone: p, status: 'active', today, limit: 200 })))).flat();
    const camps = await campaignsByIds(tx, rows.map((r) => r.campaignId));
    const phone = normalizePhone(i.phone);
    return rows.map((row) => {
      const c = camps.get(row.campaignId)!;
      const r = checkCode(row.code, row, c, { phones, customerCode: i.customer ?? null, refId: i.refId || '-', date: today, orderTotal: i.total, cart });
      return {
        code: row.code, campaignId: c.id, campaignCode: c.code, campaignName: c.name, kind: c.kind, issuer: c.issuer, paymentMethodCode: c.paymentMethodCode,
        faceValue: c.faceValue, minOrder: c.minOrder, expiresOn: row.expiresOn, phone: row.phone === phone ? row.phone : undefined,
        ...('problem' in r ? { usable: false, reason: r.problem.reason, message: r.problem.message } : { usable: true, applicableSkus: r.applicableSkus }),
      };
    });
  }),
});
