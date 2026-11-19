/**
 * GET /api/v1/m/pos/reports/customers?from&to&branchCodes&channels&groupBy — báo cáo khách hàng (phiếu NT-BH-034 §2 B): khách × kỳ × cửa
 * hàng — số đơn, tiền hàng, giảm giá, thực trả, trả hàng, voucher đã dùng, điểm tích / đổi, quà đã nhận (số lượng, giá trị theo giá bán),
 * cửa hàng đã mua. Gộp đơn máy bán + phiếu bán BH10 (module phieu-ban gửi qua action đọc). Phạm vi chi nhánh của người xem như báo cáo
 * theo kênh. Màn xuất Excel từ bảng (DataGrid).
 */
// [2026-11-19 Võ Hoàng] NGHIEM-THU — NT-BH-034: báo cáo khách hàng (đóng góp)
import { defineAction, z } from '@bizcity/module-sdk';
import { customerFilter, customerPurchases } from '../customer-report.js';
import { customerReport, customerTotals } from '../domain/customer-report.js';

const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

export default defineAction({
  id: 'pos.report.customers', title: 'Báo cáo khách hàng', tags: ['Báo cáo bán lẻ'],
  permission: 'pos:report', effect: 'read', idempotency: 'none',
  errors: ['VALIDATION_ERROR'],
  input: z.object({
    from: day.optional(), to: day.optional(), branchCodes: z.string().max(4000).optional(), channels: z.string().max(2000).optional(),
    groupBy: z.enum(['range', 'month']).optional(),
  }),
  output: z.array(z.record(z.unknown())),
  expose: { http: { method: 'GET', path: '/reports/customers' }, mcp: true, ai: 'read' },
  handler: async (ctx, i) => {
    const f = customerFilter(ctx, i);
    const { purchases, meta } = await customerPurchases(ctx, f);
    const rows = customerReport(purchases, { groupBy: i.groupBy ?? 'range', from: f.from, to: f.to });
    ctx.meta('totals', customerTotals(rows));
    ctx.meta('phieuBan', meta.phieuBan);
    ctx.meta('voucher', meta.voucher);
    ctx.meta('loyalty', meta.loyalty);
    ctx.meta('from', f.from);
    ctx.meta('to', f.to);
    return rows;
  },
});
