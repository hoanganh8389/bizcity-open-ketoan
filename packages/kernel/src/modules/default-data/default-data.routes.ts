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
 * [2026-11-13 08:40 PM Johnny Chu - Chu Hoàng Anh] PHASE-036 — S036-8a: xem trước bắt buộc — gọi ?dryRun=1 lấy meta.previewToken, chạy thật gửi { confirm: true, previewToken };
 *   chạy thật chụp danh mục vào default_data_backups trước khi ghi (meta.backupId); bộ giả lập trên đơn vị có bút toán bị chặn.
 *   GET /api/v1/default-data/backups, GET /api/v1/default-data/backups/:id   các bản chụp gần nhất (10) / tải một bản
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
import { assertSameAsPreview, checkPreviewToken, digestOf, getBackup, guardSampleSeeds, issuePreviewToken, listBackups, setBackupResult, snapshotTables, tablesOf } from './default-data.safety.js';

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

// [2026-11-13 08:40 PM Johnny Chu - Chu Hoàng Anh] PHASE-036 — S036-8a: một lõi chạy cho cả xem trước (dryRun) và chạy thật — cùng hàm quay về, cùng giao dịch
type Ctx = Parameters<AnyActionDef['handler']>[0];
type Outcome = { key: string; title: string; result: RestoreResult };
async function runRestore(ctx: Ctx, scope: string, keys: string[], previewToken: string | undefined): Promise<Outcome[]> {
  const tx = ctx.data.tx;
  const tenantId = ctx.tenant.id;
  await guardSampleSeeds(tx, tenantId, keys);
  const previewDigest = ctx.dryRun ? null : checkPreviewToken(previewToken, tenantId, ctx.actor.id, scope);
  const backup = ctx.dryRun ? null : await snapshotTables(tx, tenantId, scope, ctx.actor.id, tablesOf(keys));
  const out: Outcome[] = [];
  for (const k of keys) { const d = datasetOf(k); out.push({ key: d.key, title: d.title, result: await d.restore(tx, tenantId) }); }
  if (ctx.dryRun) {
    ctx.meta('previewToken', issuePreviewToken(tenantId, ctx.actor.id, scope, digestOf(out)));
    ctx.meta('previewExpiresInSeconds', 900);
  } else {
    assertSameAsPreview(previewDigest!, out);
    await setBackupResult(tx, tenantId, backup!.id, out);
    ctx.meta('backupId', backup!.id);
    ctx.meta('backupRows', backup!.rowCount);
  }
  return out;
}

export const defaultDataActions: AnyActionDef[] = [
  defineAction({
    id: 'core.default-data.restore-all', title: 'Quay về dữ liệu gốc toàn bộ danh mục, theo thứ tự phụ thuộc (xem trước bằng ?dryRun=1)', tags,
    permission: 'settings:write', effect: 'write', sideEffects: ['masterdata'], idempotency: 'natural', dryRun: true,
    input: z.object({ confirm: z.literal(true), previewToken: z.string().max(200).optional() }),
    output: z.array(z.object({ key: z.string(), title: z.string(), result: restoreOut })),
    expose: { http: { method: 'POST', path: '/api/v1/default-data/all/restore' }, mcp: false, ai: 'deny' },
    evidence: { objectType: 'default_data', objectId: () => 'all' },
    handler: (ctx, { previewToken }) => runRestore(ctx, 'all', DATASETS.filter((x) => x.inAll !== false).map((d) => d.key), previewToken),
  }),
  defineAction({
    id: 'core.default-data.restore', title: 'Quay về dữ liệu gốc cho một bộ (ghi đè theo tệp gốc; xem trước bằng ?dryRun=1)', tags,
    permission: 'settings:write', effect: 'write', sideEffects: ['masterdata'], idempotency: 'natural', dryRun: true,
    input: z.object({ key: z.string(), confirm: z.literal(true), previewToken: z.string().max(200).optional() }), output: restoreOut,
    expose: { http: { method: 'POST', path: '/api/v1/default-data/:key/restore' }, mcp: false, ai: 'deny' },
    evidence: { objectType: 'default_data', objectId: (i) => i.key },
    handler: async (ctx, { key, previewToken }) => (await runRestore(ctx, datasetOf(key).key, [key], previewToken))[0]!.result,
  }),
  defineAction({
    id: 'core.default-data.backups', title: 'Các bản chụp danh mục trước những lần quay về dữ liệu gốc gần nhất', tags,
    permission: 'settings:write', effect: 'read', idempotency: 'none',
    input: z.object({}),
    output: z.array(z.object({ id: z.string(), datasetKey: z.string(), tables: z.array(z.string()), rowCount: z.number(), createdBy: z.string(), createdAt: z.string(), result: z.unknown() })),
    expose: { http: { method: 'GET', path: '/api/v1/default-data/backups' }, mcp: false, ai: 'deny' },
    handler: (ctx) => listBackups(ctx.data.tx, ctx.tenant.id),
  }),
  defineAction({
    id: 'core.default-data.backup', title: 'Tải một bản chụp danh mục (JSON các dòng trước khi quay về)', tags,
    permission: 'settings:write', effect: 'read', idempotency: 'none',
    input: z.object({ id: z.string() }),
    output: z.custom<Awaited<ReturnType<typeof getBackup>>>((v) => typeof v === 'object' && v !== null),
    expose: { http: { method: 'GET', path: '/api/v1/default-data/backups/:id' }, mcp: false, ai: 'deny' },
    handler: (ctx, { id }) => getBackup(ctx.data.tx, ctx.tenant.id, id),
  }),
];
