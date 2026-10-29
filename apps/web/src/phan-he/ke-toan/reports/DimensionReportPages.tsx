/**
 * Báo cáo theo khoản mục, bộ phận, nhân viên, hợp đồng:
 *   ExpenseDetailPage       ACC47 Chi tiết chi phí theo khoản mục, bộ phận
 *   DimensionSummaryPage    ACC69 Tổng hợp theo nhân viên, hợp đồng, bộ phận
 *   CashByItemPage          ACC75 Sổ nhật ký chi tiền theo khoản mục
 *   ExpenseItemBranchPage   ACC90 Tài khoản chi phí và khoản mục (cột theo chi nhánh)
 */
import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api, errorText } from '@/lib/api';
import { defaultTo, periodFrom } from '@/lib/format';
import { PageHeader } from '@/components/PageHeader';
import { FilterLayout } from '@/components/ReportPanel';
import { BranchSelect, DateRange } from '@/components/filters';
import { ErrorBox, Loading } from '@/components/ui';
import { DataGrid, type Column } from '@/components/DataGrid';
import { AccountPicker, ListPicker } from '@/components/pickers';
import { DocumentDetail } from '../../../features/documents/DocumentDetail';
import { PrintButton } from '@/components/print';
import { CASH_ITEM_TEMPLATES, DIMENSION_SUM_TEMPLATES, EXPENSE_DETAIL_TEMPLATES, ITEM_BRANCH_TEMPLATES } from './mauIn/khoanMuc';

interface Dim { code: string; name: string; isActive: boolean }
const useDim = (kind: string) => useQuery({ queryKey: ['dimensions', kind], queryFn: () => api.get<Dim[]>(`/api/v1/dimensions/${kind}`), staleTime: 60_000 });
const initial = () => ({ from: periodFrom(), to: defaultTo(), branchCodes: '' });

/* ------------------------------------------------------------------ ACC47 */
interface DetailRow { date: string; docNo: string; invoiceNo: string; eventId: string | null; accountCode: string; counterAccounts: string; description: string; debit: number; credit: number; branchCode: string; costItemCode: string; costItemName: string; departmentCode: string; departmentName: string; employeeCode: string; employeeName: string; contractCode: string }

export function ExpenseDetailPage() {
  const [f, setF] = useState({ ...initial(), account: '64', costItems: '', departments: '' });
  const set = (p: Partial<typeof f>) => setF((x) => ({ ...x, ...p }));
  const [doc, setDoc] = useState<string | null>(null);
  const { data: items = [] } = useDim('cost_item');
  const { data: depts = [] } = useDim('department');
  const q = useQuery({ queryKey: ['expense-detail', f], queryFn: () => api.get<DetailRow[]>('/api/v1/reports/expense-detail', f), enabled: Boolean(f.account) });
  const columns: Column<DetailRow>[] = [
    { key: 'date', header: 'Ngày', type: 'date', width: 95 },
    { key: 'docNo', header: 'Số chứng từ', type: 'code', width: 120 },
    { key: 'invoiceNo', header: 'Số hoá đơn', type: 'code', width: 100, hidden: true },
    { key: 'accountCode', header: 'Tài khoản', type: 'code', width: 85 },
    { key: 'counterAccounts', header: 'TK đối ứng', type: 'code', width: 90 },
    { key: 'description', header: 'Diễn giải', width: 260 },
    { key: 'debit', header: 'Phát sinh Nợ', type: 'money', sum: true },
    { key: 'credit', header: 'Phát sinh Có', type: 'money', sum: true },
    { key: 'branchCode', header: 'Chi nhánh', type: 'code', width: 80 },
    { key: 'costItemCode', header: 'Mã khoản mục', type: 'code', width: 100 },
    { key: 'costItemName', header: 'Tên khoản mục', width: 170 },
    { key: 'departmentName', header: 'Bộ phận', width: 150, value: (r) => (r.departmentCode ? `${r.departmentCode} ${r.departmentName}` : '') },
    { key: 'employeeName', header: 'Nhân viên', width: 150, value: (r) => (r.employeeCode ? `${r.employeeCode} ${r.employeeName}` : '') },
    { key: 'contractCode', header: 'Hợp đồng', type: 'code', width: 100, hidden: true },
  ];
  return (
    <>
      <PageHeader title="Chi tiết chi phí theo khoản mục, bộ phận" code="ACC47" subtitle="Từng dòng phát sinh của tài khoản chi phí, lọc theo khoản mục, bộ phận, chi nhánh" helpKey="chi-phi-khoan-muc" />
      <FilterLayout
        print={<PrintButton screen="ACC47" templates={EXPENSE_DETAIL_TEMPLATES} disabled={!q.data} getDocs={() => (q.data ? [{ ...f, rows: q.data }] : [])} />}
        filters={
          <>
            <div className="field"><label>Tài khoản chi phí</label><AccountPicker className="input w-md" value={f.account} onChange={(account) => set({ account })} placeholder="64" /></div>
            <DateRange from={f.from} to={f.to} onChange={(from, to) => set({ from, to })} />
            <BranchSelect value={f.branchCodes} onChange={(branchCodes) => set({ branchCodes })} />
            <div className="field"><label>Khoản mục</label><ListPicker items={items} value={f.costItems} onChange={(costItems) => set({ costItems })} placeholder="Tất cả" /></div>
            <div className="field"><label>Bộ phận</label><ListPicker items={depts} value={f.departments} onChange={(departments) => set({ departments })} placeholder="Tất cả" /></div>
          </>
        }
      >
        <div className="card">
          <div style={{ padding: '0 16px 16px' }}>
            <ErrorBox error={q.error ? errorText(q.error) : null} />
            {q.isLoading ? <Loading /> : <DataGrid storageKey="acc47" rows={q.data ?? []} rowKey={(r, i) => `${i}`} columns={columns} onRowClick={(r) => r.eventId && setDoc(r.eventId)} exportName={`chi-tiet-chi-phi-${f.from}-${f.to}`} exportTitle={`Chi tiết chi phí theo khoản mục, bộ phận TK ${f.account}`} />}
          </div>
        </div>
      </FilterLayout>
      {doc && <DocumentDetail id={doc} onClose={() => setDoc(null)} />}
    </>
  );
}

