// [2026-11-05 11:50 PM Nguyễn Văn Thủy] MENU — bố trí gọn: nhóm theo việc, thẻ đầu trang, báo cáo gom một trang (đóng góp)
// [2026-11-11 Nguyễn Văn Thủy] MENU — xếp lại theo phân hệ kế toán chuẩn (Tiền mặt … Số dư ban đầu), việc chưa có ghi "đang phát triển", nhóm Phần riêng gắn thêm, Thiết lập ra khỏi menu trái (đóng góp)
/**
 * BỐ TRÍ MENU GỌN: chỉ quyết định màn nằm ở đâu, không khai màn mới.
 * Tên, mã, quyền của từng màn lấy từ menu.ts của phân hệ; tên hiển thị đặt ở ten-man.ts.
 *  - sections: các mục bung ra khi bấm nhóm ở menu trái; `soon` = việc chưa có màn, hiện mờ "đang phát triển".
 *  - the: các mục hiện thành thẻ đầu trang khi đang ở trong nhóm (thẻ "Báo cáo" tự thêm cuối nếu nhóm có báo cáo).
 *  - reports: báo cáo của nhóm, nằm ở trang /bao-cao, không nằm trong menu trái.
 *  - rieng: nhóm Phần riêng (lớp gắn thêm cho chuỗi cửa hàng) — ẩn khi đơn vị tắt khoá bizcity.ui.phan_rieng.
 *  - an: không hiện ở menu trái / Tổng quan (Thiết lập mở bằng nút bánh răng); màn vẫn tìm được bằng Ctrl + K.
 * Màn có trong menu.ts mà chưa xếp ở đây thì tự vào mục "Khác" của Thiết lập, nên không bao giờ bị mất lối vào.
 */
import type { MenuItem } from '@ketoan/contracts';
import { isSection } from './menu-helpers';

export interface GonSection { label?: string; paths: string[]; soon?: string[] }
export interface GonDef {
  key: string;
  label: string;
  icon: string;
  /** Mô tả và màu của ô trên trang Tổng quan. */
  description: string;
  color: string;
  /** Phân hệ ứng với nhóm: lấy sơ đồ quy trình chi tiết và thẻ Trụ cột ở trang chủ nhóm. */
  module?: string;
  homeLabel?: string;
  the?: string[];
  sections: GonSection[];
  reports?: GonSection[];
  rieng?: boolean;
  an?: boolean;
}
export interface GonResolvedSection { label?: string; items: MenuItem[]; soon?: string[] }
export interface GonGroup extends Omit<GonDef, 'sections' | 'reports' | 'the'> {
  home: string;
  the: MenuItem[];
  sections: GonResolvedSection[];
  reports: GonResolvedSection[];
}

export const REPORT_PAGE = '/bao-cao';
export const groupHome = (key: string) => `/nhom/${key}`;
/** Nhóm Thiết lập: không ở menu trái, mở bằng nút bánh răng; màn chưa xếp nhóm nào cũng vào đây. */
export const THIET_LAP = 'he-thong';
export const DANG_PHAT_TRIEN = 'đang phát triển';

const MUA = (loai: string) => `/mua-hang/tong-hop?loai=${loai}`;

