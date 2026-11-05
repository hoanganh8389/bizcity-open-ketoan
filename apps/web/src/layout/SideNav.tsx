// [2026-11-05 11:50 PM Nguyễn Văn Thủy] MENU — menu trái gọn: nhóm theo việc, bấm mới bung danh sách màn (đóng góp)
/**
 * Thanh menu bên trái: mỗi nhóm một dòng có biểu tượng, bấm thì bung danh sách màn sang bên phải, bấm màn thì mở và đóng lại.
 *  - Báo cáo không nằm trong danh sách này, mỗi nhóm có một dòng Báo cáo dẫn tới trang Báo cáo chung.
 *  - Rê vào một màn có nút ghim; mã màn hiện ở chú thích, vẫn gõ mã tìm được bằng Ctrl + K.
 *  - Thu gọn (Ctrl + B) chỉ còn biểu tượng, bấm biểu tượng vẫn bung danh sách.
 */
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Link, NavLink, useLocation } from 'react-router-dom';
import { BarChart3, Building2, ChevronRight, Home, Landmark, LayoutGrid, List, ListEnd, Network, PanelLeftClose, PanelLeftOpen, Pin, PinOff, Scale, ShoppingBag, ShoppingCart, Wallet, Warehouse, Wrench, type LucideIcon } from 'lucide-react';
import { usePins } from './pins';
import { matchLen, REPORT_PAGE, type GonGroup } from './menu-gon';

const COLLAPSED_KEY = 'ketoan.sidenav.collapsed';
const read = <T,>(key: string, fallback: T): T => {
  try { return JSON.parse(localStorage.getItem(key) ?? 'null') ?? fallback; } catch { return fallback; }
};
const write = (key: string, v: unknown) => { try { localStorage.setItem(key, JSON.stringify(v)); } catch { /* chế độ riêng tư */ } };

const ICONS: Record<string, LucideIcon> = { Building2, Landmark, LayoutGrid, List, ListEnd, Network, Scale, ShoppingBag, ShoppingCart, Wallet, Warehouse, Wrench };

/** Số cột của danh sách bung theo số dòng, để danh mục dài không phải cuộn. */
const columnsOf = (g: GonGroup) => {
  const rows = g.sections.reduce((n, s) => n + s.items.length + (s.label ? 1 : 0), 0);
  return rows > 26 ? 3 : rows > 14 ? 2 : 1;
};

