// @bizcity-layer D modules/mua-hang
/**
 * TỒN MAX → CHUYỂN HÀNG SHOP → ĐẶT MUA theo chi nhánh cha (docs/nghiep-vu/09-ton-max-dat-hang.md).
 *
 *   Phân cấp      chi nhánh cha (level branch, có kho tổng) → shop (level shop, parent_id) — 2 cấp
 *   Tồn max       stock_levels (chi nhánh, kho, mã) · cài riêng mã stock_sku_settings
 *   Số liệu       tồn theo kho, bán theo ngày, đi đường (cặp phiếu chuyển), chưa nhập kho (đơn đặt đang mở) — từ inventory_movements
 *   Công thức     order_formulas (một chi nhánh cha một công thức) → phân tích đặt hàng
 *   Chuyển shop   đề xuất (max − tồn − đi đường − đã đề nghị, làm tròn thùng, giới hạn tồn kho) → transfer_requests
 *   Đăng ký max   stock_max_requests (mã có sẵn / hàng mới), duyệt = ghi stock_levels
 */
import { sql } from 'kysely';
import { z } from 'zod';
import {
  TAX_RATE, allocateTransfers, avgPerDay, buyOptions, canAutoApprove, normalizeFormula, familiesBy, orderNeed, orderProgress, priceFor, roundPack, skuInfo, suggestMax, suggestWarehouseMax,
  type FormulaConfig, type MaxRequestItem, type NeedInput, type ProductUnit, type TransferMode, giftItemsOf } from '@ketoan/contracts/mua-hang';
import { toNumber, type Db } from '../../db/client.js';
import { Errors } from '../../core/errors.js';
import { listSupplierProducts, unitsForOrders, unitsOf } from './gia-mua.js';
import { listDocs, listPolicies } from './store.js';

const today = () => new Date().toISOString().slice(0, 10);
const addDays = (d: string, n: number) => { const x = new Date(`${d}T00:00:00Z`); x.setUTCDate(x.getUTCDate() + n); return x.toISOString().slice(0, 10); };
const r3 = (x: number) => Math.round(x * 1000) / 1000;
const json = <T>(v: unknown): T => (typeof v === 'string' ? JSON.parse(v) : v) as T;

/* ------------------------------------------------------------------ phân cấp */

export interface WarehouseInfo { code: string; name: string; isDefault: boolean; isActive: boolean; isPromo: boolean }
export interface BranchNode { id: string; code: string; name: string; level: '' | 'branch' | 'shop'; parentCode: string | null; isActive: boolean; warehouses: WarehouseInfo[] }

export async function hierarchy(trx: Db, tenantId: string): Promise<{ branches: BranchNode[] }> {
  const [rows, whs] = await Promise.all([
    trx.selectFrom('branches as b').leftJoin('branches as p', 'p.id', 'b.parent_id').select(['b.id', 'b.code', 'b.name', 'b.level', 'b.is_active', 'p.code as parent_code']).where('b.tenant_id', '=', tenantId).orderBy('b.code').execute(),
    trx.selectFrom('warehouses').select(['branch_id', 'code', 'name', 'is_default', 'is_active', 'is_promo']).where('tenant_id', '=', tenantId).orderBy('code').execute(),
  ]);
  const byBranch = new Map<string, WarehouseInfo[]>();
  for (const w of whs) (byBranch.get(String(w.branch_id)) ?? byBranch.set(String(w.branch_id), []).get(String(w.branch_id))!).push({ code: w.code, name: w.name, isDefault: w.is_default, isActive: w.is_active, isPromo: w.is_promo });
  return { branches: rows.map((r) => ({ id: String(r.id), code: r.code, name: r.name, level: (r.level || '') as BranchNode['level'], parentCode: r.parent_code ?? null, isActive: r.is_active, warehouses: byBranch.get(String(r.id)) ?? [] })) };
}

export const hierarchySaveSchema = z.object({
  items: z.array(z.object({ code: z.string().trim().min(1), level: z.enum(['', 'branch', 'shop']), parentCode: z.string().trim().nullable().optional() })).min(1).max(5000),
});

/** Lưu phân cấp: chỉ 2 cấp — cha phải là chi nhánh cha, chi nhánh cha không có cha, shop phải có cha. */
export async function saveHierarchy(trx: Db, tenantId: string, items: z.infer<typeof hierarchySaveSchema>['items']) {
  const all = await trx.selectFrom('branches').select(['id', 'code', 'level']).where('tenant_id', '=', tenantId).execute();
  const byCode = new Map(all.map((b) => [b.code, b]));
  const level = new Map(all.map((b) => [b.code, b.level]));
  for (const it of items) level.set(it.code, it.level);
  for (const it of items) {
    if (!byCode.has(it.code)) throw Errors.validation(`Không có chi nhánh ${it.code}`);
    if (it.level === 'shop') {
      if (!it.parentCode) throw Errors.validation(`Shop ${it.code}: chọn chi nhánh cha`);
      if (!byCode.has(it.parentCode)) throw Errors.validation(`Không có chi nhánh cha ${it.parentCode}`);
      if (level.get(it.parentCode) !== 'branch') throw Errors.validation(`${it.parentCode} không phải chi nhánh cha (chỉ 2 cấp: chi nhánh cha → shop)`);
      if (it.parentCode === it.code) throw Errors.validation(`Chi nhánh ${it.code} không làm cha của chính nó`);
    }
  }
  for (const it of items) {
    if (it.level !== 'branch') continue;
    // Thôi làm shop của ai → bỏ cha; chi nhánh cha đổi về chưa xếp / shop thì các shop của nó thành chưa xếp (chặn ở dưới).
  }
  const demoted = items.filter((it) => it.level !== 'branch' && byCode.get(it.code)?.level === 'branch').map((it) => byCode.get(it.code)!.id);
  if (demoted.length) {
    const kids = await trx.selectFrom('branches').select('code').where('tenant_id', '=', tenantId).where('parent_id', 'in', demoted).execute();
    const moving = new Set(items.map((i) => i.code));
    const stuck = kids.filter((k) => !moving.has(k.code));
    if (stuck.length) throw Errors.validation(`Chi nhánh cha còn ${stuck.length} shop (${stuck.slice(0, 5).map((k) => k.code).join(', ')}…) — chuyển các shop sang chi nhánh khác trước`);
  }
  for (const it of items) {
    const parentId = it.level === 'shop' ? byCode.get(it.parentCode!)!.id : null;
    await trx.updateTable('branches').set({ level: it.level, parent_id: parentId }).where('tenant_id', '=', tenantId).where('code', '=', it.code).execute();
  }
  return { saved: items.length };
}

/** Tự xếp theo mã: "xx000" = chi nhánh cha, mã 5 số cùng 2 số đầu = shop của nó. overwrite = xếp lại cả chi nhánh đã xếp. */
export async function autoArrange(trx: Db, tenantId: string, overwrite = false) {
  const all = await trx.selectFrom('branches').select(['id', 'code', 'level', 'parent_id']).where('tenant_id', '=', tenantId).execute();
  const parents = new Map<string, string>();
  const items: { code: string; level: 'branch' | 'shop'; parentCode?: string }[] = [];
  for (const b of all) if (/^\d{2}000$/.test(b.code) && (overwrite || !b.level || b.level === 'branch')) { parents.set(b.code.slice(0, 2), b.code); if (b.level !== 'branch') items.push({ code: b.code, level: 'branch' }); }
  for (const b of all) {
    if (/^\d{2}000$/.test(b.code) || !/^\d{5}/.test(b.code)) continue;
    if (!overwrite && b.level) continue;
    const p = parents.get(b.code.slice(0, 2));
    if (p) items.push({ code: b.code, level: 'shop', parentCode: p });
  }
  if (!items.length) return { saved: 0 };
  return saveHierarchy(trx, tenantId, items);
}

/** Cây của một chi nhánh cha: cha + shop + kho. */
export async function treeOf(trx: Db, tenantId: string, parentCode: string) {
  const { branches } = await hierarchy(trx, tenantId);
  const parent = branches.find((b) => b.code === parentCode);
  if (!parent) throw Errors.notFound(`chi nhánh ${parentCode}`);
  if (parent.level !== 'branch') throw Errors.validation(`${parentCode} chưa là chi nhánh cha — xếp ở màn Phân cấp chi nhánh – shop (MH15)`);
  const shops = branches.filter((b) => b.parentCode === parentCode && b.level === 'shop');
  return { parent, shops, all: [parent, ...shops] };
}

const defaultWh = (b: BranchNode) => b.warehouses.find((w) => w.isDefault)?.code ?? b.warehouses[0]?.code ?? '';