export const GON_DEFS: GonDef[] = [
  {
    key: 'tien-mat', label: 'Tiền mặt', icon: 'Banknote', description: 'Thu tiền, chi tiền, sổ quỹ tiền mặt', color: '#0f9d58', module: 'quy', homeLabel: 'Quy trình',
    the: ['/quy/thu-chi'],
    sections: [{ paths: ['/quy/thu-chi'], soon: ['Đề nghị chi tiền', 'Kiểm kê quỹ'] }],
    reports: [{ label: 'Tiền mặt', paths: ['/quy/so-du-tien', '/quy/nhat-ky-thu-tien', '/quy/so-chi-tiet-quy', '/quy/nhat-ky-chi-tien', '/quy/so-quy-tien-mat', '/quy/dong-tien'] }],
  },
  {
    key: 'tien-gui', label: 'Tiền gửi', icon: 'Landmark', description: 'Thu, chi tiền gửi, chuyển tiền nội bộ, sổ tiền gửi', color: '#0b8a7a', module: 'quy', homeLabel: 'Quy trình',
    the: ['/quy/thu-chi-tien-gui', '/quy/phieu-chuyen-tien'],
    sections: [{ paths: ['/quy/thu-chi-tien-gui', '/quy/phieu-chuyen-tien'], soon: ['Đối chiếu ngân hàng'] }],
    reports: [{ label: 'Tiền gửi', paths: ['/quy/so-tien-gui', '/quy/so-du-ngan-hang', '/quy/so-du-tien', '/quy/chuyen-tien-noi-bo', '/bao-cao/tien-vay'] }],
  },
  {
    key: 'mua-hang', label: 'Mua hàng', icon: 'ShoppingBag', description: 'Đơn mua hàng, mua hàng, trả lại, giảm giá, hóa đơn đầu vào', color: '#e8710a', module: 'mua-hang', homeLabel: 'Quy trình',
    the: [MUA('order'), MUA('receipt'), MUA('return'), MUA('rebate'), '/mua-hang/hoa-don-ncc', '/danh-muc/nha-cung-cap'],
    sections: [
      { paths: [MUA('order'), MUA('receipt'), MUA('return'), MUA('rebate'), '/mua-hang/tong-hop'], soon: ['Hợp đồng mua hàng'] },
      { label: 'Hóa đơn đầu vào', paths: ['/mua-hang/hoa-don-ncc', '/thue/hoa-don-co-quan-thue'] },
      { label: 'Danh mục', paths: ['/danh-muc/nha-cung-cap', '/danh-muc/mat-hang'] },
    ],
    reports: [
      { label: 'Mua hàng', paths: ['/mua-hang/bao-cao', '/mua-hang/tong-hop-mat-hang', '/bao-cao/nhat-ky-mua-hang', '/mua-hang/doi-chieu'] },
      { label: 'Công nợ phải trả', paths: ['/bao-cao/cong-no-phai-tra', '/bao-cao/chi-tiet-thanh-toan', '/bao-cao/tuoi-no', '/cong-no/doi-chieu'] },
    ],
  },
  {
    key: 'ban-hang', label: 'Bán hàng', icon: 'ShoppingCart', description: 'Bán hàng, trả lại hàng bán, công nợ phải thu', color: '#d93025', module: 'ban-hang', homeLabel: 'Quy trình',
    the: ['/ban-hang/phieu-ban', '/ban-hang/tra-lai', '/danh-muc/khach-hang'],
    sections: [
      { paths: ['/ban-hang/phieu-ban', '/ban-hang/tra-lai'], soon: ['Đơn đặt hàng', 'Giảm giá hàng bán'] },
      { label: 'Danh mục', paths: ['/danh-muc/khach-hang', '/danh-muc/bang-gia'] },
    ],
    reports: [
      { label: 'Bán hàng', paths: ['/ban-hang/bao-cao', '/ban-hang/tong-hop', '/cong-no/nhat-ky-ban-hang', '/ban-hang/lai-gop', '/ban-hang/thu-tien-ban-hang'] },
      { label: 'Công nợ phải thu', paths: ['/bao-cao/cong-no-phai-thu', '/bao-cao/chi-tiet-cong-no-phai-thu', '/bao-cao/cong-no-theo-han', '/bao-cao/tuoi-no', '/bao-cao/tuoi-no-trong-han', '/bao-cao/tuoi-no-qua-han', '/bao-cao/cong-no-theo-mat-hang', '/cong-no/doi-chieu'] },
    ],
  },
  {
    key: 'kho', label: 'Kho', icon: 'Warehouse', description: 'Nhập kho, xuất kho, chuyển kho, tính giá xuất kho', color: '#7b1fa2', module: 'kho', homeLabel: 'Quy trình',
    the: ['/ban-hang/xuat-dieu-chinh', '/kho/chuyen-kho', '/nghiep-vu/tinh-gia-von'],
    sections: [
      { paths: ['/ban-hang/xuat-dieu-chinh', '/kho/chuyen-kho', '/nghiep-vu/tinh-gia-von'], soon: ['Nhập kho', 'Xuất kho', 'Kiểm kê kho'] },
      { label: 'Danh mục', paths: ['/danh-muc/mat-hang', '/danh-muc/kho', '/danh-muc/don-vi-tinh'] },
    ],
    reports: [{ label: 'Kho', paths: ['/bao-cao/so-chi-tiet-hang-hoa', '/bao-cao/nhap-xuat-ton', '/bao-cao/ton-nhieu-kho', '/kho/the-kho', '/kho/ton-theo-lo', '/bao-cao/chuyen-kho', '/kho/doi-chieu-so-cai'] }],
  },
  {
    key: 'ccdc', label: 'Công cụ dụng cụ', icon: 'Hammer', description: 'Ghi tăng, phân bổ công cụ dụng cụ, chi phí trả trước', color: '#00838f', module: 'tai-san', homeLabel: 'Quy trình',
    the: ['/tai-san/cong-cu', '/tai-san/chi-phi-tra-truoc'],
    sections: [{ paths: ['/tai-san/cong-cu', '/tai-san/chi-phi-tra-truoc'], soon: ['Điều chuyển công cụ dụng cụ', 'Ghi giảm công cụ dụng cụ', 'Kiểm kê công cụ dụng cụ'] }],
    reports: [{ label: 'Công cụ dụng cụ', paths: ['/bao-cao/phan-bo-chi-phi', '/bao-cao/theo-doi-tscd-ccdc'] }],
  },
  {
    key: 'tscd', label: 'Tài sản cố định', icon: 'Building2', description: 'Ghi tăng, khấu hao, đánh giá lại, điều chuyển, ghi giảm, kiểm kê', color: '#00695c', module: 'tai-san', homeLabel: 'Quy trình',
    the: ['/tai-san/tscd', '/tai-san/khau-hao', '/tai-san/danh-gia-lai', '/tai-san/dieu-chuyen', '/tai-san/ghi-giam', '/tai-san/kiem-ke'],
    sections: [{ paths: ['/tai-san/tscd', '/tai-san/khau-hao', '/tai-san/danh-gia-lai', '/tai-san/dieu-chuyen', '/tai-san/ghi-giam', '/tai-san/kiem-ke'] }],
    reports: [{ label: 'Tài sản cố định', paths: ['/bao-cao/so-tai-san', '/bao-cao/tai-san', '/bao-cao/theo-doi-tscd-ccdc'], soon: ['Thẻ tài sản cố định', 'Bảng tính khấu hao tài sản cố định'] }],
  },
  {
    key: 'thue', label: 'Thuế', icon: 'Percent', description: 'Khai thuế GTGT, quyết toán TNDN, bảng kê hóa đơn', color: '#5d4037', module: 'thue',
    the: ['/thue/to-khai-gtgt', '/thue/quyet-toan-tndn', '/thue/hoa-don-rui-ro'],
    sections: [
      { label: 'Khai thuế', paths: ['/thue/to-khai-gtgt', '/thue/quyet-toan-tndn', '/thue/bo-sung-thong-tin', '/thue/nguoi-nop-thue'], soon: ['Giấy nộp tiền vào ngân sách'] },
      { paths: ['/thue/hoa-don-rui-ro'] },
    ],
    reports: [{ label: 'Thuế', paths: ['/thue/bang-ke-ban-ra', '/thue/bang-ke-mua-vao', '/thue/tong-hop'] }],
  },
  {
    key: 'tong-hop', label: 'Tổng hợp', icon: 'Network', description: 'Chứng từ nghiệp vụ khác, kết chuyển lãi lỗ, khóa sổ, báo cáo tài chính', color: '#1f66a3', module: 'ke-toan', homeLabel: 'Quy trình',
    the: ['/nghiep-vu/phieu-ke-toan', '/nghiep-vu/ket-chuyen', '/cau-hinh/ky-ke-toan'],
    sections: [{ paths: ['/nghiep-vu/phieu-ke-toan', '/nghiep-vu/ket-chuyen', '/cau-hinh/ky-ke-toan'], soon: ['Đề nghị quyết toán tạm ứng', 'Lập báo cáo tài chính'] }],
    reports: [
      { label: 'Sổ kế toán', paths: ['/bao-cao/so-chi-tiet', '/bao-cao/nhat-ky-chung', '/bao-cao/so-cai', '/bao-cao/bang-ke-chung-tu', '/bao-cao/tong-hop-chung-tu'] },
      { label: 'Báo cáo tài chính', paths: ['/bao-cao/can-doi-ke-toan', '/bao-cao/ket-qua-kinh-doanh', '/bao-cao/luu-chuyen-tien-te', '/bao-cao/thuyet-minh', '/bao-cao/can-doi-phat-sinh'] },
      { label: 'Công nợ', paths: ['/bao-cao/cong-no-theo-nhan-vien', '/bao-cao/cong-no', '/bao-cao/so-chi-tiet-cong-no', '/bao-cao/tien-vay', '/bao-cao/lich-thanh-toan-hop-dong'] },
      { label: 'Chi phí, hợp đồng', paths: ['/bao-cao/chi-phi-khoan-muc', '/bao-cao/chi-tiet-chi-phi-khoan-muc', '/bao-cao/tk-chi-phi-khoan-muc', '/bao-cao/tong-hop-nv-hd-pb', '/bao-cao/lai-lo-hop-dong', '/bao-cao/lai-lo-hop-dong-chi-tiet'] },
      { label: 'Vốn chủ sở hữu', paths: ['/bao-cao/nguon-von'] },
    ],
  },
  {
    key: 'ngan-sach', label: 'Ngân sách', icon: 'PiggyBank', description: 'Kế hoạch ngân sách, định mức chi phí', color: '#6a1b9a',
    the: ['/ke-hoach/thu-chi', '/ke-hoach/dinh-muc'],
    sections: [{ paths: ['/ke-hoach/thu-chi', '/ke-hoach/dinh-muc'] }],
    reports: [{ label: 'Ngân sách', paths: [], soon: ['Tình hình thực hiện ngân sách'] }],
  },
  {
    key: 'phan-tich', label: 'Phân tích tài chính', icon: 'ChartLine', description: 'Doanh thu, chi phí, lợi nhuận, chỉ số tài chính', color: '#283593',
    sections: [{ paths: ['/bang-dieu-khien'] }],
    reports: [{ label: 'Theo nhiều chi nhánh', paths: ['/bao-cao/ket-qua-nhieu-chi-nhanh', '/bao-cao/can-doi-tk-nhieu-chi-nhanh', '/bao-cao/ton-nhieu-kho', '/bao-cao/ket-qua-theo-cua-hang'] }],
  },
  {
    key: 'danh-muc', label: 'Danh mục', icon: 'List', description: 'Đối tượng, vật tư hàng hóa, tổ chức, tài khoản, chi phí, tài sản', color: '#0d7a6f', module: 'danh-muc',
    sections: [
      { label: 'Đối tượng', paths: ['/danh-muc/khach-hang', '/danh-muc/nha-cung-cap', '/danh-muc/nhan-vien', '/danh-muc/nhom-doi-tuong'] },
      { label: 'Vật tư hàng hóa', paths: ['/danh-muc/mat-hang', '/danh-muc/phan-loai-hang', '/danh-muc/kho', '/danh-muc/don-vi-tinh', '/danh-muc/bang-gia'] },
      { label: 'Tổ chức', paths: ['/danh-muc/so-do-to-chuc', '/danh-muc/chi-nhanh', '/danh-muc/bo-phan'] },
      { label: 'Tài khoản, ngân hàng', paths: ['/danh-muc/tai-khoan', '/cau-hinh/tai-khoan-ngam-dinh', '/danh-muc/loai-thue', '/danh-muc/ngan-hang', '/cau-hinh/ly-do', '/cau-hinh/nhom-hach-toan'], soon: ['Điều khoản thanh toán'] },
      { label: 'Chi phí', paths: ['/danh-muc/khoan-muc', '/danh-muc/muc-thu-chi', '/danh-muc/hop-dong', '/danh-muc/vu-viec', '/danh-muc/du-an'] },
      { label: 'Tài sản', paths: ['/danh-muc/loai-tai-san', '/danh-muc/nhom-ccdc', '/danh-muc/nguon-von', '/danh-muc/muc-dich-su-dung'] },
    ],
  },
  {
    key: 'so-du', label: 'Số dư ban đầu', icon: 'ListEnd', description: 'Số dư tài khoản, công nợ, tồn kho, tài sản đầu kỳ', color: '#6d4c41',
    sections: [{ paths: ['/nghiep-vu/so-du-tai-khoan'], soon: ['Số dư tài khoản ngân hàng', 'Công nợ khách hàng', 'Công nợ nhà cung cấp', 'Công nợ nhân viên', 'Tồn kho vật tư, hàng hóa', 'Công cụ dụng cụ đầu kỳ', 'Tài sản cố định đầu kỳ', 'Chi phí trả trước đầu kỳ'] }],
  },
  {
    key: 'phan-rieng', label: 'Phần riêng', icon: 'Puzzle', rieng: true, color: '#455a64',
    description: 'Chức năng gắn thêm cho chuỗi cửa hàng: nạp chứng từ từ máy bán hàng, tồn max, chính sách mua, công nợ nội bộ',
    sections: [
      { label: 'Nạp chứng từ', paths: ['/chung-tu', '/chung-tu/bang-diem', '/he-thong/chi-nhanh-lam-viec', '/mua-hang/khoi-dau'] },
      { label: 'Đặt hàng theo tồn max', paths: ['/mua-hang/dat-hang', '/mua-hang/ton-max', '/mua-hang/dang-ky-max', '/mua-hang/cong-thuc', '/mua-hang/chuyen-shop'] },
      { label: 'Chính sách mua', paths: ['/mua-hang/chinh-sach', '/mua-hang/han-muc', '/mua-hang/thuong', '/mua-hang/phan-bo', '/mua-hang/lo-han', '/mua-hang/qua-tang', '/mua-hang/nhat-ky', '/mua-hang/cai-dat', '/mua-hang/bien-the', '/mua-hang/dvt-thung'] },
      { label: 'Bán lẻ, giá vốn', paths: ['/ban-hang/chuong-trinh', '/ban-hang/thu-tien', '/cau-hinh/hinh-thuc-thanh-toan', '/nghiep-vu/cong-thuc-gia-von', '/tai-san/ke-hoach-khau-hao'] },
      { label: 'Công nợ', paths: ['/cong-no/khoan-cong-no', '/cong-no/phai-thu', '/cong-no/phai-tra', '/nghiep-vu/can-tru-cong-no', '/cong-no/dat-coc', '/cong-no/yeu-cau-thanh-toan', '/cong-no/chung-tu-nguon', '/cong-no/doi-chieu'] },
    ],
    reports: [
      { label: 'Phần riêng', paths: ['/mua-hang/ton-kho', '/mua-hang/so-kho', '/mua-hang/chi-tiet-chinh-sach', '/bao-cao/hanh-trinh-mat-hang', '/bao-cao/ket-qua-theo-cua-hang', '/bao-cao/phan-loai-dai-han', '/bao-cao/cong-no-noi-bo', '/bao-cao/cong-no-noi-bo-chi-tiet', '/quy/nhat-ky-chi-tien-khoan-muc'] },
    ],
  },
  {
    key: THIET_LAP, label: 'Thiết lập', icon: 'Settings', an: true, description: 'Thông tin đơn vị, người dùng, mẫu in, cấu hình, công cụ quản trị', color: '#546e7a', module: 'he-thong',
    sections: [
      { label: 'Đơn vị', paths: ['/cau-hinh/don-vi', '/cau-hinh/mau-in', '/cau-hinh/bao-cao-chung-tu', '/cau-hinh/khoi-anh'] },
      { label: 'Người dùng', paths: ['/cau-hinh/nguoi-dung', '/app/phan-quyen/vai-tro', '/cau-hinh/khoa-api'] },
      { label: 'Cấu hình', paths: ['/he-thong/cau-hinh', '/he-thong/chinh-sach', '/he-thong/quy-dinh-danh-muc', '/tien-ich/nhap-excel', '/tien-ich/du-lieu-goc', '/tien-ich/add-in', '/app/thu-vien/kho', '/addins/spreadsheet-ai', '/addins/tro-ly'] },
      { label: 'Kiểm tra dữ liệu', paths: ['/he-thong/kiem-chuan', '/he-thong/ho-so-ke-toan', '/he-thong/ban-danh-gia', '/he-thong/tru-cot', '/bao-cao/kiem-tra-chung-tu', '/tien-ich/ct-mat-lien-ket', '/tien-ich/ct-lech-than-chi-tiet', '/tien-ich/ct-lech-phieu-goc', '/so-cai/but-toan', '/so-cai/sua-dau-but-toan', '/nghiep-vu/but-toan-mau', '/nghiep-vu/but-toan-lap'] },
      { label: 'Tài liệu', paths: ['/tien-ich/huong-dan', '/yeu-cau/tai-chinh-ke-toan', '/tien-ich/kien-truc', '/tien-ich/can-cu', '/mua-hang/hieu-nghiep-vu', '/mua-hang/tong-quan', '/mua-hang/csdl'] },
      { label: 'API', paths: ['/tich-hop/thu-api', '/tich-hop/huong-dan', '/tich-hop/nguon-du-lieu'] },
      { label: 'Nhà phát triển', paths: ['/dev/tong-quan', '/dev/tra-ma', '/dev/nhat-ky', '/dev/loi-theo-module', '/dev/ghi-so', '/dev/su-kien', '/dev/toan-ven', '/dev/van-hanh', '/dev/kich-ban'] },
    ],
  },
];

