/**
 * MẪU IN báo cáo bán hàng:
 *   BH01  Báo cáo chi tiết bán hàng (rptTKChitietbanhang*.rpt): chi tiết / theo khách hàng / theo mặt hàng / theo chi nhánh (kho)
 *   BH02  Tổng hợp bán hàng (rptTKBanhoadonVaBanhoantra*.rpt) theo cách gom đang xem; bảng kê hoá đơn bán và hàng trả lại khi xem theo phiếu
 *   BH03  Bảng tổng hợp thu tiền theo hình thức thanh toán (rptTKThuChi.rpt)
 *   BH05  Báo cáo thu tiền bán hàng (rptTKThutienkhachhang.rpt): theo phiếu thu / theo hình thức thanh toán
 */
import type { ReactNode } from 'react';
import { date } from '@/lib/format';
import { BOOK_SIGNS, LedgerForm, m, mb, qty, screenTemplate, type LedgerCol, type LedgerData, type PrintCtx, type PrintTemplate, type Row, type Sign } from '@/components/print';

const MAKER_SIGNS: Sign[] = [{ title: 'Người lập biểu' }, ...BOOK_SIGNS.slice(1)];
const CASH_SIGNS: Sign[] = [{ title: 'Người lập biểu' }, { title: 'Thủ quỹ' }, ...BOOK_SIGNS.slice(1)];
const oneBranch = (codes: string) => (codes && !codes.includes(',') ? codes : undefined);
const branchInfo = (codes: string, name: (c: string) => string): Row[] => (codes ? [['Chi nhánh', codes.split(',').map((c) => `${c} — ${name(c)}`).join('; ')]] : []);
const KIND: Record<string, string> = { sale: 'Chỉ hàng bán', return: 'Chỉ hàng trả lại' };
const SCOPE: Record<string, string> = { invoice: 'Có hoá đơn', noInvoice: 'Không có hoá đơn' };
/** Điều kiện lọc loại phiếu / phạm vi (chỉ in khi khác "tất cả"). */
const kindInfo = (kind: string, scope: string): Row[] => [...(KIND[kind] ? [['Loại', KIND[kind]] as Row] : []), ...(SCOPE[scope] ? [['Phạm vi', SCOPE[scope]] as Row] : [])];
const sheet = <R,>(ctx: PrintCtx, d: LedgerData<R>) => <LedgerForm ctx={ctx} d={d} />;

/* ------------------------------------------------------------------ BH01 */
export interface SaleLine {
  docDate: string; docNo: string; invoiceNo: string | null; invoiceSerial: string; taxRate: number | null; taxCode: string; isReturn: boolean; isGift: boolean;
  branchCode: string; partnerCode: string | null; partnerName: string | null; sku: string; name: string; unit: string; qty: number; unitPrice: number; amount: number; tax: number; total: number;
}
export interface SaleDetailSheet { from: string; to: string; branchCodes: string; kind: string; scope: string; search: string; rows: SaleLine[] }

