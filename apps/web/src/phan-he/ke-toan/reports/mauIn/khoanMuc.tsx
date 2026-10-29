/**
 * MẪU IN các báo cáo theo khoản mục, bộ phận, nhân viên, hợp đồng (DimensionReportPages.tsx):
 *   ACC47  Báo cáo chi tiết theo khoản mục (rdlcBCChiTietTheoKhoanMuc.rdlc; A4 ngang): từng dòng phát sinh, nhóm theo khoản mục, cộng từng khoản mục
 *   ACC69  Báo cáo tổng hợp theo bộ phận / nhân viên / hợp đồng / khoản mục (không có mẫu HTsoft; A4 dọc)
 *   ACC75  Sổ nhật ký chi tiền S03a2-DN (rdlcSoNhatKyChiTien.rdlc, rdlcSoNhatKyChiTien01.rdlc; A4 ngang): Ghi Có TK tiền | Ghi Nợ theo khoản mục | Tài khoản khác
 *   ACC90  Báo cáo chi phí theo tài khoản, khoản mục và chi nhánh (không có mẫu HTsoft; A4 ngang, mỗi chi nhánh một cột)
 */
import { date } from '@/lib/format';
import { LedgerForm, m, mb, screenTemplate, type LedgerCol, type PrintTemplate, type Row, type Sign } from '@/components/print';

const REPORT_SIGNS: Sign[] = [{ title: 'Người lập biểu' }, { title: 'Kế toán trưởng' }, { title: 'Giám đốc', note: '(Ký, họ tên, đóng dấu)' }];
const branchOf = (codes: string) => (codes && !codes.includes(',') ? codes : undefined);
const branchInfo = (codes: string): Row[] => (codes.includes(',') ? [['Chi nhánh', codes.split(',').join(', ')]] : []);
const codeName = (code: string, name: string) => (code ? `${code} ${name}` : '');

/* ------------------------------------------------------------------ ACC47 */
export interface ExpenseDetailPrintRow { date: string; docNo: string; invoiceNo: string; accountCode: string; counterAccounts: string; description: string; debit: number; credit: number; branchCode: string; costItemCode: string; costItemName: string; departmentCode: string; departmentName: string; employeeCode: string; employeeName: string; contractCode: string }
/** costItems / departments: mã đã lọc trên màn (trống = tất cả). */
export interface ExpenseDetailSheet { from: string; to: string; branchCodes: string; account: string; costItems: string; departments: string; rows: ExpenseDetailPrintRow[] }

export const EXPENSE_DETAIL_TEMPLATES: PrintTemplate<ExpenseDetailSheet>[] = [
  {
    id: 'ctkm', name: 'Báo cáo chi tiết theo khoản mục', paper: 'A4L', source: 'rdlcBCChiTietTheoKhoanMuc.rdlc',
    render: (s, ctx) => (
      <LedgerForm ctx={ctx} d={{
        title: 'BÁO CÁO CHI TIẾT THEO KHOẢN MỤC', branchCode: branchOf(s.branchCodes), from: s.from, to: s.to, signs: REPORT_SIGNS, total: 'Tổng cộng', rows: s.rows,
        info: [['Tài khoản', s.account], ...(s.costItems ? [['Khoản mục', s.costItems] as Row] : []), ...(s.departments ? [['Bộ phận', s.departments] as Row] : []), ...branchInfo(s.branchCodes)],
        groupBy: { key: (r) => r.costItemCode, label: (k, rs) => (k ? `Khoản mục: ${k} — ${rs[0]?.costItemName ?? ''}` : 'Chưa gắn khoản mục'), subtotal: 'Cộng khoản mục' },
        cols: [
          { key: 'ngay', h: 'Ngày', w: 62, center: true, v: (r) => date(r.date) },
          { key: 'so', h: 'Số chứng từ', w: 100, v: (r) => r.docNo },
          { key: 'tk', h: 'Tài khoản', w: 58, center: true, v: (r) => r.accountCode },
          { key: 'du', h: 'TK đối ứng', w: 62, center: true, v: (r) => r.counterAccounts },
          { key: 'dg', h: 'Diễn giải', v: (r) => r.description },
          { key: 'no', h: 'Nợ', group: 'Số phát sinh', w: 92, num: true, v: (r) => mb(r.debit), sum: (r) => r.debit },
          { key: 'co', h: 'Có', group: 'Số phát sinh', w: 92, num: true, v: (r) => mb(r.credit), sum: (r) => r.credit },
          { key: 'cn', h: 'Chi nhánh', w: 52, center: true, v: (r) => r.branchCode },
          { key: 'bp', h: 'Bộ phận', w: 110, v: (r) => codeName(r.departmentCode, r.departmentName) },
          { key: 'nv', h: 'Nhân viên', w: 110, v: (r) => codeName(r.employeeCode, r.employeeName) },
        ],
      }} />
    ),
  },
  screenTemplate<ExpenseDetailSheet>(),
];

