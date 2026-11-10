// [2026-11-11 Nguyễn Văn Thủy] GIAO DIỆN — chọn giao diện Xanh (mặc định) hoặc Cổ điển, nhớ theo máy (đóng góp)
/**
 * Giao diện của phần mềm: 'xanh' (bố cục chuẩn, styles/giao-dien-xanh.css) hoặc 'co-dien' (giao diện trước 11/2026).
 * Lưu ở trình duyệt; áp bằng lớp gd-xanh trên thẻ <html> ngay lúc mở trang để không chớp màu.
 */
export type GiaoDien = 'xanh' | 'co-dien';
const KEY = 'ketoan.giao-dien';

export const giaoDien = {
  get(): GiaoDien {
    try { return localStorage.getItem(KEY) === 'co-dien' ? 'co-dien' : 'xanh'; } catch { return 'xanh'; }
  },
  set(v: GiaoDien) {
    try { localStorage.setItem(KEY, v); } catch { /* chế độ riêng tư */ }
    giaoDien.apply(v);
  },
  apply(v: GiaoDien = giaoDien.get()) {
    document.documentElement.classList.toggle('gd-xanh', v === 'xanh');
  },
};
