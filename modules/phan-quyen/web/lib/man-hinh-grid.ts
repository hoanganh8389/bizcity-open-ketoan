// [2026-11-14 05:30 PM kiennt] PHASE-028 — HT12 lưới theo màn hình đăng ký (mỗi màn một dòng), chế độ Cơ bản / Chi tiết, vai trò Hạn chế tick = Cấm (đóng góp)
/**
 * Lưới "Sửa vai trò" theo SỔ ĐĂNG KÝ MÀN (`GET /api/v1/man-hinh`): thẻ = nhóm menu (Kho, Quỹ, Mua hàng…), mỗi màn một dòng, cột cố định
 * Xem / Thêm / Sửa / Xoá-Huỷ / Duyệt / Xuất, nút riêng (Ghi nhận, Nhận hàng…) ở cột Khác cùng dòng. Quyền không thuộc màn nào (quyền Core,
 * quyền cửa nạp…) vào thẻ "Quyền chung" — xếp như lưới cũ (`buildGrid`). Hàm thuần — màn chỉ vẽ và gửi.
 */
import { buildGrid, GRID_COLS, GRID_TABS, type GridGroup } from './grid';
import { explainCell, matchPattern, type MatrixData, type MatrixPermission, type MatrixRole, type RoleDetail } from './matrix';
import type { GridOp, GridPlan } from './grid';

/** Một màn trong sổ đăng ký (đúng hình `GET /api/v1/man-hinh`). */
/** `goc`: quyền gốc rủi ro cao lệnh vẫn đòi — Cho quyền chi tiết chưa đủ, phải kèm quyền này. */
export interface ManHinhThaoTac { quyen: string; nhan: string; loai: 'xem' | 'ghi' | 'huy' | 'xuat'; goc?: string }
export interface ManHinhDef { key: string; ma: string; nhom: string; nhan: string; duongDan: string; thaoTac: Record<string, ManHinhThaoTac> }

export interface Col { key: string; label: string }
export const SCREEN_COLS: Col[] = [
  { key: 'xem', label: 'Xem' },
  { key: 'them', label: 'Thêm' },
  { key: 'sua', label: 'Sửa' },
  { key: 'xoa', label: 'Xoá / Huỷ' },
  { key: 'duyet', label: 'Duyệt' },
  { key: 'xuat', label: 'Xuất' },
  { key: 'khac', label: 'Khác' },
];
/** Thao tác đăng ký → cột; thao tác khác vào "Khác". */
const TT_COL: Record<string, string> = { xem: 'xem', them: 'them', sua: 'sua', huy: 'xoa', xoa: 'xoa', duyet: 'duyet', xuat: 'xuat' };

/** `nut`: khoá quyền → tên nút trên màn ("Thêm", "Ghi nhận chênh lệch") để tóm tắt ngắn. */
export interface Row { key: string; ma: string; label: string; cells: Record<string, MatrixPermission[]>; nut: Record<string, string>; goc?: Record<string, string> }
export interface Group { key: string; label: string; cols: Col[]; rows: Row[] }

export const TAB_CHUNG = 'Quyền chung';
/** Thứ tự thẻ theo menu; nhóm lạ (phân hệ mới) xếp sau theo tên. */
const TAB_ORDER = ['Bán hàng', 'Mua hàng', 'Kho', 'Quỹ', 'Kế toán', 'Tài sản', 'Thuế', 'Danh mục', 'Hệ thống'];
const rank = (s: string): number => { const i = TAB_ORDER.indexOf(s); return i < 0 ? TAB_ORDER.length : i; };

export interface ScreenGrid { tabs: { key: string; label: string; count: number }[]; groups: Map<string, Group[]> }

/**
 * Dựng mọi thẻ. Thao tác có quyền không có trong sổ quyền (`perms`) thì bỏ (không đặt luật được). Một quyền chỉ hiện ở màn đầu tiên dùng nó.
 * `query` lọc theo mã / tên màn, nhãn hoặc khoá quyền.
 */
