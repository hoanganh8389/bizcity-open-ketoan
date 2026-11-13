// [2026-11-11 Nguyễn Văn Thủy] Tổng hợp công nợ theo mẫu quản trị: cột TK công nợ, ba dải số dư; phải thu khách hàng / phải trả nhà cung cấp (đóng góp)
/**
 * TỔNG HỢP CÔNG NỢ theo đối tượng — một màn cho nhiều cửa vào (preset):
 *   ACC38  Tổng hợp công nợ theo đối tượng (chọn tài khoản hoặc tất cả TK công nợ)
 *   ACC38A Tổng hợp công nợ phải thu khách hàng (131) · ACC38B Tổng hợp công nợ phải trả nhà cung cấp (331) · ACC61 nội bộ (1368)
 * Tham số: kỳ, tài khoản, nhóm, đối tượng, hiển thị cả đối tượng chỉ có phát sinh; nhiều chi nhánh (lớp gắn thêm): chọn chi nhánh,
 *   tách theo chi nhánh.
 * Cột: Mã · Tên · TK công nợ · Số dư đầu kỳ (Nợ, Có) · Phát sinh (Nợ, Có) · Số dư cuối kỳ (Nợ, Có).
 * Bấm một dòng để mở chi tiết công nợ của đối tượng đó.
 */
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { api, errorText } from '@/lib/api';
import { defaultTo, kyText, periodFrom } from '@/lib/format';
import { PageHeader } from '@/components/PageHeader';
import { FilterLayout } from '@/components/ReportPanel';
import { BranchSelect, DateRange, useBranches } from '@/components/filters';
import { Empty, ErrorBox, Loading } from '@/components/ui';
import { DataGrid, type Column } from '@/components/DataGrid';
import { AccountPicker, ListPicker, PartnerPicker } from '@/components/pickers';
import { PrintButton } from '@/components/print';
import { PARTNER_BALANCE_TEMPLATES, type PartnerBalanceRow } from './mauIn/congNoTongHop';

interface Row extends PartnerBalanceRow { taxCode: string; groupCode?: string; groupName?: string }
interface Data { rows: Row[] }

export interface PartnerBalancesPreset { account: string; title: string; code: string; subtitle: string; /** Gọi đối tượng: khách hàng, nhà cung cấp… */ who?: string; /** Màn chi tiết khi bấm dòng. */ detailPath?: string }
const GENERIC: PartnerBalancesPreset = { account: '131', title: 'Tổng hợp công nợ theo đối tượng', code: 'ACC38', subtitle: 'Số dư đầu kỳ, phát sinh, số dư cuối kỳ của từng đối tượng theo tài khoản công nợ' };

