// [2026-11-11 Nguyễn Văn Thủy] Báo cáo theo nhiều chi nhánh (góc quản trị nhiều cấp): mỗi chi nhánh một cột (đóng góp)
/**
 * BÁO CÁO THEO NHIỀU CHI NHÁNH — mỗi chi nhánh (kho) một cột, cột Tổng đứng đầu. Chi nhánh: chọn ở tham số, trống = các chi nhánh có phát sinh (ACC9N: từ đầu năm trước; ACC10N: đến hết kỳ) — xem useChosen.
 *   KetQuaNhieuChiNhanhPage  ACC9N  Kết quả hoạt động kinh doanh theo nhiều chi nhánh: chỉ tiêu B02 · Kỳ này / Kỳ trước (cùng kỳ năm trước).
 *                                   Số liệu: /reports/income-statement từng chi nhánh.
 *   CanDoiNhieuChiNhanhPage  ACC10N Bảng cân đối tài khoản theo nhiều chi nhánh: chọn chỉ tiêu (Nợ / Có đầu kỳ, phát sinh, cuối kỳ),
 *                                   mỗi chỉ tiêu một dải cột theo chi nhánh. Số dư bù trừ một bên. Số liệu: /reports/trial-balance từng chi nhánh.
 *   TonNhieuKhoPage          ACC83N Tổng hợp tồn trên nhiều kho (bảng chéo): tồn đến ngày, mỗi kho một cột số lượng hoặc giá trị.
 *                                   Số liệu: /inventory/stock-movement (một lần, theo chi nhánh × mặt hàng).
 */
import { useState } from 'react';
import { useQueries, useQuery } from '@tanstack/react-query';
import { api, errorText } from '@/lib/api';
import { date, defaultTo, kyText, periodFrom } from '@/lib/format';
import { PageHeader } from '@/components/PageHeader';
import { FilterLayout } from '@/components/ReportPanel';
import { BranchSelect, DateRange, useBranches, type BranchOption } from '@/components/filters';
import { Empty, ErrorBox, Loading } from '@/components/ui';
import { DataGrid, type Column } from '@/components/DataGrid';
import { AccountPicker } from '@/components/pickers';

/**
 * Chi nhánh làm cột: đã chọn ở tham số; trống thì (khi có ky) chỉ các chi nhánh CÓ PHÁT SINH trong kỳ — một lần gọi
 * Bảng tổng hợp chứng từ gom theo chi nhánh — vì đơn vị có thể có hàng trăm chi nhánh; không có ky thì mọi chi nhánh đang dùng.
 */
function useChosen(codes: string, ky?: { from: string; to: string }): BranchOption[] {
  const all = (useBranches().data ?? []).filter((b) => b.isActive);
  const picked = new Set(codes.split(',').filter(Boolean));
  const act = useQuery({
    queryKey: ['posting-summary', 'chi-nhanh', ky], enabled: Boolean(ky) && !picked.size,
    queryFn: () => api.get<{ rows: { branchCode: string }[] }>('/api/v1/reports/posting-summary', { from: ky!.from, to: ky!.to, groups: 'branch' }),
  });
  const active = new Set((act.data?.rows ?? []).map((r) => r.branchCode));
  return picked.size ? all.filter((b) => picked.has(b.code)) : ky ? all.filter((b) => active.has(b.code)) : all;
}
const r2 = (n: number) => Math.round(n * 100) / 100;
const branchCol = <T,>(b: BranchOption, key: string, band: string, value: (r: T) => number | null, type: Column<T>['type'] = 'money'): Column<T> =>
  ({ key: `${key}-${b.code}`, header: b.code, title: b.name, band, type, width: 130, noSort: true, value });

/* ------------------------------------------------------------------ ACC9N */
interface IsRow { code: string; name: string; bold: boolean; current: number; previous: number }