/* ------------------------------------------------------------------ số liệu kho */

/** Tồn theo (chi nhánh, kho, mã). Dòng không ghi kho tính vào kho mặc định của chi nhánh. */
async function stockRows(trx: Db, tenantId: string, branchIds: string[], skus?: string[]) {
  if (!branchIds.length) return [];
  let q = trx.selectFrom('inventory_movements').select(['branch_id', 'warehouse_code', 'sku', sql<string>`SUM(qty)`.as('qty')])
    .where('tenant_id', '=', tenantId).where('branch_id', 'in', branchIds).groupBy(['branch_id', 'warehouse_code', 'sku']);
  if (skus) q = q.where('sku', 'in', skus.length ? skus : ['']);
  return (await q.execute()).map((r) => ({ branchId: String(r.branch_id), warehouse: r.warehouse_code, sku: r.sku, qty: toNumber(r.qty) }));
}

/** Bán theo ngày (xuất bán − khách trả) trong days ngày gần nhất tính tới asOf: day = số ngày lùi (0 = asOf). */
async function salesRows(trx: Db, tenantId: string, branchIds: string[], days: number, asOf: string) {
  if (!branchIds.length) return [];
  const from = addDays(asOf, -(Math.max(1, days) - 1));
  const rows = await trx.selectFrom('inventory_movements').select(['branch_id', 'sku', sql<string>`(${asOf}::date - doc_date)`.as('d'), sql<string>`-SUM(qty)`.as('qty')])
    .where('tenant_id', '=', tenantId).where('branch_id', 'in', branchIds).where('kind', 'in', ['sale', 'sale_return'])
    .where('doc_date', '>=', from).where('doc_date', '<=', asOf).groupBy(['branch_id', 'sku', 'doc_date']).execute();
  return rows.map((r) => ({ branchId: String(r.branch_id), sku: r.sku, day: Number(r.d), qty: toNumber(r.qty) }));
}

/** Bán tháng liền kề (tháng trước tháng của asOf), theo mã, cộng các chi nhánh. */
async function lastMonthSales(trx: Db, tenantId: string, branchIds: string[], asOf: string) {
  if (!branchIds.length) return new Map<string, number>();
  const first = `${asOf.slice(0, 7)}-01`;
  const from = addDays(first, -1).slice(0, 7) + '-01';
  const rows = await trx.selectFrom('inventory_movements').select(['sku', sql<string>`-SUM(qty)`.as('qty')])
    .where('tenant_id', '=', tenantId).where('branch_id', 'in', branchIds).where('kind', 'in', ['sale', 'sale_return'])
    .where('doc_date', '>=', from).where('doc_date', '<', first).groupBy('sku').execute();
  return new Map(rows.map((r) => [r.sku, toNumber(r.qty)]));
}

/**
 * Hàng đi đường: theo từng lần chuyển (cặp phiếu xuất / nhận cùng nhóm chuyển, như bảng kê chuyển kho) số xuất − số đã nhận,
 * tính về đầu NHẬN. Chỉ xét các lần chuyển trong 90 ngày (cũ hơn coi như đã xử lý).
 */
export async function inTransitRows(trx: Db, tenantId: string, branchIds: string[], asOf: string) {
  if (!branchIds.length) return [];
  const from = addDays(asOf, -90);
  const res = await sql<{ to_id: string | null; sku: string; pending: string }>`
    WITH t AS (
      SELECT m.kind, m.branch_id, m.counter_branch_id, m.sku, m.qty,
             COALESCE(NULLIF(e.payload->'extra'->>'transferGroup', ''), 'ev:' || e.id::text) AS grp
        FROM inventory_movements m JOIN accounting_events e ON e.id = m.event_id
       WHERE m.tenant_id = ${tenantId} AND m.kind IN ('transfer_out', 'transfer_in') AND m.doc_date >= ${from}::date
    ), g AS (
      SELECT grp, sku,
             COALESCE(MAX(branch_id) FILTER (WHERE kind = 'transfer_in'), MAX(counter_branch_id) FILTER (WHERE kind = 'transfer_out')) AS to_id,
             COALESCE(-SUM(qty) FILTER (WHERE kind = 'transfer_out'), 0) AS out_qty,
             COALESCE(SUM(qty) FILTER (WHERE kind = 'transfer_in'), 0) AS in_qty
        FROM t GROUP BY grp, sku
    )
    SELECT to_id::text AS to_id, sku, SUM(out_qty - in_qty)::text AS pending FROM g
     WHERE out_qty > in_qty GROUP BY to_id, sku`.execute(trx);
  const ids = new Set(branchIds);
  return res.rows.filter((r) => r.to_id && ids.has(r.to_id)).map((r) => ({ branchId: r.to_id!, sku: r.sku, qty: toNumber(r.pending) }));
}

/** Quy cách thùng của mã: ĐVT mua mặc định (tỉ lệ > 1), không có thì ĐVT lớn nhất. */
function packOf(us: ProductUnit[] | undefined): { pack?: number; packUnit?: string; baseUnit: string } {
  const list = us ?? [];
  const base = list.find((u) => Number(u.ratio) === 1)?.unit ?? list[0]?.unit ?? '';
  const buy = list.find((u) => u.isPurchaseDefault && u.ratio > 1) ?? [...list].filter((u) => u.ratio > 1).sort((a, b) => b.ratio - a.ratio)[0];
  return buy ? { pack: buy.ratio, packUnit: buy.unit, baseUnit: base } : { baseUnit: base };
}

/* ------------------------------------------------------------------ tồn max */

export interface LevelRow { branchCode: string; warehouseCode: string; sku: string; max: number; min: number; source: string; note: string; updatedBy: string; updatedAt: string }

export async function listLevels(trx: Db, tenantId: string, f: { branchCodes?: string[]; skus?: string[] } = {}): Promise<LevelRow[]> {
  let q = trx.selectFrom('stock_levels').selectAll().where('tenant_id', '=', tenantId);
  if (f.branchCodes) q = q.where('branch_code', 'in', f.branchCodes.length ? f.branchCodes : ['']);
  if (f.skus) q = q.where('sku', 'in', f.skus.length ? f.skus : ['']);
  return (await q.orderBy('branch_code').orderBy('sku').execute()).map((r) => ({
    branchCode: r.branch_code, warehouseCode: r.warehouse_code, sku: r.sku, max: toNumber(r.max_qty), min: toNumber(r.min_qty), source: r.source, note: r.note, updatedBy: r.updated_by, updatedAt: new Date(r.updated_at as unknown as string).toISOString(),
  }));
}

export const levelInputSchema = z.object({
  branchCode: z.string().trim().min(1), warehouseCode: z.string().trim().default(''), sku: z.string().trim().min(1),
  max: z.number().finite().min(0, 'Tồn max không âm'), min: z.number().finite().min(0, 'Tồn min không âm').default(0), note: z.string().max(300).default(''),
  /** true = xoá dòng (thôi khai max). */
  remove: z.boolean().optional(),
});
export type LevelInput = z.infer<typeof levelInputSchema>;

/** Ghi hàng loạt tồn max (nhập Excel, áp gợi ý, sửa ô). Kho trống = kho mặc định của chi nhánh. Mã phải có trong danh mục. */
export async function saveLevels(trx: Db, tenantId: string, actor: string, items: LevelInput[], source = 'manual') {
  if (!items.length) return { saved: 0, removed: 0 };
  const { branches } = await hierarchy(trx, tenantId);
  const byCode = new Map(branches.map((b) => [b.code, b]));
  const skus = [...new Set(items.map((i) => i.sku))];
  const known = new Set((await trx.selectFrom('products').select('sku').where('tenant_id', '=', tenantId).where('sku', 'in', skus).execute()).map((r) => r.sku));
  let saved = 0, removed = 0;
  for (const [i, it] of items.entries()) {
    const b = byCode.get(it.branchCode);
    if (!b) throw Errors.validation(`Dòng ${i + 1}: không có chi nhánh ${it.branchCode}`);
    if (!known.has(it.sku)) throw Errors.validation(`Dòng ${i + 1}: mã ${it.sku} chưa có trong danh mục mặt hàng`);
    const wh = it.warehouseCode || defaultWh(b);
    if (it.warehouseCode && !b.warehouses.some((w) => w.code === it.warehouseCode)) throw Errors.validation(`Dòng ${i + 1}: chi nhánh ${it.branchCode} không có kho ${it.warehouseCode}`);
    if (it.min > 0 && it.max > 0 && it.min > it.max) throw Errors.validation(`Dòng ${i + 1} (${it.sku}): tồn min lớn hơn tồn max`);
    if (it.remove) {
      const r = await trx.deleteFrom('stock_levels').where('tenant_id', '=', tenantId).where('branch_code', '=', it.branchCode).where('warehouse_code', '=', wh).where('sku', '=', it.sku).executeTakeFirst();
      removed += Number(r.numDeletedRows ?? 0);
      continue;
    }
    await trx.insertInto('stock_levels').values({ tenant_id: tenantId, branch_code: it.branchCode, warehouse_code: wh, sku: it.sku, max_qty: it.max, min_qty: it.min, source, note: it.note, updated_by: actor })
      .onConflict((oc) => oc.columns(['tenant_id', 'branch_code', 'warehouse_code', 'sku']).doUpdateSet({ max_qty: it.max, min_qty: it.min, source, note: it.note, updated_by: actor, updated_at: new Date() }))
      .execute();
    saved++;
  }
  return { saved, removed };
}

