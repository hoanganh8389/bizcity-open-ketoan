/**
 * Kênh bán hàng (phiếu NT-BH-031, như màn CH18 của phần mềm cũ). Thẻ "Danh mục kênh": mã, tên, loại online / offline, thứ tự, đang dùng —
 * Thêm (pos:kenh-ban-lap), Sửa / Dùng lại (pos:kenh-ban-sua), Ngừng dùng (pos:kenh-ban-xoa; kênh đã dùng không xoá — ECP-13). Máy bán thấy
 * danh sách mới sau khi khởi động lại. Thẻ "Bán hàng theo kênh" (pos:report): kênh × cửa hàng × khoảng ngày — số đơn, doanh thu, khuyến mại,
 * trả hàng, thực thu; tổng online / offline; gồm đơn máy bán và phiếu bán BH10; Excel. Xem danh mục bằng catalog:read.
 */
// [2026-11-18 Võ Hoàng] NGHIEM-THU — NT-BH-031: màn Kênh bán hàng + báo cáo bán theo kênh (đóng góp)
import { useState } from 'react';
import { BranchCheckList, DataGrid, ErrorBox, Field, KpiCards, Loading, Modal, PageHeader, errorText, useApi, useCan, useMutation, useQuery, useQueryClient, type GridColumn } from '@bizcity/ui-kit';
import { M, time } from '../lib';

type Kind = 'online' | 'offline';
type Channel = { code: string; name: string; kind: Kind; sortOrder: number; active: boolean; used: boolean; seeded: boolean; updatedAt: string; updatedByName: string };
type ReportRow = {
  channelCode: string; channelName: string; kind: Kind | ''; active: boolean; branchCode: string;
  orders: number; posOrders: number; phieuBanDocs: number; revenue: number; discount: number; returns: number; net: number;
};
type Sums = { orders: number; revenue: number; discount: number; returns: number; net: number };

const KIND: Record<Kind, string> = { online: 'Online', offline: 'Offline' };
const today = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Ho_Chi_Minh', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());

const cols: GridColumn<Channel>[] = [
  { key: 'sortOrder', header: 'Thứ tự', type: 'number', width: 70 },
  { key: 'code', header: 'Mã kênh', type: 'code', width: 150 },
  { key: 'name', header: 'Tên kênh', width: 200 },
  { key: 'kind', header: 'Loại', width: 90, value: (r) => KIND[r.kind] },
  { key: 'active', header: 'Trạng thái', width: 110, value: (r) => (r.active ? 'Đang dùng' : 'Ngừng dùng'),
    render: (r) => <span className={`badge badge-${r.active ? 'ok' : 'gray'}`}>{r.active ? 'Đang dùng' : 'Ngừng dùng'}</span> },
  { key: 'used', header: 'Đã có đơn', width: 90, value: (r) => (r.used ? 'Có' : '') },
  { key: 'updatedByName', header: 'Người sửa', width: 160 },
  { key: 'updatedAt', header: 'Lúc sửa', width: 110, value: (r) => r.updatedAt, render: (r) => time(r.updatedAt) },
];

const reportCols: GridColumn<ReportRow>[] = [
  { key: 'channelName', header: 'Kênh', width: 170, render: (r) => (r.active ? r.channelName : `${r.channelName} (ngừng)`) },
  { key: 'kind', header: 'Loại', width: 80, value: (r) => (r.kind ? KIND[r.kind] : '') },
  { key: 'branchCode', header: 'Cửa hàng', type: 'code', width: 100 },
  { key: 'orders', header: 'Số đơn', type: 'number', sum: true, width: 80 },
  { key: 'posOrders', header: 'Đơn máy bán', type: 'number', sum: true, width: 100, hidden: true },
  { key: 'phieuBanDocs', header: 'Phiếu BH10', type: 'number', sum: true, width: 90, hidden: true },
  { key: 'revenue', header: 'Doanh thu', type: 'money', sum: true, width: 130 },
  { key: 'discount', header: 'Khuyến mại', type: 'money', sum: true, width: 120 },
  { key: 'returns', header: 'Trả hàng', type: 'money', sum: true, width: 120 },
  { key: 'net', header: 'Thực thu', type: 'money', sum: true, width: 130 },
];

type Tab = 'danh-muc' | 'bao-cao';

