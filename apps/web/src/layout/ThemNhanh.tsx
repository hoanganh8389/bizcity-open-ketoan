// [2026-11-11 Nguyễn Văn Thủy] MENU — nút Thêm nhanh và mục Hay dùng ở đầu menu trái (đóng góp)
/**
 * Đầu menu trái:
 *  - Nút **Thêm nhanh**: bấm hiện bảng các chứng từ / danh mục hay lập, chia theo nhóm việc (lib/themNhanh.ts). Bấm một mục là
 *    mở màn đó với form thêm mới bật sẵn. Mục người dùng không có quyền mở màn thì không hiện.
 *  - Mục **Hay dùng**: màn đã ghim và màn mở nhiều (đếm trên máy), bấm để mở; nút "Ghim trang này" ghim / bỏ ghim màn đang xem.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Link, NavLink, useLocation } from 'react-router-dom';
import { ChevronDown, ChevronUp, Pin, PinOff, Plus, Star } from 'lucide-react';
import type { MenuItem } from '@ketoan/contracts';
import { THEM_NHANH } from '@/lib/themNhanh';
import { useHayDung } from './hay-dung';
import { usePins } from './pins';

const allowedPaths = (menu: MenuItem[]) => new Set(menu.flatMap((g) => [g, ...(g.children ?? [])]).map((m) => m.path?.split('?')[0]).filter(Boolean) as string[]);

export function NutThemNhanh({ menu, collapsed }: { menu: MenuItem[]; collapsed: boolean }) {
  const [at, setAt] = useState<{ top: number; left: number } | null>(null);
  const btn = useRef<HTMLButtonElement>(null);
  const pop = useRef<HTMLDivElement>(null);
  const { pathname, search } = useLocation();
  const groups = useMemo(() => {
    const ok = allowedPaths(menu);
    return THEM_NHANH.map((g) => ({ ...g, items: g.items.filter((i) => ok.has(i.base)) })).filter((g) => g.items.length);
  }, [menu]);
  useEffect(() => { setAt(null); }, [pathname, search]);
  useEffect(() => {
    if (!at) return;
    const onDown = (e: MouseEvent) => { const t = e.target as Node; if (!btn.current?.contains(t) && !pop.current?.contains(t)) setAt(null); };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setAt(null); };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('mousedown', onDown); document.removeEventListener('keydown', onKey); };
  }, [at]);
  if (!groups.length) return null;
  const toggle = () => {
    const r = btn.current?.getBoundingClientRect();
    if (!r) return;
    setAt((x) => (x ? null : { top: r.bottom + 6, left: r.left }));
  };
  return (
    <>
      <button ref={btn} type="button" className={`gd-them${at ? ' open' : ''}`} title="Thêm nhanh chứng từ, danh mục" aria-expanded={Boolean(at)} onClick={toggle}>
        <Plus size={16} />{!collapsed && <span>Thêm nhanh</span>}
      </button>
      {at && createPortal(
        <div ref={pop} className="gd-them-pop" style={{ top: at.top, left: at.left }} role="menu">
          {groups.map((g) => (
            <div key={g.label} className="gd-them-nhom">
              <div className="gd-them-head">{g.label}</div>
              {g.items.map((i) => <Link key={i.path} role="menuitem" to={i.path}>{i.label}</Link>)}
            </div>
          ))}
        </div>,
        document.body,
      )}
    </>
  );
}

const OPEN_KEY = 'ketoan.hay-dung.mo';

export function HayDungNav({ menu, collapsed }: { menu: MenuItem[]; collapsed: boolean }) {
  const list = useHayDung(menu).slice(0, 6);
  const { pathname } = useLocation();
  const { isPinned, toggle } = usePins();
  const [open, setOpen] = useState(() => { try { return localStorage.getItem(OPEN_KEY) !== '0'; } catch { return true; } });
  const flip = () => setOpen((v) => { try { localStorage.setItem(OPEN_KEY, v ? '0' : '1'); } catch { /* bỏ qua */ } return !v; });
  const current = menu.flatMap((g) => g.children ?? []).find((m) => m.path?.split('?')[0] === pathname);
  if (collapsed) return null;
  return (
    <div className="gd-hay">
      <div className="gd-nav-label"><button type="button" onClick={flip} title={open ? 'Thu mục Hay dùng' : 'Mở mục Hay dùng'}>Hay dùng {open ? <ChevronUp size={12} /> : <ChevronDown size={12} />}</button></div>
      {open && (
        <>
          {list.map((h) => (
            <NavLink key={h.item.key} to={h.item.path!} className="gd-hay-item" title={h.item.code ? `${h.item.label} (${h.item.code})` : h.item.label}>
              {h.pinned ? <Pin size={13} /> : <Star size={13} />}<span>{h.item.label}</span>
            </NavLink>
          ))}
          {!list.length && <div className="gd-hay-trong">Màn mở nhiều sẽ hiện ở đây</div>}
          {current && (
            <button type="button" className="gd-hay-ghim" onClick={() => toggle(current.key)} title={`${isPinned(current.key) ? 'Bỏ ghim' : 'Ghim'} ${current.label}`}>
              {isPinned(current.key) ? <><PinOff size={13} /> Bỏ ghim trang này</> : <><Pin size={13} /> Hay dùng trang này</>}
            </button>
          )}
        </>
      )}
      <div className="gd-nav-label">Phân hệ</div>
    </div>
  );
}
