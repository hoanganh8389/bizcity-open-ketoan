/**
 * Thông tin hệ thống.
 *   GET /api/v1/system/health  — công khai, dùng cho giám sát và Docker healthcheck
 *   GET /api/v1/system/addins  — danh sách add-in đang bật (giao diện dùng để dựng menu)
 *   GET /api/v1/system/modules — mã các phân hệ máy chủ đang bật (ENABLED_MODULES; trang Tổng quan chỉ hiện các phân hệ này)
 *   GET /api/v1/system/schema  — cấu trúc cơ sở dữ liệu (bảng, cột, chú thích, khoá ngoại, trigger)
 *                                ghép với danh mục giải thích tiếng Việt, cho màn "Kiến trúc & Nghiệp vụ"
 *   GET/PUT /api/v1/settings/data-lock — khoá dữ liệu theo ngày (xem core/date-rules.ts)
 *   GET /api/v1/tenant         — thông tin đơn vị đang đăng nhập (tên, mã số thuế, địa chỉ, điện thoại)
 *   PUT /api/v1/tenant         — sửa thông tin đơn vị (quyền settings:write); logo lưu ở tenants.settings.logo
 *                                dạng data URL ảnh PNG / JPEG / WebP (giao diện thu nhỏ trước khi gửi, tối đa 300 KB)
 */
import type { FastifyInstance } from 'fastify';
import { sql } from 'kysely';
import { z } from 'zod';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { authOf, requirePermission } from '../../core/auth.js';
import { writeAudit } from '../../core/audit.js';
import { dataLockSchema, readDataLock, todayVN } from '../../core/date-rules.js';
import { Errors } from '../../core/errors.js';
import { db } from '../../db/client.js';
import { ok } from '../../core/http.js';
import { readSchema } from './schema.service.js';
import { postingModesSchema } from '@ketoan/contracts';
import { readPostingModes } from '../../core/posting-modes.js';
import { env } from '../../config/env.js';

