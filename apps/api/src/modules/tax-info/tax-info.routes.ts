// @bizcity-layer K kernel/tax
/**
 * Bổ sung thông tin thuế (ACC78).
 *   GET    /api/v1/tax-info               chứng từ mua bán, hoá đơn trong kỳ, kèm các điểm còn thiếu
 *   PUT    /api/v1/tax-info/:eventId      bổ sung / sửa (hoá đơn, kỳ kê khai, được khấu trừ, chứng từ thanh toán)
 *   DELETE /api/v1/tax-info/:eventId      bỏ phần đã bổ sung, trở về thông tin gốc của chứng từ
 */
import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { authOf, requirePermission } from '../../core/auth.js';
import { ok } from '../../core/http.js';
import { taxInfoService } from './tax-info.service.js';

const tags = ['Thuế: Bổ sung thông tin thuế'];
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Ngày dạng YYYY-MM-DD');
const branchCodes = z
  .string()
  .optional()
  .transform((s) => (s ? s.split(',').map((x) => x.trim()).filter(Boolean) : undefined));
const text = (max: number) => z.string().trim().max(max).optional();
const eventParam = z.object({ eventId: z.string().regex(/^\d+$/) });

export async function taxInfoRoutes(app: FastifyInstance): Promise<void> {
  const r = app.withTypeProvider<ZodTypeProvider>();

  r.get('/api/v1/tax-info', {
    preHandler: requirePermission('documents:read'),
    schema: {
      tags,
      summary: 'Chứng từ, hoá đơn trong kỳ và các điểm còn thiếu',
      querystring: z.object({
        from: date,
        to: date,
        direction: z.enum(['input', 'output']).optional(),
        branchCodes,
        show: z.enum(['issues', 'all', 'patched']).default('issues'),
        search: z.string().trim().max(100).optional(),
      }),
    },
    handler: async (req) => ok(await taxInfoService.list(authOf(req), req.query)),
  });

  r.put('/api/v1/tax-info/:eventId', {
    preHandler: requirePermission('documents:write'),
    schema: {
      tags,
      summary: 'Bổ sung thông tin thuế cho một chứng từ',
      params: eventParam,
      body: z.object({
        invoice: z.object({ no: text(32), serial: text(32), form: text(32), date: text(10), buyerName: text(255), buyerTaxCode: text(32), buyerAddress: text(500) }).default({}),
        declareMonth: z.string().regex(/^(\d{4}-\d{2})?$/, 'Kỳ kê khai dạng YYYY-MM').default(''),
        deductible: z.boolean().default(true),
        paymentRef: z.string().trim().max(255).default(''),
        note: z.string().trim().max(500).default(''),
      }),
    },
    handler: async (req) => ok(await taxInfoService.save(authOf(req), req.params.eventId, req.body)),
  });

  r.delete('/api/v1/tax-info/:eventId', {
    preHandler: requirePermission('documents:write'),
    schema: { tags, summary: 'Bỏ phần đã bổ sung', params: eventParam },
    handler: async (req) => ok(await taxInfoService.remove(authOf(req), req.params.eventId)),
  });
}
