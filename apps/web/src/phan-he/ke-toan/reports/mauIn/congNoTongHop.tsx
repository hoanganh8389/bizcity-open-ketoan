/**
 * MẪU IN Sổ tổng hợp công nợ phát sinh (ACC38) và Báo cáo công nợ nội bộ (ACC61) — màn PartnerBalancesPage, A4 ngang:
 *   STT | Mã KH/NCC | Tên KH/NCC | Số dư đầu kỳ (Nợ, Có) | Phát sinh (Nợ, Có) | Số dư cuối kỳ (Nợ, Có); TỔNG CỘNG.
 *   Tổng các CN      BCSoTongHopCongNo.rdlc / BCSoTongHopCongNo0.rdlc / BCSoTongHopCongNo2.rdlc (cùng bố cục);
 *   Chi tiết từng CN BCSoTongHopCongNo1.rdlc / BCSoTongHopCongNo3.rdlc: nhóm "Chi nhánh: …" + "Tổng cộng chi nhánh".
 * Xem tất cả TK công nợ: nhóm theo tài khoản, có dòng cộng tài khoản (trừ kiểu "Bỏ tổng hợp").
 * ACC61 (HTsoft rdlcBCSoChiTietCongNoNBKeToan.rdlc là sổ chi tiết theo chứng từ — màn này chỉ có số tổng hợp nên in theo bố cục tổng hợp).
 */
import { LedgerForm, screenTemplate, type LedgerCol, type LedgerData, type PrintTemplate } from '@/components/print';
import { amountCols, branchInfo, oneBranch, REPORT_SIGNS, type Amounts } from './congNoChung';

export interface PartnerBalanceRow extends Amounts { accountCode: string; branchCode: string; partnerCode: string; partnerName: string }
/** Một báo cáo đã xem trên màn: điều kiện lọc + các dòng đang hiện (đã lọc nhóm, đối tượng). */
export interface PartnerBalanceSheet {
  code: string; title: string; from: string; to: string; branchCodes: string;
  /** '*' = tất cả TK công nợ. */
  account: string; accountNames: Record<string, string>;
  /** Kiểu báo cáo của màn: tách theo chi nhánh, bỏ dòng tổng hợp. */
  byBranch: boolean; noSubtotal: boolean;
  rows: PartnerBalanceRow[];
}

const internal = (s: PartnerBalanceSheet) => s.code === 'ACC61';
const accText = (s: PartnerBalanceSheet, code: string) => `${code}${s.accountNames[code] ? ` — ${s.accountNames[code]}` : ''}`;

/** Số liệu đang tách theo chi nhánh mà in tổng các CN: cộng các chi nhánh của cùng tài khoản + đối tượng. */
function mergeBranches(rows: PartnerBalanceRow[]): PartnerBalanceRow[] {
  const map = new Map<string, PartnerBalanceRow>();
  for (const r of rows) {
    const k = `${r.accountCode}|${r.partnerCode}`;
    const x = map.get(k);
    if (!x) { map.set(k, { ...r, branchCode: '' }); continue; }
    x.openingDebit += r.openingDebit; x.openingCredit += r.openingCredit; x.debit += r.debit; x.credit += r.credit; x.closingDebit += r.closingDebit; x.closingCredit += r.closingCredit;
  }
  return [...map.values()];
}

function sheet(s: PartnerBalanceSheet, byBranch: boolean): LedgerData<PartnerBalanceRow> {
  const all = s.account === '*';
  const rows = s.byBranch && !byBranch ? mergeBranches(s.rows) : s.rows;
  const nb = internal(s);
  // Nhóm: tài khoản (khi xem tất cả TK) và / hoặc chi nhánh (kiểu chi tiết từng CN).
  const grouped = !s.noSubtotal && (all || byBranch);
  const cols: LedgerCol<PartnerBalanceRow>[] = [
    { key: 'stt', h: 'STT', w: 34, center: true, v: (_, i) => i + 1 },
    { key: 'ma', h: nb ? 'Mã đối tượng' : 'Mã KH/NCC', w: 90, v: (r) => r.partnerCode },
    { key: 'ten', h: nb ? 'Tên đối tượng (chi nhánh đối ứng)' : 'Tên KH/NCC', v: (r) => r.partnerName },
    ...(all && !grouped ? [{ key: 'tk', h: 'TK', w: 50, center: true, v: (r: PartnerBalanceRow) => r.accountCode }] : []),
    ...(byBranch && !grouped ? [{ key: 'cn', h: 'Chi nhánh', w: 60, center: true, v: (r: PartnerBalanceRow) => r.branchCode }] : []),
    ...amountCols<PartnerBalanceRow>(),
  ];
  const groupLabel = (r: PartnerBalanceRow) => [all ? `Tài khoản ${accText(s, r.accountCode)}` : '', byBranch ? `Chi nhánh: ${r.branchCode}` : ''].filter(Boolean).join(' · ');
  return {
    title: nb ? 'BÁO CÁO CÔNG NỢ NỘI BỘ' : 'SỔ TỔNG HỢP CÔNG NỢ PHÁT SINH', branchCode: oneBranch(s.branchCodes), from: s.from, to: s.to,
    info: [['Số tài khoản', all ? 'Tất cả tài khoản công nợ' : accText(s, s.account)]],
    cols, rows: grouped ? [...rows].sort((a, b) => (all ? a.accountCode.localeCompare(b.accountCode) : 0) || (byBranch ? a.branchCode.localeCompare(b.branchCode) : 0)) : rows,
    groupBy: grouped ? {
      key: (r) => `${all ? r.accountCode : ''}|${byBranch ? r.branchCode : ''}`,
      label: (_, rs) => <b>{groupLabel(rs[0]!)}</b>,
      subtotal: byBranch && !all ? 'Tổng cộng chi nhánh' : all && !byBranch ? 'Cộng tài khoản' : 'Cộng',
    } : undefined,
    total: 'TỔNG CỘNG', signs: REPORT_SIGNS,
  };
}

const tongHop = (byBranch: boolean, nb: boolean): PrintTemplate<PartnerBalanceSheet> => ({
  id: byBranch ? 'thcn-cn' : 'thcn',
  name: `${nb ? 'Báo cáo công nợ nội bộ' : 'Sổ tổng hợp công nợ phát sinh'}${byBranch ? ' — chi tiết từng chi nhánh' : ' — tổng các chi nhánh'}`,
  paper: 'A4L', source: byBranch ? 'BCSoTongHopCongNo1.rdlc' : 'BCSoTongHopCongNo.rdlc',
  render: (s, ctx) => {
    const d = sheet(s, byBranch);
    return <LedgerForm ctx={ctx} d={{ ...d, info: [...(d.info ?? []), ...branchInfo(s.branchCodes, ctx)] }} />;
  },
});

/** Mẫu của màn: số liệu tách theo chi nhánh (kiểu "chi tiết từng CN") thì có thêm mẫu theo chi nhánh, đứng đầu. */
export function partnerBalanceTemplates(code: string, byBranch: boolean): PrintTemplate<PartnerBalanceSheet>[] {
  const nb = code === 'ACC61';
  const own = byBranch ? [tongHop(true, nb), tongHop(false, nb)] : [tongHop(false, nb)];
  return [...own, screenTemplate<PartnerBalanceSheet>()];
}
