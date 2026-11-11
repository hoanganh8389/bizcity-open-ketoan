/**
 * Lưới "Sửa vai trò" (kiểu bảng chức năng × thao tác): xếp sổ quyền thành Thẻ (Danh mục / Nghiệp vụ / Báo cáo / Tiện ích) → Nhóm → Dòng
 * (chức năng) → Cột (thao tác), và đổi trạng thái tick mong muốn thành luật Cho / Cấm của vai trò đơn vị. Hàm thuần — màn chỉ vẽ và gửi.
 *   - Quyền chứng từ của phân hệ đặt tên `<module>:<chức-năng>-<xem|lap|huy|xuat>` (registerDocumentType) → một dòng, bốn cột.
 *   - Quyền Core xếp theo bảng CORE_PLACE; quyền lạ (module khác) vào cột "Khác" của dòng riêng.
 */
import { explainCell, type MatrixData, type MatrixPermission, type MatrixRole, type RoleDetail, type RoleRule } from './matrix';

export type GridTab = 'danh-muc' | 'nghiep-vu' | 'bao-cao' | 'tien-ich';
export type GridCol = 'xem' | 'lap' | 'huy' | 'xuat' | 'khac';

export const GRID_TABS: { key: GridTab; label: string }[] = [
  { key: 'danh-muc', label: 'Danh mục' },
  { key: 'nghiep-vu', label: 'Nghiệp vụ' },
  { key: 'bao-cao', label: 'Báo cáo' },
  { key: 'tien-ich', label: 'Tiện ích và thiết lập' },
];
export const GRID_COLS: { key: GridCol; label: string }[] = [
  { key: 'xem', label: 'Xem' },
  { key: 'lap', label: 'Thêm / sửa' },
  { key: 'huy', label: 'Huỷ' },
  { key: 'xuat', label: 'Xuất Excel' },
  { key: 'khac', label: 'Khác' },
];

const MODULE_TITLES: Record<string, string> = { 'ban-hang': 'Bán hàng', 'mua-hang': 'Mua hàng', kho: 'Kho', quy: 'Quỹ', 'ke-toan': 'Kế toán' };
/** Thứ tự nhóm trên màn (theo luồng nghiệp vụ); nhóm khác (module mới) xếp sau theo tên. */
const GROUP_ORDER = ['Danh mục dùng chung', 'Bán hàng', 'Mua hàng', 'Kho', 'Quỹ', 'Kế toán', 'Chứng từ (mọi loại)', 'Sổ sách và báo cáo', 'Kiểm chuẩn', 'Hệ thống'];
const groupRank = (label: string): number => { const i = GROUP_ORDER.indexOf(label); return i < 0 ? GROUP_ORDER.length : i; };

