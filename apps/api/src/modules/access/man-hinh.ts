// @bizcity-layer P permissions
// [2026-11-14 09:30 PM kiennt] NT-HT-003 — chuyển từ phan-he/ sang modules/access (lớp P, chốt mục 8 câu 3) (đóng góp)
// [2026-11-13 05:30 PM kiennt] PHAN-QUYEN — sổ đăng ký MÀN HÌNH: phân hệ tự đăng ký menu + thao tác (thêm / sửa / xoá / nút riêng) + vai trò mặc định (bản thử) (đóng góp)
/**
 * SỔ ĐĂNG KÝ MÀN HÌNH — phân quyền ĐỘNG theo màn × thao tác (như WordPress: mỗi nghiệp vụ tự đăng ký quyền vào bộ quản lý vai trò,
 * không viết cứng quyền trong mã).
 *
 * Phân hệ gọi `dangKyManHinh` ở index.ts của mình:
 *   dangKyManHinh({ key: 'kho.chuyen-kho', ma: 'KHO01', nhom: 'Kho', nhan: 'Phiếu chuyển kho', duongDan: '/kho/chuyen-kho',
 *     thaoTac: { xem: { quyen: 'kho:chuyen-kho-xem', nhan: 'Xem', loai: 'xem' }, sua: { quyen: 'kho:chuyen-kho-sua', nhan: 'Sửa', loai: 'ghi' }, … } });
 * - Mỗi quyền phải khai ở permissions[] của manifest phân hệ (kèm `roles` = vai trò mặc định có quyền) — HT12 tự hiện quyền đó.
 * - Không ai mất quyền: quyền Core của loại thao tác KÉO THEO quyền chi tiết (xem ← documents:read, ghi ← documents:write,
 *   huỷ ← documents:write, xuất ← reports:read) — dùng cơ chế kéo theo sẵn có của lõi (registerDocumentType). Muốn hẹp: vai trò của
 *   đơn vị chỉ Cho quyền chi tiết, hoặc Cấm quyền chi tiết.
 * - Máy chủ gác lệnh bằng `quyenThaoTac(màn, thao tác)`; giao diện đọc `GET /api/v1/man-hinh` để ẩn menu / nút theo quyền của người dùng.
 * Phân hệ chưa đăng ký màn thì mọi thứ như cũ.
 */
import type { FastifyInstance } from 'fastify';
import { documentPermissionOf, registerDocumentType, requirePermission, type DocumentOp, type Permission } from '@bizcity/platform/core/auth';
import { ok } from '../../core/http.js';
import { extraAuthz } from '@bizcity/platform/core/security/role-assignments';
import { matchPattern } from '@bizcity/platform/core/authz/engine';
import { sql } from 'kysely';
import type { FastifyRequest } from 'fastify';
import { db } from '../../db/client.js';
import { Errors } from '../../core/errors.js';
import type { AuthContext } from '@bizcity/platform/core/auth';

/** Loại thao tác — quyết định quyền Core kéo theo (để người đang dùng không mất quyền). */
export type LoaiThaoTac = 'xem' | 'ghi' | 'huy' | 'xuat';
/**
 * Lệnh API do thao tác gác (thường là lệnh của lõi mà phân hệ không sửa được quyền tại chỗ): method + đường dẫn mẫu của Fastify,
 * `docType` khi nhiều loại phiếu dùng chung một lệnh (vd POST /api/v1/vouchers cho phiếu thu / chi / báo có / báo nợ).
 */
