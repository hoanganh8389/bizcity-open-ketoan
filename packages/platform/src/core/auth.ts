// @bizcity-layer P permissions
// [2026-11-02 03:10 AM Johnny Chu - Chu Hoàng Anh] PHASE-020 — quyền conformance:read (xem Kiểm chuẩn) và conformance:run (chạy một lượt, lưu ảnh chụp) cho Conformance Engine (ADR-0012, D020-7).
// [2026-10-29 10:24 PM Johnny Chu - Chu Hoàng Anh] INIT — khởi tạo Bizcity Core Framework: sổ cái chỉ thêm, cửa nạp sự việc, CANON, hợp đồng, bộ kiểm chuẩn.
// [2026-10-29 11:31 PM Johnny Chu - Chu Hoàng Anh] PHASE-001 — bộ kiểm chuẩn xanh, gia cố R-API-6, R-BOUND-2, R-SEC-11, R-REL-1.
// [2026-10-30 12:37 AM Johnny Chu - Chu Hoàng Anh] PHASE-001 — migration đúng chuẩn, vai trò CSDL thường cho API, bộ test xanh.
// [2026-10-30 09:58 AM Johnny Chu - Chu Hoàng Anh] PHASE-002 — nhãn lớp @bizcity-layer, đồ thị phụ thuộc mốc, bản nháp API module-sdk.
// [2026-10-30 11:45 AM Johnny Chu - Chu Hoàng Anh] PHASE-003 — MCP cho trợ lý AI: POST /mcp, công cụ sinh từ action, xác nhận trước khi ghi (PHASES 2.11, 2.12).
// [2026-10-30 09:23 PM Johnny Chu - Chu Hoàng Anh] PHASE-007 — cô lập đơn vị bằng RLS.
// [2026-11-01 04:20 PM Johnny Chu - Chu Hoàng Anh] PHASE-010 — dời từ apps/api/src/core/auth.ts sang packages/platform (@bizcity/platform, D010-7 chặng 2); import tương đối viết lại theo chỗ mới
// [2026-11-02 10:43 AM Johnny Chu - Chu Hoàng Anh] PHASE-011 — 3.14 (ADR-0011 mức 2): khoá app (api_keys.app_key) — quyền theo app_installations.permissions, kết nối tắt → từ chối; AuthContext.app
/**
 * Xác thực và phân quyền.
 *
 * Hai cách gọi API:
 *   1. Người dùng giao diện: header  Authorization: Bearer <jwt>
 *   2. Hệ thống tích hợp:    header  X-Api-Key: <khoá>
 *      Khoá của app ngoài tiến trình (ADR-0011 mức 2, api_keys.app_key): quyền = phạm vi đã đồng ý lúc kết nối
 *      (app_installations.permissions), không theo scopes; kết nối tắt → khoá bị từ chối như khoá thu hồi.
 *
 * Sau khi qua bước này, mỗi request có `req.auth` (đơn vị, người gọi, vai trò, phạm vi).
 * Route khai báo quyền cần bằng `preHandler: requirePermission('documents:write')`.
 */
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import fp from 'fastify-plugin';
import type { Role } from '@ketoan/contracts';
import { db } from '../db/client.js';
import { Errors } from './errors.js';
import { hashApiKey } from './security/password.js';
import { getAppManifest } from './apps.js';
import { verifySession } from './security/tokens.js';
import { currentRequest } from './request-context.js';
import { sessionStillValid } from './security/session-state.js';
import { extraAuthz, type ExtraAuthz } from './security/role-assignments.js';
import { matchPattern } from './authz/engine.js';

