/**
 * Mặt hàng & giá mua của nhà cung cấp (bảng supplier_products) + ĐVT của mặt hàng (product_units, khai ở Danh mục mặt hàng).
 * Một nơi cho "NCC bán mã nào, theo ĐVT nào, giá bao nhiêu" — hồ sơ NCC và form mặt hàng cùng đọc / ghi bảng này.
 */
import { sql } from 'kysely';
import { z } from 'zod';
import type { ProductUnit, SupplierProduct } from '@ketoan/contracts/mua-hang';
import { toNumber, type Db } from '../../db/client.js';
import { Errors } from '../../core/errors.js';

const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
export const supplierProductSchema = z.object({
  id: z.string().regex(/^[1-9][0-9]*$/).optional(),
  partnerCode: z.string().trim().max(64).nullable().optional().transform((x) => x || null),
  sku: z.string().trim().min(1).max(64),
  unit: z.string().trim().min(1).max(32),
  isDefaultUnit: z.boolean().default(false),
  nccSku: z.string().trim().max(64).default(''),
  nccName: z.string().trim().max(500).default(''),
  price: z.number().min(0).nullable().optional().transform((x) => (x === undefined ? null : x)),
  priceIncludesVat: z.boolean().default(false),
  warnPct: z.number().min(0).max(100).default(2),
  validFrom: day.nullable().optional().transform((x) => x || null),
  validTo: day.nullable().optional().transform((x) => x || null),
  note: z.string().max(300).default(''),
  isActive: z.boolean().default(true),
}).refine((x) => !x.validFrom || !x.validTo || x.validTo >= x.validFrom, { message: 'Ngày "Đến" phải từ ngày "Hiệu lực từ" trở đi', path: ['validTo'] })
  .refine((x) => !x.isDefaultUnit || Boolean(x.partnerCode), { message: '"Đặt theo ĐVT này" chỉ dùng cho dòng có nhà cung cấp (giá chung không có ĐVT giao)', path: ['isDefaultUnit'] });
export type SupplierProductInput = z.infer<typeof supplierProductSchema>;

const iso = (v: unknown) => (v ? String(v instanceof Date ? v.toISOString() : v).slice(0, 10) : undefined);
type Row = { id: string; partner_code: string | null; sku: string; unit: string; is_default_unit: boolean; ncc_sku: string; ncc_name?: string; price: string | null; price_includes_vat: boolean; warn_pct: string; valid_from: unknown; valid_to: unknown; note: string; is_active: boolean; created_by: string; updated_by: string; created_at: unknown; updated_at: unknown };
const toItem = (r: Row): SupplierProduct => ({
  id: String(r.id), partnerCode: r.partner_code, sku: r.sku, unit: r.unit, isDefaultUnit: r.is_default_unit, nccSku: r.ncc_sku, nccName: r.ncc_name ?? '', price: r.price === null ? null : toNumber(r.price),
  priceIncludesVat: r.price_includes_vat, warnPct: toNumber(r.warn_pct), validFrom: iso(r.valid_from), validTo: iso(r.valid_to), note: r.note, isActive: r.is_active,
  createdBy: r.created_by, updatedBy: r.updated_by, createdAt: new Date(r.created_at as string).toISOString(), updatedAt: new Date(r.updated_at as string).toISOString(),
});

/** Dòng mặt hàng & giá mua: theo NCC (kèm giá chung nếu withGeneral), theo mã, hoặc theo danh sách mã. */
export async function listSupplierProducts(trx: Db, tenantId: string, f: { partnerCode?: string; sku?: string; skus?: string[]; withGeneral?: boolean; all?: boolean } = {}): Promise<SupplierProduct[]> {
  let q = trx.selectFrom('supplier_products').selectAll().where('tenant_id', '=', tenantId);
  if (!f.all) q = q.where('is_active', '=', true);
  if (f.partnerCode) q = f.withGeneral ? q.where((eb) => eb.or([eb('partner_code', '=', f.partnerCode!), eb('partner_code', 'is', null)])) : q.where('partner_code', '=', f.partnerCode);
  if (f.sku) q = q.where('sku', '=', f.sku);
  if (f.skus) q = q.where('sku', 'in', f.skus.length ? f.skus : ['']);
  const rows = await q.orderBy('sku').orderBy('partner_code').orderBy('valid_from', 'desc').execute();
  return rows.map((r) => toItem(r as unknown as Row));
}

