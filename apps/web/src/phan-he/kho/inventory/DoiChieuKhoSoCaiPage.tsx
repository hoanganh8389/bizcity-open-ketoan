// [2026-11-11 Nguyễn Văn Thủy] Báo cáo đối chiếu kho và sổ cái (KHO07): sổ cái tài khoản kho ↔ sổ kho theo từng kỳ, chênh lệch (đóng góp)
/**
 * BÁO CÁO ĐỐI CHIẾU KHO VÀ SỔ CÁI (KHO07).
 *   Tham số: kỳ; Kỳ đối chiếu (Ngày / Tháng, tối đa 62 kỳ); tài khoản kho (mặc định 156); nhiều chi nhánh (lớp gắn thêm): chọn chi nhánh.
 *   Dòng đầu: số dư / tồn kho trước kỳ; mỗi kỳ một dòng (chỉ kỳ có phát sinh); Tổng cộng.
 *   Cột: Kỳ đối chiếu · Theo sổ cái (Phát sinh Nợ, Phát sinh Có, Số dư) · Theo sổ kho (Nhập kho, Xuất kho, Tồn kho) ·
 *        Chênh lệch (PS Nợ − Nhập kho, PS Có − Xuất kho, Số dư − Tồn kho).
 *   Số liệu: sổ cái = /reports/account-ledger (kind ledger) gom theo kỳ; sổ kho = /inventory/stock-movement từng kỳ (cộng mọi mặt hàng).
 *   Sổ kho gồm mọi mặt hàng có theo dõi kho — chọn đúng tài khoản kho đang dùng cho các mặt hàng đó.
 */
import { useState } from 'react';
import { useQueries, useQuery } from '@tanstack/react-query';
import { api, errorText } from '@/lib/api';
import { date, defaultTo, kyText, periodFrom } from '@/lib/format';
import { PageHeader } from '@/components/PageHeader';
import { FilterLayout } from '@/components/ReportPanel';
import { BranchSelect, DateRange, useBranches } from '@/components/filters';
import { Empty, ErrorBox, Loading } from '@/components/ui';
import { DataGrid, type Column } from '@/components/DataGrid';
import { AccountPicker } from '@/components/pickers';

interface Ledger { opening: { debit: number; credit: number }; rows: { postingDate: string; debit: number; credit: number }[] }
interface Stock { rows: { openingValue: number; inValue: number; outValue: number; closingValue: number }[] }
interface Row { key: string; label: string; open?: boolean; debit: number; credit: number; balance: number; inV: number; outV: number; stock: number }

const r2 = (n: number) => Math.round(n * 100) / 100;
const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
/** Chia [from, to] thành các kỳ ngày / tháng. */
function periods(from: string, to: string, mode: 'ngay' | 'thang'): { from: string; to: string; label: string }[] {
  const out: { from: string; to: string; label: string }[] = [];
  const d = new Date(`${from}T00:00:00`);
  const end = new Date(`${to}T00:00:00`);
  while (d <= end && out.length < 62) {
    if (mode === 'ngay') { const x = iso(d); out.push({ from: x, to: x, label: date(x) }); d.setDate(d.getDate() + 1); continue; }
    const last = new Date(d.getFullYear(), d.getMonth() + 1, 0);
    const t = last < end ? iso(last) : to;
    out.push({ from: iso(d), to: t, label: `Tháng ${d.getMonth() + 1}/${d.getFullYear()}` });
    d.setTime(new Date(d.getFullYear(), d.getMonth() + 1, 1).getTime());
  }
  return out;
}

