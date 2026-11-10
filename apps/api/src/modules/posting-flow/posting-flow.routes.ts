// @bizcity-layer M data/masterdata
// [2026-11-10 09:00 PM Nguyễn Văn Thủy] PHASE-026 — thiết kế hạch toán: lý do theo màn (đóng góp)
// [2026-11-11 Nguyễn Văn Thủy] PHASE-026 — bỏ màn Thiết kế hạch toán (ACC92): chỉ còn lý do dùng được ở một màn (đóng góp)
/**
 *   GET  /api/v1/posting-flow/screens/:key/reasons    lý do dùng được ở một màn (màn nhập liệu gọi, khi bật lý do hạch toán)
 *
 * Định khoản thêm ở Tài khoản ngầm định (ACC41): posting-rules.routes.ts.
 */
import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { db } from '../../db/client.js';
import { authOf, requirePermission } from '../../core/auth.js';
import { ok } from '../../core/http.js';
import { screenReasons } from './posting-flow.service.js';

const tags = ['Tài khoản ngầm định'];
export async function postingFlowRoutes(app: FastifyInstance): Promise<void> {
  const r = app.withTypeProvider<ZodTypeProvider>();
  r.get('/api/v1/posting-flow/screens/:key/reasons', {
    preHandler: requirePermission('catalog:read'),
    schema: { tags, summary: 'Lý do dùng được ở một màn', params: z.object({ key: z.string() }) },
    handler: async (req) => ok(await screenReasons(db, authOf(req).tenantId, req.params.key)),
  });
}
