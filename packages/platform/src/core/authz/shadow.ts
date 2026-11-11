// @bizcity-layer P permissions
// [2026-11-06 10:30 PM Johnny Chu - Chu Hoàng Anh] PHASE-028 — W3 đợt 2 (ADR-0027 Phụ lục A, W3 đợt 2 mục 2): shadow — so quyết định của bộ tính `authorize` với đường cũ (auth.ts) ở requirePermission, chỉ đếm và ghi, không đổi quyết định
/**
 * SHADOW: sau khi `requirePermission` quyết theo `auth.permissions` (đường cũ), tính lại bằng bộ tính mới và so:
 *   match          cùng quyết định
 *   only_legacy    đường cũ cho, bộ tính từ chối   → bộ tính chặt hơn / thiếu dữ liệu: phải sửa trước khi chuyển
 *   only_engine    đường cũ từ chối, bộ tính cho    → bộ tính cho THỪA: chặn chuyển (T028-9 "không có ALLOW sai")
 *   skipped_admin  người giữ vai trò quản trị cao (ADMIN_ROLES): đường cũ miễn Cấm, bộ tính chưa có ngoại lệ đó — không so
 * Không bao giờ đổi quyết định, không bao giờ ném lỗi (lỗi của shadow chỉ đếm `error`). Bật theo đơn vị bằng khoá cấu hình
 * `bizcity.authz.shadow` = on (mặc định off); khi tắt chỉ tốn một lần tra khoá đã đệm 15 giây. Khi bật, mỗi yêu cầu có người dùng đăng nhập
 * nạp lại lần gán + vai trò từ CSDL (không đệm, để không so trên dữ liệu cũ) — dùng để chạy thử một thời gian, không để mãi.
 * Số đếm trong tiến trình (`shadowStats`) và số đo Prometheus `bizcity_authz_shadow_total{result}` (PHASE-028 S028-16). Lệch gần nhất
 * xem theo đơn vị ở GET /api/v1/system/authz-shadow (cần users:write).
 */
import type { Role } from '@ketoan/contracts';
import { db, type Db } from '../../db/client.js';
import { getSetting } from '../settings.js';
import { listModulePermissions } from '../auth.js';
import { authorize } from './engine.js';
import { buildCatalog, codePermissions, type CatalogEntry } from './catalog.js';
import { loadAuthzSnapshot } from './store.js';
// [2026-11-09 02:35 PM kiennt] PHASE-028 — S028-16: mỗi lần đếm cũng tăng bizcity_authz_shadow_total{result}; lệch gần nhất lọc được theo đơn vị
import { metrics } from '../metrics.js';

export const SHADOW_KEY = 'bizcity.authz.shadow';
const CACHE_MS = 15_000;
const RECENT_MAX = 50;

export type ShadowResult = 'match' | 'only_legacy' | 'only_engine' | 'skipped_admin' | 'error';

export interface ShadowInput {
  tenantId: string;
  /** users.id (không có tiền tố `user:`). */
  userId: string;
  permission: string;
  /** Quyết định của đường cũ: auth.permissions.has(permission). */
  legacyAllowed: boolean;
  /** Người giữ vai trò thuộc ADMIN_ROLES (chính hoặc bổ sung). */
  isAdmin: boolean;
}

export interface ShadowDiff { at: string; tenantId: string; userId: string; permission: string; result: ShadowResult; engineReason: string; legacyAllowed: boolean }

const counters: Record<ShadowResult, number> = { match: 0, only_legacy: 0, only_engine: 0, skipped_admin: 0, error: 0 };
const recent: ShadowDiff[] = [];
const enabledCache = new Map<string, { on: boolean; at: number }>();
let catalogCache: { size: number; map: Map<string, CatalogEntry> } | null = null;

const zero = (): Record<ShadowResult, number> => ({ match: 0, only_legacy: 0, only_engine: 0, skipped_admin: 0, error: 0 });
const byTenant = new Map<string, Record<ShadowResult, number>>();

