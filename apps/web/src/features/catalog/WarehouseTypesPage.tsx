// [2026-11-13 Nguyễn Văn Thủy] Danh mục Loại kho (DM18) + nghiệp vụ dùng loại kho nào theo thứ tự ưu tiên (0128) (đóng góp)
// [2026-11-13 Nguyễn Văn Thủy] gọn lại: bỏ cột Được bán / Thuộc sở hữu / Theo dõi hạn dùng / Theo dõi; Xoá vào Thùng rác (0133); nghiệp vụ hiện bằng chữ, sửa trong hộp thoại (đóng góp)
/**
 * Hai phần:
 *   - Loại kho: mã, tên, công dụng, đầu số TK kho, số kho. Thêm / Sửa / Xoá — Xoá chuyển vào Thùng rác (vẫn lưu trong CSDL);
 *     trong Thùng rác: Khôi phục hoặc Xoá vĩnh viễn. Chứng từ đã ghi với kho thuộc loại đó giữ nguyên.
 *   - Nghiệp vụ: mỗi nghiệp vụ một dòng chữ "Tự chọn: … · Dùng được thêm: …"; bấm Sửa để tích loại dùng được, chọn loại tự chọn.
 */
import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Trash2 } from 'lucide-react';
import { api, errorText } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { PageHeader } from '@/components/PageHeader';
import { ErrorBox, Field, Loading, Modal } from '@/components/ui';
import { DataGrid } from '@/components/DataGrid';

export interface WarehouseType { code: string; name: string; purpose: string; canSell: boolean; owned: boolean; trackExpiry: boolean; accountPrefix: string; isSystem: boolean; isActive: boolean; sortOrder: number; warehouses: number; activeWarehouses: number }
export interface WarehouseOp { op: string; label: string; area: string; typeCodes: string[] }
interface TrashRow { code: string; name: string; purpose: string; accountPrefix: string; deletedAt: string | null; deletedBy: string }

export function useWarehouseTypes() {
  return useQuery({ queryKey: ['warehouse-types'], queryFn: () => api.get<{ types: WarehouseType[]; ops: WarehouseOp[] }>('/api/v1/warehouse-types'), staleTime: 60_000 });
}
const useTrash = () => useQuery({ queryKey: ['warehouse-types', 'trash'], queryFn: () => api.get<TrashRow[]>('/api/v1/warehouse-types/trash') });