export function buildScreenGrid(screens: readonly ManHinhDef[], perms: readonly MatrixPermission[], query = ''): ScreenGrid {
  const byKey = new Map(perms.map((p) => [p.key, p]));
  const used = new Set<string>();
  const tabs = new Map<string, Row[]>();
  for (const s of screens) {
    const cells: Record<string, MatrixPermission[]> = {};
    const nut: Record<string, string> = {};
    const goc: Record<string, string> = {};
    for (const [tt, t] of Object.entries(s.thaoTac)) {
      const p = byKey.get(t.quyen);
      if (!p || used.has(p.key)) continue;
      used.add(p.key);
      nut[p.key] = t.nhan;
      if (t.goc) goc[p.key] = t.goc;
      const col = TT_COL[tt] ?? 'khac';
      // Nhãn ở cột Khác lấy theo nút trên màn ("Ghi nhận chênh lệch"), không theo nhãn dài của quyền.
      (cells[col] ??= []).push(col === 'khac' ? { ...p, label: t.nhan } : p);
    }
    if (!Object.keys(cells).length) continue;
    (tabs.get(s.nhom) ?? tabs.set(s.nhom, []).get(s.nhom)!).push({ key: s.key, ma: s.ma, label: s.nhan, cells, nut, goc });
  }
  const q = query.trim().toLowerCase();
  const hit = (r: Row) => !q || `${r.ma} ${r.label}`.toLowerCase().includes(q)
    || Object.values(r.cells).flat().some((p) => p.key.includes(q) || p.label.toLowerCase().includes(q));

  const out = new Map<string, Group[]>();
  const tabList: ScreenGrid['tabs'] = [];
  for (const nhom of [...tabs.keys()].sort((a, b) => rank(a) - rank(b) || a.localeCompare(b))) {
    const rows = tabs.get(nhom)!;
    tabList.push({ key: nhom, label: nhom, count: rows.length });
    const kept = rows.filter(hit);
    out.set(nhom, kept.length ? [{ key: nhom, label: nhom, cols: SCREEN_COLS, rows: kept }] : []);
  }
  // Quyền chung: quyền không thuộc màn nào, xếp theo lưới cũ (Danh mục / Nghiệp vụ / Báo cáo / Tiện ích → nhóm → dòng).
  const rest = perms.filter((p) => !used.has(p.key));
  const chung: Group[] = GRID_TABS.flatMap((t) => buildGrid(rest, t.key, query).map((g) => fromOld(g)));
  const chungAll = GRID_TABS.flatMap((t) => buildGrid(rest, t.key));
  if (chungAll.length) {
    tabList.push({ key: TAB_CHUNG, label: TAB_CHUNG, count: chungAll.reduce((s, g) => s + g.rows.length, 0) });
    out.set(TAB_CHUNG, chung);
  }
  return { tabs: tabList, groups: out };
}

const fromOld = (g: GridGroup): Group => ({
  key: `chung:${g.key}`, label: g.label, cols: GRID_COLS,
  rows: g.rows.map((r) => ({ key: r.key, ma: '', label: r.label, cells: r.cells as Record<string, MatrixPermission[]>, nut: {} })),
});

/** Các thao tác của dòng theo thứ tự cột (Xem, Thêm, Sửa, Xoá, Duyệt, Xuất, rồi nút riêng) kèm tên nút. */
export const actionsOf = (r: Row): { p: MatrixPermission; nhan: string }[] =>
  SCREEN_COLS.flatMap((c) => (r.cells[c.key] ?? []).map((p) => ({ p, nhan: r.nut[p.key] ?? p.label })));

export const keysOf = (r: Row): string[] => Object.values(r.cells).flat().map((p) => p.key);
export const keysOfAll = (gs: readonly Group[]): string[] => gs.flatMap((g) => g.rows.flatMap(keysOf));

/** Mức nhanh của một dòng (chế độ Cơ bản). Vai trò Hạn chế: "bật" nghĩa là đang Cấm. */
export type Level = 'khong' | 'chi-xem' | 'day-du' | 'tuy-chinh';
export const LEVEL_TEXT: Record<Level, string> = { khong: 'Không', 'chi-xem': 'Chỉ xem', 'day-du': 'Đầy đủ', 'tuy-chinh': 'Tuỳ chỉnh' };
export const LEVEL_TEXT_CAM: Record<Level, string> = { khong: 'Không cấm', 'chi-xem': 'Cấm ghi, giữ xem', 'day-du': 'Cấm hẳn', 'tuy-chinh': 'Tuỳ chỉnh' };

