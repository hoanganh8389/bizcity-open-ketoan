/**
 * GET /api/v1/m/phieu-ban/reports/customer-docs?from&to&branchCodes&partnerCode — phiếu bán / trả ĐÃ DUYỆT theo khách, có dòng hàng, khuyến
 * mại, voucher (phiếu NT-BH-034). Module pos gọi (ctx.actions.call) để báo cáo khách hàng gộp đơn máy bán + phiếu BH10 mà không đọc bảng
 * của module này. Phạm vi chi nhánh của người xem được áp như báo cáo theo kênh.
 */
// [2026-11-19 Võ Hoàng] NGHIEM-THU — NT-BH-034: action đọc phiếu theo khách cho báo cáo khách hàng (đóng góp)
import { defineAction, z } from '@bizcity/module-sdk';
import { customerDocs } from '../store.js';

const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

export default defineAction({
  id: 'phieu-ban.customer.docs', title: 'Phiếu bán / trả đã duyệt theo khách', tags: ['Phiếu bán nhập tay'],
  permission: 'phieu-ban:read', effect: 'read', idempotency: 'none', errors: ['VALIDATION_ERROR'],
  input: z.object({ from: day.optional(), to: day.optional(), branchCodes: z.string().trim().max(4000).optional(), partnerCode: z.string().trim().max(64).optional() }),
  output: z.object({ docs: z.array(z.record(z.unknown())) }),
  expose: { http: { method: 'GET', path: '/reports/customer-docs' }, mcp: false, ai: 'read' },
  handler: async (ctx, i) => ctx.data.module(async (tx) => {
    let branches = (i.branchCodes ?? '').split(',').map((s) => s.trim()).filter(Boolean);
    const scope = ctx.branchScope;
    if (scope) branches = branches.length ? branches.filter((b) => scope.includes(b)) : [...scope];
    if (scope && !branches.length) return { docs: [] };
    const from = i.from ?? new Date(Date.now() + 7 * 3600_000).toISOString().slice(0, 10);
    return { docs: await customerDocs(tx, { from, to: i.to ?? from, branches, ...(i.partnerCode !== undefined ? { partnerCode: i.partnerCode } : {}) }) };
  }),
});