/* ------------------------------------------------------------------ cài riêng từng mã */

export interface SkuSetting { sku: string; windowDays: number | null; coverDays: number | null; transferMode: TransferMode; note: string }
export async function listSkuSettings(trx: Db, tenantId: string, skus?: string[]): Promise<SkuSetting[]> {
  let q = trx.selectFrom('stock_sku_settings').selectAll().where('tenant_id', '=', tenantId);
  if (skus) q = q.where('sku', 'in', skus.length ? skus : ['']);
  return (await q.orderBy('sku').execute()).map((r) => ({ sku: r.sku, windowDays: r.window_days, coverDays: r.cover_days === null ? null : toNumber(r.cover_days), transferMode: r.transfer_mode as TransferMode, note: r.note }));
}
export const skuSettingSchema = z.object({
  sku: z.string().trim().min(1), windowDays: z.number().int().min(1).max(120).nullable().default(null), coverDays: z.number().positive().max(365).nullable().default(null),
  transferMode: z.enum(['auto', 'pack', 'unit']).default('auto'), note: z.string().max(300).default(''), remove: z.boolean().optional(),
});
export async function saveSkuSettings(trx: Db, tenantId: string, actor: string, items: z.infer<typeof skuSettingSchema>[]) {
  for (const it of items) {
    if (it.remove || (it.windowDays === null && it.coverDays === null && it.transferMode === 'auto' && !it.note)) {
      await trx.deleteFrom('stock_sku_settings').where('tenant_id', '=', tenantId).where('sku', '=', it.sku).execute();
      continue;
    }
    const v = { window_days: it.windowDays, cover_days: it.coverDays, transfer_mode: it.transferMode, note: it.note, updated_by: actor, updated_at: new Date() };
    await trx.insertInto('stock_sku_settings').values({ tenant_id: tenantId, sku: it.sku, ...v }).onConflict((oc) => oc.columns(['tenant_id', 'sku']).doUpdateSet(v)).execute();
  }
  return { saved: items.length };
}

/* ------------------------------------------------------------------ công thức */

export async function getFormula(trx: Db, tenantId: string, branchCode: string): Promise<{ config: FormulaConfig; saved: boolean; updatedBy: string; updatedAt: string | null }> {
  const r = await trx.selectFrom('order_formulas').selectAll().where('tenant_id', '=', tenantId).where('branch_code', '=', branchCode).executeTakeFirst();
  return { config: normalizeFormula(r ? json<Partial<FormulaConfig>>(r.config) : null), saved: Boolean(r), updatedBy: r?.updated_by ?? '', updatedAt: r ? new Date(r.updated_at as unknown as string).toISOString() : null };
}
const termSchema = z.object({ key: z.enum(['maxKho', 'minKho', 'tonKho', 'diDuongKho', 'diDuongShop', 'maxShop', 'tonShop', 'banShop', 'banThangTruoc', 'dangDat']), sign: z.union([z.literal(1), z.literal(-1)]), on: z.boolean(), factor: z.number().min(0).max(100).optional(), days: z.number().int().min(1).max(90).optional() });
export const formulaSchema = z.object({
  stockWarehouses: z.array(z.string()).max(50).default([]), maxWarehouses: z.array(z.string()).max(50).default([]), shopWarehouses: z.record(z.string()).default({}), excludeShops: z.array(z.string().max(64)).max(2000).default([]),
  terms: z.array(termSchema).max(20), shopGapMode: z.enum(['sum', 'positive']).default('sum'), roundBuy: z.enum(['none', 'up', 'nearest']).default('up'),
  skipSuffixes: z.array(z.string().trim().max(3)).max(20).default([]), windowDays: z.number().int().min(1).max(120).default(7), coverDays: z.number().positive().max(365).default(7),
  warehouseBufferPct: z.number().min(0).max(500).default(10), packThreshold: z.number().min(0).max(1).default(0.5), autoApprovePct: z.number().min(0).max(100).default(0),
});
export async function saveFormula(trx: Db, tenantId: string, actor: string, branchCode: string, cfg: z.infer<typeof formulaSchema>) {
  await treeOf(trx, tenantId, branchCode);
  const config = JSON.stringify(normalizeFormula(cfg as FormulaConfig));
  await trx.insertInto('order_formulas').values({ tenant_id: tenantId, branch_code: branchCode, config, updated_by: actor })
    .onConflict((oc) => oc.columns(['tenant_id', 'branch_code']).doUpdateSet({ config, updated_by: actor, updated_at: new Date() })).execute();
  return getFormula(trx, tenantId, branchCode);
}

/* ------------------------------------------------------------------ dữ liệu chung của một chi nhánh cha */

interface Snapshot {
  tree: Awaited<ReturnType<typeof treeOf>>;
  cfg: FormulaConfig;
  asOf: string;
  /** Kho của chi nhánh cha tính tồn / lấy max; kho chuẩn của từng shop. */
  stockWhs: Set<string>; maxWhs: Set<string>; shopWh: Map<string, string>;
  stock: Map<string, number>; // key `${branchCode}|${wh}|${sku}`
  sales: Map<string, number[]>; // key `${branchCode}|${sku}` → theo ngày lùi
  transit: Map<string, number>; // key `${branchCode}|${sku}` (hàng đang về chi nhánh đó)
  levels: Map<string, { max: number; min: number }>; // key `${branchCode}|${wh}|${sku}`
  settings: Map<string, SkuSetting>;
  window: number;
}

async function snapshot(trx: Db, tenantId: string, parentCode: string, asOf = today(), opts: { skus?: string[] } = {}): Promise<Snapshot> {
  const tree = await treeOf(trx, tenantId, parentCode);
  const { config: cfg } = await getFormula(trx, tenantId, parentCode);
  const ids = tree.all.map((b) => b.id);
  const idToCode = new Map(tree.all.map((b) => [b.id, b.code]));
  const settingsList = await listSkuSettings(trx, tenantId, opts.skus);
  const settings = new Map(settingsList.map((s) => [s.sku, s]));
  const banDays = Math.max(...cfg.terms.filter((t) => t.key === 'banShop').map((t) => t.days ?? 7), 1);
  const window = Math.max(cfg.windowDays, banDays, ...settingsList.map((s) => s.windowDays ?? 0));
  const [stock, sales, transit, levels] = await Promise.all([
    stockRows(trx, tenantId, ids, opts.skus), salesRows(trx, tenantId, ids, window, asOf), inTransitRows(trx, tenantId, ids, asOf), listLevels(trx, tenantId, { branchCodes: tree.all.map((b) => b.code), skus: opts.skus }),
  ]);
  const active = tree.parent.warehouses.filter((w) => w.isActive).map((w) => w.code);
  const stockWhs = new Set(cfg.stockWarehouses.length ? cfg.stockWarehouses : active);
  const maxWhs = new Set(cfg.maxWarehouses.length ? cfg.maxWarehouses : [defaultWh(tree.parent)]);
  const shopWh = new Map(tree.shops.map((s) => [s.code, cfg.shopWarehouses[s.code] || defaultWh(s)]));
  // Dòng không ghi kho, hoặc ghi mã kho không thuộc chi nhánh đó (phiếu chuyển chép mã kho đầu đi), tính vào kho mặc định.
  const whOf = (branchId: string, wh: string) => { const b = tree.all.find((x) => x.id === branchId)!; return wh && b.warehouses.some((w) => w.code === wh) ? wh : defaultWh(b); };
  const sm = new Map<string, number>();
  for (const r of stock) { const k = `${idToCode.get(r.branchId)}|${whOf(r.branchId, r.warehouse)}|${r.sku}`; sm.set(k, (sm.get(k) ?? 0) + r.qty); }
  const sl = new Map<string, number[]>();
  for (const r of sales) { const k = `${idToCode.get(r.branchId)}|${r.sku}`; const a = sl.get(k) ?? Array(window).fill(0); if (r.day >= 0 && r.day < window) a[r.day] += r.qty; sl.set(k, a); }
  const tm = new Map<string, number>();
  for (const r of transit) { const k = `${idToCode.get(r.branchId)}|${r.sku}`; tm.set(k, (tm.get(k) ?? 0) + r.qty); }
  const lm = new Map(levels.map((l) => [`${l.branchCode}|${l.warehouseCode}|${l.sku}`, { max: l.max, min: l.min }]));
  return { tree, cfg, asOf, stockWhs, maxWhs, shopWh, stock: sm, sales: sl, transit: tm, levels: lm, settings, window };
}

