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
/** Bước của sơ đồ nhóm chức năng: trỏ tới một mục của menu gọn (menu-gon.ts) theo nhãn, thẻ liệt kê các màn trong mục đó. */
export interface SoDoNhomBuoc { nhom: string; icon: string; ghiChu?: string; /** Màn của thẻ khai thẳng (không lấy theo mục menu). */ items?: { label: string; path: string }[];
  /** [2026-11-20 Nguyễn Văn Thủy] khoá việc cần làm (thiếu / lệch) gắn vào thẻ và nút lập phiếu của bước — trang chủ nhóm tự vẽ (đóng góp) */
  viec?: string[]; lap?: { label: string; path: string }[] }
/**
 * `nhom`: sơ đồ theo nhóm chức năng thay cho `rows` — các nhóm `chuoi` làm lần lượt, xong thì các nhóm `nhanh` làm song song.
 * Màn trong từng nhóm lấy đúng như menu (đã lọc theo quyền), khỏi khai hai nơi.
 */
export interface SoDo { title: string; rows: SoDoNode[][]; nhom?: { chuoi: SoDoNhomBuoc[]; nhanh: SoDoNhomBuoc[] }; reports?: SoDoReport[]; links: SoDoLink[] }

const mua = (loai: string) => `/mua-hang/tong-hop?loai=${loai}`;
const L = {
  khach: { label: 'Khách hàng', icon: 'User', path: '/danh-muc/khach-hang' },
  ncc: { label: 'Nhà cung cấp', icon: 'Truck', path: '/danh-muc/nha-cung-cap' },
  nhanVien: { label: 'Nhân viên', icon: 'IdCard', path: '/danh-muc/nhan-vien' },
  vthh: { label: 'Mặt hàng', icon: 'Package', path: '/danh-muc/mat-hang' },
  coCau: { label: 'Cơ cấu tổ chức', icon: 'Network', path: '/danh-muc/so-do-to-chuc' },
  tkNganHang: { label: 'Tài khoản ngân hàng', icon: 'Landmark', path: '/danh-muc/ngan-hang' },
} satisfies Record<string, SoDoLink>;

