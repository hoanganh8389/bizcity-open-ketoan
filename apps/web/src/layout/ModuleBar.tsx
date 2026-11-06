// [2026-11-05 11:50 PM Nguyễn Văn Thủy] MENU — bỏ thanh phân hệ trên cùng, giữ phân hệ đang chọn cho menu điện thoại
/**
 * Phân hệ đang chọn: tự theo màn đang mở, nhớ theo máy. Menu điện thoại dùng để mở đúng phân hệ.
 */
import { useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import type { MenuItem } from '@ketoan/contracts';
import { MODULES, moduleMenu, moduleOfPath } from './menu';
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
