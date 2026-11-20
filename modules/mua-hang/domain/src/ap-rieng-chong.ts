// [2026-11-20 khanhtd] TRA-CUU — dò chương trình áp riêng chồng nhau theo mã, để form chính sách cảnh báo trước khi ghi (đóng góp)
// [2026-11-20 khanhtd] TRA-CUU — áp riêng + ưu tiên theo từng dòng bảng CK theo mã: so ưu tiên THEO MÃ (dòng có ưu tiên riêng) (đóng góp)
/**
 * CHỒNG ÁP RIÊNG — chính sách đang khai (p) đụng chương trình ÁP RIÊNG nào khác, ở những mã nào, và ai thắng theo ưu tiên.
 * Chỉ xét PHẠM VI (NCC, nhãn, mã, chi nhánh, hiệu lực) — điều kiện SL / tổng đơn và mức lợi tính ở từng phiếu (exclusiveBySku);
 * vì vậy kết quả là "có thể chồng": đủ để người khai đặt ưu tiên đúng, chi tiết từng phiếu xem ở màn Tra cứu TC01.
 *   - p áp riêng ở mã đó: so ưu tiên với chương trình áp riêng kia → thang / thua / ngang (ngang = phiếu nào lợi hơn thì thắng);
 *   - p không áp riêng ở mã đó: p bị chặn ở mã đó (bi-chan).
 * Ưu tiên tính theo mã: dòng bảng CK theo mã có ưu tiên riêng thì dùng nó, không thì ưu tiên của chính sách (như exclusiveBySku).
 * Không đổi cách tính phiếu.
 */
import { STACK_KINDS, giftItemsOf, hasExclusive, isExclusive, scopeBranches, type ItemDiscount, type Policy } from './engine.js';

export type ChongKetQua = 'thang' | 'thua' | 'ngang' | 'bi-chan';
export interface ApRiengChong {
  other: Pick<Policy, 'id' | 'code' | 'name' | 'kind' | 'priority'>;
  /** Mã chồng nhau; `null` = chồng trên cả phạm vi (cả hai không ghi mã cụ thể). */
  skus: string[] | null;
  result: ChongKetQua;
  /** Ưu tiên đem so ở các mã này: của p và của chương trình kia. */
  myPriority: number;
  otherPriority: number;
  /** Ưu tiên của p ở các mã này lấy từ DÒNG bảng (sửa ở dòng, không phải ô Ưu tiên của chính sách). */
  myRowPriority: boolean;
}

/** Chính sách có áp riêng không (cả chính sách, hoặc một dòng của mua X tặng Y / bảng CK theo mã). */
export const coApRieng = hasExclusive;

const itemsOf = (p: Pick<Policy, 'rule'>) => (p.rule.items as ItemDiscount[] | undefined) ?? [];

/** Mã mà chính sách nhắm tới; `null` = mọi mã trong phạm vi NCC / nhãn. `onlyExclusive`: chỉ dòng áp riêng (mua X tặng Y, bảng CK theo mã). */
export function skusOf(p: Pick<Policy, 'kind' | 'rule' | 'scope'>, onlyExclusive = false): string[] | null {
  if (p.kind === 'item_discount') return [...new Set(itemsOf(p).filter((i) => !onlyExclusive || isExclusive(p) || i.apply === 'exclusive').map((i) => i.sku).filter(Boolean))];
  if (p.kind === 'promo_gift') {
    const rows = giftItemsOf(p).filter((i) => !onlyExclusive || isExclusive(p) || i.apply === 'exclusive');
    return rows.some((i) => !i.sku) ? null : [...new Set(rows.map((i) => i.sku))];
  }
  return p.scope.sku ? [p.scope.sku] : null;
}

/**
 * Ở mã `sku` (null = cả phạm vi): chính sách có áp riêng không, ưu tiên bao nhiêu, ưu tiên đó lấy từ dòng hay không.
 * Bảng CK theo mã nhiều dòng cùng mã (bậc SL): lấy dòng áp riêng có ưu tiên cao nhất.
 */
