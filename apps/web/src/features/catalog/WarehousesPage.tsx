/**
 * Danh mục kho (DM12) — cấu hình kho cho từng chi nhánh. Mã kho khớp mã kho của các dòng nhập xuất gửi sang.
 * Lưới: Chi nhánh · Mã kho · Tên kho · Địa chỉ · Theo dõi · Kho mặc định · Kho khuyến mại · Tài khoản · Ghi chú.
 * Kho mặc định của chi nhánh nhận các dòng nhập xuất không ghi mã kho (lọc báo cáo kho theo kho).
 * Bên trái lọc theo chi nhánh; thêm kho mới điền sẵn chi nhánh đang chọn. Quay về dữ liệu gốc ở nút đầu màn.
 */
import { useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, errorText } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useThemTuDiaChi } from '@/lib/themNhanh';
import { workBranch } from '@/lib/workBranch';
import { PageHeader } from '@/components/PageHeader';
import { ErrorBox, Field, Loading, Modal, useViewAgain } from '@/components/ui';
import { DataGrid, type Column } from '@/components/DataGrid';
import { CatalogToolbar } from '@/components/CatalogToolbar';
import { NutNhapExcel } from '@/components/NhapExcelWizard';
import { nhapLoai } from '@/lib/nhapExcel';
import { BranchPicker } from '@/components/filters';

export interface Warehouse {
  code: string; branchCode: string; branchName: string; name: string; address: string;
  isActive: boolean; isDefault: boolean; isPromo: boolean; account: string; note: string;
  /** MST kê khai của kho (0121); trống = theo chi nhánh → công ty. taxIdUsed = MST thực dùng khi ghi sổ. */
  taxId?: string; taxIdUsed?: string; uid?: string;
  /** Ngày MST mới bắt đầu hiệu lực (gửi khi đổi MST). */
  taxValidFrom?: string;
}

export function useWarehouses() {
  return useQuery({ queryKey: ['warehouses'], queryFn: () => api.get<Warehouse[]>('/api/v1/warehouses'), staleTime: 60_000 });
}

export function WarehousesPage() {
  const { can } = useAuth();
  const qc = useQueryClient();
  const canWrite = can('catalog:write');
  const [branch, setBranch] = useState('');
  const [editing, setEditing] = useState<(Partial<Warehouse> & { isNew?: boolean }) | null>(null);
  const [sel, setSel] = useState<Warehouse | null>(null);
  useThemTuDiaChi(() => setEditing({ isNew: true, isActive: true, branchCode: workBranch.get() || '' }), canWrite);
  const exportRef = useRef<(() => void) | null>(null);
  const q = useWarehouses();
  const rows = (q.data ?? []).filter((w) => !branch || w.branchCode === branch);
  const del = useMutation({ mutationFn: (code: string) => api.delete(`/api/v1/warehouses/${encodeURIComponent(code)}`), onSuccess: () => { setSel(null); void qc.invalidateQueries({ queryKey: ['warehouses'] }); } });

  return (
    <>
      <PageHeader title="Danh mục kho" code="DM12" subtitle="Kho của từng chi nhánh — kho mặc định nhận các dòng nhập xuất không ghi mã kho" helpKey="chi-nhanh" />
      <div className="card">
        <div className="row" style={{ gap: 8, alignItems: 'center', padding: '6px 8px' }}>
          <span className="muted">Chi nhánh</span>
          <BranchPicker value={branch} onChange={setBranch} placeholder="Tất cả chi nhánh" className="input w-lg" />
          <span className="muted">{rows.length} kho</span>
        </div>
        <CatalogToolbar
          canWrite={canWrite}
          hasSelection={Boolean(sel)}
          busy={del.isPending}
          onAdd={() => setEditing({ isNew: true, isActive: true, branchCode: branch || sel?.branchCode || '' })}
          onEdit={() => sel && setEditing(sel)}
          onDelete={() => { if (sel && window.confirm(`Bạn có chắc chắn muốn xoá kho ${sel.code} - ${sel.name}?`)) del.mutate(sel.code); }}
          onRefresh={() => q.refetch()}
          onExport={() => exportRef.current?.()}
          extra={<NutNhapExcel loai={nhapLoai('kho')!} disabled={!canWrite} />}
        />
        <ErrorBox error={q.error ? errorText(q.error) : del.error ? errorText(del.error) : null} />
        {q.isLoading ? <Loading /> : (
          <DataGrid
            storageKey="dm12"
            exportName="kho"
            groupable
            exportRef={exportRef}
            rows={rows}
            rowKey={(w) => w.code}
            onSelect={setSel}
            onRowDoubleClick={(w) => canWrite && setEditing(w)}
            rowClassName={(w) => (w.isActive ? '' : 'muted')}
            footerLabel={false}
            columns={[
              { key: 'branchCode', header: 'Chi nhánh', type: 'code', width: 120 },
              { key: 'branchName', header: 'Tên chi nhánh', width: 160 },
              { key: 'code', header: 'Mã kho', type: 'code', width: 110 },
              { key: 'name', header: 'Tên kho', width: 200 },
              { key: 'address', header: 'Địa chỉ', width: 260 },
              { key: 'isActive', header: 'Theo dõi', type: 'check', width: 70 },
              { key: 'isDefault', header: 'Kho mặc định', type: 'check', width: 90 },
              { key: 'isPromo', header: 'Kho khuyến mại', type: 'check', width: 100 },
              { key: 'taxIdUsed', header: 'MST', type: 'code', width: 130, title: 'MST ghi vào sổ của kho này hôm nay (theo chi nhánh / cơ cấu tổ chức)' },
              { key: 'note', header: 'Ghi chú', width: 200 },
            ] satisfies Column<Warehouse>[]}
          />
        )}
      </div>
      {editing && <WarehouseForm value={editing} onClose={() => setEditing(null)} />}
    </>
  );
}

