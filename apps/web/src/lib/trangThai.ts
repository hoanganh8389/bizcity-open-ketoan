// [2026-11-11 Nguyễn Văn Thủy] màu dòng chứng từ theo trạng thái, dùng chung mọi danh sách (đóng góp)
/**
 * Lớp CSS của dòng chứng từ trong danh sách: chưa duyệt / chưa ghi sổ → `ct-cho` (chữ cam), huỷ / từ chối → `muted` (chữ mờ),
 * đã duyệt / đã ghi sổ → không tô. Một nơi quyết định để mọi danh sách đọc giống nhau.
 */
const XONG = new Set(['approved', 'posted', 'received', 'done', 'closed']);
// Chuyển kho 'shipped' (đã xuất, chờ nhận) không có trong hai nhóm → chữ cam: còn việc phải làm.
const HUY = new Set(['cancelled', 'canceled', 'rejected', 'void']);

export function dongChungTu(status: string | null | undefined): string {
  if (!status || XONG.has(status)) return '';
  return HUY.has(status) ? 'muted' : 'ct-cho';
}

/** Chú thích ngắn đặt cạnh danh sách. */
export const CHU_THICH_CAM = 'chữ cam = chưa duyệt';
