// [2026-11-05 11:50 PM Nguyễn Văn Thủy] MENU — nhóm menu gọn theo quyền, phân hệ đang bật và màn đang mở (đóng góp)
import { useEffect, useMemo, useState } from 'react';
import { useLocation } from 'react-router-dom';
import type { MenuItem } from '@ketoan/contracts';
import { MODULES, moduleMenu } from './menu';
import { useEnabledModules } from './useAppMenu';
import { buildGon, groupOfPath, type GonGroup } from './menu-gon';

const KEY = 'ketoan.gon';
const read = () => { try { return localStorage.getItem(KEY) ?? undefined; } catch { return undefined; } };

/** Nhóm menu người dùng được thấy: chỉ màn thuộc phân hệ đang bật. */
export function useGonGroups(menu: MenuItem[]): GonGroup[] {
  const enabled = useEnabledModules();
  return useMemo(() => {
    const on = MODULES.filter((m) => !enabled || enabled.has(m.key));
    const seen = new Set<string>();
    const visible = on.flatMap((m) => moduleMenu(menu, m.key)).filter((g) => !seen.has(g.key) && seen.add(g.key));
    return buildGon(visible, new Set(on.map((m) => m.key)));
  }, [menu, enabled]);
}

/** Nhóm đang làm việc: tự theo màn đang mở, nhớ theo máy để màn nằm ở nhiều nhóm không nhảy nhóm. */
export function useGon(menu: MenuItem[]) {
  const groups = useGonGroups(menu);
  const { pathname, search } = useLocation();
  const [current, setCurrent] = useState(read);
  const choose = (key: string) => { setCurrent(key); try { localStorage.setItem(KEY, key); } catch { /* chế độ riêng tư */ } };
  const active = groupOfPath(groups, pathname, search, current);
  useEffect(() => { if (active && active.key !== current) choose(active.key); }, [active?.key]); // eslint-disable-line react-hooks/exhaustive-deps
  return { groups, active, choose };
}
