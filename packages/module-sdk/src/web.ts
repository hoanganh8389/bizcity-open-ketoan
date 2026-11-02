// @bizcity-layer P module-sdk
// [2026-11-02 06:20 PM Johnny Chu - Chu Hoàng Anh] PHASE-011 — 3.18 (ADR-0015 Q5): @bizcity/module-sdk/web — defineWebModule, kiểu menu / màn / slot của module phía giao diện; kiểm khai báo ngay lúc nạp
/**
 * @bizcity/module-sdk/web (ADR-0015 Q5; BIZCITY-EXTENSION §3). Phần GIAO DIỆN của một module: menu, màn, slot. Một gói danh
 * tính với SDK máy chủ; thành phần giao diện (bảng, form…) lấy ở @bizcity/ui-kit. Không phụ thuộc React: `C` là kiểu thành
 * phần của khung giao diện (React component ở apps/web).
 *
 *   defineWebModule({ key, label, menu, routes, slots })   kiểm ngay lúc nạp:
 *     - key đúng khuôn manifest; label không trống;
 *     - đường dẫn màn và menu nằm dưới `/app/<key>/` (EXTENSION §3) — module không chiếm đường dẫn của Core / module khác;
 *     - slot chỉ trong danh sách đóng WEB_SLOTS (STD-EXT-1);
 *     - quyền (permission) dạng `<module|core>:<việc>`.
 * Web nạp module theo danh sách này ở PR-6 (launcher, trang Phân hệ).
 */

/** Điểm cắm giao diện (BIZCITY-EXTENSION §3) — danh sách đóng. */
export const WEB_SLOTS = ['partner.detail.tab', 'product.detail.tab', 'document.detail.panel', 'dashboard.widget', 'ledger.drilldown.source'] as const;
export type WebSlot = (typeof WEB_SLOTS)[number];

export interface WebMenuItem {
  key: string;
  label: string;
  /** Dưới `/app/<key>/`; mục cha có thể để trống. */
  path?: string;
  /** Mã chức năng hiển thị cạnh tên (vd "HD01"). */
  code?: string;
  permission?: string;
  children?: WebMenuItem[];
}

export interface WebRoute<C> { path: string; component: C; permission?: string }
export interface WebSlotDef<C> { slot: WebSlot; component: C; permission?: string }

export interface WebModuleDef<C = unknown> {
  key: string;
  label: string;
  menu?: WebMenuItem[];
  routes?: WebRoute<C>[];
  slots?: WebSlotDef<C>[];
}

const KEY_RE = /^[a-z][a-z0-9-]{1,31}$/;
const PERM_RE = /^[a-z][a-z0-9-]*:[a-z][a-z0-9-]*$/;

export function defineWebModule<C>(def: WebModuleDef<C>): Readonly<WebModuleDef<C>> {
  const bad: string[] = [];
  if (!KEY_RE.test(def.key)) bad.push(`key "${def.key}" sai khuôn`);
  if (!def.label?.trim()) bad.push('thiếu label');
  const base = `/app/${def.key}/`;
  // [2026-11-02 09:33 PM Johnny Chu - Chu Hoàng Anh] PHASE-014 — W2: nhận cả trang chủ /app/<key> (manifest mẫu hop-dong đặt menu ở đó)
  const checkPath = (where: string, p?: string) => { if (p !== undefined && p !== base.slice(0, -1) && !p.startsWith(base)) bad.push(`${where} "${p}" phải nằm dưới ${base} (hoặc là trang chủ ${base.slice(0, -1)})`); };
  const checkPerm = (where: string, p?: string) => { if (p !== undefined && !PERM_RE.test(p)) bad.push(`${where}: quyền "${p}" sai khuôn <module>:<việc>`); };
  const walk = (items: WebMenuItem[] = []) => {
    for (const m of items) { checkPath(`menu ${m.key}`, m.path); checkPerm(`menu ${m.key}`, m.permission); walk(m.children); }
  };
  walk(def.menu);
  for (const r of def.routes ?? []) { checkPath('route', r.path); checkPerm(`route ${r.path}`, r.permission); }
  for (const s of def.slots ?? []) {
    if (!(WEB_SLOTS as readonly string[]).includes(s.slot)) bad.push(`slot "${s.slot}" không có trong danh sách (${WEB_SLOTS.join(', ')})`);
    checkPerm(`slot ${s.slot}`, s.permission);
  }
  if (bad.length) throw new Error(`defineWebModule(${def.key}): ${bad.join('; ')}`);
  return Object.freeze({ ...def });
}

// [2026-11-02 09:33 PM Johnny Chu - Chu Hoàng Anh] PHASE-014 — W2: webModuleParts — khung giao diện dựng mục Tổng quan, nhóm menu, route từ một web module (thuần, không React)
/** Phần trình bày manifest khai (`ui`: biểu tượng lucide, màu, thứ tự) + mô tả. */
export interface WebModuleUi { description?: string; icon?: string; color?: string; order?: number }

export interface WebModuleParts<C> {
  /** Mục ở trang Tổng quan / thanh phân hệ (khớp ModuleMeta + groups của khung giao diện). */
  meta: { key: string; label: string; description: string; icon: string; color: string; order: number; groups: string[] };
  /** Một nhóm menu của module: khoá `mod-<key>`, mục con là menu module khai. */
  group: { key: string; label: string; children: WebMenuItem[] };
  routes: WebRoute<C>[];
}

export function webModuleParts<C>(def: WebModuleDef<C>, ui: WebModuleUi = {}): WebModuleParts<C> {
  const group = `mod-${def.key}`;
  return {
    meta: { key: def.key, label: def.label, description: ui.description ?? '', icon: ui.icon ?? 'Puzzle', color: ui.color ?? '#475569', order: ui.order ?? 60, groups: [group] },
    group: { key: group, label: def.label, children: def.menu ?? [] },
    routes: def.routes ?? [],
  };
}