/** Chỗ của 18 quyền Core trên lưới: thẻ, nhóm, dòng, cột. */
const CORE_PLACE: Record<string, { tab: GridTab; group: string; row: string; col: GridCol }> = {
  'catalog:read': { tab: 'danh-muc', group: 'Danh mục dùng chung', row: 'Đối tượng, mặt hàng, kho, tài khoản…', col: 'xem' },
  'catalog:write': { tab: 'danh-muc', group: 'Danh mục dùng chung', row: 'Đối tượng, mặt hàng, kho, tài khoản…', col: 'lap' },
  'documents:read': { tab: 'nghiep-vu', group: 'Chứng từ (mọi loại)', row: 'Mọi loại chứng từ', col: 'xem' },
  'documents:write': { tab: 'nghiep-vu', group: 'Chứng từ (mọi loại)', row: 'Mọi loại chứng từ', col: 'lap' },
  'documents:edit-all': { tab: 'nghiep-vu', group: 'Chứng từ (mọi loại)', row: 'Mọi loại chứng từ', col: 'khac' },
  'documents:bypass-date-lock': { tab: 'nghiep-vu', group: 'Chứng từ (mọi loại)', row: 'Mọi loại chứng từ', col: 'khac' },
  'payments:approve': { tab: 'nghiep-vu', group: 'Quỹ', row: 'Đề nghị thanh toán', col: 'khac' },
  'payments:approve-final': { tab: 'nghiep-vu', group: 'Quỹ', row: 'Đề nghị thanh toán', col: 'khac' },
  'ledger:read': { tab: 'bao-cao', group: 'Sổ sách và báo cáo', row: 'Sổ cái, sổ chi tiết', col: 'xem' },
  'reports:read': { tab: 'bao-cao', group: 'Sổ sách và báo cáo', row: 'Báo cáo', col: 'xem' },
  'review:read': { tab: 'bao-cao', group: 'Sổ sách và báo cáo', row: 'Bàn đánh giá', col: 'xem' },
  'conformance:read': { tab: 'bao-cao', group: 'Kiểm chuẩn', row: 'Kiểm chuẩn', col: 'xem' },
  'conformance:run': { tab: 'bao-cao', group: 'Kiểm chuẩn', row: 'Kiểm chuẩn', col: 'khac' },
  'conformance:approve': { tab: 'bao-cao', group: 'Kiểm chuẩn', row: 'Kiểm chuẩn', col: 'khac' },
  'settings:write': { tab: 'tien-ich', group: 'Hệ thống', row: 'Cấu hình đơn vị', col: 'lap' },
  'users:write': { tab: 'tien-ich', group: 'Hệ thống', row: 'Người dùng, vai trò, khoá API', col: 'lap' },
  'periods:lock': { tab: 'tien-ich', group: 'Hệ thống', row: 'Kỳ kế toán', col: 'khac' },
  'devtools:read': { tab: 'tien-ich', group: 'Hệ thống', row: 'Bàn điều tra (nhà phát triển)', col: 'xem' },
};

const OP_COL: Record<string, GridCol> = { xem: 'xem', lap: 'lap', huy: 'huy', xuat: 'xuat' };
const DOC_KEY_RE = /^([a-z][a-z0-9-]*):([a-z0-9-]+)-(xem|lap|huy|xuat)$/;

/** Tên chức năng từ nhãn quyền: bỏ động từ đầu ("Xem", "Lập / sửa", "Huỷ", "Xuất Excel") và phần ngoặc cuối. */
function rowLabelOf(label: string): string {
  const s = label.replace(/^(Xem|Lập \/ sửa|Huỷ|Xuất Excel)\s+/i, '').replace(/\s*\([^)]*\)\s*$/, '');
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export interface GridCell { col: GridCol; perms: MatrixPermission[] }
export interface GridRow { key: string; label: string; cells: Partial<Record<GridCol, MatrixPermission[]>> }
export interface GridGroup { key: string; label: string; rows: GridRow[] }

/** Dựng lưới của một thẻ từ sổ quyền; `query` lọc theo tên chức năng, nhãn hoặc khoá quyền. */
export function buildGrid(perms: readonly MatrixPermission[], tab: GridTab, query = ''): GridGroup[] {
  const groups = new Map<string, GridGroup>();
  const q = query.trim().toLowerCase();
  for (const p of perms) {
    let place: { tab: GridTab; group: string; row: string; col: GridCol; rowKey: string };
    const core = CORE_PLACE[p.key];
    const doc = DOC_KEY_RE.exec(p.key);
    if (core) place = { ...core, rowKey: `core:${core.row}` };
    else if (doc) place = { tab: 'nghiep-vu', group: MODULE_TITLES[doc[1]!] ?? doc[1]!, row: rowLabelOf(p.label), col: OP_COL[doc[3]!]!, rowKey: `${doc[1]}:${doc[2]}` };
    else place = { tab: 'nghiep-vu', group: MODULE_TITLES[p.module] ?? p.module, row: p.label, col: 'khac', rowKey: p.key };
    if (place.tab !== tab) continue;
    const g = groups.get(place.group) ?? groups.set(place.group, { key: place.group, label: place.group, rows: [] }).get(place.group)!;
    let row = g.rows.find((r) => r.key === place.rowKey);
    if (!row) g.rows.push((row = { key: place.rowKey, label: place.row, cells: {} }));
    // Dòng chứng từ: tên lấy từ quyền Xem nếu có (nhãn gọn nhất).
    if (doc && doc[3] === 'xem') row.label = rowLabelOf(p.label);
    (row.cells[place.col] ??= []).push(p);
  }
  const out = [...groups.values()].map((g) => ({
    ...g,
    rows: q ? g.rows.filter((r) => r.label.toLowerCase().includes(q) || Object.values(r.cells).flat().some((p) => p!.key.includes(q) || p!.label.toLowerCase().includes(q))) : g.rows,
  })).filter((g) => g.rows.length);
  return out.sort((a, b) => groupRank(a.label) - groupRank(b.label) || a.label.localeCompare(b.label));
}