export function KetQuaNhieuChiNhanhPage() {
  const [f, setF] = useState({ from: periodFrom(), to: defaultTo(), branchCodes: '' });
  const set = (p: Partial<typeof f>) => setF((x) => ({ ...x, ...p }));
  const branches = useChosen(f.branchCodes, { from: `${Number(f.from.slice(0, 4)) - 1}-01-01`, to: f.to });
  const qs = useQueries({ queries: branches.map((b) => ({ queryKey: ['income-statement', { ...f, branchCodes: b.code }], queryFn: () => api.get<{ rows: IsRow[] }>('/api/v1/reports/income-statement', { ...f, branchCodes: b.code }) })) });
  const loading = qs.some((q) => q.isLoading);
  const error = qs.find((q) => q.error)?.error;
  const by = branches.map((b, i) => new Map((qs[i]?.data?.rows ?? []).map((r) => [r.code, r])));
  const base = qs.find((q) => q.data)?.data?.rows ?? [];
  type Row = IsRow & { cur: number[]; prev: number[] };
  const rows: Row[] = base.map((r) => ({ ...r, cur: by.map((m) => m.get(r.code)?.current ?? 0), prev: by.map((m) => m.get(r.code)?.previous ?? 0) }));
  const total = (xs: number[]) => r2(xs.reduce((a, b) => a + b, 0));
  // Chỉ hiện chi nhánh có số ở kỳ này hoặc kỳ trước.
  const shown = branches.map((b, i) => ({ b, i })).filter(({ i }) => rows.some((r) => r.cur[i] || r.prev[i]));
  const columns: Column<Row>[] = [
    { key: 'name', header: 'Chỉ tiêu', width: 380, noSort: true, render: (r) => (r.bold ? <b>{r.name}</b> : r.name) },
    { key: 'code', header: 'Mã số', type: 'code', width: 70, noSort: true },
    { key: 'curTotal', header: 'Tổng', band: 'Kỳ này', type: 'money', width: 140, noSort: true, bold: true, value: (r) => total(r.cur) },
    ...shown.map(({ b, i }) => branchCol<Row>(b, 'cur', 'Kỳ này', (r) => r.cur[i] ?? 0)),
    { key: 'prevTotal', header: 'Tổng', band: 'Kỳ trước', type: 'money', width: 140, noSort: true, bold: true, value: (r) => total(r.prev) },
    ...shown.map(({ b, i }) => branchCol<Row>(b, 'prev', 'Kỳ trước', (r) => r.prev[i] ?? 0)),
  ];
  return (
    <>
      <PageHeader title="Kết quả hoạt động kinh doanh theo nhiều chi nhánh" code="ACC9N" subtitle="Các chỉ tiêu B02 của từng chi nhánh trong kỳ và cùng kỳ năm trước" helpKey="ket-qua-kinh-doanh" />
      <FilterLayout boThamSo={{ value: f, onApply: setF }}
        filters={<><DateRange from={f.from} to={f.to} onChange={(from, to) => set({ from, to })} /><BranchSelect value={f.branchCodes} onChange={(branchCodes) => set({ branchCodes })} /></>}>
        <div className="card">
          <div className="rp-tieu-de"><h2>BÁO CÁO KẾT QUẢ HOẠT ĐỘNG KINH DOANH THEO NHIỀU CHI NHÁNH</h2><i>{kyText(f.from, f.to)}</i></div>
          <ErrorBox error={error ? errorText(error) : null} />
          {loading ? <Loading /> : !rows.length ? <Empty /> : (
            <DataGrid storageKey="acc9n" rows={rows} rowKey={(r) => r.code} columns={columns} footerLabel={false} rowClassName={(r) => (r.bold ? 'bold' : '')}
              exportName="ket-qua-kinh-doanh-nhieu-chi-nhanh" exportTitle={`Kết quả hoạt động kinh doanh theo nhiều chi nhánh — ${kyText(f.from, f.to)}`} />
          )}
        </div>
      </FilterLayout>
    </>
  );
}

/* ------------------------------------------------------------------ ACC10N */
interface TbRow { code: string; name: string; level: number; isPosting: boolean; openingDebit: number; openingCredit: number; debit: number; credit: number; closingDebit: number; closingCredit: number }
const TB_MEASURES = [
  ['openingDebit', 'Nợ đầu kỳ'], ['openingCredit', 'Có đầu kỳ'], ['debit', 'Phát sinh Nợ trong kỳ'], ['credit', 'Phát sinh Có trong kỳ'], ['closingDebit', 'Nợ cuối kỳ'], ['closingCredit', 'Có cuối kỳ'],
] as const;
type TbKey = (typeof TB_MEASURES)[number][0];
const net = (d: number, c: number): [number, number] => (d >= c ? [r2(d - c), 0] : [0, r2(c - d)]);

