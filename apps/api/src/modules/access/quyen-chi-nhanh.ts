// @bizcity-layer P permissions
// [2026-11-14 09:30 PM kiennt] NT-HT-003 — chuyển từ phan-he/ sang modules/access (lớp P, chốt mục 8 câu 3) (đóng góp)
// [2026-11-13 06:30 PM kiennt] PHAN-QUYEN — bản thử: quyền THEO CHI NHÁNH — vai trò gán tại chi nhánh chỉ có hiệu lực ở chi nhánh đó; người có lần gán theo chi nhánh chỉ làm việc ở các chi nhánh đó (đóng góp)
/**
 * QUYỀN THEO CHI NHÁNH (bản thử, kết hợp sổ đăng ký màn hình man-hinh.ts):
 * - Lần gán vai trò "tại chi nhánh B" (HT12, user_role_assignments.scope_type = 'branch'; gán 'warehouse' chỉ mở chi nhánh của kho vào phạm vi) còn hiệu
 *   lực hôm nay → quyền của vai trò đó CHỈ có ở B (vai trò hệ thống, hoặc vai trò của đơn vị: nền + Cho − Cấm; Cấm toàn đơn vị vẫn trừ).
 * - Phạm vi làm việc: người có ít nhất một lần gán theo chi nhánh / kho → chỉ các chi nhánh đó; không có → mọi chi nhánh.
 *   Chủ đơn vị, khoá API: không áp.
 * - [2026-11-14 07:30 PM kiennt] sửa (đóng góp): vai trò HẠN CHẾ gán tại chi nhánh B KHÔNG thu hẹp phạm vi làm việc; luật Cấm của nó trừ thẳng
 *   vào quyền hiệu lực (kể cả quyền của vai trò chính) khi yêu cầu ở B — "Kế toán, nhưng ở CN02 không được lập phiếu chi".
 * - Mỗi yêu cầu của người dùng: chi nhánh của yêu cầu = ô chi nhánh lập trong thân (branchCode / fromBranchCode / fromBranch,
 *   documents[]) → không có thì chi nhánh của phiếu theo mã (Kho) → không có thì chi nhánh đang làm việc (header X-Chi-Nhanh).
 *   Ngoài phạm vi → 403 BRANCH_OUT_OF_SCOPE. Trong phạm vi → cộng quyền tại chi nhánh đó vào phiên (rồi action / route kiểm như thường).
 * - GET /api/v1/quyen-chi-nhanh: phạm vi + quyền thêm theo từng chi nhánh — giao diện tính nút / menu theo chi nhánh đang làm việc.
 */
import fp from 'fastify-plugin';
import { sql } from 'kysely';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { Role } from '@ketoan/contracts';
import { ADMIN_ROLES, effectivePermissionsWithTenantRoles, impliersOf, requirePermission, type AuthContext, type Permission } from '@bizcity/platform/core/auth';
import { matchPattern } from '@bizcity/platform/core/authz/engine';
import { extraAuthz } from '@bizcity/platform/core/security/role-assignments';
import { db } from '../../db/client.js';
import { Errors } from '../../core/errors.js';
import { ok } from '../../core/http.js';
import { getSetting } from '@bizcity/platform/core/settings';
import { kiemLenhManHinh, manHinhRoutes } from './man-hinh.js';

const TODAY_VN = sql`(now() AT TIME ZONE 'Asia/Ho_Chi_Minh')::date`;
interface Gan { code: string; scope_type: 'branch' | 'warehouse'; role: Role | null; tenant_role_id: string | null; base_role: Role | null; kind: string | null }

const userIdOf = (auth: AuthContext) => (auth.kind === 'user' && auth.actor.startsWith('user:') ? auth.actor.slice(5) : null);

/** Các lần gán theo chi nhánh / kho còn hiệu lực hôm nay của người dùng, quy về mã chi nhánh. */
async function lanGanTheoChiNhanh(tenantId: string, userId: string): Promise<Gan[]> {
  const { rows } = await sql<Gan>`
    SELECT COALESCE(b.code, bw.code) AS code, a.scope_type, a.role, a.tenant_role_id::text, r.base_role, r.kind
      FROM user_role_assignments a
      LEFT JOIN tenant_roles r ON r.id = a.tenant_role_id AND r.tenant_id = a.tenant_id
      LEFT JOIN branches b ON a.scope_type = 'branch' AND b.id = a.scope_id
      LEFT JOIN warehouses w ON a.scope_type = 'warehouse' AND w.id = a.scope_id
      LEFT JOIN branches bw ON bw.id = w.branch_id
     WHERE a.tenant_id = ${tenantId} AND a.user_id = ${userId} AND a.revoked_at IS NULL AND a.scope_type IN ('branch', 'warehouse')
       AND a.valid_from <= ${TODAY_VN} AND (a.valid_to IS NULL OR a.valid_to >= ${TODAY_VN})
       AND (a.tenant_role_id IS NULL OR r.is_active)`.execute(db);
  return rows.filter((r) => r.code);
}

