// [2026-11-05 11:50 PM Nguyễn Văn Thủy] MENU — bố trí gọn: nhóm theo việc, thẻ đầu trang, báo cáo gom một trang (đóng góp)
/**
 * BỐ TRÍ MENU GỌN: chỉ quyết định màn nằm ở đâu, không khai màn mới.
 * Tên, mã, quyền, khoá của từng màn vẫn lấy từ menu.ts của phân hệ (ô tìm Ctrl + K, ghim, hướng dẫn giữ nguyên).
 *  - sections: các mục bung ra khi bấm nhóm ở menu trái.
 *  - the: các mục hiện thành thẻ đầu trang khi đang ở trong nhóm (thẻ "Báo cáo" tự thêm cuối nếu nhóm có báo cáo).
 *  - reports: báo cáo của nhóm, nằm ở trang /bao-cao, không nằm trong menu trái.
 * Màn có trong menu.ts mà chưa xếp ở đây thì tự vào mục "Khác" của Tiện ích, nên không bao giờ bị mất lối vào.
 */
import type { MenuItem } from '@ketoan/contracts';
import { isSection } from './menu-helpers';

export interface GonSection { label?: string; paths: string[] }
export interface GonDef {
  key: string;
  label: string;
  icon: string;
  /** Mô tả và màu của ô trên trang Tổng quan. */
  description: string;
  color: string;
  /** Phân hệ ứng với nhóm: lấy sơ đồ quy trình và thẻ Trụ cột ở trang chủ nhóm. */
  module?: string;
  homeLabel?: string;
  the?: string[];
  sections: GonSection[];
  reports?: GonSection[];
  /** Việc chưa có màn: hiện mờ để người dùng biết còn thiếu. */
  soon?: string[];
}
export interface GonResolvedSection { label?: string; items: MenuItem[] }
export interface GonGroup extends Omit<GonDef, 'sections' | 'reports' | 'the'> {
  home: string;
  the: MenuItem[];
  sections: GonResolvedSection[];
  reports: GonResolvedSection[];
}

export const REPORT_PAGE = '/bao-cao';
export const groupHome = (key: string) => `/nhom/${key}`;
const THE_KHAC = 'tien-ich';