/** Mọi màn người dùng được thấy, theo đường dẫn (một màn khai ở nhiều phân hệ thì lấy lần đầu). */
function flatten(menu: MenuItem[]): Map<string, MenuItem> {
  const flat = new Map<string, MenuItem>();
  const add = (m: MenuItem) => { if (m.path && !isSection(m) && !flat.has(m.path)) flat.set(m.path, m); };
  for (const g of menu) { add(g); g.children?.forEach(add); }
  return flat;
}

/**
 * Ghép bố trí với menu người dùng được thấy: bỏ màn không có quyền, màn chưa xếp vào mục Khác của Thiết lập.
 * Nhóm không có màn nào người dùng mở được thì bỏ. `phanRieng` = false: bỏ nhóm Phần riêng (đơn vị không dùng lớp gắn thêm).
 */
export function buildGon(menu: MenuItem[], phanRieng = true): GonGroup[] {
  const flat = flatten(menu);
  const placed = new Set<string>();
  const pick = (paths: string[]) => paths.flatMap((p) => { placed.add(p); const it = flat.get(p); return it ? [it] : []; });
  const resolve = (list: GonSection[] = []) => list.map((s) => ({ label: s.label, items: pick(s.paths), soon: s.soon })).filter((s) => s.items.length || s.soon?.length);
  const groups: GonGroup[] = GON_DEFS.map(({ the, sections, reports, ...d }) => ({
    ...d,
    home: groupHome(d.key),
    the: pick(the ?? []),
    sections: resolve(sections),
    reports: resolve(reports),
  }));
  const khac = [...flat.values()].filter((m) => !placed.has(m.path!) && m.path !== '/');
  if (khac.length) groups.find((g) => g.key === THIET_LAP)!.sections.push({ label: 'Khác', items: khac });
  const coMan = (g: GonGroup) => [...g.sections, ...g.reports].some((s) => s.items.length);
  return groups.filter((g) => coMan(g) && (phanRieng || !g.rieng));
}

