/**
 * MẪU IN Sổ nhật ký chung (ACC89) — mẫu S03a-DN theo rdlcSoNhatKyChung.rdlc (A4 ngang):
 * Ngày ghi sổ | Chứng từ (Số hiệu, Ngày tháng) | Diễn giải | Đã ghi sổ cái | STT dòng | Số hiệu TK | TK đối ứng | Số phát sinh (Nợ, Có); Tổng cộng.
 */
import { date } from '@/lib/format';
import { BOOK_SIGNS, LedgerForm, mb, screenTemplate, type PrintTemplate } from '@/components/print';

export interface NkcRow { postingDate: string; docDate: string; docNo: string; description: string; accountCode: string; counterAccounts: string; debit: number; credit: number; partnerName: string | null }
export interface NkcSheet { from: string; to: string; branchCodes: string; account: string; rows: NkcRow[] }

export const NKC_TEMPLATES: PrintTemplate<NkcSheet>[] = [
  {
    id: 's03a', name: 'Sổ nhật ký chung S03a-DN', paper: 'A4L', source: 'rdlcSoNhatKyChung.rdlc',
    render: (s, ctx) => (
      <LedgerForm ctx={ctx} d={{
        title: 'SỔ NHẬT KÝ CHUNG', form: 'Mẫu số S03a-DN', branchCode: s.branchCodes.includes(',') ? undefined : s.branchCodes || undefined, from: s.from, to: s.to,
        info: s.account ? [['Tài khoản', s.account]] : undefined, bookNote: true, signs: BOOK_SIGNS, total: 'Tổng cộng', rows: s.rows,
        cols: [
          { key: 'pd', h: 'Ngày, tháng ghi sổ', w: 64, center: true, v: (r) => date(r.postingDate) },
          { key: 'no', h: 'Số hiệu', group: 'Chứng từ', w: 92, v: (r) => r.docNo },
          { key: 'dd', h: 'Ngày, tháng', group: 'Chứng từ', w: 64, center: true, v: (r) => date(r.docDate) },
          { key: 'desc', h: 'Diễn giải', v: (r) => <>{r.description}{r.partnerName ? <i> — {r.partnerName}</i> : null}</> },
          { key: 'gc', h: 'Đã ghi sổ cái', w: 40, center: true, v: () => 'x' },
          { key: 'stt', h: 'STT dòng', w: 40, center: true, v: (_, i) => i + 1 },
          { key: 'tk', h: 'Số hiệu TK', w: 58, center: true, v: (r) => r.accountCode },
          { key: 'du', h: 'TK đối ứng', w: 70, center: true, v: (r) => r.counterAccounts },
          { key: 'n', h: 'Nợ', group: 'Số phát sinh', w: 92, num: true, v: (r) => mb(r.debit), sum: (r) => r.debit },
          { key: 'c', h: 'Có', group: 'Số phát sinh', w: 92, num: true, v: (r) => mb(r.credit), sum: (r) => r.credit },
        ],
      }} />
    ),
  },
  screenTemplate<NkcSheet>(),
];