/** Danh sách quyền. Thêm quyền mới: khai ở đây và gán cho vai trò bên dưới. */
export const PERMISSIONS = [
  'catalog:read',
  'catalog:write',
  'documents:read',
  'documents:write',
  /** Sửa / huỷ phiếu nhập tay do người khác lập. Không có quyền này: chỉ sửa / huỷ phiếu của mình. */
  'documents:edit-all',
  /** Không bị chặn bởi khoá dữ liệu theo ngày (khoá đến ngày, chỉ sửa trong N ngày, chỉ lập phiếu hôm nay, cấm huỷ). */
  'documents:bypass-date-lock',
  'ledger:read',
  'reports:read',
  /** Duyệt yêu cầu thanh toán cấp 1 / cấp 2 (cấp 2: yêu cầu vượt ngưỡng). */
  'payments:approve',
  'payments:approve-final',
  'periods:lock',
  'settings:write',
  'users:write',
  /** Xem kết quả Kiểm chuẩn (Conformance Engine, ADR-0012). */
  'conformance:read',
  /** Chạy một lượt Kiểm chuẩn và lưu ảnh chụp (chỉ đọc sổ; không đổi sổ, không đổi cấu hình). */
  'conformance:run',
  /** Duyệt / thu hồi rulepack cho đơn vị (bản cài tự chủ, ADR-0016): kết quả dựa trên duyệt này mang nhãn "Đạt theo duyệt của đơn vị". */
  'conformance:approve',
  // [2026-11-02 10:10 PM Johnny Chu - Chu Hoàng Anh] PHASE-022 — W4: Bàn đánh giá (HT08) — checklist giả định lỗi theo vai, phương án khắc phục, xác nhận cảnh báo; chỉ đọc.
  /** Xem Bàn đánh giá theo vai (kế toán trưởng, kiểm soát, thanh tra thuế — tự rà trước). */
  'review:read',
  // [2026-11-01 10:40 PM Johnny Chu - Chu Hoàng Anh] PHASE-019 — W2: quyền devtools:read (D019-3) — chủ đơn vị + vai trò developer; không cấp cho khoá API, không cho AI.
  /** Bàn điều tra cho nhà phát triển (PHASE-019): đọc trace / log / bằng chứng của đơn vị qua API trung gian. Không phạm vi khoá API nào ánh xạ tới. */
  'devtools:read',
] as const;
// [2026-11-02 05:30 PM Johnny Chu - Chu Hoàng Anh] PHASE-011 — 3.3 (permissions.module): quyền do module khai trong manifest permissions[] — registry, vai trò mặc định theo roles, quyền risk high không cho AI / khoá API
export type CorePermission = (typeof PERMISSIONS)[number];
/** Quyền module khai trong manifest `permissions[]` (`<key>:<việc>`, BIZCITY-MODULE §3) — đăng ký lúc khởi động. */
export type ModulePermission = `${string}:${string}`;
export type Permission = CorePermission | ModulePermission;

export interface ModulePermissionDef { key: string; label: string; roles?: string[]; risk?: 'low' | 'high' }
const modulePermissions = new Map<string, ModulePermissionDef & { module: string }>();
const MODULE_PERM_RE = /^([a-z][a-z0-9-]*):[a-z][a-z0-9-]*$/;

/** Đăng ký quyền của một module (app.ts từ manifest; test). Tiền tố phải là khoá module, không trùng quyền Core / module khác. */
export function registerModulePermissions(module: string, defs: readonly ModulePermissionDef[]): void {
  for (const d of defs) {
    const m = MODULE_PERM_RE.exec(d.key);
    if (m?.[1] !== module) throw new Error(`Quyền "${d.key}" của module ${module} phải dạng "${module}:<việc>"`);
    if ((PERMISSIONS as readonly string[]).includes(d.key)) throw new Error(`Quyền "${d.key}" trùng quyền Core`);
    const cur = modulePermissions.get(d.key);
    if (cur && cur.module !== module) throw new Error(`Quyền "${d.key}" đã thuộc module ${cur.module}`);
    modulePermissions.set(d.key, { ...d, module });
  }
}

export const listModulePermissions = (): (ModulePermissionDef & { module: string })[] => [...modulePermissions.values()];
export const isKnownPermission = (p: string): p is Permission => (PERMISSIONS as readonly string[]).includes(p) || modulePermissions.has(p);
/** Quyền module rủi ro cao: không cấp cho trợ lý AI, khoá API (BIZCITY-MODULE §3). */
export const isHighRiskPermission = (p: string): boolean => modulePermissions.get(p)?.risk === 'high';

