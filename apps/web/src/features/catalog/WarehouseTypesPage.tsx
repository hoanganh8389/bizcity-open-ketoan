// [2026-11-13 Nguyễn Văn Thủy] Danh mục Loại kho (DM18) + nghiệp vụ dùng loại kho nào theo thứ tự ưu tiên (0128) (đóng góp)
/**
 * Hai phần:
 *   - Loại kho: mã, tên, công dụng, công tắc Được bán / Thuộc sở hữu / Theo dõi hạn dùng, đầu số TK kho. Thêm loại mới được.
 *   - Nghiệp vụ: mỗi nghiệp vụ (nhập mua, bán, khách trả, chuyển kho…) dùng được loại kho nào; loại đứng đầu = chứng từ tự chọn.
 *     Chọn kho thuộc loại không có trong danh sách thì máy chủ chặn.
 */
import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, ArrowRight, X } from 'lucide-react';
import { api, errorText } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { PageHeader } from '@/components/PageHeader';
import { ErrorBox, Field, Loading, Modal } from '@/components/ui';
import { DataGrid } from '@/components/DataGrid';

export interface WarehouseType { code: string; name: string; purpose: string; canSell: boolean; owned: boolean; trackExpiry: boolean; accountPrefix: string; isSystem: boolean; isActive: boolean; sortOrder: number; warehouses: number; activeWarehouses: number }
export interface WarehouseOp { op: string; label: string; area: string; typeCodes: string[] }

export function useWarehouseTypes() {
  return useQuery({ queryKey: ['warehouse-types'], queryFn: () => api.get<{ types: WarehouseType[]; ops: WarehouseOp[] }>('/api/v1/warehouse-types'), staleTime: 60_000 });
}

export function WarehouseTypesPage() {
  const { can } = useAuth();
  const canWrite = can('catalog:write');
  const q = useWarehouseTypes();
  const [tab, setTab] = useState<'loai' | 'nv'>('loai');
  const [editing, setEditing] = useState<(Partial<WarehouseType> & { isNew?: boolean }) | null>(null);
  const [sel, setSel] = useState<WarehouseType | null>(null);
  const types = q.data?.types ?? [];
  return (
    <>
      <PageHeader title="Loại kho" code="DM18" subtitle="Mỗi kho thuộc một loại; chứng từ tự chọn kho theo loại ưu tiên của nghiệp vụ" helpKey="loai-kho" />
      <div className="card">
        <div className="tabs" style={{ padding: '6px 8px 0' }}>
          <button className={`tab ${tab === 'loai' ? 'active' : ''}`} onClick={() => setTab('loai')}>Loại kho</button>
          <button className={`tab ${tab === 'nv' ? 'active' : ''}`} onClick={() => setTab('nv')} title="Nghiệp vụ dùng được loại kho nào, loại đứng đầu được tự chọn">Nghiệp vụ dùng loại kho</button>
        </div>
        <ErrorBox error={q.error ? errorText(q.error) : null} />
        {q.isLoading ? <Loading /> : tab === 'loai' ? (
          <>
            <div className="row" style={{ gap: 6, padding: '6px 8px' }}>
              <button className="btn btn-primary btn-sm" disabled={!canWrite} onClick={() => setEditing({ isNew: true, owned: true, isActive: true })}>Thêm</button>
              <button className="btn btn-sm" disabled={!canWrite || !sel} onClick={() => sel && setEditing(sel)}>Sửa</button>
              <span className="muted">{types.length} loại</span>
            </div>
            <DataGrid
              storageKey="dm18" exportName="loai-kho" rows={types} rowKey={(t) => t.code}
              onSelect={setSel} onRowDoubleClick={(t) => canWrite && setEditing(t)} rowClassName={(t) => (t.isActive ? '' : 'muted')} footerLabel={false}
              columns={[
                { key: 'code', header: 'Mã', type: 'code', width: 80 },
                { key: 'name', header: 'Tên loại kho', width: 200 },
                { key: 'purpose', header: 'Công dụng', width: 280 },
                { key: 'canSell', header: 'Được bán', type: 'check', width: 75, title: 'Hàng trong kho loại này được bán, tính vào tồn bán được' },
                { key: 'owned', header: 'Thuộc sở hữu', type: 'check', width: 90, title: 'Hàng của đơn vị: tính giá vốn, ghi sổ kho. Bỏ tích = hàng nhận giữ hộ, chỉ theo dõi số lượng' },
                { key: 'trackExpiry', header: 'Theo dõi hạn dùng', type: 'check', width: 110, title: 'Cảnh báo hàng cận hạn / hết hạn trong kho' },
                { key: 'accountPrefix', header: 'TK kho', type: 'code', width: 70, title: 'Đầu số tài khoản kho của loại (156, 157…). Trống = theo Tài khoản ngầm định' },
                { key: 'activeWarehouses', header: 'Số kho', type: 'number', width: 70, title: 'Số kho đang theo dõi thuộc loại này' },
                { key: 'isActive', header: 'Theo dõi', type: 'check', width: 70 },
              ]}
            />
          </>
        ) : <NghiepVu types={types} ops={q.data?.ops ?? []} canWrite={canWrite} />}
      </div>
      {editing && <LoaiKhoForm value={editing} onClose={() => setEditing(null)} />}
    </>
  );
}

