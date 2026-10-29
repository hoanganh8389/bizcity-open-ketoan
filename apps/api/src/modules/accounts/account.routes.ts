/**
 * Danh mục tài khoản.
 *   GET   /api/v1/accounts          danh sách (lọc search, postingOnly)
 *   GET   /api/v1/accounts/:code    chi tiết
 *   POST  /api/v1/accounts          thêm
 *   PATCH /api/v1/accounts/:code    sửa (không đổi số tài khoản)
 *   DELETE /api/v1/accounts/:code   xoá (chưa có tài khoản con, chưa có phát sinh, chưa dùng ở danh mục khác)
 */
import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { authOf, requirePermission } from '../../core/auth.js';
import { ok } from '../../core/http.js';
import { accountCreateSchema, accountListQuerySchema, accountUpdateSchema } from './account.schemas.js';
import { accountService } from './account.service.js';

const tags = ['Danh mục: Tài khoản'];
const codeParam = z.object({ code: z.string() });

export async function accountRoutes(app: FastifyInstance): Promise<void> {
  const r = app.withTypeProvider<ZodTypeProvider>();

  r.get('/api/v1/accounts', {
    preHandler: requirePermission('catalog:read'),
    schema: { tags, summary: 'Danh sách tài khoản', querystring: accountListQuerySchema },
    handler: async (req) => ok(await accountService.list(authOf(req), req.query)),
  });

  r.get('/api/v1/accounts/:code', {
    preHandler: requirePermission('catalog:read'),
    schema: { tags, summary: 'Chi tiết tài khoản', params: codeParam },
    handler: async (req) => ok(await accountService.get(authOf(req), req.params.code)),
  });

  r.post('/api/v1/accounts', {
    preHandler: requirePermission('catalog:write'),
    schema: { tags, summary: 'Thêm tài khoản', body: accountCreateSchema },
    handler: async (req, reply) => reply.status(201).send(ok(await accountService.create(authOf(req), req.body))),
  });

  r.patch('/api/v1/accounts/:code', {
    preHandler: requirePermission('catalog:write'),
    schema: { tags, summary: 'Sửa tài khoản', params: codeParam, body: accountUpdateSchema },
    handler: async (req) => ok(await accountService.update(authOf(req), req.params.code, req.body)),
  });

  r.delete('/api/v1/accounts/:code', {
    preHandler: requirePermission('catalog:write'),
    schema: { tags, summary: 'Xoá tài khoản', params: codeParam },
    handler: async (req) => ok(await accountService.remove(authOf(req), req.params.code)),
  });
}
