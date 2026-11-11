/**
 * SỬA VAI TRÒ (kiểu bảng chức năng × thao tác): trái là thẻ Danh mục / Nghiệp vụ / Báo cáo / Tiện ích, phải là các nhóm gập được,
 * mỗi dòng một chức năng, mỗi cột một thao tác (Xem, Thêm / sửa, Huỷ, Xuất Excel, Khác), có "Toàn quyền" theo dòng / nhóm / thẻ.
 * Tick chỉ đổi trên màn; bấm Lưu mới ghi — mỗi thay đổi thành luật Cho / Cấm qua API sẵn có (lý do, nhập lại mật khẩu khi Cho quyền
 * rủi ro cao, chống leo thang do máy chủ kiểm). Vai trò hệ thống chỉ xem.
 */
import { useMemo, useState, type CSSProperties } from 'react';
import { ErrorBox, Loading, errorText, useApi, useQuery, useQueryClient } from '@bizcity/ui-kit';
import { cellOf, FS, KIND_TEXT, roleDbId, roleLabel, ROLE_TEXT, type MatrixData, type MatrixPermission, type RoleDetail } from '../lib/matrix';
import { buildGrid, GRID_COLS, GRID_TABS, keysOfGroups, keysOfRow, planGrid, type GridGroup, type GridRow, type GridTab } from '../lib/grid';
import { WriteDialog } from './WriteDialog';

const BORDER = '1px solid rgba(100,116,139,.22)';
const TH: CSSProperties = { textAlign: 'center', fontWeight: 600, fontSize: FS.body, padding: '10px 8px', whiteSpace: 'nowrap' };
/** Độ rộng cột theo phần trăm: tên chức năng không bị ép xuống dòng, cột thao tác đều nhau. */
const COL_W = { name: '30%', all: '10%', op: '10%', khac: '20%' } as const;

/** Công tắc nhỏ (không có trong ui-kit). */
function Switch({ on, disabled, onChange, label }: { on: boolean; disabled?: boolean; onChange: (v: boolean) => void; label?: string }) {
  return (
    <label style={{ display: 'inline-flex', alignItems: 'center', gap: 8, cursor: disabled ? 'default' : 'pointer', opacity: disabled ? 0.5 : 1 }}>
      <span onClick={() => !disabled && onChange(!on)} role="switch" aria-checked={on}
        style={{ width: 34, height: 18, borderRadius: 9, background: on ? '#2e7d32' : '#cfd4da', position: 'relative', transition: 'background .15s', flex: 'none' }}>
        <span style={{ position: 'absolute', top: 2, left: on ? 18 : 2, width: 14, height: 14, borderRadius: 7, background: '#fff', transition: 'left .15s' }} />
      </span>
      {label ? <span style={{ fontSize: FS.body }}>{label}</span> : null}
    </label>
  );
}

