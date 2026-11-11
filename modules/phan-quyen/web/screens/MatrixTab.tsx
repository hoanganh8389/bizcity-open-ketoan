/**
 * Thẻ MA TRẬN: hàng = quyền (gom theo module), cột = vai trò (hệ thống: chỉ đọc; của đơn vị: bấm ô để thêm / gỡ luật), ô = Có · Cấm · —.
 * Máy chủ tính từng ô (GET /api/v1/roles/matrix bằng bộ tính quyền); màn chỉ vẽ và gửi luật qua API.
 */
import { useState } from 'react';
import { Empty, ErrorBox, Loading, Modal, errorText, useApi, useQuery, useQueryClient } from '@bizcity/ui-kit';
import {
  CELL_TEXT, cellOf, columnSummary, explainCell, groupPermissions, groupRulePlan, KIND_TEXT, roleDbId, roleLabel,
  type Cell, type CellReason, type MatrixData, type MatrixPermission, type MatrixRole, type RoleDetail, type RoleRule,
} from '../lib/matrix';
import { WriteDialog } from './WriteDialog';

const CELL_STYLE: Record<Cell, { background: string; color: string }> = {
  allow: { background: 'transparent', color: '#2e7d32' },
  deny: { background: '#fee2e2', color: '#b91c1c' },
  none: { background: 'transparent', color: '#cbd5e1' },
};
/** Ký hiệu trong ô ma trận (gọn hơn chữ): ✓ có, ✕ Cấm, · chưa có. */
const CELL_MARK: Record<Cell, string> = { allow: '✓', deny: '✕', none: '·' };

function reasonText(r: CellReason): string {
  switch (r.kind) {
    case 'rule-deny': return `Luật Cấm: ${r.rules.map((x) => x.permission).join(', ')} (Cấm thắng mọi luật Cho)`;
    case 'rule-allow': return `Luật Cho riêng của vai trò này${r.rule.note ? ` — ${r.rule.note}` : ''}`;
    case 'base': return `Có sẵn từ vai trò nền ${r.baseRole}`;
    case 'system': return 'Vai trò hệ thống: chỉ đọc, quyền theo mã nguồn';
    case 'none': return 'Chưa có luật nào cho quyền này';
  }
}

type Pending =
  | { kind: 'add'; effect: 'allow' | 'deny' }
  | { kind: 'remove'; rule: RoleRule }
  | { kind: 'group'; effect: 'allow' | 'deny'; keys: string[] };