export function KenhBanPage() {
  const can = useCan();
  const [tab, setTab] = useState<Tab>('danh-muc');
  const report = can('pos:report');
  return (
    <div>
      <PageHeader title="Kênh bán hàng" subtitle="Danh mục kênh (nguồn bán) máy bán và phiếu bán BH10 chọn; báo cáo bán theo kênh. Kênh là thông tin nội bộ, không lên sổ." />
      <div className="tabs" role="tablist" style={{ margin: '8px 0' }}>
        <button type="button" role="tab" className={`tab ${tab === 'danh-muc' ? 'active' : ''}`} onClick={() => setTab('danh-muc')}>Danh mục kênh</button>
        {report && <button type="button" role="tab" className={`tab ${tab === 'bao-cao' ? 'active' : ''}`} onClick={() => setTab('bao-cao')}>Bán hàng theo kênh</button>}
      </div>
      {tab === 'bao-cao' && report ? <ChannelReport /> : <ChannelList />}
    </div>
  );
}

function ChannelList() {
  const api = useApi();
  const can = useCan();
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['pos-kenh-ban'], queryFn: () => api.get<{ defaultCode: string; items: Channel[] }>(`${M}/channels`) });
  const [pick, setPick] = useState<Channel | null>(null);
  const [form, setForm] = useState<{ edit: Channel | null } | null>(null);
  const [msg, setMsg] = useState('');
  const refresh = (m: string) => { setMsg(m); setPick(null); void qc.invalidateQueries({ queryKey: ['pos-kenh-ban'] }); };
  const toggle = useMutation({
    mutationFn: (c: Channel) => api.post(`${M}/channels/${encodeURIComponent(c.code)}/${c.active ? 'stop' : 'resume'}`, {}),
    onSuccess: (_d, c) => refresh(c.active ? `Đã ngừng dùng kênh ${c.name} — máy bán không chọn được sau khi khởi động lại; đơn cũ vẫn giữ kênh.` : `Đã dùng lại kênh ${c.name}.`),
  });
  return (
    <div>
      <div className="row" style={{ gap: 8, margin: '4px 0 8px', alignItems: 'center', flexWrap: 'wrap' }}>
        {can('pos:kenh-ban-lap') && <button type="button" className="btn btn-primary" onClick={() => setForm({ edit: null })}>+ Thêm</button>}
        {can('pos:kenh-ban-sua') && <button type="button" className="btn" disabled={!pick} title={pick ? undefined : "Bấm chọn một kênh ở bảng rồi Sửa"} onClick={() => setForm({ edit: pick })}>Sửa</button>}
        {pick?.active && can('pos:kenh-ban-xoa') && <button type="button" className="btn" disabled={toggle.isPending} onClick={() => toggle.mutate(pick)}>Ngừng dùng</button>}
        {pick && !pick.active && can('pos:kenh-ban-sua') && <button type="button" className="btn" disabled={toggle.isPending} onClick={() => toggle.mutate(pick)}>Dùng lại</button>}
        <span className="muted">Không xoá kênh: kênh đã dùng chỉ ngừng dùng. Máy bán lấy danh sách kênh đang dùng khi khởi động.</span>
        {msg && <span className="muted">{msg}</span>}
      </div>
      {toggle.error && <ErrorBox error={errorText(toggle.error)} />}
      {q.isLoading ? <Loading /> : q.error ? <ErrorBox error={errorText(q.error)} /> : (
        <DataGrid rows={q.data?.items ?? []} columns={cols} rowKey={(r) => r.code} storageKey="pos.kenh-ban" onRowClick={setPick}
          rowClassName={(r) => (r.code === pick?.code ? 'selected' : '')} emptyText="Chưa có kênh" exportName="kenh-ban-hang" exportTitle="Kênh bán hàng" />
      )}
      {form && <ChannelForm edit={form.edit} onClose={() => setForm(null)} onDone={(m) => { setForm(null); refresh(m); }} />}
    </div>
  );
}

