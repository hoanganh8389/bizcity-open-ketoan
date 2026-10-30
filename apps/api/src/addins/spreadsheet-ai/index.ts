// @bizcity-layer A adapters/cell
/**
 * Add-in "Bảng tính AI": khung tích hợp ứng dụng bảng tính có AI chạy riêng
 * (dịch vụ độc lập, nhúng vào giao diện kế toán).
 *
 *   GET /api/v1/addins/spreadsheet-ai/config   → địa chỉ ứng dụng bảng tính để giao diện nhúng
 *   GET /api/v1/addins/spreadsheet-ai/dataset  → dữ liệu báo cáo dạng bảng để nạp vào bảng tính
 *
 * Địa chỉ ứng dụng đặt bằng biến môi trường SPREADSHEET_AI_URL.
 */
import { z } from 'zod';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { defineAddIn } from '../../core/addins.js';
import { authOf, requirePermission } from '../../core/auth.js';
import { ok } from '../../core/http.js';
import { reportService } from '../../modules/reports/report.service.js';

const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

export default defineAddIn({
  manifest: {
    id: 'spreadsheet-ai',
    name: 'Bảng tính AI',
    version: '0.1.0',
    description: 'Mở số liệu kế toán trong bảng tính có trợ lý AI để phân tích, lập biểu tuỳ ý.',
    menuParent: 'tien-ich',
    menu: [{ key: 'spreadsheet-ai', label: 'Bảng tính AI', path: '/addins/spreadsheet-ai', code: 'TI01' }],
  },
  register(app) {
    const r = app.withTypeProvider<ZodTypeProvider>();
    const tags = ['Add-in: Bảng tính AI'];

    r.get('/config', {
      preHandler: requirePermission('reports:read'),
      schema: { tags },
      handler: async () => ok({ url: process.env.SPREADSHEET_AI_URL ?? '', configured: Boolean(process.env.SPREADSHEET_AI_URL) }),
    });

    r.get('/dataset', {
      preHandler: requirePermission('reports:read'),
      schema: { tags, querystring: z.object({ kind: z.enum(['trial-balance']), from: date, to: date }) },
      handler: async (req) => {
        const data = await reportService.trialBalance(authOf(req), { from: req.query.from, to: req.query.to });
        return ok({
          columns: ['Số TK', 'Tên tài khoản', 'Dư Nợ đầu', 'Dư Có đầu', 'PS Nợ', 'PS Có', 'Dư Nợ cuối', 'Dư Có cuối'],
          rows: data.rows.map((x) => [x.code, x.name, x.openingDebit, x.openingCredit, x.debit, x.credit, x.closingDebit, x.closingCredit]),
        });
      },
    });
  },
});
