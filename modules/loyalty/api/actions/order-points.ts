// [2026-11-19 Võ Hoàng] NGHIEM-THU — NT-BH-034: action đọc điểm theo đơn cho báo cáo khách hàng (đóng góp)
/**
 * GET /api/v1/m/loyalty/reports/order-points?from&to&branchCodes&partnerCode — điểm tích / đổi của từng đơn máy bán (sổ điểm, ngày theo giờ
 * Việt Nam). Module pos gọi (ctx.actions.call) để báo cáo khách hàng có cột điểm mà không đọc bảng của module này.
 */
import { Errors, defineAction, z } from '@bizcity/module-sdk';
import { orderPoints } from '../store.js';

const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Ngày dạng YYYY-MM-DD');
const vnStart = (d: string) => new Date(`${d}T00:00:00+07:00`).toISOString();

export default defineAction({
  id: 'loyalty.order.points', title: 'Điểm tích / đổi theo đơn', tags: ['Điểm thành viên'],
  permission: 'loyalty:read', effect: 'read', idempotency: 'none', errors: ['VALIDATION_ERROR'],
  input: z.object({ from: day.optional(), to: day.optional(), branchCodes: z.string().trim().max(4000).optional(), partnerCode: z.string().trim().max(64).optional() }),
  output: z.object({ items: z.array(z.record(z.unknown())) }),
  expose: { http: { method: 'GET', path: '/reports/order-points' }, mcp: false, ai: 'read' },
  handler: async (ctx, i) => ctx.data.module(async (tx) => {
    // Không gửi ngày = hôm nay (giờ Việt Nam).
    const from = i.from ?? new Date(Date.now() + 7 * 3600_000).toISOString().slice(0, 10);
    const to = i.to ?? from;
    if (from > to) throw Errors.validation('Từ ngày phải trước đến ngày', { field: 'from' });
    let branches = (i.branchCodes ?? '').split(',').map((s) => s.trim()).filter(Boolean);
    const scope = ctx.branchScope;
    if (scope) branches = branches.length ? branches.filter((b) => scope.includes(b)) : [...scope];
    if (scope && !branches.length) return { items: [] };
    const end = new Date(Date.parse(vnStart(to)) + 86_400_000).toISOString();
    return { items: await orderPoints(tx, { from: vnStart(from), to: end, branches, ...(i.partnerCode ? { partnerCode: i.partnerCode } : {}) }) };
  }),
});
