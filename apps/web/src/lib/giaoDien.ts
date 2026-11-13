// [2026-11-11 Nguyễn Văn Thủy] GIAO DIỆN — một giao diện, đổi màu gốc (--base, --nav); mọi sắc độ tự tính ở styles/giao-dien-xanh.css (đóng góp)
/**
 * Màu gốc của phần mềm: chỉ hai màu — base (nút, chọn, liên kết) và nav (menu trái, chữ đậm). Thêm bộ màu: thêm một dòng MAU_GOC.
 * Lưu ở trình duyệt; áp ngay lúc mở trang (main.tsx) để không chớp màu.
 */
export interface MauGoc { id: string; ten: string; base: string; nav: string; /** menu trái nền trắng (lớp gd-sang) */ sang?: boolean }

export const MAU_GOC: MauGoc[] = [
  // [2026-11-12 Nguyễn Văn Thủy] mặc định quay lại giao diện sáng: menu trái trắng, màu chính #235DA7 theo website công ty (đóng góp)
  { id: 'sang', ten: 'Sáng', base: '#235da7', nav: '#1c2b45', sang: true },
  { id: 'xanh-duong', ten: 'Xanh dương', base: '#2457b3', nav: '#0f223d' },
  { id: 'xanh-la', ten: 'Xanh lá', base: '#0e9a62', nav: '#1f2428' },
  { id: 'tim-than', ten: 'Tím than', base: '#5b4bc4', nav: '#1e1b3a' },
];
const KEY = 'ketoan.mau-goc.v2'; // v2: đổi mặc định sang giao diện sáng, bỏ lựa chọn tối đã lưu trước đó

export const giaoDien = {
  get(): MauGoc {
    let id = '';
    try { id = localStorage.getItem(KEY) ?? ''; } catch { /* chế độ riêng tư */ }
    return MAU_GOC.find((m) => m.id === id) ?? MAU_GOC[0]!;
  },
  set(id: string) {
    try { localStorage.setItem(KEY, id); } catch { /* chế độ riêng tư */ }
    giaoDien.apply();
  },
  apply() {
    const m = giaoDien.get();
    const el = document.documentElement;
    el.classList.add('gd-xanh');
    el.classList.toggle('gd-sang', !!m.sang);
    el.style.setProperty('--base', m.base);
    el.style.setProperty('--nav', m.nav);
  },
};
