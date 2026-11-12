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
