/**
 * Menu trên điện thoại / máy tính bảng dọc (màn ≤ 900px): nút ☰ ở thanh trên mở khung trượt từ bên trái, gồm mọi
 * phân hệ (Kế toán, Quỹ, Bán hàng…) → nhóm → chức năng (kèm tiêu đề mục con). Bấm chức năng thì mở màn và đóng khung.
 * Trên màn rộng không hiện (dùng thanh phân hệ + menu trái như máy tính).
 */
import { useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { ChevronDown, ChevronRight, X } from 'lucide-react';
import type { MenuItem } from '@ketoan/contracts';
import { isSection, moduleMenu } from './menu';

export function MobileNav({ modules, current, menu, onChoose, onClose }: {
  modules: { key: string; label: string }[]; current: string; menu: MenuItem[]; onChoose: (key: string) => void; onClose: () => void;
}) {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const [mod, setMod] = useState(current);
  const [group, setGroup] = useState<string | null>(() => moduleMenu(menu, current).find((g) => g.children?.some((c) => c.path === pathname))?.key ?? null);
  const go = (moduleKey: string, path: string) => { onChoose(moduleKey); navigate(path); onClose(); };
  return (
    <>
      <div className="mnav-mask" onClick={onClose} />
      <nav className="mnav" aria-label="Menu">
        <div className="mnav-head">
          <b>Menu</b>
          <button type="button" className="btn btn-sm btn-ghost" onClick={onClose} aria-label="Đóng menu"><X size={18} /></button>
        </div>
        <div className="mnav-modules">
          {modules.map((m) => <button key={m.key} type="button" className={m.key === mod ? 'active' : ''} onClick={() => { setMod(m.key); setGroup(null); }}>{m.label}</button>)}
        </div>
        <div className="mnav-body">
          {moduleMenu(menu, mod).map((g) => (g.children?.length ? (
            <div key={g.key} className="mnav-group">
              <button type="button" className="mnav-group-head" onClick={() => setGroup((x) => (x === g.key ? null : g.key))}>
                {group === g.key ? <ChevronDown size={15} /> : <ChevronRight size={15} />}<span>{g.label}</span>
              </button>
              {group === g.key && g.children.map((c) => (isSection(c) ? <div key={c.key} className="mnav-section">{c.label}</div>
                : c.path ? (
                  <button key={c.key} type="button" className={`mnav-item ${pathname === c.path ? 'active' : ''}`} onClick={() => go(mod, c.path!)}>
                    <span>{c.label}</span>{c.code && <small>{c.code}</small>}
                  </button>
                ) : <div key={c.key} className="mnav-item disabled"><span>{c.label}</span><small>chưa có</small></div>))}
            </div>
          ) : g.path ? (
            <button key={g.key} type="button" className={`mnav-item top ${pathname === g.path ? 'active' : ''}`} onClick={() => go(mod, g.path!)}><span>{g.label}</span></button>
          ) : null))}
        </div>
      </nav>
    </>
  );
}
