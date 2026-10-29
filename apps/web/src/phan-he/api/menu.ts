/**
 * Nhóm menu của phân hệ API (dành cho người viết / tích hợp API).
 */
import type { MenuItem } from '@ketoan/contracts';
import { sec } from '../../layout/menu-helpers';

export const apiMenu: MenuItem[] = [
  {
    key: 'tich-hop',
    label: 'Tích hợp API',
    children: [
      sec('api-thu', 'Thử & tài liệu'),
      { key: 'api-thu-api', label: 'Thử API', path: '/tich-hop/thu-api', code: 'API01' },
      { key: 'api-huong-dan', label: 'Hướng dẫn API', path: '/tich-hop/huong-dan', code: 'API02' },
      sec('api-cau-hinh', 'Cấu hình'),
      { key: 'api-nguon-du-lieu', label: 'Nguồn dữ liệu màn hình', path: '/tich-hop/nguon-du-lieu', code: 'API03' },
      { key: 'api-khoa-api', label: 'Khoá API', path: '/cau-hinh/khoa-api', code: 'HT02', permission: 'users:write' },
    ],
  },
];