/** Quyền thuộc mức "Chỉ xem": Xem và Xuất (xuất Excel là đọc — vai trò Người xem có sẵn). */
const viewKeys = (r: Row) => [...(r.cells.xem ?? []), ...(r.cells.xuat ?? [])].map((p) => p.key);

/**
 * Mức của dòng theo tick hiện tại `on(k)`. Vai trò thường: on = có quyền. Vai trò Hạn chế: on = đang Cấm — "Chỉ xem" khi đó nghĩa là
 * Cấm mọi thao tác trừ Xem (lật ngược).
 */
export function levelOf(r: Row, on: (k: string) => boolean, cam = false): Level {
  const all = keysOf(r);
  const view = new Set(viewKeys(r));
  const n = all.filter(on).length;
  if (n === 0) return 'khong';
  if (n === all.length) return 'day-du';
  const onlyView = all.every((k) => on(k) === (cam ? !view.has(k) : view.has(k)));
  return view.size && onlyView ? 'chi-xem' : 'tuy-chinh';
}

/** Tick mong muốn cho cả dòng khi chọn một mức. */
export function levelWant(r: Row, level: Exclude<Level, 'tuy-chinh'>, cam = false): [string, boolean][] {
  const view = new Set(viewKeys(r));
  return keysOf(r).map((k) => [k, level === 'day-du' ? true : level === 'khong' ? false : cam ? !view.has(k) : view.has(k)]);
}
/** Dòng không có quyền Xem (vd màn Danh mục chỉ có Thêm / Sửa / Xoá) thì không có mức "Chỉ xem". */
export const hasView = (r: Row): boolean => (r.cells.xem ?? []).length > 0;

/**
 * Vai trò Hạn chế: tick = Cấm đích danh. Bật → thêm luật Cấm nếu chưa có Cấm đích danh; tắt → gỡ luật Cấm đích danh. Cấm theo mẫu `*`
 * không tự gỡ (gỡ mẫu mở nhiều quyền khác) — báo chặn.
 */
export function planRestriction(detail: RoleDetail | undefined, want: ReadonlyMap<string, boolean>): GridPlan {
  const rules = (detail?.rules ?? []).filter((r) => r.active && r.effect === 'deny');
  const ops: GridOp[] = [];
  const blocked: GridPlan['blocked'] = [];
  for (const [permission, on] of want) {
    const exact = rules.filter((r) => r.permission === permission);
    const pattern = rules.find((r) => r.permission.includes('*') && matchPattern(r.permission, permission));
    if (on && !exact.length && !pattern) ops.push({ kind: 'deny', permission });
    if (!on) {
      if (pattern) { blocked.push({ permission, reason: `đang bị Cấm theo mẫu ${pattern.permission} — gỡ mẫu ở thẻ Ma trận quyền` }); continue; }
      for (const r of exact) ops.push({ kind: 'remove', rule: r });
    }
  }
  return { ops: [...ops.filter((o) => o.kind === 'remove'), ...ops.filter((o) => o.kind !== 'remove')], blocked, high: false };
}

/** Vai trò Hạn chế: quyền đang bị Cấm bởi luật của chính vai trò (đích danh hoặc mẫu). */
export function deniedByRole(detail: RoleDetail | undefined, permission: string): boolean {
  return (detail?.rules ?? []).some((r) => r.active && r.effect === 'deny' && matchPattern(r.permission, permission));
}

/** Nguồn của một ô đang Có: 'rieng' = luật Cho riêng của vai trò; 'san' = có sẵn (vai trò nền / kéo theo quyền chung). */
export function sourceOf(m: MatrixData, role: MatrixRole, detail: RoleDetail | undefined, permission: string): 'rieng' | 'san' | null {
  const ex = explainCell(m, role, detail, permission);
  if (ex.cell !== 'allow') return null;
  return ex.reasons.some((r) => r.kind === 'rule-allow') ? 'rieng' : 'san';
}
