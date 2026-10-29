/**
 * Bảng cân đối số phát sinh. Bấm một tài khoản để mở sổ chi tiết của tài khoản đó.
 */
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { api, errorText } from '@/lib/api';
import { defaultFrom, defaultTo, periodFrom } from '@/lib/format';
import { PageHeader } from '@/components/PageHeader';
import { FilterLayout } from '@/components/ReportPanel';
import { BranchSelect, DateRange } from '@/components/filters';
import { Empty, ErrorBox, Loading, Money } from '@/components/ui';
import { DataGrid, type Column } from '@/components/DataGrid';
import { AccountPicker } from '@/components/pickers';
import { PrintButton } from '@/components/print';
import { TRIAL_BALANCE_TEMPLATES } from './mauIn/baoCaoTaiChinh';

interface Row { code: string; name: string; level: number; isPosting: boolean; openingDebit: number; openingCredit: number; debit: number; credit: number; closingDebit: number; closingCredit: number }
interface Data { rows: Row[]; totals: Omit<Row, 'code' | 'name' | 'level' | 'isPosting'> }

export function TrialBalancePage() {
  const nav = useNavigate();
  const [f, setF] = useState({ from: periodFrom(), to: defaultTo(), branchCodes: '', account: '', postingOnly: false });
  const set = (p: Partial<typeof f>) => setF((x) => ({ ...x, ...p }));
  const q = useQuery({ queryKey: ['trial-balance', f], queryFn: () => api.get<Data>('/api/v1/reports/trial-balance', f) });
  const d = q.data;


  return (
    <>
      <PageHeader
        title="Bảng cân đối số phát sinh"
        code="ACC10"
        subtitle="Số dư đầu kỳ, phát sinh, số dư cuối kỳ theo tài khoản; tài khoản tổng hợp in đậm"
        helpKey="can-doi-phat-sinh"
      />
      <FilterLayout
        print={<PrintButton screen="ACC10" templates={TRIAL_BALANCE_TEMPLATES} disabled={!d} getDocs={() => (d ? [{ ...f, rows: d.rows }] : [])} />}
        filters={
          <>
            <DateRange from={f.from} to={f.to} onChange={(from, to) => set({ from, to })} />
            <BranchSelect value={f.branchCodes} onChange={(branchCodes) => set({ branchCodes })} />
            <div className="field"><label>Nhánh tài khoản</label><AccountPicker className="input w-md" value={f.account} onChange={(account) => set({ account })} placeholder="Tất cả" /></div>
            <label className="checkbox" style={{ marginBottom: 8 }}><input type="checkbox" checked={f.postingOnly} onChange={(e) => set({ postingOnly: e.target.checked })} /> Chỉ tài khoản chi tiết</label>
          </>
        }
      >
        <div className="card">
          <ErrorBox error={q.error ? errorText(q.error) : null} />
          {q.isLoading ? <Loading /> : !d || d.rows.length === 0 ? <Empty text="Không có số liệu trong khoảng này" /> : (
            <DataGrid
              storageKey="acc10"
              rows={d.rows}
              rowKey={(r) => r.code}
              onRowClick={(r) => nav(`/bao-cao/so-chi-tiet?account=${r.code}&from=${f.from}&to=${f.to}`)}
              rowClassName={(r) => (r.isPosting ? '' : 'bold')}
              columns={[
                { key: 'code', header: 'Số TK', type: 'code' },
                { key: 'name', header: 'Tên tài khoản', render: (r) => <span style={{ paddingLeft: Math.min(r.level - 1, 4) * 12 }}>{r.name}</span> },
                { key: 'openingDebit', header: 'Nợ', band: 'Số dư đầu kỳ', type: 'money', footerValue: (rows: Row[]) => rows.filter((r) => r.isPosting).reduce((s, r) => s + Math.round(r.openingDebit * 100), 0) / 100 },
                { key: 'openingCredit', header: 'Có', band: 'Số dư đầu kỳ', type: 'money', footerValue: (rows: Row[]) => rows.filter((r) => r.isPosting).reduce((s, r) => s + Math.round(r.openingCredit * 100), 0) / 100 },
                { key: 'debit', header: 'Nợ', band: 'Phát sinh trong kỳ', type: 'money', footerValue: (rows: Row[]) => rows.filter((r) => r.isPosting).reduce((s, r) => s + Math.round(r.debit * 100), 0) / 100 },
                { key: 'credit', header: 'Có', band: 'Phát sinh trong kỳ', type: 'money', footerValue: (rows: Row[]) => rows.filter((r) => r.isPosting).reduce((s, r) => s + Math.round(r.credit * 100), 0) / 100 },
                { key: 'closingDebit', header: 'Nợ', band: 'Số dư cuối kỳ', type: 'money', footerValue: (rows: Row[]) => rows.filter((r) => r.isPosting).reduce((s, r) => s + Math.round(r.closingDebit * 100), 0) / 100 },
                { key: 'closingCredit', header: 'Có', band: 'Số dư cuối kỳ', type: 'money', footerValue: (rows: Row[]) => rows.filter((r) => r.isPosting).reduce((s, r) => s + Math.round(r.closingCredit * 100), 0) / 100 },
              ] satisfies Column<Row>[]}
            />
          )}
        </div>
      </FilterLayout>
    </>
  );
}
