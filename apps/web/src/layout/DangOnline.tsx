/**
 * NGƯỜI DÙNG ĐANG ONLINE trên thanh trên cùng: "● N online" — N = số THIẾT BỊ đang mở phần mềm (tài khoản dùng chung cho
 * nhiều người, vd tài khoản trải nghiệm, vẫn đếm đúng số máy).
 *  - Mỗi trình duyệt có mã riêng (ketoan.device, lưu trong máy): nhiều tab cùng máy = 1 thiết bị.
 *  - Tab đang hiện báo về máy chủ khi mở, khi đổi màn và ~60 giây / lần (POST /api/v1/presence/ping); tab ẩn / đóng / đăng xuất
 *    thì báo rời ngay (fetch keepalive) — người chỉ để tab chìm không bị tính online.
 *  - Bấm vào: thiết bị online, tài khoản, tab, thiết bị đã vào hôm nay; người có quyền quản trị người dùng xem thêm danh sách
 *    theo tài khoản → từng máy (trình duyệt · hệ điều hành, màn đang mở, online từ mấy giờ, mấy tab). Tự làm mới 30 giây / lần.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { MenuItem } from '@ketoan/contracts';
import { ROLE_LABELS, type Role } from '@ketoan/contracts';
import { api, tokenStore } from '@/lib/api';
import { MODULES, flattenMenu } from './menu';
import { moduleOfAppPath } from './ModuleBar';

interface DeviceRow { agent: string; since: string; lastSeen: string; screen: string; path: string; tabs: number }
interface Presence { online: number; devices: number; accounts: number; tabs: number; today: number; todayAccounts: number; users?: { name: string; role: string | null; devices: DeviceRow[] }[] }

const newId = () => { try { return crypto.randomUUID(); } catch { return `d${Date.now()}${Math.random().toString(36).slice(2)}`; } };
const TAB_ID = newId();
/** Mã thiết bị: giữ trong máy để nhiều tab / nhiều lần mở cùng một trình duyệt tính là một thiết bị. */
const DEVICE_ID = (() => {
  try {
    let d = localStorage.getItem('ketoan.device');
    if (!d) { d = newId(); localStorage.setItem('ketoan.device', d); }
    return d;
  } catch { return ''; }
})();
const PING_MS = 60_000;
const hhmm = (iso: string) => new Date(iso).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });
const ago = (iso: string) => { const s = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 1000)); return s < 60 ? 'vừa xong' : `${Math.round(s / 60)} phút trước`; };

