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
 *
 * [2026-11-17 02:25 PM khanhtd] NT-HT-003 — vá lỗ rà soát 17/11 (docs/audits/REVIEW-2026-11-17-phan-quyen-chi-nhanh.md):
 * - CHI NHÁNH TỪ BẢN GHI (AUTHZ-11): lệnh chạm chứng từ đã có (docKey trong thân / tham số, /vouchers/:id, phiếu kho theo mã, và mọi
 *   lệnh phân hệ đăng ký bằng `dangKyChiNhanhBanGhi`) lấy chi nhánh của bản ghi trên máy chủ, HỢP với chi nhánh ghi trong thân (sửa phiếu:
 *   kiểm cả chi nhánh cũ lẫn mới). Header X-Chi-Nhanh không bao giờ đè chi nhánh của bản ghi.
 * - PHẠM VI ĐỌC: người bị giới hạn chi nhánh gọi lệnh ĐỌC (GET):
 *     · lệnh có tham số lọc chi nhánh (`branchCodes` / `branches` / `branchCode` trong querystring) → máy chủ ép tham số = chi nhánh chọn ∩
 *       phạm vi (không chọn = cả phạm vi, KHÔNG phải toàn đơn vị); chọn chi nhánh ngoài phạm vi → 403 BRANCH_OUT_OF_SCOPE;
 *     · lệnh đọc theo mã bản ghi → chi nhánh của bản ghi phải trong phạm vi;
 *     · lệnh không lọc được theo chi nhánh → bỏ quyền đọc dữ liệu (ledger:read, reports:read, documents:read và quyền xem chứng từ chúng kéo
 *       theo) cho riêng yêu cầu đó — đóng mặc định, không trả số liệu toàn đơn vị.
 */
import fp from 'fastify-plugin';
import { sql } from 'kysely';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { Role } from '@ketoan/contracts';
import { ADMIN_ROLES, effectivePermissionsWithTenantRoles, impliedBy, impliersOf, requirePermission, type AuthContext, type Permission } from '@bizcity/platform/core/auth';
import { matchPattern } from '@bizcity/platform/core/authz/engine';
import { lanGanTheoChiNhanh, type LanGanChiNhanh } from '@bizcity/platform/core/authz/scope';
import { extraAuthz } from '@bizcity/platform/core/security/role-assignments';
import { db } from '../../db/client.js';
import { Errors } from '../../core/errors.js';
import { ok } from '../../core/http.js';
import { getSetting } from '@bizcity/platform/core/settings';
import { kiemLenhManHinh, manHinhRoutes } from './man-hinh.js';

const TODAY_VN = sql`(now() AT TIME ZONE 'Asia/Ho_Chi_Minh')::date`;
// [2026-11-17 04:40 PM khanhtd] NT-HT-003 — GĐ5: khai triển lần gán (chi nhánh / kho / nút sơ đồ tổ chức) lấy từ Core — một nơi tính phạm vi
type Gan = LanGanChiNhanh;

// [2026-11-16 10:00 AM kiennt] NT-HT-003 — Chủ đơn vị theo MỌI vai trò toàn đơn vị (chính hoặc gán thêm ở HT12), không chỉ vai trò chính (đóng góp)
/** Người dùng có vai trò quản trị đơn vị (Chủ đơn vị) — vai trò chính hoặc vai trò gán thêm toàn đơn vị còn hiệu lực. */
const laChuDonVi = (auth: AuthContext): boolean => [auth.role, ...(auth.roles ?? [])].some((r) => !!r && ADMIN_ROLES.has(r));

const userIdOf = (auth: AuthContext) => (auth.kind === 'user' && auth.actor.startsWith('user:') ? auth.actor.slice(5) : null);

/** Các lần gán theo chi nhánh / kho / nút sơ đồ tổ chức còn hiệu lực hôm nay của người dùng, quy về mã chi nhánh (Core). */
const lanGanCuaNguoi = (tenantId: string, userId: string): Promise<Gan[]> => lanGanTheoChiNhanh(db, tenantId, userId);
/** Lần gán CẤP QUYỀN tại chi nhánh: gán tại chi nhánh hoặc tại nút (vùng). Gán tại kho chỉ mở chi nhánh của kho vào phạm vi. */
const capQuyenTai = (g: Gan): boolean => g.scope_type === 'branch' || g.scope_type === 'org_unit';

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
  if (!uid || laChuDonVi(auth)) return KHONG;
  if (!(await batGioiHan(auth.tenantId))) return KHONG;
  const gan = await lanGanCuaNguoi(auth.tenantId, uid);
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
    const tai = gan.filter((g) => g.code === code && capQuyenTai(g));
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