/** Phần còn lại chưa về của các đơn đặt đang mở (mọi NCC) trong cây, theo mã (ĐVT nhỏ nhất). */
async function pendingOrders(trx: Db, tenantId: string, branchCodes: string[]) {
  const docs = (await listDocs(trx, tenantId, { kind: 'order,receipt' })).filter((d) => d.status !== 'cancelled');
  const set = new Set(branchCodes);
  const orders = docs.filter((d) => d.kind === 'order' && set.has(d.branchCode) && ['draft', 'pending_approval', 'approved'].includes(d.status));
  const units = await unitsForOrders(trx, tenantId, orders);
  const out = new Map<string, number>();
  const byOrder = new Map<string, { docNo: string; partnerCode: string; date: string; remaining: number; sku: string }[]>();
  for (const o of orders) for (const l of orderProgress(o, docs, undefined, units).lines) {
    if (l.remainingBase <= 0) continue;
    out.set(l.sku, (out.get(l.sku) ?? 0) + l.remainingBase);
    (byOrder.get(l.sku) ?? byOrder.set(l.sku, []).get(l.sku)!).push({ docNo: o.docNo, partnerCode: o.partnerCode, date: o.docDate, remaining: l.remainingBase, sku: l.sku });
  }
  return { qty: out, detail: byOrder, docs };
}

const sumWhs = (m: Map<string, number>, branch: string, whs: Set<string>, sku: string) => [...whs].reduce((s, w) => s + (m.get(`${branch}|${w}|${sku}`) ?? 0), 0);

/* ------------------------------------------------------------------ phân tích đặt hàng */

export interface AnalysisRow {
  sku: string; name: string; barcode: string; brandCode: string; brandName: string; partnerCode: string; partnerName: string; taxCode: string;
  baseUnit: string; pack?: number; packUnit?: string; price: number | null; priceIncludesVat: boolean; promo: string;
  need: number; parts: { key: string; label: string; signed: number }[]; options: number[]; suggest: number;
  maxKho: number; minKho: number; tonKho: number; diDuongKho: number; diDuongShop: number; maxShop: number; tonShop: number; banShop: number; banThangTruoc: number; dangDat: number;
  /** NCC chọn theo: lan_nhap = lần nhập gần nhất · bang_gia = NCC có bảng giá đang hiệu lực mới nhất · '' = chưa rõ; nccCount = số NCC khai bán mã. */
  partnerSource: 'lan_nhap' | 'bang_gia' | ''; nccCount: number;
  shopsBelowMax: number; shopsWithMax: number; nccNote: string; nccSku: string; nccName: string; orders: { docNo: string; partnerCode: string; date: string; remaining: number; sku: string }[];
  /** Họ mã (mã cha + mã con đuôi Z / Q / K / M / T / B…): số của dòng đã cộng dồn cả họ; đây là chi tiết từng mã. Trống = mã đơn lẻ. */
  members: FamilyMember[];
}
export interface FamilyMember { sku: string; name: string; kind: string; tonKho: number; tonShop: number; diDuong: number; dangDat: number; banShop: number; banThangTruoc: number; maxKho: number; maxShop: number }

