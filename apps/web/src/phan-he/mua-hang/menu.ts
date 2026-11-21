/**
 * Nhóm menu của phân hệ Mua hàng (thanh bên trái + trang chủ phân hệ). Mục có path mở màn; mục không path = chưa làm.
 * Mã chức năng (ACC.., DM..) và khoá mục giữ nguyên (màn đã ghim không mất). Muốn nhóm hiện thêm ở phân hệ khác: thêm khoá
 * nhóm vào manifest của phân hệ đó.
 */
import type { MenuItem } from '@ketoan/contracts';

export const muaHangMenu: MenuItem[] = [
  // [2026-11-20 Nguyễn Văn Thủy] UX MUA HÀNG GỌN — menu theo việc của kế toán mua hàng: Hằng ngày / Đặt hàng / Định kỳ / Khai báo / Báo cáo.
  // Bỏ 9 lối vào cùng mở MH11 (Đơn mua, Mua hàng, Trả lại…): một màn Chứng từ mua hàng, chọn loại ở bộ lọc. Danh mục chung
  // (mặt hàng, nhóm hàng, ĐVT, cơ cấu, nhóm NCC) chỉ ở nhóm Danh mục — mỗi việc một lối vào (đóng góp)
  {
    key: 'mua-hang-nghiep-vu',
    label: 'Hằng ngày',
    children: [
      { key: 'mh-tong-hop', label: 'Chứng từ mua hàng', path: '/mua-hang/tong-hop', code: 'MH11' },
      { key: 'mh-hoa-don-ncc', label: 'Hoá đơn đầu vào của NCC', path: '/mua-hang/hoa-don-ncc', code: 'MH22' },
      { key: 'mh-doi-chieu-hoa-don', label: 'Đối chiếu hoá đơn', path: '/mua-hang/doi-chieu-hoa-don', code: 'MH31' },
      { key: 'mh-han-muc', label: 'Công nợ NCC', path: '/mua-hang/han-muc', code: 'MH05' },
    ],
  },
  {
    key: 'mua-hang-dat-hang',
    label: 'Đặt hàng',
    children: [
      { key: 'mh-dang-ky-max', label: 'Phiếu đăng ký tồn max (shop)', path: '/mua-hang/dang-ky-max', code: 'MH17' },
      { key: 'mh-ton-max', label: 'Tồn max (kế toán mua hàng)', path: '/mua-hang/ton-max', code: 'MH16' },
      { key: 'mh-cong-thuc', label: 'Công thức đặt hàng', path: '/mua-hang/cong-thuc', code: 'MH18' },
      { key: 'mh-dat-hang', label: 'Phân tích đặt hàng', path: '/mua-hang/dat-hang', code: 'MH02' },
      { key: 'mh-chuyen-shop', label: 'Chuyển hàng xuống shop', path: '/mua-hang/chuyen-shop', code: 'MH19' },
    ],
  },
  {
    key: 'mua-hang-dinh-ky',
    label: 'Định kỳ',
    children: [
      { key: 'mh-thuong', label: 'Tính thưởng cuối kỳ', path: '/mua-hang/thuong', code: 'MH06' },
      { key: 'mh-phan-bo', label: 'Phân bổ & giá vốn thực tế', path: '/mua-hang/phan-bo', code: 'MH07' },
      { key: 'mh-lo-han', label: 'Lô & hạn dùng', path: '/mua-hang/lo-han', code: 'MH08' },
      { key: 'mh-qua-tang', label: 'Quà tặng', path: '/mua-hang/qua-tang', code: 'MH09' },
    ],
  },
  {
    key: 'mua-hang-danh-muc',
    label: 'Khai báo',
    children: [
      { key: 'mh-ncc', label: 'Nhà cung cấp mua hàng', path: '/mua-hang/nha-cung-cap', code: 'MH01' },
      { key: 'mh-hop-dong', label: 'Hợp đồng mua hàng', path: '/mua-hang/hop-dong', code: 'MH29' },
      { key: 'mh-chinh-sach', label: 'Chính sách mua hàng', path: '/mua-hang/chinh-sach', code: 'MH04' },
      { key: 'mh-cai-dat', label: 'Cài đặt mua hàng', path: '/mua-hang/cai-dat', code: 'MH12' },
      { key: 'mh-bien-the', label: 'Tách / gộp mã con khi đặt hàng', path: '/mua-hang/bien-the', code: 'MH26' },
    ],
  },
  {
    key: 'mua-hang-bao-cao',
    label: 'Báo cáo mua hàng',
    children: [
      { key: 'mh-bao-cao', label: 'Báo cáo mua hàng', path: '/mua-hang/bao-cao', code: 'MH23' },
      { key: 'mh-th-mat-hang', label: 'Tổng hợp mua hàng theo mặt hàng', path: '/mua-hang/tong-hop-mat-hang', code: 'MH23A' },
      { key: 'mh-so-kho', label: 'Sổ kho theo mặt hàng', path: '/mua-hang/so-kho', code: 'MH24' },
      { key: 'mh-ton-kho', label: 'Tồn kho theo mặt hàng', path: '/mua-hang/ton-kho', code: 'MH25' },
      { key: 'mh-nhat-ky', label: 'Nhật ký mua hàng', path: '/mua-hang/nhat-ky', code: 'MH10' },
      { key: 'mh-doi-chieu', label: 'Đối chiếu đơn đặt ↔ phiếu nhập', path: '/mua-hang/doi-chieu', code: 'MH21' },
      { key: 'mh-bc-chinh-sach', label: 'Chi tiết chính sách mua hàng', path: '/mua-hang/chi-tiet-chinh-sach', code: 'MH14' },
      // [2026-11-21 Nguyễn Văn Thủy] báo cáo theo hợp đồng / chính sách (đóng góp)
      { key: 'mh-thuc-hien-chinh-sach', label: 'Tình hình thực hiện chính sách mua hàng', path: '/mua-hang/thuc-hien-chinh-sach', code: 'MH32' },
      { key: 'mh-chinh-sach-hop-dong', label: 'Tổng hợp chính sách theo hợp đồng', path: '/mua-hang/chinh-sach-theo-hop-dong', code: 'MH33' },
      { key: 'mh-doi-chieu-gia-hop-dong', label: 'Đối chiếu giá mua theo hợp đồng', path: '/mua-hang/doi-chieu-gia-hop-dong', code: 'MH34' },
      { key: 'mh-thuc-hien-hop-dong', label: 'Tình hình thực hiện hợp đồng mua hàng', path: '/mua-hang/thuc-hien-hop-dong', code: 'MH35' },
      { key: 'mh-nk-mua-hang', label: 'Sổ nhật ký mua hàng', path: '/bao-cao/nhat-ky-mua-hang', code: 'ACC77' },
      { key: 'mh-thue-vao', label: 'Báo cáo thuế vào', path: '/thue/bang-ke-mua-vao', code: 'ACC64' },
      { key: 'mh-cong-no', label: 'Sổ tổng hợp công nợ phát sinh', path: '/bao-cao/cong-no', code: 'ACC38' },
      { key: 'mh-cong-no-hop-dong', label: 'Công nợ theo hợp đồng', path: '/mua-hang/cong-no-hop-dong', code: 'MH30' },
      { key: 'mh-nxt', label: 'BC nhập xuất tồn hàng hoá', path: '/bao-cao/nhap-xuat-ton', code: 'ACC83' },
    ],
  },
  {
    // Màn dành cho IT (nạp / dọn dữ liệu, cấu trúc bảng, 25 tình huống mẫu) — tách riêng để kế toán vào đỡ rối.
    key: 'mua-hang-it',
    label: 'Nghiệp vụ IT (riêng)',
    children: [
      { key: 'mh-hieu-nghiep-vu', label: 'Hiểu hàng hoá và giá vốn', path: '/mua-hang/hieu-nghiep-vu', code: 'MH28' },
      { key: 'mh-tong-quan', label: 'Tổng quan & dữ liệu mẫu', path: '/mua-hang/tong-quan', code: 'MH00' },
      { key: 'mh-khoi-dau', label: 'Nhập dữ liệu khởi đầu', path: '/mua-hang/khoi-dau', code: 'MH20' },
      { key: 'mh-csdl', label: 'Cơ sở dữ liệu mua hàng', path: '/mua-hang/csdl', code: 'MH13' },
    ],
  },
];
