/**
 * MẪU IN ba báo cáo tổng hợp (SummaryPages.tsx):
 *   ACC63  Báo cáo tổng hợp chứng từ (rdlcBangTongHopChungTu.rdlc, A4 dọc): các cột tách theo như màn | TK Nợ | TK Có | Số tiền
 *   ACC80  Bảng kê số dư tiền (rdlcLoadBangKeSoDuTien.rdlc, A4 ngang): nhóm theo chi nhánh, đầu kỳ / Nợ / Có / cuối kỳ
 *   ACC91  Bảng tổng hợp thuế GTGT (rdlcLoadTongHopThue.rdlc, A4 ngang): mỗi chi nhánh, mỗi tháng một dòng
 */
import { DOC_TYPE_LABELS, type DocType } from '@ketoan/contracts';
import { LedgerForm, m, mb, screenTemplate, type LedgerCol, type PrintTemplate, type Sign } from '@/components/print';

const REPORT_SIGNS: Sign[] = [{ title: 'Người lập biểu' }, { title: 'Kế toán trưởng' }, { title: 'Giám đốc', note: '(Ký, họ tên, đóng dấu)' }];
const branchOf = (codes: string) => (codes && !codes.includes(',') ? codes : undefined);
const branchInfo = (codes: string): [string, string][] => (codes.includes(',') ? [['Chi nhánh', codes.split(',').join(', ')]] : []);
const monthText = (v: string) => v.replace(/^(\d{4})(\d{2})$/, '$2/$1');

/* ------------------------------------------------------------------ ACC63 */
export interface PostingPrintRow { branchCode: string; month: string; docType: string; costItem: string; reasonCode: string; debitAccount: string; creditAccount: string; amount: number; entries: number }
/** groups: các cột "Tách theo" đang chọn trên màn (branch, month, docType, costItem, reason). */
export interface PostingSheet { from: string; to: string; branchCodes: string; docType: string; groups: string; rows: PostingPrintRow[] }

const POSTING_HEAD: Record<string, string> = { branch: 'Chi nhánh', month: 'Tháng', docType: 'Loại chứng từ', costItem: 'Mã KM', reason: 'Mã lý do' };
const postingCell = (r: PostingPrintRow, k: string) => (k === 'branch' ? r.branchCode : k === 'month' ? monthText(r.month) : k === 'docType' ? DOC_TYPE_LABELS[r.docType as DocType] ?? r.docType : k === 'costItem' ? r.costItem : r.reasonCode);

export const POSTING_TEMPLATES: PrintTemplate<PostingSheet>[] = [
  {
    id: 'thcl', name: 'Báo cáo tổng hợp chứng từ', paper: 'A4', source: 'rdlcBangTongHopChungTu.rdlc',
    render: (s, ctx) => {
      const on = s.groups.split(',').filter(Boolean);
      const lead = ['branch', 'month', 'docType'].filter((k) => on.includes(k));
      const tail = ['costItem', 'reason'].filter((k) => on.includes(k));
      const dim = (k: string): LedgerCol<PostingPrintRow> => ({ key: k, h: POSTING_HEAD[k], w: k === 'docType' ? 110 : 62, center: k !== 'docType', v: (r) => postingCell(r, k) });
      return (
        <LedgerForm ctx={ctx} d={{
          title: 'BÁO CÁO TỔNG HỢP CHỨNG TỪ', branchCode: branchOf(s.branchCodes), from: s.from, to: s.to, signs: REPORT_SIGNS, total: 'Tổng cộng', rows: s.rows,
          info: [...branchInfo(s.branchCodes), ...(s.docType ? [['Loại chứng từ', DOC_TYPE_LABELS[s.docType as DocType] ?? s.docType] as [string, string]] : [])],
          cols: [
            { key: 'stt', h: 'STT', w: 30, center: true, v: (_, i) => i + 1 },
            ...lead.map(dim),
            { key: 'no', h: 'TK Nợ', w: 62, center: true, v: (r) => r.debitAccount },
            { key: 'co', h: 'TK Có', w: 62, center: true, v: (r) => r.creditAccount },
            ...tail.map(dim),
            { key: 'tien', h: 'Số tiền', num: true, v: (r) => m(r.amount), sum: (r) => r.amount },
            { key: 'bt', h: 'Số bút toán', w: 56, num: true, v: (r) => mb(r.entries), sum: (r) => r.entries },
          ],
        }} />
      );
    },
  },
  screenTemplate<PostingSheet>(),
];