/** Nhóm hiện ở menu trái và trang Tổng quan (bỏ nhóm ẩn như Thiết lập). */
export const nhomHien = (groups: GonGroup[]) => groups.filter((g) => !g.an);

const bare = (path: string) => path.split('?')[0]!;
/** Độ khớp của một đường dẫn mục với màn đang mở: dài hơn là khớp sát hơn, 0 là không khớp. */
export const matchLen = (path: string | undefined, pathname: string) => {
  if (!path) return 0;
  const p = bare(path);
  return pathname === p || pathname.startsWith(`${p}/`) ? p.length : 0;
};

const groupPaths = (g: GonGroup) => [g.home, ...[...g.sections, ...g.reports].flatMap((s) => s.items.map((i) => i.path))];

/** Nhóm chứa màn đang mở; nhóm đang chọn được ưu tiên nếu cũng chứa màn đó (một màn có thể ở nhiều nhóm). */
export function groupOfPath(groups: GonGroup[], pathname: string, search: string, current?: string): GonGroup | undefined {
  if (pathname === REPORT_PAGE) {
    const nhom = new URLSearchParams(search).get('nhom');
    return groups.find((g) => g.key === nhom);
  }
  const best = (g: GonGroup) => Math.max(0, ...groupPaths(g).map((p) => matchLen(p, pathname)));
  const cur = groups.find((g) => g.key === current);
  if (cur && best(cur) > 0) return cur;
  let found: GonGroup | undefined;
  for (const g of groups) if (best(g) > (found ? best(found) : 0)) found = g;
  return found;
}

/** Số màn của nhóm (nghiệp vụ và báo cáo), màn lặp tính một lần. */
export const groupCount = (g: GonGroup) => new Set([...g.sections, ...g.reports].flatMap((s) => s.items.map((i) => i.path))).size;

/** Trang chủ phân hệ cũ / nhóm cũ chuyển sang trang chủ nhóm mới (liên kết cũ, thẻ còn nhớ trong phiên). */
export const OLD_HOME_ALIASES: Record<string, string> = {
  ...Object.fromEntries(
    Object.entries({ 'ke-toan': 'tong-hop', quy: 'tien-mat', 'mua-hang': 'mua-hang', 'ban-hang': 'ban-hang', kho: 'kho', 'danh-muc': 'danh-muc', 'tai-san': 'tscd', thue: 'thue', 'he-thong': THIET_LAP, api: THIET_LAP, dev: THIET_LAP })
      .map(([mod, nhom]) => [`/app/${mod}`, groupHome(nhom)]),
  ),
  ...Object.fromEntries(Object.entries({ tien: 'tien-mat', 'tai-san': 'tscd', 'cong-no': 'phan-rieng', 'tien-ich': THIET_LAP }).map(([cu, moi]) => [groupHome(cu), groupHome(moi)])),
};
