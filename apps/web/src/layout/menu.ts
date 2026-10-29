/**
 * Menu lõi (nhóm → chức năng) hiển thị ở thanh bên trái.
 *
 * Phân hệ Kế toán gom thành các nhóm đánh số (1. Chứng từ và định khoản … 9. Tiện ích), mỗi nhóm chia mục con
 * (sec(): "Nghiệp vụ", "Báo cáo"…) để nghiệp vụ và báo cáo của cùng một mảng nằm chung một chỗ. Tên, mã chức năng
 * (ACC65, ACC88…) giữ như bảng điều khiển kế toán quen dùng để gọi nhanh (Ctrl + K, gõ "65"); khoá mục giữ nguyên
 * (màn đã ghim không mất). Chức năng chưa làm vẫn hiện (không có path); bấm vào không mở gì.
 * Các phân hệ khác (Quỹ, Bán hàng, Mua hàng, Kho, Hệ thống) dùng menu xổ ở thanh trên, khai ở cuối tệp.
 *
 * Add-in gắn thêm mục qua manifest.menu + menuParent (key nhóm bên dưới, mặc định "tien-ich").
 */
import { WEB_MODULES, type WebModule } from '../phan-he';
import type { MenuItem } from '@ketoan/contracts';
import { keToanMenu } from '../phan-he/ke-toan/menu';
import { quyMenu } from '../phan-he/quy/menu';
import { muaHangMenu } from '../phan-he/mua-hang/menu';
import { banHangMenu } from '../phan-he/ban-hang/menu';
import { khoMenu } from '../phan-he/kho/menu';
import { taiSanMenu } from '../phan-he/tai-san/menu';
import { thueMenu } from '../phan-he/thue/menu';
import { heThongMenu } from '../phan-he/he-thong/menu';
import { apiMenu } from '../phan-he/api/menu';

export { SECTION_PREFIX, isSection } from './menu-helpers';

/** Thứ tự nhóm trong menu chung (giữ như trước để ô tìm chức năng, tên thẻ không đổi). Nhóm mới không có ở đây thì đứng cuối. */
const GROUP_ORDER = ['tong-quan', 'nghiep-vu', 'bao-cao-chung', 'cong-no', 'quy', 'thue', 'nghiep-vu-tscd', 'ke-hoach-tai-chinh', 'danh-muc', 'tien-ich', 'ban-hang-nghiep-vu', 'ban-hang', 'ban-hang-danh-muc', 'mua-hang-nghiep-vu', 'mua-hang-danh-muc', 'mua-hang-bao-cao', 'kho-nghiep-vu', 'kho-bao-cao', 'kho-danh-muc', 'quy-nghiep-vu', 'quy-bao-cao', 'tich-hop', 'he-thong'];
const ALL_GROUPS: MenuItem[] = [...keToanMenu, ...quyMenu, ...muaHangMenu, ...banHangMenu, ...khoMenu, ...taiSanMenu, ...thueMenu, ...apiMenu, ...heThongMenu];

/** Menu chung: nhóm của mọi phân hệ (mỗi phân hệ khai ở src/phan-he/<key>/menu.ts). */
export const CORE_MENU: MenuItem[] = [...ALL_GROUPS].sort((a, b) => {
  const ia = GROUP_ORDER.indexOf(a.key), ib = GROUP_ORDER.indexOf(b.key);
  return (ia < 0 ? 999 : ia) - (ib < 0 ? 999 : ib);
});

/**
 * Phân hệ: khai báo ở src/modules (mỗi phân hệ một tệp manifest: tên, mô tả, biểu tượng, màu, các nhóm menu).
 * Một chức năng được nằm ở nhiều phân hệ (ví dụ nhập xuất tồn ở cả Kế toán và Kho) — mỗi chỗ một key riêng.
 * Nhóm của add-in không thuộc phân hệ nào thì hiện ở Kế toán.
 */
export type AppModule = WebModule;
export const MODULES: AppModule[] = WEB_MODULES;

/** Các nhóm menu của một phân hệ (theo thứ tự khai báo của phân hệ). */
export function moduleMenu(menu: MenuItem[], moduleKey: string): MenuItem[] {
  const mod = MODULES.find((m) => m.key === moduleKey);
  if (!mod) return [];
  const known = new Set(MODULES.flatMap((m) => m.groups));
  const own = mod.groups.map((g) => menu.find((m) => m.key === g)).filter((m): m is MenuItem => Boolean(m));
  return mod.key === 'ke-toan' ? [...own, ...menu.filter((m) => !known.has(m.key))] : own;
}

/** Phân hệ chứa đường dẫn; phân hệ đang chọn được ưu tiên nếu nó cũng chứa đường dẫn đó. */
export function moduleOfPath(menu: MenuItem[], pathname: string, current?: string): string | undefined {
  const match = (path?: string) => Boolean(path && (path === '/' ? pathname === '/' : pathname === path || pathname.startsWith(`${path}/`)));
  const has = (key: string) => moduleMenu(menu, key).some((g) => match(g.path) || g.children?.some((c) => match(c.path)));
  if (current && has(current)) return current;
  return MODULES.find((m) => has(m.key))?.key;
}

export interface AddInManifestDto {
  id: string;
  name: string;
  version: string;
  description: string;
  menu?: MenuItem[];
  menuParent?: string;
}

/** Bỏ các mục người dùng không có quyền; nhóm cha rỗng thì bỏ luôn. */
export function filterMenu(menu: MenuItem[], can: (permission: string) => boolean): MenuItem[] {
  return menu
    .filter((m) => !m.permission || can(m.permission))
    .map((m) => (m.children ? { ...m, children: filterMenu(m.children, can) } : m))
    .filter((m) => !m.children || m.children.length > 0);
}

/** Gộp mục menu của add-in vào nhóm cha tương ứng (mặc định nhóm "Tiện ích"). */
export function mergeAddInMenu(core: MenuItem[], addins: AddInManifestDto[]): MenuItem[] {
  const menu = core.map((m) => ({ ...m, children: m.children ? [...m.children] : undefined }));
  for (const a of addins) {
    if (!a.menu?.length) continue;
    const parent = menu.find((m) => m.key === (a.menuParent ?? 'tien-ich')) ?? menu.find((m) => m.key === 'tien-ich');
    parent?.children?.splice(parent.children.length - 1, 0, ...a.menu);
  }
  return menu;
}

/** Danh sách phẳng các chức năng đã có (dùng cho ô tìm chức năng); bỏ trùng đường dẫn. */
export function flattenMenu(menu: MenuItem[]): { label: string; path: string; code?: string; group: string }[] {
  const seen = new Set<string>();
  return menu.flatMap((m) =>
    (m.children ?? [])
      .filter((c) => c.path && !seen.has(c.path) && seen.add(c.path))
      .map((c) => ({ label: c.label, path: c.path!, code: c.code, group: m.label })),
  );
}
