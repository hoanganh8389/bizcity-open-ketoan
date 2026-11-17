// [2026-11-17 Nguyễn Văn Thủy] Thùng rác chung của danh mục (0146): Xoá → thùng rác; Khôi phục; Xoá vĩnh viễn; Xoá hết (mật khẩu) (đóng góp)
/**
 * THÙNG RÁC DANH MỤC — một cách làm cho mọi danh mục (biểu thuế, ĐVT, HTTT, tài khoản ngân hàng, hệ thống tài khoản,
 * khoản mục / mục thu chi / hợp đồng / vụ việc / công trình / nhân viên…, khách hàng, NCC, nhóm, loại tài sản,
 * nhóm hàng, mặt hàng, bảng giá):
 *   - Xoá: chụp nguyên dòng (to_jsonb, kèm bảng con: ĐVT, giá của mặt hàng) vào catalog_trash rồi xoá khỏi bảng.
 *     Dòng đang được chứng từ / sổ dùng (khoá ngoại) thì không xoá được — báo lại, các dòng khác vẫn xoá.
 *   - Khôi phục: chèn lại đúng dòng cũ (giữ id; mặt hàng giữ item_id — mở lại mã hàng đã đóng).
 *   - Xoá vĩnh viễn: bỏ khỏi thùng rác; mặt hàng: xoá luôn item_id, mã, phân loại nếu chưa có chứng từ dùng.
 *   - Xoá hết (cả danh mục) / Xoá hết vĩnh viễn (cả thùng rác): cần mật khẩu (CATALOG_WIPE_PASSWORD, mặc định trong mã).
 *
 *   GET  /api/v1/catalog-trash?catalog=…       thùng rác của một danh mục
 *   POST /api/v1/catalog-trash/trash           { catalog, keys[] } | { catalog, all: true, password }
 *   POST /api/v1/catalog-trash/restore         { catalog, ids[] } | { catalog, all: true }
 *   POST /api/v1/catalog-trash/purge           { catalog, ids[] } | { catalog, all: true, password }
 */
import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { sql } from 'kysely';
import { db, type Db } from '../../db/client.js';
import { authOf, requirePermission } from '../../core/auth.js';
import { ok } from '../../core/http.js';
import { Errors } from '../../core/errors.js';
import { writeAudit } from '../../core/audit.js';
import { defineAction, mountActions, type AnyActionDef } from '../../core/actions.js';

const tags = ['Thùng rác danh mục'];
const WIPE_PASSWORD = process.env.CATALOG_WIPE_PASSWORD || 'Thuy!@#';

interface Child { table: string; col: string; parentCol: string }
// [2026-11-17 07:30 PM kiennt] NT-DM-002 L02, L03 — trước khi xoá: còn mục con (cột cha cùng bảng) hoặc đang được danh mục khác trỏ tới
//   (không có khoá ngoại nên trước đây xoá lọt) thì bỏ qua dòng đó, báo lý do; dòng khác vẫn xoá (đóng góp)
/** Một chỗ trỏ tới mục sắp xoá: bảng.cột = giá trị (mặc định = khoá của mục; val: lấy cột khác của mục, vd tên ĐVT). */
interface Ref { table: string; cols: string[]; label: string; show: string; val?: string; onlyScope?: string }
interface Cat { label: string; table: string; key: string; name: string; scopeCol?: string; children?: Child[]; product?: boolean; parentCol?: string; refs?: Ref[]; /** Khoá là mã nội bộ (không hiện cho người dùng): báo theo tên. */ hienTen?: boolean }