/* ------------------------------------------------------------------ ACC69 */
interface SumRow { code: string; name: string; accountCode: string; accountName: string; debit: number; credit: number; net: number }
const DIMS = [{ key: 'department', label: 'Bộ phận' }, { key: 'employee', label: 'Nhân viên' }, { key: 'contract', label: 'Hợp đồng' }, { key: 'costItem', label: 'Khoản mục' }];

export function DimensionSummaryPage() {
  const [f, setF] = useState({ ...initial(), dimension: 'department', account: '' });
  const set = (p: Partial<typeof f>) => setF((x) => ({ ...x, ...p }));
  const q = useQuery({ queryKey: ['dimension-summary', f], queryFn: () => api.get<SumRow[]>('/api/v1/reports/dimension-summary', f) });
  const label = DIMS.find((d) => d.key === f.dimension)!.label;
  const columns: Column<SumRow>[] = [
    { key: 'code', header: `Mã ${label.toLowerCase()}`, type: 'code', width: 110 },
    { key: 'name', header: `Tên ${label.toLowerCase()}`, width: 220 },
    { key: 'accountCode', header: 'Tài khoản', type: 'code', width: 90 },
    { key: 'accountName', header: 'Tên tài khoản', width: 240 },
    { key: 'debit', header: 'Phát sinh Nợ', type: 'money', sum: true },
    { key: 'credit', header: 'Phát sinh Có', type: 'money', sum: true },
    { key: 'net', header: 'Nợ − Có', type: 'money', sum: true, showZero: true },
  ];
  return (
    <>
      <PageHeader title="Tổng hợp theo nhân viên, hợp đồng, bộ phận" code="ACC69" subtitle="Phát sinh Nợ, Có của từng tài khoản theo nhân viên, hợp đồng, bộ phận hoặc khoản mục ghi trên dòng phiếu" helpKey="chi-phi-khoan-muc" />
      <FilterLayout
        print={<PrintButton screen="ACC69" templates={DIMENSION_SUM_TEMPLATES} disabled={!q.data} getDocs={() => (q.data ? [{ ...f, label, rows: q.data }] : [])} />}
        filters={
          <>
            <div className="field"><label>Tài khoản (trống = mọi TK)</label><AccountPicker className="input w-md" value={f.account} onChange={(account) => set({ account })} placeholder="Ví dụ 64, 131" /></div>
            <DateRange from={f.from} to={f.to} onChange={(from, to) => set({ from, to })} />
            <BranchSelect value={f.branchCodes} onChange={(branchCodes) => set({ branchCodes })} />
          </>
        }
      >
        <div className="card">
          <div className="tabs" role="tablist">
            {DIMS.map((d) => <button key={d.key} role="tab" className={`tab ${f.dimension === d.key ? 'active' : ''}`} onClick={() => set({ dimension: d.key })}>Theo {d.label.toLowerCase()}</button>)}
          </div>
          <div style={{ padding: '0 16px 16px' }}>
            <ErrorBox error={q.error ? errorText(q.error) : null} />
            {q.isLoading ? <Loading /> : <DataGrid storageKey={`acc69-${f.dimension}`} rows={q.data ?? []} rowKey={(r) => `${r.code}|${r.accountCode}`} columns={columns} exportName={`tong-hop-theo-${f.dimension}-${f.from}-${f.to}`} />}
          </div>
        </div>
      </FilterLayout>
    </>
  );
}