export function CanDoiNhieuChiNhanhPage() {
  const [f, setF] = useState({ from: periodFrom(), to: defaultTo(), branchCodes: '', account: '', level: '1', measures: 'openingDebit,openingCredit,debit,credit,closingDebit,closingCredit' });
  const set = (p: Partial<typeof f>) => setF((x) => ({ ...x, ...p }));
  const branches = useChosen(f.branchCodes, { from: '2000-01-01', to: f.to });
  const q0 = { from: f.from, to: f.to, account: f.account, postingOnly: false };
  const qs = useQueries({ queries: branches.map((b) => ({ queryKey: ['trial-balance', f.from, f.to, { ...q0, branchCodes: b.code }], queryFn: () => api.get<{ rows: TbRow[] }>('/api/v1/reports/trial-balance', { ...q0, branchCodes: b.code }) })) });
  const loading = qs.some((q) => q.isLoading);
  const error = qs.find((q) => q.error)?.error;
  // Gộp danh sách tài khoản của mọi chi nhánh; số dư bù trừ một bên theo từng chi nhánh.
  const acc = new Map<string, TbRow>();
  const by = branches.map((_, i) => {
    const m = new Map<string, TbRow>();
    for (const r of qs[i]?.data?.rows ?? []) {
      const [od, oc] = net(r.openingDebit, r.openingCredit);
      const [cd, cc] = net(r.closingDebit, r.closingCredit);
      m.set(r.code, { ...r, openingDebit: od, openingCredit: oc, closingDebit: cd, closingCredit: cc });
      if (!acc.has(r.code)) acc.set(r.code, r);
    }
    return m;
  });
  const rows = [...acc.values()].filter((r) => !f.level || r.level <= Number(f.level)).sort((a, b) => a.code.localeCompare(b.code));
  const measures = TB_MEASURES.filter(([k]) => f.measures.split(',').includes(k));
  const on = (k: TbKey) => f.measures.split(',').includes(k);
  const toggle = (k: TbKey) => set({ measures: TB_MEASURES.map(([x]) => x).filter((x) => (x === k ? !on(x) : on(x))).join(',') });
  const val = (i: number, r: TbRow, k: TbKey) => by[i]?.get(r.code)?.[k] ?? 0;
  // Chỉ hiện chi nhánh có số ở các chỉ tiêu đang xem.
  const shown = branches.map((b, i) => ({ b, i })).filter(({ i }) => rows.some((r) => measures.some(([k]) => val(i, r, k))));
  const columns: Column<TbRow>[] = [
    { key: 'code', header: 'Số tài khoản', type: 'code', width: 100 },
    { key: 'name', header: 'Tên tài khoản', width: 240, render: (r) => <span style={{ paddingLeft: Math.min(r.level - 1, 4) * 12 }}>{r.name}</span> },
    ...measures.flatMap(([k, l]) => [
      { key: `${k}-tong`, header: 'Tổng', band: l, type: 'money', width: 130, bold: true, value: (r: TbRow) => r2(branches.reduce((s, _, i) => s + val(i, r, k), 0)) } as Column<TbRow>,
      ...shown.map(({ b, i }) => branchCol<TbRow>(b, k, l, (r) => val(i, r, k))),
    ]),
  ];
  return (
    <>
      <PageHeader title="Bảng cân đối tài khoản theo nhiều chi nhánh" code="ACC10N" subtitle="Số dư đầu kỳ, phát sinh, số dư cuối kỳ từng tài khoản của từng chi nhánh" helpKey="can-doi-phat-sinh" />
      <FilterLayout boThamSo={{ value: f, onApply: setF }}
        filters={
          <>
            <DateRange from={f.from} to={f.to} onChange={(from, to) => set({ from, to })} />
            <div className="field"><label>Bậc tài khoản</label>
              <select className="select input" value={f.level} onChange={(e) => set({ level: e.target.value })}><option value="">Tất cả</option>{[1, 2, 3, 4, 5].map((n) => <option key={n} value={n}>{n}</option>)}</select>
            </div>
            <div className="field"><label>Nhánh tài khoản</label><AccountPicker className="input w-md" value={f.account} onChange={(account) => set({ account })} placeholder="Tất cả" /></div>
            <div className="field"><label>Chỉ tiêu hiển thị</label>
              <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', paddingTop: 6 }}>{TB_MEASURES.map(([k, l]) => <label key={k} className="checkbox"><input type="checkbox" checked={on(k)} onChange={() => toggle(k)} /> {l}</label>)}</div>
            </div>
            <BranchSelect value={f.branchCodes} onChange={(branchCodes) => set({ branchCodes })} />
          </>
        }>
        <div className="card">
          <div className="rp-tieu-de"><h2>BẢNG CÂN ĐỐI TÀI KHOẢN THEO NHIỀU CHI NHÁNH</h2><i>{kyText(f.from, f.to)}</i></div>
          <ErrorBox error={error ? errorText(error) : null} />
          {loading ? <Loading /> : !rows.length ? <Empty /> : (
            <DataGrid storageKey="acc10n" rows={rows} rowKey={(r) => r.code} columns={columns} footerLabel={false} rowClassName={(r) => (r.isPosting ? '' : 'bold')}
              exportName="can-doi-tai-khoan-nhieu-chi-nhanh" exportTitle={`Bảng cân đối tài khoản theo nhiều chi nhánh — ${kyText(f.from, f.to)}`} />
          )}
        </div>
      </FilterLayout>
    </>
  );
}

