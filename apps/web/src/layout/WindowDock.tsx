/**
 * THANH CỬA SỔ DƯỚI ĐÁY (như thanh tác vụ) — mọi hộp thoại (Modal, phiếu mua hàng, phiếu thu chi…) thu nhỏ được xuống đây:
 *   - nút "—" cạnh ✕ trên hộp thoại: ẩn hộp thoại nhưng GIỮ NGUYÊN mọi thứ đang gõ (component vẫn dựng, chỉ ẩn);
 *   - mỗi hộp thoại một ô: tên phiếu, chấm cam = chưa lưu; bấm ô = mở lại đúng chỗ đang dở (tự chuyển sang thẻ chứa nó);
 *     bấm ô đang mở = thu nhỏ; × trên ô = đóng như bấm ✕;
 *   - ô "Màn chính" luôn ở đầu: thu nhỏ hết hộp thoại đang mở, quay về màn đang làm;
 *   - nút "Đóng tất cả" ở cuối và chuột phải vào ô (đóng ô này / các ô khác / tất cả, thu nhỏ tất cả); có phiếu chưa lưu thì hỏi lại.
 * Thanh chỉ hiện khi có ít nhất một hộp thoại (không chiếm chỗ khi không cần). Hộp thoại lồng trong hộp thoại khác (vd sửa
 * ĐVT mở từ phiếu) không tạo ô riêng — đi theo hộp thoại cha. Mở lại một hộp thoại thì hộp thoại khác cùng thẻ tự thu nhỏ.
 */
import { createContext, useCallback, useContext, useEffect, useId, useRef, useState, useSyncExternalStore, type ReactNode } from 'react';
import { useInRouterContext, useLocation, useNavigate } from 'react-router-dom';
import { Home, Minus, X, XCircle } from 'lucide-react';

interface Win { id: string; key?: string; label: string; tab: string; minimized: boolean; dirty: boolean; order: number; minimize: () => void; restore: () => void; close: () => void }

let wins: Win[] = [];
let order = 0;
const subs = new Set<() => void>();
const emit = () => { wins = [...wins]; subs.forEach((f) => f()); };
const subscribe = (f: () => void) => { subs.add(f); return () => subs.delete(f); };
const snapshot = () => wins;
const here = () => `${window.location.pathname}`;

/** Đặt bởi hộp thoại cha: hộp thoại con biết mình đang lồng nên không tạo ô riêng. */
const InWindow = createContext(false);
export function DockScope({ children }: { children: ReactNode }) { return <InWindow.Provider value>{children}</InWindow.Provider>; }

/**
 * Gắn vào một hộp thoại. headRef = phần tiêu đề (lấy chữ làm tên ô). Trả về minimized (ẩn hộp thoại bằng CSS, KHÔNG gỡ),
 * minimize (cho nút "—"), top (hộp thoại cấp ngoài cùng — chỉ nó có nút thu nhỏ).
 */
export function useDockWindow(onClose: () => void, dirty = false, key?: string) {
  const nested = useContext(InWindow);
  const routed = useInRouterContext();
  return useDockInner(onClose, dirty, !nested && routed, key);
}

/** Mở lại hộp thoại theo khoá (vd `mh:<id phiếu>`) — bấm mở một phiếu đang mở (đã thu nhỏ) thì đưa nó lên, không mở trùng. */
export function restoreDock(key: string) { wins.find((w) => w.key === key)?.restore(); }

/** Chữ của tiêu đề, các phần cách nhau một dấu cách (nhãn "Nháp", "Nhập ngoài đơn" không dính vào nhau); bỏ chữ của nút. */
function textOf(el: Node): string {
  if (el.nodeType === Node.TEXT_NODE) return el.textContent ?? '';
  if (el instanceof HTMLElement && (el.tagName === 'BUTTON' || el.classList.contains('modal-viewing'))) return '';
  return [...el.childNodes].map(textOf).join(' ');
}

