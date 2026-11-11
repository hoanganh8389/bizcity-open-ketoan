// [2026-11-06 01:10 AM Nguyễn Văn Thủy] MENU — sơ đồ các bước và hàng Tiện ích của từng nhóm (đóng góp)
// [2026-11-11 Nguyễn Văn Thủy] QUY TRÌNH — lưu đồ nghiệp vụ theo từng phân hệ kế toán chuẩn, bước chưa có ghi "đang phát triển", 5 báo cáo chính bên phải (đóng góp)
/**
 * TRANG QUY TRÌNH CỦA PHÂN HỆ: lưu đồ nghiệp vụ (hàng trên / hàng dưới một trục), khung Báo cáo chính bên phải, hàng danh mục
 * liên quan ở dưới. Bước có nhiều loại phiếu thì khai `sub`, nút thành danh sách xổ. Icon lấy tên biểu tượng lucide.
 * Bước chưa có màn: bỏ `path` (hiện mờ, ghi "đang phát triển"). Bước có màn mà người dùng không có quyền thì ẩn.
 */
export interface SoDoNode { label: string; icon: string; path?: string; sub?: { label: string; path: string }[] }
export interface SoDoLink { label: string; icon: string; path: string }
export interface SoDoReport { label: string; path?: string }
export interface SoDo { title: string; rows: SoDoNode[][]; reports?: SoDoReport[]; links: SoDoLink[] }

const mua = (loai: string) => `/mua-hang/tong-hop?loai=${loai}`;
const L = {
  khach: { label: 'Khách hàng', icon: 'User', path: '/danh-muc/khach-hang' },
  ncc: { label: 'Nhà cung cấp', icon: 'Truck', path: '/danh-muc/nha-cung-cap' },
  nhanVien: { label: 'Nhân viên', icon: 'IdCard', path: '/danh-muc/nhan-vien' },
  vthh: { label: 'Vật tư hàng hóa', icon: 'Package', path: '/danh-muc/mat-hang' },
  coCau: { label: 'Cơ cấu tổ chức', icon: 'Network', path: '/danh-muc/so-do-to-chuc' },
  tkNganHang: { label: 'Tài khoản ngân hàng', icon: 'Landmark', path: '/danh-muc/ngan-hang' },
} satisfies Record<string, SoDoLink>;

