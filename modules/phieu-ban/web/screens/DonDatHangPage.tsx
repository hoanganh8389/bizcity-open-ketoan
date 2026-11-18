/**
 * BH20 Đơn đặt hàng (phiếu NT-BH-023): ba thẻ
 *   ① Đơn đặt hàng — danh sách lọc theo trạng thái / nguồn / tìm; bấm đơn mở form (Gửi, Duyệt, Giao, Đóng, Huỷ, In báo giá, Lịch sử).
 *   ② Nạp đơn livestream — dán bảng từ Excel (Tên | SĐT | Mã hàng | SL | Đơn giá | Mã khách), xem trước, nạp; trùng SĐT + mã trong 24 giờ
 *      thì báo hoặc gộp / giữ riêng theo lựa chọn.
 *   ③ Cài đặt — kho KCB (hàng chờ bán) giữ hàng của từng cửa hàng: khoá bizcity.phieu_ban.hold_warehouses, ghi qua đường cấu hình
 *      chung PUT /api/v1/settings/values/:key (quyền settings:write); danh sách kho đọc GET /api/v1/warehouses (lọc loại KCB).
 *   NT-BH-032: nút "Copy từ hoá đơn" ở thẻ ① — nhập mã đơn máy bán / số phiếu BH10 đã duyệt / số đơn đặt hàng → đơn nháp mới (giá +
 *   khuyến mại tính lại). Kho KHG, mã phí ship, hình thức COD của giao hàng chọn ở BH17 Cài đặt bán hàng.
 */
// [2026-11-18 Võ Hoàng] NGHIEM-THU — NT-BH-032: copy từ hoá đơn bán lẻ / đơn đặt hàng (đóng góp)
// [2026-11-17 Võ Hoàng] NGHIEM-THU — NT-BH-023: màn Đơn đặt hàng (đóng góp)
import { useEffect, useMemo, useState } from 'react';
import {
  BranchPicker, DataGrid, ErrorBox, Field, Loading, PageHeader, errorText, useApi, useCan, useMutation, useQuery, useQueryClient, type GridColumn,
} from '@bizcity/ui-kit';
import { HOLD_KEY, M, STATUS, groupPaste, parsePaste, today, vnd, type Order, type Status } from '../lib';
import { OrderEditor } from './OrderEditor';

const cols: GridColumn<Order>[] = [
  { key: 'orderNo', header: 'Số đơn', type: 'code', width: 130 },
  { key: 'orderDate', header: 'Ngày', type: 'date', width: 95 },
  { key: 'validUntil', header: 'Hiệu lực đến', type: 'date', width: 95 },
  { key: 'branchCode', header: 'Cửa hàng', type: 'code', width: 80 },
  { key: 'customer', header: 'Khách', width: 200, value: (o) => (o.partner ? `${o.partner.code} ${o.partner.name}` : `${o.customer?.name ?? ''} ${o.customer?.phone ?? ''}`) },
  { key: 'source', header: 'Nguồn', width: 90, value: (o) => (o.source === 'livestream' ? 'Livestream' : 'Lập tay') },
  { key: 'total', header: 'Tổng tiền', type: 'money', sum: true, width: 120 },
  { key: 'progress', header: 'Đã giao / đặt', width: 110, value: (o) => `${vnd(o.lines.reduce((s, l) => s + l.delivered, 0))} / ${vnd(o.lines.reduce((s, l) => s + l.qty, 0))}` },
  { key: 'held', header: 'Đang giữ', type: 'qty', width: 80, value: (o) => o.lines.reduce((s, l) => s + l.held, 0) },
  { key: 'status', header: 'Trạng thái', width: 100, value: (o) => STATUS[o.status].label, render: (o) => <span className={`badge badge-${STATUS[o.status].tone}`}>{STATUS[o.status].label}</span> },
];