export async function orderAnalysis(trx: Db, tenantId: string, parentCode: string, f: { asOf?: string; sku?: string } = {}) {
  const asOf = f.asOf ?? today();
  const snap = await snapshot(trx, tenantId, parentCode, asOf, f.sku ? { skus: [f.sku] } : {});
  const { tree, cfg } = snap;
  const codes = tree.all.map((b) => b.code);
  const pend = await pendingOrders(trx, tenantId, codes);
  // Shop tính vào công thức: shop con trừ shop bỏ ra ở MH18 (shop nghỉ / tạm dừng — vẫn ở cây phân cấp).
  const fShops = tree.shops.filter((s) => !cfg.excludeShops.includes(s.code));
  const lastMonth = await lastMonthSales(trx, tenantId, fShops.map((s) => s.id), asOf);
  // Mã cần xét: có max, có tồn, có bán, có đơn đang về, có đi đường trong cây.
  const skus = new Set<string>();
  for (const k of snap.levels.keys()) skus.add(k.split('|')[2]!);
  for (const [k, v] of snap.stock) if (v !== 0) skus.add(k.split('|')[2]!);
  for (const k of snap.sales.keys()) skus.add(k.split('|')[1]!);
  for (const k of snap.transit.keys()) skus.add(k.split('|')[1]!);
  for (const k of pend.qty.keys()) skus.add(k);
  // HỌ MÃ (1 cấp, products.parent_sku — quét theo mã hoặc chỉ định tay ở mặt hàng): phân tích theo mã CHA, cộng dồn số của mọi mã con
  // (tồn, max, bán, đi đường, đơn đang đặt) — hàng tặng / kẹp quà còn nhiều thì không nhập thêm mã cha.
  const parentMap = new Map((await trx.selectFrom('products').select(['sku', 'parent_sku']).where('tenant_id', '=', tenantId).where('parent_sku', 'is not', null).execute()).map((r) => [r.sku, r.parent_sku!]));
  const parentOf = (s: string) => parentMap.get(s) ?? s;
  const families = familiesBy([...skus].filter(Boolean), parentOf);
  let parents = [...families.keys()];
  if (f.sku) { const want = parentOf(f.sku); parents = [want]; if (!families.has(want)) families.set(want, [want]); }
  if (!parents.length) return { rows: [] as AnalysisRow[], formula: cfg, parent: { code: tree.parent.code, name: tree.parent.name }, shops: fShops.length, asOf };
  const list = [...new Set(parents.flatMap((p) => families.get(p)!))];
  const [prods, units, sps, partners, policies] = await Promise.all([
    trx.selectFrom('products').select(['sku', 'name', 'barcode', 'brand_code', 'tax_in_code']).where('tenant_id', '=', tenantId).where('sku', 'in', list).execute(),
    unitsOf(trx, tenantId, list),
    listSupplierProducts(trx, tenantId, { skus: list }),
    trx.selectFrom('partners').select(['code', 'name', 'company_name']).where('tenant_id', '=', tenantId).execute(),
    listPolicies(trx, tenantId),
  ]);
  const brands = new Map((await trx.selectFrom('item_classes').select(['code', 'name']).where('tenant_id', '=', tenantId).execute()).map((r) => [r.code, r.name]));
  const pname = new Map(partners.map((p) => [p.code, p.company_name || p.name]));
  const prodOf = new Map(prods.map((p) => [p.sku, p]));
  // NCC của mã: lần nhập gần nhất (phiếu nhập đã duyệt / chờ duyệt); chưa nhập lần nào thì NCC có bảng giá đang hiệu lực, mới nhất
  // (hiệu lực từ muộn nhất). Họ mã: lần nhập gần nhất của bất kỳ mã nào trong họ.
  const lastBuy = new Map<string, { partner: string; date: string }>();
  for (const d of pend.docs.filter((x) => x.kind === 'receipt' && x.status !== 'draft').sort((a, b) => a.docDate.localeCompare(b.docDate))) for (const l of d.lines) if (l.sku) lastBuy.set(parentOf(l.sku), { partner: d.partnerCode, date: d.docDate });
  /** Số liệu một mã (theo ĐVT nhỏ nhất). */
  const inputOf = (sku: string): NeedInput => {
    const banShopNgay = Array(snap.window).fill(0) as number[];
    for (const s of fShops) { const a = snap.sales.get(`${s.code}|${sku}`); if (a) a.forEach((q, i) => { banShopNgay[i]! += q; }); }
    return {
      maxKho: [...snap.maxWhs].reduce((s, w) => s + (snap.levels.get(`${tree.parent.code}|${w}|${sku}`)?.max ?? 0), 0),
      minKho: [...snap.maxWhs].reduce((s, w) => s + (snap.levels.get(`${tree.parent.code}|${w}|${sku}`)?.min ?? 0), 0),
      tonKho: sumWhs(snap.stock, tree.parent.code, snap.stockWhs, sku),
      diDuongKho: snap.transit.get(`${tree.parent.code}|${sku}`) ?? 0,
      diDuongShop: fShops.reduce((s, x) => s + (snap.transit.get(`${x.code}|${sku}`) ?? 0), 0),
      banShopNgay, banThangTruoc: lastMonth.get(sku) ?? 0, dangDat: pend.qty.get(sku) ?? 0,
      shops: fShops.map((s) => { const wh = snap.shopWh.get(s.code)!; return { code: s.code, max: snap.levels.get(`${s.code}|${wh}|${sku}`)?.max ?? 0, ton: snap.stock.get(`${s.code}|${wh}|${sku}`) ?? 0 }; }),
    };
  };
  const rows: AnalysisRow[] = [];
  for (const sku of parents) {
    const memberSkus = families.get(sku)!;
    const per = memberSkus.map((m) => ({ sku: m, input: inputOf(m) }));
    // Cộng dồn cả họ (cùng ĐVT nhỏ nhất).
    const input: NeedInput = per.slice(1).reduce((acc, x) => ({
      maxKho: acc.maxKho + x.input.maxKho, minKho: acc.minKho + x.input.minKho, tonKho: acc.tonKho + x.input.tonKho, diDuongKho: acc.diDuongKho + x.input.diDuongKho,
      diDuongShop: acc.diDuongShop + x.input.diDuongShop, banShopNgay: acc.banShopNgay.map((q, i) => q + (x.input.banShopNgay[i] ?? 0)), banThangTruoc: acc.banThangTruoc + x.input.banThangTruoc,
      dangDat: acc.dangDat + x.input.dangDat, shops: acc.shops.map((s, i) => ({ code: s.code, max: s.max + (x.input.shops[i]?.max ?? 0), ton: s.ton + (x.input.shops[i]?.ton ?? 0) })),
    }), per[0]!.input);
    const shopsIn = input.shops;
    const p = prodOf.get(sku);
    const us = units[sku];
    const pk = packOf(us);
    const res = orderNeed(input, cfg);
    const spRows = sps.filter((x) => x.sku === sku && x.partnerCode);
    const live = spRows.filter((x) => x.isActive && (!x.validTo || x.validTo >= asOf) && (!x.validFrom || x.validFrom <= asOf))
      .sort((a, b) => Number(b.price !== null && b.price !== undefined) - Number(a.price !== null && a.price !== undefined) || (b.validFrom ?? '').localeCompare(a.validFrom ?? ''));
    const partnerCode = lastBuy.get(sku)?.partner ?? live[0]?.partnerCode ?? spRows[0]?.partnerCode ?? '';
    const partnerSource: AnalysisRow['partnerSource'] = lastBuy.has(sku) ? 'lan_nhap' : partnerCode ? 'bang_gia' : '';
    const nccCount = new Set(spRows.map((x) => x.partnerCode)).size;
    const spOf = spRows.find((x) => x.partnerCode === partnerCode);
    const fixed = priceFor(sps, { date: asOf, partnerCode, sku, unit: pk.baseUnit }, us ?? []);
    // Đơn giá chưa VAT theo ĐVT nhỏ nhất (giá gồm VAT thì bỏ thuế).
    const rate = TAX_RATE[p?.tax_in_code ?? 'V08'] ?? 0;
    const unitPrice = fixed ? fixed.price / (fixed.row.priceIncludesVat ? 1 + rate / 100 : 1) : null; // priceFor đã quy về ĐVT nhỏ nhất
    const promo = policies.filter((x) => x.isActive && ['promo_gift', 'item_discount', 'qty_tier'].includes(x.kind) && (x.scope.sku === sku || (x.kind === 'promo_gift' && giftItemsOf(x).some((i) => i.sku === sku)) || (!x.scope.sku && p?.brand_code && x.scope.brandCode === p.brand_code)) && (!x.validTo || x.validTo >= asOf) && (!x.validFrom || x.validFrom <= asOf))
      .map((x) => x.name).slice(0, 3).join('; ');
    const options = buyOptions(res.need, pk.pack);
    const suggest = res.need > 0 ? (cfg.roundBuy === 'none' ? Math.ceil(res.need) : roundPack(res.need, pk.pack, cfg.roundBuy === 'nearest' ? 'nearest' : 'up')) : 0;
    const banDays = Math.max(1, cfg.terms.find((t) => t.key === 'banShop')?.days ?? 7);
    // Chi tiết từng mã trong họ (mã cha + mã con) — hiện dưới dòng mã cha, ghi vào đơn đặt.
    const members = memberSkus.length > 1 ? per.map((x) => ({
      sku: x.sku, name: prodOf.get(x.sku)?.name ?? x.sku, kind: x.sku === sku ? 'Mã chính' : (skuInfo(x.sku).label || `đuôi ${skuInfo(x.sku).suffix ?? ''}`),
      tonKho: r3(x.input.tonKho), tonShop: r3(x.input.shops.reduce((t, s) => t + s.ton, 0)), diDuong: r3(x.input.diDuongKho + x.input.diDuongShop), dangDat: r3(x.input.dangDat),
      banShop: r3(x.input.banShopNgay.slice(0, banDays).reduce((t, q) => t + q, 0)), banThangTruoc: r3(x.input.banThangTruoc), maxKho: x.input.maxKho, maxShop: x.input.shops.reduce((t, s) => t + s.max, 0),
    })) : [];
    rows.push({
      sku, name: p?.name ?? sku, barcode: p?.barcode ?? '', brandCode: p?.brand_code ?? '', brandName: brands.get(p?.brand_code ?? '') ?? (p?.brand_code ?? ''),
      partnerCode, partnerName: pname.get(partnerCode) ?? '', partnerSource, nccCount, taxCode: p?.tax_in_code ?? 'V08', baseUnit: pk.baseUnit, pack: pk.pack, packUnit: pk.packUnit,
      price: unitPrice === null ? null : Math.round(unitPrice * 100) / 100, priceIncludesVat: false, promo,
      need: res.need, parts: res.parts.map((x) => ({ key: x.key, label: x.label, signed: x.signed })), options, suggest,
      maxKho: input.maxKho, minKho: input.minKho, tonKho: r3(input.tonKho), diDuongKho: r3(input.diDuongKho), diDuongShop: r3(input.diDuongShop),
      maxShop: shopsIn.reduce((t, x) => t + x.max, 0), tonShop: r3(shopsIn.reduce((t, x) => t + x.ton, 0)), banShop: r3(input.banShopNgay.slice(0, banDays).reduce((t, x) => t + x, 0)),
      banThangTruoc: r3(input.banThangTruoc), dangDat: r3(input.dangDat), shopsBelowMax: shopsIn.filter((x) => x.max > 0 && x.ton < x.max).length, shopsWithMax: shopsIn.filter((x) => x.max > 0).length,
      nccNote: spOf?.note ?? '', nccSku: spOf?.nccSku ?? '', nccName: spOf?.nccName ?? '', orders: memberSkus.flatMap((m) => pend.detail.get(m) ?? []), members,
    });
  }
  rows.sort((a, b) => (a.brandName || '~').localeCompare(b.brandName || '~', 'vi') || (a.partnerCode || '~').localeCompare(b.partnerCode || '~') || a.sku.localeCompare(b.sku));
  return { rows, formula: cfg, parent: { code: tree.parent.code, name: tree.parent.name }, shops: fShops.length, asOf };
}

/* ------------------------------------------------------------------ bảng tồn max (theo shop / theo mã) */

export interface MaxBoardRow {
  branchCode: string; branchName: string; warehouseCode: string; sku: string; name: string; baseUnit: string; pack?: number; packUnit?: string;
  ton: number; avgPerDay: number; windowDays: number; coverDays: number; suggested: number; max: number; min: number; hasLevel: boolean; transferMode: TransferMode;
  /** Kho: tổng max các shop con. */
  shopMaxSum?: number;
}

