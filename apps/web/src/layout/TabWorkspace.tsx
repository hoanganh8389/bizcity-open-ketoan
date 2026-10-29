/**
 * Vùng làm việc nhiều thẻ: mỗi màn mở thành một thẻ, chuyển qua lại vẫn giữ nguyên ô lọc, số liệu đang xem.
 *
 * Cách chạy: thẻ là một đường dẫn (pathname). Mở menu / bấm liên kết → đổi địa chỉ trên trình duyệt →
 * thẻ của đường dẫn đó được mở (chưa có thì thêm). Mọi thẻ đã mở cùng được dựng, thẻ không xem thì ẩn đi
 * (không dựng lại khi quay lại). Mỗi thẻ dựng bảng route với đường dẫn riêng của nó (<Routes location>),
 * nên các màn trong thẻ đọc đúng tham số của mình.
 *
 * Thao tác: bấm thẻ để chuyển; × hoặc bấm chuột giữa để đóng; chuột phải để đóng thẻ khác / đóng tất cả;
 * kéo thả thẻ sang vị trí khác để sắp xếp (vạch xanh báo chỗ thả; màn trong thẻ không dựng lại).
 * Danh sách thẻ được nhớ trong phiên (tải lại trang vẫn còn). Tối đa MAX_TABS thẻ: quá thì đóng thẻ cũ nhất.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { Routes, useLocation, useNavigate, useNavigationType } from 'react-router-dom';
import { X } from 'lucide-react';
import type { MenuItem } from '@ketoan/contracts';
import { pageRoutes } from '../pages';
import { inFrame } from '@/lib/auth';
import { MODULES } from './menu';

interface Tab { pathname: string; search: string; key: number }

const STORE_KEY = 'ketoan.tabs';
const MAX_TABS = 20;
let seq = 0;
/** Đường dẫn cũ đã gộp vào màn khác: không mở thẻ riêng, chuyển thẳng sang màn mới (giữ tham số ?mo, ?loai…). */
const ALIASES: Record<string, string> = { '/mua-hang/chung-tu': '/mua-hang/tong-hop', '/mua-hang/phieu-mua': '/mua-hang/tong-hop', '/mua-hang/tra-ncc': '/mua-hang/tong-hop' };

function loadTabs(): Tab[] {
  // Nhúng trong trang quản trị: mỗi khung một màn, không khôi phục thẻ (các khung dùng chung bộ nhớ phiên).
  if (inFrame) return [];
  try {
    const v = JSON.parse(sessionStorage.getItem(STORE_KEY) ?? '[]') as { pathname: string; search: string }[];
    return Array.isArray(v) ? v.filter((t) => typeof t.pathname === 'string').map((t) => ({ pathname: ALIASES[t.pathname] ?? t.pathname, search: t.search ?? '', key: ++seq })).filter((t, i, a) => a.findIndex((x) => x.pathname === t.pathname) === i) : [];
  } catch {
    return [];
  }
}

