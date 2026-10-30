// @bizcity-layer P permissions
/**
 * Xác thực và phân quyền.
 *
 * Hai cách gọi API:
 *   1. Người dùng giao diện: header  Authorization: Bearer <jwt>
 *   2. Hệ thống tích hợp:    header  X-Api-Key: <khoá>
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
import { verifySession } from './security/tokens.js';
import { sessionStillValid } from './security/session-state.js';

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
] as const;
export type Permission = (typeof PERMISSIONS)[number];

const ROLE_PERMISSIONS: Record<Role, readonly Permission[]> = {
  owner: PERMISSIONS,
  chief_accountant: ['catalog:read', 'catalog:write', 'documents:read', 'documents:write', 'documents:edit-all', 'documents:bypass-date-lock', 'payments:approve', 'ledger:read', 'reports:read', 'periods:lock', 'settings:write'],
  accountant: ['catalog:read', 'catalog:write', 'documents:read', 'documents:write', 'ledger:read', 'reports:read'],
  viewer: ['catalog:read', 'documents:read', 'ledger:read', 'reports:read'],
};

/** Phạm vi của khoá API → quyền tương ứng. */
const SCOPE_PERMISSIONS: Record<string, readonly Permission[]> = {
  'documents:write': ['documents:write', 'documents:edit-all', 'documents:read', 'catalog:read'],
  'reports:read': ['reports:read', 'ledger:read', 'catalog:read'],
  'catalog:write': ['catalog:write', 'catalog:read'],
};

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
  role: Role | null;
  permissions: ReadonlySet<Permission>;
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
      .selectFrom('api_keys')
      .select(['id', 'tenant_id', 'name', 'scopes'])
      .where('key_hash', '=', hashApiKey(apiKey))
      .where('revoked_at', 'is', null)
      .executeTakeFirst();
    if (!row) return null;
    // Ghi lần dùng cuối, không chặn request.
    void db.updateTable('api_keys').set({ last_used_at: new Date() }).where('id', '=', row.id).execute();
    const perms = new Set<Permission>(row.scopes.flatMap((s) => SCOPE_PERMISSIONS[s] ?? []));
    return { tenantId: row.tenant_id, actor: `apikey:${row.id}`, actorName: row.name, kind: 'apikey', role: null, permissions: perms };
  }

  const header = req.headers.authorization;
  if (header?.startsWith('Bearer ')) {
    const claims = await verifySession(header.slice(7));
    if (!claims) return null;
    // Vé đã bị thu hồi: đổi / đặt lại mật khẩu, đổi vai trò, khoá tài khoản, đăng xuất các thiết bị khác (core/security/session-state.ts).
    // Vé cấp trước khi có cơ chế không ghi sv → 0 = mặc định users.session_version (0029): dùng được tới lần thu hồi đầu.
    if (!(await sessionStillValid(claims.sub, claims.sv ?? 0))) return null;
    const role = claims.role as Role;
    return {
      tenantId: claims.tid,
      actor: `user:${claims.sub}`,
      actorName: claims.name,
      kind: 'user',
      role,
      // Đăng nhập qua hệ thống quản trị: quyền theo phân quyền bên đó (trong phiên); còn lại theo vai trò.
      permissions: claims.perms
        ? new Set(claims.perms.filter((p): p is Permission => (PERMISSIONS as readonly string[]).includes(p)))
        : new Set(ROLE_PERMISSIONS[role] ?? []),
    };
  }
  return null;
}

/** Plugin: mọi route (trừ route khai config.public) bắt buộc xác thực. */
export const authPlugin = fp(async (app: FastifyInstance) => {
  app.decorateRequest('auth', undefined);
  app.addHook('onRequest', async (req) => {
    if (req.routeOptions.config?.public) return;
    if (!req.url.startsWith('/api/v1/')) return; // trang tài liệu API (/api/docs) và trang tĩnh: công khai
    const auth = await resolveAuth(req);
    if (!auth) throw Errors.unauthorized();
    req.auth = auth;
  });
});

/** preHandler kiểm tra quyền. */
export function requirePermission(...needed: Permission[]) {
  return async (req: FastifyRequest, _reply: FastifyReply) => {
    const auth = req.auth;
    if (!auth) throw Errors.unauthorized();
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
