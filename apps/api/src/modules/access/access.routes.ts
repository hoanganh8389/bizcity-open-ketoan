// @bizcity-layer P permissions
/**
 * Người dùng và khoá API.
 *   GET/POST   /api/v1/users            danh sách, thêm            (quyền users:write)
 *   PATCH      /api/v1/users/:id        sửa, khoá, đặt lại mật khẩu (đặt lại / khoá / đổi vai trò → mọi máy của người đó bị đăng xuất)
 *   POST       /api/v1/auth/change-password   tự đổi mật khẩu      (mọi người dùng; máy khác bị đăng xuất, máy này nhận vé mới)
 *   POST       /api/v1/auth/logout-others     đăng xuất mọi thiết bị khác (máy này nhận vé mới)
 *   GET/POST   /api/v1/api-keys         danh sách, tạo (khoá chỉ hiện một lần)
 *   DELETE     /api/v1/api-keys/:id     thu hồi
 */
import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { authOf, requirePermission, requireUser } from '../../core/auth.js';
import { ok, idParamSchema } from '../../core/http.js';
import { apiKeyCreateSchema, changePasswordSchema, userCreateSchema, userUpdateSchema } from './access.schemas.js';
import { accessService } from './access.service.js';
import { signSession, verifySession } from '../../core/security/tokens.js';
import { Errors } from '../../core/errors.js';
import type { FastifyRequest } from 'fastify';

/** Cấp lại vé cho máy đang thao tác với số phiên bản phiên mới (giữ nguyên vai trò, tên, quyền do trang quản trị cấp). */
const reissueFor = (req: FastifyRequest) => async (sv: number) => {
  const claims = await verifySession(String(req.headers.authorization ?? '').replace(/^Bearer /, ''));
  if (!claims) throw Errors.unauthorized();
  return signSession({ ...claims, sv });
};

const tags = ['Người dùng và khoá API'];
const idParam = idParamSchema;

export async function accessRoutes(app: FastifyInstance): Promise<void> {
  const r = app.withTypeProvider<ZodTypeProvider>();
  const admin = requirePermission('users:write');

  r.get('/api/v1/users', { preHandler: admin, schema: { tags, summary: 'Danh sách người dùng' }, handler: async (req) => ok(await accessService.listUsers(authOf(req))) });

  r.post('/api/v1/users', {
    preHandler: admin,
    schema: { tags, summary: 'Thêm người dùng', body: userCreateSchema },
    handler: async (req, reply) => reply.status(201).send(ok(await accessService.createUser(authOf(req), req.body))),
  });

  r.patch('/api/v1/users/:id', {
    preHandler: admin,
    schema: { tags, summary: 'Sửa người dùng', params: idParam, body: userUpdateSchema },
    handler: async (req) => ok(await accessService.updateUser(authOf(req), req.params.id, req.body)),
  });

  r.post('/api/v1/auth/change-password', {
    schema: { tags, summary: 'Tự đổi mật khẩu', body: changePasswordSchema },
    handler: async (req) => ok(await accessService.changeOwnPassword(authOf(req), req.body.currentPassword, req.body.newPassword, reissueFor(req))),
  });

  r.post('/api/v1/auth/logout-others', {
    preHandler: requireUser(),
    schema: { tags, summary: 'Đăng xuất mọi thiết bị khác đang đăng nhập tài khoản này (máy đang bấm nhận vé mới, vẫn đăng nhập)' },
    handler: async (req) => ok(await accessService.logoutOthers(authOf(req), reissueFor(req))),
  });

  r.get('/api/v1/api-keys', { preHandler: admin, schema: { tags, summary: 'Danh sách khoá API' }, handler: async (req) => ok(await accessService.listKeys(authOf(req))) });

  r.post('/api/v1/api-keys', {
    preHandler: admin,
    schema: { tags, summary: 'Tạo khoá API (khoá chỉ trả về một lần)', body: apiKeyCreateSchema },
    handler: async (req, reply) => reply.status(201).send(ok(await accessService.createKey(authOf(req), req.body))),
  });

  r.delete('/api/v1/api-keys/:id', {
    preHandler: admin,
    schema: { tags, summary: 'Thu hồi khoá API', params: idParam },
    handler: async (req) => ok(await accessService.revokeKey(authOf(req), req.params.id)),
  });
}
