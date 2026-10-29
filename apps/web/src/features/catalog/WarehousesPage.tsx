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
import { PageHeader } from '@/components/PageHeader';
import { ErrorBox, Field, Loading, Modal, useViewAgain } from '@/components/ui';
import { DataGrid, type Column } from '@/components/DataGrid';
import { CatalogToolbar } from '@/components/CatalogToolbar';
import { BranchPicker } from '@/components/filters';

export interface Warehouse {
  code: string; branchCode: string; branchName: string; name: string; address: string;
  isActive: boolean; isDefault: boolean; isPromo: boolean; account: string; note: string;
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
              { key: 'account', header: 'Tài khoản', type: 'code', width: 90 },
              { key: 'note', header: 'Ghi chú', width: 200 },
            ] satisfies Column<Warehouse>[]}
          />
        )}
      </div>
      {editing && <WarehouseForm value={editing} onClose={() => setEditing(null)} />}
    </>
  );
}

function WarehouseForm({ value, onClose }: { value: Partial<Warehouse> & { isNew?: boolean }; onClose: () => void }) {
  const qc = useQueryClient();
  const [v, setV] = useState(value);
  const set = (p: Partial<Warehouse>) => setV((x) => ({ ...x, ...p }));
  const viewAgain = useViewAgain();
  const save = useMutation({
    mutationFn: () => {
      const body = {
        branchCode: v.branchCode ?? '', name: v.name ?? '', address: v.address ?? '', isActive: v.isActive !== false,
        isDefault: Boolean(v.isDefault), isPromo: Boolean(v.isPromo), account: v.account ?? '', note: v.note ?? '',
      };
      return value.isNew ? api.post('/api/v1/warehouses', { ...body, code: v.code?.trim() }) : api.patch(`/api/v1/warehouses/${encodeURIComponent(value.code!)}`, body);
    },
    onSuccess: () => { void qc.invalidateQueries({ queryKey: ['warehouses'] }); if (value.isNew) onClose(); else viewAgain[1](); },
  });
  const txt = (k: keyof Warehouse, label: string, full = false) => <Field label={label} full={full}><input className="input" value={String(v[k] ?? '')} onChange={(e) => set({ [k]: e.target.value } as Partial<Warehouse>)} /></Field>;
  const check = (k: 'isActive' | 'isDefault' | 'isPromo', label: string) => <label className="checkbox"><input type="checkbox" checked={k === 'isActive' ? v.isActive !== false : Boolean(v[k])} onChange={(e) => set({ [k]: e.target.checked })} /> {label}</label>;
  return (
    <Modal viewAgain={viewAgain} viewFirst={!value.isNew} wide title="Thông tin kho" onClose={onClose}
      footer={<><button className="btn btn-primary" disabled={save.isPending || !v.code?.trim() || !v.branchCode || !v.name?.trim()} onClick={() => save.mutate()}>Ghi</button><button className="btn" onClick={onClose}>Thoát</button></>}>
      <fieldset className="fgroup">
        <legend>Thông tin kho</legend>
        <Field label="Mã kho (*)" hint="Khớp mã kho của dòng nhập xuất gửi sang"><input className="input mono" maxLength={12} value={v.code ?? ''} disabled={!value.isNew} onChange={(e) => set({ code: e.target.value })} autoFocus /></Field>
        <Field label="Chi nhánh (*)"><BranchPicker value={v.branchCode ?? ''} onChange={(branchCode) => set({ branchCode })} activeOnly /></Field>
        {txt('name', 'Tên kho (*)')}
        {txt('account', 'Tài khoản kho', false)}
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
      {save.error && <div className="alert alert-bad full">{errorText(save.error)}</div>}
    </Modal>
  );
}