export function DangOnline({ menu }: { menu: MenuItem[] }) {
  const loc = useLocation();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const screens = useMemo(() => new Map(flattenMenu(menu).map((m) => [m.path, `${m.label}${m.code ? ` · ${m.code}` : ''}`])), [menu]);
  // Trang tổng quan phân hệ (/app/ban-hang…) không nằm trong menu chức năng: ghi "Tổng quan Bán hàng" thay vì đường dẫn.
  const appModule = MODULES.find((m) => m.key === moduleOfAppPath(loc.pathname));
  const screen = screens.get(loc.pathname) ?? (loc.pathname === '/' ? 'Tổng quan' : appModule ? `Tổng quan ${appModule.label}` : loc.pathname);
  const here = useRef({ path: loc.pathname, screen });
  here.current = { path: loc.pathname, screen };

  // Báo còn online: lúc mở, định kỳ khi tab đang hiện; ẩn / đóng tab / ĐĂNG XUẤT thì báo rời ngay.
  // Đăng xuất xoá mã đăng nhập TRƯỚC khi thanh trên cùng (thành phần này) bị gỡ → giữ sẵn mã của lần báo gần nhất để lượt
  // "rời" vẫn được máy chủ nhận (không thì thiết bị còn treo trong danh sách tới 2,5 phút).
  const lastToken = useRef(tokenStore.get() ?? '');
  useEffect(() => {
    const ping = (leave = false) => {
      if (!leave && document.visibilityState !== 'visible') return;
      const token = tokenStore.get() || lastToken.current;
      if (!token) return;
      lastToken.current = token;
      const body = JSON.stringify({ deviceId: DEVICE_ID, tabId: TAB_ID, ...here.current, leave });
      void fetch('/api/v1/presence/ping', { method: 'POST', keepalive: leave, headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` }, body })
        .then((r) => {
          // Vé đã bị thu hồi (đổi mật khẩu / đăng xuất các thiết bị khác / bị khoá ở máy khác): máy này tự đăng xuất ngay, kể cả đang để yên.
          if (r.status === 401 && !leave && tokenStore.get()) { tokenStore.clear(); window.dispatchEvent(new Event('ketoan:logout')); }
          return r.ok ? r.json() : null;
        }).then((j: { ok: boolean; data: Presence } | null) => { if (!leave && j?.ok) qc.setQueryData<Presence>(['presence'], (old) => ({ ...j.data, users: old?.users })); })
        .catch(() => { /* mất mạng: lần sau báo lại */ });
    };
    ping();
    const t = setInterval(() => ping(), PING_MS);
    const vis = () => ping(document.visibilityState !== 'visible');
    const bye = () => ping(true);
    document.addEventListener('visibilitychange', vis);
    window.addEventListener('pagehide', bye);
    return () => { clearInterval(t); document.removeEventListener('visibilitychange', vis); window.removeEventListener('pagehide', bye); ping(true); };
  }, [qc]);
  // Đổi màn: báo ngay để danh sách quản trị thấy đúng màn đang làm.
  useEffect(() => {
    if (document.visibilityState !== 'visible') return;
    void api.post('/api/v1/presence/ping', { deviceId: DEVICE_ID, tabId: TAB_ID, path: loc.pathname, screen }).catch(() => undefined);
  }, [loc.pathname, screen]);

  const q = useQuery({ queryKey: ['presence'], queryFn: () => api.get<Presence>('/api/v1/presence'), refetchInterval: open ? 30_000 : false, staleTime: 20_000 });
  useEffect(() => { if (open) void q.refetch(); }, [open]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => { if (box.current && !box.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open]);

  const p = q.data;
  return (
    <div className="dol" ref={box}>
      <button type="button" className="dol-btn" onClick={() => setOpen(!open)} title="Số thiết bị đang mở phần mềm (tab đang hiện, báo trong 2,5 phút gần nhất) — tài khoản dùng chung vẫn đếm từng máy">
        <span className="dol-dot" /> {p ? p.online : '…'} <span className="dol-lbl">online</span>
      </button>
      {open && (
        <div className="dol-pop">
          <div className="dol-sum">
            <div><b>{p?.devices ?? 0}</b><span>thiết bị online</span></div>
            <div><b>{p?.accounts ?? 0}</b><span>tài khoản</span></div>
            <div title="Tổng số tab trình duyệt đang mở phần mềm, cộng trên mọi máy (một máy mở 3 tab = 3)"><b>{p?.tabs ?? 0}</b><span>tab đang mở</span></div>
            <div title={`${p?.todayAccounts ?? 0} tài khoản`}><b>{p?.today ?? 0}</b><span>thiết bị vào hôm nay</span></div>
          </div>
          {p?.users ? (
            <div className="dol-list">
              {p.users.map((u, i) => (
                <div key={i} className="dol-acc">
                  <div className="dol-acc-head"><b>{u.name}</b> <small>{ROLE_LABELS[u.role as Role] ?? u.role ?? ''}</small>{u.devices.length > 1 && <span className="dol-badge">{u.devices.length} thiết bị</span>}</div>
                  {u.devices.map((d, j) => (
                    <div key={j} className="dol-row">
                      <span className="dol-dot" />
                      <div className="dol-who"><span className="dol-agent">{d.agent}</span><div className="muted">{d.screen || d.path}{d.tabs > 1 ? ` · ${d.tabs} tab` : ''}</div></div>
                      <div className="dol-time muted" title={`Online từ ${hhmm(d.since)}, báo lần cuối ${hhmm(d.lastSeen)}`}>từ {hhmm(d.since)}<br />{ago(d.lastSeen)}</div>
                    </div>
                  ))}
                </div>
              ))}
              {!p.users.length && <div className="muted" style={{ padding: 8 }}>Chưa có ai</div>}
            </div>
          ) : <div className="muted" style={{ padding: '6px 10px', fontSize: 12 }}>Danh sách chi tiết chỉ hiện với người quản trị người dùng.</div>}
          <div className="dol-foot muted">Đếm theo thiết bị (mỗi trình duyệt một máy, nhiều tab vẫn là một); ẩn / đóng tab là rời. Tự làm mới 30 giây / lần.</div>
        </div>
      )}
    </div>
  );
}
