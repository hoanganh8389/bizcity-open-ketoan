/**
 * Nhóm menu của phân hệ Kho (thanh bên trái + trang chủ phân hệ). Mục có path mở màn; mục không path = chưa làm.
 * Mã chức năng (ACC.., DM..) và khoá mục giữ nguyên (màn đã ghim không mất). Muốn nhóm hiện thêm ở phân hệ khác: thêm khoá
 * nhóm vào manifest của phân hệ đó.
 */
import type { MenuItem } from '@ketoan/contracts';

export const khoMenu: MenuItem[] = [
  // ---------------- Phân hệ Kho ----------------
  {
    key: 'kho-nghiep-vu',
    label: 'Nghiệp vụ kho',
    children: [
      { key: 'kho-chuyen-kho', label: 'Phiếu chuyển kho', path: '/kho/chuyen-kho', code: 'KHO01' },
      { key: 'kho-gia-von', label: 'Tính giá vốn', path: '/nghiep-vu/tinh-gia-von', code: 'ACC49' },
    ],
  },
  {
    key: 'kho-bao-cao',
    label: 'Báo cáo kho',
    children: [
      { key: 'kho-nxt', label: 'BC nhập xuất tồn hàng hoá', path: '/bao-cao/nhap-xuat-ton', code: 'ACC83' },
      { key: 'kho-ct-hang-hoa', label: 'Sổ chi tiết hàng hoá', path: '/bao-cao/so-chi-tiet-hang-hoa', code: 'ACC82' },
      { key: 'kho-chuyen-kho', label: 'Bảng kê chuyển kho', path: '/bao-cao/chuyen-kho', code: 'HH01' },
    ],
  },
  {
    key: 'kho-danh-muc',
    label: 'Danh mục kho',
    children: [
      { key: 'kho-mat-hang', label: 'Danh mục mặt hàng', path: '/danh-muc/mat-hang', code: 'DM10' },
      { key: 'kho-don-vi-tinh', label: 'Danh mục đơn vị tính', path: '/danh-muc/don-vi-tinh', code: 'DM15' },
      { key: 'kho-phan-loai', label: 'Phân loại hàng hoá', path: '/danh-muc/phan-loai-hang', code: 'DM11' },
      { key: 'kho-nhom-hach-toan', label: 'Mặt hàng - Tài khoản', path: '/cau-hinh/nhom-hach-toan', code: 'ACC17' },
      { key: 'kho-chi-nhanh', label: 'Chi nhánh (kho, cửa hàng)', path: '/danh-muc/chi-nhanh', code: 'DM02' },
      { key: 'kho-kho', label: 'Danh mục kho', path: '/danh-muc/kho', code: 'DM12' },
    ],
  },
];