/* ------------------------------------------------------------------ ACC80 */
export interface CashBalanceRow { branchCode: string; branchName: string; accountCode: string; accountName: string; opening: number; debit: number; credit: number; closing: number }
export interface CashBalanceSheet { from: string; to: string; branchCodes: string; accounts: string; rows: CashBalanceRow[] }

export const CASH_BALANCE_TEMPLATES: PrintTemplate<CashBalanceSheet>[] = [
  {
    id: 'sodutien', name: 'Bảng kê số dư tiền', paper: 'A4L', source: 'rdlcLoadBangKeSoDuTien.rdlc',
    render: (s, ctx) => (
      <LedgerForm ctx={ctx} d={{
        title: 'BẢNG KÊ SỐ DƯ TIỀN', branchCode: branchOf(s.branchCodes), from: s.from, to: s.to, signs: REPORT_SIGNS, total: 'Tổng cộng', rows: s.rows,
        info: [['Tài khoản tiền', s.accounts.split(',').join(', ')], ...branchInfo(s.branchCodes)],
        groupBy: { key: (r) => r.branchCode, label: (k, rs) => `Chi nhánh: ${k} — ${rs[0]?.branchName ?? ''}`, subtotal: 'Cộng chi nhánh' },
        cols: [
          { key: 'tk', h: 'Mã', w: 80, center: true, v: (r) => r.accountCode },
          { key: 'ten', h: 'Tên ngân hàng / quỹ tiền', v: (r) => r.accountName },
          { key: 'dau', h: 'Số dư đầu kỳ', w: 120, num: true, v: (r) => m(r.opening), sum: (r) => r.opening },
          { key: 'no', h: 'Phát sinh Nợ', w: 120, num: true, v: (r) => mb(r.debit), sum: (r) => r.debit },
          { key: 'co', h: 'Phát sinh Có', w: 120, num: true, v: (r) => mb(r.credit), sum: (r) => r.credit },
          { key: 'cuoi', h: 'Số dư cuối kỳ', w: 120, num: true, v: (r) => m(r.closing), sum: (r) => r.closing },
        ],
      }} />
    ),
  },
  screenTemplate<CashBalanceSheet>(),
];

/* ------------------------------------------------------------------ ACC91 */
export interface TaxSummaryRow { branchCode: string; branchName: string; month: string; invoices: number; carried: number; inputTax: number; revenue: number; outputTax: number; payable: number }
export interface TaxSummarySheet { from: string; to: string; branchCodes: string; rows: TaxSummaryRow[] }

export const TAX_SUMMARY_TEMPLATES: PrintTemplate<TaxSummarySheet>[] = [
  {
    id: 'thgtgt', name: 'Bảng tổng hợp thuế GTGT', paper: 'A4L', source: 'rdlcLoadTongHopThue.rdlc',
    render: (s, ctx) => (
      <LedgerForm ctx={ctx} d={{
        title: 'BẢNG TỔNG HỢP THUẾ GTGT', branchCode: branchOf(s.branchCodes), from: s.from, to: s.to, info: branchInfo(s.branchCodes), signs: REPORT_SIGNS, total: 'Tổng cộng', rows: s.rows,
        cols: [
          { key: 'stt', h: 'STT', w: 30, center: true, v: (_, i) => i + 1 },
          { key: 'cn', h: 'Mã CN', w: 54, center: true, v: (r) => r.branchCode },
          { key: 'ten', h: 'Tên chi nhánh', v: (r) => r.branchName },
          { key: 'thang', h: 'Tháng', w: 56, center: true, v: (r) => monthText(r.month) },
          { key: 'kt', h: 'Thuế GTGT còn được khấu trừ kỳ trước chuyển sang', w: 110, num: true, v: (r) => mb(r.carried), sum: (r) => r.carried },
          { key: 'vao', h: 'Thuế GTGT mua vào được khấu trừ kỳ này', w: 110, num: true, v: (r) => mb(r.inputTax), sum: (r) => r.inputTax },
          { key: 'dt', h: 'Doanh thu bán ra trong kỳ', w: 120, num: true, v: (r) => mb(r.revenue), sum: (r) => r.revenue },
          { key: 'ra', h: 'Thuế GTGT HHDV bán ra trong kỳ', w: 110, num: true, v: (r) => mb(r.outputTax), sum: (r) => r.outputTax },
          { key: 'nop', h: 'Thuế GTGT phải nộp trong kỳ', w: 110, num: true, v: (r) => m(r.payable), sum: (r) => r.payable },
        ],
      }} />
    ),
  },
  screenTemplate<TaxSummarySheet>(),
];