/** Form kho; mở được từ ô chọn kho trên chứng từ (nút +), ghi xong báo mã kho mới qua onSaved. */
export function WarehouseForm({ value, onClose, onSaved }: { value: Partial<Warehouse> & { isNew?: boolean }; onClose: () => void; onSaved?: (code: string) => void }) {
  const qc = useQueryClient();
  const [v, setV] = useState(value);
  const set = (p: Partial<Warehouse>) => setV((x) => ({ ...x, ...p }));
  const viewAgain = useViewAgain();
  const save = useMutation({
    mutationFn: () => {
      const body = {
        branchCode: v.branchCode ?? '', name: v.name ?? '', address: v.address ?? '', isActive: v.isActive !== false,
        isDefault: Boolean(v.isDefault), isPromo: Boolean(v.isPromo), account: v.account ?? '', note: v.note ?? '', taxId: (v.taxId ?? '').trim(),
        taxValidFrom: (v.taxId ?? '') !== (value.taxId ?? '') ? v.taxValidFrom || null : null,
      };
      return value.isNew ? api.post('/api/v1/warehouses', { ...body, code: v.code?.trim() }) : api.patch(`/api/v1/warehouses/${encodeURIComponent(value.code!)}`, body);
    },
    onSuccess: () => { void qc.invalidateQueries({ queryKey: ['warehouses'] }); if (value.isNew) { onSaved?.(v.code?.trim() ?? ''); onClose(); } else viewAgain[1](); },
  });
  const txt = (k: keyof Warehouse, label: string, full = false) => <Field label={label} full={full}><input className="input" value={String(v[k] ?? '')} onChange={(e) => set({ [k]: e.target.value } as Partial<Warehouse>)} /></Field>;
  const check = (k: 'isActive' | 'isDefault' | 'isPromo', label: string) => <label className="checkbox"><input type="checkbox" checked={k === 'isActive' ? v.isActive !== false : Boolean(v[k])} onChange={(e) => set({ [k]: e.target.checked })} /> {label}</label>;
  return (
    <Modal viewAgain={viewAgain} viewFirst={!value.isNew} wide title="Thông tin kho" onClose={onClose}
      footer={<><button className="btn btn-primary" disabled={save.isPending || !v.code?.trim() || !v.branchCode || !v.name?.trim()} onClick={() => save.mutate()}>Ghi</button><button className="btn" onClick={onClose}>Thoát</button></>}>
      <fieldset className="fgroup">
        <legend>Thông tin kho</legend>
        <Field label="Mã kho (*)" hint="Mã kho ghi trên phiếu nhập, xuất"><input className="input mono" maxLength={12} value={v.code ?? ''} disabled={!value.isNew} onChange={(e) => set({ code: e.target.value })} autoFocus /></Field>
        <Field label="Chi nhánh (*)"><BranchPicker value={v.branchCode ?? ''} onChange={(branchCode) => set({ branchCode })} activeOnly /></Field>
        {txt('name', 'Tên kho (*)')}
        {/* [2026-11-13 Nguyễn Văn Thủy] MST khai ở Cơ cấu tổ chức / chi nhánh; kho chỉ xem. Ô sửa chỉ hiện khi kho đã có MST riêng từ trước (đóng góp) */}
        {!value.taxId ? (
          <Field label="MST" tip="Theo chi nhánh / Cơ cấu tổ chức. Muốn đổi thì đổi ở đó">
            <div className="input mono" style={{ background: 'var(--surface-2, #f4f6f9)', color: 'var(--muted, #666)' }}>{v.taxIdUsed || '—'}</div>
          </Field>
        ) : <Field label="MST riêng của kho" tip="Xoá trắng để theo chi nhánh / Cơ cấu tổ chức">
          <input className="input mono" value={v.taxId ?? ''} placeholder={v.taxIdUsed ? `Đang dùng: ${v.taxIdUsed}` : '10 số hoặc 10 số-3 số'} onChange={(e) => set({ taxId: e.target.value.replace(/[^0-9-]/g, '') })} />
          {v.taxId && !/^[0-9]{10}(-[0-9]{3})?$/.test(v.taxId) && <div className="neg" style={{ fontSize: 12.5, marginTop: 3, fontWeight: 600 }}>MST gồm 10 số hoặc 10 số-3 số</div>}
        </Field>}
        {!value.isNew && (v.taxId ?? '') !== (value.taxId ?? '') && (
          <Field label="MST mới áp dụng từ ngày" tip="Chứng từ từ ngày này ghi MST mới; chứng từ trước ngày này giữ MST cũ">
            <input className="input" type="date" value={v.taxValidFrom ?? new Date(Date.now() + 7 * 3_600_000).toISOString().slice(0, 10)} onChange={(e) => set({ taxValidFrom: e.target.value })} />
          </Field>
        )}
        {txt('address', 'Địa chỉ', true)}
        {txt('note', 'Ghi chú', true)}
        <Field label=" " full>
          <div className="row" style={{ gap: 16 }}>
            {check('isActive', 'Theo dõi')}
            {check('isDefault', 'Kho mặc định (nhận dòng không ghi mã kho)')}
            {check('isPromo', 'Kho khuyến mại')}
          </div>
        </Field>
      </fieldset>
      {!value.isNew && value.code && <LichSuMstKho code={value.code} />}
      {save.error && <div className="alert alert-bad full">{errorText(save.error)}</div>}
    </Modal>
  );
}

