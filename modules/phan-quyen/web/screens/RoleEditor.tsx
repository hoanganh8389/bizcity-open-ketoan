/**
 * SỬA VAI TRÒ (kiểu bảng chức năng × thao tác): trái là thẻ Danh mục / Nghiệp vụ / Báo cáo / Tiện ích, phải là các nhóm gập được,
 * mỗi dòng một chức năng, mỗi cột một thao tác (Xem, Thêm / sửa, Huỷ, Xuất Excel, Khác), có "Toàn quyền" theo dòng / nhóm / thẻ.
 * Tick chỉ đổi trên màn; bấm Lưu mới ghi — mỗi thay đổi thành luật Cho / Cấm qua API sẵn có (lý do, nhập lại mật khẩu khi Cho quyền
 * rủi ro cao, chống leo thang do máy chủ kiểm). Vai trò hệ thống chỉ xem.
 */
// [2026-11-14 05:30 PM kiennt] NT-HT-003 — HT12: thẻ theo phân hệ, mỗi màn một dòng (sổ đăng ký màn `GET /api/v1/man-hinh`), chế độ Cơ bản /
// Chi tiết, ô "có sẵn" (nền / quyền chung) khác ô Cho riêng, vai trò Hạn chế sửa trên lưới (tick = Cấm). Không có sổ màn thì mọi quyền vào
// thẻ "Quyền chung" như lưới cũ (đóng góp)
import { useMemo, useState, type CSSProperties } from 'react';
import { ErrorBox, Loading, errorText, useApi, useQuery, useQueryClient } from '@bizcity/ui-kit';
import { cellOf, FS, KIND_TEXT, roleDbId, roleLabel, ROLE_TEXT, type MatrixData, type MatrixPermission, type RoleDetail } from '../lib/matrix';
import { planGrid } from '../lib/grid';
import {
  actionsOf, buildScreenGrid, deniedByRole, hasView, keysOf, keysOfAll, LEVEL_TEXT, LEVEL_TEXT_CAM, levelOf, levelWant, planRestriction, sourceOf,
  type Group, type Level, type ManHinhDef, type Row,
} from '../lib/man-hinh-grid';
import { WriteDialog } from './WriteDialog';

const BORDER = '1px solid rgba(100,116,139,.22)';
const TH: CSSProperties = { textAlign: 'center', fontWeight: 600, fontSize: FS.body, padding: '10px 8px', whiteSpace: 'nowrap' };
const OK_BG = '#e8f5e9';
const SAN_BG = 'rgba(100,116,139,.12)';
const CAM_BG = '#fee2e2';

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

type Mode = 'co-ban' | 'chi-tiet';
const MODE_KEY = 'phan-quyen.sua-vai-tro.che-do';
const readMode = (): Mode => { try { return localStorage.getItem(MODE_KEY) === 'chi-tiet' ? 'chi-tiet' : 'co-ban'; } catch { return 'co-ban'; } };

/** Mọi thứ một ô / dòng cần để vẽ và đổi tick. */
interface Ctx {
  readOnly: boolean;
  cam: boolean;
  mode: Mode;
  now: (k: string) => boolean;
  set: (keys: string[], v: boolean) => void;
  setPairs: (pairs: [string, boolean][]) => void;
  changed: (k: string) => boolean;
  /** Vai trò thường: ô đang bị Cấm (nền đỏ). */
  denied: (k: string) => boolean;
  /** Vai trò thường: Có từ đâu ('rieng' / 'san'). */
  source: (k: string) => 'rieng' | 'san' | null;
}

