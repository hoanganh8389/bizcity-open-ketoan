// @bizcity-layer P permissions
// [2026-11-06 10:30 PM Johnny Chu - Chu Hoàng Anh] PHASE-028 — W3 đợt 2 (ADR-0027 Phụ lục A, W3 đợt 2 mục 4): requireScope — quyền theo chi nhánh / kho cho tài nguyên có vị trí; thư viện, chưa gắn vào route nghiệp vụ (W5)
/**
 * QUYỀN THEO PHẠM VI. Có hai đường cho phép, theo thứ tự:
 *   1. quyền TOÀN ĐƠN VỊ (đường auth.ts: vai trò chính + bổ sung + vai trò đơn vị, đã trừ Cấm) → được, bất kể tài nguyên ở đâu;
 *   2. lần gán có phạm vi chi nhánh / kho (user_role_assignments.scope_type) chứa vị trí của tài nguyên → bộ tính `authorize`.
 * Vị trí của tài nguyên do MÁY CHỦ nạp từ bản ghi (resolver), không từ thân yêu cầu (AUTHZ-11). Tài nguyên không có vị trí thì đường 2
 * ĐÓNG (từ chối): bộ tính coi "không vị trí" là mọi phạm vi đều chứa, ở đây không được hiểu như vậy. Khoá API / app: chỉ đường 1.
 * Thư viện này chưa gắn vào route nào: lần gán có phạm vi chưa cấp gì cho tới khi một route gọi nó (AUTHZ-16) — W5 gắn vào luồng chuyển kho.
 */
import type { FastifyReply, FastifyRequest } from 'fastify';
import { db, type Db } from '../../db/client.js';
import { Errors } from '../errors.js';
import { type AuthContext, type Permission } from '../auth.js';
import { authorize, scopeOf } from './engine.js';
import { buildCatalog, codePermissions, type CatalogEntry } from './catalog.js';
import { loadAuthzSnapshot } from './store.js';
import type { AuthzDecision, AuthzPurpose, AuthzResourceContext, AuthzScopeResult } from './types.js';

export type ScopeVia = 'tenant' | 'scope' | 'none';
export interface ScopedDecision { allowed: boolean; via: ScopeVia; reasonCode: string; decision?: AuthzDecision }
export type ScopeResolver = (req: FastifyRequest) => Promise<AuthzResourceContext> | AuthzResourceContext;

/** Mã lý do bổ sung của lớp này (ngoài AUTHZ_REASONS của bộ tính). */
export const SCOPE_REASONS = { TENANT: 'AUTHZ-SCOPE-TENANT', NO_LOCATION: 'AUTHZ-SCOPE-NO-LOCATION', NOT_USER: 'AUTHZ-SCOPE-NOT-USER' } as const;

let catalogCache: { size: number; map: Map<string, CatalogEntry> } | null = null;
async function catalog(): Promise<Map<string, CatalogEntry>> {
  const { listModulePermissions } = await import('../auth.js');
  const size = listModulePermissions().length;
  if (!catalogCache || catalogCache.size !== size) catalogCache = { size, map: buildCatalog(codePermissions()) };
  return catalogCache.map;
}

const located = (r: AuthzResourceContext): boolean => !!(r.branchId || r.warehouseId || r.orgPath);
const userIdOf = (auth: AuthContext): string | null => (auth.kind === 'user' ? auth.actor.slice('user:'.length) : null);

/** Người này làm được `permission` trên tài nguyên ở vị trí `resource` không? Không ném; ném là việc của requireScope. */
export async function authorizeScoped(auth: AuthContext, permission: Permission, resource: AuthzResourceContext, purpose: AuthzPurpose = 'operate', conn: Db = db): Promise<ScopedDecision> {
  if (auth.permissions.has(permission)) return { allowed: true, via: 'tenant', reasonCode: SCOPE_REASONS.TENANT };
  const userId = userIdOf(auth);
  if (!userId) return { allowed: false, via: 'none', reasonCode: SCOPE_REASONS.NOT_USER };
  if (!located(resource)) return { allowed: false, via: 'none', reasonCode: SCOPE_REASONS.NO_LOCATION };
  const snap = await loadAuthzSnapshot(conn, auth.tenantId, userId);
  const decision = authorize({
    principal: { kind: 'user', id: userId }, permission, purpose, resource, now: new Date(),
    authzVersion: snap.authzVersion, catalog: await catalog(), assignments: snap.assignments, roles: snap.roles,
  });
  return { allowed: decision.allowed, via: decision.allowed ? 'scope' : 'none', reasonCode: decision.reasonCode, decision };
}

/**
 * preHandler: cho qua khi `authorizeScoped` cho phép, ngược lại FORBIDDEN. `resolve` nạp vị trí từ bản ghi (không từ thân yêu cầu).
 * Không thay `requirePermission` ở route toàn đơn vị — chỉ dùng cho route có tài nguyên theo chi nhánh / kho.
 */
export function requireScope(permission: Permission, resolve: ScopeResolver, opts: { purpose?: AuthzPurpose } = {}) {
  return async (req: FastifyRequest, _reply: FastifyReply): Promise<void> => {
    const auth = req.auth;
    if (!auth) throw Errors.unauthorized();
    const d = await authorizeScoped(auth, permission, await resolve(req), opts.purpose ?? 'operate');
    if (!d.allowed) throw Errors.forbidden(`Không có quyền ${permission} tại chi nhánh / kho này (${d.reasonCode})`);
  };
}

/** Phạm vi được phép cho báo cáo / xuất: toàn đơn vị nếu có quyền toàn đơn vị, không thì hợp các phạm vi của lần gán có luật Cho (Cấm → rỗng). */
export async function allowedScope(auth: AuthContext, permission: Permission, purpose: AuthzPurpose = 'report', conn: Db = db): Promise<AuthzScopeResult> {
  if (auth.permissions.has(permission)) return { all: true };
  const none: AuthzScopeResult = { all: false, branchIds: [], warehouseIds: [], orgPaths: [] };
  const userId = userIdOf(auth);
  if (!userId) return none;
  const snap = await loadAuthzSnapshot(conn, auth.tenantId, userId);
  return scopeOf({ principal: { kind: 'user', id: userId }, permission, purpose, now: new Date(), authzVersion: snap.authzVersion, catalog: await catalog(), assignments: snap.assignments, roles: snap.roles });
}

export interface ScopeFilter { all: boolean; branchIds: string[]; warehouseIds: string[] }

/**
 * Giao phạm vi người dùng CHỌN với phạm vi được phép: `requested ∩ allowed`. Rỗng là rỗng — không bao giờ "rỗng = tất cả" (T028-8).
 * Không chọn gì (undefined) = lấy hết phạm vi được phép. Được phép toàn đơn vị thì giữ nguyên lựa chọn (không chọn = toàn đơn vị).
 */
export function restrictToScope(allowed: AuthzScopeResult, requested: { branchIds?: readonly string[]; warehouseIds?: readonly string[] } = {}): ScopeFilter {
  if (allowed.all) return { all: !requested.branchIds && !requested.warehouseIds, branchIds: [...(requested.branchIds ?? [])], warehouseIds: [...(requested.warehouseIds ?? [])] };
  const pick = (want: readonly string[] | undefined, have: readonly string[]): string[] => (want ? have.filter((x) => want.includes(x)) : [...have]);
  return { all: false, branchIds: pick(requested.branchIds, allowed.branchIds), warehouseIds: pick(requested.warehouseIds, allowed.warehouseIds) };
}