export function PartnerBalancesPage({ preset }: { preset?: PartnerBalancesPreset }) {
  const p = preset ?? GENERIC;
  const who = p.who ?? 'đối tượng';
  const navigate = useNavigate();
  const multi = (useBranches().data?.length ?? 0) > 1;
  const [f, setF] = useState({ account: p.account, from: periodFrom(), to: defaultTo(), branchCodes: '', byBranch: false, groupCode: '', partnerCode: '', withMovement: true });
  const set = (patch: Partial<typeof f>) => setF((x) => ({ ...x, ...patch }));
  const groups = useQuery({ queryKey: ['partner-groups'], queryFn: () => api.get<{ code: string; name: string }[]>('/api/v1/partner-groups'), staleTime: 60_000 }).data ?? [];
  const query = { account: f.account, from: f.from, to: f.to, branchCodes: f.branchCodes, byBranch: f.byBranch, hideZero: false };
  const q = useQuery({ queryKey: ['partner-balances', query], queryFn: () => api.get<Data>('/api/v1/reports/partner-balances', query), enabled: Boolean(f.account) });
  const all = f.account === '*';
  // Lọc nhóm, đối tượng; bỏ đối tượng chỉ có phát sinh (đầu kỳ, cuối kỳ đều 0) nếu không tích.
  const rows = (q.data?.rows ?? []).filter((r) => (!f.groupCode || r.groupCode === f.groupCode) && (!f.partnerCode || r.partnerCode === f.partnerCode)
    && (f.withMovement || r.openingDebit || r.openingCredit || r.closingDebit || r.closingCredit));
  const openDetail = (r: Row) => {
    const s = new URLSearchParams({ account: r.accountCode, from: f.from, to: f.to, partnerCode: r.partnerCode, ...(f.branchCodes ? { branchCodes: f.branchCodes } : {}) });
    navigate(`${p.detailPath ?? '/bao-cao/so-chi-tiet-cong-no'}?${s.toString()}`);
  };
  const money = (key: keyof PartnerBalanceRow, band: string, header: string): Column<Row> => ({ key, header, band, type: 'money', sum: true, width: 130 });

  return (
    <>
      <PageHeader title={p.title} code={p.code} subtitle={p.subtitle} helpKey="tong-hop-cong-no" />
      <FilterLayout boThamSo={{ value: f, onApply: setF }}
        print={<PrintButton screen={p.code} templates={PARTNER_BALANCE_TEMPLATES} disabled={!rows.length}
          getDocs={() => [{ title: p.title, who, from: f.from, to: f.to, branchCodes: f.branchCodes, account: f.account, byBranch: f.byBranch, rows }]} />}
        filters={
          <>
            <DateRange from={f.from} to={f.to} onChange={(from, to) => set({ from, to })} />
            <div className="field"><label>Tài khoản</label>
              <AccountPicker className="input w-md" value={all ? '' : f.account} disabled={all} onChange={(account) => set({ account })} placeholder={all ? 'Tất cả' : p.account} />
            </div>
            {!preset && <label className="checkbox"><input type="checkbox" checked={all} onChange={(e) => set({ account: e.target.checked ? '*' : p.account })} /> Tất cả TK công nợ</label>}
            <div className="field"><label>Nhóm {who}</label><ListPicker items={groups} value={f.groupCode} onChange={(groupCode) => set({ groupCode })} placeholder="Tất cả" /></div>
            <div className="field"><label>{who[0]!.toUpperCase() + who.slice(1)}</label><PartnerPicker value={f.partnerCode} onChange={(partnerCode) => set({ partnerCode })} placeholder="Tất cả" /></div>
            <label className="checkbox"><input type="checkbox" checked={f.withMovement} onChange={(e) => set({ withMovement: e.target.checked })} /> Hiển thị cả {who} chỉ có phát sinh trong kỳ</label>
            {multi && <BranchSelect value={f.branchCodes} onChange={(branchCodes) => set({ branchCodes })} />}
            {multi && <label className="checkbox"><input type="checkbox" checked={f.byBranch} onChange={(e) => set({ byBranch: e.target.checked })} /> Tách theo chi nhánh</label>}
          </>
        }
      >
        <div className="card">
          <div className="rp-tieu-de"><h2>{p.title.toUpperCase()}</h2><i>Tài khoản: {all ? 'Tất cả' : f.account}; {kyText(f.from, f.to)}</i></div>
          <ErrorBox error={q.error ? errorText(q.error) : null} />
          {q.isLoading ? <Loading /> : !rows.length ? <Empty text="Không có công nợ trong kỳ này" /> : (
            <DataGrid
              storageKey={`${p.code.toLowerCase()}-v3`}
              rows={rows}
              rowKey={(r) => `${r.accountCode}-${r.partnerCode}-${r.branchCode}`}
              onRowClick={(r) => r.partnerCode && openDetail(r)}
              footerLabel="Tổng cộng"
              exportName={p.title} exportTitle={`${p.title} — ${kyText(f.from, f.to)}`}
              columns={[
                { key: 'partnerCode', header: `Mã ${who}`, type: 'code', width: 130 },
                { key: 'partnerName', header: `Tên ${who}`, width: 260 },
                { key: 'accountCode', header: 'TK công nợ', type: 'code', width: 90 },
                money('openingDebit', 'Số dư đầu kỳ', 'Nợ'), money('openingCredit', 'Số dư đầu kỳ', 'Có'),
                money('debit', 'Phát sinh', 'Nợ'), money('credit', 'Phát sinh', 'Có'),
                money('closingDebit', 'Số dư cuối kỳ', 'Nợ'), money('closingCredit', 'Số dư cuối kỳ', 'Có'),
                { key: 'branchCode', header: 'Chi nhánh', type: 'code', width: 90, hidden: !f.byBranch },
                { key: 'taxCode', header: 'Mã số thuế', type: 'code', hidden: true },
                { key: 'groupName', header: `Nhóm ${who}`, hidden: true, value: (r) => (r.groupCode ? `${r.groupCode} — ${r.groupName ?? ''}` : '') },
              ]}
            />
          )}
        </div>
      </FilterLayout>
    </>
  );
}
