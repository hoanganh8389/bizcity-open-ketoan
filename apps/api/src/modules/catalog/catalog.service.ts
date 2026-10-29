/**
 * Danh mục hàng chuẩn (22/10/2026): mặt hàng + đơn vị tính / tỉ lệ quy đổi + bảng giá công ty / chi nhánh khai ở phần
 * mềm kế toán; hệ thống bán hàng kéo về qua luồng thay đổi (feed*) để hiển thị và bán.
 *
 *   getProduct / saveProduct   trọn một mặt hàng: thông tin, cờ trạng thái, đơn vị tính, giá ở mọi bảng giá
 *   listPriceLists / savePriceList / deletePriceList / setPriceListBranches
 *   feedMeta / feedProducts / feedPrices    luồng thay đổi cho hệ thống bán hàng (con trỏ updated_at + id)
 *   importCatalog              nạp dữ liệu ban đầu từ hệ thống bán hàng (chạy một lần lúc chuyển sang khai ở đây)
 *
 * Luật dữ liệu:
 *   - Mỗi mặt hàng có đúng MỘT đơn vị tỉ lệ 1 (đơn vị nhỏ nhất) và tối đa một đơn vị bán chính.
 *   - Đổi đơn vị tính / giá của mặt hàng thì chạm products.updated_at → luồng mặt hàng mang theo trọn bộ đơn vị tính.
 *   - Xoá (mặt hàng, dòng giá, bảng giá) ghi catalog_tombstones để hệ thống bán hàng xoá theo.
 */
import { sql } from 'kysely';
import type { Db } from '../../db/client.js';
import { Errors } from '../../core/errors.js';
import { writeAudit } from '../../core/audit.js';

// ----------------------------------------------------------------------------------------------- kiểu dữ liệu

export interface UnitInput { unit: string; ratio: number; isDefault?: boolean; isPurchaseDefault?: boolean; weightKg?: number | null; note?: string }
export interface PriceInput { priceListCode: string; unit: string; price: number | null; isDefaultUnit?: boolean; note?: string }
export interface ProductInput {
  name?: string; unit?: string; note?: string;
  groupCode?: string | null; industryCode?: string | null; brandCode?: string | null; typeCode?: string | null;
  postingGroupCode?: string | null; taxOutCode?: string | null; taxInCode?: string | null; exciseRate?: number | null;
  isActive?: boolean;
  barcode?: string; imageUrl?: string; description?: string; weightKg?: number | null; origin?: string;
  isMain?: boolean; isUnder24m?: boolean; noSale?: boolean; exportAdjust?: boolean; isKct?: boolean; trackIdentifier?: boolean;
  /** Mã hàng cha (họ mã 1 cấp); null = không có. Tạo mới mà không gửi → tự gợi ý theo mã (mã 9 số + đuôi, trừ T). */
  parentSku?: string | null;
  units?: UnitInput[];
  prices?: PriceInput[];
}

type ProductRow = {
  sku: string; name: string; unit: string; note: string; group_code: string | null; industry_code: string | null; brand_code: string | null; type_code: string | null;
  posting_group_code: string | null; tax_out_code: string | null; tax_in_code: string | null; excise_rate: string | null; is_active: boolean;
  barcode: string; image_url: string; description: string; weight_kg: string | null; origin: string;
  is_main: boolean; is_under_24m: boolean; no_sale: boolean; export_adjust: boolean; is_kct: boolean; track_identifier: boolean; updated_at: Date; parent_sku: string | null;
};

const num = (v: string | null | undefined) => (v === null || v === undefined ? null : Number(v));

export function productDto(p: ProductRow) {
  return {
    sku: p.sku, name: p.name, unit: p.unit, note: p.note,
    groupCode: p.group_code, industryCode: p.industry_code, brandCode: p.brand_code, typeCode: p.type_code,
    postingGroupCode: p.posting_group_code, taxOutCode: p.tax_out_code, taxInCode: p.tax_in_code, exciseRate: num(p.excise_rate), isActive: p.is_active,
    barcode: p.barcode, imageUrl: p.image_url, description: p.description, weightKg: num(p.weight_kg), origin: p.origin,
    isMain: p.is_main, isUnder24m: p.is_under_24m, noSale: p.no_sale, exportAdjust: p.export_adjust, isKct: p.is_kct, trackIdentifier: p.track_identifier,
    parentSku: p.parent_sku, updatedAt: p.updated_at,
  };
}

const PRODUCT_COLS = [
  'sku', 'name', 'unit', 'note', 'group_code', 'industry_code', 'brand_code', 'type_code', 'posting_group_code', 'tax_out_code', 'tax_in_code', 'excise_rate',
  'is_active', 'barcode', 'image_url', 'description', 'weight_kg', 'origin', 'is_main', 'is_under_24m', 'no_sale', 'export_adjust', 'is_kct', 'track_identifier', 'updated_at', 'parent_sku',
] as const;

/** Mã VAT ra mang nghĩa "không chịu thuế GTGT" — cờ is_kct suy từ mã VAT ra, không khai riêng. */
const KCT_OUT_CODES = new Set(['KCT', 'R00K']);