// [2026-11-05 06:40 PM Johnny Chu - Chu Hoàng Anh] PHASE-028 — W1 (ADR-0027 D-AUTH-03 bản chủ duyệt): tập vai trò quản trị cao thay so sánh cứng role === 'owner'; quyền hiệu lực của nhiều vai trò
/**
 * Vai trò quản trị cao (ADR-0027 D-AUTH-03): nhận mọi quyền module, kể cả quyền module không khai `roles`. Vai trò khác chỉ nhận quyền
 * module khai mình trong `roles` — không khai là mặc định cấm. Thêm vai trò quản trị (vd `admin`) = thêm vào tập này.
 */
export const ADMIN_ROLES: ReadonlySet<Role> = new Set<Role>(['owner']);

/** Quyền của vai trò: quyền Core theo bảng + quyền module có vai trò trong `roles` (vai trò quản trị cao: mọi quyền module). */
export function rolePermissions(role: Role): Set<Permission> {
  const out = new Set<Permission>(ROLE_PERMISSIONS[role] ?? []);
  for (const p of modulePermissions.values()) if (ADMIN_ROLES.has(role) || p.roles?.includes(role)) out.add(p.key as Permission);
  return out;
}

/** Quyền hiệu lực của nhiều vai trò (vai trò chính + vai trò bổ sung): hợp các tập quyền — trong phạm vi đơn vị (D-AUTH-04). */
export function effectivePermissions(roles: readonly Role[]): Set<Permission> {
  const out = new Set<Permission>();
  for (const r of roles) for (const p of rolePermissions(r)) out.add(p);
  return out;
}

// [2026-11-06 04:30 PM Johnny Chu - Chu Hoàng Anh] PHASE-028 — W2 đợt 2 (ADR-0027 Phụ lục A, chữ chốt bước 3): quyền hiệu lực có vai trò của đơn vị — (vai trò chính ∪ bổ sung ∪ nền + Cho) − Cấm; Cấm không áp cho vai trò quản trị cao
/**
 * Quyền hiệu lực của người dùng: hợp quyền các vai trò hệ thống (chính + bổ sung) và vai trò nền của vai trò đơn vị, thêm luật Cho đích
 * danh (chỉ quyền có trong sổ quyền của code), rồi trừ mọi quyền khớp luật Cấm — Cấm thắng cả quyền của vai trò chính (D-AUTH-04).
 * Người có một vai trò thuộc ADMIN_ROLES không bị Cấm (chống khoá chủ đơn vị khỏi quản trị).
 */
export function effectivePermissionsWithTenantRoles(roles: readonly Role[], extra: Pick<ExtraAuthz, 'baseRoles' | 'allow' | 'deny'>): Set<Permission> {
  const out = effectivePermissions([...roles, ...extra.baseRoles]);
  for (const p of extra.allow) if (isKnownPermission(p)) out.add(p);
  if (!extra.deny.length || roles.some((r) => ADMIN_ROLES.has(r))) return out;
  for (const p of [...out]) if (extra.deny.some((d) => matchPattern(d, p))) out.delete(p);
  return out;
}

const VIEWER_PERMISSIONS: readonly Permission[] = ['catalog:read', 'documents:read', 'ledger:read', 'reports:read', 'conformance:read'];

const ROLE_PERMISSIONS: Record<Role, readonly Permission[]> = {
  owner: PERMISSIONS,
  chief_accountant: ['catalog:read', 'catalog:write', 'documents:read', 'documents:write', 'documents:edit-all', 'documents:bypass-date-lock', 'payments:approve', 'ledger:read', 'reports:read', 'periods:lock', 'settings:write', 'conformance:read', 'conformance:run', 'conformance:approve', 'review:read'],
  accountant: ['catalog:read', 'catalog:write', 'documents:read', 'documents:write', 'ledger:read', 'reports:read', 'conformance:read', 'conformance:run', 'review:read'],
  viewer: VIEWER_PERMISSIONS,
  // Nhà phát triển (Q019-1 = b): xem như viewer + Bàn điều tra; không ghi chứng từ, không cấu hình.
  developer: [...VIEWER_PERMISSIONS, 'devtools:read'],
  // Kiểm soát / ban kiểm soát (Q022-1): xem như viewer + Bàn đánh giá; không ghi, không cấu hình.
  auditor: [...VIEWER_PERMISSIONS, 'review:read'],
};

