// [2026-11-11 Nguyễn Văn Thủy] Báo cáo tiền gửi: Bảng kê số dư ngân hàng (ACC96), Sổ chi tiết chuyển tiền nội bộ (ACC97) (đóng góp)
/**
 * Báo cáo tiền gửi dựng từ số liệu sổ có sẵn, không thêm bảng:
 *   BankBalancesPage        Bảng kê số dư ngân hàng (ACC96): STT · Tài khoản ngân hàng · Tên ngân hàng · Chi nhánh · Số dư đầu kỳ ·
 *                           Phát sinh Nợ · Phát sinh Có · Số dư cuối kỳ. Số liệu: /reports/cash-balances (tài khoản 112), ghép danh mục
 *                           tài khoản ngân hàng theo tài khoản kế toán.
 *   InternalTransferPage    Sổ chi tiết chuyển tiền nội bộ (ACC97): mỗi cặp Nợ / Có của chứng từ chuyển tiền nội bộ một dòng —
 *                           tài khoản đi (bên Có), tài khoản đến (bên Nợ). Số liệu: /reports/voucher-listing (docType cash_transfer).
 * Nhiều chi nhánh (lớp gắn thêm): chọn chi nhánh; cột Đơn vị hiện khi có từ 2 chi nhánh.
 */
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api, errorText } from '@/lib/api';
import { date, defaultTo, kyText, periodFrom } from '@/lib/format';
import { PageHeader } from '@/components/PageHeader';
import { FilterLayout } from '@/components/ReportPanel';
import { BranchSelect, DateRange, useBranches } from '@/components/filters';
import { Empty, ErrorBox, Loading } from '@/components/ui';
import { DataGrid, type Column } from '@/components/DataGrid';
import { LedgerForm, m, mb, screenTemplate, PrintButton, type PrintTemplate, type Sign } from '@/components/print';
import { useBankAccounts, type BankAccount } from '../../../features/catalog/BankAccountsPage';

const SIGNS: Sign[] = [{ title: 'Người lập biểu' }, { title: 'Kế toán trưởng' }, { title: 'Giám đốc', note: '(Ký, họ tên, đóng dấu)' }];
/** Tài khoản ngân hàng theo tài khoản kế toán (mã gắn trên danh mục tài khoản ngân hàng). */
const bankOf = (banks: BankAccount[], acc: string) => banks.find((b) => b.accountCode === acc);

/* ------------------------------------------------------------------ ACC96 */
interface BalRow { branchCode: string; branchName: string; accountCode: string; accountName: string; opening: number; debit: number; credit: number; closing: number }
interface BankRow extends BalRow { stt: number; accountNo: string; bankName: string; bankBranch: string }
interface BankSheet { from: string; to: string; rows: BankRow[]; multi: boolean }

const BANK_TEMPLATES: PrintTemplate<BankSheet>[] = [
  {
    id: 'bkndnh', name: 'Bảng kê số dư ngân hàng', paper: 'A4',
    render: (s, ctx) => (
      <LedgerForm ctx={ctx} d={{
        title: 'BẢNG KÊ SỐ DƯ NGÂN HÀNG', period: `Tài khoản: 112; Loại tiền: VND; ${kyText(s.from, s.to)}`, signs: SIGNS, total: 'Tổng cộng', rows: s.rows,
        cols: [
          { key: 'stt', h: 'STT', w: 34, center: true, v: (r) => r.stt },
          { key: 'so', h: 'Tài khoản ngân hàng', w: 110, v: (r) => r.accountNo },
          { key: 'nh', h: 'Tên ngân hàng', v: (r) => r.bankName },
          { key: 'cn', h: 'Chi nhánh', w: 110, v: (r) => r.bankBranch },
          ...(s.multi ? [{ key: 'dv', h: 'Đơn vị', w: 70, center: true, v: (r: BankRow) => r.branchCode }] : []),
          { key: 'dau', h: 'Số dư đầu kỳ', w: 96, num: true, v: (r) => m(r.opening), sum: (r) => r.opening },
          { key: 'no', h: 'Phát sinh Nợ', w: 96, num: true, v: (r) => mb(r.debit), sum: (r) => r.debit },
          { key: 'co', h: 'Phát sinh Có', w: 96, num: true, v: (r) => mb(r.credit), sum: (r) => r.credit },
          { key: 'cuoi', h: 'Số dư cuối kỳ', w: 96, num: true, v: (r) => m(r.closing), sum: (r) => r.closing },
        ],
      }} />
    ),
  },
  screenTemplate<BankSheet>(),
];