const CATS: Record<string, Cat> = {
  'tax-codes': { label: 'Biểu thuế', table: 'tax_codes', key: 'code', name: 'name', refs: [{ table: 'products', cols: ['tax_out_code', 'tax_in_code'], label: 'mặt hàng', show: 'sku' }] },
  'unit-names': { label: 'Đơn vị tính', table: 'unit_names', key: 'id', name: 'name', refs: [{ table: 'product_units', cols: ['unit'], label: 'mặt hàng', show: 'sku', val: 'name' }] },
  'payment-methods': { label: 'Hình thức thanh toán', table: 'payment_methods', key: 'code', name: 'name' },
  'bank-accounts': { label: 'Tài khoản ngân hàng', table: 'bank_accounts', key: 'code', name: 'bank_name', refs: [{ table: 'payment_methods', cols: ['bank_account_code'], label: 'hình thức thanh toán', show: 'code' }] },
  accounts: {
    label: 'Hệ thống tài khoản', table: 'accounts', key: 'code', name: 'name', parentCol: 'parent_code',
    refs: [
      { table: 'tax_codes', cols: ['account_code'], label: 'biểu thuế', show: 'code' },
      { table: 'bank_accounts', cols: ['account_code'], label: 'tài khoản ngân hàng', show: 'code' },
      { table: 'payment_methods', cols: ['account_code'], label: 'hình thức thanh toán', show: 'code' },
      { table: 'posting_defaults', cols: ['account_code'], label: 'tài khoản ngầm định', show: 'account_code' },
      { table: 'product_posting_groups', cols: ['inventory_account', 'cogs_account', 'revenue_account', 'discount_account', 'sales_return_account'], label: 'nhóm hạch toán', show: 'code' },
      { table: 'warehouse_types', cols: ['account_prefix'], label: 'loại kho', show: 'code' },
    ],
  },
  dimensions: { label: 'Danh mục', table: 'dimensions', key: 'code', name: 'name', scopeCol: 'kind', parentCol: 'parent_code' },
  partners: { label: 'Đối tượng', table: 'partners', key: 'code', name: 'name', scopeCol: 'kind' },
  'partner-groups': { label: 'Nhóm khách hàng, nhà cung cấp', table: 'partner_groups', key: 'code', name: 'name', parentCol: 'parent_code', refs: [{ table: 'partners', cols: ['group_code'], label: 'đối tượng', show: 'code' }] },
  'asset-categories': { label: 'Loại tài sản', table: 'asset_categories', key: 'code', name: 'name' },
  'item-classes': {
    label: 'Nhóm hàng', table: 'item_classes', key: 'code', name: 'name', scopeCol: 'kind', parentCol: 'parent_code', hienTen: true,
    refs: [
      { table: 'products', cols: ['group_code'], label: 'mặt hàng', show: 'sku', onlyScope: 'group' },
      { table: 'products', cols: ['brand_code'], label: 'mặt hàng', show: 'sku', onlyScope: 'brand' },
      { table: 'products', cols: ['industry_code'], label: 'mặt hàng', show: 'sku', onlyScope: 'industry' },
      { table: 'products', cols: ['type_code'], label: 'mặt hàng', show: 'sku', onlyScope: 'type' },
    ],
  },
  'price-lists': { label: 'Bảng giá', table: 'price_lists', key: 'code', name: 'name', children: [{ table: 'product_prices', col: 'price_list_code', parentCol: 'code' }] },
  products: {
    label: 'Mặt hàng', table: 'products', key: 'sku', name: 'name', product: true,
    children: [{ table: 'product_units', col: 'sku', parentCol: 'sku' }, { table: 'product_prices', col: 'sku', parentCol: 'sku' }],
  },
};
/** Bảng cấu hình gắn theo item_id, gỡ cùng khi xoá vĩnh viễn mặt hàng. */
const ITEM_CHILDREN = ['supplier_item_aliases', 'supplier_products', 'stock_sku_settings', 'item_classification', 'item_codes'];

/** 'dimensions.contract' → danh mục + phạm vi. */
function resolve(catalog: string): { cat: Cat; scope?: string } {
  const [base, scope] = catalog.split('.');
  const cat = CATS[base ?? ''];
  if (!cat) throw Errors.validation(`Danh mục ${catalog} chưa có thùng rác`);
  if (scope !== undefined && (!cat.scopeCol || !/^[a-z_]{1,40}$/.test(scope))) throw Errors.validation(`Phạm vi ${scope} không hợp lệ`);
  return { cat, scope };
}

