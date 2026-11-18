// @bizcity-layer P module-sdk
// [2026-11-02 12:45 AM Johnny Chu - Chu Hoàng Anh] PHASE-011 — kiểu manifest tối thiểu cho defineModule (bizcity_module@1; schema đầy đủ ở docs/contracts/BIZCITY-MODULE-v1.schema.json)
/** Phần manifest `bizcity.module.json` mà SDK đọc. Các trường khác giữ nguyên (bộ kiểm SC-CON-2 kiểm theo schema đầy đủ). */
export interface ModuleManifestLike {
  contract: string;
  id: string;
  key: string;
  kind: string;
  version: string;
  label: string;
  requires: { capabilities: string[] };
  actions?: string[];
  waivers?: { rule: string; reason?: string; adr?: string; expires?: string }[];
  [field: string]: unknown;
}

// [2026-11-17 05:30 PM khanhtd] NT-HT-003 — GĐ4 (§14, H13): màn × thao tác của module khai ở manifest extensions.screens[] — Core tự đăng ký (HT12, GET /api/v1/man-hinh)
/** Loại thao tác: xem / ghi (thêm, sửa, duyệt…) / huy (xoá, huỷ) / xuat (xuất Excel). */
export type ModuleScreenKind = 'xem' | 'ghi' | 'huy' | 'xuat';
export interface ModuleScreenOperation { permission: string; label: string; kind: ModuleScreenKind }
/**
 * Một màn của module: `key` = `<module>.<màn>`, mỗi nút (Xem, Thêm, Sửa, Xoá, Duyệt, Xuất, nút riêng) là một thao tác gác bằng một quyền
 * khai ở `permissions[]`. Bắt buộc có thao tác `xem`. Quyền của màn module KHÔNG được quyền Core kéo theo (mặc định cấm, ADR-0027).
 */
export interface ModuleScreen { key: string; code?: string; group?: string; label: string; path?: string; operations: Record<string, ModuleScreenOperation> }

const SCREEN_KINDS: readonly string[] = ['xem', 'ghi', 'huy', 'xuat'];

/** Màn module khai trong manifest (rỗng khi không khai). */
export const moduleScreens = (m: ModuleManifestLike): ModuleScreen[] =>
  ((m.extensions as { screens?: ModuleScreen[] } | undefined)?.screens ?? []);

/** Lỗi khai màn của module (rỗng = đúng). defineModule dừng nạp khi có lỗi; bộ kiểm module dùng lại. */
export function screenErrors(m: ModuleManifestLike): string[] {
  const bad: string[] = [];
  const declared = new Set(((m.permissions as { key: string }[] | undefined) ?? []).map((p) => p.key));
  const keyRe = new RegExp(`^${m.key.replace(/[-]/g, '\-')}\.[a-z0-9][a-z0-9.-]*$`);
  const seen = new Set<string>();
  for (const s of moduleScreens(m)) {
    const at = `màn ${s.key}`;
    if (!keyRe.test(s.key)) bad.push(`${at}: khoá phải dạng "${m.key}.<màn>"`);
    if (seen.has(s.key)) bad.push(`${at}: khoá trùng`);
    seen.add(s.key);
    if (!s.label?.trim()) bad.push(`${at}: thiếu label`);
    if (s.path !== undefined && s.path !== `/app/${m.key}` && !s.path.startsWith(`/app/${m.key}/`)) bad.push(`${at}: path "${s.path}" phải nằm dưới /app/${m.key}/`);
    if (!s.operations?.xem) bad.push(`${at}: thiếu thao tác "xem"`);
    for (const [k, o] of Object.entries(s.operations ?? {})) {
      if (!SCREEN_KINDS.includes(o.kind)) bad.push(`${at}.${k}: kind "${o.kind}" (cần ${SCREEN_KINDS.join(' / ')})`);
      if (!o.permission?.startsWith(`${m.key}:`)) bad.push(`${at}.${k}: quyền "${o.permission}" phải dạng "${m.key}:<việc>"`);
      else if (!declared.has(o.permission)) bad.push(`${at}.${k}: quyền "${o.permission}" chưa khai ở permissions[]`);
      if (!o.label?.trim()) bad.push(`${at}.${k}: thiếu label`);
    }
  }
  return bad;
}
