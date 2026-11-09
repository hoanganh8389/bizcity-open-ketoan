// @bizcity-layer M data/masterdata
// [2026-11-07 05:40 PM Nguyễn Văn Thủy] PHASE-026 — mã số cha – con GĐ 1: danh mục biến thể, Thêm sản phẩm con, khoá đổi mã có đuôi (đóng góp)
// [2026-11-09 10:00 AM Nguyễn Văn Thủy] PHASE-026 — bỏ khoá tạm: mọi biến thể dùng được với mã số; đổi mã không đổi biến thể (đóng góp)
/**
 * SẢN PHẨM CON: mã con = mã cha + 2 số thứ tự, không mang nghĩa (docs/nghiep-vu/12). Họ mã một cấp, quan hệ lưu ở parent_sku / parent_item_id.
 *
 * Mọi biến thể (Thường, Nội bộ, Kẹp quà…) đều là sản phẩm con: người dùng gõ tên tuỳ ý và tích một biến thể.
 * Phần mềm chỉ đọc ô Biến thể (products.variant_code), không đọc tên, không đọc chữ cuối mã.
 * Biến thể thuộc về mặt hàng, không thuộc về mã: đổi mã không làm đổi biến thể.
 * Mọi hàm chạy trong giao dịch của action. Cột variant_code đọc bằng sql vì types.ts đang có người giữ chỗ.
 */
import { sql } from 'kysely';
import type { Db } from '../../db/client.js';
import { Errors } from '../../core/errors.js';
import { getProduct, saveProduct } from './catalog.service.js';

export interface VariantKind {
  code: string; name: string; legacySuffix: string; taxFlow: string; taxSku: string; isActive: boolean; note: string; products: number;
}

type KindRow = { code: string; name: string; legacy_suffix: string; tax_flow: string; tax_sku: string; is_active: boolean; note: string; products: string };

/** Danh mục biến thể kèm số mặt hàng. Đơn vị tạo sau migration được nạp bộ chuẩn ở lần đọc đầu. */
export async function listVariantKinds(trx: Db, tenantId: string): Promise<VariantKind[]> {
  const read = () => sql<KindRow>`
    SELECT k.code, k.name, k.legacy_suffix, k.tax_flow, k.tax_sku, k.is_active, k.note,
           (SELECT COUNT(*) FROM products p WHERE p.tenant_id = k.tenant_id AND p.variant_code = k.code)::text AS products
      FROM item_variant_kinds k WHERE k.tenant_id = ${tenantId} ORDER BY k.sort_order, k.code`.execute(trx);
  let rows = (await read()).rows;
  if (!rows.length) {
    await sql`SELECT bizcity_seed_variant_kinds(${tenantId}::bigint)`.execute(trx);
    rows = (await read()).rows;
  }
  return rows.map((r) => ({ code: r.code, name: r.name, legacySuffix: r.legacy_suffix, taxFlow: r.tax_flow, taxSku: r.tax_sku, isActive: r.is_active, note: r.note, products: Number(r.products) }));
}

/** Mã con kế tiếp: số lớn nhất từng dùng + 1, kể cả mã đã đổi hoặc đã xoá (mã không dùng lại, R-ITEM-0). Quá 99 thì dùng 3 số. */
export async function nextChildSku(trx: Db, tenantId: string, parentSku: string): Promise<string> {
  const pattern = `^${parentSku}[0-9]{2,3}$`;
  const r = await sql<{ n: string | null }>`
    SELECT MAX(substr(code, ${parentSku.length + 1})::int)::text AS n FROM item_codes
     WHERE tenant_id = ${tenantId} AND kind IN ('sku', 'alias') AND code ~ ${pattern}`.execute(trx);
  const n = Number(r.rows[0]?.n ?? 0) + 1;
  if (n > 999) throw Errors.conflict(`Mã ${parentSku} đã dùng hết số mã con`);
  return parentSku + String(n).padStart(n > 99 ? 3 : 2, '0');
}

export interface ChildInput { parentSku: string; name: string; variantCode: string; sendToTax?: boolean; barcode?: string; note?: string; noSaleParent?: boolean }