export async function systemRoutes(app: FastifyInstance): Promise<void> {
  const r = app.withTypeProvider<ZodTypeProvider>();
  const tenantDto = (t: { code: string; name: string; tax_code: string | null; address: string | null; phone: string | null; settings: unknown }) => ({
    code: t.code, name: t.name, taxCode: t.tax_code ?? '', address: t.address ?? '', phone: t.phone ?? '',
    logo: String((t.settings as { logo?: unknown } | null)?.logo ?? '') || null,
  });

  r.get('/api/v1/settings/data-lock', {
    schema: { tags: ['Hệ thống'], summary: 'Khoá dữ liệu theo ngày: khoá đến ngày, chỉ sửa trong N ngày, chỉ lập phiếu hôm nay, cấm kế toán viên huỷ' },
    handler: async (req) => {
      const auth = authOf(req);
      const t = await db.selectFrom('tenants').select('settings').where('id', '=', auth.tenantId).executeTakeFirstOrThrow();
      return ok({ ...readDataLock(t.settings), today: todayVN(), bypass: auth.permissions.has('documents:bypass-date-lock') });
    },
  });

  r.put('/api/v1/settings/data-lock', {
    preHandler: requirePermission('settings:write'),
    schema: { tags: ['Hệ thống'], summary: 'Sửa khoá dữ liệu theo ngày', body: dataLockSchema },
    handler: async (req) => {
      const auth = authOf(req);
      const b = req.body;
      await db.transaction().execute(async (trx) => {
        const cur = await trx.selectFrom('tenants').select('settings').where('id', '=', auth.tenantId).executeTakeFirstOrThrow();
        const before = readDataLock(cur.settings);
        const settings = { ...((cur.settings as Record<string, unknown>) ?? {}), dataLock: b };
        await trx.updateTable('tenants').set({ settings: JSON.stringify(settings) }).where('id', '=', auth.tenantId).execute();
        await writeAudit(trx, { tenantId: auth.tenantId, actor: auth.actor, action: 'settings.data-lock', objectType: 'tenant', objectId: auth.tenantId, before, after: b });
      });
      return ok({ ...b, today: todayVN(), bypass: auth.permissions.has('documents:bypass-date-lock') });
    },
  });

  r.get('/api/v1/settings/posting-modes', {
    schema: { tags: ['Hệ thống'], summary: 'Chế độ ghi sổ theo loại chứng từ: ghi ngay (auto) hay chờ duyệt (approve)' },
    handler: async (req) => {
      const t = await db.selectFrom('tenants').select('settings').where('id', '=', authOf(req).tenantId).executeTakeFirstOrThrow();
      return ok(readPostingModes(t.settings));
    },
  });

  r.put('/api/v1/settings/posting-modes', {
    preHandler: requirePermission('settings:write'),
    schema: { tags: ['Hệ thống'], summary: 'Sửa chế độ ghi sổ theo loại chứng từ', body: postingModesSchema },
    handler: async (req) => {
      const auth = authOf(req);
      await db.transaction().execute(async (trx) => {
        const cur = await trx.selectFrom('tenants').select('settings').where('id', '=', auth.tenantId).executeTakeFirstOrThrow();
        const before = readPostingModes(cur.settings);
        const settings = { ...((cur.settings as Record<string, unknown>) ?? {}), postingModes: req.body };
        await trx.updateTable('tenants').set({ settings: JSON.stringify(settings) }).where('id', '=', auth.tenantId).execute();
        await writeAudit(trx, { tenantId: auth.tenantId, actor: auth.actor, action: 'settings.posting-modes', objectType: 'tenant', objectId: auth.tenantId, before, after: req.body });
      });
      return ok(req.body);
    },
  });

  r.get('/api/v1/tenant', {
    schema: { tags: ['Hệ thống'], summary: 'Thông tin đơn vị đang đăng nhập' },
    handler: async (req) => {
      const t = await db.selectFrom('tenants').select(['code', 'name', 'tax_code', 'address', 'phone', 'settings']).where('id', '=', authOf(req).tenantId).executeTakeFirstOrThrow();
      return ok(tenantDto(t));
    },
  });

  r.put('/api/v1/tenant', {
    preHandler: requirePermission('settings:write'),
    schema: {
      tags: ['Hệ thống'],
      summary: 'Sửa thông tin đơn vị (tên hiện ở đầu trang, trên phiếu in, báo cáo)',
      body: z.object({
        name: z.string().trim().min(1, 'Cần nhập tên đơn vị').max(255),
        taxCode: z.string().trim().max(32).default(''),
        address: z.string().trim().max(500).default(''),
        phone: z.string().trim().max(64).default(''),
        /** Logo: data URL ảnh; null = xoá logo; không gửi = giữ nguyên. */
        logo: z.string().max(420_000).nullable().optional(),
      }),
    },
    handler: async (req) => {
      const auth = authOf(req);
      const b = req.body;
      if (b.taxCode && !/^\d{10}(-\d{3})?$/.test(b.taxCode)) throw Errors.validation('Mã số thuế gồm 10 chữ số (chi nhánh thêm -xxx)');
      if (b.logo && !/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(b.logo)) throw Errors.validation('Logo phải là ảnh PNG, JPEG hoặc WebP');
      const t = await db.transaction().execute(async (trx) => {
        const cur = await trx.selectFrom('tenants').select('settings').where('id', '=', auth.tenantId).executeTakeFirstOrThrow();
        const settings = { ...((cur.settings as Record<string, unknown>) ?? {}) };
        if (b.logo !== undefined) { if (b.logo) settings.logo = b.logo; else delete settings.logo; }
        const row = await trx.updateTable('tenants').set({ name: b.name, tax_code: b.taxCode || null, address: b.address || null, phone: b.phone || null, settings: JSON.stringify(settings) })
          .where('id', '=', auth.tenantId).returning(['code', 'name', 'tax_code', 'address', 'phone', 'settings']).executeTakeFirstOrThrow();
        await writeAudit(trx, { tenantId: auth.tenantId, actor: auth.actor, action: 'tenant.update', objectType: 'tenant', objectId: auth.tenantId, after: { ...b, logo: b.logo === undefined ? undefined : b.logo ? `(ảnh ${b.logo.length} ký tự)` : null } });
        return row;
      });
      return ok(tenantDto(t));
    },
  });

  app.get('/api/v1/system/health', {
    config: { public: true },
    schema: { tags: ['Hệ thống'], summary: 'Kiểm tra sống', security: [] },
    handler: async () => {
      await sql`select 1`.execute(db);
      return ok({ status: 'up', time: new Date().toISOString(), bookMode: env.BOOK_MODE, envLabel: env.ENV_LABEL });
    },
  });

  app.get('/api/v1/system/addins', {
    schema: { tags: ['Hệ thống'], summary: 'Add-in đang bật' },
    handler: async () => ok(app.addins.map((a) => a.manifest)),
  });

  app.get('/api/v1/system/modules', {
    schema: { tags: ['Hệ thống'], summary: 'Phân hệ máy chủ đang bật' },
    handler: async () => ok(app.enabledModules),
  });

  app.get('/api/v1/system/schema', {
    schema: { tags: ['Hệ thống'], summary: 'Cấu trúc cơ sở dữ liệu kèm giải thích' },
    handler: async () => ok(await readSchema()),
  });
}
