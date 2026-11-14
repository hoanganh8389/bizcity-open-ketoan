/**
 * Thẻ *Có hạn mức* và *Báo cáo hạn mức* của màn Chương trình khuyến mại (BH18, phiếu NT-BH-018 — chuyển từ BH12): danh sách chương trình
 * (lọc trạng thái, tìm; hạn mức / đã dùng / còn lại / bản chính sách) và báo cáo quản lý theo cửa hàng (tiến độ, tốc độ dùng, trong kỳ).
 * Đọc `/api/v1/sale-programs` và `/api/v1/sale-programs/report` (giữ nguyên API).
 */
// [2026-11-15 09:50 AM Võ Hoàng] NGHIEM-THU — NT-BH-018: danh sách + báo cáo chương trình có hạn mức trong module pos (đóng góp)
import { useMemo, useState } from 'react';
import { DataGrid, ErrorBox, KpiCards, Loading, errorText, useApi, useQuery, type GridColumn } from '@bizcity/ui-kit';
import { Badge, vnd } from '../../lib';
import { PROGRAM_STATE, offerText, type Program, type ProgramKind, type ProgramState, type ReportRow } from './han-muc';

const viDate = (d: string) => d.split('-').reverse().join('/');

const cols: GridColumn<Program>[] = [
  { key: 'code', header: 'Mã', type: 'code', width: 140 },
  { key: 'name', header: 'Tên', width: 220 },
  { key: 'programKind', header: 'Loại', width: 90 },
  { key: 'sku', header: 'Mặt hàng', width: 220, value: (p) => `${p.sku} ${p.skuName ?? ''}` },
  { key: 'offer', header: 'Ưu đãi', width: 190, value: (p) => offerText(p) },
  { key: 'validFrom', header: 'Thời gian', width: 170, value: (p) => `${viDate(p.validFrom)} → ${viDate(p.validTo)}` },
  { key: 'quotaTotal', header: 'Hạn mức', type: 'number', sum: true, width: 90 },
  { key: 'usedTotal', header: 'Đã dùng', type: 'number', sum: true, width: 90 },
  { key: 'remainingTotal', header: 'Còn lại', type: 'number', sum: true, width: 90 },
  { key: 'state', header: 'Trạng thái', width: 100, value: (p) => PROGRAM_STATE[p.state].label, render: (p) => <Badge map={PROGRAM_STATE} value={p.state} /> },
  { key: 'version', header: 'Bản', width: 60, value: (p) => (p.version ? `v${p.version}` : '—') },
];

const STATES: [ProgramState | '', string][] = [['', 'Tất cả'], ['running', 'Đang chạy'], ['upcoming', 'Sắp chạy'], ['ended', 'Đã hết hạn'], ['stopped', 'Đã ngừng']];

