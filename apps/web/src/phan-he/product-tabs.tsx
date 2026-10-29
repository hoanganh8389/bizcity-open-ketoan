/**
 * Thẻ phân hệ gắn thêm vào form Mặt hàng (danh mục lõi). Phân hệ nào cần khai thông tin riêng theo mặt hàng thì đăng ký ở đây;
 * thẻ chỉ hiện khi phân hệ đang bật cho đơn vị.
 */
import type { ComponentType } from 'react';
import { GiaMuaMatHang } from './mua-hang/gia-mua/GiaMuaMatHang';

export interface ProductTab { key: string; module: string; label: string; Component: ComponentType<{ sku: string; name: string; units: string[] }> }

export const PRODUCT_TABS: ProductTab[] = [
  { key: 'gia-mua', module: 'mua-hang', label: 'Mua hàng', Component: GiaMuaMatHang },
];
