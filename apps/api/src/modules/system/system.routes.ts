// @bizcity-layer P cli
/**
 * Thông tin hệ thống.
 *   GET /api/v1/system/health  — công khai, dùng cho giám sát và Docker healthcheck (L0 sống)
 *   GET /api/v1/system/health/ready — công khai, L1 sẵn sàng: migration đã áp, trigger bảo vệ sổ còn, CSDL ghi được; lỗi → 503 NOT_READY
 *   GET /api/v1/system/diagnostics — L3 toàn vẹn sổ của đơn vị (tuỳ chọn from, to, branchCode, layer); lưu vào diagnostic_runs
 *   GET /api/v1/system/diagnostics/runs, /runs/:id — lịch sử các lượt chẩn đoán (R-DIAG-5)
 *   GET /api/v1/system/capabilities — bảng năng lực Bizcity Standard của bản đang chạy + phân hệ, add-in, mã chẩn đoán đã đăng ký
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
import { authOf, requireAuthenticated, requirePermission } from '../../core/auth.js';
import { writeAudit } from '../../core/audit.js';
import { dataLockSchema, readDataLock, todayVN } from '../../core/date-rules.js';
import { Errors } from '../../core/errors.js';
import { db } from '../../db/client.js';
import { ok } from '../../core/http.js';
import { readSchema } from './schema.service.js';
import { postingModesSchema } from '@ketoan/contracts';
import { readPostingModes } from '../../kernel/public.js';
import { env } from '../../config/env.js';
import { BUILD_VERSION, STANDARD } from '../../core/version.js';
import { listDiagnostics, runDiagnostics, saveDiagnosticRun } from './diagnostics.js';
import { listActions } from '../../core/actions.js';
import { zodToJson } from '../../core/json-schema.js';

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
      return ok({ status: 'up', time: new Date().toISOString(), bookMode: env.BOOK_MODE, envLabel: env.ENV_LABEL, ...BUILD_VERSION });
    },
  });

  // L1: chỉ trả mã kiểm + mức, không số liệu (công khai cho healthcheck / bộ cân bằng tải). Không lưu diagnostic_runs (chạy mỗi 30 giây).
  app.get('/api/v1/system/health/ready', {
    config: { public: true },
    schema: { tags: ['Hệ thống'], summary: 'Kiểm sẵn sàng (L1): migration đã áp, trigger bảo vệ sổ còn và bật, CSDL ghi được', security: [] },
    handler: async () => {
      const r = await runDiagnostics({ tenantId: '' }, { layer: 'L1' });
      const checks = r.checks.map((c) => ({ code: c.code, level: c.level, count: c.count }));
      const failed = r.checks.filter((c) => c.level === 'error');
      if (failed.length) throw Errors.notReady(`Bản cài chưa sẵn sàng: ${failed.map((c) => c.code).join(', ')}`, { checks });
      return ok({ status: 'ready', time: r.at, checks, ...BUILD_VERSION });
    },
  });

  const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Ngày dạng YYYY-MM-DD');

  r.get('/api/v1/system/diagnostics', {
    preHandler: requirePermission('reports:read'),
    schema: {
      tags: ['Hệ thống'],
      summary: 'Tự chẩn đoán: toàn vẹn sổ của đơn vị (L3) hoặc sẵn sàng (L1); lưu kết quả vào diagnostic_runs',
      description: 'Chỉ đọc (giao dịch READ ONLY). Mỗi kiểm: code, level (pass | empty | info | warn | error), examined, count, sample (khoá chứng từ / số bút toán). Mã kiểm: docs/ops/DIAGNOSTICS.md §2.',
      querystring: z.object({
        from: date.optional().describe('Từ ngày hạch toán; trống = từ đầu sổ'),
        to: date.optional().describe('Đến ngày hạch toán; trống = đến nay'),
        branchCode: z.string().optional().describe('Một chi nhánh; trống = mọi chi nhánh'),
        layer: z.enum(['L1', 'L3']).default('L3'),
      }),
    },
    handler: async (req) => {
      const auth = authOf(req);
      const q = req.query;
      if (q.from && q.to && q.from > q.to) throw Errors.validation('Từ ngày phải trước đến ngày');
      let branchId: string | undefined;
      if (q.branchCode) {
        const br = await db.selectFrom('branches').select('id').where('tenant_id', '=', auth.tenantId).where('code', '=', q.branchCode).executeTakeFirst();
        if (!br) throw Errors.notFound(`chi nhánh ${q.branchCode}`);
        branchId = br.id;
      }
      const report = await runDiagnostics({ tenantId: auth.tenantId, from: q.from, to: q.to, branchId }, { layer: q.layer, branchCode: q.branchCode });
      const runId = await saveDiagnosticRun(report, { tenantId: auth.tenantId, actor: auth.actor, trigger: 'manual' });
      const t = await db.selectFrom('tenants').select('code').where('id', '=', auth.tenantId).executeTakeFirstOrThrow();
      return ok({ runId, tenant: t.code, ...report });
    },
  });

  r.get('/api/v1/system/diagnostics/runs', {
    preHandler: requirePermission('reports:read'),
    schema: {
      tags: ['Hệ thống'],
      summary: 'Lịch sử tự chẩn đoán của đơn vị (mới nhất trước), không kèm chi tiết từng kiểm',
      querystring: z.object({ limit: z.coerce.number().int().min(1).max(200).default(30) }),
    },
    handler: async (req) => {
      const rows = await db.selectFrom('diagnostic_runs')
        .select(['id', 'layer', 'trigger', 'scope', 'summary', 'error_count', 'actor', 'created_at'])
        .where('tenant_id', '=', authOf(req).tenantId)
        .orderBy('id', 'desc').limit(req.query.limit).execute();
      return ok(rows.map((x) => ({ id: x.id, layer: x.layer, trigger: x.trigger, scope: x.scope, summary: x.summary, errorCount: x.error_count, actor: x.actor, at: x.created_at })));
    },
  });

  r.get('/api/v1/system/diagnostics/runs/:id', {
    preHandler: requirePermission('reports:read'),
    schema: { tags: ['Hệ thống'], summary: 'Một lượt tự chẩn đoán, kèm kết quả từng kiểm', params: z.object({ id: z.string().regex(/^\d+$/) }) },
    handler: async (req) => {
      const x = await db.selectFrom('diagnostic_runs').selectAll().where('tenant_id', '=', authOf(req).tenantId).where('id', '=', req.params.id).executeTakeFirst();
      if (!x) throw Errors.notFound('lượt chẩn đoán');
      return ok({ id: x.id, layer: x.layer, trigger: x.trigger, scope: x.scope, summary: x.summary, checks: x.checks, errorCount: x.error_count, actor: x.actor, at: x.created_at });
    },
  });

  app.get('/api/v1/system/capabilities', {
    preHandler: requireAuthenticated(),
    schema: { tags: ['Hệ thống'], summary: 'Năng lực Bizcity Standard của bản đang chạy (available / planned), mã lỗi, sự kiện lõi, điểm mở rộng; phân hệ, add-in đang bật' },
    handler: async () => {
      if (!STANDARD) throw Errors.notFound('bảng năng lực (docs/standard/bizcity-standard.json không có trong bản cài)');
      const { standard, version, released, capabilities, errorCodes, coreEvents, extensionPoints, documentStatusGroups } = STANDARD;
      return ok({
        standard: { name: standard, version, released },
        build: BUILD_VERSION,
        capabilities, errorCodes, coreEvents, extensionPoints, documentStatusGroups,
        enabledModules: app.enabledModules,
        addins: app.addins.map((a) => a.manifest.id),
        diagnostics: listDiagnostics().map((c) => ({ code: c.code, layer: c.layer, level: c.level })),
        // Capability Contract (docs/CONG-BO-KIEN-TRUC.md §3): mỗi action công bố input / output schema, quyền, tác dụng phụ,
        // idempotency, loại bằng chứng trả về — nguồn cho MCP (PHASES 2.12), SDK, bộ kiểm.
        actions: listActions().map((a) => ({
          id: a.id, title: a.title, effect: a.effect, permission: a.permission, sideEffects: a.sideEffects ?? [], idempotency: a.idempotency,
          evidence: a.effect === 'write' ? 'receipt' : 'none', dryRun: !!a.dryRun, http: a.expose.http, mcp: !!a.expose.mcp, ai: a.expose.ai ?? 'deny',
          errors: a.errors ?? [], inputSchema: zodToJson(a.input), outputSchema: zodToJson(a.output),
        })),
      });
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
