/**
 * Đường dẫn đăng nhập.
 *   POST /api/v1/auth/login   — công khai
 *   GET  /api/v1/auth/me      — thông tin phiên hiện tại
 *   POST /api/v1/auth/wp-sso  — công khai: đổi vé đăng nhập của hệ thống quản trị lấy phiên (xem wp-sso.ts)
 */
import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { authOf } from '../../core/auth.js';
import { ok } from '../../core/http.js';
import { loginBodySchema } from './auth.schemas.js';
import { authService } from './auth.service.js';
import { z } from 'zod';
import { loginWithWpTicket } from './wp-sso.js';
import { env } from '../../config/env.js';

export async function authRoutes(app: FastifyInstance): Promise<void> {
  const r = app.withTypeProvider<ZodTypeProvider>();

  r.post('/api/v1/auth/login', {
    config: { public: true },
    schema: { tags: ['Đăng nhập'], summary: 'Đăng nhập, nhận token', body: loginBodySchema, security: [] },
    handler: async (req) => ok(await authService.login(req.body)),
  });

  r.get('/api/v1/auth/wp-sso', {
    config: { public: true },
    schema: { tags: ['Đăng nhập'], summary: 'Địa chỉ cấp vé đăng nhập của hệ thống quản trị (trống = không dùng)', security: [] },
    handler: async () => ok({
      loginUrl: env.WP_SSO_SECRET && env.WP_SSO_LOGIN_URL ? env.WP_SSO_LOGIN_URL : null,
      // Trang quản trị bán hàng — mở phiếu gốc (phiếu nhập kho…) ở tab mới. Sổ thuế không mở phiếu gốc.
      adminUrl: env.BOOK_MODE === 'tax' ? null : wpAdminUrl(),
    }),
  });

  r.post('/api/v1/auth/wp-sso', {
    config: { public: true },
    schema: { tags: ['Đăng nhập'], summary: 'Đăng nhập bằng vé của hệ thống quản trị', body: z.object({ ticket: z.string().min(10).max(8000) }), security: [] },
    handler: async (req) => ok(await loginWithWpTicket(req.body.ticket)),
  });

  r.get('/api/v1/auth/me', {
    schema: { tags: ['Đăng nhập'], summary: 'Thông tin người dùng hiện tại' },
    handler: async (req) => ok(await authService.me(authOf(req))),
  });
}

/** Địa chỉ trang quản trị bán hàng (…/wp-admin/), từ WP_ADMIN_URL hoặc suy từ WP_SSO_LOGIN_URL; null nếu chưa cấu hình. */
function wpAdminUrl(): string | null {
  const base = env.WP_ADMIN_URL || env.WP_SSO_LOGIN_URL.replace(/admin-post\.php.*$/, '');
  return base ? base.replace(/\/?$/, '/') : null;
}