/* ------------------------------------------------------------------ ACC75 */
interface CashRow { entryId: string; date: string; docNo: string; eventId: string | null; branchCode: string; partnerName: string; description: string; cashAccount: string; total: number; byItem: Record<string, number>; other: number; otherAccounts: string }

export function CashByItemPage() {
  const [f, setF] = useState({ ...initial(), account: '' });
  const set = (p: Partial<typeof f>) => setF((x) => ({ ...x, ...p }));
  const [doc, setDoc] = useState<string | null>(null);
  const q = useQuery({ queryKey: ['cash-by-item', f], queryFn: () => api.get<{ columns: { code: string; name: string }[]; rows: CashRow[] }>('/api/v1/reports/cash-payments-by-item', f) });
  const columns = useMemo<Column<CashRow>[]>(() => [
    { key: 'date', header: 'Ngày', type: 'date', width: 95 },
    { key: 'docNo', header: 'Số chứng từ', type: 'code', width: 120 },
    { key: 'branchCode', header: 'Chi nhánh', type: 'code', width: 80 },
    { key: 'cashAccount', header: 'TK tiền', type: 'code', width: 80 },
    { key: 'description', header: 'Diễn giải', width: 240 },
    { key: 'partnerName', header: 'Đối tượng', width: 160 },
    { key: 'total', header: 'Tổng tiền chi', type: 'money', sum: true, bold: true },
    ...(q.data?.columns ?? []).map((c) => ({ key: `km-${c.code}`, header: c.name, title: c.code, band: 'Chi theo khoản mục', type: 'money' as const, sum: true, value: (r: CashRow) => r.byItem[c.code] ?? 0 })),
    { key: 'other', header: 'Không gắn khoản mục', band: 'Chi theo khoản mục', type: 'money', sum: true },
    { key: 'otherAccounts', header: 'TK của phần không gắn khoản mục', type: 'code', width: 120 },
  ], [q.data]);
  return (
    <>
      <PageHeader title="Sổ nhật ký chi tiền theo khoản mục" code="ACC75" subtitle="Mỗi lần chi tiền (tiền mặt, ngân hàng) một dòng, chia số tiền theo khoản mục gốc của dòng chi phí; không tính chuyển tiền nội bộ" helpKey="chi-phi-khoan-muc" />
      <FilterLayout
        print={<PrintButton screen="ACC75" templates={CASH_ITEM_TEMPLATES} disabled={!q.data} getDocs={() => (q.data ? [{ ...f, items: q.data.columns, rows: q.data.rows }] : [])} />}
        filters={
          <>
            <div className="field"><label>Tài khoản tiền (trống = 111, 112, 113)</label><AccountPicker className="input w-md" value={f.account} onChange={(account) => set({ account })} placeholder="111, 1121…" /></div>
            <DateRange from={f.from} to={f.to} onChange={(from, to) => set({ from, to })} />
            <BranchSelect value={f.branchCodes} onChange={(branchCodes) => set({ branchCodes })} />
          </>
        }
      >
        <div className="card">
          <div style={{ padding: '0 16px 16px' }}>
            <ErrorBox error={q.error ? errorText(q.error) : null} />
            {q.isLoading ? <Loading /> : <DataGrid storageKey="acc75" rows={q.data?.rows ?? []} rowKey={(r) => `${r.entryId}|${r.cashAccount}`} columns={columns} onRowClick={(r) => r.eventId && setDoc(r.eventId)} exportName={`nhat-ky-chi-tien-khoan-muc-${f.from}-${f.to}`} />}
          </div>
        </div>
      </FilterLayout>
      {doc && <DocumentDetail id={doc} onClose={() => setDoc(null)} />}
    </>
  );
}