/** Trường của ProductInput → cột products (chỉ trường có gửi). */
function productPatch(b: ProductInput): Record<string, unknown> {
  const map: [keyof ProductInput, string, (v: unknown) => unknown][] = [
    ['name', 'name', (v) => v], ['unit', 'unit', (v) => v], ['note', 'note', (v) => v],
    ['groupCode', 'group_code', (v) => v || null], ['industryCode', 'industry_code', (v) => v || null], ['brandCode', 'brand_code', (v) => v || null], ['typeCode', 'type_code', (v) => v || null],
    ['postingGroupCode', 'posting_group_code', (v) => v || null], ['taxOutCode', 'tax_out_code', (v) => v || null], ['taxInCode', 'tax_in_code', (v) => v || null],
    ['exciseRate', 'excise_rate', (v) => (v === null || v === undefined ? null : v)], ['isActive', 'is_active', (v) => v],
    ['barcode', 'barcode', (v) => v ?? ''], ['imageUrl', 'image_url', (v) => v ?? ''], ['description', 'description', (v) => v ?? ''],
    ['weightKg', 'weight_kg', (v) => (v === null || v === undefined ? null : v)], ['origin', 'origin', (v) => v ?? ''],
    ['isMain', 'is_main', (v) => v], ['isUnder24m', 'is_under_24m', (v) => v], ['noSale', 'no_sale', (v) => v], ['exportAdjust', 'export_adjust', (v) => v],
    ['isKct', 'is_kct', (v) => v], ['trackIdentifier', 'track_identifier', (v) => v], ['parentSku', 'parent_sku', (v) => (typeof v === 'string' && v.trim() ? v.trim() : null)],
  ];
  const out: Record<string, unknown> = {};
  for (const [k, col, f] of map) if (b[k] !== undefined) out[col] = f(b[k]);
  if (b.taxOutCode !== undefined) out.is_kct = KCT_OUT_CODES.has(String(b.taxOutCode ?? ''));
  return out;
}

/** Kiểm tra bộ đơn vị tính: đúng một đơn vị tỉ lệ 1, tối đa một đơn vị bán chính, không trùng tên. */
export function checkUnits(units: UnitInput[]): string | null {
  if (!units.length) return 'Mặt hàng phải có ít nhất một đơn vị tính (đơn vị nhỏ nhất, tỉ lệ 1)';
  const names = new Set<string>();
  for (const u of units) {
    const n = u.unit.trim().toLowerCase();
    if (!n) return 'Tên đơn vị tính không được để trống';
    if (names.has(n)) return `Đơn vị tính "${u.unit}" bị trùng`;
    names.add(n);
    if (!(u.ratio > 0)) return `Tỉ lệ của đơn vị "${u.unit}" phải lớn hơn 0`;
  }
  const base = units.filter((u) => Number(u.ratio) === 1);
  if (base.length !== 1) return base.length ? `Chỉ được một đơn vị tỉ lệ 1 (đang có: ${base.map((u) => u.unit).join(', ')})` : 'Phải có một đơn vị tỉ lệ 1 (đơn vị nhỏ nhất)';
  if (units.filter((u) => u.isDefault).length > 1) return 'Chỉ được một đơn vị bán chính';
  if (units.filter((u) => u.isPurchaseDefault).length > 1) return 'Chỉ được một đơn vị mua mặc định';
  return null;
}

async function tombstone(trx: Db, tenantId: string, entity: 'product' | 'unit' | 'price' | 'price_list' | 'group', keys: string[]) {
  if (!keys.length) return;
  await trx.insertInto('catalog_tombstones').values(keys.map((key) => ({ tenant_id: tenantId, entity, key }))).execute();
}

// ----------------------------------------------------------------------------------------------- họ mã (mã cha – mã con)

/** Mã cha gợi ý theo mã: mã 9 số + đuôi (trừ T có tem) mà mã gốc có trong danh mục và chưa là mã con. */
export async function suggestParent(trx: Db, tenantId: string, sku: string): Promise<string | null> {
  const m = /^(\d{9})([A-Z]{1,3})$/.exec(sku.trim().toUpperCase());
  if (!m || m[2] === 'T') return null;
  const p = await trx.selectFrom('products').select('parent_sku').where('tenant_id', '=', tenantId).where('sku', '=', m[1]!).executeTakeFirst();
  return p && !p.parent_sku ? m[1]! : null;
}

/**
 * Công cụ "Quét cha – con theo mã": gán mã cha cho các mã có đuôi (trừ T) mà mã gốc có trong danh mục. Mặc định chỉ điền mã chưa có
 * mã cha (giữ mã cha đã chỉnh tay); overwrite = quét lại cả mã đã có mã cha theo mã.
 */
export async function scanParents(trx: Db, tenantId: string, opts: { overwrite?: boolean } = {}): Promise<{ updated: number; families: number; children: number }> {
  const r = await sql<{ n: string }>`
    WITH c AS (
      UPDATE products c SET parent_sku = left(c.sku, 9), updated_at = now()
       WHERE c.tenant_id = ${tenantId} AND c.sku ~ '^[0-9]{9}[A-Z]{1,3}$' AND substring(c.sku FROM 10) <> 'T'
         AND NOT c.parent_manual AND (${opts.overwrite ?? false} OR c.parent_sku IS NULL) AND c.parent_sku IS DISTINCT FROM left(c.sku, 9)
         AND EXISTS (SELECT 1 FROM products p WHERE p.tenant_id = c.tenant_id AND p.sku = left(c.sku, 9) AND p.parent_sku IS NULL)
      RETURNING 1)
    SELECT COUNT(*)::text AS n FROM c`.execute(trx);
  const stat = await trx.selectFrom('products').select([sql<string>`COUNT(DISTINCT parent_sku)`.as('f'), sql<string>`COUNT(*)`.as('c')]).where('tenant_id', '=', tenantId).where('parent_sku', 'is not', null).executeTakeFirst();
  return { updated: Number(r.rows[0]?.n ?? 0), families: Number(stat?.f ?? 0), children: Number(stat?.c ?? 0) };
}