type Row = Record<string, unknown>;
const t = (name: string) => sql.table(name);
const c = (name: string) => sql.ref(name);

function reason(e: unknown): string {
  const err = e as { code?: string; table?: string; message?: string };
  if (err.code === '23503') return `đang được dùng (${err.table ?? 'chứng từ / sổ'}) — không xoá được, chỉ ngừng dùng`;
  if (err.code === '23505') return 'mã này đã có lại trong danh mục — đổi mã đang có rồi mới khôi phục';
  return err.message ?? String(e);
}

/** Lý do không được xoá dòng này (còn mục con / đang được trỏ tới), hoặc null. Mục con tính cùng phạm vi (vd cùng loại nhóm hàng). */
async function chanXoa(trx: Db, tenantId: string, cat: Cat, scope: string | undefined, row: Row): Promise<string | null> {
  const key = String(row[cat.key]);
  const nam = (ds: { k: string }[]) => ds.slice(0, 5).map((x) => x.k).join(', ') + (ds.length > 5 ? '…' : '');
  if (cat.parentCol) {
    const con = (await sql<{ k: string }>`SELECT x.${c(cat.hienTen ? cat.name : cat.key)}::text AS k FROM ${t(cat.table)} x WHERE x.tenant_id = ${tenantId} AND x.${c(cat.parentCol)} = ${key}
      ${cat.scopeCol ? sql`AND x.${c(cat.scopeCol)} = ${row[cat.scopeCol] as string}` : sql``} ORDER BY 1 LIMIT 6`.execute(trx)).rows;
    if (con.length) return `còn mục con (${nam(con)}) — xoá hoặc chuyển mục con trước`;
  }
  for (const r of cat.refs ?? []) {
    if (r.onlyScope && r.onlyScope !== (scope ?? row[cat.scopeCol ?? ''])) continue;
    const v = String(row[r.val ?? cat.key] ?? '');
    if (!v) continue;
    const dung = (await sql<{ k: string }>`SELECT DISTINCT x.${c(r.show)}::text AS k FROM ${t(r.table)} x WHERE x.tenant_id = ${tenantId}
      AND (${sql.join(r.cols.map((col) => sql`x.${c(col)} = ${v}`), sql` OR `)}) ORDER BY 1 LIMIT 6`.execute(trx)).rows;
    if (dung.length) return `đang được dùng ở ${r.label} (${nam(dung)}) — không xoá được, chỉ ngừng dùng`;
  }
  return null;
}

async function inSavepoint<T>(trx: Db, fn: () => Promise<T>): Promise<{ ok: true; v: T } | { ok: false; e: unknown }> {
  await sql`SAVEPOINT ct`.execute(trx);
  try { const v = await fn(); await sql`RELEASE SAVEPOINT ct`.execute(trx); return { ok: true, v }; }
  catch (e) { await sql`ROLLBACK TO SAVEPOINT ct`.execute(trx); return { ok: false, e }; }
}

const purgeFlag = (trx: Db) => sql`SELECT set_config('bizcity.catalog_purge', 'on', true)`.execute(trx);
const purgeFlagOff = (trx: Db) => sql`SELECT set_config('bizcity.catalog_purge', 'off', true)`.execute(trx);

async function listTrash(trx: Db, tenantId: string, catalog: string) {
  resolve(catalog);
  const rows = await trx.selectFrom('catalog_trash' as never).select(['id', 'row_key', 'label', 'deleted_by', 'deleted_at'] as never)
    .where('tenant_id' as never, '=', tenantId as never).where('catalog' as never, '=', catalog as never).orderBy('deleted_at' as never, 'desc').execute() as unknown as { id: string; row_key: string; label: string; deleted_by: string; deleted_at: Date }[];
  return rows.map((r) => ({ id: String(r.id), key: r.row_key, label: r.label, deletedBy: r.deleted_by, deletedAt: new Date(r.deleted_at).toISOString() }));
}

