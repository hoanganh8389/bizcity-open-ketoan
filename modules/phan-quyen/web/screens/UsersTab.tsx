/**
 * Thẻ NGƯỜI DÙNG: chọn một người → "Xem như" (quyền hiệu lực và nguồn của nó), lịch sử gán vai trò, gán / thu hồi vai trò
 * hệ thống bổ sung hoặc vai trò của đơn vị. Quyền hiệu lực do máy chủ tính cùng công thức với đường yêu cầu.
 */
import { useState } from 'react';
import { Empty, ErrorBox, Field, Loading, errorText, useApi, useQuery, useQueryClient } from '@bizcity/ui-kit';
import { groupPermissions } from '../lib/matrix';
import { WriteDialog } from './WriteDialog';

interface UserRow { id: string; email: string; fullName: string; role: string; isActive: boolean }
interface Effective { userId: string; isActive: boolean; primaryRole: string; roles: string[]; baseRoles: string[]; allow: string[]; deny: string[]; permissions: string[] }
interface Assignment { id: string; role: string | null; tenantRoleId: string | null; validFrom: string; validTo: string | null; reason: string; grantedBy: string; revokedAt: string | null; revokeReason: string | null; active: boolean }
interface History { primaryRole: string; assignments: Assignment[] }
interface TenantRole { id: string; code: string; label: string; isActive: boolean }

