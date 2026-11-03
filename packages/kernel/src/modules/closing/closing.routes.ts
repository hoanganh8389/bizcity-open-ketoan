// @bizcity-layer K kernel/closing
// [2026-10-29 10:24 PM Johnny Chu - Chu Hoàng Anh] INIT — khởi tạo Bizcity Core Framework: sổ cái chỉ thêm, cửa nạp sự việc, CANON, hợp đồng, bộ kiểm chuẩn.
// [2026-10-30 09:58 AM Johnny Chu - Chu Hoàng Anh] PHASE-002 — nhãn lớp @bizcity-layer, đồ thị phụ thuộc mốc, bản nháp API module-sdk.
// [2026-11-01 04:39 PM Johnny Chu - Chu Hoàng Anh] PHASE-010 — dời từ apps/api/src/modules/closing/closing.routes.ts sang packages/kernel (@bizcity/kernel, D010-7 chặng 3); import Platform qua @bizcity/platform
/**
 * Kết chuyển lãi lỗ.
 *   GET  /api/v1/closing/rules      danh sách bút toán kết chuyển mẫu
 *   PUT  /api/v1/closing/rules      thay danh sách bút toán kết chuyển mẫu     (quyền settings:write; khác bộ cũ thì thêm phiên bản)
 *   GET  /api/v1/closing/rules/versions  lịch sử phiên bản bút toán kết chuyển mẫu
 *   POST /api/v1/closing/preview    xem trước bút toán sẽ sinh, lãi lỗ từng chi nhánh
 *   POST /api/v1/closing/run        kết chuyển / kết chuyển lại                  (quyền periods:lock)
 *   GET  /api/v1/closing/runs       các lần kết chuyển của một năm (kèm phiên bản quy tắc, tóm tắt nguồn, lý do lỗi thời)
 *   GET  /api/v1/closing/runs/:id/sources  bút toán nguồn của một lần kết chuyển theo đầu số tài khoản
 *   POST /api/v1/closing/year-end   kết chuyển lợi nhuận năm trước 4212 → 4211 (đầu năm mới; dryRun = xem trước)
 * Huỷ một lần kết chuyển: POST /api/v1/documents/cancel với docKey của nó.
 * Action: core.closing-rules.save, core.closing.preview (W6, SC-ACT-1).
 */
import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { closingRulesSaveSchema, closingRunSchema, yearEndRunSchema } from '@ketoan/contracts';
import { authOf, requirePermission } from '@bizcity/platform/core/auth';
import { idParamSchema, ok } from '@bizcity/platform/core/http';
import { defineAction, mountActions, type AnyActionDef } from '@bizcity/platform/core/actions';
import { closingService } from './closing.service.js';

const tags = ['Kết chuyển'];

export async function closingRoutes(app: FastifyInstance): Promise<void> {
  const r = app.withTypeProvider<ZodTypeProvider>();

  r.get('/api/v1/closing/rules', {
    preHandler: requirePermission('reports:read'),
    schema: { tags, summary: 'Bút toán kết chuyển mẫu' },
    handler: async (req) => ok(await closingService.listRules(authOf(req))),
  });

  r.get('/api/v1/closing/rules/versions', {
    preHandler: requirePermission('reports:read'),
    schema: { tags, summary: 'Lịch sử phiên bản bút toán kết chuyển mẫu' },
    handler: async (req) => ok(await closingService.listRuleVersions(authOf(req))),
  });

  r.post('/api/v1/closing/run', {
    preHandler: requirePermission('periods:lock'),
    schema: { tags, summary: 'Kết chuyển lãi lỗ (chạy lại thì bút toán cũ được đảo)', body: closingRunSchema },
    handler: async (req) => ok(await closingService.run(authOf(req), req.body)),
  });

  r.post('/api/v1/closing/year-end', {
    preHandler: requirePermission('periods:lock'),
    schema: { tags, summary: 'Kết chuyển lợi nhuận năm trước (4212 → 4211) khi sang năm mới', body: yearEndRunSchema },
    handler: async (req) => ok(await closingService.yearEnd(authOf(req), req.body)),
  });

  r.get('/api/v1/closing/runs', {
    preHandler: requirePermission('reports:read'),
    schema: {
      tags, summary: 'Các lần kết chuyển: theo năm, hoặc theo khoảng ngày chứng từ',
      querystring: z.object({ year: z.coerce.number().int().min(2000).max(2100).optional(), from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(), to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional() }),
    },
    handler: async (req) => ok(await closingService.listRuns(authOf(req), req.query)),
  });

  r.get('/api/v1/closing/runs/:id/sources', {
    preHandler: requirePermission('reports:read'),
    schema: {
      tags, summary: 'Bút toán nguồn của một lần kết chuyển',
      params: idParamSchema,
      querystring: z.object({ account: z.string().trim().min(1).max(20), page: z.coerce.number().int().min(1).default(1) }),
    },
    handler: async (req) => ok(await closingService.runSources(authOf(req), req.params.id, req.query)),
  });
  mountActions(app, closingActions);
}

// [2026-11-03 02:55 AM Johnny Chu - Chu Hoàng Anh] PHASE-014 — W6 đợt 2 (SC-ACT-1): lưu bút toán kết chuyển mẫu, xem trước qua defineAction. Kết chuyển / kết chuyển năm (run, year-end) còn là route:
// mỗi chi nhánh, mỗi kỳ một giao dịch riêng (lỗi một chi nhánh không chặn chi nhánh khác) — chờ action dạng lô.
const anyObject = z.custom<object>((v) => typeof v === 'object' && v !== null);

export const closingActions: AnyActionDef[] = [
  defineAction({
    id: 'core.closing-rules.save', title: 'Thay danh sách bút toán kết chuyển mẫu', tags,
    description: 'Khác bộ đang dùng thì ghi thêm một phiên bản; giống hệt thì không đổi gì.',
    permission: 'settings:write', effect: 'write', sideEffects: ['settings'], idempotency: 'natural',
    input: closingRulesSaveSchema, output: anyObject,
    expose: { http: { method: 'PUT', path: '/api/v1/closing/rules' }, mcp: false, ai: 'deny' },
    evidence: { objectType: 'closing_rules', objectId: () => 'rules' },
    handler: async (ctx, b) => {
      const changed = await closingService.saveRulesIn(ctx.data.tx, ctx.legacyAuth, b.rules, b.note);
      if (changed) ctx.evidence.note('before', changed.before);
      return closingService.listRulesIn(ctx.data.tx, ctx.tenant.id);
    },
  }),
  defineAction({
    id: 'core.closing.preview', title: 'Xem trước kết chuyển', tags,
    description: 'Bút toán sẽ sinh, lãi lỗ từng chi nhánh, tháng trước chưa kết chuyển, kết chuyển cũ đã lỗi thời. Không ghi gì.',
    permission: 'reports:read', effect: 'read', idempotency: 'none',
    input: closingRunSchema, output: z.array(anyObject),
    expose: { http: { method: 'POST', path: '/api/v1/closing/preview' }, mcp: false, ai: 'read' },
    handler: (ctx, b) => closingService.preview(ctx.legacyAuth, b),
  }),
];
