// @bizcity-layer D modules/ban-hang
/**
 * Báo cáo bán hàng.
 *
 * Quy ước số liệu:
 *  - Doanh số bán, hàng trả lại: tiền hàng TRƯỚC thuế, đã trừ chiết khấu (đúng như trên hoá đơn).
 *  - Doanh thu thuần = doanh số bán − hàng trả lại.
 *  - Thuế, tổng thanh toán: số thuần (đã trừ phần của hàng trả lại).
 *  - Chỉ tính chứng từ đang hiệu lực (đã ghi sổ, chưa huỷ), theo ngày chứng từ.
 */
import { fromCents, toCents } from '@ketoan/contracts';
import { db, toNumber } from '../../db/client.js';
import { Errors } from '../../core/errors.js';
import type { AuthContext } from '../../core/auth.js';
import type { PageQuery } from '../../core/http.js';
import { reportRepository } from '../reports/report.repository.js';
import { salesReportRepository, type SalesFilter, type SalesGroupBy } from './sales-report.repository.js';

export interface SalesQuery {
  from: string;
  to: string;
  branchCodes?: string[];
  kind?: 'all' | 'sale' | 'return';
  scope?: 'all' | 'invoiced' | 'internal';
  search?: string;
}

export async function toFilter(auth: AuthContext, q: SalesQuery): Promise<SalesFilter> {
  let branchIds: string[] | null = null;
  if (q.branchCodes?.length) {
    branchIds = (await reportRepository.branchIds(db, auth.tenantId, q.branchCodes)).map((r) => r.id);
    if (!branchIds.length) throw Errors.validation('Chi nhánh không tồn tại');
  }
  return { tenantId: auth.tenantId, from: q.from, to: q.to, branchIds, kind: q.kind ?? 'all', scope: q.scope ?? 'all', search: q.search?.trim() || undefined };
}