export function RoleEditor({ roleId, onClose }: { roleId: string; onClose: () => void }) {
  const api = useApi();
  const qc = useQueryClient();
  const matrix = useQuery({ queryKey: ['phan-quyen', 'matrix'], queryFn: () => api.get<MatrixData>('/api/v1/roles/matrix') });
  // Sổ đăng ký màn của các phân hệ; lỗi / chưa có thì lưới dùng thẻ "Quyền chung" như cũ.
  const screens = useQuery({ queryKey: ['phan-quyen', 'man-hinh'], queryFn: () => api.get<ManHinhDef[]>('/api/v1/man-hinh'), retry: false });
  const role = matrix.data?.roles.find((r) => r.id === roleId);
  const detail = useQuery({ queryKey: ['phan-quyen', 'role', roleId], queryFn: () => api.get<RoleDetail>(`/api/v1/roles/${roleDbId(roleId)}`), enabled: !!role && !role.system });
  const [tab, setTab] = useState<string | null>(null);
  const [q, setQ] = useState('');
  const [mode, setModeState] = useState<Mode>(readMode);
  const [want, setWant] = useState<Map<string, boolean>>(new Map());
  const [saving, setSaving] = useState(false);
  const setMode = (v: Mode) => { setModeState(v); try { localStorage.setItem(MODE_KEY, v); } catch { /* chỉ là tiện ích */ } };

  const grid = useMemo(() => (matrix.data ? buildScreenGrid(screens.data ?? [], matrix.data.permissions, q) : null), [matrix.data, screens.data, q]);
  if (matrix.isLoading || screens.isLoading || (role && !role.system && detail.isLoading)) return <Loading />;
  if (matrix.error) return <ErrorBox error={errorText(matrix.error)} />;
  if (!matrix.data || !role || !grid) return <ErrorBox error="Không tìm thấy vai trò" />;
  const m = matrix.data;
  const cam = role.kind === 'restriction';
  const readOnly = role.system || !role.isActive;
  // Trạng thái gốc của ô: vai trò thường = có quyền; vai trò Hạn chế = luật của chính vai trò đang Cấm.
  const base = (k: string) => (cam ? deniedByRole(detail.data, k) : cellOf(m, role.id, k) === 'allow');
  const now = (k: string) => want.get(k) ?? base(k);
  const setPairs = (pairs: [string, boolean][]) => setWant((prev) => {
    const next = new Map(prev);
    for (const [k, v] of pairs) { if (base(k) === v) next.delete(k); else next.set(k, v); }
    return next;
  });
  const ctx: Ctx = {
    readOnly, cam, mode, now, setPairs,
    set: (keys, v) => setPairs(keys.map((k) => [k, v])),
    changed: (k) => want.has(k),
    denied: (k) => !cam && !want.has(k) && cellOf(m, role.id, k) === 'deny',
    source: (k) => (cam || want.has(k) ? null : sourceOf(m, role, detail.data, k)),
  };
  const plan = cam ? planRestriction(detail.data, want) : planGrid(m, role, detail.data, want);
  const changed = want.size;
  // Đang tìm: gộp kết quả mọi thẻ; không tìm: thẻ đang chọn (mặc định thẻ đầu).
  const activeTab = tab && grid.groups.has(tab) ? tab : grid.tabs[0]?.key ?? null;
  const groups: Group[] = q.trim() ? grid.tabs.flatMap((t) => grid.groups.get(t.key) ?? []) : activeTab ? grid.groups.get(activeTab) ?? [] : [];

  return (
    <div className="card card-body" style={{ paddingBottom: 0 }}>
      <div className="row" style={{ gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
        <button type="button" className="btn btn-sm" onClick={onClose} title="Về danh sách vai trò">←</button>
        <h2 style={{ margin: 0, fontSize: FS.title, fontWeight: 700 }}>{roleLabel(role)}</h2>
        <code className="muted" style={{ fontSize: FS.small }}>{role.code}</code>
        <span className="badge" style={{ fontSize: FS.small }}>{KIND_TEXT[role.kind] ?? role.kind}</span>
        {role.baseRole ? <span className="muted" style={{ fontSize: FS.body }}>Vai trò nền: <strong>{ROLE_TEXT[role.baseRole] ?? role.baseRole}</strong></span> : null}
        {!role.isActive ? <span className="badge">Vô hiệu</span> : null}
        <span style={{ marginLeft: 'auto', display: 'inline-flex', border: BORDER, borderRadius: 6, overflow: 'hidden' }} role="group" aria-label="Chế độ xem">
          {(['co-ban', 'chi-tiet'] as const).map((k) => (
            <button key={k} type="button" onClick={() => setMode(k)} title={k === 'co-ban' ? 'Mỗi màn một mức: Không / Chỉ xem / Đầy đủ' : 'Tick từng nút trên màn'}
              style={{ padding: '6px 14px', border: 'none', cursor: 'pointer', fontFamily: 'inherit', fontSize: FS.body, fontWeight: 600, color: 'inherit',
                background: mode === k ? 'rgba(100,116,139,.22)' : 'transparent' }}>{k === 'co-ban' ? 'Cơ bản' : 'Chi tiết'}</button>
          ))}
        </span>
      </div>
      {readOnly ? <p className="muted" style={{ marginTop: 8, fontSize: FS.body }}>{role.system ? 'Vai trò hệ thống: chỉ xem, quyền theo mã nguồn.' : 'Vai trò đang vô hiệu: bật lại ở danh sách vai trò trước khi sửa.'}</p> : null}
      {cam ? <p style={{ marginTop: 8, fontSize: FS.body, background: CAM_BG, padding: '6px 10px', borderRadius: 6 }}>Vai trò <strong>Hạn chế</strong>: quyền được bật / tick là <strong>CẤM</strong> thao tác đó với người được gán (thắng mọi quyền Cho).</p> : null}

      <div style={{ display: 'flex', gap: 16, marginTop: 16, alignItems: 'flex-start' }}>
        <nav aria-label="Phân hệ" style={{ display: 'flex', flexDirection: 'column', gap: 4, width: 190, flex: 'none', position: 'sticky', top: 8 }}>
          {grid.tabs.map((t) => {
            const active = !q.trim() && activeTab === t.key;
            const n = keysOfAll(grid.groups.get(t.key) ?? []).filter((k) => want.has(k)).length;
            return (
              <button key={t.key} type="button" onClick={() => { setTab(t.key); setQ(''); }}
                style={{ textAlign: 'left', padding: '9px 12px', fontWeight: 600, fontSize: FS.body, fontFamily: 'inherit', borderRadius: 6, border: 'none', cursor: 'pointer',
                  background: active ? 'rgba(100,116,139,.22)' : 'rgba(100,116,139,.07)', color: 'inherit', display: 'flex', justifyContent: 'space-between', gap: 6 }}>
                <span>{t.label}{n ? <span style={{ color: '#b26a00' }}> •</span> : null}</span>
                <span className="muted" style={{ fontWeight: 400, fontSize: FS.small }}>{t.count}</span>
              </button>
            );
          })}
        </nav>

        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="row" style={{ gap: 12, alignItems: 'center', marginBottom: 12, flexWrap: 'wrap' }}>
            <Legend cam={cam} />
            <input className="input" style={{ maxWidth: 240, marginLeft: 'auto' }} placeholder="Tìm màn, mã màn, quyền" value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
          {!groups.length ? <p className="muted">Không có màn / quyền nào khớp.</p> : groups.map((g) => <GroupBlock key={g.key} g={g} ctx={ctx} />)}
        </div>
      </div>

      {!readOnly ? (
        <div className="row" style={{ gap: 8, justifyContent: 'flex-end', alignItems: 'center', position: 'sticky', bottom: 0, padding: '12px 0', marginTop: 8,
          background: 'var(--card-bg, #fff)', borderTop: BORDER, zIndex: 2 }}>
          <span className="muted" style={{ marginRight: 'auto', fontSize: FS.body }}>{changed ? `${changed} ô đã đổi (viền vàng) — chưa lưu` : 'Bấm vào từng quyền (hoặc mức nhanh) để đổi, bấm Lưu để ghi.'}</span>
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

function Legend({ cam }: { cam: boolean }) {
  const chip = (bg: string, text: string, extra?: CSSProperties) => <span style={{ background: bg, padding: '1px 6px', borderRadius: 3, ...extra }}>{text}</span>;
  return (
    <span className="muted" style={{ fontSize: FS.small, display: 'inline-flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
      {cam ? chip(CAM_BG, 'bật = Cấm') : <>{chip(OK_BG, 'Cho riêng')}{chip(SAN_BG, 'có sẵn (nền / quyền chung)')}{chip(CAM_BG, 'đang bị Cấm')}</>}
      {chip('transparent', 'chưa lưu', { outline: '2px solid #f9a825' })}
      <span>– = màn không có thao tác này</span>
    </span>
  );
}

function GroupBlock({ g, ctx }: { g: Group; ctx: Ctx }) {
  const [open, setOpen] = useState(true);
  const keys = g.rows.flatMap(keysOf);
  const allOn = keys.length > 0 && keys.every(ctx.now);
  const basic = ctx.mode === 'co-ban' && g.cols.some((c) => c.key === 'them');
  return (
    <div style={{ border: BORDER, borderRadius: 8, marginBottom: 14, overflow: 'hidden' }}>
      <div className="row" style={{ alignItems: 'center', padding: '10px 16px', background: 'rgba(100,116,139,.09)', cursor: 'pointer', fontSize: FS.body, gap: 12 }} onClick={() => setOpen(!open)}>
        <strong style={{ fontSize: FS.group }}>{g.label}</strong>
        <span className="muted" style={{ fontSize: FS.small }}>{g.rows.length} {basic || g.cols.some((c) => c.key === 'them') ? 'màn' : 'chức năng'}</span>
        <span style={{ marginLeft: 'auto', display: 'inline-flex', gap: 8, alignItems: 'center' }} onClick={(e) => e.stopPropagation()}>
          {basic ? (
            <>
              <span className="muted" style={{ fontSize: FS.small }}>Cả nhóm:</span>
              {(['khong', 'chi-xem', 'day-du'] as const).map((lv) => (
                <button key={lv} type="button" className="btn btn-xs" disabled={ctx.readOnly}
                  onClick={() => ctx.setPairs(g.rows.flatMap((r) => (lv === 'chi-xem' && !hasView(r) ? levelWant(r, ctx.cam ? 'day-du' : 'khong', ctx.cam) : levelWant(r, lv, ctx.cam))))}>
                  {(ctx.cam ? LEVEL_TEXT_CAM : LEVEL_TEXT)[lv]}
                </button>
              ))}
            </>
          ) : <Switch on={allOn} disabled={ctx.readOnly} onChange={(v) => ctx.set(keys, v)} label={ctx.cam ? 'Cấm tất cả' : 'Toàn quyền'} />}
        </span>
        <span className="muted" style={{ fontSize: FS.small, width: 16, textAlign: 'center' }}>{open ? '▲' : '▼'}</span>
      </div>
      {open ? (basic ? <BasicTable g={g} ctx={ctx} /> : <DetailTable g={g} ctx={ctx} />) : null}
    </div>
  );
}

/**
 * Chế độ Cơ bản: mỗi màn một dòng, các quyền của màn là nút bật / tắt theo tên nút trên màn (Xem, Thêm, Sửa, Xoá, Duyệt, Ghi nhận…);
 * bên phải là mức nhanh Không / Chỉ xem / Đầy đủ cho cả dòng.
 */
function BasicTable({ g, ctx }: { g: Group; ctx: Ctx }) {
  const text = ctx.cam ? LEVEL_TEXT_CAM : LEVEL_TEXT;
  return (
    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: FS.body }}>
      <thead><tr style={{ borderBottom: BORDER }}>
        <th style={{ ...TH, textAlign: 'left', paddingLeft: 16, width: 80 }}>Mã</th><th style={{ ...TH, textAlign: 'left', width: 200 }}>Màn</th>
        <th style={{ ...TH, textAlign: 'left' }}>{ctx.cam ? 'Thao tác bị cấm (bấm để bật / tắt)' : 'Quyền trên màn (bấm để bật / tắt)'}</th>
        <th style={{ ...TH, textAlign: 'right', paddingRight: 16 }}>Nhanh</th>
      </tr></thead>
      <tbody>
        {g.rows.map((r) => {
          const lv = levelOf(r, ctx.now, ctx.cam);
          const opts: Exclude<Level, 'tuy-chinh'>[] = hasView(r) ? ['khong', 'chi-xem', 'day-du'] : ['khong', 'day-du'];
          return (
            <tr key={r.key} style={{ borderTop: BORDER }}>
              <td style={{ padding: '8px 16px' }} className="muted">{r.ma}</td>
              <td style={{ padding: '8px 8px', fontWeight: 500 }}>{r.label}</td>
              <td style={{ padding: '6px 8px' }}>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>{actionsOf(r).map(({ p, nhan }) => <Chip key={p.key} p={p} nhan={nhan} goc={r.goc?.[p.key]} ctx={ctx} />)}</div>
              </td>
              <td style={{ padding: '6px 16px 6px 8px', textAlign: 'right', whiteSpace: 'nowrap' }}>
                {opts.map((o, i) => (
                  <span key={o}>
                    {i ? <span className="muted"> · </span> : null}
                    <button type="button" disabled={ctx.readOnly} onClick={() => ctx.setPairs(levelWant(r, o, ctx.cam))}
                      style={{ border: 'none', background: 'none', padding: 0, fontFamily: 'inherit', fontSize: FS.small, cursor: ctx.readOnly ? 'default' : 'pointer',
                        color: lv === o ? 'inherit' : '#1565c0', fontWeight: lv === o ? 700 : 400, textDecoration: lv === o ? 'none' : 'underline' }}>{text[o]}</button>
                  </span>
                ))}
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

/** Một quyền dạng nút bật / tắt: bật = nền màu + dấu ✓ (vai trò Hạn chế: nền đỏ + ⛔). */
function Chip({ p, nhan, goc, ctx }: { p: MatrixPermission; nhan: string; goc?: string; ctx: Ctx }) {
  const on = ctx.now(p.key);
  const src = ctx.source(p.key);
  const denied = ctx.denied(p.key);
  const bg = !on ? (denied ? CAM_BG : 'transparent') : ctx.cam ? CAM_BG : src === 'san' ? SAN_BG : OK_BG;
  const color = on ? (ctx.cam ? '#b71c1c' : '#1b5e20') : denied ? '#b71c1c' : '#64748b';
  const why = ctx.cam ? (on ? 'đang CẤM' : 'không cấm') : denied ? 'đang bị CẤM' : !on ? 'không có' : src === 'san' ? 'có sẵn từ vai trò nền / quyền chung (tắt = thêm luật Cấm)' : src === 'rieng' ? 'Cho riêng của vai trò' : 'có';
  return (
    <button type="button" disabled={ctx.readOnly} onClick={() => ctx.set([p.key], !on)} aria-pressed={on}
      title={`${p.label} — ${why}${p.risk === 'high' ? ' — rủi ro cao: Cho cần nhập lại mật khẩu' : ''}${goc && !ctx.cam ? `\nCẦN KÈM quyền gốc ${goc} (rủi ro cao) — Cho riêng quyền này chưa đủ` : ''}\n${p.key}`}
      style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '3px 10px', borderRadius: 14, fontFamily: 'inherit', fontSize: FS.small, whiteSpace: 'nowrap',
        cursor: ctx.readOnly ? 'default' : 'pointer', background: bg, color, fontWeight: on ? 600 : 400,
        border: `1px solid ${on ? (ctx.cam ? '#ef9a9a' : src === 'san' ? '#b0bec5' : '#a5d6a7') : denied ? '#ef9a9a' : '#cfd4da'}`,
        textDecoration: !on && denied ? 'line-through' : 'none', outline: ctx.changed(p.key) ? '2px solid #f9a825' : undefined, outlineOffset: 1 }}>
      <span style={{ width: 12, textAlign: 'center' }}>{on ? (ctx.cam ? '⛔' : '✓') : ''}</span>{nhan}
      {p.risk === 'high' ? <span className="badge badge-warn" style={{ fontSize: 10, marginLeft: 2 }}>Cao</span> : null}
      {goc && !ctx.cam ? <span style={{ fontSize: 10, marginLeft: 2, color: '#b26a00' }}>+ {goc}</span> : null}
    </button>
  );
}

/** Chế độ Chi tiết: tick từng thao tác. */
function DetailTable({ g, ctx }: { g: Group; ctx: Ctx }) {
  const hasMa = g.rows.some((r) => r.ma);
  return (
    <div style={{ overflowX: 'auto' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: FS.body }}>
        <thead>
          <tr style={{ borderBottom: BORDER }}>
            <th style={{ ...TH, textAlign: 'left', paddingLeft: 16 }}>{hasMa ? 'Màn' : 'Chức năng'}</th>
            <th style={TH}>{ctx.cam ? 'Cấm hết' : 'Tất cả'}</th>
            {g.cols.map((c) => <th key={c.key} style={{ ...TH, textAlign: c.key === 'khac' ? 'left' : 'center', paddingLeft: c.key === 'khac' ? 16 : 8 }}>{c.label}</th>)}
          </tr>
        </thead>
        <tbody>{g.rows.map((r) => <RowLine key={r.key} r={r} cols={g.cols.map((c) => c.key)} ctx={ctx} />)}</tbody>
      </table>
    </div>
  );
}

function RowLine({ r, cols, ctx }: { r: Row; cols: string[]; ctx: Ctx }) {
  const keys = keysOf(r);
  const cb: CSSProperties = { width: 17, height: 17, cursor: ctx.readOnly ? 'default' : 'pointer', accentColor: ctx.cam ? '#c62828' : undefined };
  const box = (p: MatrixPermission, withLabel: boolean) => {
    const src = ctx.source(p.key);
    const bg = ctx.denied(p.key) ? CAM_BG : ctx.cam && ctx.now(p.key) ? CAM_BG : src === 'rieng' ? OK_BG : src === 'san' ? SAN_BG : undefined;
    const why = ctx.cam ? (ctx.now(p.key) ? ' — đang CẤM' : '') : ctx.denied(p.key) ? ' — đang bị CẤM' : src === 'rieng' ? ' — Cho riêng của vai trò' : src === 'san' ? ' — có sẵn từ vai trò nền / quyền chung (bỏ tick = thêm luật Cấm)' : '';
    return (
      <label key={p.key} title={`${p.label}${why}${p.risk === 'high' ? ' — rủi ro cao: Cho cần nhập lại mật khẩu' : ''}${r.goc?.[p.key] && !ctx.cam ? `\nCẦN KÈM quyền gốc ${r.goc[p.key]} (rủi ro cao)` : ''}\n${p.key}`}
        style={{ display: withLabel ? 'flex' : 'inline-flex', alignItems: 'center', gap: 8, padding: withLabel ? '3px 6px' : 4, borderRadius: 4,
          outline: ctx.changed(p.key) ? '2px solid #f9a825' : undefined, outlineOffset: 1, background: bg }}>
        <input type="checkbox" style={cb} checked={ctx.now(p.key)} disabled={ctx.readOnly} onChange={(e) => ctx.set([p.key], e.target.checked)} />
        {withLabel ? <span style={{ lineHeight: 1.35, fontSize: FS.body }}>{p.label}{p.risk === 'high' ? <span className="badge badge-warn" style={{ marginLeft: 6, fontSize: FS.small }}>Cao</span> : null}</span> : null}
      </label>
    );
  };
  return (
    <tr style={{ borderTop: BORDER }}>
      <td style={{ padding: '8px 16px', fontWeight: 500, whiteSpace: 'nowrap' }}>{r.ma ? <span className="muted" style={{ fontWeight: 400, marginRight: 8, fontSize: FS.small }}>{r.ma}</span> : null}{r.label}</td>
      <td style={{ textAlign: 'center' }}><input type="checkbox" style={cb} checked={keys.every(ctx.now)} disabled={ctx.readOnly} onChange={(e) => ctx.set(keys, e.target.checked)} /></td>
      {cols.map((c) => {
        const ps = r.cells[c] ?? [];
        return (
          <td key={c} style={{ textAlign: c === 'khac' ? 'left' : 'center', padding: c === 'khac' ? '4px 8px 4px 16px' : '4px 8px' }}>
            {c === 'khac' || ps.length > 1 ? <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>{ps.map((p) => box(p, true))}</div>
              : ps[0] ? box(ps[0], false) : <span className="muted">–</span>}
          </td>
        );
      })}
    </tr>
  );
}