export function DoiChieuKhoSoCaiPage() {
  const multi = (useBranches().data?.length ?? 0) > 1;
  const [f, setF] = useState({ from: periodFrom(), to: defaultTo(), account: '156', mode: 'ngay' as 'ngay' | 'thang', branchCodes: '' });
  const set = (p: Partial<typeof f>) => setF((x) => ({ ...x, ...p }));
  const ps = periods(f.from, f.to, f.mode);
  const led = useQuery({ queryKey: ['account-ledger', 'doi-chieu-kho', f], enabled: Boolean(f.account), queryFn: () => api.get<Ledger>('/api/v1/reports/account-ledger', { account: f.account, from: f.from, to: f.to, branchCodes: f.branchCodes, kind: 'ledger', groupMode: '1' }) });
  const sts = useQueries({ queries: ps.map((p) => ({ queryKey: ['stock-movement', 'doi-chieu', p.from, p.to, f.branchCodes], queryFn: () => api.get<Stock>('/api/v1/inventory/stock-movement', { from: p.from, to: p.to, branchCodes: f.branchCodes }) })) });
  const loading = led.isLoading || sts.some((q) => q.isLoading);
  const error = led.error ?? sts.find((q) => q.error)?.error;
  const sum = (s: Stock | undefined, k: keyof Stock['rows'][number]) => r2((s?.rows ?? []).reduce((a, r) => a + r[k], 0));

  const rows: Row[] = [];
  if (!loading && led.data) {
    let balance = r2(led.data.opening.debit - led.data.opening.credit);
    rows.push({ key: 'open', label: date(iso(new Date(new Date(`${f.from}T00:00:00`).getTime() - 86_400_000))), open: true, debit: 0, credit: 0, balance, inV: 0, outV: 0, stock: sum(sts[0]?.data, 'openingValue') });
    ps.forEach((p, i) => {
      const ls = led.data!.rows.filter((r) => r.postingDate >= p.from && r.postingDate <= p.to);
      const debit = r2(ls.reduce((a, r) => a + r.debit, 0));
      const credit = r2(ls.reduce((a, r) => a + r.credit, 0));
      const s = sts[i]?.data;
      // Giảm giá / trả lại hàng mua ghi nhập âm trên sổ kho (sổ cái ghi Có): theo từng mã, nhập âm tính sang xuất, xuất âm tính sang nhập.
      let inV = 0; let outV = 0;
      for (const r of s?.rows ?? []) { inV += Math.max(r.inValue, 0) - Math.min(r.outValue, 0); outV += Math.max(r.outValue, 0) - Math.min(r.inValue, 0); }
      inV = r2(inV); outV = r2(outV);
      balance = r2(balance + debit - credit);
      if (debit || credit || inV || outV) rows.push({ key: p.from, label: p.label, debit, credit, balance, inV, outV, stock: sum(s, 'closingValue') });
    });
  }
  const last = rows[rows.length - 1];
  const diff = (a: number, b: number) => r2(a - b) || null;
  const total = (k: 'debit' | 'credit' | 'inV' | 'outV') => r2(rows.reduce((a, r) => a + r[k], 0));
  const columns: Column<Row>[] = [
    { key: 'label', header: 'Kỳ đối chiếu', width: 130, noSort: true, render: (r) => (r.open ? <b>{r.label}</b> : r.label) },
    { key: 'debit', header: 'Phát sinh Nợ', band: 'Theo sổ cái', type: 'money', width: 140, noSort: true, footerValue: () => total('debit') },
    { key: 'credit', header: 'Phát sinh Có', band: 'Theo sổ cái', type: 'money', width: 140, noSort: true, footerValue: () => total('credit') },
    { key: 'balance', header: 'Số dư', band: 'Theo sổ cái', type: 'money', width: 150, noSort: true, bold: true, footerValue: () => last?.balance ?? 0 },
    { key: 'inV', header: 'Nhập kho', band: 'Theo sổ kho', type: 'money', width: 140, noSort: true, footerValue: () => total('inV') },
    { key: 'outV', header: 'Xuất kho', band: 'Theo sổ kho', type: 'money', width: 140, noSort: true, footerValue: () => total('outV') },
    { key: 'stock', header: 'Tồn kho', band: 'Theo sổ kho', type: 'money', width: 150, noSort: true, bold: true, footerValue: () => last?.stock ?? 0 },
    { key: 'dIn', header: 'PS Nợ − Nhập kho', band: 'Chênh lệch', type: 'money', width: 140, noSort: true, value: (r) => diff(r.debit, r.inV), footerValue: () => r2(total('debit') - total('inV')) },
    { key: 'dOut', header: 'PS Có − Xuất kho', band: 'Chênh lệch', type: 'money', width: 140, noSort: true, value: (r) => diff(r.credit, r.outV), footerValue: () => r2(total('credit') - total('outV')) },
    { key: 'dBal', header: 'Số dư − Tồn kho', band: 'Chênh lệch', type: 'money', width: 150, noSort: true, bold: true, value: (r) => diff(r.balance, r.stock), footerValue: () => r2((last?.balance ?? 0) - (last?.stock ?? 0)) },
  ];
  return (
    <>
      <PageHeader title="Báo cáo đối chiếu kho và sổ cái" code="KHO07" subtitle="So phát sinh, số dư tài khoản kho trên sổ cái với nhập, xuất, tồn trên sổ kho theo từng ngày / tháng" helpKey="nhap-xuat-ton" />
      <FilterLayout boThamSo={{ value: f, onApply: setF }}
        filters={
          <>
            <DateRange from={f.from} to={f.to} onChange={(from, to) => set({ from, to })} />
            <div className="field"><label>Kỳ đối chiếu</label>
              <select className="select input" value={f.mode} onChange={(e) => set({ mode: e.target.value as 'ngay' | 'thang' })}><option value="ngay">Ngày</option><option value="thang">Tháng</option></select>
            </div>
            <div className="field"><label>Tài khoản kho</label><AccountPicker className="input w-md" value={f.account} onChange={(account) => set({ account })} placeholder="156" /></div>
            {multi && <BranchSelect value={f.branchCodes} onChange={(branchCodes) => set({ branchCodes })} />}
          </>
        }>
        <div className="card">
          <div className="rp-tieu-de"><h2>BÁO CÁO ĐỐI CHIẾU KHO VÀ SỔ CÁI</h2><i>Tài khoản: {f.account}; Kỳ đối chiếu: {f.mode === 'ngay' ? 'Ngày' : 'Tháng'}; {kyText(f.from, f.to)}</i></div>
          <ErrorBox error={error ? errorText(error) : null} />
          {ps.length >= 62 && <div className="card-body muted">Chỉ đối chiếu 62 kỳ đầu — chọn Kỳ đối chiếu theo tháng hoặc thu hẹp khoảng ngày.</div>}
          {loading ? <Loading /> : !rows.length ? <Empty /> : (
            <DataGrid storageKey="kho07" rows={rows} rowKey={(r) => r.key} columns={columns} footerLabel="Tổng cộng" rowClassName={(r) => (r.open ? 'bold' : '')}
              exportName="doi-chieu-kho-so-cai" exportTitle={`Báo cáo đối chiếu kho và sổ cái — ${kyText(f.from, f.to)}`} />
          )}
        </div>
      </FilterLayout>
    </>
  );
}