function CellPanel({ matrix, role, permission, onClose }: { matrix: MatrixData; role: MatrixRole; permission: MatrixPermission; onClose: () => void }) {
  const api = useApi();
  const qc = useQueryClient();
  const detail = useQuery({ queryKey: ['phan-quyen', 'role', role.id], queryFn: () => api.get<RoleDetail>(`/api/v1/roles/${roleDbId(role.id)}`), enabled: !role.system });
  const [pending, setPending] = useState<Pending | null>(null);
  if (!role.system && detail.isLoading) return <Modal title="Đang tải…" onClose={onClose}><Loading /></Modal>;
  if (detail.error) return <Modal title="Lỗi" onClose={onClose}><ErrorBox error={errorText(detail.error)} /></Modal>;
  const ex = explainCell(matrix, role, detail.data, permission.key);
  const refresh = () => qc.invalidateQueries({ queryKey: ['phan-quyen'] });
  const high = permission.risk === 'high';
  const group = groupPermissions(matrix.permissions, '').find((g) => g.module === permission.module);
  const plan = group && !role.system ? groupRulePlan(group.items, detail.data) : null;

  return (
    <Modal title={`${permission.label} × ${roleLabel(role)}`} onClose={onClose}>
      <p><code>{permission.key}</code>{high ? <> · <span className="badge badge-warn">Rủi ro cao</span></> : null}</p>
      <p>Hiện tại: <strong>{CELL_TEXT[ex.cell]}</strong></p>
      <ul>{ex.reasons.map((r, i) => <li key={i}>{reasonText(r)}</li>)}</ul>
      {!role.system ? (
        <div className="row" style={{ gap: 8, flexWrap: 'wrap', marginTop: 12 }}>
          {ex.canAllow ? <button type="button" className="btn btn-primary btn-sm" onClick={() => setPending({ kind: 'add', effect: 'allow' })}>Cho quyền này</button> : null}
          {ex.canDeny ? <button type="button" className="btn btn-danger btn-sm" onClick={() => setPending({ kind: 'add', effect: 'deny' })}>Cấm quyền này</button> : null}
          {plan && plan.allow.length > 1 ? (
            <button type="button" className="btn btn-sm" title={plan.allow.join(', ')} onClick={() => setPending({ kind: 'group', effect: 'allow', keys: plan.allow })}>
              Cho {plan.allow.length} quyền rủi ro thấp của nhóm {group!.label}
            </button>
          ) : null}
          {plan && plan.deny.length ? (
            <button type="button" className="btn btn-danger btn-sm" title={plan.deny.join(', ')} onClick={() => setPending({ kind: 'group', effect: 'deny', keys: plan.deny })}>
              Cấm cả nhóm {group!.label}
            </button>
          ) : null}
          {ex.removable.map((r) => (
            <button key={r.id} type="button" className="btn btn-sm" onClick={() => setPending({ kind: 'remove', rule: r })}>
              Gỡ luật {r.effect === 'deny' ? 'Cấm' : 'Cho'} {r.permission}
            </button>
          ))}
        </div>
      ) : null}
      {!role.isActive && !role.system ? <p className="muted">Vai trò đang vô hiệu: bật lại ở thẻ Vai trò trước khi sửa luật.</p> : null}
      {pending?.kind === 'add' ? (
        <WriteDialog
          title={`${pending.effect === 'allow' ? 'Cho' : 'Cấm'} ${permission.key} cho ${roleLabel(role)}`}
          confirmLabel={pending.effect === 'allow' ? 'Cho quyền' : 'Cấm quyền'}
          needPassword={pending.effect === 'allow' && high}
          onClose={() => setPending(null)}
          onSubmit={async (v) => {
            await api.post(`/api/v1/roles/${roleDbId(role.id)}/rules`, { permission: permission.key, effect: pending.effect, ...v });
            await refresh();
          }}
        >
          {pending.effect === 'allow' && high ? <p>Quyền rủi ro cao: cần nhập lại mật khẩu của bạn.</p> : null}
          {pending.effect === 'deny' ? <p>Cấm thắng mọi luật Cho và cả quyền của vai trò chính của người giữ vai trò này.</p> : null}
        </WriteDialog>
      ) : null}
      {pending?.kind === 'group' ? (
        <WriteDialog
          title={`${pending.effect === 'allow' ? 'Cho' : 'Cấm'} cả nhóm ${group?.label ?? ''} cho ${roleLabel(role)}`}
          confirmLabel={pending.effect === 'allow' ? `Cho ${pending.keys.length} quyền` : `Cấm ${pending.keys.length} mẫu`}
          onClose={() => setPending(null)}
          onSubmit={async (v) => {
            for (const p of pending.keys) await api.post(`/api/v1/roles/${roleDbId(role.id)}/rules`, { permission: p, effect: pending.effect, ...v });
            await refresh();
          }}
        >
          <p>{pending.effect === 'allow' ? 'Thêm luật Cho cho từng quyền rủi ro thấp (quyền rủi ro cao vẫn phải Cho từng quyền):' : 'Thêm luật Cấm theo mẫu — Cấm thắng mọi luật Cho, phủ cả quyền rủi ro cao:'}</p>
          <ul>{pending.keys.map((k) => <li key={k}><code>{k}</code></li>)}</ul>
        </WriteDialog>
      ) : null}
      {pending?.kind === 'remove' ? (
        <WriteDialog
          title={`Gỡ luật ${pending.rule.effect === 'deny' ? 'Cấm' : 'Cho'} ${pending.rule.permission}`}
          confirmLabel="Gỡ luật"
          onClose={() => setPending(null)}
          onSubmit={async (v) => {
            await api.post(`/api/v1/roles/${roleDbId(role.id)}/rules/${pending.rule.id}/remove`, { reason: v.reason });
            await refresh();
          }}
        >
          {pending.rule.permission.includes('*') ? <p>Luật này là mẫu: gỡ sẽ mở lại mọi quyền khớp <code>{pending.rule.permission}</code>.</p> : null}
        </WriteDialog>
      ) : null}
    </Modal>
  );
}

