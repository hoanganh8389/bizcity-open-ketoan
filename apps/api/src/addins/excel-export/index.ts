/**
 * Add-in "Xuất Excel": xuất báo cáo ra tệp CSV (UTF-8 có BOM, Excel mở thẳng tiếng Việt).
 *
 *   GET /api/v1/addins/excel-export/trial-balance.csv?from=&to=&branchCodes=
 *   GET /api/v1/addins/excel-export/account-ledger.csv?account=&from=&to=
 *   GET /api/v1/addins/excel-export/sales-invoices.csv?from=&to=
 *   GET /api/v1/addins/excel-export/sales-detail.csv | sales-summary.csv | sales-payments.csv
 *   GET /api/v1/addins/excel-export/partner-balances.csv?account=&from=&to=
 *
 * Minh hoạ cách add-in dùng lại dịch vụ lõi (reportService) mà không sửa lõi.
 */
import { z } from 'zod';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { defineAddIn } from '../../core/addins.js';
import { authOf, requirePermission } from '../../core/auth.js';
import type { FastifyReply } from 'fastify';
import { reportService } from '../../modules/reports/report.service.js';
import type { PostingSummaryGroup } from '../../modules/reports/extra-reports.js';
import { salesPaymentsQuerySchema, salesQuerySchema, salesSummaryQuerySchema } from '../../modules/sales/sales-report.routes.js';
import { salesReportService } from '../../modules/sales/sales-report.service.js';

const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const branchCodes = z.string().optional().transform((s) => (s ? s.split(',').map((x) => x.trim()).filter(Boolean) : undefined));

