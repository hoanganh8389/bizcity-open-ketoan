/**
 * GET /api/v1/m/pos/reports/customer-detail?customer&from&to&branchCodes&channels — từng lần mua / trả của một khách (phiếu NT-BH-034 §2 B):
 * mặt hàng, đơn giá, số lượng, khuyến mại, voucher, điểm, quà. `customer` trống = khách lẻ. Gồm đơn máy bán và phiếu bán BH10.
 */
// [2026-11-19 Võ Hoàng] NGHIEM-THU — NT-BH-034: chi tiết từng lần mua của khách (đóng góp)
import { defineAction, z } from '@bizcity/module-sdk';
import { customerFilter, customerPurchases } from '../customer-report.js';

const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

export default defineAction({
  id: 'pos.report.customer-detail', title: 'Báo cáo khách hàng — từng lần mua', tags: ['Báo cáo bán lẻ'],
  permission: 'pos:report', effect: 'read', idempotency: 'none',
  errors: ['VALIDATION_ERROR'],
  input: z.object({
    customer: z.string().trim().max(64).default(''), from: day.optional(), to: day.optional(), branchCodes: z.string().max(4000).optional(),
    channels: z.string().max(2000).optional(),
  }),
  output: z.array(z.record(z.unknown())),
  expose: { http: { method: 'GET', path: '/reports/customer-detail' }, mcp: false, ai: 'read' },
  handler: async (ctx, i) => {
    const f = customerFilter(ctx, i);
    const { purchases, meta } = await customerPurchases(ctx, { ...f, customer: i.customer });
    ctx.meta('phieuBan', meta.phieuBan);
    ctx.meta('voucher', meta.voucher);
    ctx.meta('loyalty', meta.loyalty);
    return purchases;
  },
});