export function SideNav({ groups, active, onChoose, collapsed, onCollapse, onResizeStart }: { groups: GonGroup[]; active?: GonGroup; onChoose: (key: string) => void; collapsed: boolean; onCollapse: (v: boolean) => void; onResizeStart?: (e: React.MouseEvent) => void }) {
  const { pathname, search } = useLocation();
  const { isPinned, toggle: togglePin } = usePins();
  const [open, setOpen] = useState<{ key: string; top: number; left: number } | null>(null);
  const root = useRef<HTMLElement>(null);
  const fly = useRef<HTMLDivElement>(null);
  const best = active ? Math.max(0, ...active.sections.flatMap((s) => s.items.map((m) => matchLen(m.path, pathname)))) : 0;

  useEffect(() => { setOpen(null); }, [pathname, search]);
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => { const t = e.target as Node; if (!root.current?.contains(t) && !fly.current?.contains(t)) setOpen(null); };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(null); };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('mousedown', onDown); document.removeEventListener('keydown', onKey); };
  }, [open]);
  // Danh sách dài thì đẩy lên cho vừa đáy màn.
  useEffect(() => {
    if (!open || !fly.current) return;
    const over = fly.current.getBoundingClientRect().bottom - window.innerHeight + 8;
    if (over > 0) setOpen((o) => (o ? { ...o, top: Math.max(8, o.top - over) } : o));
  }, [open?.key]); // eslint-disable-line react-hooks/exhaustive-deps

  const toggle = (g: GonGroup, e: React.MouseEvent<HTMLButtonElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    setOpen((o) => (o?.key === g.key ? null : { key: g.key, top: r.top, left: r.right + 4 }));
  };
  const openGroup = groups.find((g) => g.key === open?.key);

  return (
    <aside className={`sidenav gon${collapsed ? ' collapsed' : ''}`} aria-label="Menu chức năng" ref={root}>
      <nav className="sidenav-body">
        <NavLink to="/" end className={() => `gon-row${pathname === '/' ? ' active' : ''}`} title="Tổng quan"><Home size={17} /><span>Tổng quan</span></NavLink>
        {groups.map((g) => {
          const Icon = ICONS[g.icon] ?? List;
          const isActive = active?.key === g.key && pathname !== REPORT_PAGE;
          return (
            <button key={g.key} type="button" className={`gon-row${isActive ? ' active' : ''}${open?.key === g.key ? ' open' : ''}`} title={g.label} aria-expanded={open?.key === g.key} onClick={(e) => toggle(g, e)}>
              <Icon size={17} /><span>{g.label}</span><ChevronRight size={14} className="gon-arrow" />
            </button>
          );
        })}
        <NavLink to={REPORT_PAGE} end className={() => `gon-row${pathname === REPORT_PAGE && !new URLSearchParams(search).get('nhom') ? ' active' : ''}`} title="Tất cả báo cáo, sổ sách"><BarChart3 size={17} /><span>Báo cáo</span></NavLink>
      </nav>
      <button className="sidenav-toggle" title={collapsed ? 'Mở rộng menu (Ctrl + B)' : 'Thu gọn menu (Ctrl + B)'} onClick={() => onCollapse(!collapsed)}>
        {collapsed ? <PanelLeftOpen size={16} /> : <><PanelLeftClose size={16} /> Thu gọn</>}
      </button>
      {!collapsed && onResizeStart && <div className="sidenav-resize" onMouseDown={onResizeStart} title="Kéo để đổi bề rộng menu" />}
      {/* Gắn thẳng vào body để không bị bảng, cột lọc của màn bên dưới đè lên. */}
      {open && openGroup && createPortal(
        <div ref={fly} className={`gon-fly cot-${columnsOf(openGroup)}`} style={{ top: open.top, left: open.left }}>
          <div className="gon-fly-body">
            {openGroup.home && <Link className="gon-fly-item" to={openGroup.home} onClick={() => onChoose(openGroup.key)}><span>{openGroup.homeLabel ?? 'Tổng quan'}</span></Link>}
            {openGroup.sections.map((s, i) => (
              <div key={s.label ?? i} className="gon-fly-sec">
                {s.label && <div className="gon-fly-head">{s.label}</div>}
                {s.items.map((m) => (
                  <Link key={m.key} to={m.path!} onClick={() => onChoose(openGroup.key)} title={m.code ? `${m.label} (${m.code})` : m.label} className={`gon-fly-item${active?.key === openGroup.key && best > 0 && matchLen(m.path, pathname) === best ? ' active' : ''}${isPinned(m.key) ? ' pinned' : ''}`}>
                    <span>{m.label}</span>
                    <button type="button" className="pin-btn" title={isPinned(m.key) ? 'Bỏ ghim khỏi thanh trên cùng' : 'Ghim lên thanh trên cùng (màn hay dùng)'} onClick={(e) => { e.preventDefault(); e.stopPropagation(); togglePin(m.key); }}>
                      {isPinned(m.key) ? <PinOff size={13} /> : <Pin size={13} />}
                    </button>
                  </Link>
                ))}
              </div>
            ))}
            {openGroup.soon?.map((label) => <span key={label} className="gon-fly-item disabled" title="Chức năng này chưa có trong phiên bản hiện tại"><span>{label}</span><small>chưa có</small></span>)}
            {openGroup.reports.length > 0 && <Link className="gon-fly-item gon-fly-report" to={`${REPORT_PAGE}?nhom=${openGroup.key}`} onClick={() => onChoose(openGroup.key)}><span>Báo cáo</span></Link>}
          </div>
        </div>,
        document.body,
      )}
    </aside>
  );
}

const WIDTH_KEY = 'ketoan.sidenav.width';
export const sideNavWidth = {
  get: () => { const w = read<number>(WIDTH_KEY, 224); return w >= 200 && w <= 520 ? w : 224; },
  set: (v: number) => write(WIDTH_KEY, v),
};

export const sideNavCollapsed = {
  get: () => read<boolean>(COLLAPSED_KEY, false),
  set: (v: boolean) => write(COLLAPSED_KEY, v),
};
