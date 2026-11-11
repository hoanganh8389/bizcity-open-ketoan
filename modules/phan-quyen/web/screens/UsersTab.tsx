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
interface Assignment { id: string; role: string | null; tenantRoleId: string | null; scopeType: string; scopeId: string | null; validFrom: string; validTo: string | null; reason: string; grantedBy: string; revokedAt: string | null; revokeReason: string | null; active: boolean }
interface History { primaryRole: string; assignments: Assignment[] }
interface TenantRole { id: string; code: string; label: string; isActive: boolean }
// PHASE-028 W5 đợt 1: gán có phạm vi chi nhánh — chỉ có tác dụng ở cửa nạp chứng từ (route kiểm theo chi nhánh)
interface Branch { id: string; code: string; name: string; isActive: boolean }
// [2026-11-09 03:20 PM kiennt] PHASE-028 — S028-19: gán vai trò theo một kho (cửa nạp chứng từ có dòng hàng kiểm theo kho)
interface Warehouse { id: string; code: string; name: string; branchCode: string; isActive: boolean }

const SYSTEM_ROLES: { value: string; label: string }[] = [
  { value: 'owner', label: 'Chủ đơn vị' }, { value: 'chief_accountant', label: 'Kế toán trưởng' }, { value: 'accountant', label: 'Kế toán' },
  { value: 'viewer', label: 'Người xem' }, { value: 'developer', label: 'Nhà phát triển' }, { value: 'auditor', label: 'Kiểm soát' },
];
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export function UsersTab({ initialUserId = null }: { initialUserId?: string | null } = {}) {
  const api = useApi();
  const qc = useQueryClient();
  const [q, setQ] = useState('');
  const [userId, setUserId] = useState<string | null>(initialUserId && /^\d+$/.test(initialUserId) ? initialUserId : null);
  const [assigning, setAssigning] = useState(false);
  const [revoking, setRevoking] = useState<Assignment | null>(null);
  const [mode, setMode] = useState<'system' | 'tenant'>('tenant');
  const [role, setRole] = useState('viewer');
  const [tenantRoleId, setTenantRoleId] = useState('');
  const [validTo, setValidTo] = useState('');
  const [scopeType, setScopeType] = useState<'tenant' | 'branch' | 'warehouse'>('tenant');
  const [branchId, setBranchId] = useState('');
  const [warehouseId, setWarehouseId] = useState('');

  const users = useQuery({ queryKey: ['phan-quyen', 'users'], queryFn: () => api.get<UserRow[]>('/api/v1/users') });
  const roles = useQuery({ queryKey: ['phan-quyen', 'roles'], queryFn: () => api.get<TenantRole[]>('/api/v1/roles') });
  const branches = useQuery({ queryKey: ['phan-quyen', 'branches'], queryFn: () => api.get<Branch[]>('/api/v1/branches') });
  const warehouses = useQuery({ queryKey: ['phan-quyen', 'warehouses'], queryFn: () => api.get<Warehouse[]>('/api/v1/warehouses') });
  const warehouseName = (id: string | null): string => { const w = warehouses.data?.find((x) => String(x.id) === String(id)); return w ? `kho ${w.code} · ${w.name}` : `kho ${id}`; };
  const branchName = (id: string | null): string => { const b = branches.data?.find((x) => String(x.id) === String(id)); return b ? `${b.code} · ${b.name}` : `chi nhánh ${id}`; };
  const effective = useQuery({ queryKey: ['phan-quyen', 'effective', userId], queryFn: () => api.get<Effective>(`/api/v1/users/${userId}/effective-permissions`), enabled: !!userId });
  const history = useQuery({ queryKey: ['phan-quyen', 'history', userId], queryFn: () => api.get<History>(`/api/v1/users/${userId}/roles`), enabled: !!userId });
  const refresh = () => qc.invalidateQueries({ queryKey: ['phan-quyen'] });

  const list = (users.data ?? []).filter((u) => !q.trim() || `${u.fullName} ${u.email}`.toLowerCase().includes(q.trim().toLowerCase()));
  const picked = users.data?.find((u) => u.id === userId);
  const activeTenantRoles = (roles.data ?? []).filter((r) => r.isActive);
  const roleName = (a: Assignment): string => a.role ?? roles.data?.find((r) => r.id === a.tenantRoleId)?.label ?? `vai trò đơn vị ${a.tenantRoleId}`;

  const closeAssign = () => { setAssigning(false); setValidTo(''); setScopeType('tenant'); setBranchId(''); setWarehouseId(''); };
  const assignValid = (mode === 'system' ? !!role : !!tenantRoleId) && (!validTo || DATE_RE.test(validTo)) && (scopeType === 'tenant' || (scopeType === 'branch' ? !!branchId : !!warehouseId));

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
                    <thead><tr><th>Vai trò</th><th>Phạm vi</th><th>Từ</th><th>Đến</th><th>Lý do</th><th>Trạng thái</th><th /></tr></thead>
                    <tbody>
                      {history.data.assignments.map((a) => (
                        <tr key={a.id} style={{ opacity: a.active ? 1 : 0.6 }}>
                          <td>{roleName(a)}{a.tenantRoleId ? <> <span className="badge badge-info">đơn vị</span></> : null}</td>
                          <td>{a.scopeType === 'branch' ? branchName(a.scopeId) : a.scopeType === 'warehouse' ? warehouseName(a.scopeId) : a.scopeType === 'tenant' ? 'Cả đơn vị' : a.scopeType}</td>
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
              ...(scopeType === 'branch' ? { scopeType, scopeId: branchId } : scopeType === 'warehouse' ? { scopeType, scopeId: warehouseId } : {}),
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
          <Field label="Phạm vi" hint={scopeType === 'branch' ? 'Chỉ có tác dụng khi nộp chứng từ của chi nhánh này (cửa nạp); không thành quyền ở chỗ khác' : scopeType === 'warehouse' ? 'Chỉ có tác dụng khi nộp chứng từ có dòng hàng của kho này (bán, mua, trả, chuyển kho — kho xuất, điều chỉnh); phiếu không có hàng không được' : undefined}>
            <select className="select" value={scopeType} onChange={(e) => setScopeType(e.target.value as 'tenant' | 'branch' | 'warehouse')}>
              <option value="tenant">Cả đơn vị</option>
              <option value="branch">Một chi nhánh</option>
              <option value="warehouse">Một kho</option>
            </select>
          </Field>
          {scopeType === 'warehouse' ? (
            <Field label="Kho">
              <select className="select" value={warehouseId} onChange={(e) => setWarehouseId(e.target.value)}>
                <option value="">— chọn —</option>
                {(warehouses.data ?? []).filter((w) => w.isActive).map((w) => <option key={w.id} value={String(w.id)}>{w.code} · {w.name} ({w.branchCode})</option>)}
              </select>
            </Field>
          ) : null}
          {scopeType === 'branch' ? (
            <Field label="Chi nhánh">
              <select className="select" value={branchId} onChange={(e) => setBranchId(e.target.value)}>
                <option value="">— chọn —</option>
                {(branches.data ?? []).filter((b) => b.isActive).map((b) => <option key={b.id} value={String(b.id)}>{b.code} · {b.name}</option>)}
              </select>
            </Field>
          ) : null}
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