/* ------------------------------------------------------------------ ACC69 */
export interface DimensionSumPrintRow { code: string; name: string; accountCode: string; accountName: string; debit: number; credit: number; net: number }
/** label: tên chiều đang xem (Bộ phận, Nhân viên, Hợp đồng, Khoản mục). */
export interface DimensionSumSheet { from: string; to: string; branchCodes: string; account: string; label: string; rows: DimensionSumPrintRow[] }

export const DIMENSION_SUM_TEMPLATES: PrintTemplate<DimensionSumSheet>[] = [
  {
    id: 'thdt', name: 'Báo cáo tổng hợp theo bộ phận, nhân viên, hợp đồng', paper: 'A4',
    render: (s, ctx) => (
      <LedgerForm ctx={ctx} d={{
        title: `BÁO CÁO TỔNG HỢP THEO ${s.label.toUpperCase()}`, branchCode: branchOf(s.branchCodes), from: s.from, to: s.to, signs: REPORT_SIGNS, total: 'Tổng cộng', rows: s.rows,
        info: [['Tài khoản', s.account || 'Tất cả'], ...branchInfo(s.branchCodes)],
        groupBy: { key: (r) => r.code, label: (k, rs) => (k ? `${s.label}: ${k} — ${rs[0]?.name ?? ''}` : `Chưa gắn ${s.label.toLowerCase()}`), subtotal: `Cộng ${s.label.toLowerCase()}` },
        cols: [
          { key: 'tk', h: 'Tài khoản', w: 66, center: true, v: (r) => r.accountCode },
          { key: 'ten', h: 'Tên tài khoản', v: (r) => r.accountName },
          { key: 'no', h: 'Nợ', group: 'Số phát sinh', w: 100, num: true, v: (r) => mb(r.debit), sum: (r) => r.debit },
          { key: 'co', h: 'Có', group: 'Số phát sinh', w: 100, num: true, v: (r) => mb(r.credit), sum: (r) => r.credit },
          { key: 'net', h: 'Nợ − Có', w: 100, num: true, v: (r) => m(r.net), sum: (r) => r.net },
        ],
      }} />
    ),
  },
  screenTemplate<DimensionSumSheet>(),
];

/* ------------------------------------------------------------------ ACC75 */
export interface CashItemPrintRow { date: string; docNo: string; branchCode: string; partnerName: string; description: string; cashAccount: string; total: number; byItem: Record<string, number>; other: number; otherAccounts: string }
/** items: các cột khoản mục máy chủ trả (mỗi khoản mục một cột Ghi Nợ). */
export interface CashItemSheet { from: string; to: string; branchCodes: string; account: string; items: { code: string; name: string }[]; rows: CashItemPrintRow[] }

