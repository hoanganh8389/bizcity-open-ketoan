/**
 * MẪU IN các báo cáo phân tích, kiểm soát (ControlPages.tsx):
 *   ACC44        Báo cáo tổng hợp chi phí theo khoản mục và bộ phận (rdlcACC44_BCTongHopChiPhi1/2.rdlc, A4 dọc): cột Mã, Tên theo cách gom đang xem | Tổng tiền | Tỷ trọng
 *   ACC70 / 71   Báo cáo tổng hợp / chi tiết lãi lỗ theo hợp đồng (không có mẫu HTsoft; A4 ngang)
 *   ACC93        Báo cáo kiểm tra chứng từ, hoá đơn: tám mục kiểm tra của màn, mỗi mục một bảng (A4 ngang)
 */
import type { ReactNode } from 'react';
import { DOC_TYPE_LABELS, type DocType } from '@ketoan/contracts';
import { date } from '@/lib/format';
import { LedgerForm, OrgHead, Signs, Foot, Fields, m, mb, screenTemplate, type Col, type LedgerCol, type PrintCtx, type PrintTemplate, type Row, type Sign } from '@/components/print';

const REPORT_SIGNS: Sign[] = [{ title: 'Người lập biểu' }, { title: 'Kế toán trưởng' }, { title: 'Giám đốc', note: '(Ký, họ tên, đóng dấu)' }];
const branchOf = (codes: string) => (codes && !codes.includes(',') ? codes : undefined);
const branchInfo = (codes: string): Row[] => (codes.includes(',') ? [['Chi nhánh', codes.split(',').join(', ')]] : []);

/* ------------------------------------------------------------------ ACC44 */
export type ExpensePrintRow = { amount: number; accountCode?: string; accountName?: string } & Record<string, string | number | undefined>;
/** dims: các cột gom đang xem (key = trường phân tích hoặc 'account', head = tên cột trên màn). */
export interface ExpenseSheet { from: string; to: string; branchCodes: string; account: string; groupLabel: string; dims: { key: string; head: string }[]; rows: ExpensePrintRow[]; total: number }

const codeOf = (r: ExpensePrintRow, c: string) => String((c === 'account' ? r.accountCode : r[c]) ?? '');
const nameOf = (r: ExpensePrintRow, c: string) => String((c === 'account' ? r.accountName : r[`${c}Name`]) ?? '');

export const EXPENSE_TEMPLATES: PrintTemplate<ExpenseSheet>[] = [
  {
    id: 'thcp', name: 'Báo cáo tổng hợp chi phí theo khoản mục và bộ phận', paper: 'A4', source: 'rdlcACC44_BCTongHopChiPhi1.rdlc, rdlcACC44_BCTongHopChiPhi2.rdlc',
    render: (s, ctx) => (
      <LedgerForm ctx={ctx} d={{
        title: 'BÁO CÁO TỔNG HỢP CHI PHÍ THEO KHOẢN MỤC VÀ BỘ PHẬN', branchCode: branchOf(s.branchCodes), from: s.from, to: s.to, signs: REPORT_SIGNS, total: 'Tổng cộng', rows: s.rows,
        info: [['Tài khoản chi phí', s.account], ['Cách gom', s.groupLabel], ...branchInfo(s.branchCodes)],
        cols: [
          { key: 'stt', h: 'STT', w: 30, center: true, v: (_, i) => i + 1 },
          ...s.dims.flatMap(({ key, head }): LedgerCol<ExpensePrintRow>[] => [
            { key: `${key}-ma`, h: `Mã ${head.toLowerCase()}`, w: 76, center: true, v: (r) => codeOf(r, key) || '' },
            { key: `${key}-ten`, h: `Tên ${head.toLowerCase()}`, v: (r) => (codeOf(r, key) ? nameOf(r, key) : <i>(chưa phân loại)</i>) },
          ]),
          { key: 'tien', h: 'Tổng tiền', w: 110, num: true, v: (r) => m(r.amount), sum: (r) => r.amount },
          { key: 'tt', h: 'Tỷ trọng', w: 54, num: true, v: (r) => (s.total ? `${((r.amount / s.total) * 100).toFixed(1).replace('.', ',')}%` : '') },
        ],
      }} />
    ),
  },
  screenTemplate<ExpenseSheet>(),
];

