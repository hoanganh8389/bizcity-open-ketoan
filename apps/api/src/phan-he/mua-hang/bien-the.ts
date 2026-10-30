// @bizcity-layer D modules/mua-hang
/**
 * BIẾN THỂ MẶT HÀNG (MH26): mã con = mã gốc + đuôi (Q kẹp quà, Z, K, M, T, B…; products.parent_sku). Cấu hình đuôi nào khi PHÂN
 * TÍCH ĐẶT HÀNG (MH02) được TÁCH RIÊNG thành dòng độc lập, đuôi nào GỘP vào mã gốc (cộng dồn tồn, max, bán, đi đường, đơn đang đặt).
 * Lưu ở cài đặt mua hàng của đơn vị (tenants.settings.purchase.variantSeparate). Mặc định tách riêng Q (hàng kẹp quà) và T (hàng có tem) —
 * hai loại này đặt riêng với hàng thường.
 */
import { SKU_SUFFIXES } from '@ketoan/contracts/mua-hang';
import type { Db } from '../../db/client.js';
import { loadSettings, saveSettings } from './analysis.js';

export const DEFAULT_VARIANT_SEPARATE = ['Q', 'T'];

/** Đuôi của mã con so với mã gốc (mã con = mã gốc + đuôi); không bắt đầu bằng mã gốc thì lấy ký tự cuối. */
export const suffixOf = (sku: string, parentSku: string) => (sku.startsWith(parentSku) ? sku.slice(parentSku.length) : sku.slice(-1)).toUpperCase();

/** Các đuôi phân tích đặt hàng TÁCH RIÊNG (không gộp vào mã gốc). */
export async function variantSeparate(trx: Db, tenantId: string): Promise<string[]> {
  const v = (await loadSettings(trx, tenantId)).variantSeparate;
  return Array.isArray(v) ? v.map((x) => String(x).toUpperCase()) : DEFAULT_VARIANT_SEPARATE;
}

/** Lưu qua cài đặt mua hàng của phân hệ (cùng đường với MH12) — không ghi thẳng bảng lõi. */
export async function saveVariantSeparate(trx: Db, tenantId: string, list: string[]): Promise<string[]> {
  const v = [...new Set(list.map((x) => x.trim().toUpperCase()).filter(Boolean))].sort();
  await saveSettings(trx, tenantId, { ...(await loadSettings(trx, tenantId)), variantSeparate: v });
  return v;
}

/** Bảng cho MH26: mỗi đuôi đang có trong danh mục (và các đuôi chuẩn) — số mã con, vài mã ví dụ, đang gộp hay tách. */
export async function variantOverview(trx: Db, tenantId: string) {
  const separate = await variantSeparate(trx, tenantId);
  const rows = await trx.selectFrom('products').select(['sku', 'name', 'parent_sku']).where('tenant_id', '=', tenantId).where('parent_sku', 'is not', null).orderBy('sku').execute();
  const by = new Map<string, { count: number; samples: { sku: string; name: string; parentSku: string }[] }>();
  for (const r of rows) {
    const s = suffixOf(r.sku, r.parent_sku!);
    const x = by.get(s) ?? by.set(s, { count: 0, samples: [] }).get(s)!;
    x.count++;
    if (x.samples.length < 3) x.samples.push({ sku: r.sku, name: r.name, parentSku: r.parent_sku! });
  }
  const known = SKU_SUFFIXES.map((x) => x.suffix);
  const suffixes = [...new Set([...known, ...by.keys()])].filter(Boolean).map((suffix) => ({
    suffix,
    // Mã đuôi T không được tự gắn mã cha khi quét danh mục (catalog.service) — chỉ gộp được mã T đã chọn tay mã cha ở mặt hàng.
    label: `${SKU_SUFFIXES.find((x) => x.suffix === suffix)?.label ?? `${suffix} — đuôi khác (đang có trong danh mục)`}${suffix === 'T' ? ' · không tự gắn mã cha (chọn tay ở mặt hàng mới gộp được)' : ''}`,
    count: by.get(suffix)?.count ?? 0, samples: by.get(suffix)?.samples ?? [], separate: separate.includes(suffix),
  }));
  return { separate, suffixes };
}
