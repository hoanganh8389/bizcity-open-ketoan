/**
 * Nhóm hạch toán mặt hàng (thẻ "Nhóm hạch toán" của màn ACC17): bộ tài khoản kho, giá vốn, doanh thu,
 * chiết khấu, hàng bán trả lại. Mặt hàng không gán nhóm dùng nhóm mặc định.
 */
import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus } from 'lucide-react';
import { api, errorText } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { Empty, ErrorBox, Field, Loading, Modal, useViewAgain } from '@/components/ui';
import { DataGrid, type Column } from '@/components/DataGrid';
import { AccountPicker } from '@/components/pickers';

interface Group { code: string; name: string; inventoryAccount: string; cogsAccount: string; revenueAccount: string; discountAccount: string | null; salesReturnAccount: string; isDefault: boolean }
const COLS: [keyof Group, string][] = [['inventoryAccount', 'TK kho'], ['cogsAccount', 'TK giá vốn'], ['revenueAccount', 'TK doanh thu'], ['discountAccount', 'TK chiết khấu'], ['salesReturnAccount', 'TK hàng bán trả lại']];

export function GroupsPanel() {
  const { can } = useAuth();
  const [editing, setEditing] = useState<(Partial<Group> & { isNew?: boolean }) | null>(null);
  const q = useQuery({ queryKey: ['groups'], queryFn: () => api.get<Group[]>('/api/v1/posting/groups') });
  return (
    <>
      <div className="card">
        {can('settings:write') && <div className="catalog-toolbar"><button className="btn btn-sm" onClick={() => setEditing({ isNew: true })}><Plus size={14} /> Thêm nhóm</button></div>}
        <ErrorBox error={q.error ? errorText(q.error) : null} />
        {q.isLoading ? <Loading /> : !q.data?.length ? <Empty /> : (
          <DataGrid
            storageKey="acc17"
            rows={q.data}
            rowKey={(g) => g.code}
            onRowDoubleClick={(g) => can('settings:write') && setEditing(g)}
            footerLabel={false}
            columns={[
              { key: 'code', header: 'Mã', type: 'code' },
              { key: 'name', header: 'Tên' },
              ...COLS.map(([k, l]): Column<Group> => ({ key: String(k), header: l, type: 'code', value: (g) => String(g[k] ?? '') })),
              { key: 'isDefault', header: '', value: (g) => (g.isDefault ? 'Mặc định' : ''), render: (g) => g.isDefault && <span className="badge badge-ok">Mặc định</span> },
            ]}
          />
        )}
      </div>
      {editing && <GroupForm value={editing} onClose={() => setEditing(null)} />}
    </>
  );
}

function GroupForm({ value, onClose }: { value: Partial<Group> & { isNew?: boolean }; onClose: () => void }) {
  const qc = useQueryClient();
  const [v, setV] = useState(value);
  const set = (p: Partial<Group>) => setV((x) => ({ ...x, ...p }));
  const viewAgain = useViewAgain();
  const save = useMutation({
    mutationFn: () => api.put(`/api/v1/posting/groups/${encodeURIComponent(v.code ?? '')}`, {
      name: v.name, inventoryAccount: v.inventoryAccount, cogsAccount: v.cogsAccount, revenueAccount: v.revenueAccount,
      discountAccount: v.discountAccount || undefined, salesReturnAccount: v.salesReturnAccount, isDefault: Boolean(v.isDefault),
    }),
    onSuccess: () => { void qc.invalidateQueries({ queryKey: ['groups'] }); if (value.isNew) onClose(); else viewAgain[1](); },
  });
  return (
    <Modal viewAgain={viewAgain} viewFirst={!value.isNew} title={value.isNew ? 'Thêm nhóm hạch toán' : `Sửa nhóm ${value.code}`} onClose={onClose}
      footer={<><button className="btn" onClick={onClose}>Đóng</button><button className="btn btn-primary" disabled={save.isPending || !v.code} onClick={() => save.mutate()}>Ghi</button></>}>
      <Field label="Mã nhóm"><input className="input" value={v.code ?? ''} disabled={!value.isNew} onChange={(e) => set({ code: e.target.value.trim() })} /></Field>
      <Field label="Tên nhóm"><input className="input" value={v.name ?? ''} onChange={(e) => set({ name: e.target.value })} /></Field>
      {COLS.map(([k, l]) => (
        <Field key={k} label={l}><AccountPicker postingOnly value={String(v[k] ?? '')} onChange={(x) => set({ [k]: x } as Partial<Group>)} /></Field>
      ))}
      <Field label="Mặc định"><label className="checkbox"><input type="checkbox" checked={Boolean(v.isDefault)} onChange={(e) => set({ isDefault: e.target.checked })} /> Nhóm mặc định</label></Field>
      {save.error && <div className="alert alert-bad full">{errorText(save.error)}</div>}
    </Modal>
  );
}
