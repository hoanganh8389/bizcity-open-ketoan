// [2026-11-06 02:10 AM Nguyễn Văn Thủy] MENU — nhớ màn hay mở trên máy để gợi ý ở Tổng quan (đóng góp)
/**
 * MÀN HAY DÙNG: màn đã ghim và màn mở nhiều. Số lần mở đếm trên trình duyệt theo người dùng, đổi máy thì đếm lại, không gửi đi đâu.
 */
import { useEffect, useMemo } from 'react';
import { useLocation } from 'react-router-dom';
import type { MenuItem } from '@ketoan/contracts';
import { useAuth } from '@/lib/auth';
import { usePins } from './pins';

const LIMIT = 8;
export interface HayDung { item: MenuItem; count: number; pinned: boolean }
const keyOf = (userId?: string) => `ketoan.hay-dung.${userId ?? 'guest'}`;
const read = (key: string): Record<string, number> => { try { return JSON.parse(localStorage.getItem(key) ?? '{}') as Record<string, number>; } catch { return {}; } };
const flat = (menu: MenuItem[]) => menu.flatMap((g) => g.children ?? []).filter((m) => m.path);

/** Gọi một lần ở khung trang: mỗi lần đổi màn thì cộng một lượt. */
export function useGhiHayDung(menu: MenuItem[]) {
  const { user } = useAuth();
  const { pathname } = useLocation();
  const paths = useMemo(() => new Set(flat(menu).map((m) => m.path!.split('?')[0])), [menu]);
  useEffect(() => {
    if (!paths.has(pathname)) return;
    const key = keyOf(user?.id);
    const counts = read(key);
    counts[pathname] = (counts[pathname] ?? 0) + 1;
    try { localStorage.setItem(key, JSON.stringify(counts)); } catch { /* chế độ riêng tư */ }
  }, [pathname, paths, user?.id]);
}

/** Màn đã ghim đứng trước, rồi tới màn mở nhiều nhất; chỉ gồm màn người dùng còn quyền xem. */
export function useHayDung(menu: MenuItem[]): HayDung[] {
  const { user } = useAuth();
  const { isPinned } = usePins();
  const counts = read(keyOf(user?.id));
  const seen = new Set<string>();
  return flat(menu)
    .map((item) => { const p = item.path!.split('?')[0]!; return { item, path: p, count: counts[p] ?? 0, pinned: isPinned(item.key) }; })
    .filter((x) => (x.count > 0 || x.pinned) && !seen.has(x.path) && Boolean(seen.add(x.path)))
    .sort((a, b) => Number(b.pinned) - Number(a.pinned) || b.count - a.count)
    .slice(0, LIMIT);
}