/** Bảng tồn max của một chi nhánh / shop (mode branch: mỗi mã một dòng) hoặc của một mã ở mọi chi nhánh trong cây (mode sku). */
export async function maxBoard(trx: Db, tenantId: string, parentCode: string, f: { branchCode?: string; warehouseCode?: string; sku?: string; asOf?: string }) {
  const snap = await snapshot(trx, tenantId, parentCode, f.asOf ?? today(), f.sku ? { skus: [f.sku] } : {});
  const { tree, cfg } = snap;
  const targets = f.sku ? tree.all : tree.all.filter((b) => b.code === (f.branchCode || tree.parent.code));
  if (!targets.length) throw Errors.validation(`${f.branchCode} không thuộc chi nhánh ${parentCode}`);
  const isParent = (code: string) => code === tree.parent.code;
  // Kho xem: chọn ở màn (chi nhánh cha nhiều kho, shop cũng chọn được kho của nó); không chọn thì kho tính max / kho chuẩn của shop.
  // Kho chính = kho lấy max của chi nhánh cha (mặc định) / kho chuẩn của shop: chỉ kho này có gợi ý max. Kho khác (khuyến mại…)
  // khai tay — gợi ý ở mọi kho sẽ nhân đôi tồn max (cùng tổng max shop cho nhiều kho).
  const mainWh = (b: BranchNode) => (isParent(b.code) ? [...snap.maxWhs][0] || defaultWh(b) : snap.shopWh.get(b.code) ?? defaultWh(b));
  const whFor = (b: BranchNode) => {
    if (f.warehouseCode && !f.sku && (isParent(b.code) || b.warehouses.some((w) => w.code === f.warehouseCode))) return f.warehouseCode;
    return mainWh(b);
  };
  let skus: string[];
  if (f.sku) skus = [f.sku];
  else {
    const b = targets[0]!, wh = whFor(b), set = new Set<string>();
    for (const k of snap.levels.keys()) { const [bc, w, s] = k.split('|'); if (bc === b.code && w === wh) set.add(s!); }
    for (const [k, v] of snap.stock) { const [bc, w, s] = k.split('|'); if (bc === b.code && w === wh && v !== 0) set.add(s!); }
    // Mã có max shop / có bán chỉ kéo vào kho chính (để gợi ý); kho phụ chỉ hiện mã đã có max / tồn ở kho đó.
    if (wh === mainWh(b)) {
      if (isParent(b.code)) { for (const k of snap.levels.keys()) { const [bc, , s] = k.split('|'); if (tree.shops.some((x) => x.code === bc)) set.add(s!); } }
      else for (const k of snap.sales.keys()) { const [bc, s] = k.split('|'); if (bc === b.code) set.add(s!); }
    }
    skus = [...set].filter(Boolean);
  }
  const [prods, units] = await Promise.all([
    skus.length ? trx.selectFrom('products').select(['sku', 'name']).where('tenant_id', '=', tenantId).where('sku', 'in', skus).execute() : [],
    unitsOf(trx, tenantId, skus),
  ]);
  const nameOf = new Map(prods.map((p) => [p.sku, p.name]));
  const rows: MaxBoardRow[] = [];
  for (const b of targets) {
    const wh = whFor(b), main = wh === mainWh(b);
    for (const sku of skus) {
      const st = snap.settings.get(sku);
      const win = st?.windowDays ?? cfg.windowDays, cover = st?.coverDays ?? cfg.coverDays;
      const pk = packOf(units[sku]);
      const lv = snap.levels.get(`${b.code}|${wh}|${sku}`);
      let avg = 0, suggested = 0, shopMaxSum: number | undefined;
      if (isParent(b.code)) {
        if (main) {
          shopMaxSum = tree.shops.reduce((s, x) => s + (snap.levels.get(`${x.code}|${snap.shopWh.get(x.code)}|${sku}`)?.max ?? 0), 0);
          suggested = suggestWarehouseMax(shopMaxSum, cfg.warehouseBufferPct);
        }
      } else if (main) {
        avg = avgPerDay(snap.sales.get(`${b.code}|${sku}`) ?? [], win);
        suggested = suggestMax(avg, cover, pk.pack, false);
      }
      rows.push({ branchCode: b.code, branchName: b.name, warehouseCode: wh, sku, name: nameOf.get(sku) ?? sku, baseUnit: pk.baseUnit, pack: pk.pack, packUnit: pk.packUnit,
        ton: r3(snap.stock.get(`${b.code}|${wh}|${sku}`) ?? 0), avgPerDay: avg, windowDays: win, coverDays: cover, suggested, max: lv?.max ?? 0, min: lv?.min ?? 0, hasLevel: Boolean(lv), transferMode: st?.transferMode ?? 'auto', shopMaxSum });
    }
  }
  return { rows, parent: { code: tree.parent.code, name: tree.parent.name }, shops: tree.shops.map((s) => ({ code: s.code, name: s.name, warehouse: snap.shopWh.get(s.code) })), warehouses: tree.parent.warehouses, formula: cfg, asOf: snap.asOf,
    /** Kho đang xem (mode chi nhánh / shop); mainWarehouse = false: kho phụ, không gợi ý max (khai tay). */
    warehouseCode: f.sku ? '' : whFor(targets[0]!), mainWarehouse: f.sku ? true : whFor(targets[0]!) === mainWh(targets[0]!) };
}

/* ------------------------------------------------------------------ đề xuất chuyển hàng xuống shop */

export async function transferSuggest(trx: Db, tenantId: string, parentCode: string, f: { fromWarehouse?: string; shopCodes?: string[]; asOf?: string } = {}) {
  const snap = await snapshot(trx, tenantId, parentCode, f.asOf ?? today());
  const { tree, cfg } = snap;
  const fromWh = f.fromWarehouse || defaultWh(tree.parent);
  if (!tree.parent.warehouses.some((w) => w.code === fromWh)) throw Errors.validation(`Chi nhánh ${parentCode} không có kho ${fromWh}`);
  const shops = tree.shops.filter((s) => !f.shopCodes?.length || f.shopCodes.includes(s.code));
  // Đề nghị đã chốt chưa làm (open): coi như hàng sắp đi — trừ vào chỗ thiếu của shop và vào tồn kho có thể chia.
  const open = await trx.selectFrom('transfer_requests').select(['to_branch', 'from_branch', 'from_warehouse', 'data']).where('tenant_id', '=', tenantId).where('status', '=', 'open').where('from_branch', '=', parentCode).execute();
  const reserved = new Map<string, number>(); // `${shop}|${sku}`
  const reservedKho = new Map<string, number>();
  for (const r of open) for (const l of json<{ lines?: { sku: string; qty: number }[] }>(r.data).lines ?? []) {
    reserved.set(`${r.to_branch}|${l.sku}`, (reserved.get(`${r.to_branch}|${l.sku}`) ?? 0) + l.qty);
    if ((r.from_warehouse || fromWh) === fromWh) reservedKho.set(l.sku, (reservedKho.get(l.sku) ?? 0) + l.qty);
  }
  const skus = new Set<string>();
  for (const k of snap.levels.keys()) { const [bc, , s] = k.split('|'); if (shops.some((x) => x.code === bc)) skus.add(s!); }
  const list = [...skus];
  const [units, prods] = await Promise.all([unitsOf(trx, tenantId, list), list.length ? trx.selectFrom('products').select(['sku', 'name']).where('tenant_id', '=', tenantId).where('sku', 'in', list).execute() : []]);
  const nameOf = new Map(prods.map((p) => [p.sku, p.name]));
  const lines: (ReturnType<typeof allocateTransfers>[number] & { name: string; baseUnit: string; packUnit?: string; reserved: number; khoTon: number })[] = [];
  for (const sku of list) {
    const pk = packOf(units[sku]);
    const mode = snap.settings.get(sku)?.transferMode ?? 'auto';
    const khoTon = (snap.stock.get(`${parentCode}|${fromWh}|${sku}`) ?? 0) - (reservedKho.get(sku) ?? 0);
    const needs = shops.map((s) => {
      const wh = snap.shopWh.get(s.code)!;
      return { shopCode: s.code, sku, max: snap.levels.get(`${s.code}|${wh}|${sku}`)?.max ?? 0, ton: snap.stock.get(`${s.code}|${wh}|${sku}`) ?? 0, diDuong: (snap.transit.get(`${s.code}|${sku}`) ?? 0) + (reserved.get(`${s.code}|${sku}`) ?? 0), pack: pk.pack, mode };
    }).filter((x) => x.max > 0);
    for (const l of allocateTransfers(needs, khoTon, cfg.packThreshold)) {
      if (l.want <= 0) continue;
      lines.push({ ...l, name: nameOf.get(sku) ?? sku, baseUnit: pk.baseUnit, packUnit: pk.packUnit, reserved: reserved.get(`${l.shopCode}|${sku}`) ?? 0, khoTon: r3(khoTon) });
    }
  }
  const shopName = new Map(tree.shops.map((s) => [s.code, s.name]));
  return { lines: lines.map((l) => ({ ...l, shopName: shopName.get(l.shopCode) ?? l.shopCode, toWarehouse: snap.shopWh.get(l.shopCode) ?? '' })), fromWarehouse: fromWh, parent: { code: tree.parent.code, name: tree.parent.name }, warehouses: tree.parent.warehouses, asOf: snap.asOf, threshold: cfg.packThreshold };
}