export function RoleEditor({ roleId, onClose }: { roleId: string; onClose: () => void }) {
  const api = useApi();
  const qc = useQueryClient();
  const matrix = useQuery({ queryKey: ['phan-quyen', 'matrix'], queryFn: () => api.get<MatrixData>('/api/v1/roles/matrix') });
  const role = matrix.data?.roles.find((r) => r.id === roleId);
  const detail = useQuery({ queryKey: ['phan-quyen', 'role', roleId], queryFn: () => api.get<RoleDetail>(`/api/v1/roles/${roleDbId(roleId)}`), enabled: !!role && !role.system });
  const [tab, setTab] = useState<GridTab>('nghiep-vu');
  const [q, setQ] = useState('');
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const [want, setWant] = useState<Map<string, boolean>>(new Map());
  const [saving, setSaving] = useState(false);

  const groups = useMemo(() => (matrix.data ? buildGrid(matrix.data.permissions, tab, q) : []), [matrix.data, tab, q]);
  if (matrix.isLoading || (role && !role.system && detail.isLoading)) return <Loading />;
  if (matrix.error) return <ErrorBox error={errorText(matrix.error)} />;
  if (!matrix.data || !role) return <ErrorBox error="Không tìm thấy vai trò" />;
  const m = matrix.data;
  const readOnly = role.system || !role.isActive || role.kind === 'restriction';
  const now = (k: string) => want.get(k) ?? cellOf(m, role.id, k) === 'allow';
  const set = (keys: string[], v: boolean) => setWant((prev) => {
    const next = new Map(prev);
    for (const k of keys) { if ((cellOf(m, role.id, k) === 'allow') === v) next.delete(k); else next.set(k, v); }
    return next;
  });
  const allOn = (keys: string[]) => keys.length > 0 && keys.every(now);
  const plan = planGrid(m, role, detail.data, want);
  const changed = want.size;

  return (
    <div className="card card-body" style={{ paddingBottom: 0 }}>
      <div className="row" style={{ gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
        <button type="button" className="btn btn-sm" onClick={onClose} title="Về danh sách vai trò">←</button>
        <h2 style={{ margin: 0, fontSize: FS.title, fontWeight: 700 }}>{roleLabel(role)}</h2>
        <code className="muted" style={{ fontSize: FS.small }}>{role.code}</code>
        <span className="badge" style={{ fontSize: FS.small }}>{KIND_TEXT[role.kind] ?? role.kind}</span>
        {role.baseRole ? <span className="muted" style={{ fontSize: FS.body }}>Vai trò nền: <strong>{ROLE_TEXT[role.baseRole] ?? role.baseRole}</strong></span> : null}
        {!role.isActive ? <span className="badge">Vô hiệu</span> : null}
      </div>
      {readOnly ? <p className="muted" style={{ marginTop: 8, fontSize: FS.body }}>{role.system ? 'Vai trò hệ thống: chỉ xem, quyền theo mã nguồn.' : !role.isActive ? 'Vai trò đang vô hiệu: bật lại ở danh sách vai trò trước khi sửa.' : 'Vai trò Hạn chế chỉ có luật Cấm: sửa ở thẻ Ma trận quyền.'}</p> : null}

      <div style={{ display: 'flex', gap: 16, marginTop: 16, alignItems: 'flex-start' }}>
        <nav aria-label="Nhóm quyền" style={{ display: 'flex', flexDirection: 'column', gap: 6, width: 210, flex: 'none', position: 'sticky', top: 8 }}>
          {GRID_TABS.map((t) => {
            const n = m ? buildGrid(m.permissions, t.key).reduce((s, g) => s + g.rows.length, 0) : 0;
            const active = tab === t.key;
            return (
              <button key={t.key} type="button" onClick={() => setTab(t.key)}
                style={{ textAlign: 'left', padding: '10px 14px', fontWeight: 600, fontSize: FS.body, fontFamily: 'inherit', borderRadius: 6, border: 'none', cursor: 'pointer',
                  background: active ? 'rgba(100,116,139,.22)' : 'rgba(100,116,139,.07)', color: 'inherit', display: 'flex', justifyContent: 'space-between' }}>
                <span>{t.label}</span><span className="muted" style={{ fontWeight: 400, fontSize: FS.small }}>{n}</span>
              </button>
            );
          })}
        </nav>

        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="row" style={{ gap: 12, alignItems: 'center', marginBottom: 12 }}>
            <Switch on={allOn(keysOfGroups(groups))} disabled={readOnly} onChange={(v) => set(keysOfGroups(groups), v)}
              label={`Có toàn quyền trên tất cả ${GRID_TABS.find((t) => t.key === tab)!.label.toLowerCase()}`} />
            <span className="muted" style={{ marginLeft: 'auto', fontSize: FS.small }}><span style={{ background: '#fee2e2', padding: '1px 6px', borderRadius: 3 }}>nền đỏ</span> = đang bị Cấm · <span style={{ outline: '2px solid #f9a825', padding: '0 4px', borderRadius: 3 }}>viền vàng</span> = chưa lưu</span>
            <input className="input" style={{ maxWidth: 240 }} placeholder="Tìm chức năng" value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
          {!groups.length ? <p className="muted">Không có chức năng nào ở mục này.</p> : groups.map((g) => (
            <GroupBlock key={g.key} g={g} open={open[g.key] ?? true} onToggle={() => setOpen((o) => ({ ...o, [g.key]: !(o[g.key] ?? true) }))}
              now={now} set={set} allOn={allOn} readOnly={readOnly} changed={(k) => want.has(k)} denied={(k) => !want.has(k) && cellOf(m, role.id, k) === 'deny'} />
          ))}
        </div>
      </div>

      {!readOnly ? (
        <div className="row" style={{ gap: 8, justifyContent: 'flex-end', alignItems: 'center', position: 'sticky', bottom: 0, padding: '12px 0', marginTop: 8,
          background: 'var(--card-bg, #fff)', borderTop: BORDER, zIndex: 2 }}>
          <span className="muted" style={{ marginRight: 'auto', fontSize: FS.body }}>{changed ? `${changed} ô đã đổi (viền vàng) — chưa lưu` : 'Tick để đổi quyền, bấm Lưu để ghi.'}</span>
          {plan.blocked.length ? <span className="muted" title={plan.blocked.map((b) => `${b.permission}: ${b.reason}`).join('\n')}>{plan.blocked.length} ô không đổi được (rê chuột để xem)</span> : null}
          <button type="button" className="btn" disabled={!changed} onClick={() => setWant(new Map())}>Huỷ thay đổi</button>
          <button type="button" className="btn btn-primary" disabled={!plan.ops.length} onClick={() => setSaving(true)}>Lưu{plan.ops.length ? ` (${plan.ops.length} luật)` : ''}</button>
        </div>
      ) : null}

      {saving ? (
        <WriteDialog title={`Lưu quyền của vai trò ${role.label}`} confirmLabel={`Ghi ${plan.ops.length} luật`} needPassword={plan.high} onClose={() => setSaving(false)}
          onSubmit={async (v) => {
            const id = roleDbId(role.id);
            for (const op of plan.ops) {
              if (op.kind === 'remove') await api.post(`/api/v1/roles/${id}/rules/${op.rule.id}/remove`, { reason: v.reason });
              else await api.post(`/api/v1/roles/${id}/rules`, { permission: op.permission, effect: op.kind, ...v });
            }
            setWant(new Map());
            await qc.invalidateQueries({ queryKey: ['phan-quyen'] });
          }}>
          <ul>{plan.ops.map((op, i) => <li key={i}>{op.kind === 'remove' ? `Gỡ luật ${op.rule.effect === 'deny' ? 'Cấm' : 'Cho'} ${op.rule.permission}` : `${op.kind === 'allow' ? 'Cho' : 'Cấm'} ${op.permission}`}</li>)}</ul>
          {plan.high ? <p>Có quyền rủi ro cao: cần nhập lại mật khẩu của bạn.</p> : null}
        </WriteDialog>
      ) : null}
    </div>
  );
}

function GroupBlock({ g, open, onToggle, now, set, allOn, readOnly, changed, denied }: {
  g: GridGroup; open: boolean; onToggle: () => void; now: (k: string) => boolean; set: (keys: string[], v: boolean) => void;
  allOn: (keys: string[]) => boolean; readOnly: boolean; changed: (k: string) => boolean; denied: (k: string) => boolean;
}) {
  const keys = g.rows.flatMap(keysOfRow);
  return (
    <div style={{ border: BORDER, borderRadius: 8, marginBottom: 14, overflow: 'hidden' }}>
      <div className="row" style={{ alignItems: 'center', padding: '10px 16px', background: 'rgba(100,116,139,.09)', cursor: 'pointer', fontSize: FS.body }} onClick={onToggle}>
        <strong style={{ fontSize: FS.group }}>{g.label}</strong>
        <span className="muted" style={{ marginLeft: 10, fontSize: FS.small }}>{g.rows.length} chức năng</span>
        <span style={{ marginLeft: 'auto' }} onClick={(e) => e.stopPropagation()}>
          <Switch on={allOn(keys)} disabled={readOnly} onChange={(v) => set(keys, v)} label="Toàn quyền" />
        </span>
        <span className="muted" style={{ marginLeft: 14, fontSize: FS.small, width: 16, textAlign: 'center' }}>{open ? '▲' : '▼'}</span>
      </div>
      {open ? (
        <table style={{ width: '100%', borderCollapse: 'collapse', tableLayout: 'fixed', fontSize: FS.body }}>
          <colgroup><col style={{ width: COL_W.name }} /><col style={{ width: COL_W.all }} />{GRID_COLS.map((c) => <col key={c.key} style={{ width: c.key === 'khac' ? COL_W.khac : COL_W.op }} />)}</colgroup>
          <thead>
            <tr style={{ borderBottom: BORDER }}><th style={{ ...TH, textAlign: 'left', paddingLeft: 16 }}>Chức năng</th><th style={TH}>Toàn quyền</th>{GRID_COLS.map((c) => <th key={c.key} style={{ ...TH, textAlign: c.key === 'khac' ? 'left' : 'center', paddingLeft: c.key === 'khac' ? 20 : 8 }}>{c.label}</th>)}</tr>
          </thead>
          <tbody>
            {g.rows.map((r) => <RowLine key={r.key} r={r} now={now} set={set} allOn={allOn} readOnly={readOnly} changed={changed} denied={denied} />)}
          </tbody>
        </table>
      ) : null}
    </div>
  );
}

function RowLine({ r, now, set, allOn, readOnly, changed, denied }: {
  r: GridRow; now: (k: string) => boolean; set: (keys: string[], v: boolean) => void; allOn: (keys: string[]) => boolean; readOnly: boolean; changed: (k: string) => boolean;
  denied: (k: string) => boolean;
}) {
  const keys = keysOfRow(r);
  const cb: CSSProperties = { width: 17, height: 17, cursor: readOnly ? 'default' : 'pointer' };
  const box = (p: MatrixPermission, withLabel: boolean) => (
    <label key={p.key} title={`${p.label}${denied(p.key) ? ' — đang bị CẤM' : ''}${p.risk === 'high' ? ' — rủi ro cao: Cho cần nhập lại mật khẩu' : ''}\n${p.key}`}
      style={{ display: withLabel ? 'flex' : 'inline-flex', alignItems: 'center', gap: 8, padding: withLabel ? '3px 4px' : 3, borderRadius: 4,
        outline: changed(p.key) ? '2px solid #f9a825' : undefined, outlineOffset: 1, background: denied(p.key) ? '#fee2e2' : undefined }}>
      <input type="checkbox" style={cb} checked={now(p.key)} disabled={readOnly} onChange={(e) => set([p.key], e.target.checked)} />
      {withLabel ? <span style={{ lineHeight: 1.35, fontSize: FS.body }}>{p.label}{p.risk === 'high' ? <span className="badge badge-warn" style={{ marginLeft: 6, fontSize: FS.small }}>Cao</span> : null}</span> : null}
    </label>
  );
  return (
    <tr style={{ borderTop: BORDER }}>
      <td style={{ padding: '10px 16px', fontWeight: 500 }}>{r.label}</td>
      <td style={{ textAlign: 'center' }}><input type="checkbox" style={cb} checked={allOn(keys)} disabled={readOnly} onChange={(e) => set(keys, e.target.checked)} /></td>
      {GRID_COLS.map((c) => {
        const ps = r.cells[c.key] ?? [];
        return (
          <td key={c.key} style={{ textAlign: c.key === 'khac' ? 'left' : 'center', padding: c.key === 'khac' ? '6px 8px 6px 20px' : '6px 8px' }}>
            {c.key === 'khac' || ps.length > 1 ? ps.map((p) => box(p, true)) : ps[0] ? box(ps[0], false) : null}
          </td>
        );
      })}
    </tr>
  );
}
