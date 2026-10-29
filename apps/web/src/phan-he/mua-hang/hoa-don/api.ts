/** Gọi API Hoá đơn NCC (MH22) — hợp đồng: docs/api/14-mua-hang.md § Hoá đơn NCC. */
import type { InvoiceLine, ItemAlias, ParsedInvoice, ReconcileResult, SupplierInvoice } from '@ketoan/contracts/mua-hang';
import { api } from '@/lib/api';
import { P } from '../du-lieu';

export type InvoiceState = 'chua_nhan_dien' | 'chua_co_phieu' | 'lech' | 'khop' | 'da_huy';
export const STATE_LABEL: Record<InvoiceState, [string, string, string]> = {
  chua_nhan_dien: ['Chưa nhận diện mã', 'badge-bad', 'Còn dòng hàng chưa biết là mã nào bên mình — mở hoá đơn, chọn mã (phần mềm nhớ cho lần sau)'],
  chua_co_phieu: ['Chưa có phiếu nhập', 'badge-info', 'Chưa có phiếu nhập nào ghi số hoá đơn này — bấm "Lập phiếu nhập từ hoá đơn"'],
  lech: ['Lệch phiếu nhập', 'badge-warn', 'Phiếu nhập cùng số hoá đơn lệch số lượng / giá / thuế / tổng tiền'],
  khop: ['Khớp phiếu nhập', 'badge-ok', 'Từng dòng khớp phiếu nhập'],
  da_huy: ['Đã huỷ', 'badge-gray', 'Hoá đơn đã huỷ'],
};
export const SOURCE_LABEL: Record<SupplierInvoice['source'], string> = { manual: 'Gõ tay', excel: 'Excel', ai: 'Quét AI', api: 'API' };
export const MATCH_LABEL: Record<InvoiceLine['matchSource'], string> = { alias: 'Đã học', declared: 'Khai mặt hàng NCC', own_sku: 'NCC ghi mã mình', manual: 'Chọn tay', none: 'Chưa nhận diện' };

export interface InvoiceRow extends Omit<SupplierInvoice, 'lines'> {
  lineCount: number; unmatched: number; receipts: { id: string; docNo: string; status: string; docDate: string }[]; state: InvoiceState; issues: string[]; attachments: number;
}
export interface InvoiceDetail { invoice: SupplierInvoice; receipts: { id: string; docNo: string; status: string; docDate: string; total: number }[]; reconcile: ReconcileResult | null }
export type Prepared = Omit<SupplierInvoice, 'source' | 'status' | 'note'> & { duplicateOf?: string; warnings: string[] };
export type InvoiceInput = Omit<SupplierInvoice, 'id' | 'status' | 'createdBy' | 'updatedBy' | 'createdAt' | 'updatedAt' | 'cancelledBy' | 'cancelledAt' | 'cancelReason'>;

/** Bỏ trường chỉ để hiện (gợi ý) trước khi gửi máy chủ. */
const clean = (x: InvoiceInput): InvoiceInput => ({ ...x, lines: x.lines.map(({ candidates: _c, ...l }) => l) });

export const invoiceApi = {
  list: (q: { partnerCode?: string; from?: string; to?: string; status?: string }) => api.get<InvoiceRow[]>(`${P}/invoices`, q),
  get: (id: string) => api.get<InvoiceDetail>(`${P}/invoices/${id}`),
  save: (x: InvoiceInput, id?: string) => (id ? api.put<SupplierInvoice>(`${P}/invoices/${id}`, clean(x)) : api.post<SupplierInvoice>(`${P}/invoices`, clean(x))),
  cancel: (id: string, reason: string) => api.post(`${P}/invoices/${id}/cancel`, { reason }),
  prepare: (partnerCode: string, invoices: ParsedInvoice[]) => api.post<Prepared[]>(`${P}/invoices/prepare`, { partnerCode, invoices }),
  import: (invoices: InvoiceInput[]) => api.post<{ saved: { id: string; label: string }[]; skipped: { label: string; reason: string }[] }>(`${P}/invoices/import`, { invoices: invoices.map(clean) }),
  scanConfig: () => api.get<{ configured: boolean }>(`${P}/invoices/scan/config`),
  scan: (b: { partnerCode: string; fileName: string; mime: string; dataBase64: string }) => api.post<Prepared[]>(`${P}/invoices/scan`, b),
  aliases: (partnerCode?: string) => api.get<(ItemAlias & { productName: string })[]>(`${P}/invoice-aliases`, { partnerCode }),
  deleteAlias: (id: string) => api.delete(`${P}/invoice-aliases/${id}`),
};

/**
 * Dòng + thông tin hoá đơn cho phiếu nhập lập từ hoá đơn NCC (MH11 ?tu-hoa-don, ô "Lấy từ hoá đơn NCC" trên phiếu):
 * giá CHƯA thuế, thuế suất theo hoá đơn, hàng tặng → dòng quà; chỉ lấy dòng đã nhận diện mã (unmatched = số dòng bỏ qua).
 */
export async function receiptPartsFromInvoice(id: string) {
  const { linesFromInvoice } = await import('@ketoan/contracts/mua-hang');
  const { purchaseApi } = await import('../du-lieu');
  const { invoice: inv } = await invoiceApi.get(id);
  const ls = linesFromInvoice(inv);
  const prods = ls.length ? await purchaseApi.lookupProducts(ls.map((l) => l.sku)) : [];
  const nameOf = new Map(prods.map((p) => [p.sku, p.name]));
  return {
    inv,
    unmatched: inv.lines.filter((l) => !l.sku).length,
    invoice: { no: inv.no, serial: inv.series || undefined, date: inv.date, total: inv.total },
    lines: ls.map((l, i) => ({ lineKey: `hd-${Date.now()}-${i + 1}`, sku: l.sku, name: nameOf.get(l.sku) ?? l.name, unit: l.unit, qty: l.qty, price: l.price, ...(l.discountAmt ? { discountAmt: l.discountAmt } : {}), taxCode: l.taxCode, lineType: (l.gift ? 'gift_seller' : 'buy') as 'buy' | 'gift_seller', nccSku: l.nccSku, nccName: l.nccName })),
  };
}
