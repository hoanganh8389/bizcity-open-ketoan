// @bizcity-layer D modules/kho
// [2026-11-10 06:30 PM Nguyễn Văn Thủy] PHASE-026 — lô hàng: tồn theo lô, thẻ lô, phân lô của phiếu, phân lô lại (đóng góp)
/**
 *   GET  /api/v1/lots?search=&branchCode=&stock=&expWithin=   tồn theo lô (hạn dùng, tên lúc mua, tồn từng chi nhánh / kho)
 *   GET  /api/v1/lots/:id/moves                               thẻ lô: vào / ra ở chứng từ nào
 *   GET  /api/v1/lots/document?docKey=                        phân lô của một phiếu, tên kê khai theo lô
 *   GET  /api/v1/lots/suggest?branchCode=&warehouse=&date=&items=SKU*SL,SKU*SL   gợi ý lô khi lập phiếu xuất (hạn sớm trước)
 *   POST /api/v1/lots/rebuild                                 phân lô lại theo thứ tự ngày (cả đơn vị hoặc một mã)
 */
import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { db } from '../../db/client.js';
import { authOf, requirePermission } from '../../core/auth.js';
import { ok, queryBool } from '../../core/http.js';
import { defineAction, mountActions, type AnyActionDef } from '../../core/actions.js';
import { documentLots, listLots, lotMoves, rebuild, suggestLots } from './lots.service.js';

const tags = ['Lô hàng'];

export async function lotRoutes(app: FastifyInstance): Promise<void> {
  const r = app.withTypeProvider<ZodTypeProvider>();
  const read = requirePermission('reports:read');
  r.get('/api/v1/lots', {
    preHandler: read,
    schema: { tags, summary: 'Tồn theo lô', querystring: z.object({ search: z.string().max(100).optional(), branchCode: z.string().max(32).optional(), stock: queryBool.optional(), expWithin: z.coerce.number().int().min(-3650).max(3650).optional(), limit: z.coerce.number().int().min(1).max(5000).optional() }) },
    handler: async (req) => ok(await listLots(db, authOf(req).tenantId, req.query)),
  });
  r.get('/api/v1/lots/document', {
    preHandler: read,
    schema: { tags, summary: 'Phân lô của một phiếu, tên kê khai theo lô', querystring: z.object({ docKey: z.string().min(3).max(160) }) },
    handler: async (req) => ok(await documentLots(db, authOf(req).tenantId, req.query.docKey)),
  });
  r.get('/api/v1/lots/suggest', {
    preHandler: requirePermission('documents:read'),
    schema: { tags, summary: 'Gợi ý lô khi lập phiếu xuất: hạn sớm trước, cùng hạn nhập trước',
      querystring: z.object({ branchCode: z.string().min(1).max(32), warehouse: z.string().max(64).optional(), date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(), items: z.string().min(1).max(20000) }) },
    handler: async (req) => {
      const items = req.query.items.split(',').map((x) => x.trim()).filter(Boolean).slice(0, 500).map((x) => { const i = x.lastIndexOf('*'); return { sku: i > 0 ? x.slice(0, i) : x, qty: i > 0 ? Number(x.slice(i + 1)) || 0 : 0 }; }).filter((x) => x.sku && x.qty > 0);
      return ok(await suggestLots(db, authOf(req).tenantId, { branchCode: req.query.branchCode, warehouse: req.query.warehouse, date: req.query.date, items }));
    },
  });
  r.get('/api/v1/lots/:id/moves', {
    preHandler: read,
    schema: { tags, summary: 'Thẻ lô', params: z.object({ id: z.string().regex(/^\d+$/) }) },
    handler: async (req) => ok(await lotMoves(db, authOf(req).tenantId, req.params.id)),
  });
  mountActions(app, lotActions);
}

export const lotActions: AnyActionDef[] = [
  defineAction({
    id: 'core.lots.rebuild', title: 'Phân lô lại theo thứ tự ngày', tags,
    permission: 'settings:write', effect: 'write', sideEffects: ['masterdata'], idempotency: 'natural',
    input: z.object({ sku: z.string().max(64).optional() }), output: z.any(),
    expose: { http: { method: 'POST', path: '/api/v1/lots/rebuild' }, mcp: false, ai: 'deny' },
    evidence: { objectType: 'item_lots', objectId: (i) => i.sku ?? '*' },
    handler: async (ctx, i) => rebuild(ctx.data.tx, ctx.tenant.id, ctx.legacyAuth.actor, i.sku),
  }),
];