type DetailBy = 'none' | 'customer' | 'product' | 'branch';
const DETAIL: Record<DetailBy, { id: string; name: string; source: string; title: string; key?: (r: SaleLine) => string; label?: (k: string, rs: SaleLine[], ctx: PrintCtx) => ReactNode; subtotal?: string; drop: string[] }> = {
  none: { id: 'ct', name: 'Báo cáo chi tiết bán hàng', source: 'rptTKChitietbanhang.rpt', title: 'BÁO CÁO CHI TIẾT BÁN HÀNG', drop: [] },
  customer: {
    id: 'kh', name: 'Chi tiết bán hàng theo khách hàng', source: 'rptTKChitietbanhangtheoKH.rpt', title: 'BÁO CÁO CHI TIẾT BÁN HÀNG THEO KHÁCH HÀNG', drop: ['kh'], subtotal: 'Cộng khách hàng',
    key: (r) => r.partnerCode || r.partnerName || '', label: (k, rs) => <>Khách hàng: <b>{rs[0]?.partnerCode || ''}</b> {rs[0]?.partnerName || (k ? '' : '(khách lẻ)')}</>,
  },
  product: {
    id: 'mh', name: 'Chi tiết bán hàng theo mặt hàng', source: 'rptTKChitietbanhangtheoMH.rpt', title: 'BÁO CÁO CHI TIẾT BÁN HÀNG THEO MẶT HÀNG', drop: ['sku', 'ten', 'dvt'], subtotal: 'Cộng mặt hàng',
    key: (r) => r.sku, label: (k, rs) => <>Mặt hàng: <b>{k}</b> — {rs[0]?.name}{rs[0]?.unit ? ` (${rs[0].unit})` : ''}</>,
  },
  branch: {
    id: 'kho', name: 'Chi tiết bán hàng theo chi nhánh (kho)', source: 'rptTKChitietbanhangtheoKho.rpt', title: 'BÁO CÁO CHI TIẾT BÁN HÀNG THEO CHI NHÁNH', drop: ['cn'], subtotal: 'Cộng chi nhánh',
    key: (r) => r.branchCode, label: (k, _, ctx) => <>Chi nhánh: <b>{k}</b> — {ctx.branchName(k)}</>,
  },
};
const saleCols: LedgerCol<SaleLine>[] = [
  { key: 'stt', h: 'STT', w: 28, center: true, v: (_, i) => i + 1 },
  { key: 'ngay', h: 'Ngày', w: 56, center: true, v: (r) => date(r.docDate) },
  { key: 'so', h: 'Số chứng từ', w: 88, v: (r) => <>{r.docNo}{r.isReturn ? <i> (trả lại)</i> : null}</> },
  { key: 'hd', h: 'Số hoá đơn', w: 72, v: (r) => (r.invoiceNo ? `${r.invoiceSerial ? `${r.invoiceSerial}-` : ''}${r.invoiceNo}` : '') },
  { key: 'cn', h: 'CN', w: 40, center: true, v: (r) => r.branchCode },
  { key: 'kh', h: 'Khách hàng', w: 120, v: (r) => r.partnerName || r.partnerCode || '' },
  { key: 'sku', h: 'Mã hàng', w: 80, v: (r) => r.sku },
  { key: 'ten', h: 'Tên hàng', v: (r) => <>{r.name}{r.isGift ? <i> (tặng)</i> : null}</> },
  { key: 'dvt', h: 'ĐVT', w: 36, center: true, v: (r) => r.unit },
  { key: 'sl', h: 'Số lượng', w: 50, num: true, v: (r) => qty(r.qty), sum: (r) => r.qty },
  { key: 'dg', h: 'Đơn giá', w: 70, num: true, v: (r) => mb(r.unitPrice) },
  { key: 'th', h: 'Tiền hàng', w: 84, num: true, v: (r) => mb(r.amount), sum: (r) => r.amount },
  { key: 'ts', h: 'TS', w: 34, center: true, v: (r) => (r.taxRate === null || r.taxCode === 'KCT' ? r.taxCode : `${r.taxRate}%`) },
  { key: 'tt', h: 'Tiền thuế', w: 72, num: true, v: (r) => mb(r.tax), sum: (r) => r.tax },
  { key: 'tong', h: 'Tổng tiền', w: 86, num: true, v: (r) => mb(r.total), sum: (r) => r.total },
];
const detailTemplate = (by: DetailBy): PrintTemplate<SaleDetailSheet> => {
  const t = DETAIL[by];
  return {
    id: t.id, name: t.name, paper: 'A4L', source: t.source,
    render: (s, ctx) => sheet(ctx, {
      title: t.title, branchCode: oneBranch(s.branchCodes), from: s.from, to: s.to, signs: MAKER_SIGNS, total: 'Tổng cộng',
      info: [...branchInfo(s.branchCodes, ctx.branchName), ...kindInfo(s.kind, s.scope), ...(s.search ? [['Tìm kiếm', s.search] as Row] : [])],
      note: 'Hàng trả lại ghi số âm.',
      // Theo nhóm: sắp theo khoá nhóm để mỗi nhóm liền một khối.
      rows: t.key ? [...s.rows].sort((a, b) => t.key!(a).localeCompare(t.key!(b))) : s.rows,
      groupBy: t.key ? { key: t.key, label: (k, rs) => t.label!(k, rs, ctx), subtotal: t.subtotal } : undefined,
      cols: saleCols.filter((c) => !t.drop.includes(c.key)),
    }),
  };
};
export const SALES_DETAIL_TEMPLATES: PrintTemplate<SaleDetailSheet>[] = [detailTemplate('none'), detailTemplate('customer'), detailTemplate('product'), detailTemplate('branch'), screenTemplate<SaleDetailSheet>()];

