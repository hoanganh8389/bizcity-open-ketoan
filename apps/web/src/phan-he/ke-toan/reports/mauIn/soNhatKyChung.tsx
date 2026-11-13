// [2026-11-11 Nguyễn Văn Thủy] Sổ nhật ký chung S03a-DN theo mẫu: Ngày hạch toán · Ngày chứng từ · Số chứng từ · Diễn giải · Tài khoản · TK đối ứng · Phát sinh Nợ / Có (đóng góp)
/**
 * MẪU IN Sổ nhật ký chung (ACC89) — mẫu S03a-DN, A4 ngang: cùng bộ cột với màn; Tổng cộng; ký Người lập biểu / Kế toán trưởng / Giám đốc.
 */
import { date } from '@/lib/format';
import { BOOK_SIGNS, LedgerForm, mb, screenTemplate, type PrintTemplate, type Sign } from '@/components/print';

export interface NkcRow { postingDate: string; docDate: string; docNo: string; description: string; accountCode: string; counterAccounts: string; debit: number; credit: number; partnerName: string | null }
export interface NkcSheet { from: string; to: string; branchCodes: string; account: string; rows: NkcRow[] }

const SIGNS: Sign[] = [{ title: 'Người lập biểu' }, ...BOOK_SIGNS.slice(1)];

export const NKC_TEMPLATES: PrintTemplate<NkcSheet>[] = [
  {
    id: 's03a', name: 'Sổ nhật ký chung S03a-DN', paper: 'A4L',
    render: (s, ctx) => (
      <LedgerForm ctx={ctx} d={{
        title: 'SỔ NHẬT KÝ CHUNG', form: 'Mẫu số: S03a-DN', branchCode: s.branchCodes.includes(',') ? undefined : s.branchCodes || undefined, from: s.from, to: s.to,
        info: s.account ? [['Tài khoản', s.account]] : undefined, bookNote: true, signs: SIGNS, total: 'Tổng cộng', rows: s.rows,
        cols: [
          { key: 'pd', h: 'Ngày hạch toán', w: 66, center: true, v: (r) => date(r.postingDate) },
          { key: 'dd', h: 'Ngày chứng từ', w: 66, center: true, v: (r) => date(r.docDate || r.postingDate) },
          { key: 'no', h: 'Số chứng từ', w: 92, v: (r) => r.docNo },
          { key: 'desc', h: 'Diễn giải', v: (r) => r.description },
          { key: 'tk', h: 'Tài khoản', w: 60, v: (r) => r.accountCode },
          { key: 'du', h: 'TK đối ứng', w: 66, v: (r) => r.counterAccounts },
          { key: 'n', h: 'Phát sinh Nợ', w: 96, num: true, v: (r) => mb(r.debit), sum: (r) => r.debit },
          { key: 'c', h: 'Phát sinh Có', w: 96, num: true, v: (r) => mb(r.credit), sum: (r) => r.credit },
        ],
      }} />
    ),
  },
  screenTemplate<NkcSheet>(),
];
