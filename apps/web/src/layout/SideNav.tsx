/**
 * Thanh menu bên trái (bảng điều khiển kế toán): các nhóm thu gọn / mở ra, mỗi chức năng một dòng kèm mã.
 *  - Nhóm chứa màn đang mở tự mở ra; các nhóm người dùng đã mở được nhớ lại (localStorage).
 *  - Chức năng chưa làm hiện mờ, ghi "chưa có", bấm không mở gì.
 *  - Nút thu gọn ở đáy để dành chỗ cho bảng số liệu rộng.
 */
import { useEffect, useState } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { isSection } from './menu';
import { ChevronDown, ChevronRight, PanelLeftClose, PanelLeftOpen, Pin, PinOff } from 'lucide-react';
import type { MenuItem } from '@ketoan/contracts';
import { usePins } from './pins';

const OPEN_KEY = 'ketoan.sidenav.open';
const COLLAPSED_KEY = 'ketoan.sidenav.collapsed';
const read = <T,>(key: string, fallback: T): T => {
  try { return JSON.parse(localStorage.getItem(key) ?? 'null') ?? fallback; } catch { return fallback; }
};
const write = (key: string, v: unknown) => { try { localStorage.setItem(key, JSON.stringify(v)); } catch { /* chế độ riêng tư */ } };

export function SideNav({ title, items, collapsed, onCollapse, onResizeStart }: { title: React.ReactNode; items: MenuItem[]; collapsed: boolean; onCollapse: (v: boolean) => void; onResizeStart?: (e: React.MouseEvent) => void }) {
  const location = useLocation();
  const { isPinned, toggle: togglePin } = usePins();
  const [open, setOpen] = useState<string[]>(() => read<string[]>(OPEN_KEY, ['nghiep-vu']));
  const active = (path?: string) => Boolean(path && (path === '/' ? location.pathname === '/' : location.pathname === path || location.pathname.startsWith(`${path}/`)));

  // Mở sẵn nhóm chứa màn đang xem.
  useEffect(() => {
    const g = items.find((m) => m.children?.some((c) => active(c.path)));
    if (g && !open.includes(g.key)) setOpen((x) => [...x, g.key]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.pathname]);
  useEffect(() => write(OPEN_KEY, open), [open]);
  // Đổi sang phân hệ chưa mở nhóm nào: mở sẵn mọi nhóm của phân hệ đó.
  const groupKeys = items.filter((m) => m.children?.length).map((m) => m.key).join(',');
  useEffect(() => {
    const keys = groupKeys ? groupKeys.split(',') : [];
    if (keys.length && !keys.some((k) => open.includes(k))) setOpen((x) => [...x, ...keys]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [groupKeys]);

  const toggle = (key: string) => setOpen((x) => (x.includes(key) ? x.filter((k) => k !== key) : [...x, key]));

  if (collapsed) {
    return (
      <aside className="sidenav collapsed" aria-label="Menu chức năng">
        <button className="sidenav-toggle" title="Mở menu" onClick={() => onCollapse(false)}><PanelLeftOpen size={18} /></button>
      </aside>
    );
  }

  return (
    <aside className="sidenav" aria-label="Menu chức năng">
      {/* Nút thu gọn ở trên cùng (cạnh tên phân hệ) — khỏi phải kéo xuống đáy; nút "Thu gọn" ở đáy vẫn giữ. Phím tắt: Ctrl + B. */}
      <div className="sidenav-title sidenav-title-row">{title}<button type="button" className="sidenav-top-toggle" title="Thu gọn menu (Ctrl + B) — bấm lại biểu tượng ở mép trái để mở" aria-label="Thu gọn menu" onClick={() => onCollapse(true)}><PanelLeftClose size={16} /></button></div>
      <nav className="sidenav-body">
        {items.map((m) =>
          m.children?.length ? (
            <div key={m.key} className={`sidenav-group ${open.includes(m.key) ? 'open' : ''}`}>
              <button className="sidenav-group-head" onClick={() => toggle(m.key)} aria-expanded={open.includes(m.key)}>
                {open.includes(m.key) ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                <span>{m.label}</span>
              </button>
              {open.includes(m.key) && (
                <div className="sidenav-items">
                  {m.children.map((c) =>
                    isSection(c) ? (
                      <div key={c.key} className="sidenav-section">{c.label}</div>
                    ) : c.path ? (
                      <NavLink key={c.key} to={c.path} end className={() => `${active(c.path) ? 'active' : ''} ${isPinned(c.key) ? 'pinned' : ''}`} title={c.code ? `${c.label} (${c.code})` : c.label}>
                        <span className="label">{c.label}</span>
                        {c.code && <span className="code">{c.code}</span>}
                        <button
                          type="button"
                          className="pin-btn"
                          title={isPinned(c.key) ? 'Bỏ ghim khỏi thanh trên cùng' : 'Ghim lên thanh trên cùng (màn hay dùng)'}
                          onClick={(e) => { e.preventDefault(); e.stopPropagation(); togglePin(c.key); }}
                        >
                          {isPinned(c.key) ? <PinOff size={13} /> : <Pin size={13} />}
                        </button>
                      </NavLink>
                    ) : (
                      <span key={c.key} className="disabled" title="Chức năng này chưa có trong phiên bản hiện tại">
                        <span className="label">{c.label}</span>
                        <span className="code">chưa có</span>
                      </span>
                    ),
                  )}
                </div>
              )}
            </div>
          ) : (
            <NavLink key={m.key} to={m.path ?? '/'} end className={() => `sidenav-top ${active(m.path) ? 'active' : ''}`}>{m.label}</NavLink>
          ),
        )}
      </nav>
      <button className="sidenav-toggle" title="Thu gọn menu" onClick={() => onCollapse(true)}><PanelLeftClose size={16} /> Thu gọn</button>
      {onResizeStart && <div className="sidenav-resize" onMouseDown={onResizeStart} title="Kéo để đổi bề rộng menu" />}
    </aside>
  );
}

const WIDTH_KEY = 'ketoan.sidenav.width';
export const sideNavWidth = {
  get: () => { const w = read<number>(WIDTH_KEY, 268); return w >= 200 && w <= 520 ? w : 268; },
  set: (v: number) => write(WIDTH_KEY, v),
};

export const sideNavCollapsed = {
  get: () => read<boolean>(COLLAPSED_KEY, false),
  set: (v: boolean) => write(COLLAPSED_KEY, v),
};
