/**
 * Lưu đồ QUY TRÌNH của từng phân hệ (thẻ "Luồng chi tiết" ở trang Quy trình /nhom/<nhóm>?xem=chi-tiet; trang chủ phân hệ /app/<key>).
 * Nhóm chưa khai thì không có nút "Luồng chi tiết". Thêm cho nhóm khác: viết trang khai dữ liệu dùng components/quy-trinh/LuongChiTiet
 * rồi đăng ký ở đây.
 *
 * [2026-11-13 02:55 PM Võ Hoàng] UX-14 — khoá theo NHÓM MENU (group key của menu-gon.ts), không theo module: Tiền mặt / Tiền gửi cùng module
 * quy, Công cụ dụng cụ / Tài sản cố định cùng tai-san — khoá theo module thì hai nhóm hiện chung một luồng (chữ chốt cap-nhat-ux/14) (đóng góp)
 */
import type { ComponentType } from 'react';
import { QuyTrinhMuaHang } from './mua-hang/quy-trinh/QuyTrinhMuaHang';
import { QuyTrinhDanhMuc } from './danh-muc/QuyTrinhDanhMuc';
import { QuyTrinhBanHang } from './ban-hang/quy-trinh/QuyTrinhBanHang';

export const GROUP_FLOWS: Record<string, ComponentType> = {
  'mua-hang': QuyTrinhMuaHang,
  'danh-muc': QuyTrinhDanhMuc, // [2026-11-13 Nguyễn Văn Thủy] (đóng góp)
  'ban-hang': QuyTrinhBanHang,
};

/** Trang chủ phân hệ /app/<module>: dùng luồng của nhóm cùng tên (mua-hang, danh-muc, ban-hang). */
export const MODULE_FLOWS = GROUP_FLOWS;
