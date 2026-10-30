// @bizcity-layer D modules/ban-hang
/**
 * Báo cáo bán hàng.
 *   GET /api/v1/reports/sales-detail      Báo cáo bán hàng (chi tiết từng dòng hàng, phân trang)
 *   GET /api/v1/reports/sales-summary     Tổng hợp bán hàng (groupBy: document|day|month|branch|product|customer|taxCode)
 *   GET /api/v1/reports/sales-payments    Thu tiền theo hình thức thanh toán (groupBy: day|branch)
 *   GET /api/v1/reports/sales-receipts    Báo cáo thu tiền bán hàng (từng phiếu thu / trả tiền khách)
 *
 * Tham số chung: from, to (YYYY-MM-DD), branchCodes (cách nhau dấu phẩy),
 *   kind  = all | sale | return        (cả hai / chỉ bán / chỉ trả lại)
 *   scope = all | invoiced | internal  (mọi chứng từ / chỉ chứng từ có hoá đơn / chỉ chứng từ không có hoá đơn)
 */
import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { authOf, requirePermission } from '../../core/auth.js';
import { ok, pageMeta, pageQuerySchema } from '../../core/http.js';
import { SALES_GROUPS } from './sales-report.repository.js';
import { salesReportService } from './sales-report.service.js';

const tags = ['Báo cáo bán hàng'];
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Ngày dạng YYYY-MM-DD');
const branchCodes = z
  .string()
  .optional()
  .transform((s) => (s ? s.split(',').map((x) => x.trim()).filter(Boolean) : undefined));

export const salesQuerySchema = z.object({
  from: date,
  to: date,
  branchCodes,
  kind: z.enum(['all', 'sale', 'return']).default('all'),
  scope: z.enum(['all', 'invoiced', 'internal']).default('all'),
  search: z.string().trim().max(100).optional(),
});
export const salesSummaryQuerySchema = salesQuerySchema.extend({ groupBy: z.enum(SALES_GROUPS).default('document') });
export const salesPaymentsQuerySchema = z.object({ from: date, to: date, branchCodes, groupBy: z.enum(['day', 'branch']).default('day') });

export async function salesReportRoutes(app: FastifyInstance): Promise<void> {
  const r = app.withTypeProvider<ZodTypeProvider>();
  const pre = requirePermission('reports:read');

  r.get('/api/v1/reports/sales-detail', {
    preHandler: pre,
    schema: { tags, summary: 'Báo cáo bán hàng chi tiết theo dòng hàng', querystring: salesQuerySchema.merge(pageQuerySchema) },
    handler: async (req) => {
      const data = await salesReportService.detail(authOf(req), req.query);
      return ok({ rows: data.rows, totals: data.totals }, pageMeta(req.query, data.total));
    },
  });

  r.get('/api/v1/reports/sales-summary', {
    preHandler: pre,
    schema: { tags, summary: 'Tổng hợp bán hàng theo ngày, tháng, chi nhánh, mặt hàng, khách hàng, loại thuế', querystring: salesSummaryQuerySchema },
    handler: async (req) => ok(await salesReportService.summary(authOf(req), req.query)),
  });

  r.get('/api/v1/reports/sales-receipts', {
    preHandler: pre,
    schema: { tags, summary: 'Báo cáo thu tiền bán hàng: từng phiếu thu, phiếu bán được thanh toán', querystring: z.object({ from: date, to: date, branchCodes }) },
    handler: async (req) => ok(await salesReportService.receipts(authOf(req), req.query)),
  });

  r.get('/api/v1/reports/sales-payments', {
    preHandler: pre,
    schema: { tags, summary: 'Thu tiền theo hình thức thanh toán', querystring: salesPaymentsQuerySchema },
    handler: async (req) => ok(await salesReportService.payments(authOf(req), req.query)),
  });
}