export function BankBalancesPage() {
  const { data: branchList = [] } = useBranches();
  const multi = branchList.length > 1;
  const banks = useBankAccounts().data ?? [];
  const [f, setF] = useState({ from: periodFrom(), to: defaultTo(), branchCodes: '' });
  const set = (p: Partial<typeof f>) => setF((x) => ({ ...x, ...p }));
  const q = useQuery({ queryKey: ['cash-balances', 'ngan-hang', f], queryFn: () => api.get<{ rows: BalRow[] }>('/api/v1/reports/cash-balances', { ...f, accounts: '112' }) });
  const rows: BankRow[] = (q.data?.rows ?? []).map((r, i) => {
    const b = bankOf(banks, r.accountCode);
    return { ...r, stt: i + 1, accountNo: b?.accountNo ?? r.accountCode, bankName: b?.bankName ?? r.accountName, bankBranch: b?.bankBranch ?? '' };
  });
  const columns: Column<BankRow>[] = [
    { key: 'stt', header: 'STT', type: 'number', width: 60 },
    { key: 'accountNo', header: 'Tài khoản ngân hàng', type: 'code', width: 160 },
    { key: 'bankName', header: 'Tên ngân hàng', width: 260 },
    { key: 'bankBranch', header: 'Chi nhánh', width: 160 },
    { key: 'branchCode', header: 'Đơn vị', title: 'Chi nhánh của công ty', type: 'code', width: 90, hidden: !multi },
    { key: 'opening', header: 'Số dư đầu kỳ', type: 'money', sum: true, showZero: true, width: 140 },
    { key: 'debit', header: 'Phát sinh Nợ', type: 'money', sum: true, width: 140 },
    { key: 'credit', header: 'Phát sinh Có', type: 'money', sum: true, width: 140 },
    { key: 'closing', header: 'Số dư cuối kỳ', type: 'money', sum: true, showZero: true, width: 140 },
    { key: 'accountCode', header: 'Tài khoản kế toán', type: 'code', width: 110, hidden: true },
  ];
  return (
    <>
      <PageHeader title="Bảng kê số dư ngân hàng" code="ACC96" subtitle="Số dư đầu kỳ, phát sinh, số dư cuối kỳ của từng tài khoản ngân hàng" helpKey="so-du-tien" />
      <FilterLayout boThamSo={{ value: f, onApply: setF }}
        print={<PrintButton screen="ACC96" templates={BANK_TEMPLATES} disabled={!rows.length} getDocs={() => [{ from: f.from, to: f.to, rows, multi }]} />}
        filters={
          <>
            <DateRange from={f.from} to={f.to} onChange={(from, to) => set({ from, to })} />
            {multi && <BranchSelect value={f.branchCodes} onChange={(branchCodes) => set({ branchCodes })} />}
          </>
        }
      >
        <div className="card">
          <div className="rp-tieu-de"><h2>BẢNG KÊ SỐ DƯ NGÂN HÀNG</h2><i>Tài khoản: 112; Loại tiền: VND; {kyText(f.from, f.to)}</i></div>
          <ErrorBox error={q.error ? errorText(q.error) : null} />
          {q.isLoading ? <Loading /> : !rows.length ? <Empty text="Không có tài khoản ngân hàng có số dư trong kỳ" /> : (
            <DataGrid storageKey="acc96" rows={rows} rowKey={(r) => `${r.branchCode}-${r.accountCode}`} columns={columns} footerLabel="Tổng cộng"
              exportName="bang-ke-so-du-ngan-hang" exportTitle={`Bảng kê số dư ngân hàng — ${kyText(f.from, f.to)}`} />
          )}
        </div>
      </FilterLayout>
    </>
  );
}

/* ------------------------------------------------------------------ ACC97 */
interface ListingRow { entryId: string; postingDate: string; docDate?: string; docNo: string; description: string; entryDescription?: string; debitAccount: string; creditAccount: string; amount: number; branchCode: string }
interface TransferRow extends ListingRow { fromNo: string; fromName: string; toNo: string; toName: string }
interface TransferSheet { from: string; to: string; rows: TransferRow[] }

const TRANSFER_TEMPLATES: PrintTemplate<TransferSheet>[] = [
  {
    id: 'ctnb', name: 'Sổ chi tiết chuyển tiền nội bộ', paper: 'A4L',
    render: (s, ctx) => (
      <LedgerForm ctx={ctx} d={{
        title: 'SỔ CHI TIẾT CHUYỂN TIỀN NỘI BỘ', period: `Loại tiền: VND; ${kyText(s.from, s.to)}`, signs: SIGNS, total: 'Tổng cộng', rows: s.rows,
        cols: [
          { key: 'nht', h: 'Ngày hạch toán', w: 62, center: true, v: (r) => date(r.postingDate) },
          { key: 'nct', h: 'Ngày chứng từ', w: 62, center: true, v: (r) => date(r.docDate ?? r.postingDate) },
          { key: 'so', h: 'Số chứng từ', w: 80, v: (r) => r.docNo },
          { key: 'tkdi', h: 'Tài khoản đi', w: 84, v: (r) => r.fromNo },
          { key: 'tendi', h: 'Tên tài khoản đi', w: 110, v: (r) => r.fromName },
          { key: 'tkden', h: 'Tài khoản đến', w: 84, v: (r) => r.toNo },
          { key: 'tenden', h: 'Tên tài khoản đến', w: 110, v: (r) => r.toName },
          { key: 'ly', h: 'Lý do chuyển', w: 110, v: (r) => r.entryDescription ?? r.description },
          { key: 'dg', h: 'Diễn giải', v: (r) => r.description },
          { key: 'no', h: 'TK Nợ', w: 52, center: true, v: (r) => r.debitAccount },
          { key: 'co', h: 'TK Có', w: 52, center: true, v: (r) => r.creditAccount },
          { key: 'tien', h: 'Số tiền', w: 90, num: true, v: (r) => m(r.amount), sum: (r) => r.amount },
        ],
      }} />
    ),
  },
  screenTemplate<TransferSheet>(),
];

