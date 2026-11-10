// @bizcity-layer M data/masterdata
// [2026-11-10 09:00 PM Nguyễn Văn Thủy] PHASE-026 — thiết kế hạch toán: lý do theo màn, sơ đồ dây chuyền, đổi nhóm hạch toán hàng loạt (đóng góp)
/**
 *   GET  /api/v1/posting-flow/screens                 các màn nghiệp vụ và lý do đã gán
 *   GET  /api/v1/posting-flow/screens/:key/reasons    lý do dùng được ở một màn (màn nhập liệu gọi)
 *   PUT  /api/v1/posting-flow/screens/:key/reasons    thay danh sách lý do của màn
 *   GET  /api/v1/posting-flow/flow?screen=&reason=&group=&taxCode=&method=&amount=&cost=&gift=   sơ đồ dây chuyền định khoản
 *   POST /api/v1/posting-flow/products/posting-group  đổi nhóm hạch toán hàng loạt (dryRun = xem trước)
 *   GET  /api/v1/posting-flow/history?kind=&limit=   lịch sử sửa cấu hình hạch toán, từng ô trước → sau
 *
 * Quy tắc định khoản (0096): ở posting-rules.routes.ts (lớp module, vì chạy thử gọi bộ định khoản của Kernel):
 *   GET    /api/v1/posting-rules/options              nghiệp vụ, khoản tiền, điều kiện dùng được; hình thức, thuế, loại hàng, chương trình
 *   GET    /api/v1/posting-rules/businesses           nghiệp vụ (hệ thống + tự tạo), số quy tắc đang áp / chờ duyệt
 *   POST   /api/v1/posting-rules/businesses           thêm nghiệp vụ tự tạo;  PUT /api/v1/posting-rules/businesses/:code  sửa
 *   GET    /api/v1/posting-rules?business=&state=     danh sách quy tắc
 *   POST   /api/v1/posting-rules                      đề xuất quy tắc / bản sửa (chờ duyệt)
 *   PUT    /api/v1/posting-rules/:id                  sửa đề xuất;  DELETE /api/v1/posting-rules/:id  xoá đề xuất
 *   POST   /api/v1/posting-rules/:id/approve          duyệt (quyền settings:write; tương tự /reject, /stop)
 *   POST   /api/v1/posting-rules/simulate             định khoản thử phiếu mẫu (có thể kèm quy tắc đề xuất)
 */
import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { db } from '../../db/client.js';
import { authOf, requirePermission } from '../../core/auth.js';
import { ok, queryBool } from '../../core/http.js';
import { defineAction, mountActions, type AnyActionDef } from '../../core/actions.js';
import { buildFlow, bulkPostingGroup, configHistory, listScreens, screenReasons, setScreenReasons } from './posting-flow.service.js';

const tags = ['Thiết kế hạch toán'];
const anyOut = z.any();
export async function postingFlowRoutes(app: FastifyInstance): Promise<void> {
  const r = app.withTypeProvider<ZodTypeProvider>();
  const read = requirePermission('catalog:read');

  r.get('/api/v1/posting-flow/screens', {
    preHandler: read,
    schema: { tags, summary: 'Các màn nghiệp vụ và lý do đã gán' },
    handler: async (req) => ok(await listScreens(db, authOf(req).tenantId)),
  });

  r.get('/api/v1/posting-flow/screens/:key/reasons', {
    preHandler: read,
    schema: { tags, summary: 'Lý do dùng được ở một màn', params: z.object({ key: z.string() }) },
    handler: async (req) => ok(await screenReasons(db, authOf(req).tenantId, req.params.key)),
  });

  r.get('/api/v1/posting-flow/flow', {
    preHandler: read,
    schema: {
      tags, summary: 'Sơ đồ dây chuyền định khoản của một lý do ở một màn',
      querystring: z.object({
        screen: z.string(), reason: z.string().optional(), group: z.string().optional(), taxCode: z.string().optional(), method: z.string().optional(),
        amount: z.coerce.number().positive().max(1e13).optional(), cost: z.coerce.number().min(0).max(1e13).optional(), gift: queryBool.optional(),
      }),
    },
    handler: async (req) => ok(await buildFlow(db, authOf(req).tenantId, req.query)),
  });

  // [2026-11-11 08:00 AM Nguyễn Văn Thủy] PHASE-026 — lịch sử sửa cấu hình hạch toán (đóng góp)
  r.get('/api/v1/posting-flow/history', {
    preHandler: read,
    schema: { tags, summary: 'Lịch sử sửa cấu hình hạch toán (mới nhất trước)',
      querystring: z.object({ kind: z.enum(['reason', 'group', 'defaults', 'tax', 'payment', 'screen', 'bulk', 'rule', 'business']).optional(), limit: z.coerce.number().int().min(1).max(1000).optional() }) },
    handler: async (req) => ok(await configHistory(db, authOf(req).tenantId, req.query)),
  });

  mountActions(app, postingFlowActions);
}

export const postingFlowActions: AnyActionDef[] = [
  defineAction({
    id: 'core.posting-flow.screen-reasons', title: 'Gán lý do cho một màn nghiệp vụ', tags,
    permission: 'settings:write', effect: 'write', sideEffects: ['settings'], idempotency: 'natural',
    input: z.object({ key: z.string(), reasons: z.array(z.object({ code: z.string().min(1), isDefault: z.boolean().optional() })).max(100) }), output: anyOut,
    expose: { http: { method: 'PUT', path: '/api/v1/posting-flow/screens/:key/reasons' }, mcp: false, ai: 'deny' },
    evidence: { objectType: 'screen_reasons', objectId: (i) => i.key },
    handler: async (ctx, i) => setScreenReasons(ctx.data.tx, ctx.tenant.id, ctx.legacyAuth.actor, i.key, i.reasons),
  }),
  defineAction({
    id: 'core.posting-flow.bulk-posting-group', title: 'Đổi nhóm hạch toán hàng loạt', tags,
    permission: 'catalog:write', effect: 'write', sideEffects: ['masterdata'], idempotency: 'natural',
    input: z.object({ targetGroup: z.string().min(1), classCode: z.string().optional(), fromGroup: z.string().optional(), search: z.string().max(100).optional(), dryRun: z.boolean().optional() }), output: anyOut,
    expose: { http: { method: 'POST', path: '/api/v1/posting-flow/products/posting-group' }, mcp: false, ai: 'deny' },
    evidence: { objectType: 'product_posting_group', objectId: (i) => i.targetGroup },
    handler: async (ctx, i) => bulkPostingGroup(ctx.data.tx, ctx.tenant.id, ctx.legacyAuth.actor, i),
  }),
];