export function MatrixTab() {
  const api = useApi();
  const [q, setQ] = useState('');
  const [onlyTenant, setOnlyTenant] = useState(false);
  const [pick, setPick] = useState<{ role: MatrixRole; permission: MatrixPermission } | null>(null);
  const matrix = useQuery({ queryKey: ['phan-quyen', 'matrix'], queryFn: () => api.get<MatrixData>('/api/v1/roles/matrix') });

  if (matrix.isLoading) return <Loading />;
  if (matrix.error) return <ErrorBox error={errorText(matrix.error)} />;
  const m = matrix.data;
  if (!m) return <Empty />;
  const roles = onlyTenant ? m.roles.filter((r) => !r.system) : m.roles;
  const groups = groupPermissions(m.permissions, q);

  return (
    <div>
      <div className="card card-body row" style={{ gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
        <input className="input" style={{ maxWidth: 320 }} placeholder="Tìm quyền theo tên hoặc mã" value={q} onChange={(e) => setQ(e.target.value)} />
        <label><input type="checkbox" checked={onlyTenant} onChange={(e) => setOnlyTenant(e.target.checked)} /> Chỉ vai trò của đơn vị</label>
        <span className="muted"><strong style={{ color: '#2e7d32' }}>✓</strong> có quyền · <strong style={{ color: '#b91c1c' }}>✕</strong> bị Cấm · <strong style={{ color: '#94a3b8' }}>·</strong> chưa có. Bấm ô của vai trò đơn vị để thêm / gỡ luật; muốn sửa nhiều quyền một lúc dùng <em>Sửa quyền</em> ở thẻ Vai trò.</span>
      </div>
      {!groups.length ? <Empty text="Không có quyền khớp." /> : (
        <div className="table-wrap">
          <table className="grid">
            <thead>
              <tr>
                <th style={{ minWidth: 260 }}>Quyền</th>
                {roles.map((r) => {
                  const s = columnSummary(m, r.id);
                  return (
                    <th key={r.id} title={`${r.code}${r.system ? ' — vai trò mặc định, chỉ xem' : ''}`} style={{ textAlign: 'center', opacity: r.isActive ? 1 : 0.5, minWidth: 96 }}>
                      {roleLabel(r)}<br /><small className="muted" style={{ fontWeight: 400 }}>{r.system ? 'mặc định' : r.isActive ? KIND_TEXT[r.kind] ?? r.kind : 'vô hiệu'} · {s.allow} quyền{s.deny ? ` · ${s.deny} Cấm` : ''}</small>
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {groups.map((g) => (
                <GroupRows key={g.module} label={g.label} items={g.items} roles={roles} matrix={m} onPick={(role, permission) => setPick({ role, permission })} />
              ))}
            </tbody>
          </table>
        </div>
      )}
      {pick ? <CellPanel matrix={m} role={pick.role} permission={pick.permission} onClose={() => setPick(null)} /> : null}
    </div>
  );
}

function GroupRows({ label, items, roles, matrix, onPick }: {
  label: string; items: MatrixPermission[]; roles: MatrixRole[]; matrix: MatrixData; onPick: (r: MatrixRole, p: MatrixPermission) => void;
}) {
  return (
    <>
      <tr><th colSpan={roles.length + 1} style={{ textAlign: 'left', background: 'rgba(100,116,139,.12)' }}>{label}</th></tr>
      {items.map((p) => (
        <tr key={p.key}>
          <td title={p.key}>{p.label}{p.risk === 'high' ? <> <span className="badge badge-warn" style={{ fontSize: 11 }}>Cao</span></> : null}</td>
          {roles.map((r) => {
            const c = cellOf(matrix, r.id, p.key);
            const style = { ...CELL_STYLE[c], width: '100%', border: 0, padding: '2px 8px', borderRadius: 4, cursor: r.system ? 'default' : 'pointer', fontSize: 16, fontWeight: 700 };
            return (
              <td key={r.id} style={{ textAlign: 'center' }}>
                {r.system
                  ? <span style={{ ...style, display: 'inline-block' }} title={CELL_TEXT[c]}>{CELL_MARK[c]}</span>
                  : <button type="button" style={style} title={`${CELL_TEXT[c]} — bấm để sửa luật của ${r.label}`} onClick={() => onPick(r, p)}>{CELL_MARK[c]}</button>}
              </td>
            );
          })}
        </tr>
      ))}
    </>
  );
}
