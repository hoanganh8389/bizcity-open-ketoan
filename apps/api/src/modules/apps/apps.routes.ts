// @bizcity-layer P apps.external
// [2026-11-02 10:43 AM Johnny Chu - Chu Hoàng Anh] PHASE-011 — 3.14 (ADR-0011 mức 2): route app ngoài tiến trình — danh sách, kết nối, bật / tắt, phạm vi, xoay khoá, vé iframe, đổi vé
/**
 * App ngoài tiến trình (ADR-0011 mức 2, docs/api/ung-dung.md).
 *   GET   /api/v1/apps                    app cài trong bản này + trạng thái kết nối của đơn vị   (mọi người dùng)
 *   POST  /api/v1/apps/:key/install       kết nối: khoá API + bí mật webhook trả MỘT lần          (users:write)
 *   POST  /api/v1/apps/:key/enable        bật lại / tắt kết nối                                   (users:write)
 *   POST  /api/v1/apps/:key/disable
 *   POST  /api/v1/apps/:key/scope         đồng ý phạm vi mới của manifest                         (users:write)
 *   POST  /api/v1/apps/:key/rotate        xoay khoá API + bí mật webhook (trả một lần)            (users:write)
 *   POST  /api/v1/apps/:key/ticket        vé iframe ≤ 5 phút cho người dùng đang đăng nhập          (người dùng)
 *   POST  /api/v1/apps/ticket/exchange    app đổi vé lấy ngữ cảnh (đơn vị, người dùng, phạm vi)     (khoá API của app)
 */
import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { authOf, requireAuthenticated, requirePermission, requireUser } from '@bizcity/platform/core/auth';
import { ok } from '@bizcity/platform/core/http';
import { appsService } from './apps.service.js';
import { defineAction, mountActions, type AnyActionDef } from '@bizcity/platform/core/actions';

const tags = ['App ngoài tiến trình'];
const keyParam = z.object({ key: z.string().regex(/^[a-z][a-z0-9-]*$/, 'Khoá app sai khuôn') });

export async function appsRoutes(app: FastifyInstance): Promise<void> {
  const r = app.withTypeProvider<ZodTypeProvider>();
  const admin = requirePermission('users:write');

  // Mọi người dùng của đơn vị (menu Tiện ích dựng từ danh sách này); nút quản trị kiểm users:write riêng.
  r.get('/api/v1/apps', { preHandler: requireAuthenticated(), schema: { tags, summary: 'App ngoài tiến trình cài trong bản này và trạng thái kết nối của đơn vị' }, handler: async (req) => ok(await appsService.list(authOf(req))) });
  // @bizcity-route: vé một lần cho ứng dụng nhúng (đổi phiên), không ghi dữ liệu nghiệp vụ
  r.post('/api/v1/apps/:key/ticket', {
    preHandler: requireUser(), schema: { tags, summary: 'Vé iframe ngắn hạn cho người dùng đang đăng nhập', params: keyParam },
    handler: async (req) => ok(await appsService.ticket(authOf(req), req.params.key)),
  });
  // Chỉ khoá app (appsService.exchange kiểm auth.app); không cần quyền Core nào vì chỉ trả ngữ cảnh của vé app đó giữ.
  // @bizcity-route: công khai — đổi vé một lần lấy phiên của ứng dụng
  r.post('/api/v1/apps/ticket/exchange', {
    preHandler: requireAuthenticated(), schema: { tags, summary: 'App đổi vé iframe lấy ngữ cảnh (gọi bằng khoá API của app)', body: z.object({ ticket: z.string().min(20).max(4096) }) },
    handler: async (req) => ok(await appsService.exchange(authOf(req), req.body.ticket)),
  });
  mountActions(app, appsWriteActions);
}

// [2026-11-03 04:00 AM Johnny Chu - Chu Hoàng Anh] PHASE-014 — W6 đợt 3 (SC-ACT-1): route ghi qua defineAction — quyền, kiểm input, idempotency, giao dịch, bằng chứng do runtime; đường dẫn / thân yêu cầu / mã 201 như cũ.
// Mã cũ trong handler chạy trong giao dịch của action (sameTx); service tự mở giao dịch có bản *In.
const anyOut = z.custom<object>((v) => typeof v === 'object' && v !== null);

export const appsWriteActions: AnyActionDef[] = [
  defineAction({
    id: 'core.app.install', title: 'Kết nối app với đơn vị (khoá API và bí mật webhook chỉ trả về một lần)', tags,
    permission: 'users:write', effect: 'write', sideEffects: ['settings'], idempotency: 'natural',
    input: keyParam, output: anyOut,
    expose: { http: { method: 'POST', path: '/api/v1/apps/:key/install', status: 201 }, mcp: false, ai: 'deny' },
    evidence: { objectType: 'app', objectId: (i) => String(i.key) },
    handler: (ctx, input) => appsService.installIn(ctx.data.tx, ctx.legacyAuth, input.key),
  }),
  defineAction({
    id: 'core.app.enable', title: 'Bật lại kết nối app', tags,
    permission: 'users:write', effect: 'write', sideEffects: ['settings'], idempotency: 'natural',
    input: keyParam, output: anyOut,
    expose: { http: { method: 'POST', path: '/api/v1/apps/:key/enable' }, mcp: false, ai: 'deny' },
    evidence: { objectType: 'app', objectId: (i) => String(i.key) },
    handler: (ctx, input) => appsService.setStatusIn(ctx.data.tx, ctx.legacyAuth, input.key, 'active'),
  }),
  defineAction({
    id: 'core.app.disable', title: 'Tắt kết nối app: khoá bị từ chối, webhook ngừng; dữ liệu và bút toán giữ nguyên', tags,
    permission: 'users:write', effect: 'write', sideEffects: ['settings'], idempotency: 'natural',
    input: keyParam, output: anyOut,
    expose: { http: { method: 'POST', path: '/api/v1/apps/:key/disable' }, mcp: false, ai: 'deny' },
    evidence: { objectType: 'app', objectId: (i) => String(i.key) },
    handler: (ctx, input) => appsService.setStatusIn(ctx.data.tx, ctx.legacyAuth, input.key, 'disabled'),
  }),
  defineAction({
    id: 'core.app.scope', title: 'Đồng ý phạm vi quyền / sự kiện mới trong manifest app', tags,
    permission: 'users:write', effect: 'write', sideEffects: ['settings'], idempotency: 'natural',
    input: keyParam, output: anyOut,
    expose: { http: { method: 'POST', path: '/api/v1/apps/:key/scope' }, mcp: false, ai: 'deny' },
    evidence: { objectType: 'app', objectId: (i) => String(i.key) },
    handler: (ctx, input) => appsService.updateScopeIn(ctx.data.tx, ctx.legacyAuth, input.key),
  }),
  defineAction({
    id: 'core.app.rotate', title: 'Xoay khoá API và bí mật webhook của app (trả về một lần)', tags,
    permission: 'users:write', effect: 'write', sideEffects: ['settings'], idempotency: 'natural',
    input: keyParam, output: anyOut,
    expose: { http: { method: 'POST', path: '/api/v1/apps/:key/rotate' }, mcp: false, ai: 'deny' },
    evidence: { objectType: 'app', objectId: (i) => String(i.key) },
    handler: (ctx, input) => appsService.rotateIn(ctx.data.tx, ctx.legacyAuth, input.key),
  }),
];
