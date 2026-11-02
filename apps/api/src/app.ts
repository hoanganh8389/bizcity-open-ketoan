// @bizcity-layer P apps/api
// [2026-10-29 10:24 PM Johnny Chu - Chu Hoàng Anh] INIT — khởi tạo Bizcity Core Framework: sổ cái chỉ thêm, cửa nạp sự việc, CANON, hợp đồng, bộ kiểm chuẩn.
// [2026-10-30 09:58 AM Johnny Chu - Chu Hoàng Anh] PHASE-002 — nhãn lớp @bizcity-layer, đồ thị phụ thuộc mốc, bản nháp API module-sdk.
// [2026-10-30 10:29 AM Johnny Chu - Chu Hoàng Anh] PHASE-003 — tự chẩn đoán L1 / L3, diagnostic_runs, khoá kỳ chặn khi sổ lỗi (PHASES 2.10).
// [2026-10-30 12:10 PM Johnny Chu - Chu Hoàng Anh] ADR-0007 — chuẩn hoá mã lỗi, quan sát, bộ giám sát, cài nhanh, kiến trúc, đóng góp.
// [2026-10-30 07:46 PM Johnny Chu - Chu Hoàng Anh] PHASE-006 — transactional outbox, subscriber, đồng hồ, correlation_id.
// [2026-10-30 09:36 PM Johnny Chu - Chu Hoàng Anh] PHASE-010 — cổng công khai apps/api/src/kernel/public.ts, SC-KERNEL-6: ngoài Kernel chỉ import qua cổng.
// [2026-10-31 08:14 PM Johnny Chu - Chu Hoàng Anh] PHASE-012 — ledger.query (PHASES 3.7, S012-2): đăng ký bộ đọc sổ của Kernel cho ctx.ledger.query.
// [2026-11-01 12:04 AM Johnny Chu - Chu Hoàng Anh] PHASE-018 — đăng ký bộ thu ghi sổ (60 s), outbox (60 s), đơn vị theo dải (15 phút).
/**
 * Dựng ứng dụng Fastify: plugin chung, xác thực, các module nghiệp vụ, add-in.
 *
 * Thêm một module mới:
 *   1. Tạo thư mục src/modules/<ten>/ với <ten>.schemas.ts, .repository.ts, .service.ts, .routes.ts
 *   2. Khai routes vào lõi hoặc phân hệ tương ứng ở src/phan-he/.
 */
import Fastify, { type FastifyInstance } from 'fastify';
import cors from '@fastify/cors';
import swagger from '@fastify/swagger';
import swaggerUi from '@fastify/swagger-ui';
import { jsonSchemaTransform, serializerCompiler, validatorCompiler } from 'fastify-type-provider-zod';
import { env } from './config/env.js';
import { db } from './db/client.js';
import { authPlugin } from './core/auth.js';
import { registerErrorHandler } from './core/http.js';
import { registerObservability } from './core/observability.js';
import { randomUUID } from 'node:crypto';
import { selectEnabled } from './core/addins.js';
import { BUILTIN_ADDINS, ADDIN_MANIFESTS } from './addins/index.js';

import { enabledModules, CORE_ROUTES, MODULE_MANIFESTS } from './phan-he/index.js';
import type { Routes } from './phan-he/types.js';
import { decideLoad, hashModuleDir, moduleGate, readRegistry, recordLoad, type LoadDecision } from '@bizcity/platform/core/module-registry';
import { bundledModules } from './core/module-lifecycle.js';
import { catalogNotifySubscriber, emitCatalogChanged, isCatalogWrite } from './modules/catalog/catalog-notify.js';
import { registerRequestContext } from './core/request-context.js';
import { collectOutboxMetrics, registerSubscribers, retentionSubscriber } from './core/events.js';
import { registerDiagnostics } from './modules/system/diagnostics.js';
import { ASSET_DIAGNOSTICS } from './modules/assets/asset.diagnostics.js';
import { BALANCE_DIAGNOSTICS, CONFORMANCE_DIAGNOSTICS, INVENTORY_DIAGNOSTICS, LEDGER_DIAGNOSTICS, PERIOD_DIAGNOSTICS, PROFILE_DIAGNOSTICS, TAX_DIAGNOSTICS, conformanceNightlySubscriber, collectLedgerMetrics, collectPostingMetrics, collectTenantMetrics, documentNumbers, ledgerQuery, registerIncomingPreparer, submitDocumentIn, requestCancelIn, documentStatusIn, allocateByDocKeysIn } from './kernel/public.js';
import { connectionService } from './modules/connections/connection.service.js';
import { registerLedgerCancelGate, registerLedgerReader, registerLedgerSubmitter, unknownActionPermissions } from './core/actions.js';
import { registerModulePermissions } from '@bizcity/platform/core/auth';
import { registerAppManifests } from '@bizcity/platform/core/apps';
import { APP_MANIFESTS } from './ung-dung/index.js';
import { registerDocumentNumberer } from './core/documents.js';
import { registerCollector } from './core/metrics.js';