/* ------------------------------------------------------------------ ACC70, ACC71 */
export interface ContractProfitPrintRow { contractCode: string; contractName: string; contractType: string; partnerCode: string; partnerName: string; contractValue: number; accountCode: string; accountName: string; revenue: number; cost: number; profit: number }
/** typeName: tên loại hợp đồng theo mã (CONTRACT_TYPES). */
export interface ContractProfitSheet { detail: boolean; from: string; to: string; branchCodes: string; typeName: Record<string, string>; rows: ContractProfitPrintRow[] }

const partnerText = (r: ContractProfitPrintRow) => (r.partnerCode ? `${r.partnerCode} ${r.partnerName}` : '');
const PROFIT_COLS: LedgerCol<ContractProfitPrintRow>[] = [
  { key: 'dt', h: 'Doanh thu, thu nhập', w: 112, num: true, v: (r) => mb(r.revenue), sum: (r) => r.revenue },
  { key: 'cp', h: 'Giá vốn, chi phí', w: 112, num: true, v: (r) => mb(r.cost), sum: (r) => r.cost },
  { key: 'lai', h: 'Lãi (+) / lỗ (−)', w: 112, num: true, v: (r) => m(r.profit), sum: (r) => r.profit },
];

/** ACC70 tổng hợp (mỗi hợp đồng một dòng) / ACC71 chi tiết (nhóm theo hợp đồng, mỗi tài khoản một dòng, cộng từng hợp đồng). */
export function contractProfitTemplates(detail: boolean): PrintTemplate<ContractProfitSheet>[] {
  return [
    detail ? {
      id: 'ctll', name: 'Báo cáo chi tiết lãi lỗ theo hợp đồng', paper: 'A4L',
      render: (s, ctx) => (
        <LedgerForm ctx={ctx} d={{
          title: 'BÁO CÁO CHI TIẾT LÃI LỖ THEO HỢP ĐỒNG', branchCode: branchOf(s.branchCodes), from: s.from, to: s.to, info: branchInfo(s.branchCodes), signs: REPORT_SIGNS, total: 'Tổng cộng', rows: s.rows,
          groupBy: {
            key: (r) => r.contractCode,
            label: (k, rs) => { const r = rs[0]!; return <>Hợp đồng {k} — {r.contractName}{s.typeName[r.contractType] ? ` (${s.typeName[r.contractType]})` : ''}{partnerText(r) ? <i> · {partnerText(r)}</i> : null}</>; },
            subtotal: 'Cộng hợp đồng',
          },
          cols: [
            { key: 'tk', h: 'Tài khoản', w: 80, center: true, v: (r) => r.accountCode },
            { key: 'ten', h: 'Tên tài khoản', v: (r) => r.accountName },
            ...PROFIT_COLS,
          ],
        }} />
      ),
    } : {
      id: 'thll', name: 'Báo cáo tổng hợp lãi lỗ theo hợp đồng', paper: 'A4L',
      render: (s, ctx) => (
        <LedgerForm ctx={ctx} d={{
          title: 'BÁO CÁO TỔNG HỢP LÃI LỖ THEO HỢP ĐỒNG', branchCode: branchOf(s.branchCodes), from: s.from, to: s.to, info: branchInfo(s.branchCodes), signs: REPORT_SIGNS, total: 'Tổng cộng', rows: s.rows,
          cols: [
            { key: 'stt', h: 'STT', w: 30, center: true, v: (_, i) => i + 1 },
            { key: 'ma', h: 'Mã hợp đồng', w: 90, v: (r) => r.contractCode },
            { key: 'ten', h: 'Tên hợp đồng', v: (r) => r.contractName },
            { key: 'loai', h: 'Loại', w: 80, v: (r) => s.typeName[r.contractType] ?? '' },
            { key: 'kh', h: 'Khách hàng / NCC', w: 170, v: partnerText },
            { key: 'gt', h: 'Giá trị hợp đồng', w: 105, num: true, v: (r) => mb(r.contractValue) },
            ...PROFIT_COLS,
          ],
        }} />
      ),
    },
    screenTemplate<ContractProfitSheet>(),
  ];
}

