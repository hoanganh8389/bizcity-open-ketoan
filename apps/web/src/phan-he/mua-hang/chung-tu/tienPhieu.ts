/**
 * Số tiền & công nợ của MỘT phiếu mua hàng — dùng chung cho danh sách chứng từ (xem theo phiếu) và xem theo dòng hàng.
 */
import { TAX_RATE, type PDoc } from '@ketoan/contracts/mua-hang';
import type { StoredDoc } from '../du-lieu';

/** Tiền hàng TRƯỚC chiết khấu, CHƯA thuế của phiếu (dòng hàng mua; phiếu giá gồm thuế quy về chưa thuế) và chiết khấu = trước CK − tiền hàng sau CK.
 *  Chỉ phiếu có dòng hàng (đơn đặt, nhập mua, trả NCC); loại khác không có khái niệm này. */
const MONEY_LINE_KINDS: PDoc['kind'][] = ['order', 'receipt', 'return'];
export function tienPhieu(d: StoredDoc): { grossEx: number; disc: number } | null {
  if (!MONEY_LINE_KINDS.includes(d.kind) || !d.lines.length) return null;
  const grossEx = Math.round(d.lines.reduce((s, l) => {
    if ((l.lineType ?? 'buy') !== 'buy') return s;
    const g = (l.qty || 0) * (l.price || 0);
    return s + (d.priceIncludesVat ? g / (1 + (TAX_RATE[l.taxCode] ?? 0) / 100) : g);
  }, 0));
  return { grossEx: Math.max(grossEx, d.totals.beforeTax), disc: Math.max(0, grossEx - d.totals.beforeTax) };
}
/** Tình trạng công nợ của phiếu (sổ công nợ TK 331): phải trả NCC → đã trả bao nhiêu, còn bao nhiêu, quá hạn chưa;
 *  phiếu làm NCC nợ lại mình (ứng trước, trả hàng, thưởng) → đã đối trừ bao nhiêu. */
export function congNo(d: StoredDoc, asOf: string): { amount: number; paid: number; left: number; text: string; cls: string } | null {
  if (d.status !== 'approved') return null;
  const x = d.debt;
  if (!x || (x.owed <= 0 && x.advance <= 0)) return { amount: 0, paid: 0, left: 0, text: 'Không phát sinh công nợ', cls: '' };
  const owe = x.owed >= x.advance;
  const amount = owe ? x.owed : x.advance, paid = owe ? x.owedPaid : x.advanceUsed, left = Math.max(0, Math.round(amount - paid));
  if (owe) {
    if (left <= 0) return { amount, paid, left, text: 'Đã trả đủ', cls: 'badge-ok' };
    const over = d.dueDate && d.dueDate < asOf;
    return { amount, paid, left, text: `${paid > 0 ? 'Trả một phần' : 'Chưa trả'}${over ? ' · quá hạn' : ''}`, cls: over ? 'badge-bad' : paid > 0 ? 'badge-info' : 'badge-warn' };
  }
  if (left <= 0) return { amount, paid, left, text: 'Đã đối trừ hết', cls: 'badge-ok' };
  return { amount, paid, left, text: paid > 0 ? 'Đối trừ một phần' : 'Chưa đối trừ', cls: paid > 0 ? 'badge-info' : 'badge-warn' };
}