export const GON_DEFS: GonDef[] = [
  {
    key: 'he-thong', label: 'Hệ thống', icon: 'LayoutGrid', description: 'Thông tin đơn vị, người dùng, phân quyền, kiểm soát', color: '#546e7a', module: 'he-thong',
    sections: [
      { label: 'Đơn vị', paths: ['/cau-hinh/don-vi', '/he-thong/chi-nhanh-lam-viec', '/cau-hinh/mau-in', '/cau-hinh/khoi-anh'] },
      { label: 'Người dùng', paths: ['/cau-hinh/nguoi-dung', '/cau-hinh/khoa-api'] },
      { label: 'Kiểm soát', paths: ['/he-thong/kiem-chuan', '/he-thong/ho-so-ke-toan', '/he-thong/ban-danh-gia', '/he-thong/quy-dinh-danh-muc', '/he-thong/tru-cot', '/he-thong/cau-hinh'] },
    ],
  },
  {
    key: 'tien', label: 'Tiền', icon: 'Wallet', description: 'Phiếu thu, phiếu chi, báo có, báo nợ, chuyển tiền', color: '#0f9d58', module: 'quy',
    the: ['/nghiep-vu/phieu-thu', '/nghiep-vu/phieu-chi', '/nghiep-vu/phieu-bao-co', '/nghiep-vu/phieu-bao-no', '/quy/phieu-chuyen-tien'],
    sections: [{ paths: ['/nghiep-vu/phieu-thu', '/nghiep-vu/phieu-chi', '/nghiep-vu/phieu-bao-co', '/nghiep-vu/phieu-bao-no', '/quy/phieu-chuyen-tien'] }],
    reports: [{ label: 'Tiền mặt, tiền gửi', paths: ['/quy/so-quy-tien-mat', '/quy/so-tien-gui', '/quy/so-chi-tiet-quy', '/quy/so-du-tien', '/quy/nhat-ky-thu-tien', '/quy/nhat-ky-chi-tien', '/quy/nhat-ky-chi-tien-khoan-muc'] }],
  },
  {
    key: 'mua-hang', label: 'Mua hàng', icon: 'ShoppingBag', description: 'Đặt hàng, nhập mua, hoá đơn đầu vào, nhà cung cấp, chính sách', color: '#e8710a', module: 'mua-hang', homeLabel: 'Quy trình',
    the: ['/mua-hang/tong-hop', '/mua-hang/hoa-don-ncc', '/mua-hang/nha-cung-cap', '/mua-hang/dat-hang', '/mua-hang/ton-max', '/mua-hang/han-muc', '/mua-hang/chinh-sach'],
    sections: [
      { paths: ['/mua-hang/tong-hop', '/mua-hang/hoa-don-ncc', '/mua-hang/nha-cung-cap'] },
      { label: 'Đặt hàng', paths: ['/mua-hang/dat-hang', '/mua-hang/ton-max', '/mua-hang/dang-ky-max', '/mua-hang/chuyen-shop', '/mua-hang/cong-thuc'] },
      { label: 'Sau khi mua', paths: ['/mua-hang/han-muc', '/mua-hang/thuong', '/mua-hang/phan-bo', '/mua-hang/lo-han', '/mua-hang/qua-tang'] },
      { label: 'Cài đặt', paths: ['/mua-hang/chinh-sach', '/mua-hang/cai-dat', '/mua-hang/bien-the', '/mua-hang/dvt-thung'] },
    ],
    reports: [
      { label: 'Mua hàng', paths: ['/mua-hang/bao-cao', '/mua-hang/nhat-ky', '/bao-cao/nhat-ky-mua-hang', '/mua-hang/doi-chieu', '/mua-hang/chi-tiet-chinh-sach', '/bao-cao/nhat-ky-chung?docType=purchase&account=156'] },
      { label: 'Hàng hoá', paths: ['/mua-hang/so-kho', '/mua-hang/ton-kho'] },
    ],
  },
  {
    key: 'ban-hang', label: 'Bán hàng', icon: 'ShoppingCart', description: 'Phiếu bán hàng, hàng bán trả lại, xuất điều chỉnh', color: '#d93025', module: 'ban-hang',
    the: ['/ban-hang/phieu-ban', '/ban-hang/tra-lai', '/ban-hang/xuat-dieu-chinh'],
    sections: [{ paths: ['/ban-hang/phieu-ban', '/ban-hang/tra-lai', '/ban-hang/xuat-dieu-chinh'] }],
    reports: [{ label: 'Bán hàng', paths: ['/ban-hang/bao-cao', '/ban-hang/tong-hop', '/ban-hang/lai-gop', '/ban-hang/thu-tien', '/ban-hang/thu-tien-ban-hang', '/cong-no/nhat-ky-ban-hang'] }],
  },
  {
    key: 'kho', label: 'Kho', icon: 'Warehouse', description: 'Chuyển kho, tính giá vốn, công thức giá vốn', color: '#7b1fa2', module: 'kho',
    the: ['/kho/chuyen-kho', '/nghiep-vu/tinh-gia-von', '/nghiep-vu/cong-thuc-gia-von'],
    sections: [{ paths: ['/kho/chuyen-kho', '/nghiep-vu/tinh-gia-von', '/nghiep-vu/cong-thuc-gia-von'] }],
    reports: [{ label: 'Kho', paths: ['/bao-cao/nhap-xuat-ton', '/bao-cao/so-chi-tiet-hang-hoa', '/bao-cao/hanh-trinh-mat-hang', '/bao-cao/chuyen-kho'] }],
  },
  {
    key: 'cong-no', label: 'Công nợ', icon: 'Scale', description: 'Phải thu, phải trả, đối trừ, đặt cọc, đối chiếu', color: '#c2185b',
    the: ['/cong-no/khoan-cong-no', '/cong-no/phai-thu', '/cong-no/phai-tra', '/nghiep-vu/can-tru-cong-no', '/cong-no/dat-coc', '/cong-no/yeu-cau-thanh-toan', '/cong-no/doi-chieu'],
    sections: [{ paths: ['/cong-no/khoan-cong-no', '/cong-no/phai-thu', '/cong-no/phai-tra', '/nghiep-vu/can-tru-cong-no', '/cong-no/dat-coc', '/cong-no/yeu-cau-thanh-toan', '/cong-no/chung-tu-nguon', '/cong-no/doi-chieu'] }],
    reports: [
      { label: 'Sổ công nợ', paths: ['/bao-cao/cong-no', '/bao-cao/so-chi-tiet-cong-no', '/bao-cao/chi-tiet-thanh-toan', '/bao-cao/cong-no-theo-han', '/bao-cao/lich-thanh-toan-hop-dong', '/bao-cao/tien-vay'] },
      { label: 'Phân tích công nợ', paths: ['/bao-cao/tuoi-no', '/bao-cao/tuoi-no-trong-han', '/bao-cao/tuoi-no-qua-han', '/bao-cao/cong-no-theo-nhan-vien', '/bao-cao/cong-no-theo-mat-hang', '/bao-cao/cong-no-noi-bo', '/bao-cao/cong-no-noi-bo-chi-tiet'] },
    ],
  },
  {
    key: 'tai-san', label: 'Tài sản', icon: 'Building2', description: 'Tài sản cố định, khấu hao, công cụ dụng cụ', color: '#00838f', module: 'tai-san',
    the: ['/tai-san/tscd', '/tai-san/ghi-giam', '/tai-san/khau-hao', '/tai-san/kiem-ke', '/tai-san/cong-cu', '/tai-san/chi-phi-tra-truoc'],
    sections: [
      { label: 'Tài sản cố định', paths: ['/tai-san/tscd', '/tai-san/ghi-giam', '/tai-san/khau-hao', '/tai-san/ke-hoach-khau-hao', '/tai-san/danh-gia-lai', '/tai-san/dieu-chuyen', '/tai-san/kiem-ke'] },
      { label: 'Công cụ dụng cụ', paths: ['/tai-san/cong-cu', '/tai-san/chi-phi-tra-truoc'] },
    ],
    reports: [{ label: 'Tài sản', paths: ['/bao-cao/so-tai-san', '/bao-cao/tai-san', '/bao-cao/theo-doi-tscd-ccdc', '/bao-cao/phan-bo-chi-phi', '/bao-cao/nguon-von'] }],
  },
  {
    key: 'thue', label: 'Thuế', icon: 'Landmark', description: 'Tờ khai GTGT, quyết toán TNDN, hoá đơn từ cơ quan thuế', color: '#5d4037', module: 'thue',
    the: ['/thue/to-khai-gtgt', '/thue/quyet-toan-tndn', '/thue/bo-sung-thong-tin', '/thue/hoa-don-co-quan-thue', '/thue/hoa-don-rui-ro'],
    sections: [{ paths: ['/thue/to-khai-gtgt', '/thue/quyet-toan-tndn', '/thue/bo-sung-thong-tin', '/thue/hoa-don-co-quan-thue', '/thue/hoa-don-rui-ro', '/thue/nguoi-nop-thue'] }],
    reports: [{ label: 'Thuế', paths: ['/thue/bang-ke-ban-ra', '/thue/bang-ke-mua-vao', '/thue/tong-hop'] }],
  },
  {
    key: 'tong-hop', label: 'Tổng hợp', icon: 'Network', description: 'Định khoản, phiếu kế toán, kết chuyển, khoá sổ', color: '#1f66a3', module: 'ke-toan',
    the: ['/chung-tu', '/nghiep-vu/phieu-ke-toan', '/so-cai/but-toan', '/nghiep-vu/ket-chuyen', '/cau-hinh/ky-ke-toan'],
    sections: [
      { label: 'Định khoản', paths: ['/chung-tu', '/chung-tu/bang-diem', '/tien-ich/chung-tu-ke-toan', '/so-cai/but-toan', '/nghiep-vu/phieu-ke-toan', '/nghiep-vu/but-toan-mau', '/nghiep-vu/but-toan-lap'] },
      { label: 'Cuối kỳ', paths: ['/nghiep-vu/ket-chuyen', '/cau-hinh/ky-ke-toan'] },
      { label: 'Kế hoạch', paths: ['/bang-dieu-khien', '/ke-hoach/thu-chi', '/ke-hoach/dinh-muc'] },
    ],
    reports: [
      { label: 'Báo cáo tài chính', paths: ['/bao-cao/can-doi-ke-toan', '/bao-cao/ket-qua-kinh-doanh', '/bao-cao/luu-chuyen-tien-te', '/bao-cao/thuyet-minh', '/bao-cao/can-doi-phat-sinh', '/bao-cao/phan-loai-dai-han', '/bao-cao/ket-qua-theo-cua-hang'] },
      { label: 'Sổ kế toán', paths: ['/bao-cao/nhat-ky-chung', '/bao-cao/so-cai', '/bao-cao/so-chi-tiet', '/bao-cao/bang-ke-chung-tu', '/bao-cao/tong-hop-chung-tu', '/bao-cao/kiem-tra-chung-tu'] },
      { label: 'Chi phí, hợp đồng', paths: ['/bao-cao/chi-phi-khoan-muc', '/bao-cao/chi-tiet-chi-phi-khoan-muc', '/bao-cao/tk-chi-phi-khoan-muc', '/bao-cao/tong-hop-nv-hd-pb', '/bao-cao/lai-lo-hop-dong', '/bao-cao/lai-lo-hop-dong-chi-tiet'] },
    ],
  },
  {
    key: 'danh-muc', label: 'Danh mục', icon: 'List', description: 'Hàng hoá, đối tượng, tổ chức, tài khoản, chi phí', color: '#0d7a6f', module: 'danh-muc',
    sections: [
      { label: 'Vật tư hàng hoá', paths: ['/danh-muc/mat-hang', '/danh-muc/phan-loai-hang', '/danh-muc/don-vi-tinh', '/danh-muc/kho', '/danh-muc/bang-gia'] },
      { label: 'Đối tượng', paths: ['/danh-muc/khach-hang', '/danh-muc/nha-cung-cap', '/danh-muc/nhan-vien', '/danh-muc/doi-tuong', '/danh-muc/nhom-doi-tuong'] },
      { label: 'Tổ chức', paths: ['/danh-muc/so-do-to-chuc', '/danh-muc/chi-nhanh', '/danh-muc/bo-phan'] },
      { label: 'Tài khoản', paths: ['/danh-muc/tai-khoan', '/cau-hinh/tai-khoan-ngam-dinh', '/cau-hinh/ly-do', '/cau-hinh/nhom-hach-toan', '/danh-muc/loai-thue', '/cau-hinh/hinh-thuc-thanh-toan', '/danh-muc/ngan-hang'] },
      { label: 'Chi phí', paths: ['/danh-muc/khoan-muc', '/danh-muc/hop-dong', '/danh-muc/vu-viec', '/danh-muc/du-an'] },
      { label: 'Tài sản', paths: ['/danh-muc/loai-tai-san', '/danh-muc/nhom-ccdc', '/danh-muc/nguon-von', '/danh-muc/muc-dich-su-dung'] },
    ],
  },
  {
    key: 'so-du', label: 'Số dư ban đầu', icon: 'ListEnd', description: 'Số dư tài khoản, dữ liệu khởi đầu khi bắt đầu dùng', color: '#6d4c41',
    sections: [{ paths: ['/nghiep-vu/so-du-tai-khoan', '/mua-hang/khoi-dau'] }],
    soon: ['Giá trị tồn đầu kỳ theo mã hàng'],
  },
  {
    key: THE_KHAC, label: 'Tiện ích', icon: 'Wrench', description: 'Tài liệu, kiểm tra chứng từ, API, nghiệp vụ IT', color: '#3949ab',
    sections: [
      { label: 'Tài liệu', paths: ['/tien-ich/huong-dan', '/yeu-cau/tai-chinh-ke-toan', '/tien-ich/kien-truc', '/tien-ich/can-cu'] },
      { label: 'Kiểm tra chứng từ', paths: ['/tien-ich/ct-mat-lien-ket', '/tien-ich/ct-lech-than-chi-tiet', '/tien-ich/ct-lech-phieu-goc'] },
      { label: 'Nghiệp vụ IT (riêng)', paths: ['/mua-hang/hieu-nghiep-vu', '/mua-hang/tong-quan', '/mua-hang/csdl', '/tien-ich/add-in', '/tien-ich/du-lieu-goc'] },
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

/** Ghép bố trí với menu người dùng được thấy: bỏ màn không có quyền, bỏ nhóm rỗng, màn chưa xếp vào mục Khác. */
export function buildGon(menu: MenuItem[]): GonGroup[] {
  const flat = flatten(menu);
  const placed = new Set<string>();
  const pick = (paths: string[]) => paths.flatMap((p) => { placed.add(p); const it = flat.get(p); return it ? [it] : []; });
  const resolve = (list: GonSection[] = []) => list.map((s) => ({ label: s.label, items: pick(s.paths) })).filter((s) => s.items.length);
  const groups: GonGroup[] = GON_DEFS.map(({ the, sections, reports, ...d }) => ({
    ...d,
    home: groupHome(d.key),
    the: pick(the ?? []),
    sections: resolve(sections),
    reports: resolve(reports),
  }));
  const khac = [...flat.values()].filter((m) => !placed.has(m.path!) && m.path !== '/');
  if (khac.length) groups.find((g) => g.key === THE_KHAC)!.sections.push({ label: 'Khác', items: khac });
  return groups.filter((g) => g.sections.length || g.reports.length);
}

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

/** Trang chủ phân hệ cũ chuyển sang trang chủ nhóm tương ứng (liên kết cũ, thẻ còn nhớ trong phiên). */
export const OLD_HOME_ALIASES: Record<string, string> = Object.fromEntries(
  Object.entries({ 'ke-toan': 'tong-hop', quy: 'tien', 'mua-hang': 'mua-hang', 'ban-hang': 'ban-hang', kho: 'kho', 'danh-muc': 'danh-muc', 'tai-san': 'tai-san', thue: 'thue', 'he-thong': 'he-thong', api: 'tien-ich', dev: 'tien-ich' })
    .map(([mod, nhom]) => [`/app/${mod}`, groupHome(nhom)]),
);
