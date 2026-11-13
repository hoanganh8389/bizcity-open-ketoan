// [2026-11-11 Nguyễn Văn Thủy] Bảng cân đối tài khoản theo mẫu quản trị: bậc tài khoản, số dư hai bên, phát sinh lũy kế từ đầu năm (đóng góp)
/**
 * BẢNG CÂN ĐỐI TÀI KHOẢN (ACC10). Bấm một tài khoản để mở sổ chi tiết của tài khoản đó.
 *   Tham số: kỳ; Bậc tài khoản (1–5, trống = mọi bậc); Hiển thị số dư hai bên (tắt = bù trừ Nợ / Có thành một bên);
 *   nhánh tài khoản; nhiều chi nhánh (lớp gắn thêm): chọn chi nhánh.
 *   Cột: Số tài khoản · Tên tài khoản · Đầu kỳ (Nợ, Có) · Phát sinh (Nợ, Có, Nợ lũy kế, Có lũy kế) · Cuối kỳ (Nợ, Có).
 *   Lũy kế: phát sinh từ ngày đầu năm tài chính của kỳ đến hết kỳ. Tổng cộng chỉ cộng tài khoản chi tiết.
 *   In: Bảng cân đối tài khoản (mẫu quản trị) và S06-DN.
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
import { AccountPicker } from '@/components/pickers';
import { PrintButton } from '@/components/print';
import { TRIAL_BALANCE_TEMPLATES, type TbRow } from './mauIn/baoCaoTaiChinh';

interface ApiRow { code: string; name: string; level: number; isPosting: boolean; openingDebit: number; openingCredit: number; debit: number; credit: number; closingDebit: number; closingCredit: number }
interface Data { rows: ApiRow[] }

/** Bù trừ Nợ / Có thành một bên. */
const net = (d: number, c: number): [number, number] => (d >= c ? [Math.round((d - c) * 100) / 100, 0] : [0, Math.round((c - d) * 100) / 100]);
const MONEY_KEYS = ['openingDebit', 'openingCredit', 'debit', 'credit', 'cumDebit', 'cumCredit', 'closingDebit', 'closingCredit'] as const;