// ----------------------------------------------------------------------------------------------- một mặt hàng

export async function getProduct(trx: Db, tenantId: string, sku: string) {
  const p = await trx.selectFrom('products').select([...PRODUCT_COLS]).where('tenant_id', '=', tenantId).where('sku', '=', sku).executeTakeFirst();
  if (!p) throw Errors.notFound(`mặt hàng ${sku}`);
  const [units, prices] = await Promise.all([
    trx.selectFrom('product_units').selectAll().where('tenant_id', '=', tenantId).where('sku', '=', sku).orderBy('ratio').orderBy('unit').execute(),
    trx.selectFrom('product_prices').selectAll().where('tenant_id', '=', tenantId).where('sku', '=', sku).execute(),
  ]);
  return {
    ...productDto(p as ProductRow),
    units: units.map((u) => ({ unit: u.unit, ratio: Number(u.ratio), isDefault: u.is_default, isPurchaseDefault: u.is_purchase_default, weightKg: num(u.weight_kg), note: u.note })),
    prices: prices.map((r) => ({ priceListCode: r.price_list_code, unit: r.unit, price: num(r.price), isDefaultUnit: r.is_default_unit, note: r.note })),
  };
}

/**
 * Lưu trọn một mặt hàng. units gửi kèm = THAY cả bộ đơn vị tính; prices gửi kèm = ghi các ô giá gửi lên (price null =
 * xoá ô giá đó). Dòng giá của đơn vị không còn trong bộ đơn vị tính bị xoá theo.
 */