/** Thêm / sửa nhiều dòng một lần (id = sửa; không id = thêm, trùng NCC × mã × ĐVT × hiệu lực thì cập nhật). ĐVT phải có ở mặt hàng. */
export async function saveSupplierProducts(trx: Db, tenantId: string, actor: string, items: SupplierProductInput[], isDemo = false): Promise<{ added: number; updated: number }> {
  // Hai dòng cùng NCC × mã × ĐVT × hiệu lực trong một lần lưu: báo ngay (không âm thầm ghi đè nhau).
  const seen = new Map<string, number>();
  items.forEach((it, i) => {
    const k = `${it.partnerCode ?? ''}|${it.sku}|${it.unit.toLowerCase()}|${it.validFrom ?? ''}`;
    if (seen.has(k)) throw Errors.validation(`Dòng ${seen.get(k)! + 1} và dòng ${i + 1} trùng nhau: ${it.partnerCode || 'giá chung'} · ${it.sku} · ${it.unit}${it.validFrom ? ` · từ ${it.validFrom}` : ''}`);
    seen.set(k, i);
  });
  const skus = [...new Set(items.map((i) => i.sku))];
  const units = await unitsOf(trx, tenantId, skus);
  let added = 0, updated = 0;
  for (const it of items) {
    const us = units[it.sku];
    if (!us?.length) throw Errors.validation(`Mã ${it.sku} chưa có trong danh mục mặt hàng`);
    const u = us.find((x) => x.unit.toLowerCase() === it.unit.toLowerCase());
    if (!u) throw Errors.validation(`Mã ${it.sku} không có ĐVT "${it.unit}" — chọn một trong: ${us.map((x) => x.unit).join(', ')} (khai thêm ĐVT ở Danh mục mặt hàng)`);
    const values = { partner_code: it.partnerCode, sku: it.sku, unit: u.unit, is_default_unit: it.isDefaultUnit, ncc_sku: it.nccSku, ncc_name: it.nccName, price: it.price === null ? null : String(it.price), price_includes_vat: it.priceIncludesVat, warn_pct: String(it.warnPct), valid_from: it.validFrom, valid_to: it.validTo, note: it.note, is_active: it.isActive, updated_by: actor, updated_at: new Date() };
    // Một NCC chỉ một ĐVT đặt hàng mặc định cho mỗi mã.
    if (it.isDefaultUnit && it.partnerCode) await trx.updateTable('supplier_products').set({ is_default_unit: false }).where('tenant_id', '=', tenantId).where('partner_code', '=', it.partnerCode).where('sku', '=', it.sku).where('unit', '<>', u.unit).execute();
    const existing = it.id ? { id: it.id } : await trx.selectFrom('supplier_products').select('id').where('tenant_id', '=', tenantId).where('sku', '=', it.sku).where('unit', '=', u.unit)
      .where((eb) => (it.partnerCode ? eb('partner_code', '=', it.partnerCode) : eb('partner_code', 'is', null)))
      // Có ngày hiệu lực: đúng dòng hiệu lực đó (đổi giá theo đợt = thêm dòng); không ghi ngày: cập nhật dòng mới nhất cùng NCC × mã × ĐVT.
      .$if(Boolean(it.validFrom), (q) => q.where('valid_from', '=', it.validFrom!)).orderBy(sql`valid_from DESC NULLS LAST`).limit(1).executeTakeFirst();
    if (existing && !it.validFrom) delete (values as Partial<typeof values>).valid_from;
    if (existing) { await trx.updateTable('supplier_products').set(values).where('tenant_id', '=', tenantId).where('id', '=', existing.id).execute(); updated++; }
    else { await trx.insertInto('supplier_products').values({ tenant_id: tenantId, ...values, is_demo: isDemo, created_by: actor }).execute(); added++; }
  }
  return { added, updated };
}