/* ------------------------------------------------------------------ BH02 */
interface Measures { saleDocs: number; saleQty: number; saleAmount: number; returnQty: number; returnAmount: number; netAmount: number; tax: number; total: number }
export interface SummaryLine extends Measures {
  key: string; label: string; extra: string;
  docDate?: string; docNo?: string; isReturn?: boolean; invoiceNo?: string; invoiceSerial?: string; branchCode?: string; partnerCode?: string; partnerName?: string; methods?: string; paid?: number; onCredit?: number; remaining?: number;
}
export interface SummarySheet {
  from: string; to: string; branchCodes: string; kind: string; scope: string; groupBy: string; tab: string; keyHead: string; labelHead?: string; extraHead?: string; rows: SummaryLine[];
}
const SUMMARY_SOURCE: Record<string, string> = { customer: 'rptTKBanhoadonVaBanhoantraByKH.rpt', product: 'rptTKBanhoadonVaBanhoantraByMH.rpt' };
const sumCol = (key: string, h: string, f: (r: SummaryLine) => number, w = 86, money = true): LedgerCol<SummaryLine> => ({ key, h, w, num: true, v: (r) => (money ? mb(f(r)) : qty(f(r))), sum: f });

/** Bảng kê theo phiếu (mỗi hoá đơn bán / phiếu trả lại một dòng). */
const documentList: PrintTemplate<SummarySheet> = {
  id: 'phieu', name: 'Bảng kê hoá đơn bán hàng và hàng bán trả lại', paper: 'A4L', source: 'rptTKBanhoadonVaBanhoantra.rpt',
  render: (s, ctx) => sheet(ctx, {
    title: 'BẢNG KÊ HOÁ ĐƠN BÁN HÀNG VÀ HÀNG BÁN TRẢ LẠI', branchCode: oneBranch(s.branchCodes), from: s.from, to: s.to, signs: MAKER_SIGNS, total: 'Tổng cộng',
    info: [...branchInfo(s.branchCodes, ctx.branchName), ...kindInfo(s.kind, s.scope)], rows: s.rows, note: 'Phiếu trả lại ghi số âm.',
    cols: [
      { key: 'stt', h: 'STT', w: 28, center: true, v: (_, i) => i + 1 },
      { key: 'ngay', h: 'Ngày', w: 56, center: true, v: (r) => date(r.docDate) },
      { key: 'so', h: 'Số phiếu', w: 90, v: (r) => <>{r.docNo ?? r.label}{r.isReturn ? <i> (trả lại)</i> : null}</> },
      { key: 'hd', h: 'Số hoá đơn', w: 72, v: (r) => (r.invoiceNo ? `${r.invoiceSerial ? `${r.invoiceSerial}-` : ''}${r.invoiceNo}` : '') },
      { key: 'cn', h: 'CN', w: 40, center: true, v: (r) => r.branchCode ?? '' },
      { key: 'kh', h: 'Khách hàng', v: (r) => <>{r.partnerCode ? <b>{r.partnerCode} </b> : null}{r.partnerName}</> },
      sumCol('sl', 'Số lượng', (r) => r.saleQty - r.returnQty, 54, false),
      sumCol('th', 'Tiền hàng', (r) => r.netAmount),
      sumCol('thue', 'Thuế GTGT', (r) => r.tax, 72),
      sumCol('tong', 'Tổng thanh toán', (r) => r.total),
      sumCol('thu', 'Đã thu', (r) => r.paid ?? 0),
      sumCol('no', 'Ghi nợ', (r) => r.onCredit ?? 0, 78),
      sumCol('con', 'Còn nợ', (r) => r.remaining ?? 0, 78),
      { key: 'ht', h: 'Hình thức TT', w: 80, v: (r) => r.methods ?? '' },
    ],
  }),
};
/** Tổng hợp theo cách gom đang xem (ngày, tháng, chi nhánh, mặt hàng, khách…). */
const groupedSummary = (groupBy: string): PrintTemplate<SummarySheet> => ({
  id: 'th', name: 'Tổng hợp bán hàng và hàng bán trả lại', paper: 'A4L', source: SUMMARY_SOURCE[groupBy] ?? 'rptTKBanhoadonVaBanhoantra.rpt',
  render: (s, ctx) => sheet(ctx, {
    title: `TỔNG HỢP BÁN HÀNG VÀ HÀNG BÁN TRẢ LẠI ${s.tab.toUpperCase()}`, branchCode: oneBranch(s.branchCodes), from: s.from, to: s.to, signs: MAKER_SIGNS, total: 'Tổng cộng',
    info: [...branchInfo(s.branchCodes, ctx.branchName), ...kindInfo(s.kind, s.scope)], rows: s.rows,
    cols: [
      { key: 'stt', h: 'STT', w: 28, center: true, v: (_, i) => i + 1 },
      { key: 'ma', h: s.keyHead, w: s.labelHead ? 90 : undefined, v: (r) => (s.groupBy === 'day' ? date(r.key) : s.groupBy === 'month' ? r.label : r.key || '(không có)') },
      ...(s.labelHead ? [{ key: 'ten', h: s.labelHead, v: (r: SummaryLine) => r.label }] : []),
      ...(s.extraHead ? [{ key: 'ex', h: s.extraHead, w: 76, center: true, v: (r: SummaryLine) => r.extra }] : []),
      sumCol('ct', 'Số CT bán', (r) => r.saleDocs, 46, false),
      { ...sumCol('slb', 'Số lượng', (r) => r.saleQty, 56, false), group: 'Bán hàng' },
      { ...sumCol('dsb', 'Doanh số', (r) => r.saleAmount), group: 'Bán hàng' },
      { ...sumCol('slt', 'Số lượng', (r) => r.returnQty, 56, false), group: 'Hàng trả lại' },
      { ...sumCol('tl', 'Giá trị', (r) => r.returnAmount), group: 'Hàng trả lại' },
      sumCol('dtt', 'Doanh thu thuần', (r) => r.netAmount, 92),
      sumCol('thue', 'Thuế GTGT', (r) => r.tax, 78),
      sumCol('tong', 'Tổng thanh toán', (r) => r.total, 92),
    ],
  }),
});
export const summaryTemplates = (groupBy: string): PrintTemplate<SummarySheet>[] => [groupBy === 'document' ? documentList : groupedSummary(groupBy), screenTemplate<SummarySheet>()];