async function trashRows(trx: Db, tenantId: string, actor: string, i: { catalog: string; keys?: string[]; all?: boolean; password?: string }) {
  const { cat, scope } = resolve(i.catalog);
  if (i.all && i.password !== WIPE_PASSWORD) throw Errors.forbidden('Sai mật khẩu xoá hết');
  if (!i.all && !i.keys?.length) throw Errors.validation('Chưa chọn dòng nào để xoá');
  const rows = (await sql<{ j: Row }>`SELECT to_jsonb(x) AS j FROM ${t(cat.table)} x WHERE x.tenant_id = ${tenantId}
    ${scope ? sql`AND x.${c(cat.scopeCol!)} = ${scope}` : sql``}
    ${i.all ? sql`` : sql`AND x.${c(cat.key)}::text = ANY(${i.keys!})`}`.execute(trx)).rows.map((r) => r.j);
  const skipped: { key: string; reason: string }[] = [];
  let done = 0;
  // Xoá nhiều dòng một lượt: mỗi vòng xoá các dòng không bị chặn; dòng còn mục con chờ vòng sau (mục con có thể nằm cùng lượt xoá).
  let cho = rows;
  for (let vong = 0; cho.length && vong < 50; vong++) {
    const lai: { row: Row; ly: string }[] = [];
    for (const row of cho) {
      const key = String(row[cat.key]);
      const label = String(row[cat.name] ?? '');
      const ly = await chanXoa(trx, tenantId, cat, scope, row);
      if (ly) { lai.push({ row, ly }); continue; }
      const r = await inSavepoint(trx, async () => {
        const payload: Record<string, Row[]> = { [cat.table]: [row] };
        for (const ch of cat.children ?? []) {
          const kids = (await sql<{ j: Row }>`SELECT to_jsonb(x) AS j FROM ${t(ch.table)} x WHERE x.tenant_id = ${tenantId} AND x.${c(ch.col)} = ${row[ch.parentCol] as string}`.execute(trx)).rows.map((x) => x.j);
          if (kids.length) payload[ch.table] = kids;
          await sql`DELETE FROM ${t(ch.table)} WHERE tenant_id = ${tenantId} AND ${c(ch.col)} = ${row[ch.parentCol] as string}`.execute(trx);
        }
        await sql`DELETE FROM ${t(cat.table)} WHERE id = ${row.id as string}`.execute(trx);
        if (cat.product) await sql`INSERT INTO catalog_tombstones (tenant_id, entity, key) VALUES (${tenantId}, 'product', ${key})`.execute(trx);
        await sql`INSERT INTO catalog_trash (tenant_id, catalog, row_key, label, payload, deleted_by) VALUES (${tenantId}, ${i.catalog}, ${key}, ${label}, ${JSON.stringify(payload)}::jsonb, ${actor})`.execute(trx);
      });
      if (r.ok) done++; else skipped.push({ key, reason: reason(r.e) });
    }
    if (lai.length === cho.length) { for (const x of lai) skipped.push({ key: cat.hienTen ? String(x.row[cat.name] ?? x.row[cat.key]) : `${String(x.row[cat.key])} ${String(x.row[cat.name] ?? '')}`.trim(), reason: x.ly }); break; }
    cho = lai.map((x) => x.row);
  }
  await writeAudit(trx, { tenantId, actor, action: i.all ? 'catalog.trash_all' : 'catalog.trash', objectType: i.catalog, objectId: i.all ? '*' : (i.keys ?? []).join(',').slice(0, 200), after: { done, skipped: skipped.length } });
  return { done, skipped };
}

type TrashRow = { id: string; row_key: string; label: string; payload: Record<string, Row[]> };
async function pick(trx: Db, tenantId: string, catalog: string, ids?: string[], all?: boolean): Promise<TrashRow[]> {
  if (!all && !ids?.length) throw Errors.validation('Chưa chọn dòng nào trong thùng rác');
  return (await sql<TrashRow>`SELECT id, row_key, label, payload FROM catalog_trash WHERE tenant_id = ${tenantId} AND catalog = ${catalog}
    ${all ? sql`` : sql`AND id::text = ANY(${ids!})`} ORDER BY id`.execute(trx)).rows;
}

