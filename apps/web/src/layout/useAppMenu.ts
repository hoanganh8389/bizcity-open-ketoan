/**
 * Menu chức năng của người dùng hiện tại: menu lõi + mục add-in, bỏ mục không có quyền.
 * Dùng chung cho khung trang, trang Tổng quan, trang chủ phân hệ (react-query giữ đệm, gọi nhiều chỗ không tốn thêm).
 */
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { CORE_MENU, filterMenu, mergeAddInMenu, type AddInManifestDto } from './menu';
import { useApps, type AppDto } from '@/features/ung-dung/useApps';

export function useAddIns() {
  return useQuery({ queryKey: ['addins'], queryFn: () => api.get<AddInManifestDto[]>('/api/v1/system/addins'), staleTime: 300_000 }).data ?? [];
}

/**
 * App ngoài tiến trình (ADR-0011 mức 2) gắn vào nhóm Tiện ích như add-in: mục "Ứng dụng kết nối" khi bản cài có app,
 * và một mục cho mỗi app đang bật có giao diện nhúng (/ung-dung/<key>).
 */
export function appMenuEntries(apps: AppDto[]): AddInManifestDto[] {
  if (!apps.length) return [];
  return [
    { id: 'ung-dung', name: 'Ứng dụng kết nối', version: '1', description: '', menu: [{ key: 'ung-dung', label: 'Ứng dụng kết nối', path: '/tien-ich/ung-dung', code: 'TI13' }] },
    ...apps.filter((a) => a.ui && a.installation?.status === 'active').map((a) => ({
      id: `app-${a.key}`, name: a.label, version: a.version, description: a.description,
      menu: [{ key: `app-${a.key}`, label: a.label, path: `/ung-dung/${a.key}` }],
    })),
  ];
}

export function useAppMenu() {
  const { can } = useAuth();
  const apps = useApps().data ?? [];
  return filterMenu(mergeAddInMenu(CORE_MENU, [...useAddIns(), ...appMenuEntries(apps)]), can);
}

/** Mã phân hệ máy chủ đang bật (ENABLED_MODULES); null khi chưa biết / máy chủ bản cũ → coi như bật hết. */
export function useEnabledModules(): Set<string> | null {
  const q = useQuery({ queryKey: ['enabled-modules'], queryFn: () => api.get<string[]>('/api/v1/system/modules'), staleTime: 300_000, retry: false });
  if (!q.data) return null;
  // Phân hệ chỉ có ở giao diện (không có phần máy chủ riêng) đi theo phân hệ máy chủ nó dựa vào: Danh mục ← Kế toán.
  const on = new Set(q.data);
  if (on.has('ke-toan')) on.add('danh-muc');
  return on;
}