const SYSTEM_ROLES: { value: string; label: string }[] = [
  { value: 'owner', label: 'Chủ đơn vị' }, { value: 'chief_accountant', label: 'Kế toán trưởng' }, { value: 'accountant', label: 'Kế toán' },
  { value: 'viewer', label: 'Người xem' }, { value: 'developer', label: 'Nhà phát triển' }, { value: 'auditor', label: 'Kiểm soát' },
];
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export function UsersTab() {
  const api = useApi();
  const qc = useQueryClient();
  const [q, setQ] = useState('');
  const [userId, setUserId] = useState<string | null>(null);
  const [assigning, setAssigning] = useState(false);
  const [revoking, setRevoking] = useState<Assignment | null>(null);
  const [mode, setMode] = useState<'system' | 'tenant'>('tenant');
  const [role, setRole] = useState('viewer');
  const [tenantRoleId, setTenantRoleId] = useState('');
  const [validTo, setValidTo] = useState('');

  const users = useQuery({ queryKey: ['phan-quyen', 'users'], queryFn: () => api.get<UserRow[]>('/api/v1/users') });
  const roles = useQuery({ queryKey: ['phan-quyen', 'roles'], queryFn: () => api.get<TenantRole[]>('/api/v1/roles') });
  const effective = useQuery({ queryKey: ['phan-quyen', 'effective', userId], queryFn: () => api.get<Effective>(`/api/v1/users/${userId}/effective-permissions`), enabled: !!userId });
  const history = useQuery({ queryKey: ['phan-quyen', 'history', userId], queryFn: () => api.get<History>(`/api/v1/users/${userId}/roles`), enabled: !!userId });
  const refresh = () => qc.invalidateQueries({ queryKey: ['phan-quyen'] });

  const list = (users.data ?? []).filter((u) => !q.trim() || `${u.fullName} ${u.email}`.toLowerCase().includes(q.trim().toLowerCase()));
  const picked = users.data?.find((u) => u.id === userId);
  const activeTenantRoles = (roles.data ?? []).filter((r) => r.isActive);
  const roleName = (a: Assignment): string => a.role ?? roles.data?.find((r) => r.id === a.tenantRoleId)?.label ?? `vai trò đơn vị ${a.tenantRoleId}`;

  const closeAssign = () => { setAssigning(false); setValidTo(''); };
  const assignValid = (mode === 'system' ? !!role : !!tenantRoleId) && (!validTo || DATE_RE.test(validTo));

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'minmax(260px, 340px) 1fr', gap: 16, alignItems: 'start' }}>
      <div className="card card-body">
        <input className="input" placeholder="Tìm người dùng" value={q} onChange={(e) => setQ(e.target.value)} />
        {users.isLoading ? <Loading /> : users.error ? <ErrorBox error={errorText(users.error)} /> : !list.length ? <Empty /> : (
          <ul style={{ listStyle: 'none', padding: 0, margin: '8px 0 0' }}>
            {list.map((u) => (
              <li key={u.id}>
                <button type="button" className={`btn btn-sm ${u.id === userId ? 'btn-primary' : 'btn-ghost'}`} style={{ width: '100%', textAlign: 'left', opacity: u.isActive ? 1 : 0.6 }} onClick={() => setUserId(u.id)}>
                  {u.fullName}<br /><small>{u.email} · {u.role}{u.isActive ? '' : ' · đã khoá'}</small>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div>
        {!userId ? <div className="card card-body"><Empty text="Chọn một người dùng để xem quyền hiệu lực và gán vai trò." /></div> : (
          <>
            <div className="card card-body">
              <h3 style={{ marginTop: 0 }}>Xem như: {picked?.fullName ?? userId}</h3>
              {effective.isLoading ? <Loading /> : effective.error ? <ErrorBox error={errorText(effective.error)} /> : effective.data ? <EffectiveView e={effective.data} /> : null}
            </div>
            <div className="card card-body">
              <div className="row" style={{ gap: 12, alignItems: 'center' }}>
                <h3 style={{ margin: 0 }}>Lịch sử gán vai trò</h3>
                <button type="button" className="btn btn-primary btn-sm" onClick={() => setAssigning(true)}>Gán vai trò</button>
              </div>
              {history.isLoading ? <Loading /> : history.error ? <ErrorBox error={errorText(history.error)} /> : !history.data?.assignments.length ? <Empty text="Chưa gán vai trò bổ sung." /> : (
                <div className="table-wrap">
                  <table className="grid">
                    <thead><tr><th>Vai trò</th><th>Từ</th><th>Đến</th><th>Lý do</th><th>Trạng thái</th><th /></tr></thead>
                    <tbody>
                      {history.data.assignments.map((a) => (
                        <tr key={a.id} style={{ opacity: a.active ? 1 : 0.6 }}>
                          <td>{roleName(a)}{a.tenantRoleId ? <> <span className="badge badge-info">đơn vị</span></> : null}</td>
                          <td>{a.validFrom}</td><td>{a.validTo ?? '—'}</td><td>{a.reason}</td>
                          <td>{a.revokedAt ? <span className="badge">Đã thu hồi{a.revokeReason ? `: ${a.revokeReason}` : ''}</span> : a.active ? <span className="badge badge-ok">Đang hiệu lực</span> : <span className="badge badge-warn">Chưa / hết hiệu lực</span>}</td>
                          <td>{!a.revokedAt ? <button type="button" className="btn btn-xs" onClick={() => setRevoking(a)}>Thu hồi</button> : null}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </>
        )}
      </div>

      {assigning && userId ? (
        <WriteDialog title={`Gán vai trò cho ${picked?.fullName ?? userId}`} confirmLabel="Gán vai trò" valid={assignValid} onClose={closeAssign}
          onSubmit={async (v) => {
            await api.post(`/api/v1/users/${userId}/roles`, {
              ...(mode === 'system' ? { role } : { tenantRoleId }),
              ...(validTo ? { validTo } : {}), ...v,
            });
            await refresh();
          }}>
          <Field label="Loại vai trò">
            <select className="select" value={mode} onChange={(e) => setMode(e.target.value as 'system' | 'tenant')}>
              <option value="tenant">Vai trò của đơn vị</option>
              <option value="system">Vai trò hệ thống bổ sung</option>
            </select>
          </Field>
          {mode === 'system' ? (
            <Field label="Vai trò"><select className="select" value={role} onChange={(e) => setRole(e.target.value)}>{SYSTEM_ROLES.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}</select></Field>
          ) : (
            <Field label="Vai trò của đơn vị" hint={activeTenantRoles.length ? undefined : 'Chưa có vai trò đang dùng — tạo ở thẻ Vai trò'}>
              <select className="select" value={tenantRoleId} onChange={(e) => setTenantRoleId(e.target.value)}>
                <option value="">— chọn —</option>
                {activeTenantRoles.map((r) => <option key={r.id} value={r.id}>{r.label} ({r.code})</option>)}
              </select>
            </Field>
          )}
          <Field label="Hết hiệu lực sau ngày" hint="Bỏ trống = không hạn. Dạng YYYY-MM-DD, gồm cả ngày này">
            <input className="input" placeholder="2026-12-31" value={validTo} onChange={(e) => setValidTo(e.target.value)} />
          </Field>
        </WriteDialog>
      ) : null}

      {revoking && userId ? (
        <WriteDialog title={`Thu hồi vai trò ${roleName(revoking)}`} confirmLabel="Thu hồi" onClose={() => setRevoking(null)}
          onSubmit={async (v) => {
            await api.post(`/api/v1/users/${userId}/roles/${revoking.id}/revoke`, { reason: v.reason });
            await refresh();
          }}>
          <p>Người dùng mất quyền của vai trò này ngay, không phải đăng nhập lại. Dòng gán giữ trong lịch sử.</p>
        </WriteDialog>
      ) : null}
    </div>
  );
}

function EffectiveView({ e }: { e: Effective }) {
  const groups = groupPermissions(e.permissions.map((key) => ({ key, label: key, module: key.split(':')[0] === 'core' ? 'core' : key.split(':')[0] ?? 'core', risk: 'low' as const, resource: null, operation: null })));
  return (
    <div>
      <p>Vai trò chính: <strong>{e.primaryRole}</strong>{e.roles.length > 1 ? <> · bổ sung: {e.roles.filter((r) => r !== e.primaryRole).join(', ')}</> : null}{e.baseRoles.length ? <> · nền của vai trò đơn vị: {e.baseRoles.join(', ')}</> : null}</p>
      {e.allow.length ? <p>Luật Cho riêng: {e.allow.map((p) => <code key={p} style={{ marginRight: 6 }}>{p}</code>)}</p> : null}
      {e.deny.length ? <p>Luật Cấm: {e.deny.map((p) => <code key={p} style={{ marginRight: 6, color: '#991b1b' }}>{p}</code>)}{e.roles.includes('owner') ? ' (không áp cho chủ đơn vị)' : ''}</p> : null}
      <p><strong>{e.permissions.length}</strong> quyền hiệu lực{e.isActive ? '' : ' (tài khoản đã khoá)'}:</p>
      <details>
        <summary>Xem danh sách quyền</summary>
        {groups.map((g) => <p key={g.module}><strong>{g.module}</strong>: {g.items.map((p) => p.key).join(', ')}</p>)}
      </details>
    </div>
  );
}
