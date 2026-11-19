// [2026-11-19 Nguyễn Văn Thủy] khoanh vùng mặt hàng theo hợp đồng: giá mua / chính sách thuộc hợp đồng chỉ được mã của hợp đồng (đóng góp)
/**
 * PHẠM VI MẶT HÀNG CỦA HỢP ĐỒNG MUA (bước 2 "Hàng hoá theo hợp đồng"):
 *   - hợp đồng ghi mã  → chỉ các mã đó;
 *   - chỉ ghi nhãn      → mọi mã thuộc các nhãn đó;
 *   - để trống          → mọi hàng của NCC (không khoanh).
 * Giá mua (supplier_products.contract_code) và chính sách (scope.contractCode) thuộc hợp đồng phải nằm trong phạm vi này.
 * Mã ngoài hợp đồng khai ở thẻ "Không theo hợp đồng" của hồ sơ NCC.
 */
import type { Db } from '../../db/client.js';
import { Errors } from '../../core/errors.js';

export async function contractItemScope(trx: Db, tenantId: string, code: string): Promise<{ skus: string[]; brands: string[] }> {
  const c = await trx.selectFrom('dimensions').select(['extra']).where('tenant_id', '=', tenantId).where('kind', '=', 'contract').where('code', '=', code).executeTakeFirst();
  const x = (c?.extra ?? {}) as Record<string, unknown>;
  const arr = (v: unknown) => (Array.isArray(v) ? v.map(String).filter(Boolean) : []);
  return { skus: arr(x.skus), brands: arr(x.brandCodes) };
}

/** Báo lỗi nếu có mã nằm ngoài phạm vi mặt hàng của hợp đồng. */
export async function checkContractItems(trx: Db, tenantId: string, code: string, skus: string[], what: string) {
  const list = [...new Set(skus.filter(Boolean))];
  if (!code || !list.length) return;
  const s = await contractItemScope(trx, tenantId, code);
  let bad: string[] = [];
  if (s.skus.length) bad = list.filter((x) => !s.skus.includes(x));
  else if (s.brands.length) {
    const rows = await trx.selectFrom('products').select(['sku', 'brand_code']).where('tenant_id', '=', tenantId).where('sku', 'in', list).execute();
    bad = list.filter((x) => !s.brands.includes(rows.find((r) => r.sku === x)?.brand_code ?? ''));
  }
  if (bad.length) throw Errors.validation(`${what}: mã ${bad.slice(0, 10).join(', ')}${bad.length > 10 ? '…' : ''} không thuộc hàng hoá của hợp đồng ${code} — thêm mã ở bước "Hàng hoá theo hợp đồng", hoặc khai ở thẻ "Không theo hợp đồng" của NCC`);
}
