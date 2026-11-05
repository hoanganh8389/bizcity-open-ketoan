// @bizcity-layer M data/masterdata
// [2026-11-05 12:45 PM Nguyễn Văn Thủy] PHASE-024 — S026-22 (docs/core/06-xuong-ca-dinh-danh.md): đọc mặt hàng theo định danh hoặc mã, bản ghi ổn định cho hệ ngoài (đóng góp)
/**
 *   GET /api/v1/items/resolve?code=&asOf=&kind=   mã (sku, bí danh, mã vạch, external:<nguồn>) tại ngày → bản ghi ổn định
 *   GET /api/v1/items/:itemId                     bản ghi ổn định theo định danh; định danh đã gộp vẫn đọc được, có mergedIntoItemId và rootItemId
 * Lịch sử: GET /api/v1/lineage/items/:sku/history.
 */
import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { sql } from 'kysely';
import { z } from 'zod';
import { db, type Db } from '../../db/client.js';
import { mountActions } from '../../core/actions.js';
import { authOf, requirePermission } from '../../core/auth.js';
import { Errors } from '../../core/errors.js';
import { ok } from '../../core/http.js';
import { itemActions } from './item.actions.js';

const tags = ['Mặt hàng'];

/** Bản ghi ổn định: hệ ngoài lưu itemId, đọc sku hiện hành, thấy lịch sử mã và chuỗi gộp. */
async function itemRecord(trx: Db, tenantId: string, itemId: string) {
  const it = (await sql<{ item_id: string; name: string; unit_base: string; status: string; parent_item_id: string | null; merged_into_item_id: string | null; merged_at: string | null; root: string }>`
    SELECT item_id, name, unit_base, status, parent_item_id, merged_into_item_id, merged_at::text, bizcity_item_root(item_id) AS root
      FROM items WHERE tenant_id = ${tenantId} AND item_id = ${itemId}`.execute(trx)).rows[0];
  if (!it) throw Errors.notFound(`mặt hàng ${itemId}`);
  const codes = (await sql<{ kind: string; code: string; valid_from: string; valid_to: string | null }>`
    SELECT kind, code, valid_from::text, valid_to::text FROM item_codes WHERE tenant_id = ${tenantId} AND item_id = ${itemId} ORDER BY valid_from, id`.execute(trx)).rows;
  const open = codes.find((c) => c.kind === 'sku' && !c.valid_to);
  return {
    itemId: it.item_id, sku: open?.code ?? null, name: it.name, unitBase: it.unit_base, status: it.status,
    parentItemId: it.parent_item_id, mergedIntoItemId: it.merged_into_item_id, mergedAt: it.merged_at, rootItemId: it.root,
    codes: codes.map((c) => ({ kind: c.kind, code: c.code, validFrom: c.valid_from, validTo: c.valid_to })),
  };
}

export async function itemRoutes(app: FastifyInstance): Promise<void> {
  mountActions(app, itemActions);
  const r = app.withTypeProvider<ZodTypeProvider>();

  r.get('/api/v1/items/resolve', {
    preHandler: requirePermission('catalog:read'),
    schema: {
      tags, summary: 'Tra mã tại ngày ra bản ghi mặt hàng',
      querystring: z.object({
        code: z.string().trim().min(1).max(160), kind: z.string().trim().max(64).optional().describe('Bỏ trống = sku và bí danh'),
        asOf: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().describe('Bỏ trống = hôm nay'),
      }),
    },
    handler: async (req) => {
      const { tenantId } = authOf(req);
      const q = req.query;
      const asOf = q.asOf ?? (await sql<{ d: string }>`SELECT CURRENT_DATE::text AS d`.execute(db)).rows[0]!.d;
      const id = !q.kind || q.kind === 'sku' || q.kind === 'alias'
        ? (await sql<{ id: string | null }>`SELECT bizcity_item_at(${tenantId}::bigint, ${q.code}, ${asOf}::date) AS id`.execute(db)).rows[0]?.id
        : (await sql<{ id: string | null }>`
            SELECT bizcity_item_walk(c.item_id, ${asOf}::date) AS id FROM item_codes c
             WHERE c.tenant_id = ${tenantId} AND c.kind = ${q.kind} AND c.code = ${q.code}
               AND c.valid_from <= ${asOf}::date AND (c.valid_to IS NULL OR ${asOf}::date < c.valid_to) LIMIT 1`.execute(db)).rows[0]?.id;
      if (!id) throw Errors.notFound(`mã ${q.code}`);
      return ok(await itemRecord(db, tenantId, id));
    },
  });

  r.get('/api/v1/items/:itemId', {
    preHandler: requirePermission('catalog:read'),
    schema: { tags, summary: 'Đọc mặt hàng theo định danh', params: z.object({ itemId: z.string().regex(/^[0-9A-HJKMNP-TV-Z]{26}$/) }) },
    handler: async (req) => ok(await itemRecord(db, authOf(req).tenantId, req.params.itemId)),
  });
}