/* ------------------------------------------------------------------ ACC90 */
interface ItemBranchRow { accountCode: string; accountName: string; costItemCode: string; costItemName: string; departmentCode: string; departmentName: string; byBranch: Record<string, number>; total: number }

export function ExpenseItemBranchPage() {
  const [f, setF] = useState({ ...initial(), account: '64', byDepartment: 'false' });
  const set = (p: Partial<typeof f>) => setF((x) => ({ ...x, ...p }));
  const q = useQuery({ queryKey: ['expense-item-branch', f], queryFn: () => api.get<{ branches: string[]; rows: ItemBranchRow[] }>('/api/v1/reports/expense-item-branch', f), enabled: Boolean(f.account) });
  const columns = useMemo<Column<ItemBranchRow>[]>(() => [
    { key: 'accountCode', header: 'Tài khoản', type: 'code', width: 85 },
    { key: 'accountName', header: 'Tên tài khoản', width: 200, hidden: true },
    { key: 'costItemCode', header: 'Mã khoản mục', type: 'code', width: 100 },
    { key: 'costItemName', header: 'Tên khoản mục', width: 190 },
    ...(f.byDepartment === 'true' ? [{ key: 'departmentName', header: 'Bộ phận', width: 150, value: (r: ItemBranchRow) => (r.departmentCode ? `${r.departmentCode} ${r.departmentName}` : '') } as Column<ItemBranchRow>] : []),
    { key: 'total', header: 'Cộng', type: 'money', sum: true, bold: true },
    ...(q.data?.branches ?? []).map((b) => ({ key: `br-${b}`, header: b, band: 'Theo chi nhánh', type: 'money' as const, sum: true, value: (r: ItemBranchRow) => r.byBranch[b] ?? 0 })),
  ], [q.data, f.byDepartment]);
  return (
    <>
      <PageHeader title="Tài khoản chi phí và khoản mục" code="ACC90" subtitle="Chi phí theo tài khoản × khoản mục (tuỳ chọn thêm bộ phận), mỗi chi nhánh một cột" helpKey="chi-phi-khoan-muc" />
      <FilterLayout
        print={<PrintButton screen="ACC90" templates={ITEM_BRANCH_TEMPLATES} disabled={!q.data} getDocs={() => (q.data ? [{ ...f, branches: q.data.branches, rows: q.data.rows }] : [])} />}
        filters={
          <>
            <div className="field"><label>Tài khoản chi phí</label><AccountPicker className="input w-md" value={f.account} onChange={(account) => set({ account })} placeholder="64" /></div>
            <DateRange from={f.from} to={f.to} onChange={(from, to) => set({ from, to })} />
            <BranchSelect value={f.branchCodes} onChange={(branchCodes) => set({ branchCodes })} />
            <label className="checkbox" style={{ alignSelf: 'flex-end', height: 34 }}><input type="checkbox" checked={f.byDepartment === 'true'} onChange={(e) => set({ byDepartment: e.target.checked ? 'true' : 'false' })} /> Tách theo bộ phận</label>
          </>
        }
      >
        <div className="card">
          <div style={{ padding: '0 16px 16px' }}>
            <ErrorBox error={q.error ? errorText(q.error) : null} />
            {q.isLoading ? <Loading /> : <DataGrid storageKey="acc90" rows={q.data?.rows ?? []} rowKey={(r) => `${r.accountCode}|${r.costItemCode}|${r.departmentCode}`} columns={columns} exportName={`chi-phi-khoan-muc-chi-nhanh-${f.from}-${f.to}`} />}
          </div>
        </div>
      </FilterLayout>
    </>
  );
}
