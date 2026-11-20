// [2026-11-20 khanhtd] TRA-CUU — dò chương trình áp riêng chồng nhau theo mã, để form chính sách cảnh báo trước khi ghi (đóng góp)
/**
 * CHỒNG ÁP RIÊNG — chính sách đang khai (p) đụng chương trình ÁP RIÊNG nào khác, ở những mã nào, và ai thắng theo ưu tiên.
 * Chỉ xét PHẠM VI (NCC, nhãn, mã, chi nhánh, hiệu lực) — điều kiện SL / tổng đơn và mức lợi tính ở từng phiếu (exclusiveBySku);
 * vì vậy kết quả là "có thể chồng": đủ để người khai đặt ưu tiên đúng, chi tiết từng phiếu xem ở màn Tra cứu TC01.
 *   - p tích áp riêng: so ưu tiên với từng chương trình áp riêng khác → thang / thua / ngang (ngang = phiếu nào lợi hơn thì thắng);
 *   - p không tích: mã nào đang có chương trình áp riêng khác → p bị chặn ở mã đó (bi-chan).
 * Không đổi cách tính phiếu.
 */
import { STACK_KINDS, giftItemsOf, isExclusive, scopeBranches, type ItemDiscount, type Policy } from './engine.js';

export type ChongKetQua = 'thang' | 'thua' | 'ngang' | 'bi-chan';
export interface ApRiengChong {
  other: Pick<Policy, 'id' | 'code' | 'name' | 'kind' | 'priority'>;
  /** Mã chồng nhau; `null` = chồng trên cả phạm vi (cả hai không ghi mã cụ thể). */
  skus: string[] | null;
  result: ChongKetQua;
}

/** Chính sách có áp riêng không (mua X tặng Y: có ít nhất một dòng áp riêng). */
export const coApRieng = (p: Pick<Policy, 'kind' | 'rule' | 'scope'>) => isExclusive(p) || (p.kind === 'promo_gift' && giftItemsOf(p).some((i) => i.apply === 'exclusive'));

/** Mã mà chính sách nhắm tới; `null` = mọi mã trong phạm vi NCC / nhãn. `onlyExclusive`: mua X tặng Y chỉ lấy dòng áp riêng. */
export function skusOf(p: Pick<Policy, 'kind' | 'rule' | 'scope'>, onlyExclusive = false): string[] | null {
  if (p.kind === 'item_discount') return [...new Set(((p.rule.items as ItemDiscount[] | undefined) ?? []).map((i) => i.sku).filter(Boolean))];
  if (p.kind === 'promo_gift') {
    const rows = giftItemsOf(p).filter((i) => !onlyExclusive || isExclusive(p) || i.apply === 'exclusive');
    return rows.some((i) => !i.sku) ? null : [...new Set(rows.map((i) => i.sku))];
  }
  return p.scope.sku ? [p.scope.sku] : null;
}

const overlapDates = (a: Pick<Policy, 'validFrom' | 'validTo'>, b: Pick<Policy, 'validFrom' | 'validTo'>) =>
  (a.validFrom ?? '') <= (b.validTo ?? '9999-12-31') && (b.validFrom ?? '') <= (a.validTo ?? '9999-12-31');
const overlapList = (a: string[], b: string[]) => !a.length || !b.length || a.some((x) => b.includes(x));

/**
 * brandOf: nhãn của mã (danh mục mặt hàng); không biết thì coi như có thể chồng. Trả các chương trình áp riêng khác chồng với p,
 * cái thua / ngang / chặn trước.
 */
export function apRiengChong(p: Policy, all: Policy[], brandOf: (sku: string) => string | undefined = () => undefined): ApRiengChong[] {
  if (!STACK_KINDS.includes(p.kind)) return [];
  const mine = coApRieng(p);
  const pSkus = skusOf(p, mine);
  const out: ApRiengChong[] = [];
  for (const q of all) {
    if (q.id === p.id || q.code === p.code || !q.isActive || !STACK_KINDS.includes(q.kind) || !coApRieng(q)) continue;
    const a = p.scope, b = q.scope;
    if (a.partnerCode && b.partnerCode && a.partnerCode !== b.partnerCode) continue;
    if (!overlapList(scopeBranches(a), scopeBranches(b)) || !overlapDates(p, q)) continue;
    if (a.brandCode && b.brandCode && a.brandCode !== b.brandCode) continue;
    const qSkus = skusOf(q, true);
    // Mã của bên này phải lọt phạm vi nhãn của bên kia (nhãn không rõ → giữ, coi như có thể chồng).
    const inBrand = (sku: string, brand?: string) => !brand || !brandOf(sku) || brandOf(sku) === brand;
    let skus: string[] | null;
    if (pSkus && qSkus) skus = pSkus.filter((s) => qSkus.includes(s));
    else if (pSkus) skus = pSkus.filter((s) => inBrand(s, b.brandCode));
    else if (qSkus) skus = qSkus.filter((s) => inBrand(s, a.brandCode));
    else skus = null;
    if (skus && !skus.length) continue;
    const pp = p.priority ?? 0, qp = q.priority ?? 0;
    const result: ChongKetQua = !mine ? 'bi-chan' : pp > qp ? 'thang' : pp < qp ? 'thua' : 'ngang';
    out.push({ other: { id: q.id, code: q.code, name: q.name, kind: q.kind, priority: qp }, skus, result });
  }
  const order: Record<ChongKetQua, number> = { thua: 0, 'bi-chan': 1, ngang: 2, thang: 3 };
  return out.sort((x, y) => order[x.result] - order[y.result] || x.other.code.localeCompare(y.other.code));
}

/** Ưu tiên nhỏ nhất để p thắng mọi chương trình áp riêng đang chồng (thua / ngang); không cần đổi → undefined. */
export function uuTienDeThang(p: Pick<Policy, 'priority'>, chong: ApRiengChong[]): number | undefined {
  const need = chong.filter((c) => c.result === 'thua' || c.result === 'ngang');
  return need.length ? Math.max(...need.map((c) => c.other.priority ?? 0)) + 1 : undefined;
}
