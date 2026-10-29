/**
 * Menu chức năng của người dùng hiện tại: menu lõi + mục add-in, bỏ mục không có quyền.
 * Dùng chung cho khung trang, trang Tổng quan, trang chủ phân hệ (react-query giữ đệm, gọi nhiều chỗ không tốn thêm).
 */
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { CORE_MENU, filterMenu, mergeAddInMenu, type AddInManifestDto } from './menu';

export function useAddIns() {
  return useQuery({ queryKey: ['addins'], queryFn: () => api.get<AddInManifestDto[]>('/api/v1/system/addins'), staleTime: 300_000 }).data ?? [];
}

export function useAppMenu() {
  const { can } = useAuth();
  return filterMenu(mergeAddInMenu(CORE_MENU, useAddIns()), can);
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