export const CASH_ITEM_TEMPLATES: PrintTemplate<CashItemSheet>[] = [
  {
    id: 's03a2', name: 'Sổ nhật ký chi tiền S03a2-DN', paper: 'A4L', source: 'rdlcSoNhatKyChiTien.rdlc, rdlcSoNhatKyChiTien01.rdlc',
    render: (s, ctx) => (
      <LedgerForm ctx={ctx} d={{
        title: 'SỔ NHẬT KÝ CHI TIỀN', form: 'Mẫu số S03a2-DN', branchCode: branchOf(s.branchCodes), from: s.from, to: s.to, bookNote: true, total: 'Cộng', rows: s.rows,
        info: [['Tài khoản tiền', s.account || '111, 112, 113'], ...branchInfo(s.branchCodes)],
        signs: [{ title: 'Người ghi sổ' }, { title: 'Kế toán trưởng' }, { title: 'Người đại diện theo pháp luật', note: '(Ký, họ tên, đóng dấu)' }],
        cols: [
          { key: 'ngs', h: 'Ngày, tháng ghi sổ', w: 58, center: true, v: (r) => date(r.date) },
          { key: 'so', h: 'Số hiệu', group: 'Chứng từ', w: 92, v: (r) => r.docNo },
          { key: 'nct', h: 'Ngày, tháng', group: 'Chứng từ', w: 58, center: true, v: (r) => date(r.date) },
          { key: 'dg', h: 'Diễn giải', v: (r) => <>{r.description}{r.partnerName ? <i> — {r.partnerName}</i> : null}</> },
          { key: 'tkc', h: 'Ghi Có TK', w: 50, center: true, v: (r) => r.cashAccount },
          { key: 'tong', h: 'Số tiền chi', w: 92, num: true, v: (r) => m(r.total), sum: (r) => r.total },
          ...s.items.map((c): LedgerCol<CashItemPrintRow> => ({ key: `km-${c.code}`, h: c.name, group: 'Ghi Nợ theo khoản mục', w: 80, num: true, v: (r) => mb(r.byItem[c.code]), sum: (r) => r.byItem[c.code] ?? 0 })),
          { key: 'khac', h: 'Số tiền', group: 'Tài khoản khác', w: 84, num: true, v: (r) => mb(r.other), sum: (r) => r.other },
          { key: 'tkk', h: 'Số hiệu', group: 'Tài khoản khác', w: 60, center: true, v: (r) => r.otherAccounts },
        ],
      }} />
    ),
  },
  screenTemplate<CashItemSheet>(),
];

/* ------------------------------------------------------------------ ACC90 */
export interface ItemBranchPrintRow { accountCode: string; accountName: string; costItemCode: string; costItemName: string; departmentCode: string; departmentName: string; byBranch: Record<string, number>; total: number }
export interface ItemBranchSheet { from: string; to: string; branchCodes: string; account: string; byDepartment: string; branches: string[]; rows: ItemBranchPrintRow[] }

export const ITEM_BRANCH_TEMPLATES: PrintTemplate<ItemBranchSheet>[] = [
  {
    id: 'kmcn', name: 'Báo cáo chi phí theo khoản mục và chi nhánh', paper: 'A4L',
    render: (s, ctx) => (
      <LedgerForm ctx={ctx} d={{
        title: 'BÁO CÁO CHI PHÍ THEO TÀI KHOẢN, KHOẢN MỤC VÀ CHI NHÁNH', branchCode: branchOf(s.branchCodes), from: s.from, to: s.to, signs: REPORT_SIGNS, total: 'Tổng cộng', rows: s.rows,
        info: [['Tài khoản chi phí', s.account], ...branchInfo(s.branchCodes)],
        groupBy: { key: (r) => r.accountCode, label: (k, rs) => `Tài khoản ${k} — ${rs[0]?.accountName ?? ''}`, subtotal: 'Cộng tài khoản' },
        cols: [
          { key: 'km', h: 'Mã khoản mục', w: 70, center: true, v: (r) => r.costItemCode },
          { key: 'ten', h: 'Tên khoản mục', v: (r) => r.costItemName },
          ...(s.byDepartment === 'true' ? [{ key: 'bp', h: 'Bộ phận', w: 110, v: (r) => codeName(r.departmentCode, r.departmentName) } as LedgerCol<ItemBranchPrintRow>] : []),
          { key: 'tong', h: 'Cộng', w: 96, num: true, v: (r) => m(r.total), sum: (r) => r.total },
          ...s.branches.map((b): LedgerCol<ItemBranchPrintRow> => ({ key: `br-${b}`, h: b, group: 'Theo chi nhánh', w: 84, num: true, v: (r) => mb(r.byBranch[b]), sum: (r) => r.byBranch[b] ?? 0 })),
        ],
      }} />
    ),
  },
  screenTemplate<ItemBranchSheet>(),
];