// [2026-11-17 02:25 PM khanhtd] NT-HT-003 — HOOK `dangKyChiNhanhBanGhi`: phân hệ đăng ký cách tra chi nhánh của bản ghi cho lệnh theo mã (thay bảng THEO_MA viết cứng)
/**
 * Lệnh theo mã bản ghi → chi nhánh THẬT của bản ghi (đọc ở máy chủ, AUTHZ-11). Phân hệ có lệnh `/<...>/:id` sửa / huỷ / duyệt / đọc một
 * bản ghi có chi nhánh thì PHẢI đăng ký ở index.ts của mình — không đăng ký thì người bị giới hạn chi nhánh có thể chạm bản ghi của chi
 * nhánh khác bằng cách đổi chi nhánh trong thân / header:
 *   dangKyChiNhanhBanGhi({ url: /^\/api\/v1\/kho\/kiem-ke\/:id(\/.*)?$/, tra: (tenantId, p) => …SELECT branch_code … WHERE id = p.id… });
 * `url` khớp đường dẫn MẪU của Fastify (req.routeOptions.url); `p` là tham số đường dẫn (`:id`, `:code`…) dạng chuỗi — tự kiểm dạng
 * (vd `soId(p.id)`) trước khi đưa vào SQL. Trả mã chi nhánh (hoặc nhiều mã); không thấy bản ghi → rỗng (lệnh tự báo không có).
 */
// [2026-11-17 04:10 PM khanhtd] NT-HT-003 — GĐ3: hook nhận mọi tham số đường dẫn (tài sản theo :code), không chỉ :id dạng số
export interface ChiNhanhBanGhi { url: RegExp; tra: (tenantId: string, thamSo: Readonly<Record<string, string>>) => Promise<string | string[] | undefined> }
const soBanGhi: ChiNhanhBanGhi[] = [];
export function dangKyChiNhanhBanGhi(def: ChiNhanhBanGhi): void { soBanGhi.push(def); }
/** Mã số dạng bigint của tham số đường dẫn, hoặc null khi không phải số (không đưa chuỗi lạ vào ::bigint). */
export const soId = (v: string | undefined): string | null => (v && /^\d{1,18}$/.test(v) ? v : null);

/** Danh sách mã chi nhánh từ các dòng `{ c }` của truy vấn (bỏ dòng null). */
export const motMa = (sqlRows: { c: string | null }[]): string[] => sqlRows.map((r) => r.c).filter((c): c is string => !!c);
/** Tra theo một bảng của đơn vị có cột mã chi nhánh (mặc định `branch_code`) và khoá số `id` — phân hệ dùng lại khi đăng ký. */
export const theoBang = (bang: string, cot = 'branch_code') =>
  async (t: string, p: Readonly<Record<string, string>>) => {
    const id = soId(p.id);
    return id ? motMa((await sql<{ c: string }>`SELECT ${sql.ref(cot)} AS c FROM ${sql.table(bang)} WHERE tenant_id = ${t} AND id = ${id}`.execute(db)).rows) : [];
  };
