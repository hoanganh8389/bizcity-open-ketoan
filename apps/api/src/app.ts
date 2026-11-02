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

import { enabledModules, routesFor, MODULE_MANIFESTS } from './phan-he/index.js';
import { catalogNotifySubscriber, emitCatalogChanged, isCatalogWrite } from './modules/catalog/catalog-notify.js';
import { registerRequestContext } from './core/request-context.js';
import { collectOutboxMetrics, registerSubscribers, retentionSubscriber } from './core/events.js';
import { registerDiagnostics } from './modules/system/diagnostics.js';
import { LEDGER_DIAGNOSTICS, PERIOD_DIAGNOSTICS, PROFILE_DIAGNOSTICS, TAX_DIAGNOSTICS, conformanceNightlySubscriber, collectLedgerMetrics, collectPostingMetrics, collectTenantMetrics, documentNumbers, ledgerQuery, registerIncomingPreparer } from './kernel/public.js';
import { connectionService } from './modules/connections/connection.service.js';
import { registerLedgerReader } from './core/actions.js';
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
  registerCollector('ledger', collectLedgerMetrics);
  registerCollector('postings', () => collectPostingMetrics());
  registerCollector('outbox', collectOutboxMetrics);
  registerCollector('tenants', collectTenantMetrics, 15 * 60_000);
  registerLedgerReader((tx, tenantId, q) => ledgerQuery.query(tx, tenantId, q));
  // [2026-11-01 12:16 AM Johnny Chu - Chu Hoàng Anh] PHASE-010 — documents.numbering: bộ đếm document_sequences của Kernel cho ctx.documents.nextNumber
  registerDocumentNumberer((tx, tenantId, key, year) => documentNumbers.next(tx, tenantId, key, year));
  // [2026-11-01 03:40 PM Johnny Chu - Chu Hoàng Anh] PHASE-010 — adapter kết nối chuẩn hoá chứng từ đẩy vào bằng khoá API (trước: Kernel import thẳng adapter)
  registerIncomingPreparer((tenantId, raw) => connectionService.prepareIncoming(tenantId, raw));

  // Lõi + các phân hệ bật (ENABLED_MODULES) — xem src/phan-he/.
  // Hệ thống (người dùng, kết nối…) thuộc lõi — luôn báo là bật.
  app.decorate('enabledModules', [...new Set([...enabledModules(env.ENABLED_MODULES).map((m) => m.key), 'he-thong'])]);
  for (const routes of routesFor(env.ENABLED_MODULES)) {
    await app.register(routes);
  }

  // Add-in: mỗi add-in có không gian đường dẫn riêng.
  const addins = selectEnabled(BUILTIN_ADDINS, env.ADDINS);
  for (const addin of addins) {
    await app.register(
      async (scope) => {
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
