/**
 * Công nợ theo tuổi nợ, tính theo hạn thanh toán của từng khoản công nợ:
 *   ACC67   kiểu 3: Tổng nợ, Không có hạn nợ, các cột trước hạn, Tổng trước hạn, các cột quá hạn, Tổng quá hạn
 *   ACC67A  kiểu 1: Không có hạn nợ, các cột trước hạn (TH)
 *   ACC67B  kiểu 2: Không có hạn nợ, các cột quá hạn (QH)
 * Ô lọc: Số tài khoản, Nhóm KH, KH/NCC, Đến ngày, Bước nhảy, Chi nhánh. Bấm một dòng để mở sổ chi tiết công nợ.
 */
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { api, errorText } from '@/lib/api';
import { today } from '@/lib/format';
import { PageHeader } from '@/components/PageHeader';
import { FilterLayout } from '@/components/ReportPanel';
import { BranchSelect } from '@/components/filters';
import { Empty, ErrorBox, Loading } from '@/components/ui';
import { DataGrid, type Column } from '@/components/DataGrid';
import { AccountPicker, ListPicker, PartnerPicker } from '@/components/pickers';
import { PrintButton } from '@/components/print';
import { AGING_TEMPLATES, type AgingSheet } from './mauIn/tuoiNo';

interface Row { partnerCode: string; partnerName: string; groupCode: string; total: number; noTerm: number; before: number[]; beforeTotal: number; over: number[]; overTotal: number }
interface Data { asOf: string; step: number; side: 'debit' | 'credit'; ranges: string[]; rows: Row[] }
export interface AgingDuePreset { code: string; title: string; subtitle: string; kind: 1 | 2 | 3 }

export function AgingDuePage({ preset }: { preset: AgingDuePreset }) {
  const navigate = useNavigate();
  const [f, setF] = useState({ account: '131', groupCode: '', partnerCode: '', asOf: today(), step: 30, branchCodes: '' });
  const [stepText, setStepText] = useState('30');
  const set = (patch: Partial<typeof f>) => setF((x) => ({ ...x, ...patch }));
  const groups = useQuery({ queryKey: ['partner-groups'], queryFn: () => api.get<{ code: string; name: string }[]>('/api/v1/partner-groups'), staleTime: 60_000 }).data ?? [];
  const q = useQuery({ queryKey: ['aging-due', f], queryFn: () => api.get<Data>('/api/v1/reports/aging-due', { ...f, account: f.account || '131' }) });
  const d = q.data;
  const k = preset.kind;
  const open = (r: Row) => navigate(`/bao-cao/so-chi-tiet?${new URLSearchParams({ account: f.account || '131', to: f.asOf, partnerCode: r.partnerCode }).toString()}`);
  const money = (key: string, header: string, value: (r: Row) => number, bold = false): Column<Row> => ({ key, header, type: 'money', sum: true, bold, value });
  const columns: Column<Row>[] = d ? [
    { key: 'partnerCode', header: 'Mã khách hàng', type: 'code' },
    { key: 'partnerName', header: 'Tên khách hàng' },
    ...(k === 3 ? [money('total', 'Tổng nợ', (r) => r.total, true)] : []),
    money('noTerm', 'Không có hạn nợ', (r) => r.noTerm),
    ...(k !== 2 ? d.ranges.map((l, i) => money(`th${i}`, `TH ${l}`, (r) => r.before[i] ?? 0)) : []),
    ...(k === 3 ? [money('beforeTotal', 'Tổng trước hạn', (r) => r.beforeTotal, true)] : []),
    ...(k !== 1 ? d.ranges.map((l, i) => money(`qh${i}`, `QH ${l}`, (r) => r.over[i] ?? 0)) : []),
    ...(k === 3 ? [money('overTotal', 'Tổng quá hạn', (r) => r.overTotal, true)] : []),
    { key: 'groupCode', header: 'Nhóm KH', type: 'code', hidden: true },
  ] : [];
  const rows = (d?.rows ?? []).filter((r) => (k === 1 ? r.noTerm || r.beforeTotal : k === 2 ? r.noTerm || r.overTotal : true));

  return (
    <>
      <PageHeader title={preset.title} code={preset.code} subtitle={preset.subtitle} helpKey="tuoi-no" />
      <FilterLayout
        print={<PrintButton screen={preset.code} templates={AGING_TEMPLATES} disabled={!d || !rows.length}
          getDocs={(): AgingSheet[] => (d ? [{ code: preset.code, title: preset.title, kind: k, asOf: f.asOf, step: d.step, account: f.account || '131', branchCodes: f.branchCodes, ranges: d.ranges, rows }] : [])} />}
        filters={
          <>
            <div className="field"><label>Số tài khoản</label><AccountPicker className="input" value={f.account} onChange={(account) => set({ account })} /></div>
            <div className="field"><label>Nhóm KH</label><ListPicker items={groups} value={f.groupCode} onChange={(groupCode) => set({ groupCode })} placeholder="Tất cả" /></div>
            <div className="field"><label>KH/NCC</label><PartnerPicker value={f.partnerCode} onChange={(partnerCode) => set({ partnerCode })} placeholder="Tất cả" /></div>
            <div className="field"><label>Đến ngày</label><input type="date" className="input" value={f.asOf} onChange={(e) => e.target.value && set({ asOf: e.target.value })} /></div>
            <div className="field"><label>Bước nhảy</label><input className="input num" inputMode="numeric" value={stepText} onChange={(e) => setStepText(e.target.value)} onBlur={() => set({ step: Math.min(365, Math.max(1, Number(stepText) || 30)) })} /></div>
            <BranchSelect value={f.branchCodes} onChange={(branchCodes) => set({ branchCodes })} />
          </>
        }
        onSearch={() => set({ step: Math.min(365, Math.max(1, Number(stepText) || 30)) })}
      >
        <div className="card">
          <ErrorBox error={q.error ? errorText(q.error) : null} />
          {q.isLoading ? <Loading /> : !d || rows.length === 0 ? <Empty text="Không có đối tượng nào còn nợ tại ngày này" /> : (
            <DataGrid
              storageKey={`${preset.code.toLowerCase()}-v2`}
              rows={rows}
              rowKey={(r) => r.partnerCode}
              onRowClick={open}
              groupable
              exportName={`${preset.code}-${f.asOf}`}
              columns={columns}
            />
          )}
        </div>
      </FilterLayout>
    </>
  );
}
