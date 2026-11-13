/**
 * GET /api/v1/m/pos/reports/dashboard?from&to&branch — tổng quan bán hàng của chi nhánh (mặc định hôm nay): số đơn, doanh thu, trả
 * hàng, thuần; theo hình thức, nguồn bán, giờ; mặt hàng bán chạy (phiếu NT-BH-007). Khuyến mại: chưa có ở module (byPromotion rỗng).
 */
import { defineAction, z } from '@bizcity/module-sdk';
import { resolveBranch, todayVn } from '../read.js';
import { salesDashboard } from '../shifts.js';

const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const SALE_SOURCES: Record<string, string> = { tai_quay: 'Tại quầy' };

export default defineAction({
  id: 'pos.report.dashboard', title: 'Tổng quan bán hàng máy POS của chi nhánh', tags: ['Máy bán POS'],
  permission: 'pos:sell', effect: 'read', idempotency: 'none',
  errors: ['VALIDATION_ERROR'],
  input: z.object({ from: day.optional(), to: day.optional(), branch: z.string().trim().max(32).optional() }),
  output: z.record(z.unknown()),
  expose: { http: { method: 'GET', path: '/reports/dashboard' }, mcp: false, ai: 'read' },
  handler: async (ctx, { from, to, branch }) => ctx.data.module(async (tx) => {
    const f = from ?? todayVn();
    return salesDashboard(tx, (await resolveBranch(tx, branch || undefined)).code, f, to ?? f, SALE_SOURCES);
  }),
});
