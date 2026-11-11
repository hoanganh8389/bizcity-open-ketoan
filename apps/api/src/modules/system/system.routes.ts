// @bizcity-layer P cli
// [2026-10-29 10:24 PM Johnny Chu - Chu Hoàng Anh] INIT — khởi tạo Bizcity Core Framework: sổ cái chỉ thêm, cửa nạp sự việc, CANON, hợp đồng, bộ kiểm chuẩn.
// [2026-10-29 11:31 PM Johnny Chu - Chu Hoàng Anh] PHASE-001 — bộ kiểm chuẩn xanh, gia cố R-API-6, R-BOUND-2, R-SEC-11, R-REL-1.
// [2026-10-30 09:58 AM Johnny Chu - Chu Hoàng Anh] PHASE-002 — nhãn lớp @bizcity-layer, đồ thị phụ thuộc mốc, bản nháp API module-sdk.
// [2026-10-30 10:29 AM Johnny Chu - Chu Hoàng Anh] PHASE-003 — tự chẩn đoán L1 / L3, diagnostic_runs, khoá kỳ chặn khi sổ lỗi (PHASES 2.10).
// [2026-10-30 11:10 AM Johnny Chu - Chu Hoàng Anh] PHASE-003 — runtime action defineAction, idempotency, dry-run (PHASES 2.5).
// [2026-10-30 12:50 PM Johnny Chu - Chu Hoàng Anh] CONG-BO — bản công bố kiến trúc: 4 lớp hợp đồng, luật hạ tầng, checklist nhận việc.
// [2026-10-30 09:36 PM Johnny Chu - Chu Hoàng Anh] PHASE-010 — cổng công khai apps/api/src/kernel/public.ts, SC-KERNEL-6: ngoài Kernel chỉ import qua cổng.
/**
 * Thông tin hệ thống.
 *   GET /api/v1/system/health  — công khai, dùng cho giám sát và Docker healthcheck (L0 sống)
 *   GET /api/v1/system/health/ready — công khai, L1 sẵn sàng: migration đã áp, trigger bảo vệ sổ còn, CSDL ghi được; lỗi → 503 NOT_READY
 *   GET /api/v1/system/diagnostics — L3 toàn vẹn sổ của đơn vị (tuỳ chọn from, to, branchCode, layer); lưu vào diagnostic_runs
 *   GET /api/v1/system/diagnostics/runs, /runs/:id — lịch sử các lượt chẩn đoán (R-DIAG-5)
 *   GET /api/v1/system/diagnostics/weeks — kết quả từng tuần từ các lượt đã lưu (PHASE-032 B4a)
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
import { authOf, requireAuthenticated, requirePermission, requireUser } from '../../core/auth.js';
import { writeAudit } from '../../core/audit.js';
import { dataLockSchema, readDataLock, todayVN } from '../../core/date-rules.js';
import { Errors } from '../../core/errors.js';
import { db } from '../../db/client.js';
import { ok, queryBool } from '../../core/http.js';
import { summarize } from '../../core/module-manifest.js';
import { readSchema } from './schema.service.js';
import { postingModesSchema } from '@ketoan/contracts';
// [2026-11-03 12:40 AM Johnny Chu - Chu Hoàng Anh] PHASE-014 — W5 (SC-LAYER-2)
import { readPostingModes } from '@ketoan/contracts';
import { env } from '../../config/env.js';
import { BUILD_VERSION, FOUNDATIONS, PILLARS, STANDARD } from '../../core/version.js';
import { listDiagnostics, runDiagnostics, saveDiagnosticRun, weeklyDiagnostics } from './diagnostics.js';
import { listActions, mountActions, defineAction, type AnyActionDef, sameTx } from '../../core/actions.js';
import { disabledModules } from '@bizcity/platform/core/module-registry';
import { listModulePermissions, PERMISSIONS } from '@bizcity/platform/core/auth';
import { REQUIRED_MODULES, runModuleSeed } from '../../core/module-lifecycle.js';
import { moduleActions } from './module.actions.js';
// [2026-11-02 10:40 PM Johnny Chu - Chu Hoàng Anh] PHASE-014 — W4 (G4)
import { notifyActions } from './notify.actions.js';
// [2026-11-06 08:10 PM Johnny Chu - Chu Hoàng Anh] PHASE-030 — S030-31: hàng việc (core.queue.*)
import { queueActions } from './queue.routes.js';
// [2026-11-08 02:15 PM Johnny Chu - Chu Hoàng Anh] PHASE-031 — W3a (S031-13): API chính sách cho nguồn ngoài
import { policyActions } from './policy.routes.js';
import { zodToJson } from '../../core/json-schema.js';

// [2026-11-03 08:00 AM Johnny Chu - Chu Hoàng Anh] PHASE-014 — W6 đợt 5 (SC-ACT-1): trợ giúp dời ra cấp tệp để action dùng chung
const tenantDto = (t: { code: string; name: string; tax_code: string | null; address: string | null; phone: string | null; settings: unknown }) => ({
  code: t.code, name: t.name, taxCode: t.tax_code ?? '', address: t.address ?? '', phone: t.phone ?? '',
  logo: String((t.settings as { logo?: unknown } | null)?.logo ?? '') || null,
});
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Ngày dạng YYYY-MM-DD');
const IMAGE_BLOCK_MAX = 900_000;
const IMAGE_DATA_URL = /^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/;

export async function systemRoutes(app: FastifyInstance): Promise<void> {
  const r = app.withTypeProvider<ZodTypeProvider>();

  // [2026-11-09 02:00 PM kiennt] PHASE-028 — S028-14 (80 F9): khai bảo vệ tường minh cho route trước là nợ SC-API-3
  r.get('/api/v1/settings/data-lock', {
    preHandler: requireAuthenticated(),
    schema: { tags: ['Hệ thống'], summary: 'Khoá dữ liệu theo ngày: khoá đến ngày, chỉ sửa trong N ngày, chỉ lập phiếu hôm nay, cấm kế toán viên huỷ' },
    handler: async (req) => {
      const auth = authOf(req);
      const t = await db.selectFrom('tenants').select('settings').where('id', '=', auth.tenantId).executeTakeFirstOrThrow();
      return ok({ ...readDataLock(t.settings), today: todayVN(), bypass: auth.permissions.has('documents:bypass-date-lock') });
    },
  });

  // [2026-11-09 02:00 PM kiennt] PHASE-028 — S028-14 (80 F9): khai bảo vệ tường minh cho route trước là nợ SC-API-3
  r.get('/api/v1/settings/posting-modes', {
    preHandler: requireAuthenticated(),
    schema: { tags: ['Hệ thống'], summary: 'Chế độ ghi sổ theo loại chứng từ: ghi ngay (auto) hay chờ duyệt (approve)' },
    handler: async (req) => {
      const t = await db.selectFrom('tenants').select('settings').where('id', '=', authOf(req).tenantId).executeTakeFirstOrThrow();
      return ok(readPostingModes(t.settings));
    },
  });

  // [2026-11-06 02:40 AM Nguyễn Văn Thủy] MENU — khối ảnh của đơn vị (màn HT11)
  r.get('/api/v1/tenant/image-blocks', {
    preHandler: requirePermission('documents:read'),
    schema: { tags: ['Hệ thống'], summary: 'Ảnh đơn vị đã cài theo từng khối (máy tính, điện thoại); khối chưa cài dùng ảnh mặc định của giao diện' },
    handler: async (req) => {
      const t = await db.selectFrom('tenants').select('settings').where('id', '=', authOf(req).tenantId).executeTakeFirstOrThrow();
      return ok((t.settings as { imageBlocks?: unknown } | null)?.imageBlocks ?? {});
    },
  });

  // [2026-11-09 02:00 PM kiennt] PHASE-028 — S028-14 (80 F9): khai bảo vệ tường minh cho route trước là nợ SC-API-3
  r.get('/api/v1/tenant', {
    preHandler: requireAuthenticated(),
    schema: { tags: ['Hệ thống'], summary: 'Thông tin đơn vị đang đăng nhập' },
    handler: async (req) => {
      const t = await db.selectFrom('tenants').select(['code', 'name', 'tax_code', 'address', 'phone', 'settings']).where('id', '=', authOf(req).tenantId).executeTakeFirstOrThrow();
      return ok(tenantDto(t));
    },
  });

  app.get('/api/v1/system/health', {
    config: { public: true },
    schema: { tags: ['Hệ thống'], summary: 'Kiểm tra sống', security: [] },
    handler: async () => {
      await sql`select 1`.execute(db);
      // bugReportUrl (PHASE-019 Q019-5): khay Mã tra cứu thêm nút mở trang báo lỗi của bản cài; null = chỉ chép nội dung.
      return ok({ status: 'up', time: new Date().toISOString(), bookMode: env.BOOK_MODE, envLabel: env.ENV_LABEL, bugReportUrl: env.BUG_REPORT_URL || null, ...BUILD_VERSION });
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

  // [2026-11-11 12:50 AM Johnny Chu - Chu Hoàng Anh] PHASE-032 — B4a (S032-31 phần xem): kết quả từng tuần gom từ lượt tự kiểm L3 đã lưu, tuần ISO tách theo tháng, chỉ đọc
  r.get('/api/v1/system/diagnostics/weeks', {
    preHandler: requirePermission('reports:read'),
    schema: {
      tags: ['Hệ thống'],
      summary: 'Kết quả từng tuần: gom lượt tự kiểm L3 cả sổ đã lưu theo tuần ISO, tách theo tháng (mới nhất trước); chỉ đọc',
      description: 'Mỗi lát (tuần × tháng): số lượt, số ngày có lượt, phép kiểm đạt / áp dụng, lỗi còn mở, việc còn mở kèm ngày bắt đầu, việc mới / đã đóng so với lát trước, tuổi việc cũ nhất. Lượt giữ 90 ngày (R-DIAG-5). PHASE-032 B4a.',
      querystring: z.object({ weeks: z.coerce.number().int().min(1).max(26).default(12) }),
    },
    handler: async (req) => ok(await weeklyDiagnostics(authOf(req).tenantId, { weeks: req.query.weeks })),
  });

  // [2026-11-04 02:00 AM Johnny Chu - Chu Hoàng Anh] PHASE-026 — bảng trụ cột × mức đạt (bizcity_pillars@1): nguồn là tệp của bản dựng, không theo đơn vị; không có API ghi "đạt" (R-CONT-7)
  app.get('/api/v1/system/pillars', {
    preHandler: requireAuthenticated(),
    schema: { tags: ['Hệ thống'], summary: 'Bảng trụ cột × tiêu chí × mức đạt của Core (docs/standard/tru-cot.json) — cho màn Trụ cột & mức đạt và thẻ Trụ cột ở trang chủ phân hệ' },
    handler: async () => {
      if (!PILLARS) throw Errors.notFound('bảng trụ cột (docs/standard/tru-cot.json không có trong bản cài)');
      return ok(PILLARS);
    },
  });

  // [2026-11-05 11:20 PM Johnny Chu - Chu Hoàng Anh] PHASE-029 — E1 (S029-30): bản đồ nền móng (bizcity_foundations@1) — chỉ đọc, thuộc bản dựng; mức đạt đổi bằng sửa mã + tệp nguồn, SC-CORE-1 kiểm (R-ECP-SCORE)
  app.get('/api/v1/system/foundations', {
    preHandler: requireAuthenticated(),
    schema: { tags: ['Hệ thống'], summary: 'Sáu năng lực lõi × bốn nhóm nền móng × 17 trụ cột × ECP × tín hiệu kiểm (docs/standard/nen-mong.json) — cho thẻ Nền móng ở màn Trụ cột & mức đạt' },
    handler: async () => {
      if (!FOUNDATIONS) throw Errors.notFound('bản đồ nền móng (docs/standard/nen-mong.json không có trong bản cài)');
      return ok(FOUNDATIONS);
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

  // [2026-11-09 02:00 PM kiennt] PHASE-028 — S028-14 (80 F9): khai bảo vệ tường minh cho route trước là nợ SC-API-3
  app.get('/api/v1/system/addins', {
    preHandler: requireAuthenticated(),
    schema: { tags: ['Hệ thống'], summary: 'Add-in đang bật' },
    handler: async () => ok(app.addins.map((a) => a.manifest)),
  });

  // [2026-11-01 11:40 PM Johnny Chu - Chu Hoàng Anh] PHASE-011 — ?detail=true trả manifest (bizcity.module.json) của phân hệ + add-in đang bật; mặc định giữ mảng mã (giao diện cũ)
  // [2026-11-09 02:00 PM kiennt] PHASE-028 — S028-14 (80 F9): khai bảo vệ tường minh cho route trước là nợ SC-API-3
  app.get('/api/v1/system/modules', {
    preHandler: requireAuthenticated(),
    schema: {
      tags: ['Hệ thống'], summary: 'Phân hệ máy chủ đang bật',
      description: 'Mặc định: mảng mã phân hệ đang bật. detail=true: manifest tóm tắt (id, key, kind, version, label, mô tả, năng lực cần, action, docType nộp sổ, giao diện) của phân hệ và add-in đang bật.',
      querystring: z.object({ detail: queryBool.optional(), view: z.enum(['tenant']).optional() }),
    },
    // [2026-11-02 04:20 PM Johnny Chu - Chu Hoàng Anh] PHASE-011 — 3.13 (CK-1): trừ module đơn vị đã tắt; view=tenant trả danh sách theo đơn vị (enabled, required); người không quản trị chỉ thấy module bật
    handler: async (req) => {
      const auth = authOf(req);
      const off = await disabledModules(auth.tenantId);
      const q = req.query as { detail?: boolean; view?: 'tenant' };
      if (q.view === 'tenant') {
        const admin = auth.permissions.has('users:write');
        const rows = app.moduleManifests.map((m) => ({
          key: m.key, kind: m.kind, label: m.label, description: m.description, version: m.version,
          icon: m.ui?.icon ?? null, color: m.ui?.color ?? null, order: m.ui?.order ?? null,
          source: m.kind, enabled: !off.has(m.key), required: REQUIRED_MODULES.has(m.key),
        }));
        return ok(admin ? rows : rows.filter((r) => r.enabled));
      }
      return ok(q.detail ? app.moduleManifests.filter((m) => !off.has(m.key)).map(summarize) : app.enabledModules.filter((k) => !off.has(k)));
    },
  });
  mountActions(app, moduleActions);
  mountActions(app, notifyActions);
  mountActions(app, queueActions);
  mountActions(app, policyActions); // PHASE-031 W3a

  // [2026-11-02 06:20 PM Johnny Chu - Chu Hoàng Anh] PHASE-011 — 3.17: chạy seed[] của manifest cho đơn vị (dữ liệu mẫu qua core.*.upsert)
  // @bizcity-route: nạp dữ liệu mẫu bằng cách gọi các action danh mục chuẩn (mỗi mục đã có bằng chứng riêng)
  app.post('/api/v1/system/modules/:key/seed', {
    preHandler: requirePermission('catalog:write'),
    schema: { tags: ['Hệ thống'], summary: 'Nạp dữ liệu mẫu của module (seed[] trong manifest) qua action danh mục chuẩn', params: z.object({ key: z.string().regex(/^[a-z][a-z0-9-]*$/) }), querystring: z.object({ dryRun: queryBool.optional() }) },
    handler: async (req) => {
      const { key } = req.params as { key: string };
      return ok(await runModuleSeed(key, authOf(req), { dryRun: (req.query as { dryRun?: boolean }).dryRun === true, requestId: req.id }));
    },
  });

  // [2026-11-09 02:35 PM kiennt] PHASE-028 — S028-16: xem kết quả so song song (bật / tắt, số đếm, lệch gần nhất của đơn vị) — số liệu để quyết chuyển hẳn sang bộ tính mới (D-AUTH-21)
  app.get('/api/v1/system/authz-shadow', {
    preHandler: requirePermission('users:write'),
    schema: { tags: ['Hệ thống'], summary: 'So song song phân quyền: bật / tắt cho đơn vị, số đếm của bản API này, lệch gần nhất của đơn vị' },
    handler: async (req) => {
      const { tenantId } = authOf(req);
      const { shadowEnabled, shadowStats, SHADOW_KEY } = await import('@bizcity/platform/core/authz/shadow');
      const stats = shadowStats(tenantId);
      return ok({ key: SHADOW_KEY, enabled: await shadowEnabled(tenantId), counters: stats.counters, recent: stats.recent });
    },
  });

  // [2026-11-02 05:30 PM Johnny Chu - Chu Hoàng Anh] PHASE-011 — 3.3: registry quyền — quyền Core + quyền module (nhóm theo module, vai trò mặc định, rủi ro)
  app.get('/api/v1/system/permissions', {
    preHandler: requirePermission('users:write'),
    schema: { tags: ['Hệ thống'], summary: 'Registry quyền: quyền Core và quyền module (nhóm theo module, vai trò mặc định, rủi ro)' },
    handler: async () => {
      const byModule = new Map<string, { key: string; label: string; roles: string[]; risk: string }[]>();
      for (const p of listModulePermissions()) byModule.set(p.module, [...(byModule.get(p.module) ?? []), { key: p.key, label: p.label, roles: p.roles ?? [], risk: p.risk ?? 'low' }]);
      return ok({ core: [...PERMISSIONS], modules: [...byModule].map(([module, permissions]) => ({ module, permissions })) });
    },
  });

  // [2026-11-09 02:00 PM kiennt] PHASE-028 — S028-14 (80 F9): cấu trúc CSDL chỉ cho người dùng đăng nhập (màn TI10), không cho khoá API / app
  app.get('/api/v1/system/schema', {
    preHandler: requireUser(),
    schema: { tags: ['Hệ thống'], summary: 'Cấu trúc cơ sở dữ liệu kèm giải thích' },
    handler: async () => ok(await readSchema()),
  });
  mountActions(app, systemWriteActions);
  mountActions(app, systemMoreWriteActions);
}

// [2026-11-03 04:00 AM Johnny Chu - Chu Hoàng Anh] PHASE-014 — W6 đợt 3 (SC-ACT-1): route ghi qua defineAction — quyền, kiểm input, idempotency, giao dịch, bằng chứng do runtime; đường dẫn / thân yêu cầu / mã 201 như cũ.
// Mã cũ trong handler chạy trong giao dịch của action (sameTx); service tự mở giao dịch có bản *In.
const anyOut = z.custom<object>((v) => typeof v === 'object' && v !== null);

export const systemWriteActions: AnyActionDef[] = [
  defineAction({
    id: 'core.posting-modes.update', title: 'Sửa chế độ ghi sổ theo loại chứng từ', tags: ['Hệ thống'],
    permission: 'settings:write', effect: 'write', sideEffects: ['settings'], idempotency: 'natural',
    input: postingModesSchema, output: anyOut,
    expose: { http: { method: 'PUT', path: '/api/v1/settings/posting-modes' }, mcp: false, ai: 'deny' },
    evidence: { objectType: 'posting_modes' },
    handler: async (ctx, input) => {
      const trx = ctx.data.tx;
      const auth = ctx.legacyAuth;
      await sameTx(trx, async (trx) => {
        const cur = await trx.selectFrom('tenants').select('settings').where('id', '=', auth.tenantId).executeTakeFirstOrThrow();
        const before = readPostingModes(cur.settings);
        const settings = { ...((cur.settings as Record<string, unknown>) ?? {}), postingModes: input };
        await trx.updateTable('tenants').set({ settings: JSON.stringify(settings) }).where('id', '=', auth.tenantId).execute();
        await writeAudit(trx, { tenantId: auth.tenantId, actor: auth.actor, action: 'settings.posting-modes', objectType: 'tenant', objectId: auth.tenantId, before, after: input });
      });
      return input;
    },
  }),
];

// [2026-11-03 08:00 AM Johnny Chu - Chu Hoàng Anh] PHASE-014 — W6 đợt 5 (SC-ACT-1): route ghi qua defineAction — quyền, kiểm input, idempotency, giao dịch, bằng chứng do runtime; đường dẫn / thân yêu cầu / mã 201 như cũ.
// Mã cũ trong handler chạy trong giao dịch của action (sameTx); service tự mở giao dịch có bản *In.


export const systemMoreWriteActions: AnyActionDef[] = [
  defineAction({
    id: 'core.data-lock.update', title: 'Sửa khoá dữ liệu theo ngày', tags: ['Hệ thống'],
    permission: 'settings:write', effect: 'write', sideEffects: ['settings'], idempotency: 'natural',
    input: dataLockSchema, output: anyOut,
    expose: { http: { method: 'PUT', path: '/api/v1/settings/data-lock' }, mcp: false, ai: 'deny' },
    evidence: { objectType: 'data_lock' },
    handler: async (ctx, input) => {
      const trx = ctx.data.tx;
      const auth = ctx.legacyAuth;
      const b = input;
      await sameTx(trx, async (trx) => {
        const cur = await trx.selectFrom('tenants').select('settings').where('id', '=', auth.tenantId).executeTakeFirstOrThrow();
        const before = readDataLock(cur.settings);
        const settings = { ...((cur.settings as Record<string, unknown>) ?? {}), dataLock: b };
        await trx.updateTable('tenants').set({ settings: JSON.stringify(settings) }).where('id', '=', auth.tenantId).execute();
        await writeAudit(trx, { tenantId: auth.tenantId, actor: auth.actor, action: 'settings.data-lock', objectType: 'tenant', objectId: auth.tenantId, before, after: b });
      });
      return { ...b, today: todayVN(), bypass: auth.permissions.has('documents:bypass-date-lock') };
    },
  }),
  // [2026-11-06 02:40 AM Nguyễn Văn Thủy] MENU — cài ảnh một khối; lưu ở tenants.settings.imageBlocks như logo
  defineAction({
    id: 'core.tenant.image-block', title: 'Cài ảnh một khối giao diện (máy tính, điện thoại)', tags: ['Hệ thống'],
    permission: 'settings:write', effect: 'write', sideEffects: ['settings'], idempotency: 'natural',
    input: z.object({
        key: z.string().regex(/^[a-z0-9-]{1,64}$/, 'Mã khối không hợp lệ'),
        /** Data URL ảnh; null = bỏ ảnh; không gửi = giữ nguyên. */
        desktop: z.string().max(IMAGE_BLOCK_MAX).nullable().optional(),
        mobile: z.string().max(IMAGE_BLOCK_MAX).nullable().optional(),
      }), output: anyOut,
    expose: { http: { method: 'PUT', path: '/api/v1/tenant/image-blocks/:key' }, mcp: false, ai: 'deny' },
    evidence: { objectType: 'tenant' },
    handler: async (ctx, input) => {
      const trx = ctx.data.tx;
      const auth = ctx.legacyAuth;
      for (const v of [input.desktop, input.mobile]) if (v && !IMAGE_DATA_URL.test(v)) throw Errors.validation('Ảnh phải là PNG, JPEG hoặc WebP');
      return sameTx(trx, async (trx) => {
        const cur = await trx.selectFrom('tenants').select('settings').where('id', '=', auth.tenantId).executeTakeFirstOrThrow();
        const settings = { ...((cur.settings as Record<string, unknown>) ?? {}) };
        const blocks = { ...((settings.imageBlocks as Record<string, Record<string, string>>) ?? {}) };
        const block = { ...(blocks[input.key] ?? {}) };
        for (const slot of ['desktop', 'mobile'] as const) {
          const v = input[slot];
          if (v === undefined) continue;
          if (v) block[slot] = v; else delete block[slot];
        }
        if (Object.keys(block).length) blocks[input.key] = block; else delete blocks[input.key];
        settings.imageBlocks = blocks;
        await trx.updateTable('tenants').set({ settings: JSON.stringify(settings) }).where('id', '=', auth.tenantId).execute();
        // Nhật ký chỉ ghi khối nào đổi, không chép nội dung ảnh.
        await writeAudit(trx, { tenantId: auth.tenantId, actor: auth.actor, action: 'tenant.image-block', objectType: 'tenant', objectId: auth.tenantId, after: { key: input.key, desktop: input.desktop === undefined ? 'giữ' : input.desktop ? 'cài' : 'bỏ', mobile: input.mobile === undefined ? 'giữ' : input.mobile ? 'cài' : 'bỏ' } });
        return blocks;
      });
    },
  }),
  defineAction({
    id: 'core.tenant.update', title: 'Sửa thông tin đơn vị (tên hiện ở đầu trang, trên phiếu in, báo cáo)', tags: ['Hệ thống'],
    permission: 'settings:write', effect: 'write', sideEffects: ['settings'], idempotency: 'natural',
    input: z.object({
        name: z.string().trim().min(1, 'Cần nhập tên đơn vị').max(255),
        taxCode: z.string().trim().max(32).default(''),
        address: z.string().trim().max(500).default(''),
        phone: z.string().trim().max(64).default(''),
        /** Logo: data URL ảnh; null = xoá logo; không gửi = giữ nguyên. */
        logo: z.string().max(420_000).nullable().optional(),
      }), output: anyOut,
    expose: { http: { method: 'PUT', path: '/api/v1/tenant' }, mcp: false, ai: 'deny' },
    evidence: { objectType: 'tenant' },
    handler: async (ctx, input) => {
      const trx = ctx.data.tx;
      const auth = ctx.legacyAuth;
      const b = input;
      if (b.taxCode && !/^\d{10}(-\d{3})?$/.test(b.taxCode)) throw Errors.validation('Mã số thuế gồm 10 chữ số (chi nhánh thêm -xxx)');
      if (b.logo && !/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(b.logo)) throw Errors.validation('Logo phải là ảnh PNG, JPEG hoặc WebP');
      const t = await sameTx(trx, async (trx) => {
        const cur = await trx.selectFrom('tenants').select('settings').where('id', '=', auth.tenantId).executeTakeFirstOrThrow();
        const settings = { ...((cur.settings as Record<string, unknown>) ?? {}) };
        if (b.logo !== undefined) { if (b.logo) settings.logo = b.logo; else delete settings.logo; }
        const row = await trx.updateTable('tenants').set({ name: b.name, tax_code: b.taxCode || null, address: b.address || null, phone: b.phone || null, settings: JSON.stringify(settings) })
          .where('id', '=', auth.tenantId).returning(['code', 'name', 'tax_code', 'address', 'phone', 'settings']).executeTakeFirstOrThrow();
        await writeAudit(trx, { tenantId: auth.tenantId, actor: auth.actor, action: 'tenant.update', objectType: 'tenant', objectId: auth.tenantId, after: { ...b, logo: b.logo === undefined ? undefined : b.logo ? `(ảnh ${b.logo.length} ký tự)` : null } });
        return row;
      });
      return tenantDto(t);
    },
  }),
];
