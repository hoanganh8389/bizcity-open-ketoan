import type { WebModule } from '../types';

export const muaHang: WebModule = {
  key: 'mua-hang', label: 'Mua hàng', icon: 'Truck', color: '#e8710a', order: 30,
  description: 'Nhà cung cấp, mua hàng, trả hàng nhà cung cấp, công nợ phải trả',
  groups: ['mua-hang-nghiep-vu', 'mua-hang-dat-hang', 'mua-hang-dinh-ky', 'mua-hang-danh-muc', 'mua-hang-bao-cao', 'mua-hang-it'],
};
