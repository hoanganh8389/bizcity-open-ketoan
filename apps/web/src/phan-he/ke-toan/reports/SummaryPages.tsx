/**
 * Ba báo cáo tổng hợp dạng bảng đơn giản:
 *   TaxSummaryPage      Bảng tổng hợp thuế GTGT theo chi nhánh, tháng      (ACC91)
 *   CashBalancesPage    Bảng kê số dư tiền theo chi nhánh và tài khoản tiền (ACC80)
 *   PostingSummaryPage  Bảng tổng hợp chứng từ theo cặp tài khoản Nợ / Có   (ACC63)
 */
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { DOC_TYPE_LABELS, DOC_TYPE_LIST, type DocType } from '@ketoan/contracts';
import { api, errorText } from '@/lib/api';
import { defaultFrom, defaultTo, periodFrom } from '@/lib/format';
import { PageHeader } from '@/components/PageHeader';
import { FilterLayout } from '@/components/ReportPanel';
import { BranchSelect, DateRange } from '@/components/filters';
import { Empty, ErrorBox, Loading, Money } from '@/components/ui';
import { DataGrid, type Column } from '@/components/DataGrid';
import { AccountPicker } from '@/components/pickers';
import { PrintButton } from '@/components/print';
import { CASH_BALANCE_TEMPLATES, POSTING_TEMPLATES, TAX_SUMMARY_TEMPLATES } from './mauIn/baoCaoTongHop';

/* ------------------------------------------------------------------ ACC91 */
interface TaxRow { branchCode: string; branchName: string; month: string; invoices: number; carried: number; inputTax: number; revenue: number; outputTax: number; payable: number }

export function TaxSummaryPage() {
  const [f, setF] = useState({ from: periodFrom(), to: defaultTo(), branchCodes: '' });
  const set = (patch: Partial<typeof f>) => setF((x) => ({ ...x, ...patch }));
  const q = useQuery({ queryKey: ['tax-summary', f], queryFn: () => api.get<{ rows: TaxRow[]; totals: Omit<TaxRow, 'branchCode' | 'branchName' | 'month'> }>('/api/v1/reports/tax-summary', f) });
  const d = q.data;
  return (
    <>
      <PageHeader title="Bảng tổng hợp thuế GTGT" code="ACC91" subtitle="Doanh thu, thuế ra, thuế vào, khấu trừ và thuế nộp cuối kỳ của từng chi nhánh, từng tháng" helpKey="tong-hop-thue" />
      <FilterLayout
        print={<PrintButton screen="ACC91" templates={TAX_SUMMARY_TEMPLATES} disabled={!d} getDocs={() => (d ? [{ ...f, rows: d.rows }] : [])} />}
        filters={
          <>
            <DateRange from={f.from} to={f.to} onChange={(from, to) => set({ from, to })} />
            <BranchSelect value={f.branchCodes} onChange={(branchCodes) => set({ branchCodes })} />
          </>
        }
      >
        {d && (
          <div className="kpis">
            <div className="card kpi"><div className="label">Thuế đầu ra</div><div className="value"><Money value={d.totals.outputTax} blankZero={false} /></div></div>
            <div className="card kpi"><div className="label">Thuế đầu vào + khấu trừ kỳ trước</div><div className="value"><Money value={d.totals.inputTax + d.totals.carried} blankZero={false} /></div></div>
            <div className="card kpi"><div className="label">{d.totals.payable >= 0 ? 'Thuế phải nộp cuối kỳ' : 'Còn được khấu trừ chuyển kỳ sau'}</div><div className="value"><Money value={Math.abs(d.totals.payable)} blankZero={false} /></div></div>
          </div>
        )}
        <div className="card">
          <ErrorBox error={q.error ? errorText(q.error) : null} />
          {q.isLoading ? <Loading /> : !d || d.rows.length === 0 ? <Empty text="Không có số liệu thuế trong khoảng này" /> : (
            <DataGrid
              storageKey="acc91-v2"
              rows={d.rows}
              rowKey={(r) => `${r.branchCode}-${r.month}`}
              columns={[
                { key: 'branchCode', header: 'Mã CN', type: 'code' },
                { key: 'month', header: 'Tháng' },
                { key: 'carried', header: 'Thuế GTGT còn được khấu trừ kỳ trước chuyển sang', type: 'money', sum: true },
                { key: 'revenue', header: 'Doanh thu bán ra trong kỳ', type: 'money', sum: true },
                { key: 'inputTax', header: 'Thuế GTGT mua vào được khấu trừ kỳ này', type: 'money', sum: true },
                { key: 'outputTax', header: 'Thuế GTGT HHDV bán ra trong kỳ', type: 'money', sum: true },
                { key: 'payable', header: 'Thuế GTGT phải nộp trong kỳ', type: 'money', sum: true, bold: true },
                { key: 'branchName', header: 'Tên CN' },
                { key: 'invoices', header: 'Số hoá đơn', type: 'number', sum: true, hidden: true },
              ] satisfies Column<TaxRow>[]}
            />
          )}
        </div>
      </FilterLayout>
    </>
  );
}