// [2026-11-17 Nguyễn Văn Thủy] SƠ ĐỒ RÚT GỌN V2 (mặc định khi vào Mua hàng / Bán hàng): thẻ theo bước như Danh mục — các bước làm
// lần lượt, cuối rẽ ra các việc làm song song; mỗi thẻ liệt kê màn bấm thẳng vào. Mua hàng còn giữ V1 (SO_DO, ?xem=rut-gon-v1) (đóng góp)
const ban = { khach: { label: 'Khách hàng', path: '/danh-muc/khach-hang' }, mh: { label: 'Mặt hàng', path: '/danh-muc/mat-hang' } };
export const SO_DO_V2: Record<string, SoDo> = {
  // [2026-11-18 Nguyễn Văn Thủy] theo quy trình mua hàng của kế toán: khai báo → ký hợp đồng (giá, chính sách) → kế hoạch → đặt & nhận →
  // hoá đơn, công nợ, thanh toán → trả hàng / quyết toán / thanh lý (đóng góp)
  // [2026-11-20 Nguyễn Văn Thủy] UX MUA HÀNG GỌN — đúng thứ tự quy trình (motamuahangsau): khai báo → kế hoạch → đơn đặt → nhận hàng, nhập kho
  // → hoá đơn & đối chiếu → công nợ, thanh toán; phát sinh: trả / đổi hàng, quyết toán. Danh mục chung (mặt hàng, nhóm hàng) ở nhóm Danh mục (đóng góp)
  'mua-hang': {
    title: 'Nghiệp vụ mua hàng — làm theo thứ tự',
    rows: [],
    nhom: {
      chuoi: [
        { nhom: 'Khai báo', icon: 'Settings', viec: ['ncc_dup_tax', 'ncc_no_tax', 'contract_expiring', 'contract_no_price'], items: [
          { label: 'Nhà cung cấp mua hàng', path: '/mua-hang/nha-cung-cap' }, { label: 'Hợp đồng mua hàng', path: '/mua-hang/hop-dong' },
          { label: 'Chính sách mua hàng', path: '/mua-hang/chinh-sach' }] },
        { nhom: 'Kế hoạch đặt hàng', icon: 'Gauge', items: [
          { label: 'Phiếu đăng ký tồn max (shop)', path: '/mua-hang/dang-ky-max' }, { label: 'Tồn max (kế toán mua hàng)', path: '/mua-hang/ton-max' },
          { label: 'Công thức đặt hàng', path: '/mua-hang/cong-thuc' }, { label: 'Phân tích đặt hàng', path: '/mua-hang/dat-hang' }] },
        { nhom: 'Đơn đặt hàng', icon: 'ClipboardList', viec: ['order_pending', 'blocked', 'order_no_contract', 'price_diff'], lap: [{ label: 'Đơn đặt', path: '/mua-hang/tong-hop?moi=order' }], items: [
          { label: 'Đơn mua hàng', path: mua('order') }, { label: 'Đơn chờ duyệt', path: '/mua-hang/tong-hop?loai=order&trang-thai=pending_approval' }] },
        { nhom: 'Nhận hàng, nhập kho', icon: 'PackageCheck', viec: ['orders', 'outside', 'expired', 'near'], lap: [{ label: 'Phiếu nhập', path: '/mua-hang/tong-hop?moi=receipt' }], items: [
          { label: 'Mua hàng (nhập kho)', path: mua('receipt') }, { label: 'Nhận / xuất quà tặng', path: mua('gift_in') },
          { label: 'Lô & hạn dùng', path: '/mua-hang/lo-han' }, { label: 'Chuyển hàng xuống shop', path: '/mua-hang/chuyen-shop' }] },
        { nhom: 'Hoá đơn & đối chiếu', icon: 'FileCheck2', viec: ['inv_late', 'receipt_no_invoice', 'inv_unmatched', 'inv_no_receipt', 'inv_wait', 'costs'], lap: [{ label: 'Chi phí', path: '/mua-hang/tong-hop?moi=cost' }], items: [
          { label: 'Xử lý hoá đơn đầu vào', path: '/mua-hang/hoa-don-ncc' }, { label: 'Tình hình thực hiện đơn mua hàng', path: '/mua-hang/doi-chieu' },
          { label: 'Chi phí mua hàng', path: mua('cost') }, { label: 'Phân bổ & giá vốn thực tế', path: '/mua-hang/phan-bo' }] },
        { nhom: 'Công nợ, thanh toán', icon: 'Banknote', viec: ['overdue', 'due', 'soon'], lap: [{ label: 'Trả tiền', path: '/mua-hang/tong-hop?moi=payment' }], items: [
          { label: 'Công nợ NCC', path: '/mua-hang/han-muc' }, { label: 'Công nợ theo hợp đồng', path: '/mua-hang/cong-no-hop-dong' },
          { label: 'Trả tiền nhà cung cấp', path: mua('payment') }, { label: 'Ứng trước nhà cung cấp', path: mua('prepayment') }] },
      ],
      nhanh: [
        { nhom: 'Trả / đổi hàng', icon: 'RotateCcw', viec: ['return_no_ref'], lap: [{ label: 'Trả hàng', path: '/mua-hang/tong-hop?moi=return' }], items: [
          { label: 'Trả lại hàng mua', path: mua('return') }, { label: 'Đổi hàng nhà cung cấp', path: mua('exchange') }] },
        { nhom: 'Quyết toán, thanh lý', icon: 'Award', viec: ['rebates', 'contract_expired', 'gifts'], items: [
          { label: 'Tính thưởng cuối kỳ', path: '/mua-hang/thuong' }, { label: 'Giảm giá hàng mua', path: mua('rebate') },
          { label: 'Quà tặng', path: '/mua-hang/qua-tang' }, { label: 'Thanh lý hợp đồng', path: '/mua-hang/hop-dong' }] },
      ],
    },
    links: [],
  },
  'ban-hang': {
    title: 'Nghiệp vụ bán hàng — làm theo thứ tự',
    rows: [],
    nhom: {
      chuoi: [
        { nhom: 'Khai báo', icon: 'Settings', ghiChu: 'Khách hàng, mặt hàng, thanh toán', items: [
          ban.khach, { label: 'Nhóm khách hàng, nhà cung cấp', path: '/danh-muc/nhom-doi-tuong' }, ban.mh,
          { label: 'Hình thức thanh toán', path: '/cau-hinh/hinh-thuc-thanh-toan' }] },
        { nhom: 'Giá & khuyến mại', icon: 'BadgePercent', ghiChu: 'Bảng giá, chương trình, máy bán', items: [
          { label: 'Bảng giá bán', path: '/danh-muc/bang-gia' }, { label: 'Chương trình khuyến mại', path: '/app/pos/khuyen-mai' },
          { label: 'Cài đặt máy bán', path: '/app/pos/cai-dat' }] },
        { nhom: 'Bán hàng', icon: 'ShoppingCart', ghiChu: 'Phiếu bán, máy bán POS, ca bán', items: [
          { label: 'Phiếu bán hàng', path: '/ban-hang/phieu-ban' }, { label: 'Đơn bán máy POS', path: '/app/pos/don-ban' },
          { label: 'Ca bán', path: '/app/pos/ca-ban' }, { label: 'Tổng quan máy bán', path: '/app/pos/tong-quan' }] },
        { nhom: 'Thu tiền & công nợ', icon: 'Wallet', ghiChu: 'Thu theo hình thức, đối chiếu', items: [
          { label: 'Thu tiền theo hình thức thanh toán', path: '/ban-hang/thu-tien' }, { label: 'Thu tiền mặt', path: '/nghiep-vu/phieu-thu' },
          { label: 'Thu tiền gửi', path: '/nghiep-vu/phieu-bao-co' }, { label: 'Đối chiếu công nợ', path: '/cong-no/doi-chieu' }] },
      ],
      nhanh: [
        { nhom: 'Trả lại hàng', icon: 'RotateCcw', items: [
          { label: 'Hàng bán trả lại', path: '/ban-hang/tra-lai' }, { label: 'Trả hàng máy POS', path: '/app/pos/tra-hang' }] },
        { nhom: 'Doanh số, lãi gộp', icon: 'ChartColumn', items: [
          { label: 'Báo cáo bán hàng', path: '/ban-hang/bao-cao' }, { label: 'Tổng hợp bán hàng', path: '/ban-hang/tong-hop' },
          { label: 'Lãi gộp', path: '/ban-hang/lai-gop' }, { label: 'Báo cáo thu tiền bán hàng', path: '/ban-hang/thu-tien-ban-hang' },
          { label: 'Sổ nhật ký bán hàng', path: '/cong-no/nhat-ky-ban-hang' }] },
        { nhom: 'Công nợ phải thu', icon: 'Users', items: [
          { label: 'Tổng hợp công nợ phải thu', path: '/bao-cao/cong-no-phai-thu' }, { label: 'Chi tiết công nợ phải thu', path: '/bao-cao/chi-tiet-cong-no-phai-thu' },
          { label: 'Công nợ theo hạn', path: '/bao-cao/cong-no-theo-han' }, { label: 'Tuổi nợ', path: '/bao-cao/tuoi-no' }] },
        { nhom: 'Thuế đầu ra', icon: 'Percent', items: [{ label: 'Báo cáo thuế ra', path: '/thue/bang-ke-ban-ra' }] },
      ],
    },
    links: [],
  },
};

