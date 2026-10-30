// @bizcity-layer P apps/api
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
import { BUILTIN_ADDINS } from './addins/index.js';

import { enabledModules, routesFor } from './phan-he/index.js';
import { catalogNotifySubscriber, emitCatalogChanged, isCatalogWrite } from './modules/catalog/catalog-notify.js';
import { registerRequestContext } from './core/request-context.js';
import { registerSubscribers, retentionSubscriber } from './core/events.js';
import { registerDiagnostics } from './modules/system/diagnostics.js';
import { LEDGER_DIAGNOSTICS } from './modules/ledger/ledger.diagnostics.js';
import { registerCollector } from './core/metrics.js';
import { collectLedgerMetrics } from './modules/ledger/ledger.metrics.js';



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
  registerSubscribers([retentionSubscriber, catalogNotifySubscriber]);
  // Danh mục hàng đổi (thêm / sửa / xoá mặt hàng, ĐVT, giá, bảng giá, nhóm hàng) → sự kiện → báo hệ thống bán hàng kéo về ngay.
  app.addHook('onResponse', async (req, reply) => {
    if (req.auth && isCatalogWrite(req.method, req.url, reply.statusCode)) {
      await emitCatalogChanged(req.auth).catch((err: unknown) => req.log.warn({ err: String(err) }, 'Phát sự kiện danh mục đổi: lỗi (hệ thống bán hàng vẫn tự kéo theo lịch)'));
    }
  });

  // Tự chẩn đoán: Kernel đăng ký kiểm sổ vào bộ chẩn đoán của Platform (Platform không import Kernel — LAYOUT-1).
  registerDiagnostics(LEDGER_DIAGNOSTICS);
  registerCollector('ledger', collectLedgerMetrics);

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

  return app;
}

declare module 'fastify' {
  interface FastifyInstance {
    addins: import('./core/addins.js').ApiAddIn[];
    /** Mã các phân hệ bật trong tiến trình này (ENABLED_MODULES). */
    enabledModules: string[];
  }
}
