/**
 * MẪU IN bảng cân đối số phát sinh và báo cáo tài chính:
 *   ACC10  Bảng cân đối số phát sinh S06-DN (BangCDSPS.rdlc, A4 ngang)
 *   ACC8   Báo cáo tình hình tài chính B01-DN (BangCanDoiKeToan.rdlc, A4 dọc)
 *   ACC9   Báo cáo kết quả hoạt động kinh doanh B02-DN (BangKQHDKD.rdlc, A4 dọc)
 * Chữ ký báo cáo: Người lập biểu, Kế toán trưởng, Giám đốc; dòng tổng hợp in đậm.
 */
import type { ReactNode } from 'react';
import { date } from '@/lib/format';
import { LedgerForm, m, mb, screenTemplate, type PrintTemplate, type Row, type Sign } from '@/components/print';

const REPORT_SIGNS: Sign[] = [{ title: 'Người lập biểu' }, { title: 'Kế toán trưởng' }, { title: 'Giám đốc', note: '(Ký, họ tên, đóng dấu)' }];
const branchOf = (codes: string) => (codes && !codes.includes(',') ? codes : undefined);
const B = ({ on, children }: { on: boolean; children: ReactNode }) => (on ? <b>{children}</b> : <>{children}</>);
const sub = (t: string) => <div style={{ fontWeight: 400, fontSize: '0.9em' }}>{t}</div>;

/* ------------------------------------------------------------------ ACC10 */
export interface TbRow { code: string; name: string; level: number; isPosting: boolean; openingDebit: number; openingCredit: number; debit: number; credit: number; closingDebit: number; closingCredit: number }
export interface TbSheet { from: string; to: string; branchCodes: string; account: string; rows: TbRow[] }
const TB_KEYS = ['openingDebit', 'openingCredit', 'debit', 'credit', 'closingDebit', 'closingCredit'] as const;

/** Bảng cân đối số phát sinh: tài khoản tổng hợp in đậm, dòng Tổng cộng chỉ cộng tài khoản chi tiết (như màn). */
const trialBalance: PrintTemplate<TbSheet> = {
  id: 's06', name: 'Bảng cân đối số phát sinh S06-DN', paper: 'A4L', source: 'BangCDSPS.rdlc',
  render: (s, ctx) => {
    const posting = s.rows.filter((r) => r.isPosting);
    const tot = Object.fromEntries(TB_KEYS.map((k) => [k, m(posting.reduce((a, r) => a + Math.round(r[k] * 100), 0) / 100)]));
    const money = (k: (typeof TB_KEYS)[number], group: string, h: string) => ({ key: k, h, group, w: 98, num: true, v: (r: TbRow) => <B on={!r.isPosting}>{mb(r[k])}</B> });
    return (
      <LedgerForm ctx={ctx} d={{
        title: 'BẢNG CÂN ĐỐI SỐ PHÁT SINH', form: 'Mẫu số S06-DN', branchCode: branchOf(s.branchCodes), from: s.from, to: s.to,
        info: s.account ? [['Nhánh tài khoản', s.account]] : undefined, rows: s.rows, signs: REPORT_SIGNS, total: false,
        after: [{ label: 'Tổng cộng', cells: tot }],
        cols: [
          { key: 'code', h: 'Số hiệu TK', w: 60, v: (r) => <B on={!r.isPosting}>{r.code}</B> },
          { key: 'name', h: 'Tên tài khoản', v: (r) => <span style={{ paddingLeft: Math.min(Math.max(r.level - 1, 0), 4) * 8 }}><B on={!r.isPosting}>{r.name}</B></span> },
          money('openingDebit', 'Số dư đầu kỳ', 'Nợ'), money('openingCredit', 'Số dư đầu kỳ', 'Có'),
          money('debit', 'Số phát sinh trong kỳ', 'Nợ'), money('credit', 'Số phát sinh trong kỳ', 'Có'),
          money('closingDebit', 'Số dư cuối kỳ', 'Nợ'), money('closingCredit', 'Số dư cuối kỳ', 'Có'),
        ],
      }} />
    );
  },
};
export const TRIAL_BALANCE_TEMPLATES: PrintTemplate<TbSheet>[] = [trialBalance, screenTemplate<TbSheet>()];

/* ------------------------------------------------------------------ ACC8 */
export interface BsRow { code: string; name: string; level: number; section: 'assets' | 'sources'; closing: number; opening: number }
export interface BsSheet { from: string; to: string; branchCodes: string; asOf: string; openingAsOf: string; rows: BsRow[] }