function LoaiKhoForm({ value, onClose }: { value: Partial<WarehouseType> & { isNew?: boolean }; onClose: () => void }) {
  const qc = useQueryClient();
  const [v, setV] = useState(value);
  const set = (p: Partial<WarehouseType>) => setV((x) => ({ ...x, ...p }));
  const save = useMutation({
    mutationFn: () => api.put(`/api/v1/warehouse-types/${encodeURIComponent((v.code ?? '').trim().toUpperCase())}`, {
      name: v.name ?? '', purpose: v.purpose ?? '', canSell: Boolean(v.canSell), owned: v.owned !== false, trackExpiry: Boolean(v.trackExpiry),
      accountPrefix: v.owned === false ? '' : (v.accountPrefix ?? ''), isActive: v.isActive !== false,
    }),
    onSuccess: () => { void qc.invalidateQueries({ queryKey: ['warehouse-types'] }); void qc.invalidateQueries({ queryKey: ['warehouses'] }); onClose(); },
  });
  const ck = (k: 'canSell' | 'owned' | 'trackExpiry' | 'isActive', label: string, tip: string, disabled = false) => (
    <label className="checkbox" title={tip}><input type="checkbox" disabled={disabled} checked={k === 'owned' || k === 'isActive' ? v[k] !== false : Boolean(v[k])}
      onChange={(e) => set(k === 'owned' && !e.target.checked ? { owned: false, canSell: false, accountPrefix: '' } : { [k]: e.target.checked })} /> {label}</label>
  );
  return (
    <Modal wide title="Loại kho" onClose={onClose}
      footer={<><button className="btn btn-primary" disabled={save.isPending || !v.code?.trim() || !v.name?.trim()} onClick={() => save.mutate()}>Ghi</button><button className="btn" onClick={onClose}>Thoát</button></>}>
      <fieldset className="fgroup">
        <legend>Thông tin loại kho</legend>
        <Field label="Mã (*)" tip={value.isSystem ? 'Loại gốc — không đổi mã' : 'Chữ in hoa / số, 2–12 ký tự'}>
          <input className="input mono" maxLength={12} value={v.code ?? ''} disabled={!value.isNew} autoFocus onChange={(e) => set({ code: e.target.value.toUpperCase().replace(/[^A-Z0-9_]/g, '') })} />
        </Field>
        <Field label="Tên loại kho (*)"><input className="input" value={v.name ?? ''} onChange={(e) => set({ name: e.target.value })} /></Field>
        <Field label="Công dụng" full><input className="input" value={v.purpose ?? ''} onChange={(e) => set({ purpose: e.target.value })} /></Field>
        <Field label="Đầu số TK kho" tip="156, 157… Trống = theo Tài khoản ngầm định. Hàng nhận giữ hộ không ghi sổ kho">
          <input className="input mono" value={v.accountPrefix ?? ''} disabled={v.owned === false} placeholder="156" onChange={(e) => set({ accountPrefix: e.target.value.replace(/[^0-9]/g, '') })} />
        </Field>
        <Field label=" " full>
          <div className="row" style={{ gap: 16, flexWrap: 'wrap' }}>
            {ck('owned', 'Thuộc sở hữu', 'Bỏ tích = hàng nhận giữ hộ: chỉ theo dõi số lượng, không tính giá vốn, không bán')}
            {ck('canSell', 'Được bán', 'Hàng trong kho loại này được bán', v.owned === false)}
            {ck('trackExpiry', 'Theo dõi hạn dùng', 'Cảnh báo cận hạn / hết hạn')}
            {ck('isActive', 'Theo dõi', 'Bỏ tích = ngừng dùng loại (khi không còn kho đang theo dõi thuộc loại này)')}
          </div>
        </Field>
      </fieldset>
      {save.error && <div className="alert alert-bad full">{errorText(save.error)}</div>}
    </Modal>
  );
}

