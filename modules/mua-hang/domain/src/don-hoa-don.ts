// [2026-11-20 khanhtd] MUA-HANG — đơn đặt theo dõi hoá đơn: tính từ các phiếu nhập của đơn (đóng góp)
/**
 * HOÁ ĐƠN CỦA ĐƠN ĐẶT — đơn đặt không mang hoá đơn; hoá đơn NCC ghi trên PHIẾU NHẬP (số / ký hiệu / ngày, hoặc lập từ MH22).
 * Tình trạng hoá đơn của một đơn = gom các phiếu nhập theo đơn đó (receiptsOfOrder, bỏ phiếu đã huỷ):
 *   chua_nhap  chưa có phiếu nhập nào theo đơn (chưa nhận hàng thì chưa có hoá đơn để theo dõi);
 *   chua_co    có phiếu nhập nhưng chưa phiếu nào ghi hoá đơn;
 *   mot_phan   một phần phiếu nhập đã có hoá đơn;
 *   du         mọi phiếu nhập của đơn đã có hoá đơn (cho phần hàng ĐÃ NHẬN — đơn giao thiếu thì xem cột "Đơn: đã nhận").
 * Chỉ đọc, không đổi cách tính phiếu.
 */
import type { PDoc } from './engine.js';
import { receiptsOfOrder } from './dat-hang.js';

export type OrderInvoiceState = 'chua_nhap' | 'chua_co' | 'mot_phan' | 'du';
export const ORDER_INVOICE_LABEL: Record<OrderInvoiceState, string> = { chua_nhap: 'Chưa nhập hàng', chua_co: 'Chưa có HĐ', mot_phan: 'Có HĐ một phần', du: 'Đủ HĐ' };

export interface OrderInvoice {
  state: OrderInvoiceState;
  /** Số phiếu nhập theo đơn (không tính phiếu huỷ) và số phiếu đã ghi hoá đơn. */
  receipts: number;
  invoiced: number;
  /** Số hoá đơn đã ghi (ký hiệu-số), không trùng. */
  invoices: string[];
  /** Phiếu nhập chưa có hoá đơn (số phiếu). */
  missing: string[];
  /** "Có HĐ một phần (1/3 phiếu)". */
  text: string;
}

const invNo = (d: Pick<PDoc, 'invoice'>) => (d.invoice?.no ? (d.invoice.serial ? `${d.invoice.serial}-${d.invoice.no}` : d.invoice.no) : '');

/** Không phải đơn đặt → null. */
export function orderInvoice(order: Pick<PDoc, 'id' | 'kind'>, docs: PDoc[]): OrderInvoice | null {
  if (order.kind !== 'order') return null;
  const recs = receiptsOfOrder(order, docs);
  const withInv = recs.filter((d) => invNo(d));
  const state: OrderInvoiceState = !recs.length ? 'chua_nhap' : !withInv.length ? 'chua_co' : withInv.length < recs.length ? 'mot_phan' : 'du';
  return {
    state, receipts: recs.length, invoiced: withInv.length,
    invoices: [...new Set(withInv.map(invNo))],
    missing: recs.filter((d) => !invNo(d)).map((d) => d.docNo || d.id),
    text: recs.length ? `${ORDER_INVOICE_LABEL[state]} (${withInv.length}/${recs.length} phiếu nhập)` : ORDER_INVOICE_LABEL[state],
  };
}