export function WarehouseTypesPage() {
  const { can } = useAuth();
  const qc = useQueryClient();
  const canWrite = can('catalog:write');
  const q = useWarehouseTypes();
  const trash = useTrash();
  const [tab, setTab] = useState<'loai' | 'nv'>('loai');
  const [editing, setEditing] = useState<(Partial<WarehouseType> & { isNew?: boolean }) | null>(null);
  const [sel, setSel] = useState<WarehouseType | null>(null);
  const [showTrash, setShowTrash] = useState(false);
  const types = q.data?.types ?? [];
  const del = useMutation({
    mutationFn: (code: string) => api.delete(`/api/v1/warehouse-types/${encodeURIComponent(code)}`),
    onSuccess: () => { setSel(null); void qc.invalidateQueries({ queryKey: ['warehouse-types'] }); },
  });
  return (
    <>
      <PageHeader title="Loại kho" code="DM18" subtitle="Mỗi kho thuộc một loại; chứng từ tự chọn kho theo loại của nghiệp vụ" helpKey="loai-kho" />
      <div className="card">
        <div className="tabs" style={{ padding: '6px 8px 0' }}>
          <button className={`tab ${tab === 'loai' ? 'active' : ''}`} onClick={() => setTab('loai')}>Loại kho</button>
          <button className={`tab ${tab === 'nv' ? 'active' : ''}`} onClick={() => setTab('nv')} title="Nghiệp vụ nào dùng loại kho nào; loại tự chọn được điền sẵn trên chứng từ">Nghiệp vụ dùng loại kho</button>
        </div>
        <ErrorBox error={q.error ? errorText(q.error) : del.error ? errorText(del.error) : null} />
        {q.isLoading ? <Loading /> : tab === 'loai' ? (
          <>
            <div className="row" style={{ gap: 6, padding: '6px 8px', alignItems: 'center' }}>
              <button className="btn btn-primary btn-sm" disabled={!canWrite} onClick={() => setEditing({ isNew: true })}>Thêm</button>
              <button className="btn btn-sm" disabled={!canWrite || !sel} onClick={() => sel && setEditing(sel)}>Sửa</button>
              <button className="btn btn-sm" disabled={!canWrite || !sel || del.isPending} title="Chuyển loại kho đang chọn vào Thùng rác — vẫn lưu trong dữ liệu, khôi phục được"
                onClick={() => { if (sel && window.confirm(`Xoá loại kho ${sel.code} - ${sel.name}?\nLoại kho chuyển vào Thùng rác (vẫn lưu, khôi phục được). Chứng từ đã ghi giữ nguyên.`)) del.mutate(sel.code); }}>Xoá</button>
              <span className="muted">{types.length} loại</span>
              <button className="btn btn-sm btn-ghost" style={{ marginLeft: 'auto' }} onClick={() => setShowTrash(true)} title="Loại kho đã xoá: khôi phục hoặc xoá vĩnh viễn">
                <Trash2 size={14} /> Thùng rác{trash.data?.length ? ` (${trash.data.length})` : ''}
              </button>
            </div>
            <DataGrid
              storageKey="dm18-v2" exportName="loai-kho" rows={types} rowKey={(t) => t.code}
              onSelect={setSel} onRowDoubleClick={(t) => canWrite && setEditing(t)} footerLabel={false}
              columns={[
                { key: 'code', header: 'Mã', type: 'code', width: 90 },
                { key: 'name', header: 'Tên loại kho', width: 240 },
                { key: 'purpose', header: 'Công dụng', width: 340 },
                { key: 'accountPrefix', header: 'TK kho', type: 'code', width: 80, title: 'Đầu số tài khoản kho của loại (156, 157…). Trống = theo Tài khoản ngầm định' },
                { key: 'activeWarehouses', header: 'Số kho', type: 'number', width: 80, title: 'Số kho đang dùng thuộc loại này' },
              ]}
            />
          </>
        ) : <NghiepVu types={types} ops={q.data?.ops ?? []} canWrite={canWrite} />}
      </div>
      {editing && <LoaiKhoForm value={editing} onClose={() => setEditing(null)} />}
      {showTrash && <ThungRac rows={trash.data ?? []} loading={trash.isLoading} canWrite={canWrite} canPurge={can('settings:write')} onClose={() => setShowTrash(false)} />}
    </>
  );
}

/** Form loại kho — dùng cả ở ô Loại kho của form kho (nút + thêm nhanh). onSaved: mã vừa ghi. */
export function LoaiKhoForm({ value, onClose, onSaved }: { value: Partial<WarehouseType> & { isNew?: boolean }; onClose: () => void; onSaved?: (code: string) => void }) {
  const qc = useQueryClient();
  const [v, setV] = useState(value);
  const set = (p: Partial<WarehouseType>) => setV((x) => ({ ...x, ...p }));
  const save = useMutation({
    // Các công tắc không còn hiện trên màn: giữ nguyên giá trị đang có; loại mới mặc định hàng của mình, bán được, theo dõi hạn dùng.
    mutationFn: () => api.put(`/api/v1/warehouse-types/${encodeURIComponent((v.code ?? '').trim().toUpperCase())}`, {
      name: v.name ?? '', purpose: v.purpose ?? '', canSell: value.isNew ? true : Boolean(value.canSell), owned: value.isNew ? true : value.owned !== false,
      trackExpiry: value.isNew ? true : Boolean(value.trackExpiry), accountPrefix: v.accountPrefix ?? '', isActive: true,
    }),
    onSuccess: () => { void qc.invalidateQueries({ queryKey: ['warehouse-types'] }); void qc.invalidateQueries({ queryKey: ['warehouses'] }); onSaved?.((v.code ?? '').trim().toUpperCase()); onClose(); },
  });
  return (
    <Modal title="Loại kho" onClose={onClose}
      footer={<><button className="btn btn-primary" disabled={save.isPending || !v.code?.trim() || !v.name?.trim()} onClick={() => save.mutate()}>Ghi</button><button className="btn" onClick={onClose}>Thoát</button></>}>
      <Field label="Mã (*)" tip={value.isSystem ? 'Loại gốc — không đổi mã' : 'Chữ in hoa / số, 2–12 ký tự'}>
        <input className="input mono" maxLength={12} value={v.code ?? ''} disabled={!value.isNew} autoFocus onChange={(e) => set({ code: e.target.value.toUpperCase().replace(/[^A-Z0-9_]/g, '') })} />
      </Field>
      <Field label="Tên loại kho (*)"><input className="input" value={v.name ?? ''} onChange={(e) => set({ name: e.target.value })} /></Field>
      <Field label="Công dụng" full><input className="input" value={v.purpose ?? ''} onChange={(e) => set({ purpose: e.target.value })} /></Field>
      <Field label="Đầu số TK kho" tip="156, 157… Trống = theo Tài khoản ngầm định">
        <input className="input mono" value={v.accountPrefix ?? ''} placeholder="156" onChange={(e) => set({ accountPrefix: e.target.value.replace(/[^0-9]/g, '') })} />
      </Field>
      {save.error && <div className="alert alert-bad full">{errorText(save.error)}</div>}
    </Modal>
  );
}

