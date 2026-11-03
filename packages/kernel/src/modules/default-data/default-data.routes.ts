// @bizcity-layer K kernel/seeds
// [2026-10-29 10:24 PM Johnny Chu - Chu Hoàng Anh] INIT — khởi tạo Bizcity Core Framework: sổ cái chỉ thêm, cửa nạp sự việc, CANON, hợp đồng, bộ kiểm chuẩn.
// [2026-10-30 09:58 AM Johnny Chu - Chu Hoàng Anh] PHASE-002 — nhãn lớp @bizcity-layer, đồ thị phụ thuộc mốc, bản nháp API module-sdk.
// [2026-11-01 04:39 PM Johnny Chu - Chu Hoàng Anh] PHASE-010 — dời từ apps/api/src/modules/default-data/default-data.routes.ts sang packages/kernel (@bizcity/kernel, D010-7 chặng 3); import Platform qua @bizcity/platform
/**
 * Dữ liệu gốc.
 *   GET  /api/v1/default-data                        các bộ dữ liệu gốc: số bản ghi trong tệp và đang có
 *   GET  /api/v1/default-data/:key/rows?search=      xem nội dung tệp gốc
 *   POST /api/v1/default-data/:key/restore { confirm: true }   quay về dữ liệu gốc (quyền settings:write)
 *   POST /api/v1/default-data/all/restore { confirm: true }    quay về toàn bộ theo thứ tự phụ thuộc
 * Ghi: action core.default-data.{restore,restore-all} (W6, SC-ACT-1).
 */
import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { db } from '@bizcity/platform/db/client';
import { authOf, requirePermission } from '@bizcity/platform/core/auth';
import { ok } from '@bizcity/platform/core/http';
import { Errors } from '@bizcity/platform/core/errors';
import { defineAction, mountActions, type AnyActionDef } from '@bizcity/platform/core/actions';
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

  mountActions(app, defaultDataActions);
}

// [2026-11-03 02:30 AM Johnny Chu - Chu Hoàng Anh] PHASE-014 — W6 đợt 2 (SC-ACT-1): quay về dữ liệu gốc qua defineAction (quyền settings:write, xác nhận confirm: true như cũ); bằng chứng do runtime
type RestoreResult = Awaited<ReturnType<(typeof DATASETS)[number]['restore']>>;
const restoreOut = z.custom<RestoreResult>((v) => typeof v === 'object' && v !== null);

export const defaultDataActions: AnyActionDef[] = [
  defineAction({
    id: 'core.default-data.restore-all', title: 'Quay về dữ liệu gốc toàn bộ danh mục, theo thứ tự phụ thuộc', tags,
    permission: 'settings:write', effect: 'write', sideEffects: ['masterdata'], idempotency: 'natural',
    input: z.object({ confirm: z.literal(true) }),
    output: z.array(z.object({ key: z.string(), title: z.string(), result: restoreOut })),
    expose: { http: { method: 'POST', path: '/api/v1/default-data/all/restore' }, mcp: false, ai: 'deny' },
    evidence: { objectType: 'default_data', objectId: () => 'all' },
    handler: async (ctx) => {
      const out: { key: string; title: string; result: RestoreResult }[] = [];
      for (const d of DATASETS) out.push({ key: d.key, title: d.title, result: await d.restore(ctx.data.tx, ctx.tenant.id) });
      return out;
    },
  }),
  defineAction({
    id: 'core.default-data.restore', title: 'Quay về dữ liệu gốc cho một bộ (ghi đè theo tệp gốc)', tags,
    permission: 'settings:write', effect: 'write', sideEffects: ['masterdata'], idempotency: 'natural',
    input: z.object({ key: z.string(), confirm: z.literal(true) }), output: restoreOut,
    expose: { http: { method: 'POST', path: '/api/v1/default-data/:key/restore' }, mcp: false, ai: 'deny' },
    evidence: { objectType: 'default_data', objectId: (i) => i.key },
    handler: (ctx, { key }) => datasetOf(key).restore(ctx.data.tx, ctx.tenant.id),
  }),
];