function useDockInner(onClose: () => void, dirty: boolean, top: boolean, key?: string) {
  const id = useId();
  const [minimized, setMin] = useState(false);
  const headRef = useRef<HTMLElement | null>(null);
  const loc = useLocationSafe(top);
  const nav = useNavigateSafe(top);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  const tab = loc ? `${loc.pathname}${loc.search}` : here();
  const restore = useCallback(() => {
    // Hộp thoại khác đang mở cùng thẻ: thu nhỏ để không chồng lên nhau.
    for (const w of wins) if (w.id !== id && !w.minimized && w.tab.split('?')[0] === tab.split('?')[0]) w.minimize();
    if (nav && here() !== tab.split('?')[0]) nav(tab);
    setMin(false);
  }, [id, nav, tab]);
  useEffect(() => {
    if (!top) return;
    // Hộp thoại mới mở: hộp thoại khác đang mở cùng thẻ tự thu nhỏ (không chồng lên nhau).
    for (const w of wins) if (!w.minimized && w.tab.split('?')[0] === tab.split('?')[0]) w.minimize();
    wins.push({ id, key, label: '', tab, minimized: false, dirty, order: ++order, minimize: () => setMin(true), restore, close: () => closeRef.current() });
    emit();
    return () => { wins = wins.filter((w) => w.id !== id); emit(); };
  }, [top, id]); // eslint-disable-line react-hooks/exhaustive-deps
  // Cập nhật tên, trạng thái mỗi lần vẽ (chỉ báo khi có đổi).
  useEffect(() => {
    if (!top) return;
    const w = wins.find((x) => x.id === id);
    if (!w) return;
    const label = (headRef.current ? textOf(headRef.current) : '').replace(/\s+/g, ' ').trim().slice(0, 70) || 'Hộp thoại';
    if (w.label !== label || w.minimized !== minimized || w.dirty !== dirty || w.tab !== tab || w.restore !== restore) {
      Object.assign(w, { label, minimized, dirty, tab, restore });
      emit();
    }
  });
  return { minimized: top && minimized, minimize: () => setMin(true), headRef, top };
}
function useLocationSafe(on: boolean) { try { return on ? useLocation() : null; } catch { return null; } } // eslint-disable-line react-hooks/rules-of-hooks
function useNavigateSafe(on: boolean) { try { return on ? useNavigate() : null; } catch { return null; } } // eslint-disable-line react-hooks/rules-of-hooks

/** Nút "—" đặt cạnh nút ✕ ở tiêu đề hộp thoại. */
export function MinimizeButton({ onClick }: { onClick: () => void }) {
  return <button type="button" className="win-min" data-view-ok onClick={onClick} aria-label="Thu nhỏ" title="Thu nhỏ xuống thanh dưới — giữ nguyên dữ liệu đang nhập, bấm ô ở thanh dưới để mở lại"><Minus size={15} /></button>;
}

