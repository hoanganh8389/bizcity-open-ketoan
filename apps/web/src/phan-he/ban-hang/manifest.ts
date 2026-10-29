import type { WebModule } from '../types';

export const banHang: WebModule = {
  key: 'ban-hang', label: 'Bán hàng', icon: 'ShoppingCart', color: '#d93025', order: 40,
  description: 'Khách hàng, bán hàng, hàng bán trả lại, công nợ phải thu',
  groups: ['ban-hang-nghiep-vu', 'ban-hang', 'ban-hang-danh-muc'],
};