/* ------------------------------------------------------------------ BH03 */
interface PayCells { cells: Record<string, number>; received: number; refunded: number; net: number }
export interface PaymentsSheet {
  from: string; to: string; branchCodes: string; groupBy: string;
  methods: { code: string; name: string; isReceivable: boolean }[]; rows: (PayCells & { key: string; label: string })[];
}
export const PAYMENTS_TEMPLATES: PrintTemplate<PaymentsSheet>[] = [
  {
    id: 'httt', name: 'Bảng tổng hợp thu tiền theo hình thức thanh toán', paper: 'A4L', source: 'rptTKThuChi.rpt',
    render: (s, ctx) => {
      const byBranch = s.groupBy === 'branch';
      type R = PaymentsSheet['rows'][number];
      return sheet<R>(ctx, {
        title: `BẢNG TỔNG HỢP THU TIỀN THEO HÌNH THỨC THANH TOÁN${byBranch ? ' THEO CHI NHÁNH' : ''}`, branchCode: oneBranch(s.branchCodes), from: s.from, to: s.to,
        info: branchInfo(s.branchCodes, ctx.branchName), signs: CASH_SIGNS, total: 'Tổng cộng', rows: s.rows,
        note: s.methods.some((x) => x.isReceivable) ? '(*) Ghi nợ / đối trừ: không phải tiền thực nhận, không cộng vào Tổng thu, Thực thu.' : undefined,
        cols: [
          { key: 'k', h: byBranch ? 'Mã chi nhánh' : 'Ngày', w: byBranch ? 70 : 64, center: true, v: (r) => (byBranch ? r.key : date(r.key)) },
          ...(byBranch ? [{ key: 'l', h: 'Tên chi nhánh', w: 140, v: (r: R) => r.label }] : []),
          ...s.methods.map((x): LedgerCol<R> => ({ key: `m-${x.code}`, h: `${x.name}${x.isReceivable ? ' (*)' : ''}`, group: 'Hình thức thanh toán', num: true, v: (r) => mb(r.cells[x.code] ?? 0), sum: (r) => r.cells[x.code] ?? 0 })),
          { key: 'rc', h: 'Tổng thu', w: 92, num: true, v: (r) => mb(r.received), sum: (r) => r.received },
          { key: 'rf', h: 'Trả lại khách', w: 84, num: true, v: (r) => mb(r.refunded), sum: (r) => r.refunded },
          { key: 'net', h: 'Thực thu', w: 96, num: true, v: (r) => m(r.net), sum: (r) => r.net },
        ],
      });
    },
  },
  screenTemplate<PaymentsSheet>(),
];