/* ------------------------------------------------------------------ ACC80 */
interface CashRow { branchCode: string; branchName: string; accountCode: string; accountName: string; opening: number; debit: number; credit: number; closing: number }

export function CashBalancesPage() {
  const navigate = useNavigate();
  const [f, setF] = useState({ from: defaultFrom(), to: defaultTo(), branchCodes: '', accounts: '111,112,113' });
  const [accounts, setAccounts] = useState(f.accounts);
  const set = (patch: Partial<typeof f>) => setF((x) => ({ ...x, ...patch }));
  const q = useQuery({ queryKey: ['cash-balances', f], queryFn: () => api.get<{ rows: CashRow[]; totals: { opening: number; debit: number; credit: number; closing: number } }>('/api/v1/reports/cash-balances', f) });
  const d = q.data;
  const open = (r: CashRow) => navigate(`/bao-cao/so-chi-tiet?${new URLSearchParams({ account: r.accountCode, from: f.from, to: f.to }).toString()}`);
  return (
    <>
      <PageHeader title="Bảng kê số dư tiền" code="ACC80" subtitle="Tồn đầu, thu, chi, tồn cuối của từng quỹ, từng tài khoản ngân hàng theo chi nhánh" helpKey="so-du-tien" />
      <FilterLayout
        print={<PrintButton screen="ACC80" templates={CASH_BALANCE_TEMPLATES} disabled={!d} getDocs={() => (d ? [{ ...f, rows: d.rows }] : [])} />}
        filters={
          <>
            <form className="rp-form" onSubmit={(e) => { e.preventDefault(); set({ accounts: accounts.replace(/\s/g, '') }); }}>
              <DateRange from={f.from} to={f.to} onChange={(from, to) => set({ from, to })} />
              <BranchSelect value={f.branchCodes} onChange={(branchCodes) => set({ branchCodes })} />
              <div className="field"><label>Tài khoản tiền (cách nhau dấu phẩy)</label><AccountPicker multiple className="input w-lg mono" value={accounts} onChange={(v) => { setAccounts(v); set({ accounts: v }); }} /></div>
            </form>
          </>
        }
      >
        {d && (
          <div className="kpis">
            <div className="card kpi"><div className="label">Tồn đầu kỳ</div><div className="value"><Money value={d.totals.opening} blankZero={false} /></div></div>
            <div className="card kpi"><div className="label">Thu trong kỳ</div><div className="value"><Money value={d.totals.debit} blankZero={false} /></div></div>
            <div className="card kpi"><div className="label">Chi trong kỳ</div><div className="value"><Money value={d.totals.credit} blankZero={false} /></div></div>
            <div className="card kpi"><div className="label">Tồn cuối kỳ</div><div className="value"><Money value={d.totals.closing} blankZero={false} /></div></div>
          </div>
        )}
        <div className="card">
          <ErrorBox error={q.error ? errorText(q.error) : null} />
          {q.isLoading ? <Loading /> : !d || d.rows.length === 0 ? <Empty text="Không có số dư tiền trong khoảng này" /> : (
            <DataGrid
              storageKey="acc80"
              rows={d.rows}
              rowKey={(r) => `${r.branchCode}-${r.accountCode}`}
              onRowClick={open}
              columns={[
                { key: 'branchCode', header: 'Mã chi nhánh', type: 'code' },
                { key: 'branchName', header: 'Tên chi nhánh' },
                { key: 'accountCode', header: 'Tài khoản', type: 'code' },
                { key: 'accountName', header: 'Tên tài khoản' },
                { key: 'opening', header: 'Tồn đầu kỳ', type: 'money', sum: true },
                { key: 'debit', header: 'Thu (Nợ)', type: 'money', sum: true },
                { key: 'credit', header: 'Chi (Có)', type: 'money', sum: true },
                { key: 'closing', header: 'Tồn cuối kỳ', type: 'money', sum: true, bold: true, showZero: true },
              ] satisfies Column<CashRow>[]}
            />
          )}
        </div>
      </FilterLayout>
    </>
  );
}

