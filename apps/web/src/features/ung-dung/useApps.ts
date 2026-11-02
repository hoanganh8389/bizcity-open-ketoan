/**
 * App ngoài tiến trình cài trong bản này + trạng thái kết nối của đơn vị (GET /api/v1/apps, ADR-0011 mức 2).
 * Dùng chung cho menu (app đã bật có giao diện → mục ở nhóm Tiện ích), trang Ứng dụng kết nối và trang nhúng app.
 */
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';

export interface AppDto {
  key: string;
  id: string;
  label: string;
  description: string;
  version: string;
  icon: string | null;
  scopes: string[];
  events: string[];
  webhook: boolean;
  ui: { origin: string; entry: string } | null;
  installation: {
    status: 'active' | 'disabled';
    appVersion: string;
    permissions: string[];
    events: string[];
    installedAt: string;
    scopeChanged: boolean;
  } | null;
}

export function useApps(enabled = true) {
  return useQuery({ queryKey: ['apps'], queryFn: () => api.get<AppDto[]>('/api/v1/apps'), staleTime: 300_000, enabled, retry: false });
}

/** Nhãn tiếng Việt của phạm vi quyền app xin (APP_SCOPES phía máy chủ). */
export const SCOPE_LABELS: Record<string, string> = {
  'documents:write': 'Nộp chứng từ vào sổ (chỉ chứng từ của app)',
  'documents:read': 'Xem chứng từ',
  'catalog:read': 'Xem danh mục (hàng, đối tượng, chi nhánh)',
  'catalog:write': 'Thêm / sửa danh mục',
  'ledger:read': 'Xem sổ sách',
  'reports:read': 'Xem báo cáo',
};