export async function saveProduct(trx: Db, tenantId: string, actor: string, sku: string, b: ProductInput, opts: { isNew?: boolean; source?: string; quiet?: boolean } = {}) {
  const exists = await trx.selectFrom('products').select('id').where('tenant_id', '=', tenantId).where('sku', '=', sku).executeTakeFirst();
  if (opts.isNew && exists) throw Errors.conflict(`Mã hàng ${sku} đã có`);
  if (b.units) {
    // Tên ĐVT theo đúng cách viết trong danh mục ĐVT ("hộp" → "Hộp"); tên mới giữ nguyên, CSDL tự thêm vào danh mục.
    const known = new Map((await trx.selectFrom('unit_names').select('name').where('tenant_id', '=', tenantId).execute()).map((r) => [r.name.toLowerCase(), r.name]));
    b = { ...b, units: b.units.map((u) => { const n = u.unit.replace(/\s+/g, ' ').trim(); return { ...u, unit: known.get(n.toLowerCase()) ?? n }; }) };
    if (b.prices) b = { ...b, prices: b.prices.map((pr) => ({ ...pr, unit: b.units!.find((u) => u.unit.toLowerCase() === pr.unit.trim().toLowerCase())?.unit ?? pr.unit })) };
    const err = checkUnits(b.units!);
    if (err) throw Errors.validation(err);
  }
  for (const [kind, v] of [['group', b.groupCode], ['industry', b.industryCode], ['brand', b.brandCode], ['type', b.typeCode]] as const) {
    if (!v) continue;
    const found = await trx.selectFrom('item_classes').select('code').where('tenant_id', '=', tenantId).where('kind', '=', kind).where('code', '=', v).executeTakeFirst();
    if (!found) throw Errors.validation(`Mã phân loại ${v} chưa có trong danh mục`);
  }
  // Mã hàng cha (họ mã 1 cấp): tạo mới không gửi → gợi ý theo mã; gửi → kiểm mã cha có thật, không phải chính nó, không có mã cha
  // (chỉ 1 cấp), và mã này không đang là cha của mã khác.
  if (b.parentSku === undefined && !exists) b = { ...b, parentSku: await suggestParent(trx, tenantId, sku) };
  if (b.parentSku) {
    const ps = b.parentSku.trim();
    if (ps === sku) throw Errors.validation('Mã hàng cha không được là chính mã này');
    const par = await trx.selectFrom('products').select(['sku', 'parent_sku']).where('tenant_id', '=', tenantId).where('sku', '=', ps).executeTakeFirst();
    if (!par) throw Errors.validation(`Mã hàng cha ${ps} chưa có trong danh mục`);
    if (par.parent_sku) throw Errors.validation(`${ps} đang là mã con của ${par.parent_sku} — họ mã chỉ 1 cấp, chọn mã cha ${par.parent_sku}`);
    const kids = exists ? await trx.selectFrom('products').select('sku').where('tenant_id', '=', tenantId).where('parent_sku', '=', sku).limit(3).execute() : [];
    if (kids.length) throw Errors.validation(`${sku} đang là mã cha của ${kids.map((k) => k.sku).join(', ')} — họ mã chỉ 1 cấp`);
  }
  const now = new Date();
  const patch: Record<string, unknown> = { ...productPatch(b), updated_at: now };
  // Gửi mã cha khác mã gợi ý theo mã (gồm cả bỏ cha) = chỉnh tay → quét cha – con theo mã không gán lại.
  if (b.parentSku !== undefined) patch.parent_manual = (b.parentSku?.trim() || null) !== (await suggestParent(trx, tenantId, sku));
  // Đơn vị nhỏ nhất (tỉ lệ 1) là ĐVT của mặt hàng.
  if (b.units) patch.unit = b.units.find((u) => Number(u.ratio) === 1)!.unit.trim();
  if (!exists) {
    await trx.insertInto('products').values({ tenant_id: tenantId, sku, name: b.name ?? '', unit: (patch.unit as string) ?? b.unit ?? '', source_system: opts.source ?? 'manual' }).execute();
  }
  await trx.updateTable('products').set(patch).where('tenant_id', '=', tenantId).where('sku', '=', sku).execute();
  // Hàng KCT (thuế bán ra KCT / R00K) chưa khai thuế mua vào → V13K (không chịu thuế đầu vào), không để phiếu mua tự lấy 8%.
  await trx.updateTable('products').set({ tax_in_code: 'V13K' }).where('tenant_id', '=', tenantId).where('sku', '=', sku).where('tax_in_code', 'is', null).where('tax_out_code', 'in', [...KCT_OUT_CODES]).execute();

  if (b.units) {
    const keep = b.units.map((u) => u.unit.trim());
    const gone = await trx.selectFrom('product_units').select('unit').where('tenant_id', '=', tenantId).where('sku', '=', sku).where('unit', 'not in', keep).execute();
    if (gone.length) {
      await trx.deleteFrom('product_units').where('tenant_id', '=', tenantId).where('sku', '=', sku).where('unit', 'not in', keep).execute();
      const dropped = await trx.deleteFrom('product_prices').where('tenant_id', '=', tenantId).where('sku', '=', sku).where('unit', 'not in', keep)
        .returning(['price_list_code', 'unit']).execute();
      await tombstone(trx, tenantId, 'unit', gone.map((g) => `${sku}|${g.unit}`));
      await tombstone(trx, tenantId, 'price', dropped.map((d) => `${d.price_list_code}|${sku}|${d.unit}`));
    }
    for (const u of b.units) {
      const values = { ratio: String(u.ratio), is_default: Boolean(u.isDefault), is_purchase_default: Boolean(u.isPurchaseDefault), weight_kg: u.weightKg === null || u.weightKg === undefined ? null : String(u.weightKg), note: u.note ?? '', updated_at: now };
      await trx.insertInto('product_units').values({ tenant_id: tenantId, sku, unit: u.unit.trim(), ...values })
        .onConflict((oc) => oc.columns(['tenant_id', 'sku', 'unit']).doUpdateSet(values)).execute();
    }
  }

  if (b.prices?.length) {
    const lists = new Set((await trx.selectFrom('price_lists').select('code').where('tenant_id', '=', tenantId).execute()).map((l) => l.code));
    const units = new Set((await trx.selectFrom('product_units').select('unit').where('tenant_id', '=', tenantId).where('sku', '=', sku).execute()).map((u) => u.unit));
    for (const pr of b.prices) {
      if (!lists.has(pr.priceListCode)) throw Errors.validation(`Bảng giá ${pr.priceListCode} chưa có`);
      if (!units.has(pr.unit)) throw Errors.validation(`Đơn vị "${pr.unit}" chưa có trong đơn vị tính của mặt hàng`);
    }
    for (const pr of b.prices) {
      const where = (q: any) => q.where('tenant_id', '=', tenantId).where('price_list_code', '=', pr.priceListCode).where('sku', '=', sku).where('unit', '=', pr.unit);
      if ((pr.price === null || pr.price === undefined) && !pr.isDefaultUnit) {
        const del = await where(trx.deleteFrom('product_prices')).returning('id').execute();
        if (del.length) await tombstone(trx, tenantId, 'price', [`${pr.priceListCode}|${sku}|${pr.unit}`]);
        continue;
      }
      const values = { price: pr.price === null || pr.price === undefined ? null : String(pr.price), is_default_unit: Boolean(pr.isDefaultUnit), note: pr.note ?? '', updated_at: now };
      await trx.insertInto('product_prices').values({ tenant_id: tenantId, price_list_code: pr.priceListCode, sku, unit: pr.unit, ...values })
        .onConflict((oc) => oc.columns(['tenant_id', 'price_list_code', 'sku', 'unit']).doUpdateSet(values)).execute();
    }
  }
  if (opts.quiet) return null; // nạp hàng loạt: không ghi nhật ký từng mặt hàng, không đọc lại
  await writeAudit(trx, { tenantId, actor, action: exists ? 'catalog.product.save' : 'catalog.product.create', objectType: 'product', objectId: sku, after: b });
  return getProduct(trx, tenantId, sku);
}