export function TrialBalancePage() {
  const nav = useNavigate();
  const multi = (useBranches().data?.length ?? 0) > 1;
  const [f, setF] = useState({ from: periodFrom(), to: defaultTo(), branchCodes: '', account: '', level: '', haiBen: false });
  const set = (p: Partial<typeof f>) => setF((x) => ({ ...x, ...p }));
  const base = { branchCodes: f.branchCodes, account: f.account, postingOnly: false };
  const q = useQuery({ queryKey: ['trial-balance', f.from, f.to, base], queryFn: () => api.get<Data>('/api/v1/reports/trial-balance', { ...base, from: f.from, to: f.to }) });
  // Lũy kế: từ đầu năm tài chính (năm của ngày cuối kỳ) đến hết kỳ.
  const yearStart = `${f.to.slice(0, 4)}-01-01`;
  const cum = useQuery({ queryKey: ['trial-balance', yearStart, f.to, base], queryFn: () => api.get<Data>('/api/v1/reports/trial-balance', { ...base, from: yearStart, to: f.to }) });

  const cumBy = new Map((cum.data?.rows ?? []).map((r) => [r.code, r]));
  const all: TbRow[] = (q.data?.rows ?? []).map((r) => {
    const [od, oc] = f.haiBen ? [r.openingDebit, r.openingCredit] : net(r.openingDebit, r.openingCredit);
    const [cd, cc] = f.haiBen ? [r.closingDebit, r.closingCredit] : net(r.closingDebit, r.closingCredit);
    return { ...r, openingDebit: od, openingCredit: oc, closingDebit: cd, closingCredit: cc, cumDebit: cumBy.get(r.code)?.debit ?? 0, cumCredit: cumBy.get(r.code)?.credit ?? 0 };
  });
  const rows = f.level ? all.filter((r) => r.level <= Number(f.level)) : all;
  const totals = Object.fromEntries(MONEY_KEYS.map((k) => [k, all.filter((r) => r.isPosting).reduce((s, r) => s + Math.round((r[k] ?? 0) * 100), 0) / 100])) as Record<(typeof MONEY_KEYS)[number], number>;
  const col = (key: (typeof MONEY_KEYS)[number], band: string, header: string): Column<TbRow> => ({ key, header, band, type: 'money', width: 130, footerValue: () => totals[key] });

  return (
    <>
      <PageHeader title="Bảng cân đối tài khoản" code="ACC10" subtitle="Số dư đầu kỳ, phát sinh trong kỳ và lũy kế, số dư cuối kỳ theo tài khoản; tài khoản tổng hợp in đậm" helpKey="can-doi-phat-sinh" />
      <FilterLayout boThamSo={{ value: f, onApply: setF }}
        print={<PrintButton screen="ACC10" templates={TRIAL_BALANCE_TEMPLATES} disabled={!rows.length} getDocs={() => [{ from: f.from, to: f.to, branchCodes: f.branchCodes, account: f.account, rows }]} />}
        filters={
          <>
            <DateRange from={f.from} to={f.to} onChange={(from, to) => set({ from, to })} />
            <div className="field"><label>Bậc tài khoản</label>
              <select className="select input" value={f.level} onChange={(e) => set({ level: e.target.value })}>
                <option value="">Tất cả</option>{[1, 2, 3, 4, 5].map((n) => <option key={n} value={n}>{n}</option>)}
              </select>
            </div>
            <label className="checkbox"><input type="checkbox" checked={f.haiBen} onChange={(e) => set({ haiBen: e.target.checked })} /> Hiển thị số dư hai bên</label>
            <div className="field"><label>Nhánh tài khoản</label><AccountPicker className="input w-md" value={f.account} onChange={(account) => set({ account })} placeholder="Tất cả" /></div>
            {multi && <BranchSelect value={f.branchCodes} onChange={(branchCodes) => set({ branchCodes })} />}
          </>
        }
      >
        <div className="card">
          <div className="rp-tieu-de"><h2>BẢNG CÂN ĐỐI TÀI KHOẢN</h2><i>{kyText(f.from, f.to)}</i></div>
          <ErrorBox error={q.error ? errorText(q.error) : null} />
          {q.isLoading ? <Loading /> : !rows.length ? <Empty text="Không có số liệu trong kỳ này" /> : (
            <DataGrid
              storageKey="acc10-v2"
              rows={rows}
              rowKey={(r) => r.code}
              onRowClick={(r) => nav(`/bao-cao/so-chi-tiet?account=${r.code}&from=${f.from}&to=${f.to}`)}
              rowClassName={(r) => (r.isPosting ? '' : 'bold')}
              footerLabel="Tổng cộng"
              exportName="bang-can-doi-tai-khoan" exportTitle={`Bảng cân đối tài khoản — ${kyText(f.from, f.to)}`}
              columns={[
                { key: 'code', header: 'Số tài khoản', type: 'code', width: 110 },
                { key: 'name', header: 'Tên tài khoản', width: 300, render: (r) => <span style={{ paddingLeft: Math.min(r.level - 1, 4) * 12 }}>{r.name}</span> },
                col('openingDebit', 'Đầu kỳ', 'Nợ'), col('openingCredit', 'Đầu kỳ', 'Có'),
                col('debit', 'Phát sinh', 'Nợ'), col('credit', 'Phát sinh', 'Có'), col('cumDebit', 'Phát sinh', 'Nợ lũy kế'), col('cumCredit', 'Phát sinh', 'Có lũy kế'),
                col('closingDebit', 'Cuối kỳ', 'Nợ'), col('closingCredit', 'Cuối kỳ', 'Có'),
              ]}
            />
          )}
        </div>
      </FilterLayout>
    </>
  );
}
