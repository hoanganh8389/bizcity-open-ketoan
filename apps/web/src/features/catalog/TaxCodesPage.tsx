/**
 * Loại thuế (ACC43): mã thuế, tên, thuế suất, tài khoản thuế; thêm chiều (đầu ra / đầu vào) và nhóm trên bảng kê.
 * Thanh nút Thêm · Sửa · Xoá · Nạp · Xuất; bấm đúp dòng để sửa.
 */
import { useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, errorText } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { PageHeader } from '@/components/PageHeader';
import { ErrorBox, Field, Loading, Modal, useViewAgain } from '@/components/ui';
import { DataGrid, type Column } from '@/components/DataGrid';
import { CatalogToolbar } from '@/components/CatalogToolbar';
import { AccountPicker } from '@/components/pickers';

interface TaxCode { code: string; name: string; rate: number; direction: string; accountCode: string | null; reportGroup: string; isActive: boolean }
const GROUPS = [['KCT', 'Không chịu thuế'], ['0', '0%'], ['5', '5%'], ['8', '8%'], ['10', '10%'], ['KKK', 'Không kê khai']];

const COLUMNS: Column<TaxCode>[] = [
  { key: 'code', header: 'Mã thuế', type: 'code', width: 100 },
  { key: 'name', header: 'Tên thuế', width: 420 },
  { key: 'rate', header: 'Thuế', type: 'number', width: 90, showZero: true, render: (t) => `${t.rate}%` },
  { key: 'accountCode', header: 'Tài khoản', type: 'code', width: 100 },
  { key: 'direction', header: 'Chiều', width: 90, hidden: true, value: (t) => (t.direction === 'output' ? 'Đầu ra' : 'Đầu vào') },
  { key: 'reportGroup', header: 'Nhóm bảng kê', width: 120, hidden: true, value: (t) => GROUPS.find(([k]) => k === t.reportGroup)?.[1] ?? t.reportGroup },
  { key: 'inactive', header: 'Ngừng dùng', type: 'check', width: 85, hidden: true, value: (t) => !t.isActive },
];

export function TaxCodesPage() {
  const { can } = useAuth();
  const qc = useQueryClient();
  const canWrite = can('catalog:write');
  const [editing, setEditing] = useState<(Partial<TaxCode> & { isNew?: boolean }) | null>(null);
  const [sel, setSel] = useState<TaxCode | null>(null);
  const exportRef = useRef<(() => void) | null>(null);
  const q = useQuery({ queryKey: ['tax-codes'], queryFn: () => api.get<TaxCode[]>('/api/v1/tax-codes') });
  const del = useMutation({ mutationFn: (code: string) => api.delete(`/api/v1/tax-codes/${encodeURIComponent(code)}`), onSuccess: () => { setSel(null); void qc.invalidateQueries({ queryKey: ['tax-codes'] }); } });

  return (
    <>
      <PageHeader title="Loại thuế" code="ACC43" subtitle="Mã loại thuế dùng trên dòng hàng của chứng từ (taxCode)" helpKey="loai-thue" />
      <div className="card">
        <CatalogToolbar
          canWrite={canWrite}
          hasSelection={Boolean(sel)}
          busy={del.isPending}
          onAdd={() => setEditing({ isNew: true, direction: 'output', reportGroup: '8', rate: 8, accountCode: '33311' })}
          onEdit={() => sel && setEditing(sel)}
          onDelete={() => { if (sel && window.confirm(`Bạn có chắc chắn muốn xoá loại thuế ${sel.code} - ${sel.name}?`)) del.mutate(sel.code); }}
          onRefresh={() => q.refetch()}
          onExport={() => exportRef.current?.()}
        />
        <ErrorBox error={q.error ? errorText(q.error) : del.error ? errorText(del.error) : null} />
        {q.isLoading ? <Loading /> : (
          <DataGrid
            storageKey="acc43-v2"
            exportName="loai-thue"
            groupable
            exportRef={exportRef}
            rows={q.data ?? []}
            rowKey={(t) => t.code}
            onSelect={setSel}
            onRowDoubleClick={(t) => canWrite && setEditing(t)}
            rowClassName={(t) => (t.isActive ? '' : 'muted')}
            footerLabel={false}
            columns={COLUMNS}
          />
        )}
      </div>
      {editing && <TaxForm value={editing} onClose={() => setEditing(null)} />}
    </>
  );
}

function TaxForm({ value, onClose }: { value: Partial<TaxCode> & { isNew?: boolean }; onClose: () => void }) {
  const qc = useQueryClient();
  const [v, setV] = useState(value);
  const set = (p: Partial<TaxCode>) => setV((x) => ({ ...x, ...p }));
  const viewAgain = useViewAgain();
  const save = useMutation({
    mutationFn: () => {
      const body = { name: v.name, rate: Number(v.rate), direction: v.direction, accountCode: v.accountCode || undefined, reportGroup: v.reportGroup };
      return value.isNew ? api.post('/api/v1/tax-codes', { ...body, code: v.code }) : api.patch(`/api/v1/tax-codes/${value.code}`, { ...body, isActive: v.isActive });
    },
    onSuccess: () => { void qc.invalidateQueries({ queryKey: ['tax-codes'] }); if (value.isNew) onClose(); else viewAgain[1](); },
  });
  return (
    <Modal viewAgain={viewAgain} viewFirst={!value.isNew} title="Loại thuế" onClose={onClose}
      footer={<><button className="btn btn-primary" disabled={save.isPending || !v.code || !v.name} onClick={() => save.mutate()}>Ghi</button><button className="btn" onClick={onClose}>Đóng</button></>}>
      <Field label="Mã thuế (*)"><input className="input mono" value={v.code ?? ''} disabled={!value.isNew} onChange={(e) => set({ code: e.target.value.trim() })} /></Field>
      <Field label="Tên thuế (*)" full><input className="input" value={v.name ?? ''} onChange={(e) => set({ name: e.target.value })} /></Field>
      <Field label="Chiều"><select className="select input" value={v.direction} onChange={(e) => set({ direction: e.target.value })}><option value="output">Đầu ra (bán)</option><option value="input">Đầu vào (mua)</option></select></Field>
      <Field label="Thuế (%)"><input className="input" type="number" value={v.rate ?? 0} onChange={(e) => set({ rate: Number(e.target.value) })} /></Field>
      <Field label="Tài khoản"><AccountPicker postingOnly value={v.accountCode ?? ''} onChange={(accountCode) => set({ accountCode })} /></Field>
      <Field label="Nhóm trên bảng kê"><select className="select input" value={v.reportGroup} onChange={(e) => set({ reportGroup: e.target.value })}>{GROUPS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></Field>
      {!value.isNew && <Field label="Trạng thái"><label className="checkbox"><input type="checkbox" checked={v.isActive !== false} onChange={(e) => set({ isActive: e.target.checked })} /> Đang sử dụng</label></Field>}
      {save.error && <div className="alert alert-bad full">{errorText(save.error)}</div>}
    </Modal>
  );
}
