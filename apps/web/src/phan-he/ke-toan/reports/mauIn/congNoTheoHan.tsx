/**
 * MẪU IN Sổ công nợ theo hạn thanh toán (ACC39) — "Báo cáo tổng hợp công nợ theo hạn thanh toán" theo rdlcBCCongNoTheoHTT.rdlc (A4 ngang):
 *   Ngày CT | Số CT | Khách hàng / Diễn giải | Nhân viên | Hạn TT (số ngày, ngày phải TT) | Dư đầu kỳ | PS Nợ | PS Có | Dư cuối kỳ
 *   + nhóm "Đã thanh toán" (Số, Ngày, Giá trị) như màn; dòng đối tượng in đậm, dòng phiếu thanh toán in nghiêng dưới chứng từ.
 */
import type { ReactNode } from 'react';
import { date } from '@/lib/format';
import { LedgerForm, m, mb, screenTemplate, type PrintTemplate } from '@/components/print';
import { branchInfo, oneBranch, REPORT_SIGNS } from './congNoChung';

export interface DebtTermRow {
  kind: 'partner' | 'doc' | 'pay'; partnerCode: string; partnerName: string; docDate: string; docNo: string; description: string; termDays: number | null; dueDate: string;
  opening: number; debit: number; credit: number; closing: number; payNo: string; payDate: string; payAmount: number; employeeName: string;
}
export interface DebtTermSheet {
  from: string; to: string; account: string; branchCodes: string; partnerName?: string;
  rows: DebtTermRow[]; totals: { opening: number; debit: number; credit: number; closing: number; payAmount: number };
}

const P = (r: DebtTermRow, x: ReactNode) => (r.kind === 'partner' ? <b>{x}</b> : x);

export const DEBT_TERM_TEMPLATES: PrintTemplate<DebtTermSheet>[] = [
  {
    id: 'htt', name: 'Báo cáo tổng hợp công nợ theo hạn thanh toán', paper: 'A4L', source: 'rdlcBCCongNoTheoHTT.rdlc',
    render: (s, ctx) => (
      <LedgerForm ctx={ctx} d={{
        title: 'BÁO CÁO TỔNG HỢP CÔNG NỢ THEO HẠN THANH TOÁN', branchCode: oneBranch(s.branchCodes), from: s.from, to: s.to,
        info: [['Số tài khoản', s.account], ...(s.partnerName ? [['Đối tượng', s.partnerName] as [string, string]] : []), ...branchInfo(s.branchCodes, ctx)],
        rows: s.rows, signs: REPORT_SIGNS, total: false,
        after: [{ label: 'Tổng cộng', cells: { dd: m(s.totals.opening), no: m(s.totals.debit), co: m(s.totals.credit), dc: m(s.totals.closing), tt: m(s.totals.payAmount) } }],
        cols: [
          { key: 'ngay', h: 'Ngày CT', w: 58, center: true, v: (r) => (r.kind === 'doc' && r.docDate ? date(r.docDate) : '') },
          { key: 'so', h: 'Số CT', w: 84, v: (r) => (r.kind === 'doc' ? r.docNo : '') },
          { key: 'dg', h: 'Khách hàng / Diễn giải', v: (r) => (r.kind === 'partner' ? <b>{r.partnerCode} — {r.partnerName}</b> : r.kind === 'doc' ? r.description : '') },
          { key: 'nv', h: 'Nhân viên', w: 90, v: (r) => (r.kind === 'doc' ? r.employeeName : '') },
          { key: 'han', h: 'Số ngày', group: 'Hạn TT', w: 38, center: true, v: (r) => (r.kind === 'doc' && r.termDays ? r.termDays : '') },
          { key: 'hantt', h: 'Ngày phải TT', group: 'Hạn TT', w: 58, center: true, v: (r) => (r.kind === 'doc' && r.dueDate ? date(r.dueDate) : '') },
          { key: 'dd', h: 'Dư đầu kỳ', w: 84, num: true, v: (r) => (r.kind === 'partner' ? <b>{mb(r.opening)}</b> : '') },
          { key: 'no', h: 'PS Nợ', w: 84, num: true, v: (r) => (r.kind === 'pay' ? '' : P(r, mb(r.debit))) },
          { key: 'co', h: 'PS Có', w: 84, num: true, v: (r) => (r.kind === 'pay' ? '' : P(r, mb(r.credit))) },
          { key: 'dc', h: 'Dư cuối kỳ', w: 84, num: true, v: (r) => (r.kind === 'partner' ? <b>{mb(r.closing)}</b> : '') },
          { key: 'tso', h: 'Số', group: 'Đã thanh toán', w: 76, v: (r) => (r.payNo ? <i>{r.payNo}</i> : '') },
          { key: 'tngay', h: 'Ngày', group: 'Đã thanh toán', w: 58, center: true, v: (r) => (r.payDate ? <i>{date(r.payDate)}</i> : '') },
          { key: 'tt', h: 'Giá trị', group: 'Đã thanh toán', w: 80, num: true, v: (r) => (r.payAmount ? <i>{mb(r.payAmount)}</i> : '') },
        ],
      }} />
    ),
  },
  screenTemplate<DebtTermSheet>(),
];
