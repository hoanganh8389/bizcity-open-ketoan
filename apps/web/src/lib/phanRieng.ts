// [2026-11-11 Nguyễn Văn Thủy] công tắc nhóm menu Phần riêng (bizcity.ui.phan_rieng, mặc định bật) (đóng góp)
/**
 * Nhóm "Phần riêng" là lớp gắn thêm cho chuỗi cửa hàng (nạp chứng từ từ máy bán hàng, tồn max, chính sách mua…).
 * Đơn vị không dùng thì tắt ở Cấu hình hệ thống: nhóm ẩn khỏi menu trái và Tổng quan, màn vẫn mở được bằng ô tìm.
 */
import { useQuery } from '@tanstack/react-query';
import { api } from './api';

export const PHAN_RIENG_KEY = 'bizcity.ui.phan_rieng';

/** true = hiện nhóm Phần riêng. Chưa tải xong coi như bật (mặc định của khoá). */
export function usePhanRieng(): boolean {
  const q = useQuery({
    queryKey: ['settings', PHAN_RIENG_KEY],
    queryFn: () => api.get<{ value: unknown }>(`/api/v1/settings/values/${PHAN_RIENG_KEY}`),
    staleTime: 300_000,
    retry: false,
  });
  return q.data?.value !== 'off';
}