/* ------------------------------------------------------------------ ACC83N */
interface StockRow { branchCode: string; sku: string; name: string; unit: string; closingQty: number; closingValue: number }

export function TonNhieuKhoPage() {
  const [f, setF] = useState({ to: defaultTo(), branchCodes: '', search: '', value: false });
  const set = (p: Partial<typeof f>) => setF((x) => ({ ...x, ...p }));
  const branches = useChosen(f.branchCodes);
  const q = useQuery({ queryKey: ['stock-movement', 'nhieu-kho', f.to, f.branchCodes, f.search], queryFn: () => api.get<{ rows: StockRow[] }>('/api/v1/inventory/stock-movement', { from: f.to, to: f.to, branchCodes: f.branchCodes, search: f.search }) });
  const k = f.value ? 'closingValue' : 'closingQty';
  // Bảng chéo: mỗi mã một dòng, mỗi kho một cột; tên lấy tên khác mã đầu tiên gặp.
  type Row = { sku: string; name: string; unit: string; by: Map<string, number> };
  const map = new Map<string, Row>();
  for (const r of q.data?.rows ?? []) {
    const x = map.get(r.sku) ?? map.set(r.sku, { sku: r.sku, name: r.name, unit: r.unit, by: new Map() }).get(r.sku)!;
    if (x.name === x.sku && r.name !== r.sku) x.name = r.name;
    x.by.set(r.branchCode, (x.by.get(r.branchCode) ?? 0) + r[k]);
  }
  const used = branches.filter((b) => [...map.values()].some((r) => r.by.get(b.code)));
  const rows = [...map.values()].filter((r) => [...r.by.values()].some((v) => v)).sort((a, b) => a.sku.localeCompare(b.sku));
  const type = f.value ? 'money' : 'qty';
  const columns: Column<Row>[] = [
    { key: 'sku', header: 'Mã hàng', type: 'code', width: 120 },
    { key: 'name', header: 'Tên hàng', width: 260 },
    { key: 'unit', header: 'ĐVT', width: 70 },
    { key: 'tong', header: 'Tổng', type, width: 120, sum: true, bold: true, value: (r) => r2([...r.by.values()].reduce((a, b) => a + b, 0)) },
    ...used.map((b): Column<Row> => ({ key: `k-${b.code}`, header: b.code, title: b.name, type, width: 110, sum: true, value: (r) => r.by.get(b.code) ?? null })),
  ];
  return (
    <>
      <PageHeader title="Tổng hợp tồn trên nhiều kho" code="ACC83N" subtitle="Tồn đến ngày của từng mặt hàng ở từng kho (chi nhánh), dạng bảng chéo" helpKey="nhap-xuat-ton" />
      <FilterLayout boThamSo={{ value: f, onApply: setF }}
        filters={
          <>
            <div className="field"><label>Đến ngày</label><input type="date" className="input" value={f.to} onChange={(e) => set({ to: e.target.value })} /></div>
            <div className="field"><label>Mã / tên hàng</label><input className="input w-md" defaultValue={f.search} onBlur={(e) => set({ search: e.target.value.trim() })} /></div>
            <label className="checkbox"><input type="checkbox" checked={f.value} onChange={(e) => set({ value: e.target.checked })} /> Xem giá trị (thay cho số lượng)</label>
            <BranchSelect value={f.branchCodes} onChange={(branchCodes) => set({ branchCodes })} />
          </>
        }>
        <div className="card">
          <div className="rp-tieu-de"><h2>TỔNG HỢP TỒN TRÊN NHIỀU KHO</h2><i>Đến ngày {date(f.to)}</i></div>
          <ErrorBox error={q.error ? errorText(q.error) : null} />
          {q.isLoading ? <Loading /> : !rows.length ? <Empty text="Không có hàng tồn đến ngày này" /> : (
            <DataGrid storageKey="acc83n" rows={rows} rowKey={(r) => r.sku} columns={columns} footerLabel="Tổng cộng"
              exportName="ton-tren-nhieu-kho" exportTitle={`Tổng hợp tồn trên nhiều kho — đến ngày ${date(f.to)}`} />
          )}
        </div>
      </FilterLayout>
    </>
  );
}
