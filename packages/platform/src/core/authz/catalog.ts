// @bizcity-layer P permissions
// [2026-11-05 06:30 PM Johnny Chu - Chu Hoàng Anh] PHASE-028 — W1 nền: sổ quyền = 18 quyền Core (nhãn rủi ro / tài nguyên / thao tác) + quyền module; so bản chụp ra new / active / changed / removed; diff nâng cấp (ADR-0027 D1, SC-AUTH-05)
/**
 * Sổ quyền nằm trong CODE (ADR-0027 D1). Bản chụp authz_registry_seen chỉ để biết quyền nào mới / đổi nghĩa / bị bỏ:
 *   - chưa thấy                         → new      (mẫu * không phủ; chỉ luật đích danh cấp được)
 *   - đã thấy, băm nghĩa khác            → changed  (như new cho tới khi duyệt lại)
 *   - đã thấy, cùng băm                  → giữ trạng thái đã ghi (new cho tới khi người quản trị duyệt → active)
 *   - có trong bản chụp, code không còn  → removed
 * Không có bản chụp (bản cài chưa chạy 0072 / test) → mọi quyền 'active' (hành vi hôm nay).
 */
import { createHash } from 'node:crypto';
import type { AuthzCatalogEntry, AuthzConditions, AuthzPermissionDef, AuthzPermissionStatus } from './types.js';
import { PERMISSIONS, listModulePermissions, type CorePermission } from '../auth.js';

type CoreMeta = Omit<AuthzPermissionDef, 'key' | 'label' | 'module'> & { label: string; defaults?: AuthzConditions };

/** Siêu dữ liệu 18 quyền Core — chuỗi quyền giữ nguyên (D-AUTH-02). `high`: không mẫu *, không khoá API / trợ lý (AUTHZ-09). */
export const CORE_PERMISSION_META: Record<CorePermission, CoreMeta> = {
  'catalog:read': { label: 'Xem danh mục', risk: 'low', resource: 'catalog', operation: 'read' },
  'catalog:write': { label: 'Thêm / sửa danh mục', risk: 'low', resource: 'catalog', operation: 'update' },
  'documents:read': { label: 'Xem chứng từ', risk: 'low', resource: 'document', operation: 'read', scopeKinds: ['branch', 'warehouse'] },
  'documents:write': { label: 'Lập / sửa / huỷ chứng từ', risk: 'low', resource: 'document', operation: 'update', scopeKinds: ['branch', 'warehouse'] },
  'documents:edit-all': { label: 'Sửa / huỷ phiếu của người khác', risk: 'high', resource: 'document', operation: 'update', scopeKinds: ['branch', 'warehouse'], aliases: ['tgs:HT21', 'tgs:ACC3F'] },
  'documents:bypass-date-lock': { label: 'Vượt khoá dữ liệu theo ngày', risk: 'high', resource: 'document', operation: 'update', aliases: ['tgs:HT9', 'tgs:HT10', 'tgs:HT47'] },
  'ledger:read': { label: 'Xem sổ cái', risk: 'low', resource: 'ledger', operation: 'read', aliases: ['tgs:ACC3', 'tgs:ACC88'] },
  'reports:read': { label: 'Xem báo cáo', risk: 'low', resource: 'report', operation: 'read', scopeKinds: ['branch', 'warehouse'] },
  'payments:approve': { label: 'Duyệt yêu cầu thanh toán cấp 1', risk: 'high', resource: 'payment_request', operation: 'approve', scopeKinds: ['branch'] },
  'payments:approve-final': { label: 'Duyệt yêu cầu thanh toán cấp 2 (vượt ngưỡng)', risk: 'high', resource: 'payment_request', operation: 'approve', scopeKinds: ['branch'] },
  'periods:lock': { label: 'Khoá / mở kỳ kế toán', risk: 'high', resource: 'period', operation: 'manage' },
  'settings:write': { label: 'Cấu hình đơn vị', risk: 'high', resource: 'settings', operation: 'configure', aliases: ['tgs:CH10'] },
  'users:write': { label: 'Quản trị người dùng, khoá API', risk: 'high', resource: 'user', operation: 'manage', aliases: ['tgs:HT4', 'tgs:HT14'] },
  'conformance:read': { label: 'Xem Kiểm chuẩn', risk: 'low', resource: 'conformance', operation: 'read' },
  'conformance:run': { label: 'Chạy Kiểm chuẩn', risk: 'low', resource: 'conformance', operation: 'run' },
  'conformance:approve': { label: 'Duyệt / thu hồi rulepack', risk: 'high', resource: 'rulepack', operation: 'approve' },
  'review:read': { label: 'Xem Bàn đánh giá', risk: 'low', resource: 'review', operation: 'read' },
  'devtools:read': { label: 'Bàn điều tra cho nhà phát triển', risk: 'high', resource: 'devtools', operation: 'read' },
};

