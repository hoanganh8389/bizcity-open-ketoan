// [2026-11-13 Nguyễn Văn Thủy] menu điện thoại dùng đúng bộ nhóm của menu trái (Tiền mặt … Báo cáo), không còn bộ phân hệ cũ (đóng góp)
/**
 * Menu trên điện thoại / máy tính bảng dọc (màn ≤ 900px): nút ☰ ở thanh trên mở khung trượt từ bên trái.
 * Cùng một bố trí với menu trái của máy tính (menu-gon): Hay dùng, các nhóm Tiền mặt, Tiền gửi, Mua hàng… → mục con, Báo cáo.
 * Bấm một nhóm thì bung các mục; bấm mục thì mở màn và đóng khung. Trên màn rộng không hiện.
 */
import { useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { BarChart3, ChevronDown, ChevronRight, X } from 'lucide-react';
import type { MenuItem } from '@ketoan/contracts';
import { DANG_PHAT_TRIEN, matchHere, nhomHien, REPORT_PAGE, type GonGroup } from './menu-gon';
import { GonIcon } from './SideNav';
import { HayDungNav } from './ThemNhanh';

export function MobileNav({ menu, groups, active, onChoose, onClose }: {
  menu: MenuItem[]; groups: GonGroup[]; active?: GonGroup; onChoose: (key: string) => void; onClose: () => void;
}) {
  const navigate = useNavigate();
  const { pathname, search } = useLocation();
  const [open, setOpen] = useState<string | null>(active?.key ?? null);
  const go = (groupKey: string | null, path: string) => { if (groupKey) onChoose(groupKey); navigate(path); onClose(); };
  const here = (path?: string) => matchHere(path, pathname, search) > 0;
  return (
    <>
      <div className="mnav-mask" onClick={onClose} />
      <nav className="mnav" aria-label="Menu">
        <div className="mnav-head">
          <b>Menu</b>
          <button type="button" className="btn btn-sm btn-ghost" onClick={onClose} aria-label="Đóng menu"><X size={18} /></button>
        </div>
        <div className="mnav-body" onClick={(e) => { if ((e.target as HTMLElement).closest('a.gd-hay-item')) onClose(); }}>
          <HayDungNav menu={menu} collapsed={false} />
          {nhomHien(groups).map((g) => (
            <div key={g.key} className="mnav-group">
              <button type="button" className={`mnav-group-head${active?.key === g.key ? ' cur' : ''}`} onClick={() => setOpen((x) => (x === g.key ? null : g.key))}>
                {open === g.key ? <ChevronDown size={15} /> : <ChevronRight size={15} />}<GonIcon name={g.icon} size={16} /><span>{g.label}</span>
              </button>
              {open === g.key && (
                <>
                  <button type="button" className={`mnav-item ${pathname === g.home ? 'active' : ''}`} onClick={() => go(g.key, g.home)}><span>{g.homeLabel ?? 'Tổng quan'}</span></button>
                  {g.sections.map((s, i) => (
                    <div key={s.label ?? i}>
                      {s.label && <div className="mnav-section">{s.label}</div>}
                      {s.items.map((m) => (
                        <button key={m.key} type="button" className={`mnav-item ${here(m.path) ? 'active' : ''}`} onClick={() => go(g.key, m.path!)}>
                          <span>{m.label}</span>
                        </button>
                      ))}
                      {s.soon?.map((label) => <div key={label} className="mnav-item disabled"><span>{label}</span><small>{DANG_PHAT_TRIEN}</small></div>)}
                    </div>
                  ))}
                  {g.reports.length > 0 && <button type="button" className="mnav-item" onClick={() => go(g.key, `${REPORT_PAGE}?nhom=${g.key}`)}><span>Báo cáo</span></button>}
                </>
              )}
            </div>
          ))}
          <button type="button" className={`mnav-item top ${pathname === REPORT_PAGE ? 'active' : ''}`} onClick={() => go(null, REPORT_PAGE)}><BarChart3 size={16} /><span style={{ flex: 1 }}>Báo cáo</span></button>
        </div>
      </nav>
    </>
  );
}
