import type { WebModule } from '../types';

export const kho: WebModule = {
  key: 'kho', label: 'Kho', icon: 'Warehouse', color: '#7b1fa2', order: 50,
  description: 'Nhập xuất, chuyển kho, tồn kho, giá vốn, mặt hàng & bảng giá',
  groups: ['kho-nghiep-vu', 'kho-bao-cao', 'kho-danh-muc'],
};