export async function buildApp(): Promise<FastifyInstance> {
  const app = Fastify({
    logger: { level: env.NODE_ENV === 'test' ? 'silent' : env.LOG_LEVEL },
    // Mã yêu cầu (OBSERVABILITY §1): nhận X-Request-Id hợp lệ của bên gọi, không thì tự sinh. Log ghi một dòng/yêu cầu ở onResponse.
    genReqId: (raw) => {
      const h = raw.headers['x-request-id'];
      const v = Array.isArray(h) ? h[0] : h;
      return v && /^[A-Za-z0-9._:-]{8,128}$/.test(v) ? v : `req-${randomUUID().slice(0, 13)}`;
    },
    disableRequestLogging: true,
    bodyLimit: 20 * 1024 * 1024,
  });

  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);
  registerErrorHandler(app);
  registerRequestContext(app);
  registerObservability(app);

  await app.register(cors, {
    origin: env.CORS_ORIGINS.split(',').map((s) => s.trim()),
    credentials: true,
  });

  await app.register(swagger, {
    openapi: {
      info: {
        title: 'API ERP',
        version: '1.0.0',
        description:
          'API phần mềm kế toán. Xác thực bằng `Authorization: Bearer <token>` (người dùng) hoặc `X-Api-Key: <khoá>` (hệ thống tích hợp). Mọi phản hồi theo khuôn `{ ok, data | error }`.',
      },
      components: {
        securitySchemes: {
          bearer: { type: 'http', scheme: 'bearer' },
          apiKey: { type: 'apiKey', in: 'header', name: 'X-Api-Key' },
        },
      },
      security: [{ bearer: [] }, { apiKey: [] }],
    },
    transform: jsonSchemaTransform,
  });
  await app.register(swaggerUi, { routePrefix: '/api/docs' });

  await app.register(authPlugin);

  // Sự kiện miền (core/events.ts): subscriber của Platform. Vòng dispatcher + đồng hồ chạy ở main.ts, không chạy trong test.
  // [2026-11-02 02:40 PM Johnny Chu - Chu Hoàng Anh] PHASE-020 — Kiểm chuẩn mỗi đêm cho từng đơn vị (bizcity.clock.daily 01:00 giờ VN)
  registerSubscribers([retentionSubscriber, catalogNotifySubscriber, conformanceNightlySubscriber]);
  // Danh mục hàng đổi (thêm / sửa / xoá mặt hàng, ĐVT, giá, bảng giá, nhóm hàng) → sự kiện → báo hệ thống bán hàng kéo về ngay.
  app.addHook('onResponse', async (req, reply) => {
    if (req.auth && isCatalogWrite(req.method, req.url, reply.statusCode)) {
      await emitCatalogChanged(req.auth).catch((err: unknown) => req.log.warn({ err: String(err) }, 'Phát sự kiện danh mục đổi: lỗi (hệ thống bán hàng vẫn tự kéo theo lịch)'));
    }
  });

  // Tự chẩn đoán: Kernel đăng ký kiểm sổ vào bộ chẩn đoán của Platform (Platform không import Kernel — LAYOUT-1).
  registerDiagnostics(LEDGER_DIAGNOSTICS);
  // [2026-11-02 03:10 AM Johnny Chu - Chu Hoàng Anh] PHASE-020 — kiểm cấu hình tầng L5 (hồ sơ kế toán, gói cùng chế độ) cho Conformance Engine (ADR-0012)
  registerDiagnostics(PROFILE_DIAGNOSTICS);
  // [2026-11-02 10:45 AM Johnny Chu - Chu Hoàng Anh] PHASE-020 — kiểm L3 lớp Doanh nghiệp (tồn kho âm, việc cuối kỳ) cho Conformance Engine (S020-19)
  registerDiagnostics(PERIOD_DIAGNOSTICS);
  // [2026-11-02 06:10 PM Johnny Chu - Chu Hoàng Anh] PHASE-020 — S020-11: kiểm L3 thuế GTGT và hoá đơn (C03, C04)
  registerDiagnostics(TAX_DIAGNOSTICS);
  // [2026-11-02 08:40 PM Johnny Chu - Chu Hoàng Anh] PHASE-022 — W2: kiểm số dư, kho, khấu hao, lịch kiểm chuẩn (remedy có cấu trúc)
  registerDiagnostics([...BALANCE_DIAGNOSTICS, ...INVENTORY_DIAGNOSTICS, ...ASSET_DIAGNOSTICS, ...CONFORMANCE_DIAGNOSTICS]);
  registerCollector('ledger', collectLedgerMetrics);
  registerCollector('postings', () => collectPostingMetrics());
  registerCollector('outbox', collectOutboxMetrics);
  registerCollector('tenants', collectTenantMetrics, 15 * 60_000);
  registerLedgerReader((tx, tenantId, q) => ledgerQuery.query(tx, tenantId, q));
  // [2026-11-01 12:16 AM Johnny Chu - Chu Hoàng Anh] PHASE-010 — documents.numbering: bộ đếm document_sequences của Kernel cho ctx.documents.nextNumber
  registerDocumentNumberer((tx, tenantId, key, year) => documentNumbers.next(tx, tenantId, key, year));
  // [2026-11-01 03:40 PM Johnny Chu - Chu Hoàng Anh] PHASE-010 — adapter kết nối chuẩn hoá chứng từ đẩy vào bằng khoá API (trước: Kernel import thẳng adapter)
  registerIncomingPreparer((tenantId, raw) => connectionService.prepareIncoming(tenantId, raw));
  // [2026-11-02 12:30 AM Johnny Chu - Chu Hoàng Anh] PHASE-011 — ctx.ledger.submit đi đúng một cửa vào sổ của Kernel (submitDocumentIn → postDocumentIn), ADR-0011 D5
  registerLedgerSubmitter((tx, auth, doc) => submitDocumentIn(tx, auth, doc));
  // [2026-11-02 05:30 PM Johnny Chu - Chu Hoàng Anh] PHASE-011 — 3.1: ctx.ledger.cancel / get đi cổng Kernel (requestCancelIn, documentStatusIn)
  registerLedgerCancelGate({ cancel: (tx, auth, docKey, reason) => requestCancelIn(tx, auth, docKey, reason), get: (tx, tenantId, docKey) => documentStatusIn(tx, tenantId, docKey),
    allocate: (tx, tenantId, input, actor) => allocateByDocKeysIn(tx, tenantId, input, actor) });
  // [2026-11-02 10:43 AM Johnny Chu - Chu Hoàng Anh] PHASE-011 — 3.14: app ngoài tiến trình cài trong bản này (manifest kind "app") → registry + subscriber webhook; khoá trùng phân hệ / add-in → dừng
  registerAppManifests([...APP_MANIFESTS], [...MODULE_MANIFESTS.keys(), ...ADDIN_MANIFESTS.keys()]);

  // Lõi + các phân hệ bật (ENABLED_MODULES) — xem src/phan-he/.
  // Hệ thống (người dùng, kết nối…) thuộc lõi — luôn báo là bật.
  // [2026-11-02 04:20 PM Johnny Chu - Chu Hoàng Anh] PHASE-011 — 3.13 (ADR-0011 D1, D2): nạp phân hệ / add-in theo registry (active + hash khớp; lệch → bỏ riêng module, ghi last_load_result); route của module bọc cổng MODULE_DISABLED theo đơn vị
  // Registry bản cài (module_registry): chỉ nạp module active, hash thư mục khớp (bản thật). Trống → nạp như cũ + cảnh báo.
  const registry = await readRegistry();
  const enforceHash = env.NODE_ENV === 'production' && !env.BIZCITY_DEV_MODULES;
  const bundled = new Map(bundledModules().map((b) => [b.key, b]));
  const decisions = new Map<string, LoadDecision>();
  const decide = (key: string) => {
    const b = bundled.get(key);
    const d = b ? decideLoad(key, hashModuleDir(b.dir), registry, enforceHash) : { key, load: true, result: 'loaded' as const, hash: '' };
    if (d.warning) app.log[d.load ? 'warn' : 'error']({ module: key, result: d.result }, d.warning);
    decisions.set(key, d);
    return d.load;
  };
  const loaded = enabledModules(env.ENABLED_MODULES).filter((m) => decide(m.key));
  // [2026-11-02 05:30 PM Johnny Chu - Chu Hoàng Anh] PHASE-011 — 3.3: quyền module khai trong manifest permissions[] vào registry quyền (trước khi gắn route)
  for (const m of loaded) registerModulePermissions(m.key, MODULE_MANIFESTS.get(m.key)?.permissions ?? []);
  app.decorate('enabledModules', [...new Set([...loaded.map((m) => m.key), 'he-thong'])]);
  // Lõi: không cổng. Route của phân hệ: cổng theo đơn vị — route dùng chung chỉ bị chặn khi mọi phân hệ sở hữu đều tắt.
  const owners = new Map<Routes, string[]>();
  for (const m of loaded) for (const r of m.routes) if (!CORE_ROUTES.includes(r)) owners.set(r, [...(owners.get(r) ?? []), m.key]);
  for (const routes of CORE_ROUTES) await app.register(routes);
  for (const [routes, keys] of owners) {
    await app.register(async (scope) => {
      scope.addHook('preHandler', moduleGate(keys));
      await scope.register(routes);
    });
  }

  // Add-in: mỗi add-in có không gian đường dẫn riêng, cùng registry + cổng theo đơn vị.
  const addins = selectEnabled(BUILTIN_ADDINS, env.ADDINS).filter((a) => decide(a.manifest.id));
  for (const addin of addins) {
    await app.register(
      async (scope) => {
        scope.addHook('preHandler', moduleGate([addin.manifest.id]));
        await addin.register(scope, { db, log: app.log });
      },
      { prefix: `/api/v1/addins/${addin.manifest.id}` },
    );
    app.log.info(`Add-in bật: ${addin.manifest.id} ${addin.manifest.version}`);
  }
  app.decorate('addins', addins);
  // [2026-11-01 11:40 PM Johnny Chu - Chu Hoàng Anh] PHASE-011 — manifest của phân hệ / add-in đang bật (GET /api/v1/system/modules?detail=true)
  app.decorate('moduleManifests', [
    ...app.enabledModules.map((k) => MODULE_MANIFESTS.get(k)).filter((m) => m !== undefined),
    ...addins.map((a) => ADDIN_MANIFESTS.get(a.manifest.id)).filter((m) => m !== undefined),
  ]);
  // [2026-11-02 05:30 PM Johnny Chu - Chu Hoàng Anh] PHASE-011 — 3.3: action khai quyền không có trong Core / manifest → dừng khởi động (gõ sai, module chưa khai quyền)
  const unknownPerms = unknownActionPermissions();
  if (unknownPerms.length) throw new Error(`Action khai quyền chưa đăng ký: ${unknownPerms.map((u) => `${u.action} → ${u.permission}`).join(', ')} (khai ở permissions[] của manifest module)`);
  // Kết quả nạp vào registry (DG-MOD-1 đọc); module có trong registry mà mã không có → skipped_missing.
  await recordLoad([...decisions.values()].filter((d) => d.hash), registry ? [...registry.keys()].filter((k) => !bundled.has(k)) : []);

  return app;
}

declare module 'fastify' {
  interface FastifyInstance {
    addins: import('./core/addins.js').ApiAddIn[];
    /** Mã các phân hệ bật trong tiến trình này (ENABLED_MODULES). */
    enabledModules: string[];
    /** Manifest bizcity.module.json của phân hệ + add-in đang bật (PHASES 3.2). */
    moduleManifests: import('./core/module-manifest.js').ModuleManifest[];
  }
}
