import type { WebModule } from '../types';

/** Phân hệ Danh mục: mọi khai báo danh mục của kế toán ở một chỗ (cùng nhóm menu "Danh mục" của Kế toán — màn là một). */
export const danhMuc: WebModule = {
  key: 'danh-muc', label: 'Danh mục', icon: 'BookMarked', color: '#0d7a6f', order: 55,
  description: 'Tài khoản, đối tượng, nhà cung cấp, chi nhánh, kho, mặt hàng, đơn vị tính, bộ phận, nhân viên…',
  groups: ['danh-muc'],
};