/** Thùng rác: loại kho đã xoá — Khôi phục hoặc Xoá vĩnh viễn. */
function ThungRac({ rows, loading, canWrite, canPurge, onClose }: { rows: TrashRow[]; loading: boolean; canWrite: boolean; canPurge: boolean; onClose: () => void }) {
  const qc = useQueryClient();
  const done = () => void qc.invalidateQueries({ queryKey: ['warehouse-types'] });
  const restore = useMutation({ mutationFn: (code: string) => api.post(`/api/v1/warehouse-types/${encodeURIComponent(code)}/restore`, {}), onSuccess: done });
  const purge = useMutation({ mutationFn: (code: string) => api.delete(`/api/v1/warehouse-types/${encodeURIComponent(code)}/permanent`), onSuccess: done });
  const err = restore.error ?? purge.error;
  return (
    <Modal wide title="Thùng rác — Loại kho" onClose={onClose} footer={<button className="btn" onClick={onClose}>Đóng</button>}>
      <div className="muted full" style={{ fontSize: 12.5 }}>Loại kho đã xoá vẫn lưu ở đây. <b>Khôi phục</b> để dùng lại; <b>Xoá vĩnh viễn</b> để bỏ hẳn (nhật ký vẫn ghi lại nội dung).</div>
      <ErrorBox error={err ? errorText(err) : null} />
      {loading ? <Loading /> : !rows.length ? <div className="muted full" style={{ padding: 16, textAlign: 'center' }}>Thùng rác trống.</div> : (
        <div className="table-wrap full">
          <table className="grid">
            <thead><tr><th style={{ width: 90 }}>Mã</th><th>Tên loại kho</th><th style={{ width: 150 }}>Xoá lúc</th><th style={{ width: 140 }}>Người xoá</th><th style={{ width: 210 }} /></tr></thead>
            <tbody>{rows.map((r) => (
              <tr key={r.code}>
                <td className="mono">{r.code}</td><td>{r.name}<div className="muted" style={{ fontSize: 12 }}>{r.purpose}</div></td>
                <td className="mono">{r.deletedAt ? new Date(r.deletedAt).toLocaleString('vi-VN', { hour12: false }) : ''}</td><td>{r.deletedBy}</td>
                <td style={{ whiteSpace: 'nowrap' }}>
                  <button className="btn btn-sm" disabled={!canWrite || restore.isPending} onClick={() => restore.mutate(r.code)}>Khôi phục</button>{' '}
                  <button className="btn btn-sm" disabled={!canPurge || purge.isPending} title={canPurge ? 'Bỏ hẳn khỏi dữ liệu' : 'Cần quyền quản trị'}
                    onClick={() => { if (window.confirm(`Xoá vĩnh viễn loại kho ${r.code} - ${r.name}? Không khôi phục được nữa.`)) purge.mutate(r.code); }}>Xoá vĩnh viễn</button>
                </td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      )}
    </Modal>
  );
}

/** Mỗi nghiệp vụ một dòng chữ: Tự chọn · Dùng được thêm; bấm Sửa để chỉnh trong hộp thoại. */
function NghiepVu({ types, ops, canWrite }: { types: WarehouseType[]; ops: WarehouseOp[]; canWrite: boolean }) {
  const [edit, setEdit] = useState<WarehouseOp | null>(null);
  const name = (c: string) => types.find((t) => t.code === c)?.name ?? c;
  return (
    <div style={{ padding: 8 }}>
      <table className="grid full">
        <thead><tr>
          <th style={{ width: 90 }}>Phân hệ</th><th style={{ width: 220 }}>Nghiệp vụ</th>
          <th style={{ width: 260 }} title="Chứng từ của nghiệp vụ tự điền kho thuộc loại này">Tự chọn kho loại</th>
          <th title="Các loại kho khác chọn được trên chứng từ; kho loại khác thì không chọn được">Dùng được thêm</th><th style={{ width: 70 }} />
        </tr></thead>
        <tbody>{ops.map((o) => (
          <tr key={o.op} style={{ cursor: canWrite ? 'pointer' : undefined }} onDoubleClick={() => canWrite && setEdit(o)}>
            <td className="muted">{o.area}</td>
            <td>{o.label}</td>
            <td>{o.typeCodes[0] ? <b>{name(o.typeCodes[0])}</b> : <span className="muted">mọi loại</span>}</td>
            <td>{o.typeCodes.length > 1 ? o.typeCodes.slice(1).map(name).join(', ') : <span className="muted">—</span>}</td>
            <td>{canWrite && <button className="btn btn-sm" onClick={() => setEdit(o)}>Sửa</button>}</td>
          </tr>
        ))}</tbody>
      </table>
      {edit && <NghiepVuForm op={edit} types={types} onClose={() => setEdit(null)} />}
    </div>
  );
}

function NghiepVuForm({ op, types, onClose }: { op: WarehouseOp; types: WarehouseType[]; onClose: () => void }) {
  const qc = useQueryClient();
  const [on, setOn] = useState<string[]>(op.typeCodes);
  const [first, setFirst] = useState(op.typeCodes[0] ?? '');
  const save = useMutation({
    mutationFn: () => api.put(`/api/v1/warehouse-types/ops/${op.op}`, { typeCodes: [first, ...on.filter((c) => c !== first)].filter((c) => on.includes(c)) }),
    onSuccess: () => { void qc.invalidateQueries({ queryKey: ['warehouse-types'] }); onClose(); },
  });
  const toggle = (c: string, x: boolean) => {
    const next = x ? [...on, c] : on.filter((y) => y !== c);
    setOn(next);
    if (!x && first === c) setFirst(next[0] ?? '');
    if (x && !first) setFirst(c);
  };
  return (
    <Modal title={`${op.label} — loại kho dùng được`} onClose={onClose}
      footer={<><button className="btn btn-primary" disabled={save.isPending || !on.length || !first} onClick={() => save.mutate()}>Ghi</button><button className="btn" onClick={onClose}>Thoát</button></>}>
      <div className="muted full" style={{ fontSize: 12.5 }}>Tích các loại kho chọn được trên chứng từ; chấm <b>Tự chọn</b> cho loại được điền sẵn.</div>
      <table className="grid full">
        <thead><tr><th style={{ width: 90 }}>Dùng được</th><th style={{ width: 80 }}>Tự chọn</th><th>Loại kho</th></tr></thead>
        <tbody>{types.map((t) => (
          <tr key={t.code}>
            <td style={{ textAlign: 'center' }}><input type="checkbox" checked={on.includes(t.code)} onChange={(e) => toggle(t.code, e.target.checked)} /></td>
            <td style={{ textAlign: 'center' }}><input type="radio" name="tu-chon" disabled={!on.includes(t.code)} checked={first === t.code} onChange={() => setFirst(t.code)} /></td>
            <td><b className="mono">{t.code}</b> {t.name}</td>
          </tr>
        ))}</tbody>
      </table>
      {save.error && <div className="alert alert-bad full">{errorText(save.error)}</div>}
    </Modal>
  );
}