// Phân hệ Kho (bản thử cũ, giữ nguyên ý): bên nhận chuyển kho dùng chi nhánh nhận.
dangKyChiNhanhBanGhi({ url: /^\/api\/v1\/kho\/transfers\/:id\/(receive|unreceive)$/, tra: async (t, p) => { const id = soId(p.id); return id ? motMa((await sql<{ c: string }>`SELECT to_branch_code AS c FROM stock_transfer_docs WHERE tenant_id = ${t} AND id = ${id}`.execute(db)).rows) : []; } });
dangKyChiNhanhBanGhi({ url: /^\/api\/v1\/kho\/transfers\/:id(\/(cancel|reject))?$/, tra: async (t, p) => { const id = soId(p.id); return id ? motMa((await sql<{ c: string }>`SELECT from_branch_code AS c FROM stock_transfer_docs WHERE tenant_id = ${t} AND id = ${id}`.execute(db)).rows) : []; } });
dangKyChiNhanhBanGhi({ url: /^\/api\/v1\/kho\/kiem-ke\/:id(\/.*)?$/, tra: theoBang('stock_counts') });
// Phiếu nhập tay của lõi (/vouchers/:id — sửa, duyệt, xem): mã = id của sự việc kế toán.
dangKyChiNhanhBanGhi({ url: /^\/api\/v1\/vouchers\/:id(\/.*)?$/, tra: async (t, p) => { const id = soId(p.id); return id ? motMa((await sql<{ c: string }>`
  SELECT b.code AS c FROM accounting_events e JOIN branches b ON b.id = e.branch_id WHERE e.tenant_id = ${t} AND e.id = ${id}`.execute(db)).rows) : []; } });

/** docKey của yêu cầu: thân (docKey, documents[].docKey) và tham số :docKey — chứng từ đã có trong sổ thì lấy chi nhánh của nó. */
function docKeysCuaYeuCau(req: FastifyRequest): string[] {
  const out = new Set<string>();
  const take = (o: unknown) => { const k = o && typeof o === 'object' ? (o as { docKey?: unknown }).docKey : undefined; if (typeof k === 'string' && k) out.add(k); };
  take(req.body);
  take(req.params);
  const docs = req.body && typeof req.body === 'object' ? (req.body as { documents?: unknown }).documents : undefined;
  if (Array.isArray(docs)) docs.forEach(take);
  return [...out];
}

/** Chi nhánh của các bản ghi yêu cầu chạm tới (đọc ở máy chủ). Rỗng = yêu cầu không chạm bản ghi đã có. */
async function chiNhanhBanGhi(req: FastifyRequest, tenantId: string): Promise<string[]> {
  const out = new Set<string>();
  const keys = docKeysCuaYeuCau(req);
  if (keys.length) {
    const { rows } = await sql<{ c: string }>`
      SELECT DISTINCT b.code AS c FROM accounting_events e JOIN branches b ON b.id = e.branch_id
       WHERE e.tenant_id = ${tenantId} AND e.doc_key = ANY(${keys}::text[])`.execute(db);
    for (const c of motMa(rows)) out.add(c);
  }
  const url = req.routeOptions?.url ?? '';
  const raw = (req.params ?? {}) as Record<string, unknown>;
  const thamSo = Object.fromEntries(Object.entries(raw).filter(([, v]) => v !== undefined && v !== null).map(([k, v]) => [k, String(v)]));
  if (Object.keys(thamSo).length) {
    for (const r of soBanGhi) {
      if (!r.url.test(url)) continue;
      const c = await r.tra(tenantId, thamSo);
      for (const x of Array.isArray(c) ? c : c ? [c] : []) out.add(x);
    }
  }
  return [...out];
}

type Nguon = 'ban-ghi' | 'than' | 'dang-lam' | 'khong';
/**
 * Chi nhánh của yêu cầu = chi nhánh ghi trong thân ∪ chi nhánh của bản ghi đã có (cả hai phải được phép: sửa phiếu kiểm chi nhánh cũ
 * lẫn mới). Chỉ khi không có cả hai mới dùng chi nhánh đang làm việc (header) — header không bao giờ đè bản ghi.
 */
async function chiNhanhCuaYeuCau(req: FastifyRequest, auth: AuthContext): Promise<{ ma: string[]; nguon: Nguon; dangLam: string }> {
  const h = req.headers['x-chi-nhanh'];
  const dangLam = typeof h === 'string' ? decodeURIComponent(h).trim() : '';
  const than = maTrongThan(req.body);
  const banGhi = await chiNhanhBanGhi(req, auth.tenantId);
  if (banGhi.length) return { ma: [...new Set([...than, ...banGhi])], nguon: 'ban-ghi', dangLam };
  if (than.length) return { ma: than, nguon: 'than', dangLam };
  return dangLam ? { ma: [dangLam], nguon: 'dang-lam', dangLam } : { ma: [], nguon: 'khong', dangLam };
}

/* ───────────────────────────── phạm vi đọc ───────────────────────────── */

