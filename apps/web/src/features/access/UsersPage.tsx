/**
 * Người dùng của đơn vị: thêm, đổi vai trò, khoá, đặt lại mật khẩu.
 */
import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus } from 'lucide-react';
import { ROLE_LABELS, type Role } from '@ketoan/contracts';
import { api, errorText } from '@/lib/api';
import { dateTime } from '@/lib/format';
import { PageHeader } from '@/components/PageHeader';
import { Empty, ErrorBox, Field, Loading, Modal, useViewAgain } from '@/components/ui';
import { DataGrid, type Column } from '@/components/DataGrid';

interface User { id: string; email: string; fullName: string; role: Role; isActive: boolean; lastLoginAt: string | null }
type Draft = Partial<User> & { isNew?: boolean; password?: string };

export function UsersPage() {
  const [editing, setEditing] = useState<Draft | null>(null);
  const q = useQuery({ queryKey: ['users'], queryFn: () => api.get<User[]>('/api/v1/users') });
  return (
    <>
      <PageHeader title="Người dùng" code="HT01" subtitle="Tài khoản đăng nhập và vai trò của từng người" helpKey="nguoi-dung"
        actions={<button className="btn btn-primary" onClick={() => setEditing({ isNew: true, role: 'accountant' })}><Plus size={16} /> Thêm người dùng</button>} />
      <div className="card">
        <ErrorBox error={q.error ? errorText(q.error) : null} />
        {q.isLoading ? <Loading /> : !q.data?.length ? <Empty /> : (
          <DataGrid
            storageKey="ht01"
            rows={q.data}
            rowKey={(u) => u.id}
            onRowClick={(u) => setEditing(u)}
            footerLabel={false}
            columns={[
              { key: 'fullName', header: 'Họ tên' },
              { key: 'email', header: 'Email' },
              { key: 'role', header: 'Vai trò', value: (u) => ROLE_LABELS[u.role] ?? u.role },
              { key: 'lastLoginAt', header: 'Đăng nhập gần nhất', value: (u) => dateTime(u.lastLoginAt), className: 'muted' },
              { key: 'isActive', header: 'Trạng thái', value: (u) => (u.isActive ? 'Hoạt động' : 'Đã khoá'), render: (u) => (u.isActive ? <span className="badge badge-ok">Hoạt động</span> : <span className="badge badge-gray">Đã khoá</span>) },
            ] satisfies Column<User>[]}
          />
        )}
      </div>
      {editing && <UserForm value={editing} onClose={() => setEditing(null)} />}
    </>
  );
}

function UserForm({ value, onClose }: { value: Draft; onClose: () => void }) {
  const qc = useQueryClient();
  const [v, setV] = useState<Draft>(value);
  const set = (p: Draft) => setV((x) => ({ ...x, ...p }));
  const viewAgain = useViewAgain();
  const save = useMutation({
    mutationFn: () =>
      value.isNew
        ? api.post('/api/v1/users', { email: v.email, fullName: v.fullName, role: v.role, password: v.password })
        : api.patch(`/api/v1/users/${value.id}`, { fullName: v.fullName, role: v.role, isActive: v.isActive, password: v.password || undefined }),
    onSuccess: () => { void qc.invalidateQueries({ queryKey: ['users'] }); if (value.isNew) onClose(); else viewAgain[1](); },
  });
  return (
    <Modal viewAgain={viewAgain} viewFirst={!value.isNew} title={value.isNew ? 'Thêm người dùng' : `Sửa ${value.email}`} onClose={onClose}
      footer={<><button className="btn" onClick={onClose}>Đóng</button><button className="btn btn-primary" disabled={save.isPending} onClick={() => save.mutate()}>Ghi</button></>}>
      <Field label="Email"><input className="input" type="email" value={v.email ?? ''} disabled={!value.isNew} onChange={(e) => set({ email: e.target.value.trim() })} /></Field>
      <Field label="Họ tên"><input className="input" value={v.fullName ?? ''} onChange={(e) => set({ fullName: e.target.value })} /></Field>
      <Field label="Vai trò">
        <select className="select input" value={v.role} onChange={(e) => set({ role: e.target.value as Role })}>
          {Object.entries(ROLE_LABELS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
        </select>
      </Field>
      <Field label={value.isNew ? 'Mật khẩu' : 'Đặt lại mật khẩu'} hint={value.isNew ? 'Tối thiểu 8 ký tự' : 'Tối thiểu 8 ký tự. Để trống nếu không đổi.'}>
        {/* Mật khẩu của NGƯỜI KHÁC: type="text" + che ký tự bằng CSS để Chrome không hỏi lưu vào tài khoản của quản trị viên */}
        <input className="input" type="text" name="user-pass" autoComplete="off" spellCheck={false} data-lpignore="true" data-1p-ignore value={v.password ?? ''} onChange={(e) => set({ password: e.target.value })} style={{ WebkitTextSecurity: 'disc' } as React.CSSProperties} />
      </Field>
      {!value.isNew && <Field label="Trạng thái"><label className="checkbox"><input type="checkbox" checked={v.isActive !== false} onChange={(e) => set({ isActive: e.target.checked })} /> Được đăng nhập</label></Field>}
      {save.error && <div className="alert alert-bad full">{errorText(save.error)}</div>}
    </Modal>
  );
}
