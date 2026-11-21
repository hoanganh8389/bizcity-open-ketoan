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

// [2026-11-17 Võ Hoàng] NGHIEM-THU — NT-BH-023 Q11 (sửa Q5 NT-BH-021): máy bán kiểm / hiện tồn theo kho mặc định của cửa hàng (đóng góp)
/**
 * Kho bán của cửa hàng = kho mặc định đang dùng (không có thì kho đang dùng duy nhất); trống = chi nhánh chưa khai kho → tính cả
 * chi nhánh như trước. Hàng đã chuyển sang kho khác (vd kho KCB giữ cho đơn đặt hàng) không còn bán được ở máy bán.
 */
export async function saleWarehouseOf(tx: Tx, branch: string): Promise<string> {
  const ws = (await sql<{ code: string; is_default: boolean | null; is_active: boolean | null }>`
    SELECT code, is_default, is_active FROM bizcity_read.warehouses WHERE branch_code = ${branch} ORDER BY code`.execute(tx)).rows;
  const active = ws.filter((w) => w.is_active !== false);
  return (active.find((w) => w.is_default) ?? (active.length === 1 ? active[0] : undefined))?.code ?? '';
}

/** Điều kiện kho bán trên stock_on_hand: kho mặc định (gồm dòng thẻ kho cũ không ghi kho); chưa khai kho → không lọc. */
export const saleWarehouseFilter = (wh: string) => (wh ? sql`AND coalesce(warehouse_code, '') IN (${wh}, '')` : sql``);

/** Tồn bán được của chi nhánh theo mã (kho mặc định, ĐVT nhỏ nhất). Mã không có dòng sổ → 0. Chưa giữ chỗ (đơn QR chờ): held = 0. */
export async function stockOf(tx: Tx, branch: string, skus: readonly string[]): Promise<{ sku: string; available: number; held: number }[]> {
  const list = [...new Set(skus.map((s) => s.trim()).filter(Boolean))];
  if (!list.length) return [];
  const wh = await saleWarehouseOf(tx, branch);
  const r = await sql<{ sku: string; qty: string }>`
    SELECT sku, SUM(qty) AS qty FROM bizcity_read.stock_on_hand WHERE branch_code = ${branch} AND sku IN (${sql.join(list)}) ${saleWarehouseFilter(wh)} GROUP BY sku`.execute(tx);
  const got = new Map(r.rows.map((x) => [x.sku, Number(x.qty)]));
  return list.map((sku) => ({ sku, available: got.get(sku) ?? 0, held: 0 }));
}

// [2026-11-18 Võ Hoàng] NGHIEM-THU — NT-BH-028: tồn theo mặt hàng × kho — quà ở kho quà KKM, hàng bán ở kho bán, không cộng chung (đóng góp)
/** Tồn của một kho phụ (kho quà KKM): đúng mã kho, không gồm dòng thẻ kho cũ không ghi kho (dòng đó thuộc kho bán). */
export async function stockAtWarehouse(tx: Tx, branch: string, warehouse: string, skus: readonly string[]): Promise<{ sku: string; available: number; held: number }[]> {
  const list = [...new Set(skus.map((s) => s.trim()).filter(Boolean))];
  if (!list.length) return [];
  const r = await sql<{ sku: string; qty: string }>`
    SELECT sku, SUM(qty) AS qty FROM bizcity_read.stock_on_hand
     WHERE branch_code = ${branch} AND sku IN (${sql.join(list)}) AND warehouse_code = ${warehouse} GROUP BY sku`.execute(tx);
  const got = new Map(r.rows.map((x) => [x.sku, Number(x.qty)]));
  return list.map((sku) => ({ sku, available: got.get(sku) ?? 0, held: 0 }));
}

/**
 * Kho bán / kho quà của cửa hàng (NT-BH-028). Kho quà = kho khai ở khoá bizcity.pos.gift_warehouses, phải thuộc cửa hàng, đang dùng,
 * là kho khuyến mại (loại KKM ⇔ is_promo) và khác kho bán. Chưa khai → gift null (quà trừ kho bán như cũ). Khai sai → gift null + issue.
 */
export async function warehousesFor(tx: Tx, branch: string, giftMap: ReadonlyMap<string, string>): Promise<{ sale: string; gift: string | null; issue?: string }> {
  const sale = await saleWarehouseOf(tx, branch);
  const code = giftMap.get(branch);
  if (!code) return { sale, gift: null };
  const w = (await sql<{ is_active: boolean | null; is_promo: boolean | null }>`
    SELECT is_active, is_promo FROM bizcity_read.warehouses WHERE branch_code = ${branch} AND code = ${code}`.execute(tx)).rows[0];
  if (!w) return { sale, gift: null, issue: `kho ${code} không thuộc cửa hàng ${branch}` };
  if (w.is_active === false) return { sale, gift: null, issue: `kho ${code} đã ngừng dùng` };
  if (w.is_promo !== true) return { sale, gift: null, issue: `kho ${code} không phải kho khuyến mại (loại KKM)` };
  if (code === sale) return { sale, gift: null, issue: `kho ${code} là kho bán` };
  return { sale, gift: code };
}

// [2026-11-21 Võ Hoàng] NGHIEM-THU — NT-BH-035 §3.3: mặt hàng dịch vụ không ghi thẻ kho (Kernel) → máy bán không kiểm tồn dòng dịch vụ (đóng góp)
/**
 * Mã là mặt hàng dịch vụ tại ngày `day` (YYYY-MM-DD): phân loại có hiệu lực của định danh mặt hàng (khung nhìn bizcity_read.item_kinds,
 * 0178) là `service`. Cùng căn cứ Kernel dùng để không ghi thẻ kho. Mã chưa phân loại / không có định danh → không phải dịch vụ.
 */
export async function serviceSkus(tx: Tx, skus: readonly string[], day: string): Promise<Set<string>> {
  const list = [...new Set(skus.map((s) => s.trim()).filter(Boolean))];
  if (!list.length) return new Set();
  // Core cũ (chưa có 0178) / module chưa chạy lại "module migrate" (chưa được cấp khung nhìn) → như cũ: không coi mã nào là dịch vụ.
  const can = (await sql<{ ok: boolean }>`
    SELECT CASE WHEN to_regclass('bizcity_read.item_kinds') IS NULL THEN false
                ELSE has_table_privilege('bizcity_read.item_kinds', 'SELECT') AND has_column_privilege('public.item_classification', 'kind', 'SELECT') END AS ok`.execute(tx)).rows[0]?.ok;
  if (!can) return new Set();
  const r = await sql<{ sku: string }>`
    SELECT p.sku FROM bizcity_read.products p
      JOIN bizcity_read.item_kinds k ON k.tenant_id = p.tenant_id AND k.item_id = p.item_id
       AND k.valid_from <= ${day}::date AND (k.valid_to IS NULL OR ${day}::date < k.valid_to)
     WHERE p.sku IN (${sql.join(list)}) AND k.kind = 'service'`.execute(tx);
  return new Set(r.rows.map((x) => x.sku));
}