export interface QuyenChiNhanh {
  /** null = mọi chi nhánh. */
  branches: string[] | null;
  /** Quyền CỘNG THÊM ở từng chi nhánh (vai trò gán tại chi nhánh, trừ vai trò Hạn chế). */
  theoChiNhanh: Record<string, Permission[]>;
  /** Luật Cấm của vai trò gán tại từng chi nhánh (mẫu quyền) — trừ vào quyền hiệu lực khi làm việc ở chi nhánh đó. */
  camTheoChiNhanh: Record<string, string[]>;
}
const KHONG: QuyenChiNhanh = { branches: null, theoChiNhanh: {}, camTheoChiNhanh: {} };

// [2026-11-14 09:30 PM kiennt] NT-HT-003 — công tắc đơn vị (chốt mục 8 câu 2), mặc định tắt (đóng góp)
export const KHOA_CONG_TAC = 'bizcity.authz.branch_scope';
/** Đơn vị đã bật giới hạn theo chi nhánh chưa (`bizcity.authz.branch_scope` = on). Tắt → mọi thứ như cũ. */
export async function batGioiHan(tenantId: string): Promise<boolean> {
  return (await getSetting(db, tenantId, KHOA_CONG_TAC)).value === 'on';
}

/** Phạm vi + quyền thêm + quyền bị Cấm ở từng chi nhánh. */
export async function quyenTheoChiNhanh(auth: AuthContext): Promise<QuyenChiNhanh> {
  const uid = userIdOf(auth);
  if (!uid || (!!auth.role && ADMIN_ROLES.has(auth.role))) return KHONG;
  if (!(await batGioiHan(auth.tenantId))) return KHONG;
  const gan = await lanGanTheoChiNhanh(auth.tenantId, uid);
  if (!gan.length) return KHONG;
  const tenant = await extraAuthz(uid);
  const ids = [...new Set(gan.map((g) => g.tenant_role_id).filter((x): x is string => !!x))];
  const rules = ids.length
    ? (await sql<{ tenant_role_id: string; permission: string; effect: 'allow' | 'deny' }>`
        SELECT tenant_role_id::text, permission, effect FROM tenant_role_rules WHERE tenant_role_id = ANY(${ids}::bigint[]) AND removed_at IS NULL`.execute(db)).rows
    : [];
  const theoChiNhanh: Record<string, Permission[]> = {};
  const camTheoChiNhanh: Record<string, string[]> = {};
  for (const code of [...new Set(gan.map((g) => g.code))]) {
    // Lần gán theo KHO chỉ mở chi nhánh của kho vào phạm vi; quyền theo kho do cửa nạp kiểm (S028-19) — không cộng thành quyền cả chi nhánh.
    const tai = gan.filter((g) => g.code === code && g.scope_type === 'branch');
    const cam = [...new Set(rules.filter((x) => x.effect === 'deny' && tai.some((g) => g.tenant_role_id === x.tenant_role_id)).map((x) => x.permission))].sort();
    if (cam.length) camTheoChiNhanh[code] = cam;
    // Vai trò Hạn chế chỉ có Cấm: không mở chi nhánh vào phạm vi, không cộng quyền.
    const o = tai.filter((g) => g.kind !== 'restriction');
    const moPhamVi = gan.some((g) => g.code === code && g.kind !== 'restriction');
    if (!moPhamVi) continue;
    const roleIds = new Set(o.map((g) => g.tenant_role_id).filter(Boolean));
    const p = effectivePermissionsWithTenantRoles(o.map((g) => g.role).filter((r): r is Role => !!r), {
      baseRoles: o.map((g) => g.base_role).filter((r): r is Role => !!r),
      allow: rules.filter((x) => roleIds.has(x.tenant_role_id) && x.effect === 'allow').map((x) => x.permission),
      deny: [...tenant.deny, ...cam],
    });
    theoChiNhanh[code] = [...p].filter((x) => !auth.permissions.has(x)).sort();
  }
  const branches = Object.keys(theoChiNhanh).sort();
  return { branches: branches.length ? branches : null, theoChiNhanh, camTheoChiNhanh };
}

/** Quyền bị luật Cấm `cam` chặn: khớp chính quyền đó hoặc quyền gốc kéo theo nó (Cấm documents:write chặn cả quyền chi tiết của phiếu). */
export const biCam = (cam: readonly string[], p: string): boolean => cam.some((d) => matchPattern(d, p) || impliersOf(p).some((b) => matchPattern(d, b)));

/* ───────────────────────────── chi nhánh của yêu cầu ───────────────────────────── */

