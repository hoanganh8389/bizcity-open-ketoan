import type { ModuleMeta } from '@ketoan/contracts';

/**
 * Phân hệ phía giao diện: thông tin hiển thị + các NHÓM menu (khoá nhóm trong layout/menu.ts CORE_MENU).
 * Một nhóm được nằm ở nhiều phân hệ (vd "Thuế" ở cả Kế toán và Thuế) — màn trùng nhau là một.
 */
export interface WebModule extends ModuleMeta {
  groups: string[];
  /** false = không hiện trên thanh phân hệ trên cùng (vẫn có ở trang Tổng quan); mặc định hiện. */
  topBar?: boolean;
}