/* ------------------------------------------------------------------ BH05 */
export interface ReceiptLine { payNo: string; payDate: string; invNo: string; invDate: string; invTotal: number; paid: number; partnerCode: string; partnerName: string; branchName: string; bank: string; method: string; reasonCode: string; note: string; kind: string }
export interface ReceiptsSheet { from: string; to: string; branchCodes: string; rows: ReceiptLine[] }

const receiptCols = (byMethod: boolean): LedgerCol<ReceiptLine>[] => [
  { key: 'stt', h: 'STT', w: 28, center: true, v: (_, i) => i + 1 },
  { key: 'pt', h: 'Số phiếu', group: 'Phiếu thu tiền', w: 92, v: (r) => r.payNo },
  { key: 'nt', h: 'Ngày', group: 'Phiếu thu tiền', w: 58, center: true, v: (r) => date(r.payDate) },
  { key: 'pb', h: 'Số phiếu', group: 'Phiếu bán hàng', w: 92, v: (r) => r.invNo },
  { key: 'nb', h: 'Ngày', group: 'Phiếu bán hàng', w: 58, center: true, v: (r) => date(r.invDate) },
  { key: 'kh', h: 'Khách hàng', v: (r) => <>{r.partnerCode ? <b>{r.partnerCode} </b> : null}{r.partnerName}</> },
  { key: 'cn', h: 'Chi nhánh', w: 96, v: (r) => r.branchName },
  ...(byMethod ? [] : [{ key: 'ht', h: 'Hình thức TT', w: 84, v: (r: ReceiptLine) => <>{r.method}{r.bank ? ` (${r.bank})` : ''}</> }]),
  { key: 'tong', h: 'Tổng tiền phiếu bán', w: 88, num: true, v: (r) => mb(r.invTotal) },
  { key: 'tt', h: 'Số tiền thanh toán', w: 92, num: true, v: (r) => m(r.paid), sum: (r) => r.paid },
  { key: 'gc', h: 'Lý do / ghi chú', w: 110, v: (r) => [r.reasonCode, r.note].filter(Boolean).join(' — ') },
];
const receiptsBook = (byMethod: boolean): PrintTemplate<ReceiptsSheet> => ({
  id: byMethod ? 'httt' : 'pt', name: byMethod ? 'Báo cáo thu tiền bán hàng theo hình thức thanh toán' : 'Báo cáo thu tiền bán hàng', paper: 'A4L', source: 'rptTKThutienkhachhang.rpt',
  render: (s, ctx) => sheet(ctx, {
    title: byMethod ? 'BÁO CÁO THU TIỀN BÁN HÀNG THEO HÌNH THỨC THANH TOÁN' : 'BÁO CÁO THU TIỀN BÁN HÀNG', branchCode: oneBranch(s.branchCodes), from: s.from, to: s.to,
    info: branchInfo(s.branchCodes, ctx.branchName), signs: CASH_SIGNS, total: 'Tổng cộng',
    rows: byMethod ? [...s.rows].sort((a, b) => `${a.method}|${a.bank}`.localeCompare(`${b.method}|${b.bank}`)) : s.rows,
    groupBy: byMethod ? { key: (r) => `${r.method}${r.bank ? ` (${r.bank})` : ''}`, label: (k) => <>Hình thức thanh toán: <b>{k || '(không rõ)'}</b></>, subtotal: 'Cộng hình thức' } : undefined,
    cols: receiptCols(byMethod),
  }),
});
export const RECEIPTS_TEMPLATES: PrintTemplate<ReceiptsSheet>[] = [receiptsBook(false), receiptsBook(true), screenTemplate<ReceiptsSheet>()];