async function restoreRows(trx: Db, tenantId: string, actor: string, i: { catalog: string; ids?: string[]; all?: boolean }) {
  const { cat } = resolve(i.catalog);
  const rows = await pick(trx, tenantId, i.catalog, i.ids, i.all);
  const skipped: { key: string; reason: string }[] = [];
  let done = 0;
  for (const tr of rows) {
    const r = await inSavepoint(trx, async () => {
      const main = tr.payload[cat.table]?.[0];
      if (cat.product && main?.item_id) {
        // mở lại mã hàng đã đóng lúc xoá → dòng chèn lại nhận đúng item_id cũ
        await purgeFlag(trx);
        await sql`UPDATE item_codes SET valid_to = NULL WHERE tenant_id = ${tenantId} AND item_id = ${main.item_id as string} AND kind = 'sku' AND code = ${tr.row_key}
          AND valid_to = (SELECT max(valid_to) FROM item_codes WHERE tenant_id = ${tenantId} AND item_id = ${main.item_id as string} AND kind = 'sku' AND code = ${tr.row_key})
          AND NOT EXISTS (SELECT 1 FROM item_codes WHERE tenant_id = ${tenantId} AND kind = 'sku' AND code = ${tr.row_key} AND valid_to IS NULL)`.execute(trx);
        await sql`UPDATE items SET status = 'active', retired_at = NULL WHERE tenant_id = ${tenantId} AND item_id = ${main.item_id as string}`.execute(trx);
        await purgeFlagOff(trx);
      }
      for (const [table, list] of Object.entries(tr.payload)) {
        for (const row of list) await sql`INSERT INTO ${t(table)} OVERRIDING SYSTEM VALUE SELECT * FROM jsonb_populate_record(NULL::${t(table)}, ${JSON.stringify(row)}::jsonb)`.execute(trx);
      }
      await sql`DELETE FROM catalog_trash WHERE id = ${tr.id}`.execute(trx);
    });
    if (r.ok) done++; else skipped.push({ key: tr.row_key, reason: reason(r.e) });
  }
  await writeAudit(trx, { tenantId, actor, action: 'catalog.restore', objectType: i.catalog, objectId: i.all ? '*' : rows.map((x) => x.row_key).join(',').slice(0, 200), after: { done, skipped: skipped.length } });
  return { done, skipped };
}

async function purgeRows(trx: Db, tenantId: string, actor: string, i: { catalog: string; ids?: string[]; all?: boolean; password?: string }) {
  const { cat } = resolve(i.catalog);
  if (i.all && i.password !== WIPE_PASSWORD) throw Errors.forbidden('Sai mật khẩu xoá hết vĩnh viễn');
  const rows = await pick(trx, tenantId, i.catalog, i.ids, i.all);
  let done = 0, keptItems = 0;
  for (const tr of rows) {
    const itemId = cat.product ? (tr.payload[cat.table]?.[0]?.item_id as string | undefined) : undefined;
    if (itemId) {
      // gỡ hết định danh mặt hàng; mặt hàng đã có chứng từ / sổ thì giữ định danh (ngừng dùng), chỉ bỏ khỏi thùng rác
      const r = await inSavepoint(trx, async () => {
        await purgeFlag(trx);
        for (const tb of ITEM_CHILDREN) await sql`DELETE FROM ${t(tb)} WHERE tenant_id = ${tenantId} AND item_id = ${itemId}`.execute(trx);
        await sql`DELETE FROM items WHERE tenant_id = ${tenantId} AND item_id = ${itemId}`.execute(trx);
        await purgeFlagOff(trx);
      });
      if (!r.ok) { keptItems++; await purgeFlagOff(trx); }
    }
    if (rows.length <= 200) await writeAudit(trx, { tenantId, actor, action: 'catalog.purge', objectType: i.catalog, objectId: tr.row_key, before: tr.payload });
    await sql`DELETE FROM catalog_trash WHERE id = ${tr.id}`.execute(trx);
    done++;
  }
  if (rows.length > 200) await writeAudit(trx, { tenantId, actor, action: 'catalog.purge_all', objectType: i.catalog, objectId: '*', after: { done } });
  return { done, keptItems, skipped: [] as { key: string; reason: string }[] };
}