/** Số đếm theo kết quả và các lệch gần nhất (tối đa 50) trong tiến trình này; `tenantId` thì chỉ số đếm và lệch của đơn vị đó. */
export function shadowStats(tenantId?: string): { counters: Record<ShadowResult, number>; recent: readonly ShadowDiff[] } {
  if (!tenantId) return { counters: { ...counters }, recent: [...recent] };
  return { counters: { ...(byTenant.get(tenantId) ?? zero()) }, recent: recent.filter((d) => d.tenantId === tenantId) };
}

const count = (tenantId: string, r: ShadowResult) => {
  counters[r]++;
  const t = byTenant.get(tenantId) ?? zero();
  t[r]++;
  byTenant.set(tenantId, t);
  metrics.authzShadow.inc({ result: r });
};

export function resetShadowStats(): void {
  for (const k of Object.keys(counters) as ShadowResult[]) counters[k] = 0;
  recent.length = 0;
  byTenant.clear();
  enabledCache.clear();
}

/** Bỏ đệm bật / tắt (vừa đổi khoá cấu hình ở tiến trình này). */
export function forgetShadowEnabled(tenantId?: string): void {
  if (tenantId) enabledCache.delete(tenantId); else enabledCache.clear();
}

/** Khoá `bizcity.authz.shadow` = on cho đơn vị? Lỗi đọc → tắt (shadow không được làm hỏng yêu cầu). */
export async function shadowEnabled(tenantId: string, conn: Db = db): Promise<boolean> {
  const hit = enabledCache.get(tenantId);
  if (hit && Date.now() - hit.at < CACHE_MS) return hit.on;
  let on = false;
  try { on = (await getSetting(conn, tenantId, SHADOW_KEY)).value === 'on'; } catch { on = false; }
  enabledCache.set(tenantId, { on, at: Date.now() });
  return on;
}

function catalog(): Map<string, CatalogEntry> {
  const size = listModulePermissions().length;
  if (!catalogCache || catalogCache.size !== size) catalogCache = { size, map: buildCatalog(codePermissions()) };
  return catalogCache.map;
}

/**
 * So một quyết định. Trả kết quả đã đếm; không ném. `log` (nếu có) nhận một dòng cảnh báo khi lệch — chỉ mã và định danh, không dữ liệu kế toán.
 */
export async function shadowCompare(input: ShadowInput, conn: Db = db, log?: { warn: (o: object, msg: string) => void }): Promise<ShadowResult> {
  if (input.isAdmin) { count(input.tenantId, 'skipped_admin'); return 'skipped_admin'; }
  try {
    const snap = await loadAuthzSnapshot(conn, input.tenantId, input.userId);
    const d = authorize({
      principal: { kind: 'user', id: input.userId }, permission: input.permission, purpose: 'operate', now: new Date(),
      authzVersion: snap.authzVersion, catalog: catalog(), assignments: snap.assignments, roles: snap.roles,
    });
    const result: ShadowResult = d.allowed === input.legacyAllowed ? 'match' : input.legacyAllowed ? 'only_legacy' : 'only_engine';
    count(input.tenantId, result);
    if (result !== 'match') {
      const diff: ShadowDiff = { at: new Date().toISOString(), tenantId: input.tenantId, userId: input.userId, permission: input.permission, result, engineReason: d.reasonCode, legacyAllowed: input.legacyAllowed };
      recent.push(diff);
      if (recent.length > RECENT_MAX) recent.shift();
      log?.warn({ authzShadow: result, permission: input.permission, reasonCode: d.reasonCode, tenantId: input.tenantId, userId: input.userId }, 'authz shadow: bộ tính và đường cũ quyết khác nhau');
    }
    return result;
  } catch {
    count(input.tenantId, 'error');
    return 'error';
  }
}

/** Vai trò thuộc tập quản trị cao? (truyền vào để shadow không tự nhập ADMIN_ROLES — tránh vòng nhập với auth.ts). */
export const hasAdminRole = (roles: readonly Role[], admin: ReadonlySet<Role>): boolean => roles.some((r) => admin.has(r));
