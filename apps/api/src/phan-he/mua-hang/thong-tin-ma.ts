// @bizcity-layer D modules/mua-hang
/**
 * Thông tin mặt hàng cho báo cáo mua hàng (MH23): tên theo DANH MỤC (không theo chữ ghi trên dòng phiếu), đường dẫn nhóm hàng đầy đủ
 * (Nhóm hàng\Sữa\Sữa bột…) và ba cấp phân loại tách cột: ngành · nhãn · nhóm (mã + tên). Chỉ đọc.
 */
import type { Db } from '../../db/client.js';

export interface SkuInfoRow { sku: string; name: string; groupPath: string; industry: string; brand: string; group: string }

export async function skuInfoRows(trx: Db, tenantId: string, skus: string[]): Promise<Record<string, SkuInfoRow>> {
  const list = [...new Set(skus.filter(Boolean))];
  if (!list.length) return {};
  const [prods, classes] = await Promise.all([
    trx.selectFrom('products').select(['sku', 'name', 'group_code', 'industry_code', 'brand_code']).where('tenant_id', '=', tenantId).where('sku', 'in', list).execute(),
    trx.selectFrom('item_classes').select(['kind', 'code', 'name', 'parent_code']).where('tenant_id', '=', tenantId).where('kind', 'in', ['group', 'industry', 'brand']).execute(),
  ]);
  const byKind = (k: string) => new Map(classes.filter((c) => c.kind === k).map((c) => [c.code, c]));
  const groups = byKind('group'), inds = byKind('industry'), brands = byKind('brand');
  const path = (code: string | null) => {
    const parts: string[] = [];
    const seen = new Set<string>();
    for (let c = code ? groups.get(code) : undefined; c && !seen.has(c.code); c = c.parent_code ? groups.get(c.parent_code) : undefined) { seen.add(c.code); parts.unshift(c.name); }
    return parts.join('\\');
  };
  const label = (m: Map<string, { name: string }>, code: string | null) => (code ? `${m.get(code)?.name ?? code}` : '');
  const out: Record<string, SkuInfoRow> = {};
  for (const p of prods) out[p.sku] = { sku: p.sku, name: p.name, groupPath: path(p.group_code), industry: label(inds, p.industry_code), brand: label(brands, p.brand_code), group: label(groups, p.group_code) };
  return out;
}
