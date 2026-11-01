// [2026-11-01 11:30 PM Johnny Chu - Chu Hoàng Anh] PHASE-019 — W3: menu Bàn điều tra (DEV01–DEV03), chỉ hiện khi có devtools:read
/**
 * Menu phân hệ Nhà phát triển. Mọi mục gắn quyền devtools:read (chủ đơn vị, vai trò developer) — filterMenu ẩn với người khác.
 * Màn W4–W5 (Lỗi theo module, Ghi sổ, Sự kiện, Toàn vẹn, Kịch bản, Vận hành) thêm vào đây khi làm.
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
    ],
  },
];
