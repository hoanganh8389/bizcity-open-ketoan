/**
 * Nhóm menu của phân hệ Bán hàng (thanh bên trái + trang chủ phân hệ). Mục có path mở màn; mục không path = chưa làm.
 * Mã chức năng (ACC.., DM..) và khoá mục giữ nguyên (màn đã ghim không mất). Muốn nhóm hiện thêm ở phân hệ khác: thêm khoá
 * nhóm vào manifest của phân hệ đó.
 */
import type { MenuItem } from '@ketoan/contracts';

export const banHangMenu: MenuItem[] = [
  // ---------------- Phân hệ Bán hàng ----------------
  {
    key: 'ban-hang-nghiep-vu',
    label: 'Nghiệp vụ bán hàng',
    children: [
      { key: 'bh-phieu-ban', label: 'Phiếu bán hàng', path: '/ban-hang/phieu-ban', code: 'BH10' },
      { key: 'bh-tra-lai', label: 'Hàng bán trả lại', path: '/ban-hang/tra-lai', code: 'BH11' },
    ],
  },
  {
    key: 'ban-hang',
    label: 'Báo cáo bán hàng',
    children: [
      { key: 'bc-ban-hang', label: 'Báo cáo bán hàng', path: '/ban-hang/bao-cao', code: 'BH01' },
      { key: 'th-ban-hang', label: 'Tổng hợp bán hàng', path: '/ban-hang/tong-hop', code: 'BH02' },
      { key: 'thu-tien', label: 'Thu tiền theo hình thức thanh toán', path: '/ban-hang/thu-tien', code: 'BH03' },
      { key: 'thu-tien-ban-hang', label: 'Báo cáo thu tiền bán hàng', path: '/ban-hang/thu-tien-ban-hang', code: 'BH05' },
      { key: 'lai-gop', label: 'Lãi gộp', path: '/ban-hang/lai-gop', code: 'BH04' },
      { key: 'bh-xuat-dieu-chinh', label: 'Phiếu xuất điều chỉnh', path: '/ban-hang/xuat-dieu-chinh', code: 'BH06' },
      { key: 'bh-nk-ban-hang', label: 'Sổ nhật ký bán hàng', path: '/cong-no/nhat-ky-ban-hang', code: 'ACC84' },
      { key: 'bh-thue-ra', label: 'Báo cáo thuế ra', path: '/thue/bang-ke-ban-ra', code: 'ACC65' },
    ],
  },
  {
    key: 'ban-hang-danh-muc',
    label: 'Danh mục bán hàng',
    children: [
      { key: 'bh-doi-tuong', label: 'Đối tượng', path: '/danh-muc/doi-tuong', code: 'DM03' },
      { key: 'bh-khach-hang', label: 'Khách hàng', path: '/danh-muc/khach-hang', code: 'DM12' },
      { key: 'bh-nhom-doi-tuong', label: 'Nhóm đối tượng', path: '/danh-muc/nhom-doi-tuong', code: 'DM08' },
      { key: 'bh-hinh-thuc-tt', label: 'Hình thức thanh toán', path: '/cau-hinh/hinh-thuc-thanh-toan', code: 'DM05' },
      { key: 'bh-mat-hang', label: 'Danh mục mặt hàng', path: '/danh-muc/mat-hang', code: 'DM10' },
      { key: 'bh-don-vi-tinh', label: 'Danh mục đơn vị tính', path: '/danh-muc/don-vi-tinh', code: 'DM15' },
      { key: 'bh-bang-gia', label: 'Bảng giá bán', path: '/danh-muc/bang-gia', code: 'DM14' },
    ],
  },
];