export function TabWorkspace({ menu }: { menu: MenuItem[] }) {
  const location = useLocation();
  const navType = useNavigationType();
  const navigate = useNavigate();
  const [tabs, setTabs] = useState<Tab[]>(loadTabs);
  const [menuAt, setMenuAt] = useState<{ x: number; y: number; pathname: string } | null>(null);
  const barRef = useRef<HTMLDivElement>(null);
  // Kéo thả sắp xếp thẻ: thẻ đang kéo và chỗ thả (trước / sau thẻ nào).
  const [dragging, setDragging] = useState<string | null>(null);
  const [dropAt, setDropAt] = useState<{ pathname: string; after: boolean } | null>(null);
  const moveTab = (from: string, to: string, after: boolean) => {
    if (from === to) return;
    setTabs((list) => {
      const moving = list.find((t) => t.pathname === from);
      if (!moving) return list;
      const rest = list.filter((t) => t.pathname !== from);
      const idx = rest.findIndex((t) => t.pathname === to);
      if (idx < 0) return list;
      rest.splice(after ? idx + 1 : idx, 0, moving);
      return rest;
    });
  };
  const endDrag = () => { setDragging(null); setDropAt(null); };

  // Tên thẻ: tên chức năng trên menu, kèm mã.
  const titles = useMemo(() => {
    const m = new Map<string, { label: string; code?: string }>([['/', { label: 'Tổng quan' }], ...MODULES.map((x) => [`/app/${x.key}`, { label: x.label }] as [string, { label: string }])]);
    for (const g of menu) for (const c of g.children ?? []) if (c.path && !m.has(c.path)) m.set(c.path, { label: c.label, code: c.code });
    return m;
  }, [menu]);

  // Đổi địa chỉ → mở / chọn thẻ tương ứng.
  useEffect(() => {
    const { pathname, search } = location;
    if (ALIASES[pathname]) { navigate(ALIASES[pathname] + search, { replace: true, state: { alias: true } }); return; }
    const aliased = Boolean((location.state as { alias?: boolean } | null)?.alias);
    setTabs((list) => {
      const found = list.find((t) => t.pathname === pathname);
      if (found) {
        // Cùng màn nhưng tham số khác (ví dụ bấm từ tổng hợp công nợ sang sổ chi tiết của một khách): dựng lại thẻ.
        // Cùng tham số nhưng là BẤM LIÊN KẾT (không phải bấm chuyển thẻ) — vd lần 2 bấm "Đơn đặt hàng" ở hồ sơ NCC (?moi=order&ncc=…):
        // cũng dựng lại để màn chạy lại lệnh trong liên kết (mở phiếu mới…). Chuyển thẻ (state.tab) thì giữ nguyên màn.
        const relink = navType !== 'REPLACE' && found.search === search && Boolean(search) && !(location.state as { tab?: boolean } | null)?.tab;
        // Trang tự ghi trạng thái lên địa chỉ (navigate replace, vd thẻ con ?the=…): chỉ nhớ đường dẫn, KHÔNG dựng lại trang.
        if (aliased) return list.map((t) => (t === found ? { ...t, search, key: ++seq } : t)); // đến từ liên kết cũ: chạy lại lệnh trong liên kết
        if (navType === 'REPLACE' && found.search !== search) return list.map((t) => (t === found ? { ...t, search } : t));
        return found.search === search && !relink ? list : list.map((t) => (t === found ? { ...t, search, key: ++seq } : t));
      }
      let next = [...list, { pathname, search, key: ++seq }];
      if (next.length > MAX_TABS) next = next.filter((t, i) => i !== next.findIndex((x) => x.pathname !== pathname));
      return next;
    });
  }, [location]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (inFrame) return;
    try { sessionStorage.setItem(STORE_KEY, JSON.stringify(tabs.map(({ pathname, search }) => ({ pathname, search })))); } catch { /* chế độ riêng tư */ }
  }, [tabs]);

  // Cuộn thẻ đang xem vào tầm nhìn.
  useEffect(() => {
    barRef.current?.querySelector('.ws-tab.active')?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }, [location.pathname, tabs.length]);

  useEffect(() => {
    if (!menuAt) return;
    const close = () => setMenuAt(null);
    window.addEventListener('click', close);
    window.addEventListener('scroll', close, true);
    return () => { window.removeEventListener('click', close); window.removeEventListener('scroll', close, true); };
  }, [menuAt]);

  const open = (t: Tab) => navigate(t.pathname + t.search, { state: { tab: true } });
  const closeTabs = (keep: (t: Tab) => boolean) => {
    const rest = tabs.filter(keep);
    setTabs(rest);
    if (!rest.some((t) => t.pathname === location.pathname)) {
      // Đóng thẻ đang xem: chuyển sang thẻ bên phải, không có thì bên trái, không còn thẻ nào thì về Tổng quan.
      const idx = tabs.findIndex((t) => t.pathname === location.pathname);
      const target = rest[Math.min(idx, rest.length - 1)];
      navigate(target ? target.pathname + target.search : '/', { state: { tab: true } });
    }
  };
  const close = (pathname: string) => closeTabs((t) => t.pathname !== pathname);

  return (
    <div className="workspace">
      <div className="ws-tabs" ref={barRef} role="tablist">
        {tabs.map((t) => {
          // Trang con (vd hồ sơ NCC /mua-hang/nha-cung-cap/NC100227): tên mục menu cha gần nhất + phần đuôi.
          const parent = titles.get(t.pathname) ? undefined : [...titles.keys()].filter((k) => k !== '/' && t.pathname.startsWith(`${k}/`)).sort((x, y) => y.length - x.length)[0];
          const info = titles.get(t.pathname) ?? (parent ? { label: `${titles.get(parent)!.label} · ${decodeURIComponent(t.pathname.slice(parent.length + 1))}`, code: titles.get(parent)!.code } : undefined);
          const active = t.pathname === location.pathname;
          return (
            <div
              key={t.pathname}
              role="tab"
              aria-selected={active}
              className={`ws-tab ${active ? 'active' : ''}${dragging === t.pathname ? ' dragging' : ''}${dropAt?.pathname === t.pathname && dragging !== t.pathname ? (dropAt.after ? ' drop-after' : ' drop-before') : ''}`}
              draggable
              onDragStart={(e) => { setDragging(t.pathname); e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', t.pathname); }}
              onDragOver={(e) => {
                if (!dragging) return;
                e.preventDefault();
                e.dataTransfer.dropEffect = 'move';
                const b = (e.currentTarget as HTMLElement).getBoundingClientRect();
                const after = e.clientX > b.left + b.width / 2;
                if (dropAt?.pathname !== t.pathname || dropAt.after !== after) setDropAt({ pathname: t.pathname, after });
              }}
              onDrop={(e) => { e.preventDefault(); if (dragging && dropAt) moveTab(dragging, dropAt.pathname, dropAt.after); endDrag(); }}
              onDragEnd={endDrag}
              title={info?.code ? `${info.label} (${info.code})` : info?.label ?? t.pathname}
              onClick={() => open(t)}
              onMouseDown={(e) => { if (e.button === 1) { e.preventDefault(); close(t.pathname); } }}
              onContextMenu={(e) => { e.preventDefault(); setMenuAt({ x: e.clientX, y: e.clientY, pathname: t.pathname }); }}
            >
              <span className="ws-tab-label">{info?.label ?? t.pathname}</span>
              {info?.code && <span className="ws-tab-code">{info.code}</span>}
              <button className="ws-tab-close" title="Đóng thẻ" onClick={(e) => { e.stopPropagation(); close(t.pathname); }}><X size={13} /></button>
            </div>
          );
        })}
        {/* Đóng nhanh: giữ lại thẻ đang xem, đóng mọi thẻ khác — luôn nằm ở cuối dải thẻ (dính bên phải khi dải dài), không hỏi lại. */}
        {tabs.length > 1 && (
          <button type="button" className="ws-close-others" title="Đóng tất cả thẻ khác, chỉ giữ thẻ đang xem"
            onClick={() => closeTabs((t) => t.pathname === location.pathname)}><X size={13} /> Đóng thẻ khác</button>
        )}
      </div>
      {tabs.map((t) => (
        <div key={t.key} className="ws-panel" hidden={t.pathname !== location.pathname}>
          <Routes location={{ pathname: t.pathname, search: t.search, hash: '', state: null, key: String(t.key) }}>{pageRoutes}</Routes>
        </div>
      ))}
      {menuAt && (
        <div className="ws-menu" style={{ left: menuAt.x, top: menuAt.y }} onClick={(e) => e.stopPropagation()}>
          <button onClick={() => { close(menuAt.pathname); setMenuAt(null); }}>Đóng thẻ này</button>
          <button onClick={() => { const p = menuAt.pathname; closeTabs((t) => t.pathname === p); setMenuAt(null); }}>Đóng các thẻ khác</button>
          <button onClick={() => { closeTabs(() => false); setMenuAt(null); }}>Đóng tất cả</button>
        </div>
      )}
    </div>
  );
}