/** Tên tham số lọc chi nhánh trong querystring: nhiều mã (cách nhau dấu phẩy) và một mã. Lệnh danh sách / báo cáo mới đặt đúng tên này. */
export const THAM_SO_CHI_NHANH = { nhieu: ['branchCodes', 'branches'], mot: ['branchCode'] } as const;

type ZodLike = { safeParse?: (v: unknown) => { success: boolean; data?: unknown }; shape?: Record<string, unknown>; _def?: { schema?: unknown; innerType?: unknown } };
function shapeOf(s: unknown): Record<string, unknown> | null {
  for (let x = s as ZodLike | undefined, i = 0; x && i < 5; i++) {
    if (x.shape && typeof x.shape === 'object') return x.shape;
    x = (x._def?.schema ?? x._def?.innerType) as ZodLike | undefined;
  }
  return null;
}
/** Tham số sau khi qua schema là mảng (transform tách dấu phẩy) hay chuỗi — ghi lại đúng dạng route đọc. */
const dangMang = (t: unknown): boolean => { const r = (t as ZodLike).safeParse?.('A,B'); return !!r?.success && Array.isArray(r.data); };
const tachMa = (v: unknown): string[] => (Array.isArray(v) ? v.map(String) : typeof v === 'string' ? v.split(',') : []).map((x) => x.trim()).filter(Boolean);

/**
 * Ép tham số lọc chi nhánh của lệnh đọc về phạm vi: chọn ∩ phạm vi; không chọn = cả phạm vi (lệnh chỉ nhận một mã: chi nhánh đang làm
 * việc nếu trong phạm vi, không thì chi nhánh đầu của phạm vi). Chọn ngoài phạm vi → 403. Trả các chi nhánh lệnh sẽ đọc; null = lệnh
 * không có tham số lọc chi nhánh.
 */
function locThamSoChiNhanh(req: FastifyRequest, phamVi: readonly string[], dangLam: string): string[] | null {
  const shape = shapeOf((req.routeOptions?.schema as { querystring?: unknown } | undefined)?.querystring);
  if (!shape) return null;
  const nhieu = THAM_SO_CHI_NHANH.nhieu.find((k) => k in shape);
  const mot = THAM_SO_CHI_NHANH.mot.find((k) => k in shape);
  if (!nhieu && !mot) return null;
  const query = (req.query ?? {}) as Record<string, unknown>;
  const xin = [...new Set([...(nhieu ? tachMa(query[nhieu]) : []), ...(mot ? tachMa(query[mot]) : [])])];
  const ngoai = xin.filter((c) => !phamVi.includes(c));
  if (ngoai.length) throw Errors.forbidden(`Bạn chỉ xem được chi nhánh ${phamVi.join(', ')} — không xem được ${ngoai.join(', ')} (BRANCH_OUT_OF_SCOPE)`);
  if (nhieu) {
    const ds = xin.length ? xin : [...phamVi];
    query[nhieu] = dangMang(shape[nhieu]) ? ds : ds.join(',');
    if (mot) delete query[mot];
    return ds;
  }
  const chon = xin[0] ?? (phamVi.includes(dangLam) ? dangLam : phamVi[0]!);
  query[mot!] = chon;
  return [chon];
}

/** Quyền đọc dữ liệu toàn đơn vị — bỏ khỏi yêu cầu đọc không lọc được theo chi nhánh của người bị giới hạn chi nhánh. */
const QUYEN_DOC_DU_LIEU: readonly Permission[] = ['ledger:read', 'reports:read', 'documents:read'];
function boQuyenDocDuLieu(auth: AuthContext): void {
  const set = auth.permissions as Set<Permission>;
  for (const g of QUYEN_DOC_DU_LIEU) { set.delete(g); for (const p of impliedBy(g)) set.delete(p as Permission); }
}

async function moc(req: FastifyRequest): Promise<void> {
  const auth = req.auth;
  if (!auth || auth.kind !== 'user' || laChuDonVi(auth)) return;
  const cam = await apChiNhanh(req, auth);
  await kiemLenhManHinh(req, auth, cam); // [2026-11-13 07:30 PM kiennt] PHAN-QUYEN — gác lệnh theo thao tác màn (sau khi áp quyền chi nhánh) (đóng góp)
}