/* ------------------------------------------------------------------ đề nghị chuyển hàng đã chốt */

const transferLineSchema = z.object({ sku: z.string().min(1), name: z.string().default(''), unit: z.string().default(''), qty: z.number().positive(), pack: z.number().positive().optional(), packUnit: z.string().optional(), note: z.string().max(300).optional() });
export const transferCreateSchema = z.object({
  fromBranch: z.string().min(1), fromWarehouse: z.string().default(''), note: z.string().max(500).default(''),
  shops: z.array(z.object({ toBranch: z.string().min(1), toWarehouse: z.string().default(''), lines: z.array(transferLineSchema).min(1).max(5000) })).min(1).max(500),
});

async function nextCode(trx: Db, tenantId: string, table: 'transfer_requests' | 'stock_max_requests', prefix: string) {
  const ym = today().slice(2, 7).replace('-', '');
  const like = `${prefix}${ym}-%`;
  const last = await trx.selectFrom(table).select('code').where('tenant_id', '=', tenantId).where('code', 'like', like).orderBy('code', 'desc').limit(1).executeTakeFirst();
  const n = last ? Number(last.code.split('-').pop()) || 0 : 0;
  return (k: number) => `${prefix}${ym}-${String(n + k).padStart(4, '0')}`;
}

export async function createTransferRequests(trx: Db, tenantId: string, actor: string, body: z.infer<typeof transferCreateSchema>) {
  const tree = await treeOf(trx, tenantId, body.fromBranch);
  const code = await nextCode(trx, tenantId, 'transfer_requests', 'DNC');
  const out: string[] = [];
  for (const [i, s] of body.shops.entries()) {
    const shop = tree.shops.find((x) => x.code === s.toBranch);
    if (!shop) throw Errors.validation(`${s.toBranch} không phải shop của ${body.fromBranch}`);
    const c = code(i + 1);
    await trx.insertInto('transfer_requests').values({ tenant_id: tenantId, code: c, from_branch: body.fromBranch, from_warehouse: body.fromWarehouse || defaultWh(tree.parent), to_branch: s.toBranch, to_warehouse: s.toWarehouse || defaultWh(shop), note: body.note, data: JSON.stringify({ lines: s.lines }), created_by: actor }).execute();
    out.push(c);
  }
  return { codes: out };
}

export async function listTransferRequests(trx: Db, tenantId: string, f: { from?: string; to?: string; status?: string; branchCode?: string }) {
  let q = trx.selectFrom('transfer_requests').selectAll().where('tenant_id', '=', tenantId);
  if (f.from) q = q.where(sql`created_at::date`, '>=', f.from);
  if (f.to) q = q.where(sql`created_at::date`, '<=', f.to);
  if (f.status) q = q.where('status', 'in', f.status.split(','));
  if (f.branchCode) q = q.where((eb) => eb.or([eb('from_branch', '=', f.branchCode!), eb('to_branch', '=', f.branchCode!)]));
  const rows = await q.orderBy('created_at', 'desc').orderBy('id', 'desc').execute();
  const names = new Map((await trx.selectFrom('branches').select(['code', 'name']).where('tenant_id', '=', tenantId).execute()).map((b) => [b.code, b.name]));
  return rows.map((r) => {
    const lines = json<{ lines?: { sku: string; name: string; unit: string; qty: number; pack?: number; packUnit?: string; note?: string }[] }>(r.data).lines ?? [];
    return { id: String(r.id), code: r.code, fromBranch: r.from_branch, fromName: names.get(r.from_branch) ?? '', fromWarehouse: r.from_warehouse, toBranch: r.to_branch, toName: names.get(r.to_branch) ?? '', toWarehouse: r.to_warehouse,
      status: r.status, note: r.note, lines, lineCount: lines.length, qty: lines.reduce((s, l) => s + l.qty, 0), createdBy: r.created_by, createdAt: new Date(r.created_at as unknown as string).toISOString(),
      doneBy: r.done_by, doneAt: r.done_at ? new Date(r.done_at as unknown as string).toISOString() : null };
  });
}

export async function setTransferStatus(trx: Db, tenantId: string, actor: string, id: string, status: 'done' | 'cancelled' | 'open') {
  const r = await trx.updateTable('transfer_requests').set({ status, done_by: status === 'open' ? '' : actor, done_at: status === 'open' ? null : new Date(), updated_at: new Date() })
    .where('tenant_id', '=', tenantId).where('id', '=', id).returning('code').executeTakeFirst();
  if (!r) throw Errors.notFound('đề nghị chuyển hàng');
  return { code: r.code, status };
}

/* ------------------------------------------------------------------ phiếu đăng ký tồn max */

const itemSchema = z.object({
  key: z.string().trim().min(1).max(64), sku: z.string().trim().max(64).default(''), name: z.string().trim().max(500).default(''), unit: z.string().trim().max(32).optional(),
  pack: z.number().positive().optional(), nccSku: z.string().trim().max(64).optional(), partnerCode: z.string().trim().max(64).optional(),
  currentMax: z.number().min(0).optional(), suggestedMax: z.number().min(0).optional(), avgPerDay: z.number().min(0).optional(), windowDays: z.number().int().min(0).optional(),
  proposedMax: z.number().min(0, 'Max đề nghị không âm').optional(), maxByShop: z.record(z.number().min(0)).optional(), note: z.string().trim().max(300).optional(),
  applied: z.boolean().optional(),
});
export const maxRequestSchema = z.object({
  kind: z.enum(['existing', 'new_item']).default('existing'),
  branchCode: z.string().trim().min(1), title: z.string().trim().max(200).default(''), note: z.string().trim().max(1000).default(''),
  items: z.array(itemSchema).min(1, 'Phiếu phải có ít nhất một mặt hàng').max(5000),
  submit: z.boolean().default(false), source: z.enum(['erp', 'pos', 'api']).default('erp'),
});
type StoredItem = MaxRequestItem & { applied?: boolean };

function requestDto(r: { id: unknown; code: string; kind: string; branch_code: string; parent_code: string; status: string; title: string; note: string; source: string; data: unknown; created_by: string; approved_by: string; approved_at: unknown; created_at: unknown; updated_at: unknown }, names: Map<string, string>) {
  const items = json<{ items?: StoredItem[] }>(r.data).items ?? [];
  return {
    id: String(r.id), code: r.code, kind: r.kind as 'existing' | 'new_item', branchCode: r.branch_code, branchName: names.get(r.branch_code) ?? '', parentCode: r.parent_code, status: r.status as 'draft' | 'submitted' | 'approved' | 'cancelled',
    title: r.title, note: r.note, source: r.source, items, itemCount: items.length, unlinked: items.filter((i) => !i.sku).length, pendingApply: r.status === 'approved' ? items.filter((i) => !i.applied).length : 0,
    createdBy: r.created_by, approvedBy: r.approved_by, approvedAt: r.approved_at ? new Date(r.approved_at as string).toISOString() : null,
    createdAt: new Date(r.created_at as string).toISOString(), updatedAt: new Date(r.updated_at as string).toISOString(),
  };
}
export type MaxRequestDto = ReturnType<typeof requestDto>;

export async function listMaxRequests(trx: Db, tenantId: string, f: { from?: string; to?: string; status?: string; branchCode?: string; kind?: string }) {
  let q = trx.selectFrom('stock_max_requests').selectAll().where('tenant_id', '=', tenantId);
  if (f.from) q = q.where(sql`created_at::date`, '>=', f.from);
  if (f.to) q = q.where(sql`created_at::date`, '<=', f.to);
  if (f.status) q = q.where('status', 'in', f.status.split(','));
  if (f.kind) q = q.where('kind', '=', f.kind);
  if (f.branchCode) q = q.where((eb) => eb.or([eb('branch_code', '=', f.branchCode!), eb('parent_code', '=', f.branchCode!)]));
  const rows = await q.orderBy('created_at', 'desc').orderBy('id', 'desc').execute();
  const names = new Map((await trx.selectFrom('branches').select(['code', 'name']).where('tenant_id', '=', tenantId).execute()).map((b) => [b.code, b.name]));
  return rows.map((r) => requestDto(r as never, names));
}

