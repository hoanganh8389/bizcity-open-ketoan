// [2026-11-13 05:30 PM kiennt] PHAN-QUYEN — bản thử: menu / nút theo màn hình phân hệ đã đăng ký (GET /api/v1/man-hinh) và quyền của người dùng (đóng góp)
/**
 * Phân quyền theo màn × thao tác, đăng ký ĐỘNG ở phân hệ (apps/api/src/phan-he/man-hinh.ts). Giao diện không viết cứng quyền:
 *   const tt = useThaoTac('kho.chuyen-kho');   // { xem, them, sua, huy, nhan… } — true khi người dùng có quyền gác thao tác đó
 *   {tt.sua && <button>Sửa</button>}
 * Màn chưa đăng ký / chưa tải xong → mọi thao tác true (như cũ; máy chủ vẫn chặn).
 */
import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { MenuItem } from '@ketoan/contracts';
import { api } from './api';
import { useAuth } from './auth';

export interface ThaoTacDto { quyen: string; nhan: string; loai: 'xem' | 'ghi' | 'huy' | 'xuat' }
export interface ManHinhDto { key: string; ma: string; nhom: string; nhan: string; duongDan: string; thaoTac: Record<string, ThaoTacDto> }

export function useManHinh() {
  const { user } = useAuth();
  return useQuery({ queryKey: ['man-hinh'], queryFn: () => api.get<ManHinhDto[]>('/api/v1/man-hinh'), staleTime: 300_000, enabled: Boolean(user) });
}

/** Thao tác người dùng được làm ở màn `key`: { <thao tác>: boolean }. Truy cập thao tác chưa đăng ký → true. */
export function useThaoTac(key: string): Record<string, boolean> {
  const { can } = useAuth();
  const q = useManHinh();
  return useMemo(() => {
    const m = q.data?.find((x) => x.key === key);
    const out: Record<string, boolean> = {};
    for (const [k, t] of Object.entries(m?.thaoTac ?? {})) out[k] = can(t.quyen);
    return new Proxy(out, { get: (o, p: string) => (p in o ? o[p] : true) });
  }, [q.data, key, can]);
}

/** Gắn quyền "xem" của màn đã đăng ký (khớp mã màn) vào mục menu — filterMenu ẩn màn người dùng không được xem. */
export function ganQuyenXem(menu: MenuItem[], ds: ManHinhDto[] | undefined): MenuItem[] {
  if (!ds?.length) return menu;
  // Khớp theo đường dẫn màn (mã màn có thể trùng giữa màn gộp và màn lẻ, vd ACC51 "Thu, chi tiền" / "Phiếu thu").
  const xem = new Map(ds.filter((m) => m.thaoTac.xem).map((m) => [m.duongDan, m.thaoTac.xem!.quyen]));
  const walk = (items: MenuItem[]): MenuItem[] => items.map((m) => ({
    ...m,
    // Mục lọc sẵn của cùng màn (vd /mua-hang/tong-hop?loai=don-mua) theo quyền Xem của màn đó.
    ...(m.path && xem.has(m.path.split('?')[0]!) && !m.permission ? { permission: xem.get(m.path.split('?')[0]!) } : {}),
    ...(m.children ? { children: walk(m.children) } : {}),
  }));
  return walk(menu);
}
