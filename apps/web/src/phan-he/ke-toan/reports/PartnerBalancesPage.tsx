/**
 * Sổ tổng hợp công nợ phát sinh theo đối tượng.
 *  - Một tài khoản (131 phải thu khách hàng, 331 phải trả người bán…) hoặc mọi tài khoản theo dõi đối tượng
 *    (gõ * hoặc tích "Tất cả TK công nợ"); khi xem nhiều tài khoản có dòng cộng in đậm cho từng tài khoản.
 *  - Tuỳ chọn tách theo chi nhánh.
 * Bấm một dòng để mở sổ chi tiết công nợ của đối tượng đó.
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
import { AccountPicker, ListPicker, PartnerPicker } from '@/components/pickers';
import { PrintButton } from '@/components/print';
import { partnerBalanceTemplates, type PartnerBalanceSheet } from './mauIn/congNoTongHop';

interface Amounts { openingDebit: number; openingCredit: number; debit: number; credit: number; closingDebit: number; closingCredit: number }
interface Row extends Amounts { accountCode: string; branchCode: string; partnerCode: string; partnerName: string; taxCode: string; groupCode?: string; groupName?: string }
type GridRow = Row & { kind: 'data' | 'group' };
interface Data { rows: Row[]; accounts: (Amounts & { accountCode: string; accountName: string })[]; totals: Amounts }

export interface PartnerBalancesPreset { account: string; title: string; code: string; subtitle: string }

export function PartnerBalancesPage({ preset }: { preset?: PartnerBalancesPreset }) {
  const navigate = useNavigate();
  const first = preset?.account ?? '131';
  const [f, setF] = useState({ account: first, from: periodFrom(), to: defaultTo(), branchCodes: '', hideZero: false, byBranch: Boolean(preset) });
  // Kiểu báo cáo: 1 chi tiết từng CN, 2 tổng các CN, 3 / 4 như 1 / 2 nhưng bỏ dòng tổng hợp theo tài khoản.
  const [kind, setKind] = useState(preset ? '1' : '2');
  const [groupCode, setGroupCode] = useState('');
  const [partnerCode, setPartnerCode] = useState('');
  const [withMovementOnly, setWithMovementOnly] = useState(true);
  const groups = useQuery({ queryKey: ['partner-groups'], queryFn: () => api.get<{ code: string; name: string }[]>('/api/v1/partner-groups'), staleTime: 60_000 }).data ?? [];
  const [account, setAccount] = useState(first);
  const set = (patch: Partial<typeof f>) => setF((x) => ({ ...x, ...patch }));
  const q = useQuery({ queryKey: ['partner-balances', f], queryFn: () => api.get<Data>('/api/v1/reports/partner-balances', f), enabled: Boolean(f.account) });
  const raw = q.data;
  const all = f.account === '*';
  const noSubtotal = kind === '3' || kind === '4';
  // Lọc theo nhóm, đối tượng; bỏ đối tượng chỉ có phát sinh (đầu kỳ, cuối kỳ đều bằng 0) nếu không tích ô hiển thị.
  const keep = (r: Row) => (!groupCode || r.groupCode === groupCode) && (!partnerCode || r.partnerCode === partnerCode)
    && (withMovementOnly || r.openingDebit || r.openingCredit || r.closingDebit || r.closingCredit);
  const d = raw && { ...raw, rows: raw.rows.filter(keep) };
  const openLedger = (r: Row) => {
    if (!r.partnerCode) return;
    const p = new URLSearchParams({ account: all ? r.accountCode : f.account, from: f.from, to: f.to, partnerCode: r.partnerCode });
    navigate(`/bao-cao/so-chi-tiet-cong-no?${p.toString()}`);
  };
  const partners = d ? new Set(d.rows.map((r) => r.partnerCode)).size : 0;

  return (
    <>
      <PageHeader
        title={preset?.title ?? 'Sổ tổng hợp công nợ phát sinh'}
        code={preset?.code ?? 'ACC38'}
        subtitle={preset?.subtitle ?? 'Số dư và phát sinh công nợ theo từng đối tượng'}
        helpKey="tong-hop-cong-no"
      />
      <FilterLayout
        print={<PrintButton screen={preset?.code ?? 'ACC38'} templates={partnerBalanceTemplates(preset?.code ?? 'ACC38', f.byBranch)} disabled={!d || !d.rows.length}
          getDocs={(): PartnerBalanceSheet[] => (d ? [{
            code: preset?.code ?? 'ACC38', title: preset?.title ?? 'Sổ tổng hợp công nợ phát sinh', from: f.from, to: f.to, branchCodes: f.branchCodes, account: f.account,
            accountNames: Object.fromEntries(d.accounts.map((a) => [a.accountCode, a.accountName])), byBranch: f.byBranch, noSubtotal, rows: d.rows,
          }] : [])} />}
        filters={
          <>
            <form className="rp-form" onSubmit={(e) => { e.preventDefault(); set({ account: account.trim() }); }}>
              <DateRange from={f.from} to={f.to} onChange={(from, to) => set({ from, to })} />
              <div className="field">
                <label>Số tài khoản</label>
                <AccountPicker className="input w-md" value={all ? '' : account} disabled={all} onChange={(v) => { setAccount(v); set({ account: v }); }} placeholder={all ? 'Tất cả' : '131'} />
              </div>
              <div className="field">
                <label>Kiểu báo cáo</label>
                <select className="select input" value={kind} onChange={(e) => { setKind(e.target.value); set({ byBranch: e.target.value === '1' || e.target.value === '3' }); }}>
                  <option value="1">Xem chi tiết từng CN</option>
                  <option value="2">Xem tổng các CN</option>
                  <option value="3">Xem chi tiết từng CN (Bỏ tổng hợp)</option>
                  <option value="4">Xem tổng các CN (Bỏ tổng hợp)</option>
                </select>
              </div>
              <div className="field"><label>Nhóm KH</label><ListPicker items={groups} value={groupCode} onChange={setGroupCode} placeholder="Tất cả" /></div>
              <div className="field"><label>KH/NCC</label><PartnerPicker value={partnerCode} onChange={setPartnerCode} placeholder="Tất cả" /></div>
              <div className="field">
                <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap' }}>
                  <label className="checkbox"><input type="checkbox" checked={all} onChange={(e) => { const v = e.target.checked ? '*' : '131'; setAccount(v); set({ account: v }); }} /> Tất cả TK công nợ</label>
                  <label className="checkbox"><input type="checkbox" checked={withMovementOnly} onChange={(e) => setWithMovementOnly(e.target.checked)} /> Hiển thị cả đối tượng chỉ có phát sinh trong kỳ</label>
                </div>
              </div>
              <BranchSelect value={f.branchCodes} onChange={(branchCodes) => set({ branchCodes })} />
            </form>
          </>
        }
      >
        {d && (
          <div className="kpis">
            <div className="card kpi"><div className="label">Dư Nợ cuối kỳ</div><div className="value"><Money value={d.totals.closingDebit} blankZero={false} /></div></div>
            <div className="card kpi"><div className="label">Dư Có cuối kỳ</div><div className="value"><Money value={d.totals.closingCredit} blankZero={false} /></div></div>
            <div className="card kpi"><div className="label">Số đối tượng</div><div className="value">{partners.toLocaleString('vi-VN')}</div></div>
          </div>
        )}
        <div className="card">
          <ErrorBox error={q.error ? errorText(q.error) : null} />
          {q.isLoading ? <Loading /> : !d || d.rows.length === 0 ? <Empty text="Không có công nợ trong khoảng này" /> : (
            <DataGrid
              storageKey={`${preset?.code ?? 'acc38'}-v2`}
              rows={(all ? d.accounts : []).flatMap((acc): GridRow[] => [
                ...(noSubtotal ? [] : [{ ...acc, kind: 'group' as const, branchCode: '', partnerCode: '', partnerName: `${acc.accountCode} — ${acc.accountName}`, taxCode: '' }]),
                ...d.rows.filter((r) => r.accountCode === acc.accountCode).map((r): GridRow => ({ ...r, kind: 'data' })),
              ]).concat(all ? [] : d.rows.map((r): GridRow => ({ ...r, kind: 'data' })))}
              rowKey={(r, i) => `${r.kind}-${r.accountCode}-${r.partnerCode}-${r.branchCode}-${i}`}
              rowKind={(r) => r.kind}
              onRowClick={(r) => openLedger(r)}
              columns={[
                { key: 'partnerCode', header: 'Mã khách hàng', type: 'code' },
                { key: 'partnerName', header: 'Tên khách hàng' },
                { key: 'openingDebit', header: 'Nợ đầu kỳ', type: 'money', sum: true },
                { key: 'openingCredit', header: 'Có đầu kỳ', type: 'money', sum: true },
                { key: 'debit', header: 'Ps Nợ', type: 'money', sum: true },
                { key: 'credit', header: 'Ps Có', type: 'money', sum: true },
                { key: 'closingDebit', header: 'Nợ cuối kỳ', type: 'money', sum: true, bold: true },
                { key: 'closingCredit', header: 'Có cuối kỳ', type: 'money', sum: true, bold: true },
                { key: 'branchCode', header: 'Chi nhánh', type: 'code', hidden: !f.byBranch },
                { key: 'accountCode', header: 'Tài khoản', type: 'code' },
                { key: 'taxCode', header: 'Mã số thuế', type: 'code', hidden: true },
                { key: 'groupName', header: 'Mã Nhóm', hidden: true, value: (r) => (r.groupCode ? `${r.groupCode} — ${r.groupName ?? ''}` : '') },
              ] satisfies Column<GridRow>[]}
            />
          )}
        </div>
      </FilterLayout>
    </>
  );
}