/** Phạm vi của khoá API → quyền tương ứng. */
const SCOPE_PERMISSIONS: Record<string, readonly Permission[]> = {
  'documents:write': ['documents:write', 'documents:edit-all', 'documents:read', 'catalog:read'],
  'reports:read': ['reports:read', 'ledger:read', 'catalog:read', 'conformance:read'],
  'catalog:write': ['catalog:write', 'catalog:read'],
};

// [2026-11-09 01:52 PM kiennt] PHASE-028 — S028-13: lộ ánh xạ phạm vi khoá → quyền để lúc tạo khoá kiểm người tạo có đủ các quyền đó
/** Quyền mà một tập phạm vi khoá API mang theo (cùng bảng với lúc xác thực khoá). */
export function scopePermissions(scopes: readonly string[]): Set<Permission> {
  return new Set<Permission>(scopes.flatMap((s) => SCOPE_PERMISSIONS[s] ?? []));
}

/**
 * Phiếu nhập tay (phiếu thu, chi, kế toán, kết chuyển…) chỉ người lập được sửa / huỷ, trừ khi có quyền
 * documents:edit-all (chủ đơn vị, kế toán trưởng, khoá API). Chứng từ nhận từ hệ thống khác không áp luật này.
 */
export function assertCanModify(auth: { kind: string; actor: string; permissions: ReadonlySet<string> }, row: { source_system: string; created_by: string | null }, action: 'sửa' | 'huỷ'): void {
  if (row.source_system !== 'manual' || auth.kind !== 'user' || auth.permissions.has('documents:edit-all')) return;
  if (row.created_by !== auth.actor) throw Errors.forbidden(`Bạn chỉ ${action} được phiếu do chính mình lập. Phiếu của người khác cần kế toán trưởng ${action}.`);
}

export interface AuthContext {
  tenantId: string;
  /** Định danh người gọi để ghi nhật ký: "user:<id>" hoặc "apikey:<id>". */
  actor: string;
  actorName: string;
  kind: 'user' | 'apikey';
  /** Vai trò chính (users.role, ghi trong vé). */
  role: Role | null;
  /** Vai trò chính + vai trò bổ sung còn hiệu lực (user_role_assignments, PHASE-028 W1). Khoá API / phiên quyền quản trị cấp: không có. */
  roles?: readonly Role[];
  permissions: ReadonlySet<Permission>;
  /** Khoá của app ngoài tiến trình (kind 'apikey'): khoá app. Cửa nạp buộc docKey `<app>:…`, bằng chứng ghi via `app:<app>`. */
  app?: string;
}

declare module 'fastify' {
  interface FastifyRequest {
    auth?: AuthContext;
  }
  interface FastifyContextConfig {
    /** Route công khai, không cần đăng nhập. */
    public?: boolean;
  }
}

