/**
 * Phân quyền — logic thuần của ma trận (không React, không gọi API): gom nhóm, đọc ô, giải thích một ô, việc làm được trên ô.
 * Quyền do MÁY CHỦ quyết: ở đây chỉ dựng cái nhìn từ dữ liệu `GET /api/v1/roles/matrix` và `GET /api/v1/roles/:id`.
 */

export interface MatrixPermission { key: string; label: string; module: string; risk: 'low' | 'high'; resource: string | null; operation: string | null }
export interface MatrixRole { id: string; code: string; label: string; kind: string; isActive: boolean; baseRole: string | null; system: boolean }
export interface MatrixData {
  permissions: MatrixPermission[];
  roles: MatrixRole[];
  cells: Record<string, { allow: string[]; deny: string[] }>;
}
export interface RoleRule { id: string; permission: string; effect: 'allow' | 'deny'; note: string | null; active: boolean }
export interface RoleDetail { id: string; code: string; label: string; kind: string; baseRole: string | null; isActive: boolean; version: number; rules: RoleRule[] }

export type Cell = 'allow' | 'deny' | 'none';

export const SYSTEM_PREFIX = 'system:';
export const TENANT_PREFIX = 'tenant:';
export const roleDbId = (roleId: string): string => roleId.slice(TENANT_PREFIX.length);

const MODULE_LABELS: Record<string, string> = { core: 'Lõi (kế toán, danh mục, hệ thống)' };
export const moduleLabel = (module: string): string => MODULE_LABELS[module] ?? module;

/** Mẫu quyền của luật Cấm: `*` khớp một vế `[a-z0-9-]*`, không vượt dấu `:` (bizcity_authorization@1 §4). */
export function matchPattern(pattern: string, permission: string): boolean {
  if (!pattern.includes('*')) return pattern === permission;
  const re = new RegExp(`^${pattern.split('*').map((p) => p.replace(/[.+?^${}()|[\]\\]/g, '\\$&')).join('[a-z0-9-]*')}$`);
  return re.test(permission);
}

export interface PermissionGroup { module: string; label: string; items: MatrixPermission[] }

/** Gom quyền theo module: Lõi trước, các module sau theo tên; trong nhóm theo khoá. Tìm theo khoá hoặc nhãn (không phân biệt hoa thường). */
export function groupPermissions(perms: readonly MatrixPermission[], query = ''): PermissionGroup[] {
  const q = query.trim().toLowerCase();
  const kept = q ? perms.filter((p) => p.key.toLowerCase().includes(q) || p.label.toLowerCase().includes(q)) : [...perms];
  const by = new Map<string, MatrixPermission[]>();
  for (const p of kept) (by.get(p.module) ?? by.set(p.module, []).get(p.module)!).push(p);
  return [...by.entries()]
    .sort(([a], [b]) => (a === 'core' ? -1 : b === 'core' ? 1 : a.localeCompare(b)))
    .map(([module, items]) => ({ module, label: moduleLabel(module), items: items.sort((x, y) => x.key.localeCompare(y.key)) }));
}

/** Ô của một vai trò × quyền. Cấm thắng nếu máy chủ báo cả hai (không xảy ra, đề phòng). */
export function cellOf(m: Pick<MatrixData, 'cells'>, roleId: string, permission: string): Cell {
  const c = m.cells[roleId];
  if (!c) return 'none';
  if (c.deny.includes(permission)) return 'deny';
  if (c.allow.includes(permission)) return 'allow';
  return 'none';
}

export type CellReason =
  | { kind: 'base'; baseRole: string }
  | { kind: 'rule-allow'; rule: RoleRule }
  | { kind: 'rule-deny'; rules: RoleRule[] }
  | { kind: 'system' }
  | { kind: 'none' };

export interface CellExplain {
  cell: Cell;
  /** Vì sao ô ra như vậy, theo thứ tự ưu tiên: Cấm, Cho riêng, nền, hệ thống. */
  reasons: CellReason[];
  /** Việc người dùng làm được trên ô này (chỉ vai trò của đơn vị đang bật; cột vai trò hệ thống chỉ đọc). */
  canAllow: boolean;
  canDeny: boolean;
  removable: RoleRule[];
}