/** Mọi khoá quyền của một dòng / nhóm / thẻ (để bật / tắt "Toàn quyền"). */
export const keysOfRow = (r: GridRow): string[] => Object.values(r.cells).flat().map((p) => p!.key);
export const keysOfGroups = (gs: readonly GridGroup[]): string[] => gs.flatMap((g) => g.rows.flatMap(keysOfRow));

export type GridOp = { kind: 'allow' | 'deny'; permission: string } | { kind: 'remove'; rule: RoleRule };
export interface GridPlan { ops: GridOp[]; blocked: { permission: string; reason: string }[]; high: boolean }

/**
 * Đổi tick mong muốn (`want`: khoá → có / không) thành luật của vai trò đơn vị:
 *   bật:  gỡ Cấm đích danh của quyền (Cấm theo mẫu `*` thì không tự gỡ — báo chặn, vì gỡ mẫu mở nhiều quyền khác);
 *         rồi Cho nếu quyền không đến từ vai trò nền.
 *   tắt:  gỡ Cho riêng; nếu quyền vẫn còn (từ nền / kéo theo) thì thêm Cấm đích danh.
 * Gỡ trước, thêm sau. `high` = có Cho quyền rủi ro cao (máy chủ đòi nhập lại mật khẩu).
 */
export function planGrid(m: MatrixData, role: MatrixRole, detail: RoleDetail | undefined, want: ReadonlyMap<string, boolean>): GridPlan {
  const removes: GridOp[] = [];
  const adds: GridOp[] = [];
  const blocked: GridPlan['blocked'] = [];
  let high = false;
  for (const [permission, on] of want) {
    const ex = explainCell(m, role, detail, permission);
    const isOn = ex.cell === 'allow';
    if (on === isOn) continue;
    const denyRules = ex.removable.filter((r) => r.effect === 'deny');
    const ownAllow = ex.removable.find((r) => r.effect === 'allow');
    const fromBase = ex.reasons.some((r) => r.kind === 'base');
    if (on) {
      const pattern = denyRules.find((r) => r.permission.includes('*'));
      if (pattern) { blocked.push({ permission, reason: `đang bị Cấm theo mẫu ${pattern.permission} — gỡ mẫu ở thẻ Ma trận quyền` }); continue; }
      if (role.kind === 'restriction') { blocked.push({ permission, reason: 'vai trò Hạn chế chỉ có luật Cấm' }); continue; }
      for (const r of denyRules) removes.push({ kind: 'remove', rule: r });
      if (!fromBase && !ownAllow) {
        adds.push({ kind: 'allow', permission });
        if (m.permissions.find((p) => p.key === permission)?.risk === 'high') high = true;
      }
    } else {
      if (ownAllow) removes.push({ kind: 'remove', rule: ownAllow });
      // Còn quyền sau khi gỡ Cho riêng (từ nền, hoặc kéo theo từ quyền khác) → Cấm đích danh.
      if (fromBase || !ownAllow) adds.push({ kind: 'deny', permission });
    }
  }
  return { ops: [...removes, ...adds], blocked, high };
}
