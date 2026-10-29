/**
 * Danh mục đơn vị tính (DM15) — TÊN ĐVT dùng chung (Hộp, Lốc, Lốc_4, Thùng…), không có tỉ lệ.
 *   - Có sẵn danh sách khởi tạo; khai ĐVT mới ở mặt hàng thì CSDL tự thêm vào đây (nguồn "Tự thêm").
 *   - Tỉ lệ quy đổi khai ở từng mặt hàng (thẻ ĐVT): Hộp 1 · Lốc 4 · Thùng 48 — mọi số lượng cuối cùng quy về ĐVT nhỏ nhất.
 *   - Tên đang có mặt hàng dùng: không đổi tên / không xoá; bỏ tích "Đang dùng" để ẩn khỏi gợi ý.
 */
import { useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, errorText } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { PageHeader } from '@/components/PageHeader';
import { ErrorBox, Field, Loading, Modal, useViewAgain } from '@/components/ui';
import { DataGrid, type Column } from '@/components/DataGrid';
import { CatalogToolbar } from '@/components/CatalogToolbar';

export interface UnitName { id: string; name: string; note: string; source: 'seed' | 'auto' | 'manual'; isActive: boolean; products: number; createdBy: string; updatedBy: string; createdAt: string; updatedAt: string }
const SOURCE: Record<UnitName['source'], string> = { seed: 'Khởi tạo', auto: 'Tự thêm khi khai mặt hàng', manual: 'Thêm tay' };
const dt = (s: string) => new Date(s).toLocaleString('vi-VN', { hour12: false });

/** Tên ĐVT đang dùng — gợi ý khi khai ĐVT ở mặt hàng. */
export function useUnitNames() {
  return useQuery({ queryKey: ['unit-names'], queryFn: () => api.get<UnitName[]>('/api/v1/unit-names'), staleTime: 60_000 });
}

export function UnitNamesPage() {
  const { can } = useAuth();
  const qc = useQueryClient();
  const canWrite = can('catalog:write');
  const [editing, setEditing] = useState<(Partial<UnitName> & { isNew?: boolean }) | null>(null);
  const [sel, setSel] = useState<UnitName | null>(null);
  const [scope, setScope] = useState<'all' | 'used' | 'unused'>('all');
  const exportRef = useRef<(() => void) | null>(null);
  const q = useUnitNames();
  const rows = (q.data ?? []).filter((u) => scope === 'all' || (scope === 'used' ? u.products > 0 : u.products === 0));
  const del = useMutation({ mutationFn: (id: string) => api.delete(`/api/v1/unit-names/${id}`), onSuccess: () => { setSel(null); void qc.invalidateQueries({ queryKey: ['unit-names'] }); } });

  return (
    <>
      <PageHeader title="Danh mục đơn vị tính" code="DM15" helpKey="danh-muc-dvt"
        subtitle="Tên ĐVT dùng chung (Hộp, Lốc, Lốc_4, Thùng…) — chỉ là tên, tỉ lệ quy đổi khai ở từng mặt hàng; khai ĐVT mới ở mặt hàng thì tự thêm vào đây" />
      <div className="card">
        <div className="row" style={{ gap: 8, alignItems: 'center', padding: '6px 8px' }}>
          <div className="tabs" style={{ margin: 0 }}>
            {([['all', 'Tất cả'], ['used', 'Đang có mặt hàng dùng'], ['unused', 'Chưa dùng']] as const).map(([k, l]) => <button key={k} className={`tab ${scope === k ? 'active' : ''}`} onClick={() => setScope(k)}>{l}</button>)}
          </div>
          <span className="muted">{rows.length} đơn vị tính</span>
        </div>
        <CatalogToolbar
          canWrite={canWrite}
          hasSelection={Boolean(sel)}
          busy={del.isPending}
          onAdd={() => setEditing({ isNew: true, isActive: true })}
          onEdit={() => sel && setEditing(sel)}
          onDelete={() => {
            if (!sel) return;
            if (sel.products) { window.alert(`"${sel.name}" đang dùng ở ${sel.products} mặt hàng — không xoá được. Mở ra, bấm Sửa, bỏ tích "Đang dùng" để ẩn khỏi gợi ý.`); return; }
            if (window.confirm(`Xoá đơn vị tính "${sel.name}"?`)) del.mutate(sel.id);
          }}
          onRefresh={() => q.refetch()}
          onExport={() => exportRef.current?.()}
        />
        <ErrorBox error={q.error ? errorText(q.error) : del.error ? errorText(del.error) : null} />
        {q.isLoading ? <Loading /> : (
          <DataGrid
            storageKey="dm15"
            exportName="don-vi-tinh"
            exportRef={exportRef}
            rows={rows}
            rowKey={(u) => u.id}
            onSelect={setSel}
            onRowDoubleClick={(u) => setEditing(u)}
            rowClassName={(u) => (u.isActive ? '' : 'muted')}
            footerLabel={false}
            columns={[
              { key: 'name', header: 'Đơn vị tính', width: 160, bold: true },
              { key: 'products', header: 'Số mặt hàng dùng', type: 'number', width: 120 },
              { key: 'isActive', header: 'Đang dùng', type: 'check', width: 80 },
              { key: 'source', header: 'Nguồn', width: 190, value: (u) => SOURCE[u.source] },
              { key: 'note', header: 'Ghi chú', width: 260 },
              { key: 'createdBy', header: 'Người tạo', width: 170 },
              { key: 'createdAt', header: 'Ngày tạo', width: 150, value: (u) => dt(u.createdAt) },
              { key: 'updatedBy', header: 'Người sửa', width: 150 },
              { key: 'updatedAt', header: 'Sửa lúc', width: 150, value: (u) => dt(u.updatedAt) },
            ] satisfies Column<UnitName>[]}
          />
        )}
      </div>
      {editing && <UnitNameForm value={editing} canWrite={canWrite} onClose={() => setEditing(null)} />}
    </>
  );
}