/** Phiên bản MST của kho: mỗi lần đổi MST / đổi chi nhánh một dòng (0121). */
function LichSuMstKho({ code }: { code: string }) {
  const h = useQuery({ queryKey: ['warehouse-tax-history', code], queryFn: () => api.get<{ validFrom: string; validTo: string | null; taxId: string; taxIdUsed: string; changedBy: string; changedAt: string }[]>(`/api/v1/warehouses/${encodeURIComponent(code)}/tax-history`) });
  const ngay = (d: string | null) => (!d ? '' : d <= '1900-01-01' ? 'Từ đầu' : d.split('-').reverse().join('/'));
  if ((h.data?.length ?? 0) < 2) return null; // chỉ hiện khi MST đã đổi ít nhất một lần
  return (
    <fieldset className="fgroup full">
      <legend>Phiên bản MST</legend>
      <table className="mh-mini full">
        <thead><tr><th>Hiệu lực từ</th><th>Đến trước</th><th>MST đặt ở kho</th><th>MST ghi sổ</th><th>Người đổi</th></tr></thead>
        <tbody>{(h.data ?? []).map((r, i) => (
          <tr key={i}><td>{ngay(r.validFrom)}</td><td>{r.validTo ? ngay(r.validTo) : 'nay'}</td><td className="mono">{r.taxId || '— (theo cấp trên)'}</td><td className="mono"><b>{r.taxIdUsed}</b></td><td>{r.changedBy.replace(/\s*\(\d{4}\)$/, '')}</td></tr>
        ))}</tbody>
      </table>
    </fieldset>
  );
}