export function HanMucList({ onOpen }: { onOpen: (p: Program) => void }) {
  const api = useApi();
  const [state, setState] = useState<ProgramState | ''>('');
  const [search, setSearch] = useState('');
  const q = useQuery({ queryKey: ['km', 'sale-programs', state, search], queryFn: () => api.get<Program[]>('/api/v1/sale-programs', { ...(state ? { state } : {}), ...(search.trim() ? { search: search.trim() } : {}) }) });
  return (
    <div style={{ display: 'grid', gap: 8 }}>
      <div className="row" style={{ gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
        <input className="input" style={{ width: 260 }} placeholder="Tìm mã, tên chương trình, mã hàng" value={search} onChange={(e) => setSearch(e.target.value)} />
        <div className="tabs" style={{ margin: 0 }}>
          {STATES.map(([k, l]) => <button key={k} type="button" className={`tab ${state === k ? 'active' : ''}`} onClick={() => setState(k)}>{l}</button>)}
        </div>
      </div>
      {q.error && <ErrorBox error={errorText(q.error)} />}
      {q.isLoading ? <Loading /> : (
        <DataGrid rows={q.data ?? []} columns={cols} rowKey={(p) => p.id} storageKey="pos.khuyen-mai.han-muc" onRowClick={onOpen}
          emptyText="Chưa có chương trình có hạn mức — bấm Thêm, chọn Tặng hàng / Giảm giá có hạn mức" exportName="chuong-trinh-han-muc" exportTitle="Chương trình có hạn mức" />
      )}
    </div>
  );
}

export function HanMucReport({ today }: { today: string }) {
  const api = useApi();
  const [from, setFrom] = useState(`${today.slice(0, 8)}01`);
  const [to, setTo] = useState(today);
  const [kind, setKind] = useState('');
  const [branch, setBranch] = useState('');
  const kinds = useQuery({ queryKey: ['km', 'program-kinds'], queryFn: () => api.get<ProgramKind[]>('/api/v1/program-kinds'), staleTime: 60_000 }).data ?? [];
  const branches = useQuery({ queryKey: ['km', 'branches'], queryFn: () => api.get<{ code: string; name: string }[]>('/api/v1/branches'), staleTime: 60_000 }).data ?? [];
  const q = useQuery({
    queryKey: ['km', 'sale-programs', 'report', from, to, kind, branch],
    queryFn: () => api.get<{ items: ReportRow[]; totals: { quota: number; used: number; periodQty: number; periodAmount: number } }>('/api/v1/sale-programs/report', { from, to, ...(kind ? { kind } : {}), ...(branch ? { branchCode: branch } : {}) }),
  });
  const items = q.data?.items ?? [];
  const groups = useMemo(() => {
    const m = new Map<string, ReportRow[]>();
    for (const r of items) m.set(r.program, [...(m.get(r.program) ?? []), r]);
    return [...m.entries()];
  }, [items]);
  return (
    <div style={{ display: 'grid', gap: 8 }}>
      <div className="row" style={{ gap: 8, alignItems: 'flex-end', flexWrap: 'wrap' }}>
        <label className="rp-field"><span>Từ ngày</span><input type="date" className="input" value={from} onChange={(e) => setFrom(e.target.value)} /></label>
        <label className="rp-field"><span>Đến ngày</span><input type="date" className="input" value={to} onChange={(e) => setTo(e.target.value)} /></label>
        <label className="rp-field"><span>Loại</span><select className="select input" value={kind} onChange={(e) => setKind(e.target.value)}><option value="">Tất cả</option>{kinds.map((k) => <option key={k.code} value={k.code}>{k.name}</option>)}</select></label>
        <label className="rp-field"><span>Cửa hàng</span><select className="select input" value={branch} onChange={(e) => setBranch(e.target.value)}><option value="">Tất cả</option>{branches.map((b) => <option key={b.code} value={b.code}>{b.code} — {b.name}</option>)}</select></label>
      </div>
      {q.error && <ErrorBox error={errorText(q.error)} />}
      {q.data && <KpiCards items={[
        { key: 'quota', label: 'Hạn mức', value: q.data.totals.quota },
        { key: 'used', label: 'Đã dùng (tổng)', value: q.data.totals.used },
        { key: 'periodQty', label: 'Dùng trong kỳ', value: q.data.totals.periodQty, tone: 'info' },
        { key: 'periodAmount', label: 'Giá trị trong kỳ (đ)', value: q.data.totals.periodAmount, tone: 'info' },
      ]} />}
      {q.isLoading ? <Loading /> : (
        <div style={{ overflowX: 'auto' }}>
          <table className="grid-table" style={{ width: '100%' }}>
            <thead><tr>
              <th>Chương trình</th><th>Cửa hàng</th><th className="num" title="Hạn mức của cửa hàng">Hạn mức</th><th className="num" title="Đã dùng từ đầu chương trình">Đã dùng</th>
              <th className="num">Còn lại</th><th title="Phần đã dùng trên hạn mức">Tiến độ</th>
              <th className="num" title="Tốc độ dùng so với thời gian đã trôi: trên 100 = dùng nhanh hơn kế hoạch (sắp hết sớm), dưới 100 = chậm (còn tồn)">Tốc độ</th>
              <th className="num" title="Số lượng dùng trong khoảng ngày lọc">Trong kỳ</th><th className="num" title="Giá trị quà / tiền giảm trong kỳ">Giá trị trong kỳ</th><th className="num" title="Số phiếu bán trong kỳ">Số phiếu</th>
            </tr></thead>
            <tbody>
              {groups.map(([code, rows]) => rows.map((r, i) => (
                <tr key={`${code}-${r.branchCode}`}>
                  {i === 0 && <td rowSpan={rows.length} title={`${r.sku} ${r.skuName ?? ''} · ${viDate(r.validFrom)} → ${viDate(r.validTo)}`}><b className="mono">{code}</b><div className="muted">{r.name}</div></td>}
                  <td className="mono">{r.branchCode}</td>
                  <td className="num">{vnd(r.quota)}</td><td className="num">{vnd(r.used)}</td>
                  <td className="num"><b style={r.remaining ? undefined : { color: '#b91c1c' }}>{vnd(r.remaining)}</b></td>
                  <td title={`${r.usedPct}%`}><div style={{ width: 110, height: 8, borderRadius: 999, background: '#e2e8f0', overflow: 'hidden' }}><i style={{ display: 'block', height: '100%', width: `${Math.min(100, r.usedPct)}%`, background: '#16a34a' }} /></div></td>
                  <td className="num" style={r.pace !== null && r.pace > 120 ? { color: '#b91c1c' } : undefined}>{r.pace ?? ''}</td>
                  <td className="num">{vnd(r.periodQty)}</td><td className="num">{vnd(r.periodAmount)}</td><td className="num">{r.periodDocs}</td>
                </tr>
              )))}
              {!items.length && <tr><td colSpan={10} className="muted">Không có chương trình nào trong khoảng ngày này.</td></tr>}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