// [2026-11-14 07:30 PM kiennt] PHAN-QUYEN — `capNhat`: một lệnh nạp chứng từ vừa lập mới vừa sửa (gửi lại cùng docKey) → tách theo docKey đã có (đóng góp)
export interface LenhGac { method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'; url: string; docType?: string[]; capNhat?: boolean }
/**
 * `goc`: quyền gốc RỦI RO CAO mà lệnh của lõi vẫn đòi (users:write, settings:write, periods:lock, payments:approve…) — Cho quyền chi tiết
 * không thay được; HT12 nhắc "cần kèm" quyền này.
 */
export interface ThaoTac { quyen: string; nhan: string; loai: LoaiThaoTac; lenh?: LenhGac[]; goc?: Permission }
export interface ManHinh { key: string; ma: string; nhom: string; nhan: string; duongDan: string; thaoTac: Record<string, ThaoTac> }

const OP: Record<LoaiThaoTac, DocumentOp> = { xem: 'read', ghi: 'create', huy: 'cancel', xuat: 'export' };
const soDangKy = new Map<string, ManHinh>();
/** Khoá giả trong sổ loại chứng từ của lõi — chỉ để mượn cơ chế kéo theo, không phải loại chứng từ thật. */
const khoaGia = (man: string, tt: string) => `man-hinh:${man}:${tt}`;

export function dangKyManHinh(def: ManHinh): void {
  const cur = soDangKy.get(def.key);
  if (cur && cur.ma !== def.ma) throw new Error(`Màn ${def.key} đã đăng ký với mã ${cur.ma}`);
  for (const [tt, t] of Object.entries(def.thaoTac)) {
    registerDocumentType(khoaGia(def.key, tt), { [OP[t.loai]]: t.quyen });
    for (const l of t.lenh ?? []) {
      const k = `${l.method} ${l.url}`;
      soLenh.set(k, [...(soLenh.get(k) ?? []), { man: def.key, tt, docType: l.docType, capNhat: l.capNhat }]);
    }
  }
  soDangKy.set(def.key, def);
}

// [2026-11-13 07:30 PM kiennt] PHAN-QUYEN — bản thử: gác LỆNH (kể cả lệnh của lõi) theo thao tác màn đã đăng ký — móc toàn app gọi kiemLenhManHinh (đóng góp)
const soLenh = new Map<string, { man: string; tt: string; docType?: string[]; capNhat?: boolean }[]>();

/** Loại phiếu của yêu cầu: docType trong thân / query → theo khoá chứng từ (docKey) → theo mã sự việc (:id của /vouchers). */
async function loaiPhieu(req: FastifyRequest, tenantId: string): Promise<string | null> {
  const body = (req.body ?? {}) as Record<string, unknown>;
  const query = (req.query ?? {}) as Record<string, unknown>;
  for (const v of [body.docType, query.docType]) if (typeof v === 'string' && v) return v;
  const key = typeof body.docKey === 'string' ? body.docKey : null;
  if (key) return (await sql<{ t: string }>`SELECT doc_type AS t FROM accounting_events WHERE tenant_id = ${tenantId} AND doc_key = ${key}`.execute(db)).rows[0]?.t ?? null;
  const id = (req.params as { id?: unknown } | undefined)?.id;
  if ((req.routeOptions?.url ?? '').startsWith('/api/v1/vouchers/:id') && id !== undefined && /^\d+$/.test(String(id))) {
    return (await sql<{ t: string }>`SELECT doc_type AS t FROM accounting_events WHERE tenant_id = ${tenantId} AND id = ${String(id)}`.execute(db)).rows[0]?.t ?? null;
  }
  return null;
}

/** Chứng từ của yêu cầu (docKey trong thân) đã có trong sổ chưa — gửi lại cùng docKey là SỬA. */
async function docKeyDaCo(req: FastifyRequest, tenantId: string): Promise<boolean> {
  const key = (req.body as { docKey?: unknown } | undefined)?.docKey;
  if (typeof key !== 'string' || !key) return false;
  return (await sql`SELECT 1 FROM accounting_events WHERE tenant_id = ${tenantId} AND doc_key = ${key} LIMIT 1`.execute(db)).rows.length > 0;
}

// [2026-11-14 07:30 PM kiennt] PHAN-QUYEN — sửa: Cho quyền chi tiết có hiệu lực ở lệnh của lõi (mượn quyền gốc rủi ro thấp trong đúng lệnh đó) (đóng góp)
/**
 * Quyền gốc RỦI RO THẤP mà người có quyền chi tiết được MƯỢN trong đúng lệnh màn gác (theo loại thao tác). Không bao giờ mượn quyền rủi ro
 * cao (users:write, settings:write, periods:lock, payments:approve, documents:edit-all…) — thao tác cần quyền đó khai `goc`.
 */
const MUON: Record<LoaiThaoTac, Permission[]> = {
  xem: ['catalog:read', 'documents:read', 'reports:read', 'ledger:read'],
  xuat: ['catalog:read', 'documents:read', 'reports:read', 'ledger:read'],
  ghi: ['catalog:read', 'catalog:write', 'documents:read', 'documents:write'],
  huy: ['catalog:read', 'catalog:write', 'documents:read', 'documents:write'],
};

/**
 * Lệnh đã được màn nào gác (đúng loại phiếu) thì:
 *   - có quyền chi tiết → MƯỢN quyền gốc rủi ro thấp của loại thao tác cho riêng yêu cầu này (trừ quyền gốc đang bị Cấm) — để vai trò
 *     "chỉ Cho phiếu thu" lập được phiếu thu dù lệnh của lõi đòi documents:write;
 *   - không có quyền chi tiết vì bị Cấm (toàn đơn vị, hoặc `camThem` = Cấm của vai trò gán tại chi nhánh của yêu cầu) → 403 kèm tên màn;
 *   - không có quyền chi tiết, không bị Cấm (vd vai trò chỉ có catalog:write / periods:lock) → để lệnh tự kiểm quyền gốc như hôm nay.
 */
export async function kiemLenhManHinh(req: FastifyRequest, auth: AuthContext, camThem: readonly string[] = []): Promise<void> {
  const ds = soLenh.get(`${req.method} ${req.routeOptions?.url ?? ''}`);
  if (!ds?.length) return;
  const loai = ds.some((d) => d.docType) ? await loaiPhieu(req, auth.tenantId) : null;
  const daCo = ds.some((d) => d.capNhat !== undefined) ? await docKeyDaCo(req, auth.tenantId) : false;
  let cam: string[] | null = null;
  const dsCam = async () => (cam ??= [
    ...(auth.kind === 'user' && auth.actor.startsWith('user:') ? (await extraAuthz(auth.actor.slice(5))).deny : []), ...camThem,
  ]);
  for (const d of ds) {
    if (d.docType && (!loai || !d.docType.includes(loai))) continue;
    if (d.capNhat !== undefined && d.capNhat !== daCo) continue;
    const quyen = quyenThaoTac(d.man, d.tt);
    const m = soDangKy.get(d.man)!;
    const t = m.thaoTac[d.tt]!;
    if (auth.permissions.has(quyen)) {
      const c = await dsCam();
      for (const g of MUON[t.loai]) if (!c.some((x) => matchPattern(x, g))) (auth.permissions as Set<Permission>).add(g);
      continue;
    }
    if (!(await dsCam()).some((c) => matchPattern(c, quyen))) continue;
    throw Errors.forbidden(`Không có quyền "${t.nhan}" ở màn ${m.nhan} (${quyen})`);
  }
}

/** Quyền gác thao tác `tt` của màn `man`: quyền chi tiết nếu đã đăng ký và phân hệ đang bật, không thì quyền Core của loại thao tác. */
export function quyenThaoTac(man: string, tt: string): Permission {
  const t = soDangKy.get(man)?.thaoTac[tt];
  if (!t) throw new Error(`Màn ${man} chưa đăng ký thao tác ${tt}`);
  return documentPermissionOf(khoaGia(man, tt), OP[t.loai]);
}

export const danhSachManHinh = (): ManHinh[] => [...soDangKy.values()];

/** GET /api/v1/man-hinh — giao diện dựng menu / nút theo quyền (quyền hiệu lực của người dùng lấy ở /auth/me). */
export async function manHinhRoutes(app: FastifyInstance): Promise<void> {
  app.get('/api/v1/man-hinh', {
    preHandler: requirePermission('catalog:read'),
    schema: { tags: ['Phân quyền'], summary: 'Màn hình phân hệ đã đăng ký: menu + thao tác + quyền gác từng thao tác' },
    handler: async () => ok(danhSachManHinh().map((m) => ({
      ...m, thaoTac: Object.fromEntries(Object.entries(m.thaoTac).map(([k, { lenh: _l, ...t }]) => [k, { ...t, quyen: quyenThaoTac(m.key, k) }])),
    }))),
  });
}
