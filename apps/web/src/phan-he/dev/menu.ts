// [2026-11-01 11:30 PM Johnny Chu - Chu Hoàng Anh] PHASE-019 — W3: menu Bàn điều tra (DEV01–DEV03), chỉ hiện khi có devtools:read
// [2026-11-02 10:42 AM Johnny Chu - Chu Hoàng Anh] PHASE-019 — W4: DEV04–DEV08
/**
 * Menu phân hệ Nhà phát triển. Mọi mục gắn quyền devtools:read (chủ đơn vị, vai trò developer) — filterMenu ẩn với người khác.
 * Màn Vận hành (W5) thêm vào đây khi làm.
 */
import type { MenuItem } from '@ketoan/contracts';
import { sec } from '../../layout/menu-helpers';

export const devMenu: MenuItem[] = [
  {
    key: 'nha-phat-trien',
    label: 'Bàn điều tra',
    children: [
      sec('dev-dieu-tra', 'Điều tra'),
      { key: 'dev-tong-quan', label: 'Tổng quan', path: '/dev/tong-quan', code: 'DEV01', permission: 'devtools:read' },
      { key: 'dev-tra-ma', label: 'Tra mã', path: '/dev/tra-ma', code: 'DEV02', permission: 'devtools:read' },
      { key: 'dev-nhat-ky', label: 'Nhật ký', path: '/dev/nhat-ky', code: 'DEV03', permission: 'devtools:read' },
      { key: 'dev-loi-theo-module', label: 'Lỗi theo module', path: '/dev/loi-theo-module', code: 'DEV04', permission: 'devtools:read' },
      sec('dev-so', 'Sổ và sự kiện'),
      { key: 'dev-ghi-so', label: 'Ghi sổ', path: '/dev/ghi-so', code: 'DEV05', permission: 'devtools:read' },
      { key: 'dev-su-kien', label: 'Sự kiện', path: '/dev/su-kien', code: 'DEV06', permission: 'devtools:read' },
      { key: 'dev-toan-ven', label: 'Toàn vẹn', path: '/dev/toan-ven', code: 'DEV07', permission: 'devtools:read' },
      sec('dev-huong-dan', 'Hướng dẫn'),
      { key: 'dev-kich-ban', label: 'Kịch bản', path: '/dev/kich-ban', code: 'DEV08', permission: 'devtools:read' },
    ],
  },
];
