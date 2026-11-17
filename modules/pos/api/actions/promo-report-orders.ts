/** GET /api/v1/m/pos/promo/report/orders?key&branch&from&to — đơn máy bán / phiếu bán đã áp một chương trình ở một cửa hàng trong kỳ. */
// [2026-11-18 Võ Hoàng] NGHIEM-THU — NT-BH-025: action chương trình khuyến mại (đóng góp)
import { defineAction, z } from '@bizcity/module-sdk';
import { promoReportOrders } from '../promo.js';
import { todayVn } from '../read.js';

export default defineAction({
  id: 'pos.promo.report-orders', title: 'Đơn đã áp một chương trình khuyến mại', tags: ['Chương trình khuyến mại'],
  permission: 'pos:report', effect: 'read', idempotency: 'none',
  errors: ['VALIDATION_ERROR'],
  input: z.object({ key: z.string().trim().max(64).default(''), branch: z.string().trim().max(32).default(''), from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(), to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional() }),
  output: z.array(z.record(z.unknown())),
  expose: { http: { method: 'GET', path: '/promo/report/orders' }, mcp: false, ai: 'read' },
  handler: async (ctx, i) => ctx.data.module(async (tx) => {
    if (!i.key || !i.branch) return [];
    const from = i.from ?? todayVn();
    return promoReportOrders(tx, { key: i.key, branch: i.branch, from, to: i.to ?? from });
  }),
});