export async function addChildProduct(trx: Db, tenantId: string, actor: string, i: ChildInput) {
  const parentSku = i.parentSku.trim();
  const name = i.name.replace(/\s+/g, ' ').trim();
  const parent = await trx.selectFrom('products').selectAll().where('tenant_id', '=', tenantId).where('sku', '=', parentSku).forUpdate().executeTakeFirst();
  if (!parent) throw Errors.notFound(`mặt hàng ${parentSku}`);
  if (parent.parent_sku) throw Errors.validation(`${parentSku} đang là mã con của ${parent.parent_sku}. Họ mã chỉ một cấp, hãy thêm từ mã cha ${parent.parent_sku}`);
  if (!/^\d+$/.test(parentSku)) throw Errors.validation(`Mã cha ${parentSku} còn có chữ. Đổi mã cha sang mã số trước rồi mới thêm sản phẩm con`);
  if (!name) throw Errors.validation('Nhập tên sản phẩm con');

  const kinds = await listVariantKinds(trx, tenantId);
  const kind = kinds.find((k) => k.code === i.variantCode);
  if (!kind || !kind.isActive) throw Errors.validation(`Biến thể ${i.variantCode} không có hoặc đã ngừng dùng`);

  const dup = await sql<{ sku: string }>`
    SELECT sku FROM products WHERE tenant_id = ${tenantId} AND parent_sku = ${parentSku}
       AND lower(regexp_replace(trim(name), '\\s+', ' ', 'g')) = lower(${name}) AND is_active LIMIT 1`.execute(trx);
  if (dup.rows[0]) throw Errors.conflict(`Sản phẩm con cùng tên đã có: ${dup.rows[0].sku}`);

  const sku = await nextChildSku(trx, tenantId, parentSku);
  // Lấy theo cha mọi thứ ảnh hưởng thuế và phân loại. Giá bán để trống như mã biến thể cũ.
  await saveProduct(trx, tenantId, actor, sku, {
    name, unit: parent.unit, note: i.note?.trim() ?? '', barcode: i.barcode?.trim() ?? '',
    parentSku,
    groupCode: parent.group_code, industryCode: parent.industry_code, brandCode: parent.brand_code, typeCode: parent.type_code,
    postingGroupCode: parent.posting_group_code, taxOutCode: parent.tax_out_code, taxInCode: parent.tax_in_code,
    exciseRate: parent.excise_rate === null ? null : Number(parent.excise_rate),
    origin: parent.origin, weightKg: parent.weight_kg === null ? null : Number(parent.weight_kg),
    isMain: parent.is_main, isUnder24m: parent.is_under_24m, exportAdjust: parent.export_adjust,
    units: undefined, variantCode: kind.code, sendToTax: i.sendToTax ?? true,
  }, { isNew: true, source: 'manual' });
  if (i.noSaleParent && !parent.no_sale) {
    await trx.updateTable('products').set({ no_sale: true, updated_at: new Date() }).where('tenant_id', '=', tenantId).where('sku', '=', parentSku).execute();
  }
  return getProduct(trx, tenantId, sku);
}

/**
 * Khoá gộp mã: hàng Nội bộ và hàng lên thuế không được gộp với nhau, nếu không phần sau gộp sẽ đi sai đường thuế.
 * Quầy bán chỉ còn thấy mã giữ lại, nên gộp cũng làm đổi đường đi như đổi mã.
 */
export async function guardMerge(trx: Db, tenantId: string, fromSku: string, toSku: string): Promise<void> {
  const rows = (await sql<{ sku: string; variant_code: string }>`
    SELECT sku, variant_code FROM products WHERE tenant_id = ${tenantId} AND sku IN (${fromSku}, ${toSku})`.execute(trx)).rows;
  const of = (sku: string) => rows.find((r) => r.sku === sku)?.variant_code;
  const from = of(fromSku), to = of(toSku);
  if (from && to && (from === 'internal') !== (to === 'internal')) {
    throw Errors.validation(`Không gộp ${fromSku} vào ${toSku}: một mã là hàng Nội bộ không sang thuế, mã kia có sang thuế`);
  }
}