/** Thanh dưới đáy — đặt một lần ở khung trang. */
export function WindowDock() {
  const list = useSyncExternalStore(subscribe, snapshot);
  const [, force] = useState(0);
  const [menu, setMenu] = useState<{ x: number; y: number; id?: string } | null>(null);
  useEffect(() => {
    if (!menu) return;
    const off = () => setMenu(null);
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') setMenu(null); };
    window.addEventListener('click', off); window.addEventListener('keydown', esc);
    return () => { window.removeEventListener('click', off); window.removeEventListener('keydown', esc); };
  }, [menu]);
  // Đổi thẻ (đường dẫn) → vẽ lại để tô đúng ô thuộc thẻ đang xem.
  useEffect(() => { const f = () => force((n) => n + 1); window.addEventListener('popstate', f); const t = setInterval(f, 800); return () => { window.removeEventListener('popstate', f); clearInterval(t); }; }, []);
  useEffect(() => { document.body.classList.toggle('has-dock', list.length > 0); return () => document.body.classList.remove('has-dock'); }, [list.length]);
  if (!list.length) return null;
  const cur = here();
  const open = list.filter((w) => !w.minimized && w.tab.split('?')[0] === cur);
  /** Đóng nhiều hộp thoại một lượt; có phiếu chưa lưu thì hỏi lại một lần. */
  const closeMany = (ws: Win[]) => {
    const dirty = ws.filter((w) => w.dirty);
    if (dirty.length && !window.confirm(`${dirty.length} hộp thoại có thay đổi CHƯA LƯU:\n${dirty.map((w) => `• ${w.label}`).join('\n')}\n\nĐóng sẽ mất các thay đổi đó. Vẫn đóng ${ws.length} hộp thoại?`)) return;
    ws.forEach((w) => w.close());
    setMenu(null);
  };
  const ctx = (e: React.MouseEvent, id?: string) => { e.preventDefault(); setMenu({ x: Math.min(e.clientX, window.innerWidth - 230), y: e.clientY, id }); };
  const target = menu?.id ? list.find((w) => w.id === menu.id) : undefined;
  return (
    <nav className="win-dock" aria-label="Hộp thoại đang mở" onContextMenu={(e) => ctx(e)}>
      <button type="button" className={`win-chip win-home${open.length ? '' : ' on'}`} title="Về màn chính: thu nhỏ mọi hộp thoại đang mở (không mất dữ liệu)" onClick={() => open.forEach((w) => w.minimize())}>
        <Home size={14} /> Màn chính
      </button>
      <span className="win-sep" />
      {[...list].sort((a, b) => a.order - b.order).map((w) => {
        const active = !w.minimized && w.tab.split('?')[0] === cur;
        return (
          <span key={w.id} className={`win-chip${active ? ' on' : ''}${w.minimized ? ' min' : ''}`} title={`${w.label}${w.dirty ? ' — chưa lưu' : ''}\n${active ? 'Bấm để thu nhỏ' : 'Bấm để mở lại'}${w.tab.split('?')[0] !== cur ? ' (ở thẻ khác)' : ''}`}
            onClick={() => (active ? w.minimize() : w.restore())} onContextMenu={(e) => { e.stopPropagation(); ctx(e, w.id); }} role="button" tabIndex={0} onKeyDown={(e) => { if (e.key === 'Enter') (active ? w.minimize() : w.restore()); }}>
            {w.dirty && <i className="win-dirty" aria-label="chưa lưu" />}
            <span className="win-label">{w.label}</span>
            <button type="button" className="win-close" title="Đóng hộp thoại này" onClick={(e) => { e.stopPropagation(); w.close(); }}><X size={12} /></button>
          </span>
        );
      })}
      <button type="button" className="win-chip win-closeall" title="Đóng tất cả hộp thoại (có phiếu chưa lưu thì hỏi lại). Chuột phải vào ô để có thêm lựa chọn" onClick={() => closeMany(list)}>
        <XCircle size={14} /> Đóng tất cả
      </button>
      {menu && (
        <div className="ctx-menu win-ctx" style={{ left: menu.x, bottom: 'calc(var(--dock-h) + 4px)' }} onClick={(e) => e.stopPropagation()} onContextMenu={(e) => e.preventDefault()}>
          {target && <>
            <div className="ctx-h">{target.label}{target.dirty ? ' · chưa lưu' : ''}</div>
            <button type="button" onClick={() => { (!target.minimized && target.tab.split('?')[0] === cur ? target.minimize() : target.restore()); setMenu(null); }}>{!target.minimized && target.tab.split('?')[0] === cur ? 'Thu nhỏ' : 'Mở lại'}</button>
            <button type="button" className="danger" onClick={() => closeMany([target])}>Đóng ô này</button>
            {list.length > 1 && <button type="button" className="danger" onClick={() => closeMany(list.filter((w) => w.id !== target.id))}>Đóng các ô khác ({list.length - 1})</button>}
            <hr />
          </>}
          <button type="button" onClick={() => { list.forEach((w) => !w.minimized && w.minimize()); setMenu(null); }}>Thu nhỏ tất cả — về màn chính</button>
          <button type="button" className="danger" onClick={() => closeMany(list)}>Đóng tất cả ({list.length})</button>
        </div>
      )}
    </nav>
  );
}