function UnitNameForm({ value, canWrite, onClose }: { value: Partial<UnitName> & { isNew?: boolean }; canWrite: boolean; onClose: () => void }) {
  const qc = useQueryClient();
  const [v, setV] = useState(value);
  const set = (p: Partial<UnitName>) => setV((x) => ({ ...x, ...p }));
  const used = (value.products ?? 0) > 0;
  const name = (v.name ?? '').replace(/\s+/g, ' ').trim();
  const bad = !name ? 'Chưa nhập tên' : name.length > 32 ? 'Tối đa 32 ký tự' : !/^[\p{L}\p{N} _.\-/()+×]+$/u.test(name) ? 'Chỉ gồm chữ, số, khoảng trắng và _ - . / ( ) + ×' : '';
  const viewAgain = useViewAgain();
  const save = useMutation({
    mutationFn: () => {
      const body = { name, note: v.note ?? '', isActive: v.isActive !== false };
      return value.isNew ? api.post('/api/v1/unit-names', body) : api.patch(`/api/v1/unit-names/${value.id}`, used ? { note: body.note, isActive: body.isActive } : body);
    },
    onSuccess: () => { void qc.invalidateQueries({ queryKey: ['unit-names'] }); if (value.isNew) onClose(); else viewAgain[1](); },
  });
  return (
    <Modal viewAgain={viewAgain} viewFirst={!value.isNew} title={value.isNew ? 'Thêm đơn vị tính' : `Đơn vị tính ${value.name}`} onClose={onClose}
      footer={<><button className="btn btn-primary" disabled={save.isPending || Boolean(bad) || !canWrite} onClick={() => save.mutate()}>Ghi</button><button className="btn" onClick={onClose}>Thoát</button></>}>
      <Field label="Tên đơn vị tính (*)" hint={used ? `Đang dùng ở ${value.products} mặt hàng — không đổi tên được (phiếu đã ghi theo tên này)` : bad || 'Ví dụ: Hộp, Lốc, Lốc_4, Thùng_24 — chỉ là tên, tỉ lệ khai ở mặt hàng'}>
        <input className="input" value={v.name ?? ''} maxLength={40} disabled={used} onChange={(e) => set({ name: e.target.value })} autoFocus={value.isNew} />
      </Field>
      <Field label="Trạng thái">
        <label className="checkbox" style={{ height: 34 }}><input type="checkbox" checked={v.isActive !== false} onChange={(e) => set({ isActive: e.target.checked })} /> Đang dùng (hiện trong gợi ý khi khai mặt hàng)</label>
      </Field>
      <Field label="Ghi chú" full><input className="input" value={v.note ?? ''} maxLength={300} onChange={(e) => set({ note: e.target.value })} placeholder="Ví dụ: lốc 4 hộp 110ml" /></Field>
      {!value.isNew && (
        <div className="full muted" style={{ fontSize: 12 }}>
          Nguồn: <b>{SOURCE[value.source!]}</b> · tạo bởi {value.createdBy || '—'} lúc {dt(value.createdAt!)} · sửa lần cuối {value.updatedBy || '—'} lúc {dt(value.updatedAt!)}
        </div>
      )}
      {save.error && <div className="alert alert-bad full">{errorText(save.error)}</div>}
    </Modal>
  );
}