/** Báo cáo tình hình tài chính B01-DN: hai phần Tài sản / Nguồn vốn, chỉ tiêu cấp 1–2 in đậm (in đúng các dòng màn đang hiện). */
const balanceSheet: PrintTemplate<BsSheet> = {
  id: 'b01', name: 'Báo cáo tình hình tài chính B01-DN', paper: 'A4', source: 'BangCanDoiKeToan.rdlc',
  render: (s, ctx) => (
    <LedgerForm ctx={ctx} d={{
      title: 'BÁO CÁO TÌNH HÌNH TÀI CHÍNH', form: 'Mẫu số B01-DN', branchCode: branchOf(s.branchCodes), period: `Tại ngày ${date(s.asOf)}`,
      info: [['Đơn vị tính', 'Đồng']], rows: s.rows, signs: REPORT_SIGNS, total: false,
      groupBy: { key: (r) => r.section, label: (k) => (k === 'assets' ? 'TÀI SẢN' : 'NGUỒN VỐN') },
      cols: [
        { key: 'ct', h: 'Chỉ tiêu', v: (r) => <span style={{ paddingLeft: Math.max(r.level - 1, 0) * 10 }}><B on={r.level <= 2}>{r.name}</B></span> },
        { key: 'ma', h: 'Mã số', w: 44, center: true, v: (r) => <B on={r.level <= 2}>{r.code}</B> },
        { key: 'tm', h: 'Thuyết minh', w: 56, center: true, v: () => '' },
        { key: 'ck', h: <>Số cuối kỳ{sub(date(s.asOf))}</>, w: 104, num: true, v: (r) => (r.level <= 2 ? <b>{m(r.closing)}</b> : mb(r.closing)) },
        { key: 'dk', h: <>Số đầu kỳ{sub(`trước ${date(s.openingAsOf)}`)}</>, w: 104, num: true, v: (r) => (r.level <= 2 ? <b>{m(r.opening)}</b> : mb(r.opening)) },
      ],
    }} />
  ),
};
export const BALANCE_SHEET_TEMPLATES: PrintTemplate<BsSheet>[] = [balanceSheet, screenTemplate<BsSheet>()];

/* ------------------------------------------------------------------ ACC9 */
export interface IsRow { code: string; name: string; note: string; bold: boolean; current: number; previous: number }
export interface IsSheet { branchCodes: string; period: { from: string; to: string }; previous: { from: string; to: string }; rows: IsRow[] }

/** Báo cáo kết quả hoạt động kinh doanh B02-DN: kỳ này và cùng kỳ năm trước. */
const incomeStatement: PrintTemplate<IsSheet> = {
  id: 'b02', name: 'Báo cáo kết quả hoạt động kinh doanh B02-DN', paper: 'A4', source: 'BangKQHDKD.rdlc',
  render: (s, ctx) => (
    <LedgerForm ctx={ctx} d={{
      title: 'BÁO CÁO KẾT QUẢ HOẠT ĐỘNG KINH DOANH', form: 'Mẫu số B02-DN', branchCode: branchOf(s.branchCodes), from: s.period.from, to: s.period.to,
      info: [['Đơn vị tính', 'Đồng']] as Row[], rows: s.rows, signs: REPORT_SIGNS, total: false,
      cols: [
        { key: 'ct', h: 'Chỉ tiêu', v: (r) => <span style={{ whiteSpace: 'pre-wrap' }}><B on={r.bold}>{r.name}</B></span> },
        { key: 'ma', h: 'Mã số', w: 44, center: true, v: (r) => <B on={r.bold}>{r.code}</B> },
        { key: 'tm', h: 'Thuyết minh', w: 60, center: true, v: (r) => r.note },
        { key: 'kn', h: <>Kỳ này{sub(`${date(s.period.from)} – ${date(s.period.to)}`)}</>, w: 108, num: true, v: (r) => <B on={r.bold}>{mb(r.current)}</B> },
        { key: 'kt', h: <>Cùng kỳ năm trước{sub(`${date(s.previous.from)} – ${date(s.previous.to)}`)}</>, w: 108, num: true, v: (r) => <B on={r.bold}>{mb(r.previous)}</B> },
      ],
    }} />
  ),
};
export const INCOME_STATEMENT_TEMPLATES: PrintTemplate<IsSheet>[] = [incomeStatement, screenTemplate<IsSheet>()];