export function InternalTransferPage() {
  const { data: branchList = [] } = useBranches();
  const multi = branchList.length > 1;
  const banks = useBankAccounts().data ?? [];
  const [f, setF] = useState({ from: periodFrom(), to: defaultTo(), branchCodes: '' });
  const set = (p: Partial<typeof f>) => setF((x) => ({ ...x, ...p }));
  const q = useQuery({ queryKey: ['voucher-listing', 'chuyen-tien', f], queryFn: () => api.get<{ rows: ListingRow[] }>('/api/v1/reports/voucher-listing', { ...f, docType: 'cash_transfer', page: 1, pageSize: 5000 }) });
  const acc = (code: string) => { const b = bankOf(banks, code); return { no: b?.accountNo ?? code, name: b?.bankName ?? '' }; };
  const rows: TransferRow[] = (q.data?.rows ?? []).map((r) => {
    const fr = acc(r.creditAccount);
    const to = acc(r.debitAccount);
    return { ...r, fromNo: fr.no, fromName: fr.name, toNo: to.no, toName: to.name };
  });
  const columns: Column<TransferRow>[] = [
    { key: 'postingDate', header: 'Ngày hạch toán', type: 'date', width: 100 },
    { key: 'docDate', header: 'Ngày chứng từ', type: 'date', width: 100, value: (r) => r.docDate ?? r.postingDate },
    { key: 'docNo', header: 'Số chứng từ', type: 'code', width: 120 },
    { key: 'fromNo', header: 'Tài khoản đi', type: 'code', width: 130 },
    { key: 'fromName', header: 'Tên tài khoản đi', width: 200 },
    { key: 'toNo', header: 'Tài khoản đến', type: 'code', width: 130 },
    { key: 'toName', header: 'Tên tài khoản đến', width: 200 },
    { key: 'reason', header: 'Lý do chuyển', width: 200, value: (r) => r.entryDescription ?? r.description },
    { key: 'description', header: 'Diễn giải', width: 220 },
    { key: 'debitAccount', header: 'TK Nợ', type: 'code', width: 80 },
    { key: 'creditAccount', header: 'TK Có', type: 'code', width: 80 },
    { key: 'amount', header: 'Số tiền', type: 'money', sum: true, width: 130 },
    { key: 'branchCode', header: 'Đơn vị', type: 'code', width: 90, hidden: !multi },
  ];
  return (
    <>
      <PageHeader title="Sổ chi tiết chuyển tiền nội bộ" code="ACC97" subtitle="Các lần chuyển tiền giữa quỹ và tài khoản ngân hàng của công ty trong kỳ" helpKey="so-du-tien" />
      <FilterLayout boThamSo={{ value: f, onApply: setF }}
        print={<PrintButton screen="ACC97" templates={TRANSFER_TEMPLATES} disabled={!rows.length} getDocs={() => [{ from: f.from, to: f.to, rows }]} />}
        filters={
          <>
            <DateRange from={f.from} to={f.to} onChange={(from, to) => set({ from, to })} />
            {multi && <BranchSelect value={f.branchCodes} onChange={(branchCodes) => set({ branchCodes })} />}
          </>
        }
      >
        <div className="card">
          <div className="rp-tieu-de"><h2>SỔ CHI TIẾT CHUYỂN TIỀN NỘI BỘ</h2><i>Loại tiền: VND; {kyText(f.from, f.to)}</i></div>
          <ErrorBox error={q.error ? errorText(q.error) : null} />
          {q.isLoading ? <Loading /> : !rows.length ? <Empty text="Không có chuyển tiền nội bộ trong kỳ" /> : (
            <DataGrid storageKey="acc97" rows={rows} rowKey={(r, i) => `${r.entryId}-${i}`} columns={columns} footerLabel="Tổng cộng"
              exportName="so-chi-tiet-chuyen-tien-noi-bo" exportTitle={`Sổ chi tiết chuyển tiền nội bộ — ${kyText(f.from, f.to)}`} />
          )}
        </div>
      </FilterLayout>
    </>
  );
}
