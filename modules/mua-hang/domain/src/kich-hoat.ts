// [2026-11-21 Nguyễn Văn Thủy] Điều kiện kích hoạt của chính sách mua: phải đạt mới áp chương trình (docs/nghiep-vu/29) (đóng góp)
/**
 * ĐIỀU KIỆN KÍCH HOẠT — tuỳ chọn trên mỗi chính sách (rule.activation). Đạt hết mới áp chương trình:
 *   minPurchase       doanh số mua trước thuế trong kỳ (tháng / quý / năm chứa ngày phiếu, hoặc thời hạn hợp đồng) ≥ amount
 *   minDocValue       giá trị phiếu trước thuế, trước chiết khấu ≥ số này
 *   noOverdue         không có nợ quá hạn ở ngày phiếu
 *   withinCreditLimit dư nợ sau phiếu không vượt hạn mức công nợ
 * Số liệu (facts) do máy chủ gom theo phạm vi chính sách (hợp đồng xuyên suốt: chính sách của hợp đồng X → phiếu thuộc X;
 * chính sách ngoài hợp đồng → phiếu không theo hợp đồng). Hàm ở đây thuần: chỉ so số liệu với điều kiện.
 */
import type { Policy, PolicyKind } from './engine.js';

export type ActivationPeriod = 'month' | 'quarter' | 'year' | 'contract';
export interface Activation {
  minPurchase?: { amount: number; period: ActivationPeriod; includeCurrent?: boolean };
  minDocValue?: number;
  noOverdue?: boolean;
  withinCreditLimit?: boolean;
}
/** Số liệu để xét điều kiện của một chính sách trên một phiếu. */
export interface ActivationFacts {
  /** Doanh số mua trước thuế trong kỳ của điều kiện (chưa gồm phiếu đang lập). */
  purchased?: number;
  /** Giá trị phiếu đang lập trước thuế, trước chiết khấu. */
  docValue: number;
  /** Tổng nợ quá hạn ở ngày phiếu (theo phạm vi chính sách). */
  overdue?: number;
  /** Số vượt hạn mức sau phiếu (0 = trong hạn mức; undefined = không có hạn mức). */
  creditExceeded?: number;
  /** Kỳ đang xét (để ghi lý do), vd "tháng 10/2026". */
  periodText?: string;
}
export interface ActivationResult { ok: boolean; reasons: string[]; met: string[] }

/** Loại chính sách xét điều kiện kích hoạt khi lập đơn / phiếu (thưởng cuối kỳ có ngưỡng riêng). */
export const ACTIVATION_KINDS: PolicyKind[] = ['trade_discount', 'item_discount', 'qty_tier', 'payment_discount', 'promo_gift'];

const n = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : Number(v) || 0);
const vnd = (v: number) => Math.round(v).toLocaleString('vi-VN');
export const PERIOD_TEXT: Record<ActivationPeriod, string> = { month: 'tháng', quarter: 'quý', year: 'năm', contract: 'thời hạn hợp đồng' };

/** Điều kiện của chính sách (bỏ ô trống / 0). undefined = không có điều kiện. */
export function activationOf(p: Pick<Policy, 'rule' | 'kind'>): Activation | undefined {
  if (!ACTIVATION_KINDS.includes(p.kind)) return undefined;
  const a = p.rule.activation as Activation | undefined;
  if (!a || typeof a !== 'object') return undefined;
  const out: Activation = {};
  if (a.minPurchase && n(a.minPurchase.amount) > 0) out.minPurchase = { amount: n(a.minPurchase.amount), period: a.minPurchase.period ?? 'month', includeCurrent: a.minPurchase.includeCurrent !== false };
  if (n(a.minDocValue) > 0) out.minDocValue = n(a.minDocValue);
  if (a.noOverdue) out.noOverdue = true;
  if (a.withinCreditLimit) out.withinCreditLimit = true;
  return Object.keys(out).length ? out : undefined;
}

/** Câu mô tả điều kiện, vd "Điều kiện: doanh số tháng ≥ 200.000.000 (tính cả phiếu) · không nợ quá hạn". */
export function activationText(a?: Activation): string {
  if (!a) return '';
  const parts = [
    a.minPurchase && `doanh số mua ${PERIOD_TEXT[a.minPurchase.period]} ≥ ${vnd(a.minPurchase.amount)}${a.minPurchase.includeCurrent === false ? ' (trước phiếu này)' : ' (tính cả phiếu)'}`,
    a.minDocValue && `giá trị phiếu ≥ ${vnd(a.minDocValue)}`,
    a.noOverdue && 'không có nợ quá hạn',
    a.withinCreditLimit && 'không vượt hạn mức công nợ',
  ].filter(Boolean);
  return parts.length ? `Điều kiện: ${parts.join(' · ')}` : '';
}

/** Xét điều kiện: đạt hết mới ok; lý do ghi số đang có / cần. */
export function activationResult(a: Activation | undefined, f: ActivationFacts): ActivationResult {
  const reasons: string[] = [], met: string[] = [];
  if (!a) return { ok: true, reasons, met };
  if (a.minPurchase) {
    const have = (f.purchased ?? 0) + (a.minPurchase.includeCurrent === false ? 0 : f.docValue);
    const ky = f.periodText ?? PERIOD_TEXT[a.minPurchase.period];
    (have >= a.minPurchase.amount ? met : reasons).push(`doanh số mua ${ky} ${vnd(have)} / cần ${vnd(a.minPurchase.amount)}${have < a.minPurchase.amount ? ` (thiếu ${vnd(a.minPurchase.amount - have)})` : ''}`);
  }
  if (a.minDocValue) (f.docValue >= a.minDocValue ? met : reasons).push(`giá trị phiếu ${vnd(f.docValue)} / cần ${vnd(a.minDocValue)}`);
  if (a.noOverdue) ((f.overdue ?? 0) > 0 ? reasons : met).push((f.overdue ?? 0) > 0 ? `đang có nợ quá hạn ${vnd(f.overdue!)}` : 'không có nợ quá hạn');
  if (a.withinCreditLimit) ((f.creditExceeded ?? 0) > 0 ? reasons : met).push((f.creditExceeded ?? 0) > 0 ? `vượt hạn mức công nợ ${vnd(f.creditExceeded!)}` : 'trong hạn mức công nợ');
  return { ok: !reasons.length, reasons, met };
}

/** Khoảng ngày của kỳ chứa ngày phiếu: [từ, đến] (YYYY-MM-DD). Kỳ hợp đồng do máy chủ truyền vào. */
export function periodRange(period: Exclude<ActivationPeriod, 'contract'>, date: string): [string, string, string] {
  const y = date.slice(0, 4), m = Number(date.slice(5, 7));
  if (period === 'year') return [`${y}-01-01`, `${y}-12-31`, `năm ${y}`];
  if (period === 'quarter') {
    const q = Math.floor((m - 1) / 3), sm = q * 3 + 1, em = sm + 2;
    const last = new Date(Date.UTC(Number(y), em, 0)).getUTCDate();
    return [`${y}-${String(sm).padStart(2, '0')}-01`, `${y}-${String(em).padStart(2, '0')}-${last}`, `quý ${q + 1}/${y}`];
  }
  const last = new Date(Date.UTC(Number(y), m, 0)).getUTCDate();
  return [`${y}-${String(m).padStart(2, '0')}-01`, `${y}-${String(m).padStart(2, '0')}-${last}`, `tháng ${String(m).padStart(2, '0')}/${y}`];
}