const SOURCE_KEYS = ['branchCode', 'fromBranchCode', 'fromBranch'] as const;
function maTrongThan(body: unknown): string[] {
  const out = new Set<string>();
  const take = (o: unknown) => {
    if (!o || typeof o !== 'object' || Array.isArray(o)) return;
    // Có branchCode thì đó là chi nhánh của chứng từ (chiều nhận của chuyển kho hai chiều mang fromBranchCode = bên kia); không có mới lấy chi nhánh xuất.
    for (const k of SOURCE_KEYS) { const v = (o as Record<string, unknown>)[k]; if (typeof v === 'string' && v.trim()) { out.add(v.trim()); return; } }
  };
  take(body);
  const docs = body && typeof body === 'object' ? (body as { documents?: unknown }).documents : undefined;
  if (Array.isArray(docs)) docs.forEach(take);
  return [...out];
}

/** Lệnh theo mã phiếu (bản thử: phân hệ Kho) → chi nhánh của phiếu. Bên nhận chuyển kho dùng chi nhánh nhận. */
const THEO_MA: { re: RegExp; tra: (tenantId: string, id: string) => Promise<string | undefined> }[] = [
  { re: /^\/api\/v1\/kho\/transfers\/:id\/(receive|unreceive)$/, tra: async (t, id) => (await sql<{ c: string }>`SELECT to_branch_code AS c FROM stock_transfer_docs WHERE tenant_id = ${t} AND id = ${id}`.execute(db)).rows[0]?.c },
  { re: /^\/api\/v1\/kho\/transfers\/:id(\/(cancel|reject))?$/, tra: async (t, id) => (await sql<{ c: string }>`SELECT from_branch_code AS c FROM stock_transfer_docs WHERE tenant_id = ${t} AND id = ${id}`.execute(db)).rows[0]?.c },
  { re: /^\/api\/v1\/kho\/kiem-ke\/:id(\/.*)?$/, tra: async (t, id) => (await sql<{ c: string }>`SELECT branch_code AS c FROM stock_counts WHERE tenant_id = ${t} AND id = ${id}`.execute(db)).rows[0]?.c },
];

async function chiNhanhCuaYeuCau(req: FastifyRequest, auth: AuthContext): Promise<{ ma: string[]; nguon: 'than' | 'phieu' | 'dang-lam' | 'khong' }> {
  const than = maTrongThan(req.body);
  if (than.length) return { ma: than, nguon: 'than' };
  const url = req.routeOptions?.url ?? '';
  const id = (req.params as { id?: unknown } | undefined)?.id;
  if (id !== undefined && /^\d+$/.test(String(id))) {
    for (const r of THEO_MA) if (r.re.test(url)) { const c = await r.tra(auth.tenantId, String(id)); if (c) return { ma: [c], nguon: 'phieu' }; }
  }
  const h = req.headers['x-chi-nhanh'];
  const dangLam = typeof h === 'string' ? decodeURIComponent(h).trim() : '';
  return dangLam ? { ma: [dangLam], nguon: 'dang-lam' } : { ma: [], nguon: 'khong' };
}

async function moc(req: FastifyRequest): Promise<void> {
  const auth = req.auth;
  if (!auth || auth.kind !== 'user' || (!!auth.role && ADMIN_ROLES.has(auth.role))) return;
  const cam = await apChiNhanh(req, auth);
  await kiemLenhManHinh(req, auth, cam); // [2026-11-13 07:30 PM kiennt] PHAN-QUYEN — gác lệnh theo thao tác màn (sau khi áp quyền chi nhánh) (đóng góp)
}

/** Áp quyền theo chi nhánh của yêu cầu; trả luật Cấm của chi nhánh đó (để gác lệnh màn trừ tiếp). */
async function apChiNhanh(req: FastifyRequest, auth: AuthContext): Promise<string[]> {
  // Hai API phiên trả quyền GỐC (giao diện tự cộng / trừ theo chi nhánh đang làm việc) — không áp trước.
  if (req.routeOptions?.url === '/api/v1/quyen-chi-nhanh' || req.routeOptions?.url === '/api/v1/auth/me') return [];
  const q = await quyenTheoChiNhanh(auth);
  if (!q.branches && !Object.keys(q.camTheoChiNhanh).length) return [];
  const { ma, nguon } = await chiNhanhCuaYeuCau(req, auth);
  if (q.branches) {
    const ngoai = ma.filter((c) => !q.branches!.includes(c));
    if (ngoai.length) {
      // Chi nhánh đang làm việc (header) ngoài phạm vi: lệnh đọc thì bỏ qua header (không cộng quyền), lệnh ghi thì chặn.
      if (nguon === 'dang-lam' && req.method === 'GET') return [];
      throw Errors.forbidden(`Bạn không làm việc ở chi nhánh ${ngoai.join(', ')} — chỉ ở: ${q.branches.join(', ')} (BRANCH_OUT_OF_SCOPE)`);
    }
    // Cộng quyền tại chi nhánh của yêu cầu (một chi nhánh; lô nhiều chi nhánh thì chỉ cộng phần chung).
    const sets = ma.map((c) => new Set(q.theoChiNhanh[c] ?? []));
    const chung = sets.length ? [...sets[0]!].filter((p) => sets.every((s) => s.has(p))) : [];
    for (const p of chung) (auth.permissions as Set<Permission>).add(p);
  }
  // Cấm của vai trò gán tại chi nhánh của yêu cầu (lô nhiều chi nhánh: Cấm ở bất kỳ chi nhánh nào) — Cấm thắng, trừ cả quyền của vai trò chính.
  const cam = [...new Set(ma.flatMap((c) => q.camTheoChiNhanh[c] ?? []))];
  for (const p of [...auth.permissions]) if (biCam(cam, p)) (auth.permissions as Set<Permission>).delete(p);
  return cam;
}

