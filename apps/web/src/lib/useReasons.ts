// [2026-11-10 11:30 PM Nguyễn Văn Thủy] PHASE-026 — công tắc lý do hạch toán (bizcity.posting.use_reasons, mặc định tắt) (đóng góp)
/**
 * Công tắc "Dùng lý do hạch toán" của đơn vị (đổi ở Trung tâm cấu hình). Tắt (mặc định): định khoản không đọc tài khoản trên lý do,
 * giao diện ẩn ô / màn lý do. Bật: tài khoản trên lý do đè lên tài khoản ngầm định như phần mềm cũ.
 */
import { useQuery } from '@tanstack/react-query';
import { api } from './api';

export const USE_REASONS_KEY = 'bizcity.posting.use_reasons';

/** true = đang bật lý do hạch toán (hôm nay). Chưa tải xong coi như tắt. */
export function useUseReasons(): boolean {
  const q = useQuery({
    queryKey: ['settings', USE_REASONS_KEY],
    queryFn: () => api.get<{ value: unknown }>(`/api/v1/settings/values/${USE_REASONS_KEY}`),
    staleTime: 60_000,
  });
  return q.data?.value === 'on';
}