/** Mỗi nghiệp vụ một dòng: các loại kho theo thứ tự ưu tiên (bấm ← → đổi thứ tự, × bỏ), ô thêm loại. */
function NghiepVu({ types, ops, canWrite }: { types: WarehouseType[]; ops: WarehouseOp[]; canWrite: boolean }) {
  const qc = useQueryClient();
  const save = useMutation({
    mutationFn: ({ op, typeCodes }: { op: string; typeCodes: string[] }) => api.put(`/api/v1/warehouse-types/ops/${op}`, { typeCodes }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['warehouse-types'] }),
  });
  const name = (c: string) => types.find((t) => t.code === c)?.name ?? c;
  const active = types.filter((t) => t.isActive);
  const move = (o: WarehouseOp, i: number, d: number) => { const a = [...o.typeCodes]; const [x] = a.splice(i, 1); a.splice(i + d, 0, x!); save.mutate({ op: o.op, typeCodes: a }); };
  return (
    <div style={{ padding: 8 }}>
      <ErrorBox error={save.error ? errorText(save.error) : null} />
      <table className="mh-mini full">
        <thead><tr><th style={{ width: 90 }}>Phân hệ</th><th style={{ width: 220 }}>Nghiệp vụ</th><th title="Loại đứng đầu: chứng từ tự chọn kho thuộc loại này. Kho thuộc loại không có ở đây thì không chọn được">Loại kho dùng được (đầu tiên = tự chọn)</th></tr></thead>
        <tbody>{ops.map((o) => (
          <tr key={o.op}>
            <td className="muted">{o.area}</td>
            <td>{o.label}</td>
            <td>
              <div className="row" style={{ gap: 4, flexWrap: 'wrap', alignItems: 'center' }}>
                {o.typeCodes.map((c, i) => (
                  <span key={c} title={name(c)} style={{ display: 'inline-flex', alignItems: 'center', gap: 2, border: '1px solid var(--border, #d0d7e2)', borderRadius: 4, padding: '0 4px', background: i === 0 ? 'var(--surface-2, #eef2f7)' : undefined, fontWeight: i === 0 ? 600 : undefined }}>
                    {canWrite && i > 0 && <ArrowLeft size={12} style={{ cursor: 'pointer' }} onClick={() => move(o, i, -1)} />}
                    <span className="mono">{c}</span>
                    {canWrite && i < o.typeCodes.length - 1 && <ArrowRight size={12} style={{ cursor: 'pointer' }} onClick={() => move(o, i, 1)} />}
                    {canWrite && o.typeCodes.length > 1 && <X size={12} style={{ cursor: 'pointer' }} onClick={() => save.mutate({ op: o.op, typeCodes: o.typeCodes.filter((x) => x !== c) })} />}
                  </span>
                ))}
                {canWrite && active.some((t) => !o.typeCodes.includes(t.code)) && (
                  <select className="select input" style={{ width: 150 }} value="" onChange={(e) => e.target.value && save.mutate({ op: o.op, typeCodes: [...o.typeCodes, e.target.value] })}>
                    <option value="">+ thêm loại</option>
                    {active.filter((t) => !o.typeCodes.includes(t.code)).map((t) => <option key={t.code} value={t.code}>{t.code} · {t.name}</option>)}
                  </select>
                )}
              </div>
            </td>
          </tr>
        ))}</tbody>
      </table>
    </div>
  );
}