async function resolveAuth(req: FastifyRequest): Promise<AuthContext | null> {
  const apiKey = req.headers['x-api-key'];
  if (typeof apiKey === 'string' && apiKey.length > 10) {
    const row = await db
      .selectFrom('api_keys as k')
      .leftJoin('app_installations as i', (j) => j.onRef('i.tenant_id', '=', 'k.tenant_id').onRef('i.app_key', '=', 'k.app_key'))
      .select(['k.id', 'k.tenant_id', 'k.name', 'k.scopes', 'k.app_key', 'i.status as app_status', 'i.permissions as app_permissions'])
      .where('k.key_hash', '=', hashApiKey(apiKey))
      .where('k.revoked_at', 'is', null)
      .executeTakeFirst();
    if (!row) return null;
    // Khoá app: kết nối phải đang bật và app còn cài trong bản này; quyền chỉ trong danh sách Permission của Core.
    if (row.app_key && (row.app_status !== 'active' || !getAppManifest(row.app_key))) return null;
    // Ghi lần dùng cuối, không chặn request.
    void db.updateTable('api_keys').set({ last_used_at: new Date() }).where('id', '=', row.id).execute();
    const perms = row.app_key
      ? new Set<Permission>((row.app_permissions ?? []).filter((p): p is Permission => (PERMISSIONS as readonly string[]).includes(p)))
      : new Set<Permission>(row.scopes.flatMap((s) => SCOPE_PERMISSIONS[s] ?? []));
    return {
      tenantId: row.tenant_id, actor: `apikey:${row.id}`, actorName: row.name, kind: 'apikey', role: null, permissions: perms,
      ...(row.app_key ? { app: row.app_key } : {}),
    };
  }

  const header = req.headers.authorization;
  if (header?.startsWith('Bearer ')) {
    const claims = await verifySession(header.slice(7));
    if (!claims) return null;
    // Vé đã bị thu hồi: đổi / đặt lại mật khẩu, đổi vai trò, khoá tài khoản, đăng xuất các thiết bị khác (core/security/session-state.ts).
    // Vé cấp trước khi có cơ chế không ghi sv → 0 = mặc định users.session_version (0029): dùng được tới lần thu hồi đầu.
    if (!(await sessionStillValid(claims.sub, claims.sv ?? 0))) return null;
    const role = claims.role as Role;
    // Đăng nhập qua hệ thống quản trị: quyền theo phân quyền bên đó (trong phiên); còn lại theo vai trò chính + vai trò bổ sung.
    if (claims.perms) {
      return { tenantId: claims.tid, actor: `user:${claims.sub}`, actorName: claims.name, kind: 'user', role, permissions: new Set(claims.perms.filter(isKnownPermission)) };
    }
    // [2026-11-05 06:40 PM Johnny Chu - Chu Hoàng Anh] PHASE-028 — W1: quyền hiệu lực = vai trò chính ∪ vai trò bổ sung còn hiệu lực (đệm 15 giây, xoá khi gán / thu hồi)
    const extra = await extraAuthz(claims.sub);
    const roles = [...new Set<Role>([role, ...extra.roles])];
    return {
      tenantId: claims.tid,
      actor: `user:${claims.sub}`,
      actorName: claims.name,
      kind: 'user',
      role,
      roles,
      permissions: effectivePermissionsWithTenantRoles(roles, extra),
    };
  }
  return null;
}

// [2026-11-02 03:28 PM Johnny Chu - Chu Hoàng Anh] PHASE-011 — 3.14 (ADR-0011 mức 2): cổng route cho khoá app — đọc theo quyền, ghi chỉ danh sách đóng (cửa nạp, báo huỷ, đổi vé); mọi route ghi khác (phiếu tay, số dư đầu, tài khoản, thuế, route mới) bị từ chối
/**
 * Route GHI khoá app được gọi (ADR-0011 mức 2: app chỉ ghi sổ qua cửa nạp). Đóng: route ghi mới mặc định bị từ chối, thêm
 * vào đây phải qua Nhóm Lõi (R-KER-2) và có luật chủ chứng từ ở Kernel. GET: theo quyền của từng route như khoá thường.
 */
export const APP_WRITE_ROUTES: ReadonlySet<string> = new Set([
  'POST /api/v1/documents',          // cửa nạp cũ — postDocumentIn kiểm docKey `<app>:`
  'POST /api/v1/documents/batch',    // nạp lô — cùng đường processDocument
  'POST /api/v1/documents/submit',   // core.document.submit
  'POST /api/v1/documents/cancel',   // báo huỷ — requestCancel kiểm docKey `<app>:`
  'POST /api/v1/apps/ticket/exchange',
]);

/** Khoá app gọi route ghi ngoài APP_WRITE_ROUTES → FORBIDDEN (không lộ route có hay không: route lạ cũng FORBIDDEN). */
export function assertAppRoute(method: string, routeUrl: string | undefined): void {
  if (method === 'GET' || method === 'HEAD') return;
  if (routeUrl && APP_WRITE_ROUTES.has(`${method} ${routeUrl}`)) return;
  throw Errors.forbidden('Khoá app chỉ ghi qua cửa nạp chứng từ (ADR-0011 mức 2): route này không mở cho app');
}

