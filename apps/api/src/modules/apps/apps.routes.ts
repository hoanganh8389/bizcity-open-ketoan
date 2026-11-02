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

const tags = ['App ngoài tiến trình'];
const keyParam = z.object({ key: z.string().regex(/^[a-z][a-z0-9-]*$/, 'Khoá app sai khuôn') });

export async function appsRoutes(app: FastifyInstance): Promise<void> {
  const r = app.withTypeProvider<ZodTypeProvider>();
  const admin = requirePermission('users:write');

  // Mọi người dùng của đơn vị (menu Tiện ích dựng từ danh sách này); nút quản trị kiểm users:write riêng.
  r.get('/api/v1/apps', { preHandler: requireAuthenticated(), schema: { tags, summary: 'App ngoài tiến trình cài trong bản này và trạng thái kết nối của đơn vị' }, handler: async (req) => ok(await appsService.list(authOf(req))) });

  r.post('/api/v1/apps/:key/install', {
    preHandler: admin, schema: { tags, summary: 'Kết nối app với đơn vị (khoá API và bí mật webhook chỉ trả về một lần)', params: keyParam },
    handler: async (req, reply) => reply.status(201).send(ok(await appsService.install(authOf(req), req.params.key))),
  });
  r.post('/api/v1/apps/:key/enable', {
    preHandler: admin, schema: { tags, summary: 'Bật lại kết nối app', params: keyParam },
    handler: async (req) => ok(await appsService.setStatus(authOf(req), req.params.key, 'active')),
  });
  r.post('/api/v1/apps/:key/disable', {
    preHandler: admin, schema: { tags, summary: 'Tắt kết nối app: khoá bị từ chối, webhook ngừng; dữ liệu và bút toán giữ nguyên', params: keyParam },
    handler: async (req) => ok(await appsService.setStatus(authOf(req), req.params.key, 'disabled')),
  });
  r.post('/api/v1/apps/:key/scope', {
    preHandler: admin, schema: { tags, summary: 'Đồng ý phạm vi quyền / sự kiện mới trong manifest app', params: keyParam },
    handler: async (req) => ok(await appsService.updateScope(authOf(req), req.params.key)),
  });
  r.post('/api/v1/apps/:key/rotate', {
    preHandler: admin, schema: { tags, summary: 'Xoay khoá API và bí mật webhook của app (trả về một lần)', params: keyParam },
    handler: async (req) => ok(await appsService.rotate(authOf(req), req.params.key)),
  });
  r.post('/api/v1/apps/:key/ticket', {
    preHandler: requireUser(), schema: { tags, summary: 'Vé iframe ngắn hạn cho người dùng đang đăng nhập', params: keyParam },
    handler: async (req) => ok(await appsService.ticket(authOf(req), req.params.key)),
  });
  // Chỉ khoá app (appsService.exchange kiểm auth.app); không cần quyền Core nào vì chỉ trả ngữ cảnh của vé app đó giữ.
  r.post('/api/v1/apps/ticket/exchange', {
    preHandler: requireAuthenticated(), schema: { tags, summary: 'App đổi vé iframe lấy ngữ cảnh (gọi bằng khoá API của app)', body: z.object({ ticket: z.string().min(20).max(4096) }) },
    handler: async (req) => ok(await appsService.exchange(authOf(req), req.body.ticket)),
  });
}