export const SO_DO: Record<string, SoDo> = {
  'tien-mat': {
    title: 'Nghiệp vụ tiền mặt',
    rows: [
      [{ label: 'Thu tiền', icon: 'ArrowDownLeft', path: '/nghiep-vu/phieu-thu' }, { label: 'Kiểm kê quỹ', icon: 'ListChecks' }],
      [{ label: 'Đề nghị chi tiền', icon: 'Send' }, { label: 'Chi tiền', icon: 'ArrowUpRight', path: '/nghiep-vu/phieu-chi' }],
    ],
    reports: [
      { label: 'Bảng kê số dư tiền theo ngày', path: '/quy/so-du-tien' }, { label: 'Dòng tiền', path: '/quy/dong-tien' }, { label: 'Sổ nhật ký thu tiền', path: '/quy/nhat-ky-thu-tien' },
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
  // [2026-11-13 Nguyễn Văn Thủy] Danh mục theo góc người quản trị: khai báo → cấu hình → phân quyền → báo cáo tổng hợp (đóng góp)
  // [2026-11-16 kiennt] sơ đồ theo nhóm chức năng của menu: Tổ chức → Đối tượng → Tài khoản, ngân hàng → Chi phí · Mặt hàng · Tài sản · Thuế suất (đóng góp)
  'danh-muc': {
    title: 'Khai báo danh mục — làm theo thứ tự',
    rows: [],
    nhom: {
      chuoi: [
        { nhom: 'Tổ chức', icon: 'Network', ghiChu: 'Chi nhánh, kho, phòng ban' },
        { nhom: 'Đối tượng', icon: 'Users', ghiChu: 'Khách hàng, nhà cung cấp, nhân viên' },
        { nhom: 'Tài khoản, ngân hàng', icon: 'Landmark', ghiChu: 'Tài khoản kế toán, tiền' },
      ],
      nhanh: [
        { nhom: 'Chi phí', icon: 'Coins' },
        { nhom: 'Mặt hàng', icon: 'Package' },
        { nhom: 'Tài sản', icon: 'Building2' },
        { nhom: 'Thuế suất', icon: 'Percent' },
      ],
    },
    reports: [
      { label: 'Kết quả kinh doanh nhiều chi nhánh', path: '/bao-cao/ket-qua-nhieu-chi-nhanh' }, { label: 'Tồn kho nhiều kho', path: '/bao-cao/ton-nhieu-kho' },
      { label: 'Cân đối tài khoản nhiều chi nhánh', path: '/bao-cao/can-doi-tk-nhieu-chi-nhanh' }, { label: 'Kết quả theo cửa hàng', path: '/bao-cao/ket-qua-theo-cua-hang' },
    ],
    links: [{ label: 'Nhập từ Excel', icon: 'FileSpreadsheet', path: '/tien-ich/nhap-excel' }, { label: 'Dữ liệu gốc', icon: 'RotateCcw', path: '/tien-ich/du-lieu-goc' }],
  },
  // [2026-11-15 Nguyễn Văn Thủy] sơ đồ rút gọn theo đúng các bước của Luồng chi tiết; bỏ ô chưa dùng (hợp đồng mua hàng) (đóng góp)
  'mua-hang': {
    title: 'Nghiệp vụ mua hàng',
    rows: [
      [
        { label: 'Tồn max', icon: 'Gauge', path: '/mua-hang/ton-max', sub: [{ label: 'Tồn max (kế toán mua hàng)', path: '/mua-hang/ton-max' }, { label: 'Phiếu đăng ký tồn max (shop)', path: '/mua-hang/dang-ky-max' }] },
        { label: 'Phân tích đặt hàng', icon: 'ChartColumn', path: '/mua-hang/dat-hang' },
        { label: 'Đơn mua hàng', icon: 'ClipboardList', path: mua('order') },
        { label: 'Nhận hàng hóa, dịch vụ', icon: 'PackageCheck', path: mua('receipt'), sub: [{ label: 'Mua hàng', path: mua('receipt') }, { label: 'Quà tặng', path: mua('gift_in') }, { label: 'Chi phí mua hàng', path: mua('cost') }] },
        { label: 'Xử lý hóa đơn đầu vào', icon: 'FileText', path: '/mua-hang/hoa-don-ncc' },
        { label: 'Trả tiền theo hóa đơn', icon: 'Banknote', path: mua('payment'), sub: [{ label: 'Trả tiền', path: mua('payment') }, { label: 'Ứng trước', path: mua('prepayment') }] },
      ],
      [
        { label: 'Chuyển hàng xuống shop', icon: 'Store', path: '/mua-hang/chuyen-shop' },
        { label: 'Trả lại hàng mua', icon: 'RotateCcw', path: mua('return'), sub: [{ label: 'Trả lại hàng mua', path: mua('return') }, { label: 'Đổi hàng', path: mua('exchange') }] },
        { label: 'Giảm giá, thưởng', icon: 'BadgePercent', path: mua('rebate'), sub: [{ label: 'Giảm giá hàng mua', path: mua('rebate') }, { label: 'Tính thưởng cuối kỳ', path: '/mua-hang/thuong' }] },
        { label: 'Công nợ đến hạn', icon: 'CalendarClock', path: '/mua-hang/han-muc' },
        { label: 'Giá vốn thực tế', icon: 'Calculator', path: '/mua-hang/phan-bo' },
      ],
    ],
    reports: [
      { label: 'Sổ chi tiết mua hàng', path: '/mua-hang/bao-cao' }, { label: 'Chi tiết công nợ phải trả nhà cung cấp', path: '/bao-cao/chi-tiet-thanh-toan' },
      { label: 'Tổng hợp mua hàng theo mặt hàng', path: '/mua-hang/tong-hop-mat-hang' }, { label: 'Tổng hợp công nợ phải trả nhà cung cấp', path: '/bao-cao/cong-no-phai-tra' },
      { label: 'Biên bản đối chiếu và xác nhận công nợ phải trả', path: '/cong-no/doi-chieu' },
    ],
    links: [{ label: 'Nhà cung cấp', icon: 'Truck', path: '/mua-hang/nha-cung-cap' }, L.vthh, { label: 'Hợp đồng mua', icon: 'FileSignature', path: '/mua-hang/hop-dong' }, { label: 'Chính sách mua', icon: 'Tags', path: '/mua-hang/chinh-sach' }, { label: 'Công thức đặt hàng', icon: 'Sigma', path: '/mua-hang/cong-thuc' }, { label: 'Cài đặt mua hàng', icon: 'Settings', path: '/mua-hang/cai-dat' }],
  },
  'ban-hang': {
    title: 'Nghiệp vụ bán hàng',
    rows: [
      [
        { label: 'Bán hàng', icon: 'Receipt', path: '/ban-hang/phieu-ban' },
        { label: 'Thu tiền theo hóa đơn', icon: 'ArrowDownLeft', path: '/nghiep-vu/phieu-thu', sub: [{ label: 'Thu tiền mặt', path: '/nghiep-vu/phieu-thu' }, { label: 'Thu tiền gửi', path: '/nghiep-vu/phieu-bao-co' }] },
      ],
      [{ label: 'Trả lại hàng bán', icon: 'RotateCcw', path: '/ban-hang/tra-lai' }],
    ],
    reports: [
      { label: 'Sổ chi tiết bán hàng', path: '/ban-hang/bao-cao' }, { label: 'Chi tiết công nợ phải thu khách hàng', path: '/bao-cao/chi-tiet-cong-no-phai-thu' },
      { label: 'Tổng hợp bán hàng', path: '/ban-hang/tong-hop' }, { label: 'Tổng hợp công nợ phải thu khách hàng', path: '/bao-cao/cong-no-phai-thu' },
      { label: 'Lãi gộp theo mặt hàng', path: '/ban-hang/lai-gop' },
    ],
    links: [L.khach, L.vthh, { label: 'Bảng giá bán', icon: 'Tags', path: '/danh-muc/bang-gia' }],
  },
  kho: {
    title: 'Nghiệp vụ kho',
    rows: [
      [{ label: 'Xuất kho', icon: 'PackageMinus', path: '/ban-hang/xuat-dieu-chinh' }, { label: 'Chuyển kho', icon: 'ArrowLeftRight', path: '/kho/chuyen-kho' }],
      [{ label: 'Nhập kho', icon: 'PackagePlus' }, { label: 'Tính giá vốn', icon: 'Calculator', path: '/nghiep-vu/tinh-gia-von' }, { label: 'Kiểm kê', icon: 'ListChecks', path: '/kho/kiem-ke' }],
    ],
    reports: [
      { label: 'Sổ chi tiết vật tư hàng hóa', path: '/bao-cao/so-chi-tiet-hang-hoa' }, { label: 'Tổng hợp tồn kho', path: '/bao-cao/nhap-xuat-ton' },
      { label: 'Tổng hợp tồn kho theo lô', path: '/kho/ton-theo-lo' }, { label: 'Sổ chuyển kho nội bộ', path: '/bao-cao/chuyen-kho' },
      { label: 'Đối chiếu kho và sổ cái', path: '/kho/doi-chieu-so-cai' },
    ],
    links: [{ label: 'Cơ cấu tổ chức (kho)', icon: 'Network', path: '/danh-muc/so-do-to-chuc' }, { label: 'Loại kho', icon: 'Layers', path: '/danh-muc/loai-kho' }, L.vthh, { label: 'Đơn vị tính', icon: 'Ruler', path: '/danh-muc/don-vi-tinh' }],
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
      [{ label: 'Chứng từ nghiệp vụ khác', icon: 'FilePen', path: '/nghiep-vu/phieu-ke-toan' }, { label: 'Lập báo cáo tài chính', icon: 'ChartColumn', path: '/tong-hop/lap-bctc' }],
    ],
    reports: [
      { label: 'Sổ chi tiết các tài khoản', path: '/bao-cao/so-chi-tiet' }, { label: 'Sổ nhật ký chung', path: '/bao-cao/nhat-ky-chung' },
      { label: 'Tổng hợp công nợ nhân viên', path: '/bao-cao/cong-no-theo-nhan-vien' }, { label: 'Tổng hợp công nợ theo đối tượng', path: '/bao-cao/cong-no' },
      { label: 'Báo cáo tình hình tài chính', path: '/bao-cao/can-doi-ke-toan' },
    ],
    links: [{ label: 'Hệ thống tài khoản', icon: 'BookOpen', path: '/danh-muc/tai-khoan' }, { label: 'Tài khoản ngầm định', icon: 'Link', path: '/cau-hinh/quy-tac-hach-toan' }, { label: 'Khoản mục chi phí', icon: 'Coins', path: '/danh-muc/khoan-muc' }],
  },
  'ngan-sach': {
    title: 'Nghiệp vụ ngân sách',
    rows: [[{ label: 'Kế hoạch ngân sách', icon: 'CalendarRange', path: '/ke-hoach/thu-chi' }, { label: 'Định mức chi phí', icon: 'Gauge', path: '/ke-hoach/dinh-muc' }, { label: 'Theo dõi thực hiện', icon: 'ChartColumn' }]],
    reports: [{ label: 'Tình hình thực hiện ngân sách' }],
    links: [{ label: 'Khoản mục chi phí', icon: 'Coins', path: '/danh-muc/khoan-muc' }, L.coCau],
  },
};
