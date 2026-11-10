// [2026-11-10 08:30 PM Nguyễn Văn Thủy] PHASE-026 — KHO01 chạy API thật: lưu là xuất, thủ kho nhập xác nhận, từ chối, huỷ; bảng lọc trái như MH11 (đóng góp)
/**
 * Phiếu chuyển kho (KHO01) — lập trên phần mềm kế toán (phần mềm kế toán là gốc). API: /api/v1/kho/transfers.
 *   Bảng lọc bên trái: ngày, chi nhánh + mã kho (xuất hoặc nhập), trạng thái, tìm số phiếu / mã hàng / diễn giải.
 *   Thao tác: + Thêm (chi nhánh đang làm việc điền sẵn) · Xem / Sửa · Nhận hàng (thủ kho nhập) · Bỏ nhận · Từ chối · Huỷ · In.
 *   Ghi phiếu = xuất (tồn bên chuyển giảm ngay); nhận hàng = nhập (tồn bên nhận tăng theo số thực nhận).
 * Phiếu chuyển từ website bán hàng vẫn vào sổ qua cầu nối — xem ở Bảng kê chuyển kho (HH01).
 */
import { useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { errorText } from '@/lib/api';
import { today } from '@/lib/format';
import { workBranch } from '@/lib/workBranch';
import { dongChungTu } from '@/lib/trangThai';
import { useThemTuDiaChi } from '@/lib/themNhanh';
import { PageHeader } from '@/components/PageHeader';
import { FilterLayout } from '@/components/ReportPanel';
import { BranchSelect, DateRange } from '@/components/filters';
import { DataGrid } from '@/components/DataGrid';
import { ErrorBox, Loading, openNextInEdit } from '@/components/ui';
import { PrintButton } from '@/components/print';
import { TRADE_TEMPLATES } from '@/components/phieu-hang/printTemplates';
import { ckApi, qtyText, statusClass, statusText, toPrintDoc, viDate, type CkDoc, type CkInput } from './api';
import { PhieuChuyenKhoForm } from './PhieuChuyenKhoForm';
import { NhanHangModal } from './NhanHangModal';
import './chuyen-kho.css';

const monthStart = () => `${today().slice(0, 8)}01`;
/** Phiếu mới: chi nhánh xuất = chi nhánh đang làm việc; chưa chọn thì chi nhánh đầu tiên đang lọc. */
const emptyDoc = (filterBranches = ''): CkDoc => ({
  id: '', docNo: '', docDate: today(), fromBranchCode: workBranch.get() || (filterBranches !== '-' ? filterBranches.split(',')[0] ?? '' : ''), fromWarehouse: '', toBranchCode: '', toWarehouse: '', note: '',
  status: 'shipped', lines: [], totalQty: 0, totalReceived: 0, short: false,
});

export function ChuyenKhoPage() {
  const qc = useQueryClient();
  const [f, setF] = useState({ from: monthStart(), to: today(), branchCodes: '', warehouses: '', status: '', search: '' });
  const set = (p: Partial<typeof f>) => setF((o) => ({ ...o, ...p }));
  const [search, setSearch] = useState('');
  const [sel, setSel] = useState<CkDoc | null>(null);
  const [editing, setEditing] = useState<CkDoc | null>(null);
  const [formKey, setFormKey] = useState(0);
  const [receiving, setReceiving] = useState<CkDoc | null>(null);
  const exportRef = useRef<(() => void) | null>(null);
  const params = {
    from: f.from, to: f.to, ...(f.branchCodes && f.branchCodes !== '-' ? { branchCodes: f.branchCodes } : {}), ...(f.warehouses ? { warehouses: f.warehouses } : {}),
    ...(f.status ? { status: f.status } : {}), ...(f.search ? { search: f.search } : {}),
  };
  const q = useQuery({ queryKey: ['kho-transfers', params], queryFn: () => ckApi.list(params) });
  const refresh = () => qc.invalidateQueries({ queryKey: ['kho-transfers'] });
  const after = (d: CkDoc) => { setSel(d); void refresh(); void qc.invalidateQueries({ queryKey: ['kho-transfer-stock'] }); };

  const save = useMutation({
    mutationFn: ({ d }: { d: CkInput; close: boolean }) => (editing?.id ? ckApi.update(editing.id, d) : ckApi.create(d)),
    onSuccess: (saved, { close }) => { after(saved); if (close) setEditing(null); else { setEditing(saved); setFormKey((k) => k + 1); } },
  });
  const receive = useMutation({
    mutationFn: (b: Parameters<typeof ckApi.receive>[1]) => ckApi.receive(receiving!.id, b),
    onSuccess: (d) => { after(d); setReceiving(null); if (editing?.id === d.id) { setEditing(d); setFormKey((k) => k + 1); } },
  });
  const act = useMutation({
    mutationFn: (p: { kind: 'unreceive' | 'reject' | 'cancel'; id: string; reason?: string }) =>
      p.kind === 'unreceive' ? ckApi.unreceive(p.id) : p.kind === 'reject' ? ckApi.reject(p.id, p.reason ?? '') : ckApi.cancel(p.id, p.reason ?? ''),
    onSuccess: after,
  });
  useThemTuDiaChi(() => { setEditing(emptyDoc(f.branchCodes)); setFormKey((k) => k + 1); });
  const open = async (row: CkDoc, edit = false) => { if (edit) openNextInEdit(); setEditing(await ckApi.get(row.id)); setFormKey((k) => k + 1); };
  const openReceive = async (row: CkDoc) => { receive.reset(); setReceiving(await ckApi.get(row.id)); };
  const ask = (text: string, need = false) => { const r = window.prompt(text, ''); if (r === null) return null; if (need && !r.trim()) { window.alert('Cần ghi lý do'); return null; } return r.trim(); };

  const rows = q.data ?? [];
  const live = sel && sel.status !== 'cancelled' && sel.status !== 'rejected';
  return (
    <div className="page">
      <PageHeader title="Phiếu chuyển kho" code="KHO01" helpKey="kho-phieu-chuyen-kho"
        subtitle="Ghi phiếu là xuất kho (trừ tồn bên chuyển ngay); thủ kho nhập xác nhận thì nhập kho bên nhận theo số thực nhận. Lô hạn sớm trước tự gợi ý, sửa được." />
      <FilterLayout
        onSearch={() => set({ search: search.trim() })}
        filters={
          <form className="rp-form" onSubmit={(e) => { e.preventDefault(); set({ search: search.trim() }); }}>
            <DateRange from={f.from} to={f.to} onChange={(from, to) => set({ from, to })} remember={false} />
            <BranchSelect value={f.branchCodes} onChange={(branchCodes) => set({ branchCodes })} warehouses={{ value: f.warehouses, onChange: (warehouses) => set({ warehouses }) }} />
            <div className="field"><label title="Chờ nhận = đã xuất, thủ kho nhập chưa xác nhận">Trạng thái</label>
              <select className="select input" value={f.status} onChange={(e) => set({ status: e.target.value })}>
                <option value="">Mọi trạng thái</option><option value="pending">Đã xuất, chờ nhận</option><option value="received">Đã nhận</option>
                <option value="rejected">Bên nhận từ chối</option><option value="cancelled">Đã huỷ</option>
              </select>
            </div>
            <div className="field"><label>Số phiếu / mã hàng</label><input className="input" placeholder="Số phiếu, mã hàng, diễn giải" value={search} onChange={(e) => setSearch(e.target.value)} onBlur={() => set({ search: search.trim() })} /></div>
          </form>
        }
      >
        <div className="card">
          <div className="row ck-toolbar">
            <button className="btn btn-sm btn-primary" onClick={() => { save.reset(); setEditing(emptyDoc(f.branchCodes)); setFormKey((k) => k + 1); }} title="Lập phiếu mới — chi nhánh xuất điền sẵn chi nhánh đang làm việc">+ Thêm</button>
            <button className="btn btn-sm" disabled={!sel} onClick={() => sel && void open(sel, Boolean(live))}>{live ? 'Sửa' : 'Xem'}</button>
            <button className="btn btn-sm" disabled={!sel || sel.status !== 'shipped'} title="Thủ kho nhập xác nhận đã nhận hàng (nhận đủ hoặc ghi số thực nhận)" onClick={() => sel && void openReceive(sel)}>Nhận hàng</button>
            <button className="btn btn-sm" disabled={!sel || sel.status !== 'received' || act.isPending} title="Huỷ phần nhập (tồn bên nhận trả lại), phiếu về chờ nhận"
              onClick={() => sel && window.confirm(`Bỏ xác nhận nhận phiếu ${sel.docNo}? Tồn bên nhận sẽ trừ lại.`) && act.mutate({ kind: 'unreceive', id: sel.id })}>Bỏ nhận</button>
            <button className="btn btn-sm" disabled={!sel || sel.status !== 'shipped' || act.isPending} title="Bên nhận không nhận: huỷ phần xuất, tồn bên chuyển được trả lại"
              onClick={() => { if (!sel) return; const r = ask(`Từ chối nhận phiếu ${sel.docNo} — lý do:`, true); if (r !== null) act.mutate({ kind: 'reject', id: sel.id, reason: r }); }}>Từ chối</button>
            <button className="btn btn-sm" disabled={!live || act.isPending} title="Huỷ cả phần xuất và phần nhập (đảo bút toán bằng số âm), giữ phiếu để tra cứu"
              onClick={() => { if (!sel) return; const r = ask(`Huỷ phiếu chuyển kho ${sel.docNo}? Tồn hai bên trả lại như trước khi chuyển.\nLý do huỷ:`); if (r !== null) act.mutate({ kind: 'cancel', id: sel.id, reason: r }); }}>Huỷ phiếu</button>
            <PrintButton small screen="KHO01" templates={TRADE_TEMPLATES.transfer!} disabled={!sel} title="In phiếu đang chọn" getDocs={async () => (sel ? [toPrintDoc(await ckApi.get(sel.id))] : [])} />
            <button className="btn btn-sm" onClick={() => void q.refetch()}>Nạp</button>
            <button className="btn btn-sm" onClick={() => exportRef.current?.()}>Xuất Excel</button>
            <span className="muted" style={{ marginLeft: 'auto', fontSize: 12 }}>Phiếu chuyển từ website xem ở <Link to="/bao-cao/chuyen-kho">Bảng kê chuyển kho (HH01)</Link></span>
          </div>
          <ErrorBox error={q.error ? errorText(q.error) : act.error ? errorText(act.error) : null} />
          {q.isLoading ? <Loading /> : (
            <DataGrid
              storageKey="kho01-phieu-chuyen-v1" exportName={`phieu-chuyen-kho-${f.from}-${f.to}`} exportRef={exportRef}
              rows={rows} rowKey={(r) => r.id} onSelect={setSel} onRowDoubleClick={(r) => void open(r)}
              rowClassName={(r) => dongChungTu(r.status)} footerLabel="Cộng"
              emptyText='Chưa có phiếu chuyển kho trong khoảng này — bấm "+ Thêm"'
              columns={[
                { key: 'docDate', header: 'Ngày', title: 'Ngày xuất', type: 'date', width: 95 },
                { key: 'docNo', header: 'Số phiếu', title: 'Số phiếu chuyển kho', type: 'code', width: 115 },
                { key: 'fromBranchCode', header: 'Chi nhánh xuất', title: 'Chi nhánh giao hàng', type: 'code', width: 115 },
                { key: 'fromWarehouse', header: 'Kho xuất', title: 'Phân kho xuất', type: 'code', width: 90 },
                { key: 'toBranchCode', header: 'Chi nhánh nhập', title: 'Chi nhánh nhận hàng', type: 'code', width: 115 },
                { key: 'toWarehouse', header: 'Kho nhập', title: 'Phân kho nhập', type: 'code', width: 90 },
                { key: 'lines', header: 'Số dòng', title: 'Số dòng hàng trên phiếu', type: 'number', width: 70, value: (r) => r.lines.length },
                { key: 'totalQty', header: 'SL xuất', title: 'Tổng số lượng xuất (đơn vị tính tồn kho)', type: 'number', width: 85, sum: true },
                { key: 'totalReceived', header: 'SL nhận', title: 'Tổng số thủ kho nhập xác nhận; trống = chưa nhận', type: 'number', width: 85, sum: true, value: (r) => (r.status === 'received' ? r.totalReceived : null) },
                { key: 'status', header: 'Trạng thái', title: 'Đã xuất, chờ nhận · Đã nhận · Nhận thiếu · Bên nhận từ chối · Đã huỷ', width: 135, value: (r) => statusText(r), render: (r) => <span className={`badge ${statusClass(r)}`}>{statusText(r)}</span> },
                { key: 'receivedDate', header: 'Ngày nhận', title: 'Ngày thủ kho nhập xác nhận', type: 'date', width: 95 },
                { key: 'note', header: 'Diễn giải', title: 'Diễn giải của phiếu; khi nhận thiếu / từ chối thì kèm ghi chú bên nhận', width: 220, value: (r) => [r.note, r.receivedNote].filter(Boolean).join(' · ') },
                { key: 'createdBy', header: 'Người lập', title: 'Người lập phiếu', width: 120, hidden: true },
                { key: 'receivedBy', header: 'Người nhận', title: 'Người xác nhận nhận hàng', width: 120, hidden: true },
              ]}
            />
          )}
          {sel && <div className="muted ck-sel">Đang chọn {sel.docNo}: {viDate(sel.docDate)} · {sel.fromBranchCode}{sel.fromWarehouse ? ` · ${sel.fromWarehouse}` : ''} → {sel.toBranchCode}{sel.toWarehouse ? ` · ${sel.toWarehouse}` : ''} · {qtyText(sel.totalQty)} xuất{sel.status === 'received' ? ` · ${qtyText(sel.totalReceived)} nhận` : ''}</div>}
        </div>
      </FilterLayout>
      {editing && (
        <PhieuChuyenKhoForm key={formKey} value={editing} saving={save.isPending} error={save.error}
          onSave={(d, close) => save.mutate({ d, close })} onClose={() => { setEditing(null); save.reset(); }}
          onReceive={editing.id ? () => void openReceive(editing) : undefined} />
      )}
      {receiving && <NhanHangModal doc={receiving} saving={receive.isPending} error={receive.error} onOk={(b) => receive.mutate(b)} onClose={() => setReceiving(null)} />}
    </div>
  );
}