/* ------------------------------------------------------------------ ACC63 */
interface PostingRow { branchCode: string; month: string; docType: string; costItem: string; reasonCode: string; debitAccount: string; creditAccount: string; amount: number; entries: number }
const TYPES: DocType[] = DOC_TYPE_LIST.filter((t) => t !== 'opening');
const POSTING_GROUPS = [['branch', 'Chi nhánh'], ['month', 'Tháng'], ['docType', 'Loại chứng từ'], ['costItem', 'Khoản mục'], ['reason', 'Lý do']] as const;

export function PostingSummaryPage() {
  const [f, setF] = useState({ from: defaultFrom(), to: defaultTo(), branchCodes: '', docType: '', groups: 'branch,month,costItem,reason' });
  const set = (patch: Partial<typeof f>) => setF((x) => ({ ...x, ...patch }));
  const q = useQuery({ queryKey: ['posting-summary', f], queryFn: () => api.get<{ rows: PostingRow[]; total: number }>('/api/v1/reports/posting-summary', f) });
  const d = q.data;
  const on = (g: string) => f.groups.split(',').includes(g);
  const toggle = (g: string) => set({ groups: POSTING_GROUPS.map(([k]) => k).filter((k) => (k === g ? !on(k) : on(k))).join(',') });
  const lead = POSTING_GROUPS.filter(([k]) => on(k) && k !== 'costItem' && k !== 'reason');
  const tail = POSTING_GROUPS.filter(([k]) => on(k) && (k === 'costItem' || k === 'reason'));
  const cell = (r: PostingRow, k: string) => (k === 'branch' ? r.branchCode : k === 'month' ? r.month.replace(/^(\d{4})(\d{2})$/, '$2/$1') : k === 'docType' ? DOC_TYPE_LABELS[r.docType as DocType] ?? r.docType : k === 'costItem' ? r.costItem : r.reasonCode);
  return (
    <>
      <PageHeader title="Bảng tổng hợp chứng từ" code="ACC63" subtitle="Tổng số tiền theo từng cặp tài khoản Nợ / Có, theo chi nhánh, tháng, khoản mục, lý do" helpKey="tong-hop-chung-tu" />
      <FilterLayout
        print={<PrintButton screen="ACC63" templates={POSTING_TEMPLATES} disabled={!d} getDocs={() => (d ? [{ ...f, rows: d.rows }] : [])} />}
        filters={
          <>
            <DateRange from={f.from} to={f.to} onChange={(from, to) => set({ from, to })} />
            <BranchSelect value={f.branchCodes} onChange={(branchCodes) => set({ branchCodes })} />
            <div className="field">
              <label>Loại chứng từ</label>
              <select className="select input w-md" value={f.docType} onChange={(e) => set({ docType: e.target.value })}>
                <option value="">Tất cả</option>
                {TYPES.map((t) => <option key={t} value={t}>{DOC_TYPE_LABELS[t]}</option>)}
              </select>
            </div>
            <div className="field">
              <label>Tách theo</label>
              <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', paddingTop: 6 }}>
                {POSTING_GROUPS.map(([k, l]) => <label key={k} className="checkbox"><input type="checkbox" checked={on(k)} onChange={() => toggle(k)} /> {l}</label>)}
              </div>
            </div>
          </>
        }
      >
        <div className="card">
          <ErrorBox error={q.error ? errorText(q.error) : null} />
          {q.isLoading ? <Loading /> : !d || d.rows.length === 0 ? <Empty text="Không có bút toán nào trong khoảng này" /> : (
            <DataGrid
              storageKey="acc63"
              rows={d.rows}
              rowKey={(r) => [r.branchCode, r.month, r.docType, r.debitAccount, r.creditAccount, r.costItem, r.reasonCode].join('|')}
              columns={[
                ...lead.map(([k, l]): Column<PostingRow> => ({ key: k, header: l, value: (r) => cell(r, k) as string, type: k === 'docType' ? 'text' : 'code' })),
                { key: 'debitAccount', header: 'TK Nợ', type: 'code' },
                { key: 'creditAccount', header: 'TK Có', type: 'code' },
                ...tail.map(([k, l]): Column<PostingRow> => ({ key: k, header: l, value: (r) => cell(r, k) as string, type: 'code' })),
                { key: 'amount', header: 'Số tiền', type: 'money', sum: true, showZero: true },
                { key: 'entries', header: 'Số bút toán', type: 'number', sum: true },
              ]}
            />
          )}
        </div>
      </FilterLayout>
    </>
  );
}