/** Xoá mặt hàng chưa có nhập xuất (kèm đơn vị tính, giá) và báo hệ thống bán hàng xoá theo. */
export async function deleteProduct(trx: Db, tenantId: string, actor: string, sku: string) {
  const before = await trx.selectFrom('products').selectAll().where('tenant_id', '=', tenantId).where('sku', '=', sku).executeTakeFirst();
  if (!before) throw Errors.notFound(`mặt hàng ${sku}`);
  const used = await trx.selectFrom('inventory_movements').select('sku').where('tenant_id', '=', tenantId).where('sku', '=', sku).limit(1).executeTakeFirst();
  if (used) throw Errors.conflict(`Mặt hàng ${sku} đã có nhập xuất: bỏ tích "Theo dõi" để ngừng`);
  await trx.deleteFrom('product_prices').where('tenant_id', '=', tenantId).where('sku', '=', sku).execute();
  await trx.deleteFrom('product_units').where('tenant_id', '=', tenantId).where('sku', '=', sku).execute();
  await trx.deleteFrom('products').where('id', '=', before.id).execute();
  await tombstone(trx, tenantId, 'product', [sku]);
  await writeAudit(trx, { tenantId, actor, action: 'product.delete', objectType: 'product', objectId: sku, before });
}

// ----------------------------------------------------------------------------------------------- bảng giá

/**
 * Lưới giá của một bảng giá: MỌI mặt hàng × đơn vị tính (kể cả ô chưa khai giá, để điền), kèm giá bảng giá công ty để so.
 */
export async function listPriceRows(trx: Db, tenantId: string, code: string) {
  const list = await trx.selectFrom('price_lists').select(['code', 'is_company']).where('tenant_id', '=', tenantId).where('code', '=', code).executeTakeFirst();
  if (!list) throw Errors.notFound(`bảng giá ${code}`);
  const company = await trx.selectFrom('price_lists').select('code').where('tenant_id', '=', tenantId).where('is_company', '=', true).executeTakeFirst();
  const r = await sql<{
    sku: string; name: string; group_code: string | null; is_main: boolean; is_active: boolean; no_sale: boolean;
    unit: string; ratio: string; is_default: boolean; price: string | null; is_default_unit: boolean | null; company_price: string | null;
  }>`
    SELECT u.sku, p.name, p.group_code, p.is_main, p.is_active, p.no_sale, u.unit, u.ratio, u.is_default,
           pp.price, pp.is_default_unit, cp.price AS company_price
      FROM product_units u
      JOIN products p ON p.tenant_id = u.tenant_id AND p.sku = u.sku
      LEFT JOIN product_prices pp ON pp.tenant_id = u.tenant_id AND pp.price_list_code = ${code} AND pp.sku = u.sku AND pp.unit = u.unit
      LEFT JOIN product_prices cp ON cp.tenant_id = u.tenant_id AND cp.price_list_code = ${company?.code ?? ''} AND cp.sku = u.sku AND cp.unit = u.unit
     WHERE u.tenant_id = ${tenantId}
     ORDER BY u.sku, u.ratio`.execute(trx);
  return {
    code: list.code, isCompany: list.is_company, companyCode: company?.code ?? null,
    rows: r.rows.map((x) => ({
      sku: x.sku, name: x.name, groupCode: x.group_code, isMain: x.is_main, isActive: x.is_active, noSale: x.no_sale,
      unit: x.unit, ratio: Number(x.ratio), isDefault: x.is_default,
      price: num(x.price), isDefaultUnit: Boolean(x.is_default_unit), companyPrice: num(x.company_price),
    })),
  };
}

/** Ghi nhiều ô giá của một bảng giá (price null = bỏ giá ô đó). Ô phải đúng đơn vị tính đang có của mặt hàng. */
export async function savePriceRows(trx: Db, tenantId: string, actor: string, code: string, rows: { sku: string; unit: string; price: number | null }[]) {
  const list = await trx.selectFrom('price_lists').select('code').where('tenant_id', '=', tenantId).where('code', '=', code).executeTakeFirst();
  if (!list) throw Errors.notFound(`bảng giá ${code}`);
  if (!rows.length) return { saved: 0, removed: 0 };
  const skus = [...new Set(rows.map((x) => x.sku))];
  const has = new Set((await trx.selectFrom('product_units').select(['sku', 'unit']).where('tenant_id', '=', tenantId).where('sku', 'in', skus).execute()).map((u) => `${u.sku}|${u.unit}`));
  const bad = rows.filter((x) => !has.has(`${x.sku}|${x.unit}`));
  if (bad.length) throw Errors.validation(`Đơn vị chưa có ở mặt hàng: ${bad.slice(0, 5).map((x) => `${x.sku}/${x.unit}`).join(', ')}${bad.length > 5 ? '…' : ''}`);
  const now = new Date();
  let saved = 0;
  const removed: string[] = [];
  for (const x of rows) {
    const where = (q: any) => q.where('tenant_id', '=', tenantId).where('price_list_code', '=', code).where('sku', '=', x.sku).where('unit', '=', x.unit);
    if (x.price === null) {
      // Ô có chọn ĐVT bán chính riêng của bảng giá thì giữ dòng, chỉ bỏ giá.
      const del = await where(trx.deleteFrom('product_prices')).where('is_default_unit', '=', false).returning('id').execute();
      if (del.length) removed.push(`${code}|${x.sku}|${x.unit}`);
      else await where(trx.updateTable('product_prices')).set({ price: null, updated_at: now }).execute();
      continue;
    }
    await trx.insertInto('product_prices').values({ tenant_id: tenantId, price_list_code: code, sku: x.sku, unit: x.unit, price: String(x.price), updated_at: now })
      .onConflict((oc) => oc.columns(['tenant_id', 'price_list_code', 'sku', 'unit']).doUpdateSet({ price: String(x.price), updated_at: now })).execute();
    saved++;
  }
  if (removed.length) await tombstone(trx, tenantId, 'price', removed);
  await writeAudit(trx, { tenantId, actor, action: 'catalog.price_list.prices', objectType: 'price_list', objectId: code, after: { saved, removed: removed.length, rows: rows.slice(0, 200) } });
  return { saved, removed: removed.length };
}

