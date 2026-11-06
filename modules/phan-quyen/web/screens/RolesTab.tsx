/**
 * Thẻ VAI TRÒ: danh sách vai trò của đơn vị (số luật, số người giữ), tạo mới, đổi tên, vô hiệu / bật lại.
 * Mã, loại, vai trò nền không đổi được sau khi tạo (đổi nền = tạo vai trò mới) — lần gán cũ vẫn trỏ đúng nghĩa cũ.
 */
import { useState } from 'react';
import { Empty, ErrorBox, Field, Loading, errorText, useApi, useQuery, useQueryClient } from '@bizcity/ui-kit';
import { WriteDialog } from './WriteDialog';

interface RoleRow { id: string; code: string; label: string; kind: 'job' | 'privilege' | 'restriction'; baseRole: string | null; isActive: boolean; version: number; rules: number; holders: number }

const KIND_TEXT: Record<RoleRow['kind'], string> = { job: 'Công việc', privilege: 'Đặc quyền', restriction: 'Hạn chế (chỉ Cấm)' };
const BASE_ROLES: { value: string; label: string }[] = [
  { value: 'chief_accountant', label: 'Kế toán trưởng' }, { value: 'accountant', label: 'Kế toán' }, { value: 'viewer', label: 'Người xem' },
  { value: 'developer', label: 'Nhà phát triển' }, { value: 'auditor', label: 'Kiểm soát' },
];
const CODE_RE = /^[a-z][a-z0-9_-]{1,39}$/;

type Dialog = { kind: 'create' } | { kind: 'rename'; role: RoleRow } | { kind: 'toggle'; role: RoleRow };

export function RolesTab() {
  const api = useApi();
  const qc = useQueryClient();
  const roles = useQuery({ queryKey: ['phan-quyen', 'roles'], queryFn: () => api.get<RoleRow[]>('/api/v1/roles') });
  const [dialog, setDialog] = useState<Dialog | null>(null);
  const refresh = () => qc.invalidateQueries({ queryKey: ['phan-quyen'] });

  const [code, setCode] = useState('');
  const [label, setLabel] = useState('');
  const [kind, setKind] = useState<RoleRow['kind']>('job');
  const [baseRole, setBaseRole] = useState('viewer');
  const [newLabel, setNewLabel] = useState('');

  const close = () => { setDialog(null); setCode(''); setLabel(''); setKind('job'); setBaseRole('viewer'); setNewLabel(''); };

  return (
    <div>
      <div className="card card-body row" style={{ gap: 12, alignItems: 'center' }}>
        <button type="button" className="btn btn-primary" onClick={() => setDialog({ kind: 'create' })}>Tạo vai trò</button>
        <span className="muted">Vai trò của đơn vị = vai trò nền + luật Cho / Cấm riêng. Cấp quyền của module cho một nhóm người: Cho quyền đó ở đây rồi gán vai trò.</span>
      </div>
      {roles.isLoading ? <Loading /> : roles.error ? <ErrorBox error={errorText(roles.error)} /> : !roles.data?.length ? <Empty text="Chưa có vai trò của đơn vị." /> : (
        <div className="table-wrap">
          <table className="grid">
            <thead><tr><th>Mã</th><th>Tên</th><th>Loại</th><th>Vai trò nền</th><th>Luật</th><th>Người giữ</th><th>Trạng thái</th><th /></tr></thead>
            <tbody>
              {roles.data.map((r) => (
                <tr key={r.id} style={{ opacity: r.isActive ? 1 : 0.6 }}>
                  <td><code>{r.code}</code></td>
                  <td>{r.label}</td>
                  <td>{KIND_TEXT[r.kind]}</td>
                  <td>{r.baseRole ?? '—'}</td>
                  <td>{r.rules}</td>
                  <td>{r.holders}</td>
                  <td>{r.isActive ? <span className="badge badge-ok">Đang dùng</span> : <span className="badge">Vô hiệu</span>}</td>
                  <td>
                    <button type="button" className="btn btn-xs" onClick={() => { setNewLabel(r.label); setDialog({ kind: 'rename', role: r }); }}>Đổi tên</button>{' '}
                    <button type="button" className="btn btn-xs" onClick={() => setDialog({ kind: 'toggle', role: r })}>{r.isActive ? 'Vô hiệu' : 'Bật lại'}</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {dialog?.kind === 'create' ? (
        <WriteDialog title="Tạo vai trò của đơn vị" confirmLabel="Tạo vai trò" valid={CODE_RE.test(code) && label.trim().length > 0} onClose={close}
          onSubmit={async (v) => {
            await api.post('/api/v1/roles', { code, label: label.trim(), kind, ...(kind === 'restriction' ? {} : { baseRole }), reason: v.reason });
            await refresh();
          }}>
          <Field label="Mã" hint="Chữ thường, số, _ hoặc -; 2–40 ký tự; không đổi được sau khi tạo">
            <input className="input" value={code} onChange={(e) => setCode(e.target.value)} />
          </Field>
          <Field label="Tên hiển thị"><input className="input" value={label} onChange={(e) => setLabel(e.target.value)} /></Field>
          <Field label="Loại">
            <select className="select" value={kind} onChange={(e) => setKind(e.target.value as RoleRow['kind'])}>
              {(Object.keys(KIND_TEXT) as RoleRow['kind'][]).map((k) => <option key={k} value={k}>{KIND_TEXT[k]}</option>)}
            </select>
          </Field>
          {kind !== 'restriction' ? (
            <Field label="Vai trò nền" hint="Quyền của vai trò nền được kế thừa một cấp; không đổi được sau khi tạo">
              <select className="select" value={baseRole} onChange={(e) => setBaseRole(e.target.value)}>
                {BASE_ROLES.map((b) => <option key={b.value} value={b.value}>{b.label}</option>)}
              </select>
            </Field>
          ) : null}
        </WriteDialog>
      ) : null}

      {dialog?.kind === 'rename' ? (
        <WriteDialog title={`Đổi tên vai trò ${dialog.role.code}`} confirmLabel="Lưu" valid={newLabel.trim().length > 0 && newLabel.trim() !== dialog.role.label} onClose={close}
          onSubmit={async (v) => {
            await api.patch(`/api/v1/roles/${dialog.role.id}`, { label: newLabel.trim(), version: dialog.role.version, reason: v.reason });
            await refresh();
          }}>
          <Field label="Tên hiển thị"><input className="input" value={newLabel} onChange={(e) => setNewLabel(e.target.value)} /></Field>
        </WriteDialog>
      ) : null}

      {dialog?.kind === 'toggle' ? (
        <WriteDialog title={`${dialog.role.isActive ? 'Vô hiệu' : 'Bật lại'} vai trò ${dialog.role.code}`} confirmLabel={dialog.role.isActive ? 'Vô hiệu' : 'Bật lại'} onClose={close}
          onSubmit={async (v) => {
            await api.patch(`/api/v1/roles/${dialog.role.id}`, { isActive: !dialog.role.isActive, version: dialog.role.version, reason: v.reason });
            await refresh();
          }}>
          <p>{dialog.role.isActive
            ? `Vô hiệu: ${dialog.role.holders} người đang giữ vai trò sẽ mất quyền của vai trò này ngay; lần gán vẫn còn trong lịch sử.`
            : 'Bật lại: người đang giữ vai trò nhận lại quyền của vai trò này.'}</p>
        </WriteDialog>
      ) : null}
    </div>
  );
}
