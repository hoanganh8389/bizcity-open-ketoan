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
import { sql } from 'kysely';
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

// [2026-11-21 Nguyễn Văn Thủy] khai giá mua theo hợp đồng ở form mặt hàng: mã chưa có trong hàng hoá của hợp đồng thì tự thêm (đóng góp)
/**
 * Thêm mã vào hàng hoá của hợp đồng nếu chưa có (hợp đồng đang khoanh theo danh sách mã). Hợp đồng chỉ khoanh theo nhãn: mã thuộc
 * nhãn thì đã hợp lệ, mã khác nhãn vẫn báo lỗi (thêm mã sẽ đổi hợp đồng từ "theo nhãn" sang "theo mã"). Trả các mã đã thêm.
 */
export async function ensureContractItems(trx: Db, tenantId: string, code: string, skus: string[], what: string): Promise<string[]> {
  const list = [...new Set(skus.filter(Boolean))];
  if (!code || !list.length) return [];
  const s = await contractItemScope(trx, tenantId, code);
  if (!s.skus.length) { await checkContractItems(trx, tenantId, code, list, what); return []; }
  const add = list.filter((x) => !s.skus.includes(x));
  if (!add.length) return [];
  if (s.brands.length) {
    const rows = await trx.selectFrom('products').select(['sku', 'brand_code']).where('tenant_id', '=', tenantId).where('sku', 'in', add).execute();
    const bad = add.filter((x) => !s.brands.includes(rows.find((r) => r.sku === x)?.brand_code ?? ''));
    if (bad.length) throw Errors.validation(`${what}: mã ${bad.slice(0, 10).join(', ')} không thuộc nhãn hàng của hợp đồng ${code} — thêm nhãn ở bước "Hàng hoá theo hợp đồng", hoặc khai ở thẻ "Không theo hợp đồng" của NCC`);
  }
  await trx.updateTable('dimensions')
    .set({ extra: sql`jsonb_set(COALESCE(extra, '{}'::jsonb), '{skus}', COALESCE(extra->'skus', '[]'::jsonb) || ${JSON.stringify(add)}::jsonb)` } as never)
    .where('tenant_id', '=', tenantId).where('kind', '=', 'contract').where('code', '=', code).execute();
  return add;
}