/** Xoá hẳn một dòng mặt hàng & giá mua (phiếu đã lập giữ đơn giá riêng nên không ảnh hưởng phiếu cũ). */
export async function deleteSupplierProduct(trx: Db, tenantId: string, id: string): Promise<SupplierProduct> {
  const r = await trx.deleteFrom('supplier_products').where('tenant_id', '=', tenantId).where('id', '=', id).returningAll().executeTakeFirst();
  if (!r) throw Errors.notFound(`dòng mặt hàng & giá mua #${id}`);
  return toItem(r as unknown as Row);
}

/**
 * Giá vốn của một mã (theo ĐVT nhỏ nhất) để so với giá mua tham khảo:
 *   - bình quân tháng đã tính gần nhất (inventory_costs, cộng các nhóm giá vốn);
 *   - tạm tính hiện tại = giá trị tồn ÷ số lượng tồn trên sổ kho (chưa chạy tính giá vốn tháng này).
 */
export async function productCost(trx: Db, tenantId: string, sku: string) {
  const last = await trx.selectFrom('inventory_costs').select(['year', 'month', sql<string>`SUM(closing_value)`.as('value'), sql<string>`SUM(closing_qty)`.as('qty'), sql<string>`SUM(in_value + opening_value)`.as('inv'), sql<string>`SUM(in_qty + opening_qty)`.as('inq')])
    .where('tenant_id', '=', tenantId).where('sku', '=', sku).groupBy(['year', 'month']).orderBy('year', 'desc').orderBy('month', 'desc').limit(1).executeTakeFirst();
  const now = await trx.selectFrom('inventory_movements').select([sql<string>`COALESCE(SUM(qty), 0)`.as('qty'), sql<string>`COALESCE(SUM(amount), 0)`.as('value')]).where('tenant_id', '=', tenantId).where('sku', '=', sku).executeTakeFirstOrThrow();
  const inq = last ? toNumber(last.inq) : 0;
  const nq = toNumber(now.qty), nv = toNumber(now.value);
  return {
    monthly: last && inq > 0 ? { period: `${last.year}-${String(last.month).padStart(2, '0')}`, unitCost: Math.round((toNumber(last.inv) / inq) * 100) / 100 } : null,
    current: nq > 0 ? { qty: nq, value: nv, unitCost: Math.round((nv / nq) * 100) / 100 } : null,
  };
}

/** ĐVT của mọi mã trên các đơn đặt (tính tiến độ đơn ↔ phiếu nhập theo ĐVT nhỏ nhất). */
export async function unitsForOrders(trx: Db, tenantId: string, docs: { kind: string; status: string; lines: { sku: string }[] }[]): Promise<Record<string, ProductUnit[]>> {
  return unitsOf(trx, tenantId, docs.filter((d) => d.kind === 'order' && d.status !== 'cancelled').flatMap((d) => d.lines.map((l) => l.sku)));
}

/** ĐVT của các mã (tỉ lệ về ĐVT nhỏ nhất, bán chính, mua mặc định); mã chưa khai ĐVT thì lấy ĐVT ở danh mục, tỉ lệ 1. */
export async function unitsOf(trx: Db, tenantId: string, skus: string[]): Promise<Record<string, ProductUnit[]>> {
  const list = [...new Set(skus.filter(Boolean))];
  if (!list.length) return {};
  const [rows, prods] = await Promise.all([
    trx.selectFrom('product_units').select(['sku', 'unit', 'ratio', 'is_default', 'is_purchase_default']).where('tenant_id', '=', tenantId).where('sku', 'in', list).orderBy('ratio').execute(),
    trx.selectFrom('products').select(['sku', 'unit']).where('tenant_id', '=', tenantId).where('sku', 'in', list).execute(),
  ]);
  const out: Record<string, ProductUnit[]> = {};
  for (const r of rows) (out[r.sku] ??= []).push({ unit: r.unit, ratio: toNumber(r.ratio), isDefault: r.is_default, isPurchaseDefault: r.is_purchase_default });
  for (const p of prods) if (!out[p.sku]?.length && p.unit) out[p.sku] = [{ unit: p.unit, ratio: 1, isDefault: true }];
  return out;
}