const catalogSchema = z.string().trim().min(1).max(80);
const actorOf = (ctx: { legacyAuth: { actorName?: string; actor: string } }) => ctx.legacyAuth.actorName || ctx.legacyAuth.actor;

export async function catalogTrashRoutes(app: FastifyInstance): Promise<void> {
  const r = app.withTypeProvider<ZodTypeProvider>();
  r.get('/api/v1/catalog-trash', {
    preHandler: requirePermission('catalog:read'),
    schema: { tags, summary: 'Thùng rác của một danh mục', querystring: z.object({ catalog: catalogSchema }) },
    handler: async (req) => ok(await listTrash(db, authOf(req).tenantId, req.query.catalog)),
  });
  mountActions(app, actions);
}

const actions: AnyActionDef[] = [
  defineAction({
    id: 'core.catalog-trash.trash', title: 'Xoá mục danh mục vào thùng rác (lưu nguyên dòng, khôi phục được)', tags,
    permission: 'catalog:write', effect: 'write', sideEffects: ['masterdata'], idempotency: 'natural',
    input: z.object({ catalog: catalogSchema, keys: z.array(z.string().max(200)).max(50000).optional(), all: z.boolean().optional(), password: z.string().max(200).optional() }), output: z.any(),
    expose: { http: { method: 'POST', path: '/api/v1/catalog-trash/trash', bodyLimit: 20 * 1024 * 1024 }, mcp: false, ai: 'deny' },
    evidence: { objectType: 'catalog_trash', objectId: (i) => i.catalog },
    handler: (ctx, i) => trashRows(ctx.data.tx as unknown as Db, ctx.tenant.id, actorOf(ctx), i),
  }),
  defineAction({
    id: 'core.catalog-trash.restore', title: 'Khôi phục mục danh mục từ thùng rác', tags,
    permission: 'catalog:write', effect: 'write', sideEffects: ['masterdata'], idempotency: 'natural',
    input: z.object({ catalog: catalogSchema, ids: z.array(z.string().max(30)).max(50000).optional(), all: z.boolean().optional() }), output: z.any(),
    expose: { http: { method: 'POST', path: '/api/v1/catalog-trash/restore', bodyLimit: 20 * 1024 * 1024 }, mcp: false, ai: 'deny' },
    evidence: { objectType: 'catalog_trash', objectId: (i) => i.catalog },
    handler: (ctx, i) => restoreRows(ctx.data.tx as unknown as Db, ctx.tenant.id, actorOf(ctx), i),
  }),
  defineAction({
    id: 'core.catalog-trash.purge', title: 'Xoá vĩnh viễn mục danh mục trong thùng rác (mặt hàng: gỡ cả item_id nếu chưa dùng)', tags,
    permission: 'settings:write', effect: 'write', sideEffects: ['masterdata'], idempotency: 'natural',
    input: z.object({ catalog: catalogSchema, ids: z.array(z.string().max(30)).max(50000).optional(), all: z.boolean().optional(), password: z.string().max(200).optional() }), output: z.any(),
    expose: { http: { method: 'POST', path: '/api/v1/catalog-trash/purge', bodyLimit: 20 * 1024 * 1024 }, mcp: false, ai: 'deny' },
    evidence: { objectType: 'catalog_trash', objectId: (i) => i.catalog },
    handler: (ctx, i) => purgeRows(ctx.data.tx as unknown as Db, ctx.tenant.id, actorOf(ctx), i),
  }),
];