export async function listPriceLists(trx: Db, tenantId: string) {
  const [lists, branches, counts] = await Promise.all([
    trx.selectFrom('price_lists').selectAll().where('tenant_id', '=', tenantId).orderBy('is_company', 'desc').orderBy('code').execute(),
    trx.selectFrom('price_list_branches').selectAll().where('tenant_id', '=', tenantId).execute(),
    trx.selectFrom('product_prices').select(['price_list_code', (eb) => eb.fn.countAll<string>().as('n')]).where('tenant_id', '=', tenantId).where('price', 'is not', null).groupBy('price_list_code').execute(),
  ]);
  const n = new Map(counts.map((c) => [c.price_list_code, Number(c.n)]));
  return lists.map((l) => ({
    code: l.code, name: l.name, isCompany: l.is_company, isActive: l.is_active, note: l.note, updatedAt: l.updated_at,
    branchCodes: branches.filter((b) => b.price_list_code === l.code).map((b) => b.branch_code).sort(),
    pricedRows: n.get(l.code) ?? 0,
  }));
}

export async function savePriceList(trx: Db, tenantId: string, actor: string, code: string, b: { name: string; isCompany?: boolean; isActive?: boolean; note?: string }) {
  const values = { name: b.name, is_company: Boolean(b.isCompany), is_active: b.isActive ?? true, note: b.note ?? '', updated_at: new Date() };
  if (values.is_company) await trx.updateTable('price_lists').set({ is_company: false, updated_at: new Date() }).where('tenant_id', '=', tenantId).where('code', '!=', code).where('is_company', '=', true).execute();
  await trx.insertInto('price_lists').values({ tenant_id: tenantId, code, ...values }).onConflict((oc) => oc.columns(['tenant_id', 'code']).doUpdateSet(values)).execute();
  await writeAudit(trx, { tenantId, actor, action: 'catalog.price_list.save', objectType: 'price_list', objectId: code, after: b });
}

export async function deletePriceList(trx: Db, tenantId: string, actor: string, code: string) {
  const l = await trx.selectFrom('price_lists').selectAll().where('tenant_id', '=', tenantId).where('code', '=', code).executeTakeFirst();
  if (!l) throw Errors.notFound(`bảng giá ${code}`);
  if (l.is_company) throw Errors.conflict('Không xoá được bảng giá công ty: chọn bảng giá khác làm bảng giá công ty trước');
  const assigned = await trx.selectFrom('price_list_branches').select('branch_code').where('tenant_id', '=', tenantId).where('price_list_code', '=', code).limit(1).executeTakeFirst();
  if (assigned) throw Errors.conflict(`Bảng giá ${code} đang áp cho chi nhánh ${assigned.branch_code}: gỡ chi nhánh trước`);
  await trx.deleteFrom('product_prices').where('tenant_id', '=', tenantId).where('price_list_code', '=', code).execute();
  await trx.deleteFrom('price_lists').where('id', '=', l.id).execute();
  await tombstone(trx, tenantId, 'price_list', [code]);
  await writeAudit(trx, { tenantId, actor, action: 'catalog.price_list.delete', objectType: 'price_list', objectId: code, before: l });
}

/** Gán các chi nhánh cho bảng giá (chi nhánh đang ở bảng giá khác thì chuyển sang). */
export async function setPriceListBranches(trx: Db, tenantId: string, actor: string, code: string, branchCodes: string[]) {
  const l = await trx.selectFrom('price_lists').select('code').where('tenant_id', '=', tenantId).where('code', '=', code).executeTakeFirst();
  if (!l) throw Errors.notFound(`bảng giá ${code}`);
  const known = new Set((await trx.selectFrom('branches').select('code').where('tenant_id', '=', tenantId).execute()).map((b) => b.code));
  const bad = branchCodes.filter((c) => !known.has(c));
  if (bad.length) throw Errors.validation(`Chi nhánh chưa có: ${bad.join(', ')}`);
  const now = new Date();
  await trx.deleteFrom('price_list_branches').where('tenant_id', '=', tenantId).where('price_list_code', '=', code).where('branch_code', 'not in', branchCodes.length ? branchCodes : ['']).execute();
  for (const bc of branchCodes) {
    await trx.insertInto('price_list_branches').values({ tenant_id: tenantId, branch_code: bc, price_list_code: code, updated_at: now })
      .onConflict((oc) => oc.columns(['tenant_id', 'branch_code']).doUpdateSet({ price_list_code: code, updated_at: now })).execute();
  }
  await trx.updateTable('price_lists').set({ updated_at: now }).where('tenant_id', '=', tenantId).where('code', '=', code).execute();
  await writeAudit(trx, { tenantId, actor, action: 'catalog.price_list.branches', objectType: 'price_list', objectId: code, after: { branchCodes } });
}