function ListTab() {
  const api = useApi();
  const can = useCan();
  const [status, setStatus] = useState<'' | Status>('');
  const [source, setSource] = useState('');
  const [search, setSearch] = useState('');
  const [open, setOpen] = useState<Order | 'new' | null>(null);
  const [copy, setCopy] = useState<{ from: 'pos' | 'sale' | 'order'; no: string; branchCode: string } | null>(null);
  const qc = useQueryClient();
  const doCopy = useMutation({
    mutationFn: () => api.post<Order>(`${M}/orders/copy`, { from: copy!.from, no: copy!.no.trim(), ...(copy!.branchCode ? { branchCode: copy!.branchCode } : {}) }),
    onSuccess: (o) => { setCopy(null); void qc.invalidateQueries({ queryKey: ['phieu-ban', 'orders'] }); setOpen(o); },
  });
  const q = useQuery({ queryKey: ['phieu-ban', 'orders', status, source, search],
    queryFn: () => api.getPage<Order[]>(`${M}/orders`, { status, source, search, pageSize: 500 }) });
  return (
    <>
      <div className="row" style={{ gap: 8, marginBottom: 8, flexWrap: 'wrap' }}>
        <select className="input" style={{ width: 150 }} value={status} onChange={(e) => setStatus(e.target.value as Status | '')}>
          <option value="">Mọi trạng thái</option>
          {(Object.keys(STATUS) as Status[]).map((s) => <option key={s} value={s}>{STATUS[s].label}</option>)}
        </select>
        <select className="input" style={{ width: 130 }} value={source} onChange={(e) => setSource(e.target.value)}>
          <option value="">Mọi nguồn</option><option value="manual">Lập tay</option><option value="livestream">Livestream</option>
        </select>
        <input className="input" style={{ width: 240 }} placeholder="Số đơn, khách, SĐT, ghi chú" value={search} onChange={(e) => setSearch(e.target.value)} />
        <button className="btn btn-primary" disabled={!can('phieu-ban:write')} title={can('phieu-ban:write') ? 'Lập đơn nháp (báo giá)' : 'Cần quyền phieu-ban:write'} onClick={() => setOpen('new')}>+ Lập đơn</button>
        <button className="btn" disabled={!can('phieu-ban:write')} title={can('phieu-ban:write') ? 'Khách mua lại: lập đơn mới từ hoá đơn máy bán / phiếu BH10 đã duyệt / đơn đặt hàng cũ' : 'Cần quyền phieu-ban:write'}
          onClick={() => setCopy({ from: 'pos', no: '', branchCode: '' })}>Copy từ hoá đơn</button>
      </div>
      {copy && (
        <div className="card card-body row" style={{ gap: 8, marginBottom: 8, flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <Field label="Nguồn">
            <select className="input" value={copy.from} onChange={(e) => setCopy({ ...copy, from: e.target.value as typeof copy.from })}>
              <option value="pos">Đơn máy bán (mã đơn)</option><option value="sale">Phiếu bán BH10 đã duyệt</option><option value="order">Đơn đặt hàng</option>
            </select>
          </Field>
          <Field label="Mã / số gốc"><input className="input" value={copy.no} placeholder="vd CN02BT10005" onChange={(e) => setCopy({ ...copy, no: e.target.value })} /></Field>
          <Field label="Cửa hàng" hint={copy.from === 'sale' ? 'Bắt buộc với phiếu BH10' : 'Khi mã có ở nhiều cửa hàng'}><BranchPicker value={copy.branchCode} onChange={(v) => setCopy({ ...copy, branchCode: v })} /></Field>
          <button className="btn btn-primary" disabled={!copy.no.trim() || doCopy.isPending} title="Đơn nháp mới cùng khách, hàng, số lượng; giá + khuyến mại tính theo hôm nay" onClick={() => doCopy.mutate()}>Lập đơn</button>
          <button className="btn" onClick={() => { setCopy(null); doCopy.reset(); }}>Thôi</button>
          {doCopy.error && <ErrorBox error={errorText(doCopy.error)} />}
        </div>
      )}
      {q.isLoading ? <Loading /> : q.error ? <ErrorBox error={errorText(q.error)} /> : (
        <DataGrid rows={q.data?.data ?? []} columns={cols} rowKey={(o) => o.id} storageKey="phieu-ban.don-dat-hang" onRowDoubleClick={setOpen} onRowClick={setOpen}
          emptyText="Chưa có đơn đặt hàng" maxHeight="64vh" exportName="don-dat-hang" exportTitle="Đơn đặt hàng" />
      )}
      {open && <OrderEditor order={open === 'new' ? null : open} onClose={() => setOpen(null)} />}
    </>
  );
}

type ImportResult = { created: number; merged: number; duplicates: number; results: { index: number; created: boolean; merged?: boolean; order?: Order; duplicates?: { orderNo: string }[] }[] };

function ImportTab() {
  const api = useApi();
  const can = useCan();
  const qc = useQueryClient();
  const [branch, setBranch] = useState('');
  const [text, setText] = useState('');
  const [mode, setMode] = useState<'ask' | 'keep' | 'merge'>('ask');
  const rows = useMemo(() => parsePaste(text), [text]);
  const orders = useMemo(() => groupPaste(rows, branch, today()), [rows, branch]);
  const run = useMutation({
    mutationFn: () => api.post<ImportResult>(`${M}/orders/import`, { orders, onDuplicate: mode }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['phieu-ban', 'orders'] }),
  });
  const why = !can('phieu-ban:write') ? 'Cần quyền phieu-ban:write' : !branch ? 'Chọn cửa hàng trước' : !orders.length ? 'Dán bảng đơn trước' : '';
  return (
    <div style={{ display: 'grid', gap: 8, maxWidth: 980 }}>
      <div className="muted">Dán bảng từ Excel, mỗi dòng một mặt hàng: <b>Tên | SĐT | Mã hàng | SL | Đơn giá (trống = giá cửa hàng) | Mã khách (tuỳ chọn)</b>. Cùng SĐT gom thành một đơn.</div>
      <div className="row" style={{ gap: 8 }}>
        <Field label="Cửa hàng"><BranchPicker value={branch} onChange={setBranch} /></Field>
        <Field label="Gặp đơn trùng (SĐT + mã trong 24 giờ)">
          <select className="input" value={mode} onChange={(e) => setMode(e.target.value as typeof mode)}>
            <option value="ask">Chỉ báo, không lập</option><option value="merge">Gộp vào đơn cũ</option><option value="keep">Giữ riêng (lập đơn mới)</option>
          </select>
        </Field>
      </div>
      <textarea className="input" rows={8} value={text} onChange={(e) => setText(e.target.value)} placeholder={'Chị Lan\t0909123456\tSUA330\t2\t330000'} />
      <div>{rows.length} dòng hàng → {orders.length} đơn</div>
      <button className="btn btn-primary" style={{ width: 160 }} disabled={Boolean(why) || run.isPending} title={why || 'Nạp các đơn livestream (nháp)'} onClick={() => run.mutate()}>Nạp đơn</button>
      {run.error && <ErrorBox error={errorText(run.error)} />}
      {run.data && (
        <div className="card card-body">
          <b>Đã lập {run.data.created} · gộp {run.data.merged} · trùng chưa lập {run.data.duplicates}</b>
          {run.data.results.filter((r) => r.duplicates?.length).map((r) => (
            <div key={r.index}>Đơn {r.index + 1} ({orders[r.index]?.customer.name} {orders[r.index]?.customer.phone}) trùng {r.duplicates!.map((x) => x.orderNo).join(', ')} — chọn "Gộp" hoặc "Giữ riêng" rồi nạp lại dòng này, hoặc mở đơn cũ để sửa.</div>
          ))}
        </div>
      )}
    </div>
  );
}

type Wh = { code: string; name: string; branchCode: string; branchName: string; isActive: boolean; typeCode: string };

function SettingsTab() {
  const api = useApi();
  const can = useCan();
  const qc = useQueryClient();
  const cur = useQuery({ queryKey: ['phieu-ban', 'order-settings'], queryFn: () => api.get<{ holdWarehouses: Record<string, string> }>(`${M}/order-settings`) });
  const whs = useQuery({ queryKey: ['warehouses'], queryFn: () => api.get<Wh[]>('/api/v1/warehouses') });
  const [map, setMap] = useState<Record<string, string>>({});
  useEffect(() => { if (cur.data) setMap(cur.data.holdWarehouses); }, [cur.data]);
  const branches = useMemo(() => {
    const m = new Map<string, string>();
    for (const w of whs.data ?? []) m.set(w.branchCode, w.branchName);
    return [...m.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [whs.data]);
  const save = useMutation({
    mutationFn: () => api.put(`/api/v1/settings/values/${HOLD_KEY}`, { key: HOLD_KEY, value: Object.entries(map).filter(([, w]) => w).map(([b, w]) => `${b}=${w}`) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['phieu-ban', 'order-settings'] }),
  });
  const writable = can('settings:write');
  if (cur.isLoading || whs.isLoading) return <Loading />;
  if (cur.error || whs.error) return <ErrorBox error={errorText(cur.error ?? whs.error)} />;
  return (
    <section className="card card-body" style={{ maxWidth: 760, display: 'grid', gap: 10 }}>
      <div><b>Kho giữ hàng cho đơn đặt hàng</b><div className="muted">
        Đơn Đã gửi được giữ hàng bằng phiếu chuyển kho từ kho bán sang kho loại KCB "Kho hàng chờ bán" của cửa hàng; giao hàng xuất từ kho này.
        Chưa có kho KCB thì khai ở Danh mục kho (DM18), và tick KCB vào nghiệp vụ "Xuất bán" của Loại kho.
        Giao hàng (NT-BH-032): kho KHG "Kho hàng gửi bán", mã dịch vụ phí ship, hình thức thanh toán COD theo hãng chọn ở Cài đặt bán hàng (BH17).
      </div></div>
      <table className="grid">
        <thead><tr><th>Cửa hàng</th><th>Kho KCB giữ hàng</th></tr></thead>
        <tbody>{branches.map(([code, name]) => {
          const opts = (whs.data ?? []).filter((w) => w.branchCode === code && w.isActive && (w.typeCode === 'KCB' || w.code === map[code]));
          return (
            <tr key={code}><td>{code} — {name}</td><td>
              <select className="input" value={map[code] ?? ''} disabled={!writable} title={writable ? '' : 'Cần quyền settings:write'} onChange={(e) => setMap({ ...map, [code]: e.target.value })}>
                <option value="">{opts.length ? '— chưa chọn —' : '— cửa hàng chưa có kho loại KCB —'}</option>
                {opts.map((w) => <option key={w.code} value={w.code}>{w.code} — {w.name}{w.typeCode !== 'KCB' ? ` (loại ${w.typeCode})` : ''}</option>)}
              </select>
            </td></tr>
          );
        })}</tbody>
      </table>
      {save.error && <ErrorBox error={errorText(save.error)} />}
      {save.isSuccess && <span className="badge badge-ok">Đã ghi</span>}
      <button className="btn btn-primary" style={{ width: 120 }} disabled={!writable || save.isPending} title={writable ? 'Ghi cấu hình (có lịch sử ai đổi, lúc nào)' : 'Cần quyền settings:write'} onClick={() => save.mutate()}>Ghi</button>
    </section>
  );
}

export function DonDatHangPage() {
  const [tab, setTab] = useState<'list' | 'import' | 'settings'>('list');
  const T = (k: typeof tab, label: string) => <button className={`btn btn-xs${tab === k ? ' btn-primary' : ''}`} onClick={() => setTab(k)}>{label}</button>;
  return (
    <div>
      <PageHeader title="Đơn đặt hàng" code="BH20" subtitle="Báo giá có hạn → gửi (kiểm hạn mức, nợ quá hạn) → giữ hàng ở kho KCB → chuyến giao: Đang giao (kho KHG) → Đã giao (phiếu bán nháp BH10, phí ship, COD) | Hoàn." />
      <div className="row" style={{ gap: 6, marginBottom: 8 }}>{T('list', 'Đơn đặt hàng')}{T('import', 'Nạp đơn livestream')}{T('settings', 'Cài đặt')}</div>
      {tab === 'list' ? <ListTab /> : tab === 'import' ? <ImportTab /> : <SettingsTab />}
    </div>
  );
}
