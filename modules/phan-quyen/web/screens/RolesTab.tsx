/**
 * Thẻ VAI TRÒ: danh sách vai trò của đơn vị (số luật, số người giữ), tạo mới, đổi tên, vô hiệu / bật lại.
 * Mã, loại, vai trò nền không đổi được sau khi tạo (đổi nền = tạo vai trò mới) — lần gán cũ vẫn trỏ đúng nghĩa cũ.
 */
import { useState } from 'react';
import { Empty, ErrorBox, Field, Loading, errorText, useApi, useQuery, useQueryClient } from '@bizcity/ui-kit';
import { WriteDialog } from './WriteDialog';
import type { MatrixData, RoleDetail } from '../lib/matrix';
import { planTemplate, templateOf, type TemplateItem } from '../lib/template';

/** Thư viện vai trò mẫu (Kho thư viện, `kind: permission-template`). */
const TEMPLATE_LIBRARY = 'authz.tgs-nhom';

interface RoleRow { id: string; code: string; label: string; kind: 'job' | 'privilege' | 'restriction'; baseRole: string | null; isActive: boolean; version: number; rules: number; holders: number }

const KIND_TEXT: Record<RoleRow['kind'], string> = { job: 'Công việc', privilege: 'Đặc quyền', restriction: 'Hạn chế (chỉ Cấm)' };
const BASE_ROLES: { value: string; label: string }[] = [
  { value: 'chief_accountant', label: 'Kế toán trưởng' }, { value: 'accountant', label: 'Kế toán' }, { value: 'viewer', label: 'Người xem' },
  { value: 'developer', label: 'Nhà phát triển' }, { value: 'auditor', label: 'Kiểm soát' },
];
const CODE_RE = /^[a-z][a-z0-9_-]{1,39}$/;

type Dialog = { kind: 'create' } | { kind: 'rename'; role: RoleRow } | { kind: 'toggle'; role: RoleRow } | { kind: 'template' };

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
        <button type="button" className="btn" onClick={() => setDialog({ kind: 'template' })} title="Dựng vai trò từ thư viện vai trò mẫu (28 nhóm TGS): xem trước quyền rồi mới tạo">Dùng mẫu</button>
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

      {dialog?.kind === 'template' ? <TemplateDialog roles={roles.data ?? []} onClose={close} onDone={refresh} /> : null}

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

/**
 * Dùng mẫu: chọn một nhóm của thư viện → xem trước quyền sẽ Cho (và quyền mẫu nêu mà sổ quyền chưa có, bất thường của bảng gốc) →
 * tạo vai trò Công việc trên nền của mẫu rồi thêm từng luật Cho qua API sẵn có (chống leo thang, nhập lại mật khẩu do máy chủ kiểm).
 * Chạy lại sau lần dở dang: vai trò cùng mã đã có thì dùng lại, chỉ thêm luật còn thiếu.
 */
function TemplateDialog({ roles, onClose, onDone }: { roles: RoleRow[]; onClose: () => void; onDone: () => Promise<unknown> }) {
  const api = useApi();
  const items = useQuery({
    queryKey: ['phan-quyen', 'templates', TEMPLATE_LIBRARY],
    queryFn: () => api.get<{ rows: { item: Record<string, unknown> }[] }>(`/api/v1/libraries/${TEMPLATE_LIBRARY}/items?limit=200`),
  });
  const matrix = useQuery({ queryKey: ['phan-quyen', 'matrix'], queryFn: () => api.get<MatrixData>('/api/v1/roles/matrix') });
  const [code, setCode] = useState('');
  const templates = (items.data?.rows ?? []).map(templateOf).filter((t): t is TemplateItem => !!t);
  const picked = templates.find((t) => t.code === code);
  const known = new Map((matrix.data?.permissions ?? []).map((p) => [p.key, p.risk] as const));
  const label = (k: string) => matrix.data?.permissions.find((p) => p.key === k)?.label ?? k;
  const existing = picked ? roles.find((r) => r.code === picked.code) : undefined;
  const plan = picked ? planTemplate(picked, known) : null;

  if (items.isLoading || matrix.isLoading) return <WriteDialog title="Dùng mẫu" confirmLabel="Tạo vai trò" valid={false} onClose={onClose} onSubmit={async () => undefined}><Loading /></WriteDialog>;
  return (
    <WriteDialog title="Dùng mẫu vai trò" confirmLabel={existing ? 'Thêm luật còn thiếu' : 'Tạo vai trò từ mẫu'} valid={!!picked} needPassword={!!plan?.high} onClose={onClose}
      onSubmit={async (v) => {
        if (!picked) return;
        let id = existing?.id;
        if (!id) {
          const created = await api.post<{ id: string }>('/api/v1/roles', { code: picked.code, label: picked.name, kind: 'job', baseRole: picked.baseRole, reason: v.reason });
          id = String(created.id);
        }
        const detail = await api.get<RoleDetail>(`/api/v1/roles/${id}`);
        const todo = planTemplate(picked, known, detail.rules.filter((r) => r.active && r.effect === 'allow').map((r) => r.permission)).add;
        for (const permission of todo) {
          await api.post(`/api/v1/roles/${id}/rules`, { permission, effect: 'allow', reason: v.reason, note: `Từ mẫu ${TEMPLATE_LIBRARY}/${picked.code}`, ...(v.confirmPassword ? { confirmPassword: v.confirmPassword } : {}) });
        }
        await onDone();
      }}>
      {items.error ? <ErrorBox error={errorText(items.error)} /> : null}
      <Field label="Mẫu" full hint="Thư viện vai trò mẫu (Kho thư viện HT14). Vai trò tạo ra là vai trò Công việc của đơn vị — sửa luật tiếp ở thẻ Ma trận quyền">
        <select className="select" value={code} onChange={(e) => setCode(e.target.value)}>
          <option value="">— chọn —</option>
          {templates.map((t) => <option key={t.code} value={t.code}>{t.name} ({t.code})</option>)}
        </select>
      </Field>
      {picked && plan ? (
        <div>
          <p>Vai trò <code>{picked.code}</code>, nền <strong>{picked.baseRole}</strong>{existing ? ' — đã có, chỉ thêm luật còn thiếu' : ''}.</p>
          <p>Sẽ Cho {plan.add.length} quyền{plan.high ? ' (có quyền rủi ro cao — cần nhập lại mật khẩu)' : ''}:</p>
          {plan.add.length ? <ul>{plan.add.map((k) => <li key={k}>{label(k)} <code>{k}</code>{known.get(k) === 'high' ? <> <span className="badge badge-warn">Cao</span></> : null}</li>)}</ul> : <p className="muted">Không thêm quyền nào ngoài vai trò nền.</p>}
          {plan.unknown.length ? <p className="muted">Mẫu nêu nhưng sổ quyền chưa có (bỏ qua): {plan.unknown.join(', ')}</p> : null}
          {picked.anomalies.length ? (
            <details><summary>{picked.anomalies.length} bất thường của bảng gốc — xem trước khi dùng</summary><ul>{picked.anomalies.slice(0, 30).map((a) => <li key={a}>{a}</li>)}</ul></details>
          ) : null}
        </div>
      ) : null}
    </WriteDialog>
  );
}