/* ------------------------------------------------------------------ ACC93 */
interface DocItem { id: string; docNo: string; docDate: string; docType: string; invoiceNo: string; total: number; branchCode: string; note: string }
export interface ChecksPrintData {
  errors: { count: number; rows: DocItem[] };
  noInvoice: { count: number; total: number; rows: DocItem[] };
  abnormalInvoices: { count: number; rows: { docNo: string; invoiceNo: string; invoiceSerial: string; invoiceDate: string; status: string; amount: number; branchCode: string }[] };
  duplicateInvoices: { count: number; rows: { invoiceSerial: string; invoiceNo: string; times: number; docs: string; branchCodes: string }[] };
  invoiceGaps: { count: number; rows: { invoiceSerial: string; firstNo: string; lastNo: string; issued: number; missing: number; sample: string }[] };
  orphanReturns: { count: number; rows: DocItem[] };
  entryMismatch: { count: number; rows: DocItem[] };
  balanceMismatch: { count: number; rows: { branchCode: string; accountCode: string; day: string; lineDebit: number; lineCredit: number; balanceDebit: number; balanceCredit: number }[] };
}
export interface ChecksSheet { from: string; to: string; branchCodes: string; checks: ChecksPrintData }

const INVOICE_STATUS: Record<string, string> = { replaced: 'Đã bị thay thế', adjusted: 'Đã điều chỉnh', cancelled: 'Đã huỷ' };
const n = (v: number) => v.toLocaleString('vi-VN');
const docCols = (noteHead: string): Col<DocItem>[] => [
  { h: 'STT', w: 30, center: true, v: (_, i) => i + 1 },
  { h: 'Ngày', w: 66, center: true, v: (r) => date(r.docDate) },
  { h: 'Số chứng từ', w: 120, v: (r) => r.docNo },
  { h: 'Loại', w: 130, v: (r) => DOC_TYPE_LABELS[r.docType as DocType] ?? r.docType },
  { h: 'Chi nhánh', w: 60, center: true, v: (r) => r.branchCode },
  { h: 'Số tiền', w: 100, num: true, v: (r) => m(r.total) },
  { h: noteHead, v: (r) => r.note },
];

/** Một mục kiểm tra: tiêu đề + số trường hợp; có trường hợp thì in bảng. */
function CheckTable<R>({ title, count, ok, cols, rows }: { title: string; count: number; ok: string; cols: Col<R>[]; rows: R[] }) {
  return (
    <div style={{ marginTop: 8 }}>
      <b>{title}</b>: {count ? `${n(count)} trường hợp${rows.length < count ? ` (in ${n(rows.length)} dòng đầu)` : ''}` : ok}
      {count > 0 && (
        <table className="pd-table compact">
          <thead><tr>{cols.map((c, i) => <th key={i} style={{ width: c.w }}>{c.h}</th>)}</tr></thead>
          <tbody>{rows.map((r, i) => <tr key={i}>{cols.map((c, j) => <td key={j} className={c.num ? 'num' : c.center ? 'c' : undefined}>{c.v(r, i)}</td>)}</tr>)}</tbody>
        </table>
      )}
    </div>
  );
}