export const salesReportService = {
  /** Báo cáo bán hàng chi tiết: mỗi dòng hàng một dòng. */
  async detail(auth: AuthContext, q: SalesQuery & PageQuery) {
    const f = await toFilter(auth, q);
    const [rows, t] = await Promise.all([
      salesReportRepository.detail(db, f, { limit: q.pageSize, offset: (q.page - 1) * q.pageSize }),
      salesReportRepository.detailTotals(db, f),
    ]);
    const amount = toNumber(t.amount);
    const tax = toNumber(t.tax);
    return {
      rows: rows.map((r) => ({
        id: r.id,
        docDate: r.doc_date,
        sourceDocumentId: r.event_id,
        docNo: r.doc_no,
        invoiceNo: r.invoice_no,
        invoiceSerial: r.invoice_serial ?? '',
        invoiceForm: r.invoice_form ?? '',
        isReturn: r.sign === -1,
        hasInvoice: r.has_invoice,
        branchCode: r.branch_code,
        partnerCode: r.partner_code,
        partnerName: r.partner_name,
        sku: r.sku,
        name: r.name,
        unit: r.unit,
        qty: toNumber(r.qty),
        unitPrice: toNumber(r.unit_price),
        amount: toNumber(r.amount),
        discount: toNumber(r.discount),
        taxCode: r.tax_code,
        taxRate: r.tax_rate === null ? null : toNumber(r.tax_rate),
        tax: toNumber(r.tax),
        total: fromCents(toCents(toNumber(r.amount)) + toCents(toNumber(r.tax))),
        isGift: r.is_gift,
      })),
      totals: { lines: Number(t.lines), documents: Number(t.docs), qty: toNumber(t.qty), amount, discount: toNumber(t.discount), tax, total: fromCents(toCents(amount) + toCents(tax)) },
      total: Number(t.lines),
    };
  },

  /** Tổng hợp bán hàng theo phiếu / ngày / tháng / chi nhánh / mặt hàng / khách hàng / loại thuế. */
  async summary(auth: AuthContext, q: SalesQuery & { groupBy: SalesGroupBy }) {
    const f = await toFilter(auth, q);
    const raw = await salesReportRepository.summary(db, f, q.groupBy);
    const sum = { saleDocs: 0, returnDocs: 0, saleQty: 0, saleAmount: 0, returnQty: 0, returnAmount: 0, discount: 0, netAmount: 0, tax: 0, total: 0 };
    const rows = raw.map((r) => {
      const saleAmount = toCents(toNumber(r.sale_amount));
      const returnAmount = toCents(toNumber(r.return_amount));
      const tax = toCents(toNumber(r.tax));
      const net = saleAmount - returnAmount;
      const row = {
        key: r.key,
        label: r.label,
        extra: r.extra,
        saleDocs: Number(r.sale_docs),
        returnDocs: Number(r.return_docs),
        saleQty: toNumber(r.sale_qty),
        saleAmount: fromCents(saleAmount),
        returnQty: toNumber(r.return_qty),
        returnAmount: fromCents(returnAmount),
        discount: toNumber(r.discount),
        netAmount: fromCents(net),
        tax: fromCents(tax),
        total: fromCents(net + tax),
      };
      sum.saleQty += row.saleQty;
      sum.returnQty += row.returnQty;
      sum.saleAmount += saleAmount;
      sum.returnAmount += returnAmount;
      sum.discount += toCents(row.discount);
      sum.tax += tax;
      return row;
    });
    // Theo phiếu: bổ sung thông tin đầu phiếu và tiền đã thu / ghi nợ.
    let paidSum = 0;
    let creditSum = 0;
    let remainingSum = 0;
    if (q.groupBy === 'document') {
      const heads = new Map((await salesReportRepository.documentHeads(db, auth.tenantId, rows.map((r) => r.extra))).map((h) => [h.id, h]));
      for (const r of rows as (typeof rows[number] & Record<string, unknown>)[]) {
        const h = heads.get(r.extra);
        if (!h) continue;
        const ret = h.doc_type === 'sale_return';
        const paid = toCents(toNumber(h.paid)) * (ret ? -1 : 1);
        const credit = toCents(toNumber(h.on_credit)) * (ret ? -1 : 1);
        // Còn nợ = tổng thanh toán − đã thu − phần đối trừ đổi trả (ghi nợ CONGNO vẫn là nợ).
        const remaining = toCents(Number((r as { total?: number }).total ?? 0)) - paid - toCents(toNumber(h.offset)) * (ret ? -1 : 1);
        paidSum += paid;
        creditSum += credit;
        remainingSum += remaining;
        Object.assign(r, {
          docId: h.id, docDate: h.doc_date, docNo: h.doc_no, isReturn: ret, invoiceNo: h.invoice_no ?? '', invoiceSerial: h.invoice_serial ?? '',
          branchCode: h.branch_code, partnerCode: h.partner_code ?? '', partnerName: h.partner_name ?? '', methods: h.methods ?? '',
          paid: fromCents(paid), onCredit: fromCents(credit), remaining: fromCents(remaining),
        });
      }
    }
    // Số chứng từ không cộng dồn được qua các nhóm mặt hàng / loại thuế (một chứng từ nằm ở nhiều nhóm) → đếm riêng.
    const t = await salesReportRepository.detailTotals(db, { ...f, kind: 'sale' });
    const tr = await salesReportRepository.detailTotals(db, { ...f, kind: 'return' });
    const net = sum.saleAmount - sum.returnAmount;
    return {
      groupBy: q.groupBy,
      rows,
      totals: {
        saleDocs: f.kind === 'return' ? 0 : Number(t.docs),
        returnDocs: f.kind === 'sale' ? 0 : Number(tr.docs),
        saleQty: sum.saleQty,
        returnQty: sum.returnQty,
        saleAmount: fromCents(sum.saleAmount),
        returnAmount: fromCents(sum.returnAmount),
        discount: fromCents(sum.discount),
        netAmount: fromCents(net),
        tax: fromCents(sum.tax),
        total: fromCents(net + sum.tax),
        paid: fromCents(paidSum),
        onCredit: fromCents(creditSum),
        remaining: fromCents(remainingSum),
      },
    };
  },

  /** Báo cáo thu tiền bán hàng: từng phiếu thu / trả tiền khách và phiếu bán / hoàn được thanh toán. */
  async receipts(auth: AuthContext, q: { from: string; to: string; branchCodes?: string[] }) {
    const f = await toFilter(auth, q);
    const raw = await salesReportRepository.receipts(db, { tenantId: auth.tenantId, from: q.from, to: q.to, branchIds: f.branchIds });
    const rows = raw.map((r) => {
      const out = r.direction === 'out';
      const invSign = r.inv_type === 'sale_return' ? -1 : 1;
      return {
        id: r.id, payId: r.pay_id, payNo: r.pay_no, payDate: r.pay_date, invNo: r.inv_no, invDate: r.inv_date,
        invTotal: invSign * toNumber(r.inv_total ?? 0), paid: (out ? -1 : 1) * toNumber(r.amount ?? 0),
        partnerCode: r.partner_code ?? '', partnerName: r.partner_name ?? '', branchName: r.branch_name ?? '', bank: r.bank ?? '',
        method: r.method_name ?? r.method_code ?? '', invBranchName: r.inv_branch_name ?? '', reasonCode: r.reason_code ?? '', note: r.note ?? '',
        kind: out ? 'Phiếu trả tiền khách hàng' : 'Phiếu thu tiền khách hàng',
      };
    });
    return { rows, totals: { paid: fromCents(rows.reduce((s, r) => s + toCents(r.paid), 0)) } };
  },

  /** Thu tiền theo hình thức thanh toán: thu của khách − trả lại khách, theo ngày hoặc chi nhánh. */
  async payments(auth: AuthContext, q: { from: string; to: string; branchCodes?: string[]; groupBy: 'day' | 'branch' }) {
    const f = await toFilter(auth, q);
    const [raw, methods] = await Promise.all([
      salesReportRepository.payments(db, { tenantId: auth.tenantId, from: q.from, to: q.to, branchIds: f.branchIds, groupBy: q.groupBy }),
      salesReportRepository.paymentMethods(db, auth.tenantId),
    ]);
    // Mỗi hình thức có tiền một cột, xếp như danh mục: tiền mặt trước, rồi theo thứ tự / mã; hình thức ghi nợ, đối trừ
    // (không phải tiền thực nhận) xếp cuối và không cộng vào Tổng thu / Trả lại / Thực thu.
    const info = (code: string) => {
      if (code === 'DOITRU') return { name: 'Đối trừ hàng bán trả lại', isReceivable: true, sort: Number.MAX_SAFE_INTEGER };
      const m = methods.find((x) => x.code === code);
      return { name: m?.name ?? code, isReceivable: Boolean(m?.is_receivable), sort: code === 'TM' ? -1 : m?.sort_order ?? Number.MAX_SAFE_INTEGER - 1 };
    };
    const used = [...new Set(raw.map((r) => r.method_code))].sort((a, b) => {
      const x = info(a), y = info(b);
      return Number(x.isReceivable) - Number(y.isReceivable) || x.sort - y.sort || a.localeCompare(b);
    });
    const byKey = new Map<string, { key: string; label: string; cells: Record<string, number>; received: number; refunded: number }>();
    const colTotals: Record<string, number> = Object.fromEntries(used.map((m) => [m, 0]));
    let received = 0;
    let refunded = 0;
    for (const r of raw) {
      let row = byKey.get(r.key);
      if (!row) byKey.set(r.key, (row = { key: r.key, label: r.label, cells: {}, received: 0, refunded: 0 }));
      const rec = toCents(toNumber(r.received));
      const ref = toCents(toNumber(r.refunded));
      row.cells[r.method_code] = (row.cells[r.method_code] ?? 0) + rec - ref;
      colTotals[r.method_code] = (colTotals[r.method_code] ?? 0) + rec - ref;
      if (info(r.method_code).isReceivable) continue;
      row.received += rec;
      row.refunded += ref;
      received += rec;
      refunded += ref;
    }
    return {
      groupBy: q.groupBy,
      methods: used.map((code) => ({ code, name: info(code).name, isReceivable: info(code).isReceivable })),
      rows: [...byKey.values()].map((r) => ({
        key: r.key,
        label: r.label,
        cells: Object.fromEntries(Object.entries(r.cells).map(([k, v]) => [k, fromCents(v)])),
        received: fromCents(r.received),
        refunded: fromCents(r.refunded),
        net: fromCents(r.received - r.refunded),
      })),
      totals: {
        cells: Object.fromEntries(Object.entries(colTotals).map(([k, v]) => [k, fromCents(v)])),
        received: fromCents(received),
        refunded: fromCents(refunded),
        net: fromCents(received - refunded),
      },
    };
  },
};