/**
 * Giải thích một ô. `detail` là chi tiết vai trò của đơn vị (luật đang áp dụng); với vai trò hệ thống để undefined.
 * `base` = ô của chính vai trò nền ở cột hệ thống → biết quyền đến từ nền hay từ luật Cho riêng.
 */
export function explainCell(m: MatrixData, role: MatrixRole, detail: RoleDetail | undefined, permission: string): CellExplain {
  const cell = cellOf(m, role.id, permission);
  if (role.system) return { cell, reasons: [{ kind: 'system' }], canAllow: false, canDeny: false, removable: [] };
  const rules = (detail?.rules ?? []).filter((r) => r.active);
  const denyRules = rules.filter((r) => r.effect === 'deny' && matchPattern(r.permission, permission));
  const ownAllow = rules.find((r) => r.effect === 'allow' && r.permission === permission);
  const fromBase = !!role.baseRole && cellOf(m, `${SYSTEM_PREFIX}${role.baseRole}`, permission) === 'allow';
  const reasons: CellReason[] = [];
  if (denyRules.length) reasons.push({ kind: 'rule-deny', rules: denyRules });
  if (ownAllow) reasons.push({ kind: 'rule-allow', rule: ownAllow });
  if (fromBase) reasons.push({ kind: 'base', baseRole: role.baseRole! });
  if (!reasons.length) reasons.push({ kind: 'none' });
  const editable = role.isActive;
  return {
    cell,
    reasons,
    // Cho chỉ cho vai trò không phải restriction, chưa có Cho riêng, chưa có Cấm khớp, và quyền chưa đến từ nền.
    canAllow: editable && role.kind !== 'restriction' && !ownAllow && !fromBase && denyRules.length === 0,
    // Cấm: chưa có luật Cấm đích danh cho quyền này (mẫu rộng hơn vẫn thêm được luật đích danh, nhưng thừa).
    canDeny: editable && denyRules.length === 0,
    removable: [...(ownAllow ? [ownAllow] : []), ...denyRules],
  };
}

/** Nhãn ngắn cho ô. */
export const CELL_TEXT: Record<Cell, string> = { allow: 'Có', deny: 'Cấm', none: '—' };

/** Tóm tắt một cột: số quyền Có, số quyền Cấm. */
export function columnSummary(m: Pick<MatrixData, 'cells'>, roleId: string): { allow: number; deny: number } {
  const c = m.cells[roleId];
  return { allow: c?.allow.length ?? 0, deny: c?.deny.length ?? 0 };
}

/** Câu lỗi của API cho biết cần nhập lại mật khẩu (code 400 nêu `confirmPassword`). */
export const needsPassword = (message: string): boolean => /confirmPassword/.test(message);

/** Lý do tối thiểu 3 ký tự sau khi cắt khoảng trắng (khớp schema máy chủ). */
export const validReason = (s: string): boolean => s.trim().length >= 3;

/**
 * Thao tác cả nhóm (PHASE-028 giai đoạn 4.2) cho một vai trò của đơn vị:
 *  - allow: mọi quyền RỦI RO THẤP của nhóm chưa có luật Cho đích danh (Cho không dùng *; quyền cao vẫn phải Cho từng quyền, nhập lại mật khẩu);
 *  - deny: mẫu `<tiền tố>:*` cho mỗi tiền tố quyền của nhóm chưa bị Cấm (Cấm được dùng *, phủ cả quyền cao). Nhóm Lõi có nhiều tiền tố
 *    (catalog, documents…) nên ra nhiều mẫu; nhóm module ra đúng `<module>:*`.
 */
export function groupRulePlan(items: readonly MatrixPermission[], detail: RoleDetail | undefined): { allow: string[]; deny: string[] } {
  const active = (detail?.rules ?? []).filter((r) => r.active);
  const allowed = new Set(active.filter((r) => r.effect === 'allow').map((r) => r.permission));
  const denied = new Set(active.filter((r) => r.effect === 'deny').map((r) => r.permission));
  const allow = items.filter((p) => p.risk === 'low' && !allowed.has(p.key)).map((p) => p.key).sort();
  const deny = [...new Set(items.map((p) => `${p.key.split(':')[0]}:*`))].filter((d) => !denied.has(d)).sort();
  return { allow, deny };
}
