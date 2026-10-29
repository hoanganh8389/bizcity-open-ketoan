/**
 * Lưu đồ QUY TRÌNH của từng phân hệ (thẻ "Quy trình" ở trang chủ phân hệ /app/<key>). Phân hệ chưa khai thì trang chủ chỉ
 * có danh sách chức năng. Thêm cho phân hệ khác: viết một component dùng components/quy-trinh/QuyTrinh (khai FlowDef) rồi
 * đăng ký ở đây.
 */
import type { ComponentType } from 'react';
import { QuyTrinhMuaHang } from './mua-hang/quy-trinh/QuyTrinhMuaHang';

export const MODULE_FLOWS: Record<string, ComponentType> = {
  'mua-hang': QuyTrinhMuaHang,
};
