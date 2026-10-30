// @bizcity-layer K kernel/seeds
/**
 * Dữ liệu gốc.
 *   GET  /api/v1/default-data                        các bộ dữ liệu gốc: số bản ghi trong tệp và đang có
 *   GET  /api/v1/default-data/:key/rows?search=      xem nội dung tệp gốc
 *   POST /api/v1/default-data/:key/restore { confirm: true }   quay về dữ liệu gốc (quyền settings:write)
 *   POST /api/v1/default-data/all/restore { confirm: true }    quay về toàn bộ theo thứ tự phụ thuộc
 */
import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { db } from '../../db/client.js';
import { authOf, requirePermission } from '../../core/auth.js';
import { ok } from '../../core/http.js';
import { Errors } from '../../core/errors.js';
import { writeAudit } from '../../core/audit.js';
import { DATASETS, datasetOf, readSeed, seedCount } from './default-data.service.js';

const tags = ['Dữ liệu gốc'];

export async function defaultDataRoutes(app: FastifyInstance): Promise<void> {
  const r = app.withTypeProvider<ZodTypeProvider>();

  r.get('/api/v1/default-data', {
    preHandler: requirePermission('catalog:read'),
    schema: { tags, summary: 'Các bộ dữ liệu gốc: số bản ghi trong tệp gốc và đang có trong phần mềm' },
    handler: async (req) => {
      const { tenantId } = authOf(req);
      const out = [];
      for (const d of DATASETS) {
        const desc = d.file.endsWith('.jsonl') ? readSeed(d.file).head._mo_ta : 'Hệ thống tài khoản: tên, tính chất, theo dõi chi tiết và các cờ tính chất của từng tài khoản.';
        out.push({ key: d.key, title: d.title, file: d.file, screens: d.screens, description: desc, seedCount: seedCount(d.file), currentCount: await d.current(db, tenantId) });
      }
      const items = readSeed('mat-hang-tai-khoan.jsonl').rows.length;
      return ok({ datasets: out, seedItems: items });
    },
  });

  r.get('/api/v1/default-data/:key/rows', {
    preHandler: requirePermission('catalog:read'),
    schema: { tags, summary: 'Nội dung tệp gốc của một bộ', params: z.object({ key: z.string() }), querystring: z.object({ search: z.string().optional(), file: z.enum(['main', 'items']).default('main') }) },
    handler: async (req) => {
      const d = datasetOf(req.params.key);
      const file = req.query.file === 'items' && d.key === 'posting_groups' ? 'mat-hang-tai-khoan.jsonl' : d.file;
      if (!file.endsWith('.jsonl')) throw Errors.validation('Bộ này lưu dạng CSV: xem ở danh mục Tài khoản');
      const { head, rows } = readSeed(file);
      const s = (req.query.search ?? '').trim().toLowerCase();
      const hit = s ? rows.filter((x) => JSON.stringify(x).toLowerCase().includes(s)) : rows;
      return ok({ columns: head._cot, total: rows.length, matched: hit.length, rows: hit });
    },
  });

  r.post('/api/v1/default-data/all/restore', {
    preHandler: requirePermission('settings:write'),
    schema: { tags, summary: 'Quay về dữ liệu gốc toàn bộ danh mục, theo thứ tự phụ thuộc', body: z.object({ confirm: z.literal(true) }) },
    handler: async (req) => {
      const auth = authOf(req);
      const res = await db.transaction().execute(async (trx) => {
        const out: { key: string; title: string; result: Awaited<ReturnType<(typeof DATASETS)[number]['restore']>> }[] = [];
        for (const d of DATASETS) out.push({ key: d.key, title: d.title, result: await d.restore(trx, auth.tenantId) });
        await writeAudit(trx, { tenantId: auth.tenantId, actor: auth.actor, action: 'default-data.restore-all', objectType: 'default_data', objectId: 'all', after: out.map((o) => ({ key: o.key, ...o.result, warnings: o.result.warnings.length })) });
        return out;
      });
      return ok(res);
    },
  });

  r.post('/api/v1/default-data/:key/restore', {
    preHandler: requirePermission('settings:write'),
    schema: { tags, summary: 'Quay về dữ liệu gốc cho một bộ (ghi đè theo tệp gốc)', params: z.object({ key: z.string() }), body: z.object({ confirm: z.literal(true) }) },
    handler: async (req) => {
      const auth = authOf(req);
      const d = datasetOf(req.params.key);
      const res = await db.transaction().execute(async (trx) => {
        const out = await d.restore(trx, auth.tenantId);
        await writeAudit(trx, { tenantId: auth.tenantId, actor: auth.actor, action: 'default-data.restore', objectType: 'default_data', objectId: d.key, after: out });
        return out;
      });
      return ok(res);
    },
  });
}