// ----------------------------------------------------------------------------------------------- luồng thay đổi

/** Con trỏ luồng: thời điểm + id cuối đã đọc (cùng thời điểm thì so id). Dạng "<ISO>|<id>". */
export interface Cursor { at: string; id: string }
export const parseCursor = (s?: string): Cursor => {
  const [at, id] = (s ?? '').split('|');
  return { at: at && !Number.isNaN(Date.parse(at)) ? at : '1970-01-01T00:00:00Z', id: id && /^\d+$/.test(id) ? id : '0' };
};
const cursorOf = (at: Date | string, id: string) => `${new Date(at).toISOString()}|${id}`;

/** Nhóm hàng (đủ cây), bảng giá, gán bảng giá – chi nhánh, mục đã xoá từ một thời điểm. Gọn, trả hết mỗi lần. */
export async function feedMeta(trx: Db, tenantId: string, since?: string) {
  const at = parseCursor(since).at;
  const [groups, lists, branches, tomb] = await Promise.all([
    trx.selectFrom('item_classes').select(['code', 'name', 'parent_code', 'sku_code', 'is_active', 'updated_at']).where('tenant_id', '=', tenantId).where('kind', '=', 'group').orderBy('code').execute(),
    listPriceLists(trx, tenantId),
    trx.selectFrom('price_list_branches').select(['branch_code', 'price_list_code']).where('tenant_id', '=', tenantId).execute(),
    trx.selectFrom('catalog_tombstones').select(['entity', 'key', 'deleted_at']).where('tenant_id', '=', tenantId).where('deleted_at', '>', new Date(at)).orderBy('deleted_at').execute(),
  ]);
  return {
    serverTime: new Date().toISOString(),
    groups: groups.map((g) => ({ code: g.code, name: g.name, parentCode: g.parent_code, skuCode: g.sku_code, isActive: g.is_active })),
    priceLists: lists.map(({ branchCodes: _b, pricedRows: _n, ...l }) => l),
    branches: branches.map((b) => ({ branchCode: b.branch_code, priceListCode: b.price_list_code })),
    tombstones: tomb.map((t) => ({ entity: t.entity, key: t.key, deletedAt: t.deleted_at })),
  };
}

/** Mặt hàng đổi sau con trỏ (kèm trọn bộ đơn vị tính, thuế suất ra). limit dòng mỗi lượt, next = con trỏ lượt sau. */
export async function feedProducts(trx: Db, tenantId: string, after?: string, limit = 1000) {
  const c = parseCursor(after);
  const rows = await trx.selectFrom('products as p')
    .leftJoin('tax_codes as t', (j) => j.onRef('t.tenant_id', '=', 'p.tenant_id').onRef('t.code', '=', 'p.tax_out_code'))
    .select(['p.id', ...PRODUCT_COLS.map((k) => `p.${k}` as const), 't.rate as tax_rate'])
    .where('p.tenant_id', '=', tenantId)
    .where((eb) => eb.or([eb('p.updated_at', '>', new Date(c.at)), eb.and([eb('p.updated_at', '=', new Date(c.at)), eb('p.id', '>', c.id)])]))
    .orderBy('p.updated_at').orderBy('p.id').limit(limit).execute();
  const skus = rows.map((r) => r.sku);
  const units = skus.length ? await trx.selectFrom('product_units').selectAll().where('tenant_id', '=', tenantId).where('sku', 'in', skus).orderBy('ratio').execute() : [];
  const bySku = new Map<string, typeof units>();
  for (const u of units) bySku.set(u.sku, [...(bySku.get(u.sku) ?? []), u]);
  const last = rows[rows.length - 1];
  return {
    items: rows.map((r) => ({
      ...productDto(r as unknown as ProductRow),
      taxRate: r.tax_rate === null || r.tax_rate === undefined ? null : Number(r.tax_rate),
      units: (bySku.get(r.sku) ?? []).map((u) => ({ unit: u.unit, ratio: Number(u.ratio), isDefault: u.is_default, weightKg: num(u.weight_kg), note: u.note })),
    })),
    next: last ? cursorOf(last.updated_at, last.id) : after ?? cursorOf(c.at, c.id),
    more: rows.length === limit,
  };
}

/** Dòng giá đổi sau con trỏ. */
export async function feedPrices(trx: Db, tenantId: string, after?: string, limit = 5000) {
  const c = parseCursor(after);
  const rows = await trx.selectFrom('product_prices').selectAll()
    .where('tenant_id', '=', tenantId)
    .where((eb) => eb.or([eb('updated_at', '>', new Date(c.at)), eb.and([eb('updated_at', '=', new Date(c.at)), eb('id', '>', c.id)])]))
    .orderBy('updated_at').orderBy('id').limit(limit).execute();
  const last = rows[rows.length - 1];
  return {
    items: rows.map((r) => ({ priceListCode: r.price_list_code, sku: r.sku, unit: r.unit, price: num(r.price), isDefaultUnit: r.is_default_unit, note: r.note })),
    next: last ? cursorOf(last.updated_at, last.id) : after ?? cursorOf(c.at, c.id),
    more: rows.length === limit,
  };
}

