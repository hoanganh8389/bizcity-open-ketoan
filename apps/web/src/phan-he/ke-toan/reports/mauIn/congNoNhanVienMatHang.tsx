/**
 * MẪU IN báo cáo công nợ của DebtPages (A4 ngang):
 *   ACC48  Báo cáo công nợ theo nhân viên (HTsoft rptTKCongNoPhaiThuByNV.rpt — Crystal, bố cục theo màn):
 *          nhóm "Nhân viên: mã — tên" + dòng cộng nhân viên; mỗi dòng một đối tượng: Số dư đầu kỳ / Phát sinh / Số dư cuối kỳ (Nợ, Có).
 *          Màn bỏ tích "Chi tiết từng đối tượng" thì in mỗi nhân viên một dòng.
 *   ACC68  Báo cáo công nợ theo mặt hàng (HTsoft BcCongNoMatHang.rdlc theo từng hoá đơn; ở đây theo số liệu màn):
 *          theo đối tượng (nhóm đối tượng + dòng cộng, chi tiết mặt hàng) hoặc cộng theo mặt hàng:
 *          Mã hàng | Tên hàng | ĐVT | Còn nợ đầu kỳ | Bán (mua) chịu | Đã thu (trả) | Còn nợ cuối kỳ.
 */
import { LedgerForm, mb, screenTemplate, type LedgerCol, type PrintTemplate } from '@/components/print';
import { amountCols, branchInfo, oneBranch, REPORT_SIGNS, type Amounts } from './congNoChung';

/* ------------------------------------------------------------------ ACC48 */

export interface EmpDebtRow extends Amounts { employeeCode: string; employeeName: string; partnerCode: string; partnerName: string }
export interface EmpDebtSheet {
  from: string; to: string; account: string; branchCodes: string; employee: string;
  /** true: dòng là đối tượng, nhóm theo nhân viên; false: dòng là nhân viên (partnerName = "n đối tượng"). */
  byPartner: boolean; rows: EmpDebtRow[];
}

const empName = (r: EmpDebtRow) => (r.employeeCode ? `${r.employeeCode} — ${r.employeeName}` : '(Chưa gắn nhân viên)');

export const DEBT_EMPLOYEE_TEMPLATES: PrintTemplate<EmpDebtSheet>[] = [
  {
    id: 'cnnv', name: 'Báo cáo công nợ theo nhân viên', paper: 'A4L', source: 'rptTKCongNoPhaiThuByNV.rpt',
    render: (s, ctx) => {
      const cols: LedgerCol<EmpDebtRow>[] = s.byPartner ? [
        { key: 'stt', h: 'STT', w: 30, center: true, v: (_, i) => i + 1 },
        { key: 'ma', h: 'Mã đối tượng', w: 86, v: (r) => r.partnerCode },
        { key: 'ten', h: 'Tên đối tượng', v: (r) => r.partnerName },
        ...amountCols<EmpDebtRow>(88),
      ] : [
        { key: 'stt', h: 'STT', w: 30, center: true, v: (_, i) => i + 1 },
        { key: 'ma', h: 'Mã nhân viên', w: 80, v: (r) => r.employeeCode },
        { key: 'ten', h: 'Tên nhân viên', v: (r) => r.employeeName || '(Chưa gắn nhân viên)' },
        { key: 'sl', h: 'Số đối tượng', w: 70, center: true, v: (r) => r.partnerName },
        ...amountCols<EmpDebtRow>(88),
      ];
      return (
        <LedgerForm ctx={ctx} d={{
          title: 'BÁO CÁO CÔNG NỢ THEO NHÂN VIÊN', branchCode: oneBranch(s.branchCodes), from: s.from, to: s.to,
          info: [['Số tài khoản', s.account], ...(s.employee ? [['Nhân viên', s.employee] as [string, string]] : []), ...branchInfo(s.branchCodes, ctx)],
          cols, rows: s.rows, total: 'Tổng cộng', signs: REPORT_SIGNS,
          groupBy: s.byPartner ? { key: (r) => r.employeeCode, label: (_, rs) => <b>Nhân viên: {empName(rs[0]!)}</b>, subtotal: 'Cộng nhân viên' } : undefined,
        }} />
      );
    },
  },
  screenTemplate<EmpDebtSheet>(),
];

/* ------------------------------------------------------------------ ACC68 */

export interface ItemDebtRow { partnerCode: string; partnerName: string; sku: string; itemName: string; unit: string; opening: number; increase: number; decrease: number; closing: number }
export interface ItemDebtSheet { from: string; to: string; account: string; branchCodes: string; partnerName?: string; view: 'partner' | 'item'; rows: ItemDebtRow[] }

export const DEBT_ITEM_TEMPLATES: PrintTemplate<ItemDebtSheet>[] = [
  {
    id: 'cnmh', name: 'Báo cáo công nợ theo mặt hàng', paper: 'A4L', source: 'BcCongNoMatHang.rdlc',
    render: (s, ctx) => {
      const payable = s.account.startsWith('3');
      const money = (key: 'opening' | 'increase' | 'decrease' | 'closing', h: string): LedgerCol<ItemDebtRow> => ({ key, h, w: 100, num: true, v: (r) => mb(r[key]), sum: (r) => r[key] });
      const byPartner = s.view === 'partner';
      return (
        <LedgerForm ctx={ctx} d={{
          title: 'BÁO CÁO CÔNG NỢ THEO MẶT HÀNG', branchCode: oneBranch(s.branchCodes), from: s.from, to: s.to,
          info: [['Số tài khoản', s.account], ...(s.partnerName ? [['Đối tượng', s.partnerName] as [string, string]] : []), ...branchInfo(s.branchCodes, ctx)],
          rows: s.rows, total: 'Tổng cộng', signs: REPORT_SIGNS,
          groupBy: byPartner ? { key: (r) => r.partnerCode, label: (_, rs) => <b>{rs[0]!.partnerCode} — {rs[0]!.partnerName}</b>, subtotal: 'Cộng đối tượng' } : undefined,
          cols: [
            { key: 'stt', h: 'STT', w: 30, center: true, v: (_, i) => i + 1 },
            { key: 'sku', h: 'Mã hàng', w: 90, v: (r) => r.sku },
            { key: 'ten', h: 'Tên hàng', v: (r) => r.itemName },
            { key: 'dvt', h: 'ĐVT', w: 46, center: true, v: (r) => r.unit },
            money('opening', 'Còn nợ đầu kỳ'),
            money('increase', payable ? 'Mua chịu' : 'Bán chịu'),
            money('decrease', payable ? 'Đã trả' : 'Đã thu'),
            { ...money('closing', 'Còn nợ cuối kỳ'), v: (r) => <b>{mb(r.closing)}</b> },
          ],
        }} />
      );
    },
  },
  screenTemplate<ItemDebtSheet>(),
];
