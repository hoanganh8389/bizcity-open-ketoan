// @bizcity-layer P permissions
// [2026-10-29 10:24 PM Johnny Chu - Chu Hoàng Anh] INIT — khởi tạo Bizcity Core Framework: sổ cái chỉ thêm, cửa nạp sự việc, CANON, hợp đồng, bộ kiểm chuẩn.
// [2026-10-30 09:58 AM Johnny Chu - Chu Hoàng Anh] PHASE-002 — nhãn lớp @bizcity-layer, đồ thị phụ thuộc mốc, bản nháp API module-sdk.
/**
 * Đường dẫn đăng nhập.
 *   POST /api/v1/auth/login   — công khai
 *   GET  /api/v1/auth/me      — thông tin phiên hiện tại
 *   POST /api/v1/auth/wp-sso  — công khai: đổi vé đăng nhập của hệ thống quản trị lấy phiên (xem wp-sso.ts)
 */
import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { authOf, requireAuthenticated } from '../../core/auth.js';
import { ok } from '../../core/http.js';
import { loginBodySchema } from './auth.schemas.js';
import { authService } from './auth.service.js';
import { z } from 'zod';
// [2026-11-03 12:40 AM Johnny Chu - Chu Hoàng Anh] PHASE-014 — W5 (SC-LAYER-2): adapter WordPress qua cổng
import { corePort } from '@bizcity/platform/core/ports';
import { env } from '../../config/env.js';
import { Errors } from '../../core/errors.js';

// [2026-11-09 02:05 PM kiennt] PHASE-028 — S028-14 (80 F9): giới hạn số lần đăng nhập SAI (mật khẩu, vé SSO) — chặn dò mật khẩu
/**
 * Đếm lần thất bại trong 15 phút; đăng nhập đúng xoá bộ đếm của email đó. Bộ nhớ trong tiến trình (như takeQuota của Bàn điều tra):
 * nhiều bản API thì mỗi bản đếm riêng — vẫn chặn được dò hàng loạt từ một máy.
 */
export const LOGIN_LIMITS = { windowMs: 15 * 60_000, perAccount: 10, perIp: 50, ssoPerIp: 30 } as const;
const failures = new Map<string, number[]>();
const recentFailures = (key: string, now: number) => (failures.get(key) ?? []).filter((t) => now - t < LOGIN_LIMITS.windowMs);
function assertNotThrottled(keys: [string, number][], now = Date.now()): void {
  for (const [key, max] of keys) if (recentFailures(key, now).length >= max) throw Errors.rateLimited('Đăng nhập sai quá nhiều lần — chờ 15 phút rồi thử lại, hoặc nhờ quản trị đặt lại mật khẩu');
}
function noteFailure(keys: string[], now = Date.now()): void {
  for (const key of keys) failures.set(key, [...recentFailures(key, now), now]);
}
/** Cho test: xoá bộ đếm. */
export const resetLoginThrottle = () => failures.clear();

export async function authRoutes(app: FastifyInstance): Promise<void> {
  const r = app.withTypeProvider<ZodTypeProvider>();

  // @bizcity-route: công khai — đăng nhập cấp vé phiên, chưa có người làm để ghi bằng chứng action
  r.post('/api/v1/auth/login', {
    config: { public: true },
    schema: { tags: ['Đăng nhập'], summary: 'Đăng nhập, nhận token', body: loginBodySchema, security: [] },
    handler: async (req) => {
      const account = `login:${req.ip}:${req.body.tenantCode.toLowerCase()}:${req.body.email}`;
      const ip = `login-ip:${req.ip}`;
      assertNotThrottled([[account, LOGIN_LIMITS.perAccount], [ip, LOGIN_LIMITS.perIp]]);
      try {
        const res = await authService.login(req.body);
        failures.delete(account);
        return ok(res);
      } catch (e) {
        noteFailure([account, ip]);
        throw e;
      }
    },
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

  // @bizcity-route: công khai — đăng nhập một lần từ WordPress (chữ ký HMAC), cấp vé phiên
  r.post('/api/v1/auth/wp-sso', {
    config: { public: true },
    schema: { tags: ['Đăng nhập'], summary: 'Đăng nhập bằng vé của hệ thống quản trị', body: z.object({ ticket: z.string().min(10).max(8000) }), security: [] },
    handler: async (req) => {
      const ip = `sso-ip:${req.ip}`;
      assertNotThrottled([[ip, LOGIN_LIMITS.ssoPerIp]]);
      try {
        return ok(await corePort('wpLogin')(req.body.ticket));
      } catch (e) {
        noteFailure([ip]);
        throw e;
      }
    },
  });

  // [2026-11-09 02:00 PM kiennt] PHASE-028 — S028-14 (80 F9): khai bảo vệ tường minh cho route trước là nợ SC-API-3
  r.get('/api/v1/auth/me', {
    preHandler: requireAuthenticated(),
    schema: { tags: ['Đăng nhập'], summary: 'Thông tin người dùng hiện tại' },
    handler: async (req) => ok(await authService.me(authOf(req))),
  });
}

/** Địa chỉ trang quản trị bán hàng (…/wp-admin/), từ WP_ADMIN_URL hoặc suy từ WP_SSO_LOGIN_URL; null nếu chưa cấu hình. */
function wpAdminUrl(): string | null {
  const base = env.WP_ADMIN_URL || env.WP_SSO_LOGIN_URL.replace(/admin-post\.php.*$/, '');
  return base ? base.replace(/\/?$/, '/') : null;
}
