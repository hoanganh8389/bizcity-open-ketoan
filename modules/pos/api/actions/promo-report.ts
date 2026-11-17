/**
 * GET /api/v1/m/pos/promo/report?from&to&branches&key — báo cáo khuyến mại đã dùng: chương trình × cửa hàng × kỳ — số đơn áp, đơn đã trả lượt,
 * tiền giảm, số quà, lượt đang dùng / hạn mức / còn (máy bán + phiếu bán BH10).
 */
// [2026-11-18 Võ Hoàng] NGHIEM-THU — NT-BH-025: action chương trình khuyến mại (đóng góp)
import { defineAction, z } from '@bizcity/module-sdk';
import { branchList } from '../admin.js';
import { promoReport } from '../promo.js';
import { todayVn } from '../read.js';

export default defineAction({
  id: 'pos.promo.report', title: 'Báo cáo khuyến mại đã dùng', tags: ['Chương trình khuyến mại'],
  permission: 'pos:report', effect: 'read', idempotency: 'none',
  errors: ['VALIDATION_ERROR'],
  input: z.object({ from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(), to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(), branches: z.string().max(4000).optional(), key: z.string().trim().max(64).optional() }),
  output: z.array(z.record(z.unknown())),
  expose: { http: { method: 'GET', path: '/promo/report' }, mcp: false, ai: 'read' },
  handler: async (ctx, i) => ctx.data.module((tx) => {
    const from = i.from ?? todayVn();
    return promoReport(tx, { from, to: i.to ?? from, branches: branchList(i.branches), ...(i.key ? { key: i.key } : {}) });
  }),
});