/** Plugin: mọi route (trừ route khai config.public) bắt buộc xác thực. */
export const authPlugin = fp(async (app: FastifyInstance) => {
  app.decorateRequest('auth', undefined);
  app.addHook('onRequest', async (req) => {
    if (req.routeOptions.config?.public) return;
    // Trang tài liệu API (/api/docs) và trang tĩnh: công khai. /mcp (bizcity_mcp@1) xác thực như API.
    if (!req.url.startsWith('/api/v1/') && req.url.split('?')[0] !== '/mcp') return;
    const auth = await resolveAuth(req);
    if (!auth) throw Errors.unauthorized();
    if (auth.app) assertAppRoute(req.method, req.routeOptions.url);
    req.auth = auth;
    // Cô lập đơn vị ở tầng CSDL (RLS, PHASE-007): từ đây mọi kết nối của yêu cầu mang bizcity.tenant_id = đơn vị này.
    const rc = currentRequest();
    if (rc) rc.tenantId = auth.tenantId;
  });
});

// [2026-11-06 10:30 PM Johnny Chu - Chu Hoàng Anh] PHASE-028 — W3 đợt 2 (ADR-0027 Phụ lục A, W3 đợt 2 mục 2): shadow — so quyết định của bộ tính với đường cũ, không đổi quyết định
let shadowModule: Promise<typeof import('./authz/shadow.js')> | null = null;

/** Nạp muộn (import động) để auth.ts không nhập authz/* lúc khởi động — tránh vòng nhập. Không bao giờ ném lỗi, không đổi quyết định. */
async function observeShadow(req: FastifyRequest, auth: AuthContext, needed: readonly Permission[]): Promise<void> {
  if (auth.kind !== 'user' || !auth.roles) return; // khoá API / vé hệ thống quản trị: không có vai trò để so
  try {
    const m = await (shadowModule ??= import('./authz/shadow.js'));
    if (!(await m.shadowEnabled(auth.tenantId))) return;
    const userId = auth.actor.slice('user:'.length);
    const isAdmin = m.hasAdminRole(auth.roles, ADMIN_ROLES);
    for (const p of needed) await m.shadowCompare({ tenantId: auth.tenantId, userId, permission: p, legacyAllowed: auth.permissions.has(p), isAdmin }, db, req.log);
  } catch {
    /* shadow không được làm hỏng yêu cầu */
  }
}

/** preHandler kiểm tra quyền. */
export function requirePermission(...needed: Permission[]) {
  return async (req: FastifyRequest, _reply: FastifyReply) => {
    const auth = req.auth;
    if (!auth) throw Errors.unauthorized();
    await observeShadow(req, auth, needed);
    for (const p of needed) {
      if (!auth.permissions.has(p)) throw Errors.forbidden();
    }
  };
}

/**
 * preHandler cho route "tự phục vụ" (đổi mật khẩu của mình, đăng xuất máy khác, báo online…): không cần quyền nghiệp vụ nào
 * nhưng chỉ NGƯỜI DÙNG đăng nhập được gọi — khoá API bị từ chối. Khai tường minh để route nào cũng nói rõ mình cần gì (R-API-6).
 */
export function requireUser() {
  return async (req: FastifyRequest, _reply: FastifyReply) => {
    const auth = req.auth;
    if (!auth) throw Errors.unauthorized();
    if (auth.kind !== 'user') throw Errors.forbidden('Chỉ dùng cho người dùng đăng nhập, không dùng bằng khoá API');
  };
}

/**
 * preHandler cho route chỉ cần ĐÃ XÁC THỰC (người dùng hoặc khoá API), không gắn quyền nghiệp vụ — vd báo online, xem số đang online
 * (khoá API gọi được nhưng không được đếm). Khai tường minh thay vì bỏ trống preHandler (R-API-6).
 */
export function requireAuthenticated() {
  return async (req: FastifyRequest, _reply: FastifyReply) => {
    if (!req.auth) throw Errors.unauthorized();
  };
}

/** Lấy ngữ cảnh xác thực (đã chắc chắn có vì qua authPlugin). */
export function authOf(req: FastifyRequest): AuthContext {
  if (!req.auth) throw Errors.unauthorized();
  return req.auth;
}
