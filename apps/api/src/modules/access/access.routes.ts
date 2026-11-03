// @bizcity-layer P permissions
// [2026-10-29 10:24 PM Johnny Chu - Chu Hoàng Anh] INIT — khởi tạo Bizcity Core Framework: sổ cái chỉ thêm, cửa nạp sự việc, CANON, hợp đồng, bộ kiểm chuẩn.
// [2026-10-29 11:31 PM Johnny Chu - Chu Hoàng Anh] PHASE-001 — bộ kiểm chuẩn xanh, gia cố R-API-6, R-BOUND-2, R-SEC-11, R-REL-1.
// [2026-10-30 09:58 AM Johnny Chu - Chu Hoàng Anh] PHASE-002 — nhãn lớp @bizcity-layer, đồ thị phụ thuộc mốc, bản nháp API module-sdk.
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
import { defineAction, mountActions, type AnyActionDef } from '@bizcity/platform/core/actions';

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
  mountActions(app, accessWriteActions);
}

// [2026-11-03 04:00 AM Johnny Chu - Chu Hoàng Anh] PHASE-014 — W6 đợt 3 (SC-ACT-1): route ghi qua defineAction — quyền, kiểm input, idempotency, giao dịch, bằng chứng do runtime; đường dẫn / thân yêu cầu / mã 201 như cũ.
// Mã cũ trong handler chạy trong giao dịch của action (sameTx); service tự mở giao dịch có bản *In.
const anyOut = z.custom<object>((v) => typeof v === 'object' && v !== null);

export const accessWriteActions: AnyActionDef[] = [
  defineAction({
    id: 'core.user.create', title: 'Thêm người dùng', tags,
    permission: 'users:write', effect: 'write', sideEffects: ['settings'], idempotency: 'natural',
    input: userCreateSchema, output: anyOut,
    expose: { http: { method: 'POST', path: '/api/v1/users', status: 201 }, mcp: false, ai: 'deny' },
    evidence: { objectType: 'user' },
    handler: (ctx, input) => accessService.createUserIn(ctx.data.tx, ctx.legacyAuth, input),
  }),
  defineAction({
    id: 'core.user.update', title: 'Sửa người dùng', tags,
    permission: 'users:write', effect: 'write', sideEffects: ['settings'], idempotency: 'natural',
    input: (userUpdateSchema).merge(idParam), output: anyOut,
    expose: { http: { method: 'PATCH', path: '/api/v1/users/:id' }, mcp: false, ai: 'deny' },
    evidence: { objectType: 'user', objectId: (i) => String(i.id) },
    handler: (ctx, input) => {
      const { id, ...reqBody } = input;
      return accessService.updateUserIn(ctx.data.tx, ctx.legacyAuth, id, reqBody);
    },
  }),
  defineAction({
    id: 'core.api-key.create', title: 'Tạo khoá API (khoá chỉ trả về một lần)', tags,
    permission: 'users:write', effect: 'write', sideEffects: ['settings'], idempotency: 'natural',
    input: apiKeyCreateSchema, output: anyOut,
    expose: { http: { method: 'POST', path: '/api/v1/api-keys', status: 201 }, mcp: false, ai: 'deny' },
    evidence: { objectType: 'api_key' },
    handler: (ctx, input) => accessService.createKeyIn(ctx.data.tx, ctx.legacyAuth, input),
  }),
  defineAction({
    id: 'core.api-key.delete', title: 'Thu hồi khoá API', tags,
    permission: 'users:write', effect: 'write', sideEffects: ['settings'], idempotency: 'natural',
    input: idParam, output: anyOut,
    expose: { http: { method: 'DELETE', path: '/api/v1/api-keys/:id' }, mcp: false, ai: 'deny' },
    evidence: { objectType: 'api_key', objectId: (i) => String(i.id) },
    handler: (ctx, input) => accessService.revokeKeyIn(ctx.data.tx, ctx.legacyAuth, input.id),
  }),
];