/** Một ô CSV: bọc nháy kép khi có dấu phẩy, xuống dòng, nháy. */
function cell(v: unknown): string {
  const s = v === null || v === undefined ? '' : String(v);
  return /[",\n;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}
function toCsv(header: string[], rows: unknown[][]): string {
  return '﻿' + [header, ...rows].map((r) => r.map(cell).join(',')).join('\r\n');
}

export default defineAddIn({
  manifest: {
    id: 'excel-export',
    name: 'Xuất Excel',
    version: '1.0.0',
    description: 'Xuất các báo cáo ra tệp Excel (CSV).',
    author: 'Lõi',
  },
  register(app) {
    const r = app.withTypeProvider<ZodTypeProvider>();
    const pre = requirePermission('reports:read');
    const tags = ['Add-in: Xuất Excel'];

    r.get('/trial-balance.csv', {
      preHandler: pre,
      schema: { tags, querystring: z.object({ from: date, to: date, branchCodes }) },
      handler: async (req, reply) => {
        const data = await reportService.trialBalance(authOf(req), req.query);
        const csv = toCsv(
          ['Số TK', 'Tên tài khoản', 'Dư Nợ đầu kỳ', 'Dư Có đầu kỳ', 'Phát sinh Nợ', 'Phát sinh Có', 'Dư Nợ cuối kỳ', 'Dư Có cuối kỳ'],
          data.rows.map((x) => [x.code, x.name, x.openingDebit, x.openingCredit, x.debit, x.credit, x.closingDebit, x.closingCredit]),
        );
        return reply.header('content-type', 'text/csv; charset=utf-8').header('content-disposition', `attachment; filename="can-doi-phat-sinh-${req.query.from}-${req.query.to}.csv"`).send(csv);
      },
    });

    r.get('/account-ledger.csv', {
      preHandler: pre,
      schema: {
        tags,
        querystring: z.object({
          account: z.string(), from: date, to: date, branchCodes, partnerCode: z.string().optional(),
          kind: z.enum(['detail', 'ledger', 'partner', 'cash']).default('detail'),
          groupMode: z.coerce.number().int().min(1).max(3).default(1).transform((v) => v as 1 | 2 | 3),
          counterAccount: z.string().optional(), docType: z.string().optional(),
        }),
      },
      handler: async (req, reply) => {
        const data = await reportService.accountLedger(authOf(req), req.query);
        const rows: unknown[][] = [['', '', '', 'Số dư đầu kỳ', '', '', '', '', data.opening.debit, data.opening.credit]];
        for (const x of data.rows) rows.push([x.postingDate, x.docNo, x.invoiceNo, x.description, x.counterAccounts, x.partnerCode ?? '', x.debit, x.credit, x.balanceDebit, x.balanceCredit]);
        rows.push(['', '', '', 'Cộng phát sinh', '', '', data.totals.debit, data.totals.credit, '', '']);
        rows.push(['', '', '', 'Số dư cuối kỳ', '', '', '', '', data.closing.debit, data.closing.credit]);
        const csv = toCsv(['Ngày', 'Số chứng từ', 'Số hoá đơn', 'Diễn giải', 'TK đối ứng', 'Đối tượng', 'Nợ', 'Có', 'Dư Nợ', 'Dư Có'], rows);
        return reply.header('content-type', 'text/csv; charset=utf-8').header('content-disposition', `attachment; filename="so-chi-tiet-${req.query.account}.csv"`).send(csv);
      },
    });

    const send = (reply: FastifyReply, name: string, csv: string) =>
      reply.header('content-type', 'text/csv; charset=utf-8').header('content-disposition', `attachment; filename="${name}"`).send(csv);

    r.get('/sales-detail.csv', {
      preHandler: pre,
      schema: { tags, querystring: salesQuerySchema },
      handler: async (req, reply) => {
        // Xuất toàn bộ kết quả lọc (tối đa 50.000 dòng), không theo trang đang xem.
        const data = await salesReportService.detail(authOf(req), { ...req.query, page: 1, pageSize: 50000 });
        const rows = data.rows.map((x) => [x.docDate, x.docNo, x.invoiceForm, x.invoiceSerial, x.invoiceNo, x.isReturn ? 'Trả lại' : 'Bán', x.branchCode, x.partnerCode, x.partnerName, x.sku, x.name, x.unit, x.qty, x.unitPrice, x.discount, x.amount, x.taxCode, x.taxRate, x.tax, x.total, x.isGift ? 'Hàng tặng' : '']);
        rows.push(['Tổng cộng', '', '', '', '', '', '', '', '', '', '', '', data.totals.qty, '', data.totals.discount, data.totals.amount, '', '', data.totals.tax, data.totals.total, '']);
        return send(reply, `bao-cao-ban-hang-${req.query.from}-${req.query.to}.csv`, toCsv(['Ngày', 'Số chứng từ', 'Mẫu số', 'Ký hiệu', 'Số hoá đơn', 'Loại', 'Chi nhánh', 'Mã khách', 'Tên khách', 'Mã hàng', 'Tên hàng', 'ĐVT', 'Số lượng', 'Đơn giá', 'Chiết khấu', 'Tiền hàng', 'Loại thuế', 'Thuế suất (%)', 'Tiền thuế', 'Tổng tiền', 'Ghi chú'], rows));
      },
    });

    r.get('/sales-summary.csv', {
      preHandler: pre,
      schema: { tags, querystring: salesSummaryQuerySchema },
      handler: async (req, reply) => {
        const data = await salesReportService.summary(authOf(req), req.query);
        const t = data.totals;
        if (req.query.groupBy === 'document') {
          const rows: unknown[][] = (data.rows as (typeof data.rows[number] & Record<string, unknown>)[]).map((x) => [x.docDate, x.docNo, x.isReturn ? 'Trả lại' : 'Bán', x.invoiceSerial, x.invoiceNo, x.branchCode, x.partnerCode, x.partnerName, x.saleQty - x.returnQty, x.netAmount, x.tax, x.total, x.paid, x.onCredit, x.methods]);
          rows.push(['Tổng cộng', '', '', '', '', '', '', '', t.saleQty - t.returnQty, t.netAmount, t.tax, t.total, t.paid, t.onCredit, '']);
          return send(reply, `tong-hop-ban-hang-theo-phieu-${req.query.from}-${req.query.to}.csv`, toCsv(['Ngày', 'Số phiếu', 'Loại', 'Ký hiệu', 'Số HĐ', 'Chi nhánh', 'Mã khách', 'Tên khách hàng', 'Số lượng', 'Tiền hàng', 'Thuế GTGT', 'Tổng thanh toán', 'Đã thu', 'Ghi nợ', 'Hình thức TT'], rows));
        }
        const rows: unknown[][] = data.rows.map((x) => [x.key, x.label, x.extra, x.saleDocs, x.saleQty, x.saleAmount, x.returnDocs, x.returnQty, x.returnAmount, x.netAmount, x.tax, x.total]);
        rows.push(['Tổng cộng', '', '', t.saleDocs, t.saleQty, t.saleAmount, t.returnDocs, t.returnQty, t.returnAmount, t.netAmount, t.tax, t.total]);
        return send(reply, `tong-hop-ban-hang-${req.query.groupBy}-${req.query.from}-${req.query.to}.csv`, toCsv(['Mã', 'Tên', 'Thông tin thêm', 'Số CT bán', 'SL bán', 'Doanh số bán', 'Số CT trả', 'SL trả lại', 'Hàng trả lại', 'Doanh thu thuần', 'Thuế GTGT', 'Tổng thanh toán'], rows));
      },
    });

    r.get('/sales-payments.csv', {
      preHandler: pre,
      schema: { tags, querystring: salesPaymentsQuerySchema },
      handler: async (req, reply) => {
        const data = await salesReportService.payments(authOf(req), req.query);
        const cols = data.methods.map((m) => m.code);
        const rows: unknown[][] = data.rows.map((x) => [x.key, x.label, ...cols.map((c) => x.cells[c] ?? 0), x.received, x.refunded, x.net]);
        rows.push(['Tổng cộng', '', ...cols.map((c) => data.totals.cells[c] ?? 0), data.totals.received, data.totals.refunded, data.totals.net]);
        return send(reply, `thu-tien-${req.query.from}-${req.query.to}.csv`, toCsv(['Mã', 'Tên', ...data.methods.map((m) => m.name), 'Tổng thu', 'Trả lại khách', 'Thực thu'], rows));
      },
    });

    r.get('/income-statement.csv', {
      preHandler: pre,
      schema: { tags, querystring: z.object({ from: date, to: date, branchCodes }) },
      handler: async (req, reply) => {
        const data = await reportService.incomeStatement(authOf(req), req.query);
        const rows = data.rows.map((x) => [x.name, x.code, x.note, x.current, x.previous]);
        return send(reply, `ket-qua-kinh-doanh-${req.query.from}-${req.query.to}.csv`, toCsv(['Chỉ tiêu', 'Mã số', 'Thuyết minh', 'Kỳ này', 'Cùng kỳ năm trước'], rows));
      },
    });

    const ranged = z.object({ from: date, to: date, branchCodes });

    r.get('/balance-sheet.csv', {
      preHandler: pre,
      schema: { tags, querystring: ranged },
      handler: async (req, reply) => {
        const data = await reportService.balanceSheet(authOf(req), req.query);
        return send(reply, `can-doi-ke-toan-${req.query.to}.csv`, toCsv(['Chỉ tiêu', 'Mã số', 'Số cuối kỳ', 'Số đầu kỳ'], data.rows.map((x) => [x.name, x.code, x.closing, x.opening])));
      },
    });

    r.get('/tax-summary.csv', {
      preHandler: pre,
      schema: { tags, querystring: ranged },
      handler: async (req, reply) => {
        const data = await reportService.taxSummary(authOf(req), req.query);
        const t = data.totals;
        const rows: unknown[][] = data.rows.map((x) => [x.branchCode, x.branchName, x.month, x.revenue, x.outputTax, x.inputTax, x.carried, x.payable]);
        rows.push(['Tổng cộng', '', '', t.revenue, t.outputTax, t.inputTax, t.carried, t.payable]);
        return send(reply, `tong-hop-thue-${req.query.from}-${req.query.to}.csv`, toCsv(['Mã chi nhánh', 'Tên chi nhánh', 'Tháng', 'Doanh thu', 'Thuế ra', 'Thuế vào', 'Khấu trừ', 'Thuế nộp cuối kỳ'], rows));
      },
    });

    r.get('/cash-balances.csv', {
      preHandler: pre,
      schema: { tags, querystring: ranged },
      handler: async (req, reply) => {
        const data = await reportService.cashBalances(authOf(req), req.query);
        const t = data.totals;
        const rows: unknown[][] = data.rows.map((x) => [x.branchCode, x.branchName, x.accountCode, x.accountName, x.opening, x.debit, x.credit, x.closing]);
        rows.push(['Tổng cộng', '', '', '', t.opening, t.debit, t.credit, t.closing]);
        return send(reply, `so-du-tien-${req.query.from}-${req.query.to}.csv`, toCsv(['Mã chi nhánh', 'Tên chi nhánh', 'Tài khoản', 'Tên tài khoản', 'Dư đầu kỳ', 'Thu (Nợ)', 'Chi (Có)', 'Dư cuối kỳ'], rows));
      },
    });

    r.get('/posting-summary.csv', {
      preHandler: pre,
      schema: { tags, querystring: ranged.extend({ docType: z.string().optional(), groups: z.string().optional() }) },
      handler: async (req, reply) => {
        const groups = (req.query.groups ?? '').split(',').filter((g): g is PostingSummaryGroup => ['branch', 'month', 'docType', 'costItem', 'reason'].includes(g));
        const data = await reportService.postingSummary(authOf(req), { ...req.query, groups });
        const rows: unknown[][] = data.rows.map((x) => [x.branchCode, x.month, x.docType, x.debitAccount, x.creditAccount, x.costItem, x.reasonCode, x.amount, x.entries]);
        rows.push(['Tổng cộng', '', '', '', '', '', '', data.total, '']);
        return send(reply, `tong-hop-chung-tu-${req.query.from}-${req.query.to}.csv`, toCsv(['Chi nhánh', 'Tháng', 'Loại chứng từ', 'TK Nợ', 'TK Có', 'Khoản mục', 'Lý do', 'Số tiền', 'Số bút toán'], rows));
      },
    });

    r.get('/cash-journal.csv', {
      preHandler: pre,
      schema: { tags, querystring: ranged.extend({ account: z.string().default('111'), direction: z.enum(['in', 'out']).default('in'), columns: z.string().optional() }) },
      handler: async (req, reply) => {
        const data = await reportService.cashJournal(authOf(req), { ...req.query, columns: req.query.columns?.split(',').map((x) => x.trim()).filter(Boolean) });
        const rows: unknown[][] = data.rows.map((x) => [x.postingDate, x.docNo, x.description, x.partnerCode ?? '', x.amount, ...x.cells, x.other, x.otherAccount, x.branchCode]);
        rows.push(['Tổng cộng', '', '', '', data.totals.amount, ...data.totals.cells, data.totals.other, '', '']);
        const name = data.direction === 'in' ? 'Ghi Nợ TK' : 'Ghi Có TK';
        return send(reply, `nhat-ky-${data.direction === 'in' ? 'thu' : 'chi'}-tien-${req.query.from}-${req.query.to}.csv`, toCsv(['Ngày', 'Số chứng từ', 'Diễn giải', 'Đối tượng', name + ' ' + req.query.account, ...data.columns.map((c) => 'TK ' + c), 'Số tiền TK khác', 'Số hiệu TK khác', 'Chi nhánh'], rows));
      },
    });

    r.get('/sales-journal.csv', {
      preHandler: pre,
      schema: { tags, querystring: ranged.extend({ partnerCode: z.string().optional(), account: z.string().optional(), productSkus: z.string().optional() }) },
      handler: async (req, reply) => {
        const data = await reportService.salesJournal(authOf(req), req.query);
        type Row = { createdDate: string; postingDate: string; docDate: string; invoiceDate: string | null; docNo: string; invoiceNo: string | null; description: string; partnerCode: string | null; partnerName: string | null; account: string; contraAccount: string; otherAccount: string; reasonCode: string; total: number; goods: number; finished: number; service: number; other: number };
        const blank = (n: number) => Array.from({ length: n }, () => '');
        const rows: unknown[][] = [];
        for (const b of data.branches) {
          for (const x of b.rows as Row[]) {
            rows.push([x.createdDate, x.docNo, x.postingDate, x.docDate, x.invoiceDate ?? '', x.invoiceNo ?? '', x.description, x.partnerCode ?? '', x.partnerName ?? '', b.branchCode, x.total, x.goods, x.finished, x.service, x.other, x.otherAccount, x.account, x.contraAccount, x.reasonCode]);
          }
          rows.push([`Cộng chi nhánh ${b.branchCode}`, ...blank(9), b.totals.total, b.totals.goods, b.totals.finished, b.totals.service, b.totals.other, ...blank(4)]);
        }
        rows.push(['Tổng cộng', ...blank(9), data.totals.total, data.totals.goods, data.totals.finished, data.totals.service, data.totals.other, ...blank(4)]);
        return send(reply, `nhat-ky-ban-hang-${req.query.from}-${req.query.to}.csv`, toCsv([
          'Ngày lập chứng từ', 'Số chứng từ', 'Ngày ghi sổ', 'Ngày chứng từ', 'Ngày hoá đơn', 'Số hoá đơn', 'Diễn giải', 'Mã khách', 'Tên khách',
          'Chi nhánh', 'Phải thu từ người mua (ghi Nợ)', 'Hàng hoá', 'Thành phẩm', 'Dịch vụ', 'Số tiền TK khác', 'Tài khoản khác', 'Tài khoản', 'TK đối ứng', 'Lý do',
        ], rows));
      },
    });

    r.get('/voucher-listing.csv', {
      preHandler: pre,
      schema: { tags, querystring: ranged.extend({ account: z.string().optional(), docType: z.string().optional() }) },
      handler: async (req, reply) => {
        const data = await reportService.voucherListing(authOf(req), { ...req.query, page: 1, pageSize: 100000 });
        const rows: unknown[][] = data.rows.map((x) => [x.postingDate, x.docNo, x.docType, x.description, x.debitAccount, x.creditAccount, x.amount, x.debitPartner, x.creditPartner, x.costItem, x.department, x.contract, x.reasonCode, x.branchCode]);
        rows.push(['Tổng cộng', '', '', '', '', '', data.amount, '', '', '', '', '', '', '']);
        return send(reply, `bang-ke-chung-tu-${req.query.from}-${req.query.to}.csv`, toCsv(['Ngày', 'Số chứng từ', 'Loại', 'Diễn giải', 'TK Nợ', 'TK Có', 'Số tiền', 'Đối tượng Nợ', 'Đối tượng Có', 'Khoản mục', 'Bộ phận', 'Hợp đồng', 'Lý do', 'Chi nhánh'], rows));
      },
    });

    r.get('/cash-flow.csv', {
      preHandler: pre,
      schema: { tags, querystring: ranged },
      handler: async (req, reply) => {
        const data = await reportService.cashFlow(authOf(req), req.query);
        return send(reply, `luu-chuyen-tien-te-${req.query.from}-${req.query.to}.csv`, toCsv(['Chỉ tiêu', 'Mã số', 'Số tiền'], data.rows.map((x) => [x.name, x.code, x.value ?? ''])));
      },
    });

    r.get('/journal.csv', {
      preHandler: pre,
      schema: { tags, querystring: z.object({ from: date, to: date, branchCodes, docType: z.string().optional(), search: z.string().optional(), account: z.string().optional(), counterAccount: z.string().optional(), groupMode: z.coerce.number().int().min(1).max(3).default(1).transform((v) => v as 1 | 2 | 3) }) },
      handler: async (req, reply) => {
        // Xuất toàn bộ kết quả lọc (tối đa 100.000 dòng), không gồm bút toán đã sửa.
        const data = await reportService.journal(authOf(req), { ...req.query, page: 1, pageSize: 100000 });
        const rows: unknown[][] = data.rows.map((x) => [x.docDate, x.docNo, x.accountCode, x.counterAccounts, x.description, x.debit, x.credit, x.branchCode, x.reasonCode ?? '', x.postingDate, x.entryNo, x.partnerCode, x.partnerName, x.productSku ?? '', x.productName ?? '']);
        rows.push(['Tổng cộng', '', '', '', '', data.totals.debit, data.totals.credit, '', '', '', '', '', '', '', '']);
        return send(reply, `nhat-ky-chung-${req.query.from}-${req.query.to}.csv`, toCsv(['Ngày chứng từ', 'Số chứng từ', 'Tài khoản', 'Tài khoản đối ứng', 'Ghi chú', 'Số tiền Nợ', 'Số tiền Có', 'Chi nhánh', 'Mã lý do', 'Ngày ghi sổ', 'Số bút toán', 'Mã đối tượng', 'Tên đối tượng', 'Mã hàng', 'Tên hàng'], rows));
      },
    });

    r.get('/partner-balances.csv', {
      preHandler: pre,
      schema: { tags, querystring: z.object({ account: z.string().default('131').transform((s) => (s.trim() === '*' ? '' : s.trim())), from: date, to: date, branchCodes, hideZero: z.string().optional().transform((s) => s === 'true' || s === '1'), byBranch: z.string().optional().transform((s) => s === 'true' || s === '1') }) },
      handler: async (req, reply) => {
        const data = await reportService.partnerBalances(authOf(req), req.query);
        const t = data.totals;
        const rows: unknown[][] = data.rows.map((x) => [x.accountCode, x.branchCode, x.partnerCode, x.partnerName, x.taxCode, x.openingDebit, x.openingCredit, x.debit, x.credit, x.closingDebit, x.closingCredit]);
        for (const a of data.accounts) rows.push([`Cộng TK ${a.accountCode}`, '', '', a.accountName, '', a.openingDebit, a.openingCredit, a.debit, a.credit, a.closingDebit, a.closingCredit]);
        rows.push(['Tổng cộng', '', '', '', '', t.openingDebit, t.openingCredit, t.debit, t.credit, t.closingDebit, t.closingCredit]);
        return send(reply, `cong-no-${req.query.account || 'tat-ca'}-${req.query.from}-${req.query.to}.csv`, toCsv(['Tài khoản', 'Chi nhánh', 'Mã đối tượng', 'Tên đối tượng', 'Mã số thuế', 'Dư Nợ đầu kỳ', 'Dư Có đầu kỳ', 'Phát sinh Nợ', 'Phát sinh Có', 'Dư Nợ cuối kỳ', 'Dư Có cuối kỳ'], rows));
      },
    });

    r.get('/sales-invoices.csv', {
      preHandler: pre,
      schema: { tags, querystring: z.object({ from: date, to: date, branchCodes, direction: z.enum(['output', 'input']).default('output') }) },
      handler: async (req, reply) => {
        const data = await reportService.salesInvoices(authOf(req), req.query);
        const rows: unknown[][] = [];
        for (const g of data.groups) {
          if (g.label) rows.push([g.label]);
          for (const x of g.rows) rows.push([x.invoiceForm, x.invoiceSerial, x.docNo, x.docDate, x.invoiceDate, x.invoiceNo, x.buyerName, x.buyerTaxCode, x.amount, x.taxRate, x.tax, x.branchCode, x.partnerCode, x.partnerName]);
          if (g.counted) rows.push(['Tổng:', '', '', '', '', '', '', '', g.amount, '', g.tax]);
        }
        const input = req.query.direction === 'input';
        const csv = toCsv(['Mẫu số', 'Ký hiệu HĐ', 'Mã phiếu', 'Ngày chứng từ', 'Ngày HĐ', 'Số HĐ', input ? 'Tên người bán' : 'Tên người mua', 'Mã số thuế', input ? 'Giá trị chưa thuế' : 'Doanh thu chưa thuế', 'Tỷ lệ thuế', 'Thuế', 'Chi nhánh', 'Mã đối tượng', 'Tên đối tượng'], rows);
        return reply.header('content-type', 'text/csv; charset=utf-8').header('content-disposition', `attachment; filename="bao-cao-thue-${input ? 'vao' : 'ra'}-${req.query.from}-${req.query.to}.csv"`).send(csv);
      },
    });
  },
});
