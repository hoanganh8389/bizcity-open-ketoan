// @bizcity-layer M data/masterdata
/**
 * Chi nhánh.
 *   GET   /api/v1/branches
 *   GET   /api/v1/branches/sites    website của hệ thống bán hàng (qua kết nối chính) và chi nhánh từng website đang nối
 *   POST  /api/v1/branches
 *   PATCH /api/v1/branches/:code
 *   DELETE /api/v1/branches/:code   xoá chi nhánh chưa có chứng từ
 */
import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { authOf, requirePermission } from '../../core/auth.js';
import { ok } from '../../core/http.js';
import { branchCreateSchema, branchUpdateSchema } from './branch.schemas.js';
import { branchService } from './branch.service.js';
import { branchSites } from './branch-sites.js';

const tags = ['Danh mục: Chi nhánh'];

export async function branchRoutes(app: FastifyInstance): Promise<void> {
  const r = app.withTypeProvider<ZodTypeProvider>();

  r.get('/api/v1/branches', {
    preHandler: requirePermission('catalog:read'),
    schema: { tags, summary: 'Danh sách chi nhánh' },
    handler: async (req) => ok(await branchService.list(authOf(req))),
  });

  r.get('/api/v1/branches/sites', {
    preHandler: requirePermission('catalog:read'),
    schema: { tags, summary: 'Website của hệ thống bán hàng và chi nhánh đang nối (qua kết nối chính)', querystring: z.object({ refresh: z.string().optional() }) },
    handler: async (req) => ok(await branchSites(authOf(req).tenantId, req.query.refresh === '1')),
  });

  r.post('/api/v1/branches', {
    preHandler: requirePermission('catalog:write'),
    schema: { tags, summary: 'Thêm chi nhánh', body: branchCreateSchema },
    handler: async (req, reply) => reply.status(201).send(ok(await branchService.create(authOf(req), req.body))),
  });

  r.patch('/api/v1/branches/:code', {
    preHandler: requirePermission('catalog:write'),
    schema: { tags, summary: 'Sửa chi nhánh', params: z.object({ code: z.string() }), body: branchUpdateSchema },
    handler: async (req) => ok(await branchService.update(authOf(req), req.params.code, req.body)),
  });

  r.delete('/api/v1/branches/:code', {
    preHandler: requirePermission('catalog:write'),
    schema: { tags, summary: 'Xoá chi nhánh chưa có chứng từ', params: z.object({ code: z.string() }) },
    handler: async (req) => ok(await branchService.remove(authOf(req), req.params.code)),
  });
}