/** Băm NGHĨA của quyền — đổi nhãn / bí danh không đổi băm; đổi rủi ro / tài nguyên / thao tác / độ nhạy cảm thì đổi. */
export function meaningHash(def: Pick<AuthzPermissionDef, 'risk' | 'resource' | 'operation' | 'sensitive'>): string {
  const canon = JSON.stringify([def.risk ?? 'low', def.resource ?? null, def.operation ?? null, def.sensitive ?? null]);
  return `sha256:${createHash('sha256').update(canon).digest('hex')}`;
}

/** Mọi quyền đang có trong code: Core + module đã đăng ký lúc khởi động. */
export function codePermissions(): (AuthzPermissionDef & { defaults?: AuthzConditions })[] {
  const core = PERMISSIONS.map((key) => ({ key, module: 'core', ...CORE_PERMISSION_META[key] }));
  // auth.ts hôm nay chỉ khai key / label / roles / risk; trường mở rộng (resource, operation, …) đọc như tuỳ chọn để khi sổ quyền được mở rộng thì tự có.
  const mods = listModulePermissions().map((raw) => {
    const p = raw as typeof raw & Partial<AuthzPermissionDef>;
    return {
      key: p.key, label: p.label, module: p.module, risk: p.risk ?? 'low', resource: p.resource, operation: p.operation, sensitive: p.sensitive,
      scopeKinds: p.scopeKinds, stepUp: p.stepUp, aliases: p.aliases, suggestedRoles: p.roles, since: p.since, replaces: p.replaces,
    } satisfies AuthzPermissionDef;
  });
  return [...core, ...mods];
}

export interface SeenRow { permission_key: string; meaning_hash: string; status: AuthzPermissionStatus }

export type CatalogEntry = AuthzCatalogEntry & { defaults?: AuthzConditions };

export function buildCatalog(defs: readonly (AuthzPermissionDef & { defaults?: AuthzConditions })[], seen?: readonly SeenRow[]): Map<string, CatalogEntry> {
  const out = new Map<string, CatalogEntry>();
  const prev = seen ? new Map(seen.map((s) => [s.permission_key, s])) : null;
  for (const d of defs) {
    const hash = meaningHash(d);
    const s = prev?.get(d.key);
    const status: AuthzPermissionStatus = !prev ? 'active' : !s ? 'new' : s.meaning_hash !== hash ? 'changed' : s.status === 'removed' ? 'new' : s.status;
    out.set(d.key, { ...d, risk: d.risk ?? 'low', hash, status });
  }
  for (const s of seen ?? []) {
    if (!out.has(s.permission_key)) out.set(s.permission_key, { key: s.permission_key, label: s.permission_key, module: s.permission_key.split(':')[0]!, hash: s.meaning_hash, status: 'removed' });
  }
  return out;
}

export interface CatalogDiff {
  added: string[];
  removed: string[];
  changed: { key: string; riskRaised: boolean }[];
}

/** Diff hai lần nạp sổ (nâng cấp module): quyền mới, đổi nghĩa (rủi ro tăng → luật cấp quyền đó phải xác nhận lại), bị bỏ. */
export function diffCatalog(prev: ReadonlyMap<string, AuthzCatalogEntry>, next: ReadonlyMap<string, AuthzCatalogEntry>): CatalogDiff {
  const live = (m: ReadonlyMap<string, AuthzCatalogEntry>) => new Map([...m].filter(([, e]) => e.status !== 'removed'));
  const a = live(prev), b = live(next);
  return {
    added: [...b.keys()].filter((k) => !a.has(k)).sort(),
    removed: [...a.keys()].filter((k) => !b.has(k)).sort(),
    changed: [...b.values()].filter((e) => a.has(e.key) && a.get(e.key)!.hash !== e.hash)
      .map((e) => ({ key: e.key, riskRaised: a.get(e.key)!.risk !== 'high' && e.risk === 'high' })).sort((x, y) => x.key.localeCompare(y.key)),
  };
}