/** Áp quyền theo chi nhánh của yêu cầu; trả luật Cấm của chi nhánh đó (để gác lệnh màn trừ tiếp). */
async function apChiNhanh(req: FastifyRequest, auth: AuthContext): Promise<string[]> {
  // Hai API phiên trả quyền GỐC (giao diện tự cộng / trừ theo chi nhánh đang làm việc) — không áp trước.
  if (req.routeOptions?.url === '/api/v1/quyen-chi-nhanh' || req.routeOptions?.url === '/api/v1/auth/me') return [];
  const q = await quyenTheoChiNhanh(auth);
  // [2026-11-17 04:10 PM khanhtd] NT-HT-003 — GĐ3: ghi phạm vi chi nhánh vào ngữ cảnh xác thực (runtime action, action liệt kê đọc)
  (auth as { branchScope?: readonly string[] | null }).branchScope = q.branches;
  if (!q.branches && !Object.keys(q.camTheoChiNhanh).length) return [];
  const yc = await chiNhanhCuaYeuCau(req, auth);
  let { ma } = yc;
  const { nguon } = yc;
  // [2026-11-17 02:25 PM khanhtd] NT-HT-003 — phạm vi đọc: lệnh đọc không theo bản ghi → lọc theo tham số chi nhánh; không lọc được → bỏ quyền đọc dữ liệu
  let khongLocDuoc = false;
  if (q.branches && req.method === 'GET' && nguon !== 'ban-ghi') {
    const loc = locThamSoChiNhanh(req, q.branches, yc.dangLam);
    if (loc) ma = loc;
    else { ma = []; khongLocDuoc = true; } // header không cấp quyền đọc cho lệnh trả dữ liệu mọi chi nhánh
  }
  if (q.branches) {
    const ngoai = ma.filter((c) => !q.branches!.includes(c));
    if (ngoai.length) {
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
  if (khongLocDuoc) boQuyenDocDuLieu(auth);
  return cam;
}

/** Bảng rà trước khi bật công tắc: ai có lần gán tại chi nhánh / kho / vùng (trừ vai trò Hạn chế), phạm vi sẽ thành gì. */
// [2026-11-17 04:40 PM khanhtd] NT-HT-003 — GĐ5: bảng rà dùng khai triển lần gán của Core; lần gán theo vùng hiện "tại vùng X (n cửa hàng)"
async function raSoat(tenantId: string) {
  const gan = (await lanGanTheoChiNhanh(db, tenantId)).sort((a, b) => a.code.localeCompare(b.code));
  const ids = [...new Set(gan.map((g) => g.user_id))];
  const users = ids.length ? (await sql<{ user_id: string; email: string; full_name: string; role: string }>`
    SELECT u.id::text AS user_id, u.email, u.full_name,
           CASE WHEN u.role = 'owner' OR EXISTS (SELECT 1 FROM user_role_assignments o WHERE o.tenant_id = u.tenant_id AND o.user_id = u.id
             AND o.scope_type = 'tenant' AND o.role = 'owner' AND o.revoked_at IS NULL AND o.valid_from <= ${TODAY_VN} AND (o.valid_to IS NULL OR o.valid_to >= ${TODAY_VN}))
             THEN 'owner' ELSE u.role END AS role
      FROM users u WHERE u.tenant_id = ${tenantId} AND u.id = ANY(${ids}::bigint[]) ORDER BY u.email`.execute(db)).rows : [];
  const TEN: Record<string, string> = { owner: 'Chủ đơn vị', chief_accountant: 'Kế toán trưởng', accountant: 'Kế toán', viewer: 'Người xem', developer: 'Nhà phát triển', auditor: 'Kiểm soát', staff: 'Nhân viên' }; // [2026-11-17 02:25 PM khanhtd] NT-HT-003 — nhãn vai trò staff
  const by = new Map<string, { userId: string; email: string; fullName: string; role: string; branches: string[]; ganTai: string[]; camTai: string[] }>();
  for (const u of users) by.set(u.user_id, { userId: u.user_id, email: u.email, fullName: u.full_name, role: u.role, branches: [], ganTai: [], camTai: [] });
  const vung = new Map<string, number>();
  for (const x of gan) {
    const o = by.get(x.user_id);
    if (!o) continue;
    const ten = TEN[x.label ?? x.role ?? ''] ?? x.label ?? x.role;
    if (x.scope_type === 'org_unit') { const k = `${x.user_id}|${ten}|${x.nut}`; vung.set(k, (vung.get(k) ?? 0) + 1); }
    else o.ganTai.push(`${ten} tại ${x.scope_type === 'warehouse' ? 'kho của ' : ''}${x.code}`);
    if (x.kind === 'restriction') { if (!o.camTai.includes(x.code)) o.camTai.push(x.code); }
    else if (!o.branches.includes(x.code)) o.branches.push(x.code);
  }
  for (const [k, n] of vung) { const [uid, ten, nut] = k.split('|'); by.get(uid!)!.ganTai.push(`${ten} tại vùng ${nut} (${n} cửa hàng)`); }
  // Chủ đơn vị không bị giới hạn; người chỉ có vai trò Hạn chế tại chi nhánh → mọi chi nhánh (null).
  return [...by.values()].map((o) => ({ ...o, branches: o.role === 'owner' || !o.branches.length ? null : o.branches.sort() }));
}

/** userId → tên các vai trò gán thêm TOÀN ĐƠN VỊ còn hiệu lực (vai trò hệ thống theo mã, vai trò của đơn vị theo tên). */
async function vaiTroThem(tenantId: string): Promise<Record<string, { ma: string | null; ten: string }[]>> {
  const { rows } = await sql<{ user_id: string; role: string | null; label: string | null }>`
    SELECT a.user_id::text AS user_id, a.role, r.label
      FROM user_role_assignments a LEFT JOIN tenant_roles r ON r.id = a.tenant_role_id AND r.tenant_id = a.tenant_id
     WHERE a.tenant_id = ${tenantId} AND a.scope_type = 'tenant' AND a.revoked_at IS NULL
       AND a.valid_from <= ${TODAY_VN} AND (a.valid_to IS NULL OR a.valid_to >= ${TODAY_VN}) AND (a.tenant_role_id IS NULL OR r.is_active)
     ORDER BY a.user_id, a.id`.execute(db);
  const out: Record<string, { ma: string | null; ten: string }[]> = {};
  for (const x of rows) (out[x.user_id] ??= []).push({ ma: x.role, ten: x.label ?? x.role ?? '' });
  return out;
}

export const quyenChiNhanh = fp(async (app: FastifyInstance) => {
  app.addHook('preHandler', moc);
  await manHinhRoutes(app);
  app.get('/api/v1/quyen-chi-nhanh/vai-tro-them', {
    preHandler: requirePermission('users:write'),
    schema: { tags: ['Phân quyền'], summary: 'Vai trò gán thêm toàn đơn vị còn hiệu lực của từng người dùng (HT12 hiện cạnh vai trò chính)' },
    handler: async (req) => ok(await vaiTroThem(req.auth!.tenantId)),
  });
  // [2026-11-17 04:40 PM khanhtd] NT-HT-003 — GĐ5: danh sách nút sơ đồ tổ chức (id, mã, tên, số cửa hàng trong cây con) để HT12 gán vai trò theo vùng
  app.get('/api/v1/quyen-chi-nhanh/vung', {
    preHandler: requirePermission('users:write'),
    schema: { tags: ['Phân quyền'], summary: 'Nút sơ đồ tổ chức gán được vai trò theo vùng: id, mã, tên, cấp, số cửa hàng thuộc nút và cây con' },
    handler: async (req) => ok((await sql<{ id: string; code: string; name: string; level: number; path: string; is_active: boolean; cua_hang: number }>`
      SELECT n.id::text, n.code, n.name, n.level, n.path, n.is_active,
             (SELECT count(*)::int FROM org_units m JOIN branches b ON b.tenant_id = m.tenant_id AND b.org_unit_id = m.id
               WHERE m.tenant_id = n.tenant_id AND (m.path = n.path OR left(m.path, length(n.path) + 1) = n.path || chr(92))) AS cua_hang
        FROM org_units n WHERE n.tenant_id = ${req.auth!.tenantId} ORDER BY n.path`.execute(db)).rows
      .map((n) => ({ id: n.id, code: n.code, name: n.name, level: n.level, path: n.path, isActive: n.is_active, branches: n.cua_hang }))),
  });
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