// ----------------------------------------------------------------------------------------------- nạp dữ liệu ban đầu

export interface ImportInput {
  products?: (ProductInput & { sku: string })[];
  priceLists?: { code: string; name: string; isCompany?: boolean; isActive?: boolean; note?: string }[];
  branches?: { branchCode: string; priceListCode: string }[];
  prices?: (PriceInput & { sku: string })[];
  groupSkuCodes?: { code: string; skuCode: string }[];
}

/**
 * Nạp dữ liệu từ hệ thống bán hàng (lần chuyển sang khai ở phần mềm kế toán). Ghi đè theo khoá; mặt hàng chưa có thì
 * thêm. Bỏ qua (không lỗi) mã phân loại / đơn vị / bảng giá / chi nhánh chưa có — trả danh sách bỏ qua để xem lại.
 */
export async function importCatalog(trx: Db, tenantId: string, actor: string, b: ImportInput) {
  const skipped: string[] = [];
  const now = new Date();
  for (const l of b.priceLists ?? []) await savePriceList(trx, tenantId, actor, l.code, l);
  for (const g of b.groupSkuCodes ?? []) {
    await trx.updateTable('item_classes').set({ sku_code: g.skuCode, updated_at: now }).where('tenant_id', '=', tenantId).where('kind', '=', 'group').where('code', '=', g.code).execute();
  }
  const groups = new Set((await trx.selectFrom('item_classes').select('code').where('tenant_id', '=', tenantId).where('kind', '=', 'group').execute()).map((g) => g.code));
  for (const p of b.products ?? []) {
    if (p.groupCode && !groups.has(p.groupCode)) { skipped.push(`${p.sku}: nhóm hàng ${p.groupCode} chưa có — bỏ nhóm`); p.groupCode = null; }
    p.industryCode = undefined; p.brandCode = undefined; p.typeCode = undefined; // giữ phân loại đang có ở phần mềm kế toán
    if (p.units && checkUnits(p.units)) {
      skipped.push(`${p.sku}: ${checkUnits(p.units)} — bỏ đơn vị tính`);
      p.units = undefined;
    }
    const { prices: _ignored, ...rest } = p;
    await saveProduct(trx, tenantId, actor, p.sku, rest, { source: 'import', quiet: true });
  }
  if (b.prices?.length) {
    const lists = new Set((await trx.selectFrom('price_lists').select('code').where('tenant_id', '=', tenantId).execute()).map((l) => l.code));
    const units = await trx.selectFrom('product_units').select(['sku', 'unit']).where('tenant_id', '=', tenantId).where('sku', 'in', [...new Set(b.prices.map((x) => x.sku))]).execute();
    const has = new Set(units.map((u) => `${u.sku}|${u.unit}`));
    for (const pr of b.prices) {
      if (!lists.has(pr.priceListCode) || !has.has(`${pr.sku}|${pr.unit}`)) { skipped.push(`giá ${pr.priceListCode}/${pr.sku}/${pr.unit}: thiếu bảng giá hoặc đơn vị`); continue; }
      const values = { price: pr.price === null || pr.price === undefined ? null : String(pr.price), is_default_unit: Boolean(pr.isDefaultUnit), note: pr.note ?? '', updated_at: now };
      await trx.insertInto('product_prices').values({ tenant_id: tenantId, price_list_code: pr.priceListCode, sku: pr.sku, unit: pr.unit, ...values })
        .onConflict((oc) => oc.columns(['tenant_id', 'price_list_code', 'sku', 'unit']).doUpdateSet(values)).execute();
    }
  }
  if (b.branches?.length) {
    const known = new Set((await trx.selectFrom('branches').select('code').where('tenant_id', '=', tenantId).execute()).map((x) => x.code));
    for (const a of b.branches) {
      if (!known.has(a.branchCode)) { skipped.push(`chi nhánh ${a.branchCode} chưa có`); continue; }
      await trx.insertInto('price_list_branches').values({ tenant_id: tenantId, branch_code: a.branchCode, price_list_code: a.priceListCode, updated_at: now })
        .onConflict((oc) => oc.columns(['tenant_id', 'branch_code']).doUpdateSet({ price_list_code: a.priceListCode, updated_at: now })).execute();
    }
  }
  await writeAudit(trx, { tenantId, actor, action: 'catalog.import', objectType: 'catalog', objectId: `${b.products?.length ?? 0} mặt hàng`, after: { products: b.products?.length ?? 0, prices: b.prices?.length ?? 0, priceLists: b.priceLists?.length ?? 0, branches: b.branches?.length ?? 0 } });
  return {
    products: b.products?.length ?? 0, prices: b.prices?.length ?? 0, priceLists: b.priceLists?.length ?? 0, branches: b.branches?.length ?? 0,
    skipped: skipped.slice(0, 200), skippedCount: skipped.length,
  };
}

/** Mã hàng đã có chưa (ô nhập mã khi thêm mặt hàng). */
export async function skuExists(trx: Db, tenantId: string, sku: string) {
  const r = await sql<{ n: number }>`SELECT 1 AS n FROM products WHERE tenant_id = ${tenantId} AND sku = ${sku} LIMIT 1`.execute(trx);
  return r.rows.length > 0;
}
