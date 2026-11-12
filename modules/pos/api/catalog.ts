/**
 * Danh mục, giá, tồn cho máy bán (phiếu NT-BH-006) — đọc khung nhìn Core `bizcity_read.branch_prices` (giá đã áp luật DM14 theo
 * chi nhánh) và `bizcity_read.stock_on_hand` (tồn theo chi nhánh, 0109). Module không đọc bảng giá / sổ kho, không cài lại luật giá.
 * Chạy trong ctx.data.module: RLS lọc theo đơn vị.
 */
import { sql, type ActionContext } from '@bizcity/module-sdk';
import { VN_FROM, VN_TO, fold } from './customers.js';
import { catalogVersion, toProducts, type CatalogRow, type PosProduct } from './domain/catalog.js';

type Tx = Parameters<Parameters<ActionContext['data']['module']>[0]>[0];

type Filter = { all: true } | { skus: readonly string[] } | { q: string; limit: number } | { code: string };

async function rows(tx: Tx, branch: string, f: Filter): Promise<CatalogRow[]> {
  let where = sql``;
  if ('skus' in f) where = sql`AND p.sku IN (${sql.join(f.skus.length ? f.skus : [''])})`;
  if ('code' in f) where = sql`AND (p.sku = ${f.code} OR ${f.code} = ANY(string_to_array(coalesce(p.barcode, ''), '/')))`;
  if ('q' in f) {
    const words = fold(f.q).split(/\s+/).filter(Boolean).map((w) => `%${w}%`);
    where = sql`AND (p.sku ILIKE ${`%${f.q.trim()}%`} OR coalesce(p.barcode, '') ILIKE ${`%${f.q.trim()}%`}
                     OR translate(lower(p.name), ${VN_FROM}, ${VN_TO}) LIKE ALL (${words}::text[]))`;
  }
  // Mặt hàng chưa có dòng ĐVT ở danh mục vẫn hiện (giá rỗng, ĐVT của mặt hàng).
  const r = await sql<CatalogRow>`
    SELECT p.sku, p.name, p.unit AS base_unit, p.barcode, p.group_code, p.item_id, pp.item_id AS parent_item_id, p.variant_code,
           p.send_to_tax, p.tax_out_code AS tax_code, t.rate AS tax_rate, bp.unit, bp.ratio, bp.price, bp.is_default_unit
      FROM bizcity_read.products p
      LEFT JOIN bizcity_read.branch_prices bp ON bp.branch_code = ${branch} AND bp.sku = p.sku
      LEFT JOIN bizcity_read.products pp ON pp.sku = p.parent_sku
      LEFT JOIN bizcity_read.tax_codes t ON t.code = p.tax_out_code AND t.is_active IS NOT FALSE
     WHERE p.is_active IS NOT FALSE AND p.no_sale IS NOT TRUE ${where}
     ORDER BY p.sku, bp.ratio NULLS FIRST
     ${'q' in f ? sql`LIMIT ${f.limit * 4}` : sql``}`.execute(tx);
  return r.rows;
}

/** Phiên bản danh mục của chi nhánh (bootstrap.catalogVersion = snapshot.version): số mặt hàng bán được + lần sửa gần nhất (mặt hàng / ô giá). */
export async function catalogVersionOf(tx: Tx, branch: string): Promise<string> {
  const r = (await sql<{ n: string; t: Date | null }>`
    SELECT (SELECT count(*) FROM bizcity_read.products WHERE is_active IS NOT FALSE AND no_sale IS NOT TRUE) AS n,
           GREATEST((SELECT max(updated_at) FROM bizcity_read.products),
                    (SELECT max(updated_at) FROM bizcity_read.branch_prices WHERE branch_code = ${branch})) AS t`.execute(tx)).rows[0]!;
  return catalogVersion(Number(r.n), r.t);
}

export async function catalogSnapshot(tx: Tx, branch: string): Promise<{ items: PosProduct[]; version: string; cursor: string }> {
  const items = toProducts(await rows(tx, branch, { all: true }));
  const version = await catalogVersionOf(tx, branch);
  return { items, version, cursor: version };
}

export async function searchCatalog(tx: Tx, branch: string, q: string, limit = 50): Promise<PosProduct[]> {
  if (!q.trim()) return [];
  return toProducts(await rows(tx, branch, { q, limit })).slice(0, limit);
}

export async function productByCode(tx: Tx, branch: string, code: string): Promise<PosProduct | null> {
  return toProducts(await rows(tx, branch, { code: code.trim() }))[0] ?? null;
}

/** Tồn của chi nhánh theo mã (mọi kho của chi nhánh, ĐVT nhỏ nhất). Mã không có dòng sổ → 0. Chưa giữ chỗ (đơn QR chờ): held = 0. */
export async function stockOf(tx: Tx, branch: string, skus: readonly string[]): Promise<{ sku: string; available: number; held: number }[]> {
  const list = [...new Set(skus.map((s) => s.trim()).filter(Boolean))];
  if (!list.length) return [];
  const r = await sql<{ sku: string; qty: string }>`
    SELECT sku, SUM(qty) AS qty FROM bizcity_read.stock_on_hand WHERE branch_code = ${branch} AND sku IN (${sql.join(list)}) GROUP BY sku`.execute(tx);
  const got = new Map(r.rows.map((x) => [x.sku, Number(x.qty)]));
  return list.map((sku) => ({ sku, available: got.get(sku) ?? 0, held: 0 }));
}