function ChecksDoc({ s, ctx }: { s: ChecksSheet; ctx: PrintCtx }) {
  const d = s.checks;
  const sections: ReactNode[] = [
    <CheckTable key="1" title="1. Chứng từ lỗi, chưa ghi sổ" count={d.errors.count} ok="Không có" rows={d.errors.rows} cols={docCols('Lý do lỗi')} />,
    <CheckTable key="2" title="2. Số hoá đơn trùng" count={d.duplicateInvoices.count} ok="Không có" rows={d.duplicateInvoices.rows} cols={[
      { h: 'Ký hiệu', w: 90, v: (r) => r.invoiceSerial }, { h: 'Số hoá đơn', w: 90, v: (r) => r.invoiceNo }, { h: 'Số lần', w: 50, num: true, v: (r) => r.times },
      { h: 'Các chứng từ', v: (r) => r.docs }, { h: 'Chi nhánh', w: 90, v: (r) => r.branchCodes }]} />,
    <CheckTable key="3" title="3. Số hoá đơn nhảy cóc" count={d.invoiceGaps.count} ok="Liền số" rows={d.invoiceGaps.rows} cols={[
      { h: 'Ký hiệu', w: 90, v: (r) => r.invoiceSerial }, { h: 'Từ số', w: 80, v: (r) => r.firstNo }, { h: 'Đến số', w: 80, v: (r) => r.lastNo },
      { h: 'Đã nhận', w: 60, num: true, v: (r) => n(r.issued) }, { h: 'Thiếu', w: 60, num: true, v: (r) => n(r.missing) }, { h: 'Các số thiếu', v: (r) => r.sample }]} />,
    <CheckTable key="4" title="4. Hoá đơn bị thay thế, điều chỉnh, huỷ" count={d.abnormalInvoices.count} ok="Không có" rows={d.abnormalInvoices.rows} cols={[
      { h: 'Ngày hoá đơn', w: 70, center: true, v: (r) => date(r.invoiceDate) }, { h: 'Ký hiệu', w: 90, v: (r) => r.invoiceSerial }, { h: 'Số hoá đơn', w: 90, v: (r) => r.invoiceNo },
      { h: 'Trạng thái', w: 110, v: (r) => INVOICE_STATUS[r.status] ?? r.status }, { h: 'Chứng từ', v: (r) => r.docNo }, { h: 'Chi nhánh', w: 60, center: true, v: (r) => r.branchCode },
      { h: 'Số tiền', w: 100, num: true, v: (r) => m(r.amount) }]} />,
    <CheckTable key="5" title={`5. Phiếu bán, trả lại không có hoá đơn${d.noInvoice.count ? ` — tổng ${m(d.noInvoice.total)} đ` : ''}`} count={d.noInvoice.count} ok="Không có" rows={d.noInvoice.rows} cols={docCols('Ghi chú')} />,
    <CheckTable key="6" title="6. Phiếu trả lại không nối được phiếu gốc" count={d.orphanReturns.count} ok="Không có" rows={d.orphanReturns.rows} cols={docCols('Ghi chú')} />,
    <CheckTable key="7" title="7. Chứng từ lệch bút toán" count={d.entryMismatch.count} ok="Khớp" rows={d.entryMismatch.rows} cols={docCols('Ghi chú')} />,
    <CheckTable key="8" title="8. Sổ tổng hợp lệch sổ chi tiết" count={d.balanceMismatch.count} ok="Khớp" rows={d.balanceMismatch.rows} cols={[
      { h: 'Ngày', w: 70, center: true, v: (r) => date(r.day) }, { h: 'Chi nhánh', w: 60, center: true, v: (r) => r.branchCode }, { h: 'Tài khoản', w: 70, center: true, v: (r) => r.accountCode },
      { h: 'Nợ (chi tiết)', num: true, v: (r) => m(r.lineDebit) }, { h: 'Nợ (tổng hợp)', num: true, v: (r) => m(r.balanceDebit) },
      { h: 'Có (chi tiết)', num: true, v: (r) => m(r.lineCredit) }, { h: 'Có (tổng hợp)', num: true, v: (r) => m(r.balanceCredit) }]} />,
  ];
  return (
    <div className="pd-ledger">
      <OrgHead ctx={ctx} branchCode={branchOf(s.branchCodes)} />
      <div className="pd-title" style={{ margin: '6px 0' }}><h1>BÁO CÁO KIỂM TRA CHỨNG TỪ, HOÁ ĐƠN</h1><div className="pd-date">Từ ngày {date(s.from)} đến ngày {date(s.to)}</div></div>
      {branchInfo(s.branchCodes).length > 0 && <Fields rows={branchInfo(s.branchCodes)} />}
      {sections}
      <Signs date={true} items={[{ title: 'Người lập biểu' }, { title: 'Kế toán trưởng' }]} />
      <Foot ctx={ctx} />
    </div>
  );
}

export const CHECKS_TEMPLATES: PrintTemplate<ChecksSheet>[] = [
  { id: 'kiemtra', name: 'Báo cáo kiểm tra chứng từ, hoá đơn', paper: 'A4L', source: 'rdlcBCChungTuCoXNCacBenLienQuan.rdlc', render: (s, ctx) => <ChecksDoc s={s} ctx={ctx} /> },
  screenTemplate<ChecksSheet>(),
];
