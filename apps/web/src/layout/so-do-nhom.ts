// [2026-11-06 01:10 AM Nguyễn Văn Thủy] MENU — sơ đồ các bước và hàng Tiện ích của từng nhóm (đóng góp)
/**
 * SƠ ĐỒ TRANG CHỦ NHÓM: các bước nghiệp vụ theo hàng, nối với nhau bằng đường đứt. Một hàng là chuỗi việc nối tiếp; hai hàng là
 * các việc quanh một trục. Bước có nhiều loại phiếu thì khai `sub`, nút thành danh sách xổ. Icon lấy tên biểu tượng lucide.
 * Bước, mục con và liên kết chỉ hiện khi người dùng thấy được màn đó (đường dẫn có trong menu của họ).
 */
export interface SoDoNode { label: string; icon: string; path: string; sub?: { label: string; path: string }[] }
export interface SoDo { rows: SoDoNode[][]; links: { label: string; icon: string; path: string }[] }

const mua = (loai: string) => `/mua-hang/tong-hop?loai=${loai}`;
const THU = { label: 'Thu tiền', icon: 'ArrowDownLeft', path: '/nghiep-vu/phieu-thu', sub: [{ label: 'Phiếu thu', path: '/nghiep-vu/phieu-thu' }, { label: 'Phiếu báo có', path: '/nghiep-vu/phieu-bao-co' }] };
const CHI = { label: 'Chi tiền', icon: 'ArrowUpRight', path: '/nghiep-vu/phieu-chi', sub: [{ label: 'Phiếu chi', path: '/nghiep-vu/phieu-chi' }, { label: 'Phiếu báo nợ', path: '/nghiep-vu/phieu-bao-no' }] };
const MAT_HANG = { label: 'Mặt hàng', icon: 'Package', path: '/danh-muc/mat-hang' };
const NCC = { label: 'Nhà cung cấp', icon: 'Truck', path: '/mua-hang/nha-cung-cap' };
const KHACH = { label: 'Khách hàng', icon: 'User', path: '/danh-muc/khach-hang' };