export const SO_DO: Record<string, SoDo> = {
  'tien-mat': {
    title: 'Nghiệp vụ tiền mặt',
    rows: [
      [{ label: 'Thu tiền', icon: 'ArrowDownLeft', path: '/nghiep-vu/phieu-thu' }, { label: 'Kiểm kê quỹ', icon: 'ListChecks' }],
      [{ label: 'Đề nghị chi tiền', icon: 'Send' }, { label: 'Chi tiền', icon: 'ArrowUpRight', path: '/nghiep-vu/phieu-chi' }],
    ],
    reports: [
      { label: 'Bảng kê số dư tiền theo ngày', path: '/quy/so-du-tien' }, { label: 'Dòng tiền' }, { label: 'Sổ nhật ký thu tiền', path: '/quy/nhat-ky-thu-tien' },
      { label: 'Sổ kế toán chi tiết quỹ tiền mặt', path: '/quy/so-chi-tiet-quy' }, { label: 'Sổ nhật ký chi tiền', path: '/quy/nhat-ky-chi-tien' },
    ],
    links: [L.khach, L.ncc, L.nhanVien],
  },
  'tien-gui': {
    title: 'Nghiệp vụ tiền gửi',
    rows: [
      [{ label: 'Thu tiền gửi', icon: 'ArrowDownLeft', path: '/nghiep-vu/phieu-bao-co' }, { label: 'Đối chiếu ngân hàng', icon: 'ListChecks' }],
      [{ label: 'Chuyển tiền nội bộ', icon: 'ArrowLeftRight', path: '/quy/phieu-chuyen-tien' }, { label: 'Chi tiền gửi', icon: 'ArrowUpRight', path: '/nghiep-vu/phieu-bao-no' }],
    ],
    reports: [
      { label: 'Bảng kê số dư tiền theo ngày', path: '/quy/so-du-tien' }, { label: 'Sổ tiền gửi ngân hàng', path: '/quy/so-tien-gui' },
      { label: 'Bảng kê số dư ngân hàng', path: '/quy/so-du-ngan-hang' }, { label: 'Sổ chi tiết chuyển tiền nội bộ', path: '/quy/chuyen-tien-noi-bo' },
      { label: 'Sổ chi tiết tiền vay', path: '/bao-cao/tien-vay' },
    ],
    links: [L.tkNganHang, L.khach, L.ncc, L.nhanVien],
  },
  'mua-hang': {
    title: 'Nghiệp vụ mua hàng',
    rows: [
      [
        { label: 'Đơn mua hàng', icon: 'ClipboardList', path: mua('order') },
        { label: 'Nhận hàng hóa, dịch vụ', icon: 'PackageCheck', path: mua('receipt'), sub: [{ label: 'Mua hàng', path: mua('receipt') }, { label: 'Quà tặng', path: mua('gift_in') }, { label: 'Chi phí mua hàng', path: mua('cost') }] },
        { label: 'Xử lý hóa đơn đầu vào', icon: 'FileText', path: '/mua-hang/hoa-don-ncc' },
        { label: 'Trả tiền theo hóa đơn', icon: 'Banknote', path: mua('payment'), sub: [{ label: 'Trả tiền', path: mua('payment') }, { label: 'Ứng trước', path: mua('prepayment') }] },
      ],
      [
        { label: 'Hợp đồng mua hàng', icon: 'FileSignature' },
        { label: 'Trả lại hàng mua', icon: 'RotateCcw', path: mua('return') },
        { label: 'Giảm giá hàng mua', icon: 'BadgePercent', path: mua('rebate') },
      ],
    ],
    reports: [
      { label: 'Sổ chi tiết mua hàng', path: '/mua-hang/bao-cao' }, { label: 'Chi tiết công nợ phải trả nhà cung cấp', path: '/bao-cao/so-chi-tiet-cong-no' },
      { label: 'Tổng hợp mua hàng theo mặt hàng' }, { label: 'Tổng hợp công nợ phải trả nhà cung cấp', path: '/bao-cao/cong-no' },
      { label: 'Biên bản đối chiếu và xác nhận công nợ phải trả' },
    ],
    links: [L.ncc, L.vthh],
  },
  'ban-hang': {
    title: 'Nghiệp vụ bán hàng',
    rows: [
      [
        { label: 'Đơn đặt hàng', icon: 'ClipboardList' },
        { label: 'Bán hàng', icon: 'Receipt', path: '/ban-hang/phieu-ban' },
        { label: 'Trả lại hàng bán', icon: 'RotateCcw', path: '/ban-hang/tra-lai' },
        { label: 'Thu tiền theo hóa đơn', icon: 'ArrowDownLeft', path: '/nghiep-vu/phieu-thu', sub: [{ label: 'Thu tiền mặt', path: '/nghiep-vu/phieu-thu' }, { label: 'Thu tiền gửi', path: '/nghiep-vu/phieu-bao-co' }] },
      ],
      [{ label: 'Giảm giá hàng bán', icon: 'BadgePercent' }],
    ],
    reports: [
      { label: 'Sổ chi tiết bán hàng', path: '/ban-hang/bao-cao' }, { label: 'Chi tiết công nợ phải thu khách hàng', path: '/bao-cao/so-chi-tiet-cong-no' },
      { label: 'Tổng hợp bán hàng', path: '/ban-hang/tong-hop' }, { label: 'Tổng hợp công nợ phải thu khách hàng', path: '/bao-cao/cong-no' },
      { label: 'Lãi gộp theo mặt hàng', path: '/ban-hang/lai-gop' },
    ],
    links: [L.khach, L.vthh, { label: 'Bảng giá bán', icon: 'Tags', path: '/danh-muc/bang-gia' }],
  },
  kho: {
    title: 'Nghiệp vụ kho',
    rows: [
      [{ label: 'Xuất kho', icon: 'PackageMinus', path: '/ban-hang/xuat-dieu-chinh' }, { label: 'Chuyển kho', icon: 'ArrowLeftRight', path: '/kho/chuyen-kho' }],
      [{ label: 'Nhập kho', icon: 'PackagePlus' }, { label: 'Tính giá xuất kho', icon: 'Calculator', path: '/nghiep-vu/tinh-gia-von' }, { label: 'Kiểm kê', icon: 'ListChecks' }],
    ],
    reports: [
      { label: 'Sổ chi tiết vật tư hàng hóa', path: '/bao-cao/so-chi-tiet-hang-hoa' }, { label: 'Tổng hợp tồn kho', path: '/bao-cao/nhap-xuat-ton' },
      { label: 'Tổng hợp tồn kho theo lô', path: '/kho/ton-theo-lo' }, { label: 'Sổ chuyển kho nội bộ', path: '/bao-cao/chuyen-kho' },
      { label: 'Đối chiếu kho và sổ cái' },
    ],
    links: [{ label: 'Kho', icon: 'Warehouse', path: '/danh-muc/kho' }, L.vthh, { label: 'Đơn vị tính', icon: 'Ruler', path: '/danh-muc/don-vi-tinh' }],
  },
  ccdc: {
    title: 'Nghiệp vụ công cụ dụng cụ, chi phí trả trước',
    rows: [
      [{ label: 'Ghi tăng', icon: 'CirclePlus', path: '/tai-san/cong-cu' }, { label: 'Phân bổ chi phí trả trước', icon: 'Timer', path: '/tai-san/chi-phi-tra-truoc' }],
      [{ label: 'Điều chuyển', icon: 'ArrowLeftRight' }, { label: 'Ghi giảm', icon: 'CircleMinus' }, { label: 'Kiểm kê', icon: 'ListChecks' }],
    ],
    reports: [
      { label: 'Bảng tính phân bổ chi phí trả trước', path: '/bao-cao/phan-bo-chi-phi' }, { label: 'Bảng tính phân bổ công cụ dụng cụ' },
      { label: 'Sổ theo dõi tài sản, công cụ dụng cụ', path: '/bao-cao/theo-doi-tscd-ccdc' }, { label: 'Báo cáo chi tiết giảm công cụ dụng cụ' },
    ],
    links: [L.coCau, { label: 'Loại công cụ dụng cụ', icon: 'Hammer', path: '/danh-muc/nhom-ccdc' }],
  },
  tscd: {
    title: 'Nghiệp vụ tài sản cố định',
    rows: [
      [{ label: 'Ghi tăng', icon: 'CirclePlus', path: '/tai-san/tscd' }, { label: 'Điều chuyển', icon: 'ArrowLeftRight', path: '/tai-san/dieu-chuyen' }, { label: 'Tính khấu hao', icon: 'Timer', path: '/tai-san/khau-hao' }],
      [{ label: 'Đánh giá lại', icon: 'Star', path: '/tai-san/danh-gia-lai' }, { label: 'Ghi giảm', icon: 'CircleMinus', path: '/tai-san/ghi-giam' }, { label: 'Kiểm kê tài sản', icon: 'ListChecks', path: '/tai-san/kiem-ke' }],
    ],
    reports: [
      { label: 'Sổ tài sản cố định', path: '/bao-cao/so-tai-san' }, { label: 'Bảng tính khấu hao tài sản cố định theo năm' },
      { label: 'Tổng hợp tài sản cố định', path: '/bao-cao/tai-san' }, { label: 'Sổ theo dõi tài sản, công cụ dụng cụ', path: '/bao-cao/theo-doi-tscd-ccdc' },
      { label: 'Thẻ tài sản cố định' },
    ],
    links: [L.coCau, { label: 'Loại tài sản cố định', icon: 'Shapes', path: '/danh-muc/loai-tai-san' }, { label: 'Nguồn vốn', icon: 'Coins', path: '/danh-muc/nguon-von' }],
  },
  thue: {
    title: 'Nghiệp vụ thuế',
    rows: [
      [{ label: 'Tờ khai thuế GTGT', icon: 'FileText', path: '/thue/to-khai-gtgt' }, { label: 'Quyết toán thuế TNDN', icon: 'FileCheck', path: '/thue/quyet-toan-tndn' }, { label: 'Giấy nộp tiền', icon: 'Banknote' }],
      [{ label: 'Bổ sung thông tin thuế', icon: 'FilePen', path: '/thue/bo-sung-thong-tin' }, { label: 'Hóa đơn, NCC có rủi ro', icon: 'ShieldAlert', path: '/thue/hoa-don-rui-ro' }],
    ],
    reports: [
      { label: 'Bảng kê hóa đơn, chứng từ bán ra', path: '/thue/bang-ke-ban-ra' }, { label: 'Bảng kê hóa đơn, chứng từ mua vào', path: '/thue/bang-ke-mua-vao' },
      { label: 'Bảng tổng hợp quyết toán thuế GTGT năm', path: '/thue/tong-hop' },
    ],
    links: [{ label: 'Thông tin người nộp thuế', icon: 'Building2', path: '/thue/nguoi-nop-thue' }, { label: 'Biểu thuế', icon: 'Percent', path: '/danh-muc/loai-thue' }],
  },
  'tong-hop': {
    title: 'Nghiệp vụ tổng hợp',
    rows: [
      [{ label: 'Đề nghị quyết toán tạm ứng', icon: 'Send' }, { label: 'Kết chuyển lãi lỗ', icon: 'ChartLine', path: '/nghiep-vu/ket-chuyen' }, { label: 'Khóa sổ kỳ kế toán', icon: 'Lock', path: '/cau-hinh/ky-ke-toan' }],
      [{ label: 'Chứng từ nghiệp vụ khác', icon: 'FilePen', path: '/nghiep-vu/phieu-ke-toan' }, { label: 'Lập báo cáo tài chính', icon: 'ChartColumn', path: '/bao-cao/can-doi-ke-toan' }],
    ],
    reports: [
      { label: 'Sổ chi tiết các tài khoản', path: '/bao-cao/so-chi-tiet' }, { label: 'Sổ nhật ký chung', path: '/bao-cao/nhat-ky-chung' },
      { label: 'Tổng hợp công nợ nhân viên', path: '/bao-cao/cong-no-theo-nhan-vien' }, { label: 'Tổng hợp công nợ theo đối tượng', path: '/bao-cao/cong-no' },
      { label: 'Báo cáo tình hình tài chính', path: '/bao-cao/can-doi-ke-toan' },
    ],
    links: [{ label: 'Hệ thống tài khoản', icon: 'BookOpen', path: '/danh-muc/tai-khoan' }, { label: 'Tài khoản ngầm định', icon: 'Link', path: '/cau-hinh/tai-khoan-ngam-dinh' }, { label: 'Khoản mục chi phí', icon: 'Coins', path: '/danh-muc/khoan-muc' }],
  },
  'ngan-sach': {
    title: 'Nghiệp vụ ngân sách',
    rows: [[{ label: 'Kế hoạch ngân sách', icon: 'CalendarRange', path: '/ke-hoach/thu-chi' }, { label: 'Định mức chi phí', icon: 'Gauge', path: '/ke-hoach/dinh-muc' }, { label: 'Theo dõi thực hiện', icon: 'ChartColumn' }]],
    reports: [{ label: 'Tình hình thực hiện ngân sách' }],
    links: [{ label: 'Khoản mục chi phí', icon: 'Coins', path: '/danh-muc/khoan-muc' }, L.coCau],
  },
};
