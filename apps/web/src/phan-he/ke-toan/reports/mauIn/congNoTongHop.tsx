// [2026-11-11 Nguyễn Văn Thủy] Mẫu in tổng hợp công nợ theo mẫu quản trị: Mã, Tên, TK công nợ, đầu kỳ / phát sinh / cuối kỳ (đóng góp)
/**
 * MẪU IN Tổng hợp công nợ (ACC38 theo đối tượng, ACC38A phải thu khách hàng, ACC38B phải trả nhà cung cấp, ACC61 nội bộ), A4 ngang:
 *   Mã | Tên | TK công nợ | Số dư đầu kỳ (Nợ, Có) | Phát sinh (Nợ, Có) | Số dư cuối kỳ (Nợ, Có); Tổng cộng.
 *   Tách theo chi nhánh: nhóm "Chi nhánh: …" + dòng cộng chi nhánh.
 */
import { LedgerForm, screenTemplate, type LedgerCol, type PrintTemplate } from '@/components/print';
import { amountCols, branchInfo, oneBranch, REPORT_SIGNS, type Amounts } from './congNoChung';

export interface PartnerBalanceRow extends Amounts { accountCode: string; branchCode: string; partnerCode: string; partnerName: string }
/** Một báo cáo đã xem trên màn: điều kiện lọc + các dòng đang hiện (đã lọc nhóm, đối tượng). */
export interface PartnerBalanceSheet {
  title: string; who: string; from: string; to: string; branchCodes: string;
  /** '*' = tất cả TK công nợ. */
  account: string;
  byBranch: boolean;
  rows: PartnerBalanceRow[];
}

export const PARTNER_BALANCE_TEMPLATES: PrintTemplate<PartnerBalanceSheet>[] = [
  {
    id: 'thcn', name: 'Tổng hợp công nợ', paper: 'A4L',
    render: (s, ctx) => {
      const cols: LedgerCol<PartnerBalanceRow>[] = [
        { key: 'ma', h: `Mã ${s.who}`, w: 90, v: (r) => r.partnerCode },
        { key: 'ten', h: `Tên ${s.who}`, v: (r) => r.partnerName },
        { key: 'tk', h: 'TK công nợ', w: 56, center: true, v: (r) => r.accountCode },
        ...amountCols<PartnerBalanceRow>(),
      ];
      return (
        <LedgerForm ctx={ctx} d={{
          title: s.title.toUpperCase(), branchCode: oneBranch(s.branchCodes), from: s.from, to: s.to,
          info: [['Tài khoản', s.account === '*' ? 'Tất cả tài khoản công nợ' : s.account], ...branchInfo(s.branchCodes, ctx)],
          cols, rows: s.byBranch ? [...s.rows].sort((a, b) => a.branchCode.localeCompare(b.branchCode)) : s.rows,
          groupBy: s.byBranch ? { key: (r) => r.branchCode, label: (k) => <b>Chi nhánh: {ctx.branchName(k) || k}</b>, subtotal: 'Cộng chi nhánh' } : undefined,
          total: 'Tổng cộng', signs: REPORT_SIGNS,
        }} />
      );
    },
  },
  screenTemplate<PartnerBalanceSheet>(),
];
