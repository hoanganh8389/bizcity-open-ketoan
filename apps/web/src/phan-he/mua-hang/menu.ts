/**
 * Nhóm menu của phân hệ Mua hàng (thanh bên trái + trang chủ phân hệ). Mục có path mở màn; mục không path = chưa làm.
 * Mã chức năng (ACC.., DM..) và khoá mục giữ nguyên (màn đã ghim không mất). Muốn nhóm hiện thêm ở phân hệ khác: thêm khoá
 * nhóm vào manifest của phân hệ đó.
 */
import type { MenuItem } from '@ketoan/contracts';

export const muaHangMenu: MenuItem[] = [
  // ---------------- Phân hệ Mua hàng ----------------
  {
    key: 'mua-hang-nghiep-vu',
    label: 'Nghiệp vụ mua hàng',
    children: [
      { key: 'mh-ncc', label: 'Nhà cung cấp mua hàng', path: '/mua-hang/nha-cung-cap', code: 'MH01' },
      { key: 'mh-tong-hop', label: 'Tổng hợp mua hàng', path: '/mua-hang/tong-hop', code: 'MH11' },
      { key: 'mh-hoa-don-ncc', label: 'Hoá đơn đầu vào của NCC', path: '/mua-hang/hoa-don-ncc', code: 'MH22' },
      { key: 'mh-han-muc', label: 'Hạn mức & công nợ đến hạn', path: '/mua-hang/han-muc', code: 'MH05' },
      { key: 'mh-thuong', label: 'Tính thưởng cuối kỳ', path: '/mua-hang/thuong', code: 'MH06' },
      { key: 'mh-phan-bo', label: 'Phân bổ & giá vốn thực tế', path: '/mua-hang/phan-bo', code: 'MH07' },
      { key: 'mh-lo-han', label: 'Lô & hạn dùng', path: '/mua-hang/lo-han', code: 'MH08' },
      { key: 'mh-qua-tang', label: 'Quà tặng', path: '/mua-hang/qua-tang', code: 'MH09' },
      { key: 'mh-nhat-ky', label: 'Nhật ký mua hàng', path: '/mua-hang/nhat-ky', code: 'MH10' },
    ],
  },
  {
    key: 'mua-hang-ton-max',
    label: 'Tồn max & đặt hàng',
    children: [
      { key: 'mh-dat-hang', label: 'Phân tích đặt hàng', path: '/mua-hang/dat-hang', code: 'MH02' },
      { key: 'mh-ton-max', label: 'Tồn max', path: '/mua-hang/ton-max', code: 'MH16' },
      { key: 'mh-dang-ky-max', label: 'Phiếu đăng ký tồn max', path: '/mua-hang/dang-ky-max', code: 'MH17' },
      { key: 'mh-chuyen-shop', label: 'Chuyển hàng xuống shop', path: '/mua-hang/chuyen-shop', code: 'MH19' },
      { key: 'mh-cong-thuc', label: 'Công thức đặt hàng', path: '/mua-hang/cong-thuc', code: 'MH18' },
    ],
  },
  {
    key: 'mua-hang-danh-muc',
    label: 'Danh mục mua hàng',
    children: [
      { key: 'mh-chinh-sach', label: 'Chính sách mua hàng', path: '/mua-hang/chinh-sach', code: 'MH04' },
      { key: 'mh-cai-dat', label: 'Cài đặt mua hàng', path: '/mua-hang/cai-dat', code: 'MH12' },
      { key: 'mh-bien-the', label: 'Biến thể mặt hàng', path: '/mua-hang/bien-the', code: 'MH26' },
      { key: 'mh-dvt-thung', label: 'ĐVT Thùng đặt hàng', path: '/mua-hang/dvt-thung', code: 'MH27' },
      { key: 'mh-nhom-doi-tuong', label: 'Nhóm nhà cung cấp', path: '/danh-muc/nhom-doi-tuong', code: 'DM08' },
      { key: 'mh-mat-hang', label: 'Danh mục mặt hàng', path: '/danh-muc/mat-hang', code: 'DM10' },
      { key: 'mh-phan-loai', label: 'Nhóm hàng (ngành → nhãn → nhóm)', path: '/danh-muc/phan-loai-hang', code: 'DM11' },
      { key: 'mh-don-vi-tinh', label: 'Danh mục đơn vị tính', path: '/danh-muc/don-vi-tinh', code: 'DM15' },
      { key: 'mh-phan-cap', label: 'Phân cấp chi nhánh – shop', path: '/mua-hang/phan-cap', code: 'MH15' },
      { key: 'mh-chi-nhanh', label: 'Chi nhánh', path: '/danh-muc/chi-nhanh', code: 'DM02' },
      { key: 'mh-kho', label: 'Danh mục kho', path: '/danh-muc/kho', code: 'DM12' },
    ],
  },
  {
    key: 'mua-hang-bao-cao',
    label: 'Báo cáo mua hàng',
    children: [
      { key: 'mh-bao-cao', label: 'Báo cáo mua hàng', path: '/mua-hang/bao-cao', code: 'MH23' },
      { key: 'mh-so-kho', label: 'Sổ kho theo mặt hàng', path: '/mua-hang/so-kho', code: 'MH24' },
      { key: 'mh-ton-kho', label: 'Tồn kho theo mặt hàng', path: '/mua-hang/ton-kho', code: 'MH25' },
      { key: 'mh-doi-chieu', label: 'Đối chiếu đơn đặt ↔ phiếu nhập', path: '/mua-hang/doi-chieu', code: 'MH21' },
      { key: 'mh-bc-chinh-sach', label: 'Chi tiết chính sách mua hàng', path: '/mua-hang/chi-tiet-chinh-sach', code: 'MH14' },
      { key: 'mh-nk-mua-hang', label: 'Sổ nhật ký mua hàng', path: '/bao-cao/nhat-ky-mua-hang', code: 'ACC77' },
      { key: 'mh-sct-dinh-khoan', label: 'Sổ chi tiết định khoản theo mã hàng', path: '/bao-cao/nhat-ky-chung?docType=purchase&account=156', code: 'ACC89' },
      { key: 'mh-thue-vao', label: 'Báo cáo thuế vào', path: '/thue/bang-ke-mua-vao', code: 'ACC64' },
      { key: 'mh-cong-no', label: 'Sổ tổng hợp công nợ phát sinh', path: '/bao-cao/cong-no', code: 'ACC38' },
      { key: 'mh-nxt', label: 'BC nhập xuất tồn hàng hoá', path: '/bao-cao/nhap-xuat-ton', code: 'ACC83' },
    ],
  },
  {
    // Màn dành cho IT (nạp / dọn dữ liệu, cấu trúc bảng, 25 tình huống mẫu) — tách riêng để kế toán vào đỡ rối.
    key: 'mua-hang-it',
    label: 'Nghiệp vụ IT (riêng)',
    children: [
      { key: 'mh-tong-quan', label: 'Tổng quan & dữ liệu mẫu', path: '/mua-hang/tong-quan', code: 'MH00' },
      { key: 'mh-khoi-dau', label: 'Nhập dữ liệu khởi đầu', path: '/mua-hang/khoi-dau', code: 'MH20' },
      { key: 'mh-csdl', label: 'Cơ sở dữ liệu mua hàng', path: '/mua-hang/csdl', code: 'MH13' },
    ],
  },
];