function ChannelForm({ edit, onClose, onDone }: { edit: Channel | null; onClose: () => void; onDone: (m: string) => void }) {
  const api = useApi();
  const [f, setF] = useState({ code: edit?.code ?? '', name: edit?.name ?? '', kind: (edit?.kind ?? 'online') as Kind, sortOrder: edit ? String(edit.sortOrder) : '' });
  const save = useMutation({
    mutationFn: () => {
      const body = { name: f.name.trim(), kind: f.kind, ...(f.sortOrder.trim() ? { sortOrder: Number(f.sortOrder) } : {}) };
      return edit ? api.put(`${M}/channels/${encodeURIComponent(edit.code)}`, body) : api.post(`${M}/channels`, { ...body, code: f.code.trim().toUpperCase() });
    },
    onSuccess: () => onDone(edit ? `Đã sửa kênh ${f.name}.` : `Đã thêm kênh ${f.name} — máy bán thấy sau khi khởi động lại.`),
  });
  return (
    <Modal title={edit ? `Sửa kênh ${edit.code}` : 'Thêm kênh bán hàng'} onClose={onClose} footer={<div className="row" style={{ gap: 8 }}>
      <button type="button" className="btn btn-primary" disabled={save.isPending || !f.name.trim() || (!edit && !f.code.trim())} onClick={() => save.mutate()}>Lưu</button>
      <button type="button" className="btn" onClick={onClose}>Đóng</button></div>}>
      <Field label="Mã kênh (*)" hint="Chữ in hoa không dấu, số, gạch dưới — vd TMDT_TIKTOK. Không đổi sau khi tạo.">
        <input className="input" value={f.code} disabled={Boolean(edit)} onChange={(e) => setF({ ...f, code: e.target.value.toUpperCase() })} />
      </Field>
      <Field label="Tên kênh (*)"><input className="input" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></Field>
      <Field label="Loại">
        <select className="input" value={f.kind} onChange={(e) => setF({ ...f, kind: e.target.value as Kind })}>
          <option value="online">Online</option><option value="offline">Offline</option>
        </select>
      </Field>
      <Field label="Thứ tự" hint="Nhỏ hiện trước trên máy bán; trống = cuối danh sách"><input className="input" type="number" value={f.sortOrder} onChange={(e) => setF({ ...f, sortOrder: e.target.value })} /></Field>
      {save.error && <div style={{ gridColumn: '1 / -1' }}><ErrorBox error={errorText(save.error)} /></div>}
    </Modal>
  );
}

function ChannelReport() {
  const api = useApi();
  const d = today();
  const [draft, setDraft] = useState({ from: `${d.slice(0, 8)}01`, to: d, branchCodes: '' });
  const [f, setF] = useState(draft);
  const q = useQuery({
    queryKey: ['pos-kenh-ban', 'bao-cao', f],
    queryFn: () => api.getPage<ReportRow[]>(`${M}/reports/channels`, Object.fromEntries(Object.entries(f).filter(([, v]) => v))) as Promise<{ data: ReportRow[]; meta?: { byKind?: Record<'online' | 'offline' | 'all', Sums>; phieuBan?: string } }>,
  });
  const k = q.data?.meta?.byKind;
  return (
    <div>
      <div className="row" style={{ gap: 8, margin: '4px 0 8px', alignItems: 'flex-end', flexWrap: 'wrap' }}>
        <Field label="Từ ngày"><input className="input" type="date" value={draft.from} onChange={(e) => setDraft({ ...draft, from: e.target.value })} /></Field>
        <Field label="Đến ngày"><input className="input" type="date" value={draft.to} onChange={(e) => setDraft({ ...draft, to: e.target.value })} /></Field>
        <Field label="Cửa hàng"><BranchCheckList value={draft.branchCodes} onChange={(branchCodes) => setDraft({ ...draft, branchCodes })} /></Field>
        <button type="button" className="btn btn-primary" onClick={() => setF(draft)}>Xem</button>
      </div>
      {k && (
        <KpiCards items={[
          { key: 'all', label: 'Thực thu (tất cả)', value: k.all.net, tone: 'ok' },
          { key: 'on', label: `Online · ${k.online.orders} đơn`, value: k.online.net, tone: 'info' },
          { key: 'off', label: `Offline · ${k.offline.orders} đơn`, value: k.offline.net },
          { key: 'ret', label: 'Trả hàng', value: k.all.returns, tone: 'warn' },
        ]} />
      )}
      {q.isLoading ? <Loading /> : q.error ? <ErrorBox error={errorText(q.error)} /> : (
        <DataGrid rows={q.data?.data ?? []} columns={reportCols} rowKey={(r) => `${r.channelCode}|${r.branchCode}`} storageKey="pos.kenh-ban.bao-cao"
          emptyText="Không có đơn / phiếu trong kỳ" exportName="ban-hang-theo-kenh" exportTitle={`Bán hàng theo kênh ${f.from} – ${f.to}`} />
      )}
      <p className="muted">
        Doanh thu = tiền khách phải trả sau khuyến mại (gồm thuế) của đơn máy bán đã hoàn tất và phiếu bán BH10 đã duyệt; Khuyến mại = tiền giảm theo
        chương trình + voucher (tham khảo, đã trừ trong doanh thu); Trả hàng tính theo ngày trả, kênh của đơn / phiếu gốc; Thực thu = Doanh thu − Trả hàng.
        Đơn / phiếu không mang kênh tính vào kênh mặc định (Gần shop).
        {q.data?.meta?.phieuBan === 'unavailable' && <b> Chưa gồm phiếu BH10 (module Phiếu bán nhập tay chưa bật hoặc bạn chưa có quyền xem phiếu bán).</b>}
      </p>
    </div>
  );
}