export const SO_DO: Record<string, SoDo> = {
  tien: {
    rows: [[THU, CHI, { label: 'Chuyển tiền', icon: 'ArrowLeftRight', path: '/quy/phieu-chuyen-tien' }]],
    links: [{ label: 'Tài khoản ngân hàng', icon: 'Landmark', path: '/danh-muc/ngan-hang' }, { label: 'Hình thức thanh toán', icon: 'CreditCard', path: '/cau-hinh/hinh-thuc-thanh-toan' }, { label: 'Đối tượng', icon: 'Users', path: '/danh-muc/doi-tuong' }],
  },
  'mua-hang': {
    rows: [
      [
        { label: 'Phân tích đặt hàng', icon: 'ChartColumn', path: '/mua-hang/dat-hang' },
        { label: 'Đơn đặt hàng', icon: 'ClipboardList', path: mua('order') },
        { label: 'Nhập mua', icon: 'PackageCheck', path: mua('receipt'), sub: [{ label: 'Phiếu nhập mua', path: mua('receipt') }, { label: 'Quà tặng', path: mua('gift_in') }, { label: 'Chi phí mua hàng', path: mua('cost') }] },
        { label: 'Trả tiền NCC', icon: 'Banknote', path: mua('payment'), sub: [{ label: 'Trả tiền', path: mua('payment') }, { label: 'Ứng trước', path: mua('prepayment') }] },
      ],
      [
        { label: 'Hoá đơn đầu vào', icon: 'FileText', path: '/mua-hang/hoa-don-ncc' },
        { label: 'Trả, đổi hàng', icon: 'RotateCcw', path: mua('return') },
        { label: 'Chiết khấu sau mua', icon: 'BadgePercent', path: mua('rebate') },
        { label: 'Công nợ đến hạn', icon: 'CalendarClock', path: '/mua-hang/han-muc' },
      ],
    ],
    links: [NCC, MAT_HANG, { label: 'Chính sách mua', icon: 'Tags', path: '/mua-hang/chinh-sach' }, { label: 'Tồn max', icon: 'Gauge', path: '/mua-hang/ton-max' }, { label: 'Cài đặt mua hàng', icon: 'Settings', path: '/mua-hang/cai-dat' }],
  },
  'ban-hang': {
    rows: [[
      { label: 'Phiếu bán hàng', icon: 'Receipt', path: '/ban-hang/phieu-ban' },
      { label: 'Hàng bán trả lại', icon: 'RotateCcw', path: '/ban-hang/tra-lai' },
      { label: 'Xuất điều chỉnh', icon: 'FilePen', path: '/ban-hang/xuat-dieu-chinh' },
      THU,
    ]],
    links: [KHACH, MAT_HANG, { label: 'Bảng giá bán', icon: 'Tags', path: '/danh-muc/bang-gia' }, { label: 'Hình thức thanh toán', icon: 'CreditCard', path: '/cau-hinh/hinh-thuc-thanh-toan' }],
  },
  kho: {
    rows: [[
      { label: 'Chuyển kho', icon: 'ArrowLeftRight', path: '/kho/chuyen-kho' },
      { label: 'Tính giá vốn', icon: 'Calculator', path: '/nghiep-vu/tinh-gia-von' },
      { label: 'Nhập xuất tồn', icon: 'Boxes', path: '/bao-cao/nhap-xuat-ton' },
      { label: 'Sổ chi tiết hàng', icon: 'BookOpen', path: '/bao-cao/so-chi-tiet-hang-hoa' },
    ]],
    links: [{ label: 'Kho', icon: 'Warehouse', path: '/danh-muc/kho' }, MAT_HANG, { label: 'Đơn vị tính', icon: 'Ruler', path: '/danh-muc/don-vi-tinh' }, { label: 'Công thức giá vốn', icon: 'Sigma', path: '/nghiep-vu/cong-thuc-gia-von' }],
  },
  'cong-no': {
    rows: [
      [
        { label: 'Ghi tăng, giảm', icon: 'FilePlus', path: '/cong-no/phai-thu', sub: [{ label: 'Công nợ phải thu', path: '/cong-no/phai-thu' }, { label: 'Công nợ phải trả', path: '/cong-no/phai-tra' }] },
        { label: 'Đặt cọc, trả trước', icon: 'HandCoins', path: '/cong-no/dat-coc' },
        { label: 'Yêu cầu thanh toán', icon: 'Send', path: '/cong-no/yeu-cau-thanh-toan' },
      ],
      [
        { label: 'Khoản công nợ', icon: 'ListChecks', path: '/cong-no/khoan-cong-no' },
        { label: 'Cấn trừ', icon: 'Scale', path: '/nghiep-vu/can-tru-cong-no' },
        { label: 'Đối chiếu', icon: 'FileCheck', path: '/cong-no/doi-chieu' },
      ],
    ],
    links: [KHACH, { label: 'Nhà cung cấp', icon: 'Truck', path: '/danh-muc/nha-cung-cap' }, { label: 'Nhân viên', icon: 'IdCard', path: '/danh-muc/nhan-vien' }, { label: 'Chứng từ nguồn', icon: 'Files', path: '/cong-no/chung-tu-nguon' }],
  },
  'tai-san': {
    rows: [
      [
        { label: 'Ghi tăng', icon: 'CirclePlus', path: '/tai-san/tscd' },
        { label: 'Điều chuyển', icon: 'ArrowLeftRight', path: '/tai-san/dieu-chuyen' },
        { label: 'Tính khấu hao', icon: 'Timer', path: '/tai-san/khau-hao' },
        { label: 'Công cụ dụng cụ', icon: 'Hammer', path: '/tai-san/cong-cu', sub: [{ label: 'Công cụ dụng cụ', path: '/tai-san/cong-cu' }, { label: 'Chi phí trả trước', path: '/tai-san/chi-phi-tra-truoc' }] },
      ],
      [
        { label: 'Đánh giá lại', icon: 'Star', path: '/tai-san/danh-gia-lai' },
        { label: 'Ghi giảm', icon: 'CircleMinus', path: '/tai-san/ghi-giam' },
        { label: 'Kiểm kê', icon: 'ListChecks', path: '/tai-san/kiem-ke' },
      ],
    ],
    links: [{ label: 'Loại tài sản', icon: 'Shapes', path: '/danh-muc/loai-tai-san' }, { label: 'Nhóm công cụ', icon: 'Hammer', path: '/danh-muc/nhom-ccdc' }, { label: 'Nguồn vốn', icon: 'Coins', path: '/danh-muc/nguon-von' }, { label: 'Kế hoạch khấu hao', icon: 'CalendarRange', path: '/tai-san/ke-hoach-khau-hao' }],
  },
  thue: {
    rows: [[
      { label: 'Hoá đơn từ cơ quan thuế', icon: 'CloudDownload', path: '/thue/hoa-don-co-quan-thue' },
      { label: 'Hoá đơn rủi ro', icon: 'ShieldAlert', path: '/thue/hoa-don-rui-ro' },
      { label: 'Bổ sung thông tin', icon: 'FilePen', path: '/thue/bo-sung-thong-tin' },
      { label: 'Tờ khai GTGT', icon: 'FileText', path: '/thue/to-khai-gtgt' },
      { label: 'Quyết toán TNDN', icon: 'FileCheck', path: '/thue/quyet-toan-tndn' },
    ]],
    links: [{ label: 'Người nộp thuế', icon: 'Building2', path: '/thue/nguoi-nop-thue' }, { label: 'Loại thuế', icon: 'Percent', path: '/danh-muc/loai-thue' }],
  },
  'tong-hop': {
    rows: [[
      { label: 'Định khoản tự động', icon: 'Wand', path: '/chung-tu' },
      { label: 'Phiếu kế toán', icon: 'FilePen', path: '/nghiep-vu/phieu-ke-toan' },
      { label: 'Kết chuyển lãi lỗ', icon: 'ChartLine', path: '/nghiep-vu/ket-chuyen' },
      { label: 'Khoá sổ', icon: 'Lock', path: '/cau-hinh/ky-ke-toan' },
      { label: 'Báo cáo tài chính', icon: 'ChartColumn', path: '/bao-cao/can-doi-ke-toan' },
    ]],
    links: [{ label: 'Tài khoản', icon: 'BookOpen', path: '/danh-muc/tai-khoan' }, { label: 'Tài khoản ngầm định', icon: 'Link', path: '/cau-hinh/tai-khoan-ngam-dinh' }, { label: 'Khoản mục', icon: 'Coins', path: '/danh-muc/khoan-muc' }, { label: 'Bảng điều khiển', icon: 'LayoutDashboard', path: '/bang-dieu-khien' }],
  },
};