/** Bảng rà trước khi bật công tắc: ai có lần gán tại chi nhánh / kho (trừ vai trò Hạn chế), phạm vi sẽ thành gì. */
async function raSoat(tenantId: string) {
  const { rows } = await sql<{ user_id: string; email: string; full_name: string; role: string; code: string; scope_type: string; kind: string | null; vai_tro: string | null }>`
    SELECT u.id::text AS user_id, u.email, u.full_name, u.role, COALESCE(b.code, bw.code) AS code, a.scope_type, r.kind, COALESCE(r.label, a.role) AS vai_tro
      FROM user_role_assignments a
      JOIN users u ON u.id = a.user_id AND u.tenant_id = a.tenant_id
      LEFT JOIN tenant_roles r ON r.id = a.tenant_role_id AND r.tenant_id = a.tenant_id
      LEFT JOIN branches b ON a.scope_type = 'branch' AND b.id = a.scope_id
      LEFT JOIN warehouses w ON a.scope_type = 'warehouse' AND w.id = a.scope_id
      LEFT JOIN branches bw ON bw.id = w.branch_id
     WHERE a.tenant_id = ${tenantId} AND a.revoked_at IS NULL AND a.scope_type IN ('branch', 'warehouse')
       AND a.valid_from <= ${TODAY_VN} AND (a.valid_to IS NULL OR a.valid_to >= ${TODAY_VN})
       AND (a.tenant_role_id IS NULL OR r.is_active)
     ORDER BY u.email, code`.execute(db);
  const by = new Map<string, { userId: string; email: string; fullName: string; role: string; branches: string[]; ganTai: string[]; camTai: string[] }>();
  for (const x of rows) {
    if (!x.code) continue;
    const o = by.get(x.user_id) ?? by.set(x.user_id, { userId: x.user_id, email: x.email, fullName: x.full_name, role: x.role, branches: [], ganTai: [], camTai: [] }).get(x.user_id)!;
    o.ganTai.push(`${x.vai_tro} tại ${x.scope_type === 'warehouse' ? 'kho của ' : ''}${x.code}`);
    if (x.kind === 'restriction') { if (!o.camTai.includes(x.code)) o.camTai.push(x.code); }
    else if (!o.branches.includes(x.code)) o.branches.push(x.code);
  }
  // Chủ đơn vị không bị giới hạn; người chỉ có vai trò Hạn chế tại chi nhánh → mọi chi nhánh (null).
  return [...by.values()].map((o) => ({ ...o, branches: o.role === 'owner' || !o.branches.length ? null : o.branches.sort() }));
}

export const quyenChiNhanh = fp(async (app: FastifyInstance) => {
  app.addHook('preHandler', moc);
  await manHinhRoutes(app);
  app.get('/api/v1/quyen-chi-nhanh/ra-soat', {
    preHandler: requirePermission('users:write'),
    schema: { tags: ['Phân quyền'], summary: 'Bảng rà trước khi bật giới hạn theo chi nhánh: người có lần gán tại chi nhánh / kho và phạm vi sẽ thành' },
    handler: async (req) => ok({ batGioiHan: await batGioiHan(req.auth!.tenantId), nguoi: await raSoat(req.auth!.tenantId) }),
  });
  app.get('/api/v1/quyen-chi-nhanh', {
    preHandler: requirePermission('catalog:read'), // mọi vai trò có catalog:read; API chỉ trả phạm vi của chính người gọi
    schema: { tags: ['Phân quyền'], summary: 'Chi nhánh được làm việc + quyền thêm ở từng chi nhánh (vai trò gán tại chi nhánh)' },
    handler: async (req) => {
      if (!req.auth || req.auth.kind !== 'user') throw Errors.unauthorized();
      return ok(await quyenTheoChiNhanh(req.auth));
    },
  });
}, { name: 'quyen-chi-nhanh' });