function atSku(p: Policy, sku: string | null): { exclusive: boolean; priority: number; fromRow: boolean } {
  const base = p.priority ?? 0;
  if (p.kind === 'item_discount' && sku) {
    const rows = itemsOf(p).filter((i) => i.sku === sku && (isExclusive(p) || i.apply === 'exclusive'));
    if (!rows.length) return { exclusive: false, priority: base, fromRow: false };
    const own = rows.filter((i) => i.priority != null).map((i) => i.priority!);
    return own.length ? { exclusive: true, priority: Math.max(...own), fromRow: true } : { exclusive: true, priority: base, fromRow: false };
  }
  if (p.kind === 'promo_gift' && sku) return { exclusive: isExclusive(p) || giftItemsOf(p).some((i) => (!i.sku || i.sku === sku) && i.apply === 'exclusive'), priority: base, fromRow: false };
  return { exclusive: isExclusive(p), priority: base, fromRow: false };
}

const overlapDates = (a: Pick<Policy, 'validFrom' | 'validTo'>, b: Pick<Policy, 'validFrom' | 'validTo'>) =>
  (a.validFrom ?? '') <= (b.validTo ?? '9999-12-31') && (b.validFrom ?? '') <= (a.validTo ?? '9999-12-31');
const overlapList = (a: string[], b: string[]) => !a.length || !b.length || a.some((x) => b.includes(x));

/**
 * brandOf: nhãn của mã (danh mục mặt hàng); không biết thì coi như có thể chồng. Trả các chương trình áp riêng khác chồng với p —
 * một mục cho mỗi (chương trình kia × kết quả × ưu tiên), cái thua / chặn / ngang trước.
 */
export function apRiengChong(p: Policy, all: Policy[], brandOf: (sku: string) => string | undefined = () => undefined): ApRiengChong[] {
  if (!STACK_KINDS.includes(p.kind)) return [];
  const pSkus = skusOf(p, false);
  const out: ApRiengChong[] = [];
  for (const q of all) {
    if (q.id === p.id || q.code === p.code || !q.isActive || !STACK_KINDS.includes(q.kind) || !hasExclusive(q)) continue;
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
    // Gom các mã cùng kết quả + cùng cặp ưu tiên thành một mục.
    const groups = new Map<string, ApRiengChong>();
    for (const sku of skus ?? [null]) {
      const m = atSku(p, sku), o = atSku(q, sku);
      if (!o.exclusive) continue;
      const result: ChongKetQua = !m.exclusive ? 'bi-chan' : m.priority > o.priority ? 'thang' : m.priority < o.priority ? 'thua' : 'ngang';
      const k = `${result}|${m.priority}|${o.priority}|${m.fromRow}`;
      const g = groups.get(k) ?? { other: { id: q.id, code: q.code, name: q.name, kind: q.kind, priority: q.priority }, skus: sku === null ? null : [], result, myPriority: m.priority, otherPriority: o.priority, myRowPriority: m.fromRow };
      if (sku !== null) g.skus!.push(sku);
      groups.set(k, g);
    }
    out.push(...groups.values());
  }
  const order: Record<ChongKetQua, number> = { thua: 0, 'bi-chan': 1, ngang: 2, thang: 3 };
  return out.sort((x, y) => order[x.result] - order[y.result] || x.other.code.localeCompare(y.other.code));
}

/**
 * Ưu tiên chính sách nhỏ nhất để p thắng mọi chương trình áp riêng đang chồng (thua / ngang) ở các mã dùng ưu tiên của chính sách;
 * không cần đổi → undefined. Mã có ưu tiên riêng ở dòng thì ô này không đổi được — sửa ở dòng.
 */
export function uuTienDeThang(_p: Pick<Policy, 'priority'>, chong: ApRiengChong[]): number | undefined {
  const need = chong.filter((c) => (c.result === 'thua' || c.result === 'ngang') && !c.myRowPriority);
  return need.length ? Math.max(...need.map((c) => c.otherPriority)) + 1 : undefined;
}