export async function getMaxRequest(trx: Db, tenantId: string, id: string) {
  const r = await trx.selectFrom('stock_max_requests').selectAll().where('tenant_id', '=', tenantId).where('id', '=', id).executeTakeFirst();
  if (!r) throw Errors.notFound('phiếu đăng ký tồn max');
  const names = new Map((await trx.selectFrom('branches').select(['code', 'name']).where('tenant_id', '=', tenantId).execute()).map((b) => [b.code, b.name]));
  return requestDto(r as never, names);
}

/** Thêm / sửa phiếu. Mã có sẵn: chi nhánh của phiếu là shop (hoặc chi nhánh cha để đăng ký max kho). Hàng mới: chi nhánh cha. */
export async function saveMaxRequest(trx: Db, tenantId: string, actor: string, body: z.infer<typeof maxRequestSchema>, id?: string) {
  const { branches } = await hierarchy(trx, tenantId);
  const b = branches.find((x) => x.code === body.branchCode);
  if (!b) throw Errors.validation(`Không có chi nhánh ${body.branchCode}`);
  const parentCode = b.level === 'shop' ? b.parentCode ?? '' : b.level === 'branch' ? b.code : '';
  if (body.kind === 'new_item' && b.level !== 'branch') throw Errors.validation('Phiếu hàng mới lập ở chi nhánh cha (bảng mặt hàng × shop)');
  const items: StoredItem[] = body.items.map((i) => ({ ...i }));
  if (body.kind === 'existing') {
    const missing = items.filter((i) => !i.sku);
    if (missing.length) throw Errors.validation(`Phiếu mã có sẵn: dòng "${missing[0]!.name || missing[0]!.key}" chưa có mã — hàng chưa có mã thì lập phiếu hàng mới`);
    const dup = items.find((i, k) => items.findIndex((x) => x.sku === i.sku) !== k);
    if (dup) throw Errors.validation(`Mã ${dup.sku} có 2 dòng trong phiếu`);
    const known = new Set((await trx.selectFrom('products').select('sku').where('tenant_id', '=', tenantId).where('sku', 'in', items.map((i) => i.sku)).execute()).map((r) => r.sku));
    const bad = items.find((i) => !known.has(i.sku));
    if (bad) throw Errors.validation(`Mã ${bad.sku} chưa có trong danh mục mặt hàng`);
    // Ghi lại max hiện tại để duyệt nhìn chênh lệch.
    const wh = defaultWh(b);
    const cur = await listLevels(trx, tenantId, { branchCodes: [b.code], skus: items.map((i) => i.sku) });
    for (const i of items) i.currentMax = cur.find((x) => x.sku === i.sku && x.warehouseCode === wh)?.max ?? 0;
  }
  const status = body.submit ? 'submitted' : 'draft';
  let rid = id;
  if (id) {
    const cur = await trx.selectFrom('stock_max_requests').select(['status', 'kind']).where('tenant_id', '=', tenantId).where('id', '=', id).executeTakeFirst();
    if (!cur) throw Errors.notFound('phiếu đăng ký tồn max');
    if (cur.status === 'cancelled') throw Errors.conflict('Phiếu đã huỷ');
    if (cur.status === 'approved' && body.kind === 'existing') throw Errors.conflict('Phiếu đã duyệt (max đã ghi) — lập phiếu mới để đổi');
    await trx.updateTable('stock_max_requests').set({ kind: body.kind, branch_code: body.branchCode, parent_code: parentCode, ...(body.title ? { title: body.title } : {}), ...(body.note ? { note: body.note } : {}), data: JSON.stringify({ items }), ...(cur.status === 'approved' ? {} : { status }), updated_at: new Date() }).where('id', '=', id).execute();
  } else {
    const code = (await nextCode(trx, tenantId, 'stock_max_requests', 'DKM'))(1);
    rid = String((await trx.insertInto('stock_max_requests').values({ tenant_id: tenantId, code, kind: body.kind, branch_code: body.branchCode, parent_code: parentCode, status, title: body.title || `Đăng ký tồn max ${b.name}`, note: body.note, source: body.source, data: JSON.stringify({ items }), created_by: actor }).returning('id').executeTakeFirstOrThrow()).id);
  }
  // Duyệt tự động: công thức chi nhánh cha có mức lệch cho phép và mọi dòng nằm trong mức.
  if (status === 'submitted' && parentCode && body.kind === 'existing') {
    const { config } = await getFormula(trx, tenantId, parentCode);
    if (canAutoApprove(items, config.autoApprovePct)) return approveMaxRequest(trx, tenantId, `Tự động (lệch ≤ ${config.autoApprovePct}%)`, rid!);
  }
  // Phiếu hàng mới đã duyệt: sửa (gắn mã) thì ghi max cho các dòng vừa có mã.
  const after = await getMaxRequest(trx, tenantId, rid!);
  if (after.status === 'approved') return applyMaxRequest(trx, tenantId, actor, rid!);
  return after;
}

/** Ghi max của các dòng có mã chưa ghi (dòng hàng mới chưa có mã chờ gắn mã). */
async function applyMaxRequest(trx: Db, tenantId: string, actor: string, id: string) {
  const req = await getMaxRequest(trx, tenantId, id);
  const { branches } = await hierarchy(trx, tenantId);
  const items = req.items as StoredItem[];
  const levels: LevelInput[] = [];
  const known = new Set((await trx.selectFrom('products').select('sku').where('tenant_id', '=', tenantId).where('sku', 'in', items.map((i) => i.sku).filter(Boolean).concat([''])).execute()).map((r) => r.sku));
  for (const i of items) {
    if (i.applied || !i.sku || !known.has(i.sku)) continue;
    if (req.kind === 'existing') levels.push({ branchCode: req.branchCode, warehouseCode: '', sku: i.sku, max: i.proposedMax ?? 0, min: 0, note: `Phiếu ${req.code}` });
    else for (const [shop, max] of Object.entries(i.maxByShop ?? {})) if (branches.some((b) => b.code === shop) && max >= 0) levels.push({ branchCode: shop, warehouseCode: '', sku: i.sku, max, min: 0, note: `Phiếu hàng mới ${req.code}` });
    i.applied = true;
  }
  if (levels.length) await saveLevels(trx, tenantId, actor, levels, 'request');
  await trx.updateTable('stock_max_requests').set({ data: JSON.stringify({ items }), updated_at: new Date() }).where('id', '=', id).execute();
  return getMaxRequest(trx, tenantId, id);
}

export async function approveMaxRequest(trx: Db, tenantId: string, actor: string, id: string) {
  const cur = await getMaxRequest(trx, tenantId, id);
  if (cur.status === 'cancelled') throw Errors.conflict('Phiếu đã huỷ');
  if (cur.status === 'approved') throw Errors.conflict('Phiếu đã duyệt');
  await trx.updateTable('stock_max_requests').set({ status: 'approved', approved_by: actor, approved_at: new Date(), updated_at: new Date() }).where('id', '=', id).execute();
  return applyMaxRequest(trx, tenantId, actor, id);
}

export async function cancelMaxRequest(trx: Db, tenantId: string, id: string) {
  const cur = await getMaxRequest(trx, tenantId, id);
  if (cur.status === 'approved' && cur.kind === 'existing') throw Errors.conflict('Phiếu đã duyệt (max đã ghi) — sửa max ở màn Tồn max');
  await trx.updateTable('stock_max_requests').set({ status: 'cancelled', updated_at: new Date() }).where('id', '=', id).execute();
  return getMaxRequest(trx, tenantId, id);
}

/** Gợi ý dòng cho phiếu đăng ký của một shop: mọi mã shop đang có max / có bán / có tồn, kèm bán / ngày và max gợi ý. */
export async function maxRequestSuggest(trx: Db, tenantId: string, branchCode: string) {
  const { branches } = await hierarchy(trx, tenantId);
  const b = branches.find((x) => x.code === branchCode);
  if (!b) throw Errors.validation(`Không có chi nhánh ${branchCode}`);
  const parent = b.level === 'shop' ? b.parentCode : b.level === 'branch' ? b.code : null;
  if (!parent) throw Errors.validation(`${branchCode} chưa xếp vào chi nhánh cha (MH15)`);
  const board = await maxBoard(trx, tenantId, parent, { branchCode });
  return board.rows.map((r) => ({ key: r.sku, sku: r.sku, name: r.name, unit: r.baseUnit, pack: r.pack, currentMax: r.max, suggestedMax: r.suggested, avgPerDay: r.avgPerDay, windowDays: r.windowDays, proposedMax: r.suggested || r.max, ton: r.ton, shopMaxSum: r.shopMaxSum }));
}
