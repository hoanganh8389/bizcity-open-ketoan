/**
 * Thanh phân hệ trên cùng: nút "Tất cả phân hệ" (về trang Tổng quan — lưới ứng dụng) + các phân hệ (Kế toán, Quỹ, Mua hàng,
 * Bán hàng, Kho, Tài sản, Thuế, Hệ thống). Phân hệ khai topBar: false (Quỹ, Tài sản, Thuế, API) chỉ mở từ trang Tổng quan,
 * chỉ hiện trên thanh khi đang ở trong phân hệ đó. Bấm một phân hệ → trang chủ phân hệ (/app/<key>), menu chức năng của phân hệ
 * hiện ở thanh bên trái.
 * Mở một màn (từ ô tìm chức năng, thẻ, liên kết) thì tự chuyển sang phân hệ chứa màn đó (phân hệ đang chọn được ưu tiên
 * nếu cũng chứa màn đó). Phân hệ đang chọn nhớ theo máy.
 */
import { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { LayoutGrid } from 'lucide-react';
import type { MenuItem } from '@ketoan/contracts';
import { MODULES, moduleMenu, moduleOfPath, type AppModule } from './menu';
import { ModuleIcon } from '../phan-he/icons';
import { useEnabledModules } from './useAppMenu';

const KEY = 'ketoan.module';
const readModule = () => { try { return localStorage.getItem(KEY) ?? MODULES[0]!.key; } catch { return MODULES[0]!.key; } };
/** Mã phân hệ trong đường dẫn trang chủ phân hệ /app/<key>. */
export const moduleOfAppPath = (pathname: string) => /^\/app\/([^/?#]+)/.exec(pathname)?.[1];

/** Phân hệ đang chọn: nhớ theo máy, tự theo màn đang mở. Chỉ các phân hệ người dùng có ít nhất một chức năng. */
export function useActiveModule(menu: MenuItem[]) {
  const { pathname } = useLocation();
  const [active, setActive] = useState(readModule);
  const choose = (key: string) => { setActive(key); try { localStorage.setItem(KEY, key); } catch { /* bỏ qua */ } };
  useEffect(() => {
    const m = moduleOfAppPath(pathname) ?? moduleOfPath(menu, pathname, active);
    if (m && m !== active && MODULES.some((x) => x.key === m)) choose(m);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname]);
  const enabled = useEnabledModules();
  const visible = MODULES.filter((m) => moduleMenu(menu, m.key).length > 0 && (!enabled || enabled.has(m.key)));
  const current = visible.find((m) => m.key === active) ?? visible[0] ?? MODULES[0]!;
  return { modules: visible, current, choose, items: moduleMenu(menu, current.key) };
}

export function ModuleBar({ modules, current }: { modules: AppModule[]; current: string }) {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const home = pathname === '/';
  return (
    <nav className="module-bar" aria-label="Phân hệ">
      <button type="button" className={home ? 'active' : ''} onClick={() => navigate('/')} title="Tất cả phân hệ">
        <LayoutGrid size={15} />
      </button>
      {modules.filter((m) => m.topBar !== false || (!home && m.key === current)).map((m) => (
        <button key={m.key} type="button" className={!home && m.key === current ? 'active' : ''} onClick={() => navigate(`/app/${m.key}`)} title={m.description}>
          <ModuleIcon name={m.icon} size={14} /> {m.label}
        </button>
      ))}
    </nav>
  );
}
