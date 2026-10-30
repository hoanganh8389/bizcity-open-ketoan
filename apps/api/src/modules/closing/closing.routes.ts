// @bizcity-layer K kernel/closing
/**
 * Kết chuyển lãi lỗ.
 *   GET  /api/v1/closing/rules      danh sách bút toán kết chuyển mẫu
 *   PUT  /api/v1/closing/rules      thay danh sách bút toán kết chuyển mẫu     (quyền settings:write; khác bộ cũ thì thêm phiên bản)
 *   GET  /api/v1/closing/rules/versions  lịch sử phiên bản bút toán kết chuyển mẫu
 *   POST /api/v1/closing/preview    xem trước bút toán sẽ sinh, lãi lỗ từng chi nhánh
 *   POST /api/v1/closing/run        kết chuyển / kết chuyển lại                  (quyền periods:lock)
 *   GET  /api/v1/closing/runs       các lần kết chuyển của một năm (kèm phiên bản quy tắc, tóm tắt nguồn, lý do lỗi thời)
 *   GET  /api/v1/closing/runs/:id/sources  bút toán nguồn của một lần kết chuyển theo đầu số tài khoản
 *   POST /api/v1/closing/year-end   kết chuyển lợi nhuận năm trước 4212 → 4211 (đầu năm mới; dryRun = xem trước)
 * Huỷ một lần kết chuyển: POST /api/v1/documents/cancel với docKey của nó.
 */
import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { closingRulesSaveSchema, closingRunSchema, yearEndRunSchema } from '@ketoan/contracts';
import { authOf, requirePermission } from '../../core/auth.js';
import { idParamSchema, ok } from '../../core/http.js';
import { closingService } from './closing.service.js';

const tags = ['Kết chuyển'];

export async function closingRoutes(app: FastifyInstance): Promise<void> {
  const r = app.withTypeProvider<ZodTypeProvider>();

  r.get('/api/v1/closing/rules', {
    preHandler: requirePermission('reports:read'),
    schema: { tags, summary: 'Bút toán kết chuyển mẫu' },
    handler: async (req) => ok(await closingService.listRules(authOf(req))),
  });

  r.put('/api/v1/closing/rules', {
    preHandler: requirePermission('settings:write'),
    schema: { tags, summary: 'Thay danh sách bút toán kết chuyển mẫu', body: closingRulesSaveSchema },
    handler: async (req) => ok(await closingService.saveRules(authOf(req), req.body.rules, req.body.note)),
  });

  r.get('/api/v1/closing/rules/versions', {
    preHandler: requirePermission('reports:read'),
    schema: { tags, summary: 'Lịch sử phiên bản bút toán kết chuyển mẫu' },
    handler: async (req) => ok(await closingService.listRuleVersions(authOf(req))),
  });

  r.post('/api/v1/closing/preview', {
    preHandler: requirePermission('reports:read'),
    schema: { tags, summary: 'Xem trước kết chuyển', body: closingRunSchema },
    handler: async (req) => ok(await closingService.preview(authOf(req), req.body)),
  });

  r.post('/api/v1/closing/run', {
    preHandler: requirePermission('periods:lock'),
    schema: { tags, summary: 'Kết chuyển lãi lỗ (chạy lại thì bút toán cũ được đảo)', body: closingRunSchema },
    handler: async (req) => ok(await closingService.run(authOf(req), req.body)),
  });

  r.post('/api/v1/closing/year-end', {
    preHandler: requirePermission('periods:lock'),
    schema: { tags, summary: 'Kết chuyển lợi nhuận năm trước (4212 → 4211) khi sang năm mới', body: yearEndRunSchema },
    handler: async (req) => ok(await closingService.yearEnd(authOf(req), req.body)),
  });

  r.get('/api/v1/closing/runs', {
    preHandler: requirePermission('reports:read'),
    schema: {
      tags, summary: 'Các lần kết chuyển: theo năm, hoặc theo khoảng ngày chứng từ',
      querystring: z.object({ year: z.coerce.number().int().min(2000).max(2100).optional(), from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(), to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional() }),
    },
    handler: async (req) => ok(await closingService.listRuns(authOf(req), req.query)),
  });

  r.get('/api/v1/closing/runs/:id/sources', {
    preHandler: requirePermission('reports:read'),
    schema: {
      tags, summary: 'Bút toán nguồn của một lần kết chuyển',
      params: idParamSchema,
      querystring: z.object({ account: z.string().trim().min(1).max(20), page: z.coerce.number().int().min(1).default(1) }),
    },
    handler: async (req) => ok(await closingService.runSources(authOf(req), req.params.id, req.query)),
  });
}
