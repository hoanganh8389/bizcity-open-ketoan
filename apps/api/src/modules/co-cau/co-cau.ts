// @bizcity-layer M data/masterdata
// [2026-11-20 Nguyễn Văn Thủy] CƠ CẤU MỘT BẢNG (0173): đơn vị (branches) – phân kho – bộ phận; cây cũ org_units thành bản sao tự sinh (đóng góp)
/**
 * Mọi cấp là một ĐƠN VỊ (dòng branches, item_id cn_…): có cha, đường dẫn, cấp, tên gọi cấp tuỳ đặt, MST (trống = theo cấp gần nhất có khai),
 * tên in chứng từ, địa chỉ, điện thoại. Phân kho (warehouses.branch_id) và bộ phận (dimensions department .branch_id) thuộc đơn vị.
 * Tạo đơn vị là tự có một bộ phận (trigger branches_own_department).
 *
 *   GET  /api/v1/co-cau                         { units, warehouses, departments }
 *   POST /api/v1/co-cau/units                   thêm đơn vị
 *   PATCH /api/v1/co-cau/units/:code            sửa / đổi cha / đổi mã / ngừng
 *   PUT  /api/v1/co-cau/departments/:code       thêm / sửa bộ phận (thuộc đơn vị)
 *   POST /api/v1/co-cau/delete                  xoá vĩnh viễn đơn vị + mọi thứ bên trong (dryRun = xem ảnh hưởng)
 *   GET  /api/v1/co-cau/doi-cha?code=           lịch sử đổi cha (JSONL co-cau-doi-cha)
 * Phân kho thêm / sửa qua /api/v1/warehouses (branchCode = mã đơn vị).
 * Sau mỗi lần ghi: tính lại đường dẫn, đồng bộ bản sao org_units (phân quyền theo vùng, giá vốn theo cơ cấu, đơn vị mua hàng đọc cây cũ).
 */
import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { sql } from 'kysely';
import { authOf, requirePermission, type AuthContext } from '../../core/auth.js';
import { ok } from '../../core/http.js';
import { Errors } from '../../core/errors.js';
import { writeAudit } from '../../core/audit.js';
import { db, type Db } from '../../db/client.js';
import { appendRunLog, readRunLog } from '@bizcity/platform/core/run-log';
import { usedDimensionCodes } from '@bizcity/kernel';
import { sameTx, type ActionTx, defineAction, mountActions, type AnyActionDef } from '@bizcity/platform/core/actions';
import { branchService } from '../branches/branch.service.js';
import { recompute, syncBranchLevels } from '../org-units/org-unit.service.js';

const tags = ['Danh mục: Cơ cấu tổ chức'];
const MST = /^$|^[0-9]{10}(-[0-9]{3})?$/;

export interface UnitDto {
  uid: string; code: string; name: string; parentCode: string | null; path: string; level: number; levelLabel: string; sortOrder: number;
  taxCode: string; taxUsed: string; taxFrom: string | null;
  companyName: string; address: string; phone: string; note: string; isActive: boolean; departmentCode: string | null;
  createdBy: string; createdAt: string | null; updatedBy: string; updatedAt: string | null;
}
/** Người tạo / ngày tạo / người sửa / ngày sửa (cột ẩn sẵn ở bảng). */
interface Dau { createdBy: string; createdAt: string | null; updatedBy: string; updatedAt: string | null }
export interface WhDto { uid: string; code: string; name: string; branchCode: string; typeCode: string; typeName: string; isDefault: boolean; isActive: boolean; address: string; note: string }
export interface DeptDto { uid: string; code: string; name: string; branchCode: string | null; isActive: boolean; note: string }

/* ------------------------------------------------------------------ đọc */

interface URow { id: string; uid: string; code: string; name: string; parent_code: string | null; unit_path: string; unit_level: number; level_label: string; sort_order: number; tax_code: string; company_name: string; address: string | null; phone: string; note: string; is_active: boolean; department_code: string | null; unit_parent_id: string | null; created_by: string; created_at: string | null; updated_by: string; updated_at: string | null }

async function loadUnits(trx: Db, tenantId: string): Promise<URow[]> {
  return (await sql<URow>`
    SELECT b.id, b.uid, b.code, b.name, p.code AS parent_code, b.unit_path, b.unit_level, b.level_label, b.sort_order, b.tax_code, b.company_name, b.address, b.phone, b.note,
           b.is_active, b.department_code, b.unit_parent_id, b.created_by, b.created_at, b.updated_by, b.updated_at
      FROM branches b LEFT JOIN branches p ON p.id = b.unit_parent_id
     WHERE b.tenant_id = ${tenantId} ORDER BY b.unit_path`.execute(trx)).rows;
}

export async function coCau(trx: Db, tenantId: string) {
  const rows = await loadUnits(trx, tenantId);
  const byId = new Map(rows.map((r) => [String(r.id), r]));
  // MST: của mình, trống thì cấp gần nhất có khai.
  const mst = (r: URow): [string, string | null] => {
    for (let x: URow | undefined = r, n = 0; x && n < 40; x = x.unit_parent_id ? byId.get(String(x.unit_parent_id)) : undefined, n++) {
      if (x.tax_code && MST.test(x.tax_code.trim())) return [x.tax_code.trim(), x === r ? null : x.code];
    }
    return ['', null];
  };
  const units: UnitDto[] = rows.map((r) => {
    const [taxUsed, taxFrom] = mst(r);
    return {
      uid: r.uid, code: r.code, name: r.name, parentCode: r.parent_code, path: r.unit_path || r.code, level: r.unit_level, levelLabel: r.level_label, sortOrder: r.sort_order,
      taxCode: r.tax_code, taxUsed, taxFrom, companyName: r.company_name, address: r.address ?? '', phone: r.phone, note: r.note, isActive: r.is_active, departmentCode: r.department_code,
      createdBy: r.created_by, createdAt: r.created_at, updatedBy: r.updated_by, updatedAt: r.updated_at,
    };
  });
  const warehouses = (await sql<WhDto & Dau>`
    SELECT w.uid, w.code, w.name, b.code AS "branchCode", w.type_code AS "typeCode", COALESCE(t.name, '') AS "typeName", w.is_default AS "isDefault", w.is_active AS "isActive", w.address, w.note,
           w.created_by AS "createdBy", w.created_at AS "createdAt", w.updated_by AS "updatedBy", w.updated_at AS "updatedAt"
      FROM warehouses w JOIN branches b ON b.id = w.branch_id LEFT JOIN warehouse_types t ON t.tenant_id = w.tenant_id AND t.code = w.type_code
     WHERE w.tenant_id = ${tenantId} ORDER BY w.code`.execute(trx)).rows;
  const departments = (await sql<DeptDto & Dau>`
    SELECT d.uid, d.code, d.name, b.code AS "branchCode", d.is_active AS "isActive", d.note,
           d.created_by AS "createdBy", d.created_at AS "createdAt", d.updated_by AS "updatedBy", d.updated_at AS "updatedAt"
      FROM dimensions d LEFT JOIN branches b ON b.id = d.branch_id
     WHERE d.tenant_id = ${tenantId} AND d.kind = 'department' ORDER BY d.code`.execute(trx)).rows;
  return { units, warehouses, departments };
}

/* ------------------------------------------------------------------ đồng bộ */

/** Đường dẫn + bản sao org_units (cho phần cũ đọc cây) + phân cấp mua hàng. Gọi sau mọi lần ghi. */
export async function dongBoCoCau(trx: Db, tenantId: string): Promise<void> {
  await sql`SELECT bizcity_unit_paths(${tenantId})`.execute(trx);
  // Đơn vị cần bản sao: đã có, hoặc đang có đơn vị con.
  const can = (await sql<{ id: string; code: string; name: string; tax_code: string; note: string; is_active: boolean; sort_order: number; org_mirror_id: string | null; unit_parent_id: string | null }>`
    SELECT b.id, b.code, b.name, b.tax_code, b.note, b.is_active, b.sort_order, b.org_mirror_id, b.unit_parent_id FROM branches b
     WHERE b.tenant_id = ${tenantId} AND (b.org_mirror_id IS NOT NULL OR EXISTS (SELECT 1 FROM branches c WHERE c.tenant_id = b.tenant_id AND c.unit_parent_id = b.id))
     ORDER BY b.unit_level`.execute(trx)).rows;
  for (const u of can.filter((x) => !x.org_mirror_id)) {
    const trung = (await sql<{ id: string }>`SELECT id FROM org_units WHERE tenant_id = ${tenantId} AND code = ${u.code}`.execute(trx)).rows[0];
    const ma = trung ? `${u.code}~${u.id}` : u.code;
    const id = (await sql<{ id: string }>`INSERT INTO org_units (tenant_id, code, name, kind, note) VALUES (${tenantId}, ${ma}, ${u.name}, 'unit', ${u.note}) RETURNING id`.execute(trx)).rows[0]!.id;
    await sql`UPDATE branches SET org_mirror_id = ${id} WHERE id = ${u.id}`.execute(trx);
    u.org_mirror_id = id;
  }
  const mirrorOf = new Map(can.map((u) => [String(u.id), u.org_mirror_id!]));
  for (const u of can) {
    const parent = u.unit_parent_id ? mirrorOf.get(String(u.unit_parent_id)) ?? null : null;
    await sql`UPDATE org_units SET name = ${u.name}, tax_id = ${MST.test(u.tax_code.trim()) ? u.tax_code.trim() : ''}, note = ${u.note}, sort_order = ${u.sort_order},
        parent_id = ${parent}, kind = ${parent ? 'unit' : 'company'}, is_active = ${u.is_active}
      WHERE id = ${u.org_mirror_id} AND (name, tax_id, note, sort_order, parent_id, kind, is_active) IS DISTINCT FROM
        (${u.name}, ${MST.test(u.tax_code.trim()) ? u.tax_code.trim() : ''}, ${u.note}, ${u.sort_order}, ${parent}::bigint, ${parent ? 'unit' : 'company'}, ${u.is_active})`.execute(trx);
  }
  // Nút cũ của đơn vị: nhóm → bản sao của chính nó; đơn vị lá → bản sao của cha.
  await sql`
    UPDATE branches b SET org_unit_id = COALESCE(b.org_mirror_id, p.org_mirror_id)
      FROM branches b2 LEFT JOIN branches p ON p.id = b2.unit_parent_id
     WHERE b.id = b2.id AND b.tenant_id = ${tenantId} AND b.org_unit_id IS DISTINCT FROM COALESCE(b.org_mirror_id, p.org_mirror_id)`.execute(trx);
  await recompute(trx, tenantId);
  await syncBranchLevels(trx, tenantId);
}

/* ------------------------------------------------------------------ ghi */

const unitBase = z.object({
  name: z.string().trim().min(1, 'Nhập tên').max(255),
  parentCode: z.string().trim().max(32).nullable().optional(),
  levelLabel: z.string().trim().max(40).optional(),
  /** MST: kiểm định dạng khi tạo mới / khi đổi (dữ liệu cũ chưa chuẩn không chặn lúc sửa ô khác). */
  taxCode: z.string().trim().max(500).optional(),
  companyName: z.string().trim().max(500).optional(),
  address: z.string().trim().max(500).optional(),
  phone: z.string().trim().max(64).optional(),
  note: z.string().trim().max(500).optional(),
  sortOrder: z.number().int().min(0).max(100000).optional(),
  /** Ngày áp dụng khi đổi cha / MST (YYYY-MM-DD); trống = hôm nay. */
  validFrom: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
});
export const unitCreateSchema = unitBase.extend({
  code: z.string().trim().min(1, 'Nhập mã').max(32),
  /** Tên bộ phận mặc định (trống = theo tên đơn vị). */
  departmentName: z.string().trim().max(255).optional(),
});
export const unitUpdateSchema = unitBase.partial().extend({ isActive: z.boolean().optional(), newCode: z.string().trim().min(1).max(32).optional(), departmentCode: z.string().trim().max(64).nullable().optional() });
export const deptSchema = z.object({ name: z.string().trim().min(1).max(255), branchCode: z.string().trim().min(1, 'Chọn đơn vị').max(32), isActive: z.boolean().default(true), note: z.string().trim().max(500).default('') });

/** Mã không trùng giữa đơn vị, phân kho, bộ phận. */
async function maTrung(trx: Db, tenantId: string, code: string, bo?: { loai: 'unit' | 'wh' | 'dept'; code: string }) {
  const r = (await sql<{ loai: string; code: string; name: string }>`
    SELECT 'đơn vị' AS loai, code, name FROM branches WHERE tenant_id = ${tenantId} AND lower(code) = lower(${code}) ${bo?.loai === 'unit' ? sql`AND code <> ${bo.code}` : sql``}
    UNION ALL SELECT 'phân kho', code, name FROM warehouses WHERE tenant_id = ${tenantId} AND lower(code) = lower(${code})
    UNION ALL SELECT 'bộ phận', code, name FROM dimensions WHERE tenant_id = ${tenantId} AND kind = 'department' AND lower(code) = lower(${code}) ${bo?.loai === 'dept' ? sql`AND code <> ${bo.code}` : sql``}
    LIMIT 1`.execute(trx)).rows[0];
  if (r) throw Errors.conflict(`Mã ${code} đã dùng cho ${r.loai} ${r.name}`);
}

async function unitId(trx: Db, tenantId: string, code: string): Promise<{ id: string; unit_parent_id: string | null; unit_path: string; department_code: string | null }> {
  const r = (await sql<{ id: string; unit_parent_id: string | null; unit_path: string; department_code: string | null }>`SELECT id, unit_parent_id, unit_path, department_code FROM branches WHERE tenant_id = ${tenantId} AND code = ${code}`.execute(trx)).rows[0];
  if (!r) throw Errors.notFound(`đơn vị ${code}`);
  return r;
}

async function datCha(trx: Db, tenantId: string, id: string, parentCode: string | null | undefined): Promise<string | null> {
  if (!parentCode) { await sql`UPDATE branches SET unit_parent_id = NULL WHERE id = ${id}`.execute(trx); return null; }
  const p = await unitId(trx, tenantId, parentCode);
  if (p.id === id) throw Errors.validation('Đơn vị không thuộc chính nó');
  // Không cho chọn đơn vị con cháu làm cha (vòng lặp).
  const vong = (await sql<{ c: number }>`
    WITH RECURSIVE up AS (SELECT id, unit_parent_id, 0 AS d FROM branches WHERE id = ${p.id}
      UNION ALL SELECT b.id, b.unit_parent_id, up.d + 1 FROM branches b JOIN up ON b.id = up.unit_parent_id WHERE up.d < 40)
    SELECT count(*)::int AS c FROM up WHERE id = ${id}`.execute(trx)).rows[0]!.c;
  if (vong) throw Errors.validation(`${parentCode} đang là cấp dưới của đơn vị này — không chọn làm cha được`);
  await sql`UPDATE branches SET unit_parent_id = ${p.id} WHERE id = ${id}`.execute(trx);
  return p.id;
}

/** Người thao tác cho trigger người tạo / người sửa (0173). */
async function nguoiGhi(trx: Db, auth: AuthContext) {
  await sql`SELECT set_config('ketoan.actor_name', ${auth.actorName || auth.actor}, true)`.execute(trx);
}

async function ghiThem(trx: Db, id: string, i: { levelLabel?: string; sortOrder?: number }) {
  if (i.levelLabel !== undefined) await sql`UPDATE branches SET level_label = ${i.levelLabel} WHERE id = ${id}`.execute(trx);
  if (i.sortOrder !== undefined) await sql`UPDATE branches SET sort_order = ${i.sortOrder} WHERE id = ${id}`.execute(trx);
}

export const coCauService = {
  async createUnitIn(trx: ActionTx, auth: AuthContext, input: z.infer<typeof unitCreateSchema>) {
    return sameTx(trx, async (trx) => {
      await nguoiGhi(trx, auth);
      if (input.taxCode && !MST.test(input.taxCode)) throw Errors.validation('MST gồm 10 số hoặc 10 số-3 số');
      await maTrung(trx, auth.tenantId, input.code);
      await branchService.createIn(trx, auth, { code: input.code, name: input.name, taxCode: input.taxCode ?? '', companyName: input.companyName ?? '', address: input.address ?? '', phone: input.phone ?? '', note: input.note ?? '' });
      const u = await unitId(trx, auth.tenantId, input.code);
      await datCha(trx, auth.tenantId, u.id, input.parentCode);
      await ghiThem(trx, u.id, input);
      const bp = (await sql<{ department_code: string | null }>`SELECT department_code FROM branches WHERE id = ${u.id}`.execute(trx)).rows[0]?.department_code;
      if (bp && input.departmentName) await sql`UPDATE dimensions SET name = ${input.departmentName} WHERE tenant_id = ${auth.tenantId} AND kind = 'department' AND code = ${bp}`.execute(trx);
      await dongBoCoCau(trx, auth.tenantId);
      await writeAudit(trx, { tenantId: auth.tenantId, actor: auth.actor, action: 'co_cau.unit_create', objectType: 'branch', objectId: input.code, after: input });
      return { code: input.code };
    });
  },

  async updateUnitIn(trx: ActionTx, auth: AuthContext, code: string, input: z.infer<typeof unitUpdateSchema>) {
    return sameTx(trx, async (trx) => {
      await nguoiGhi(trx, auth);
      const before = await unitId(trx, auth.tenantId, code);
      if (input.taxCode !== undefined) {
        const cu = (await sql<{ tax_code: string }>`SELECT tax_code FROM branches WHERE id = ${before.id}`.execute(trx)).rows[0]?.tax_code ?? '';
        if (input.taxCode.trim() === cu.trim()) delete input.taxCode;
        else if (input.taxCode && !MST.test(input.taxCode)) throw Errors.validation('MST gồm 10 số hoặc 10 số-3 số');
      }
      if (input.newCode && input.newCode !== code) await maTrung(trx, auth.tenantId, input.newCode, { loai: 'unit', code });
      const { parentCode, levelLabel, sortOrder, ...rest } = input;
      await branchService.updateIn(trx, auth, code, { ...rest, validFrom: input.validFrom ?? null });
      const ma = input.newCode || code;
      if (parentCode !== undefined) {
        const cu = before.unit_parent_id;
        const moi = await datCha(trx, auth.tenantId, before.id, parentCode);
        if (String(cu ?? '') !== String(moi ?? '')) {
          const tu = cu ? (await sql<{ code: string }>`SELECT code FROM branches WHERE id = ${cu}`.execute(trx)).rows[0]?.code ?? null : null;
          await appendRunLog('co-cau-doi-cha', auth.tenantId, { code: ma, tu, den: parentCode || null, duongDanCu: before.unit_path, apDung: input.validFrom ?? null, nguoi: auth.actorName || auth.actor });
        }
      }
      await ghiThem(trx, before.id, { levelLabel, sortOrder });
      await dongBoCoCau(trx, auth.tenantId);
      await writeAudit(trx, { tenantId: auth.tenantId, actor: auth.actor, action: 'co_cau.unit_update', objectType: 'branch', objectId: code, after: input });
      return { code: ma };
    });
  },

  async saveDeptIn(trx: ActionTx, auth: AuthContext, code: string, input: z.infer<typeof deptSchema>) {
    return sameTx(trx, async (trx) => {
      await nguoiGhi(trx, auth);
      const u = await unitId(trx, auth.tenantId, input.branchCode);
      const cu = (await sql<{ id: string }>`SELECT id FROM dimensions WHERE tenant_id = ${auth.tenantId} AND kind = 'department' AND code = ${code}`.execute(trx)).rows[0];
      if (!cu) await maTrung(trx, auth.tenantId, code);
      if (cu) await sql`UPDATE dimensions SET name = ${input.name}, branch_id = ${u.id}, is_active = ${input.isActive}, note = ${input.note} WHERE id = ${cu.id}`.execute(trx);
      else await sql`INSERT INTO dimensions (tenant_id, kind, code, name, branch_id, is_active, note) VALUES (${auth.tenantId}, 'department', ${code}, ${input.name}, ${u.id}, ${input.isActive}, ${input.note})`.execute(trx);
      // Đơn vị chưa có bộ phận mặc định → nhận bộ phận này.
      if (!u.department_code) await sql`UPDATE branches SET department_code = ${code} WHERE id = ${u.id}`.execute(trx);
      await writeAudit(trx, { tenantId: auth.tenantId, actor: auth.actor, action: cu ? 'co_cau.dept_update' : 'co_cau.dept_create', objectType: 'department', objectId: code, after: input });
      return { code };
    });
  },
};

/* ------------------------------------------------------------------ xoá cả nhánh */

export interface XoaKQ { ten: string; dem: { donVi: number; kho: number; boPhan: number }; donVi: string[]; kho: string[]; boPhan: string[]; chan: string[]; daXoa: boolean }

async function xoaIn(trx: ActionTx, auth: AuthContext, key: string, dryRun: boolean): Promise<XoaKQ> {
  return sameTx(trx, async (trx) => {
    const tid = auth.tenantId;
    const [loai, ...rest] = key.split(':');
    const code = rest.join(':');
    let units: { id: string; code: string; name: string; unit_level: number; org_mirror_id: string | null; department_code: string | null }[] = [];
    let whs: { id: string; code: string; name: string }[] = [];
    let deps: { id: string; code: string; name: string }[] = [];
    let ten = code;
    if (loai === 'u') {
      units = (await sql<typeof units[number]>`
        WITH RECURSIVE t AS (SELECT id FROM branches WHERE tenant_id = ${tid} AND code = ${code}
          UNION ALL SELECT b.id FROM branches b JOIN t ON b.unit_parent_id = t.id)
        SELECT b.id, b.code, b.name, b.unit_level, b.org_mirror_id, b.department_code FROM branches b JOIN t ON t.id = b.id ORDER BY b.unit_level DESC`.execute(trx)).rows;
      if (!units.length) throw Errors.notFound(`đơn vị ${code}`);
      ten = units.find((u) => u.code === code)!.name;
      const ids = units.map((u) => u.id);
      whs = (await sql<typeof whs[number]>`SELECT id, code, name FROM warehouses WHERE tenant_id = ${tid} AND branch_id = ANY(${ids}::bigint[])`.execute(trx)).rows;
      deps = (await sql<typeof deps[number]>`SELECT id, code, name FROM dimensions WHERE tenant_id = ${tid} AND kind = 'department' AND (branch_id = ANY(${ids}::bigint[]) OR code = ANY(${units.map((u) => u.department_code).filter(Boolean) as string[]}::text[]))`.execute(trx)).rows;
    } else if (loai === 'w') {
      whs = (await sql<typeof whs[number]>`SELECT id, code, name FROM warehouses WHERE tenant_id = ${tid} AND code = ${code}`.execute(trx)).rows;
      if (!whs.length) throw Errors.notFound(`phân kho ${code}`);
      ten = whs[0]!.name;
    } else if (loai === 'd') {
      deps = (await sql<typeof deps[number]>`SELECT id, code, name FROM dimensions WHERE tenant_id = ${tid} AND kind = 'department' AND code = ${code}`.execute(trx)).rows;
      if (!deps.length) throw Errors.notFound(`bộ phận ${code}`);
      ten = deps[0]!.name;
    } else throw Errors.validation('Khoá dạng u:MÃ / w:MÃ / d:MÃ');
    const chan: string[] = [];
    if (whs.length) {
      const used = (await sql<{ c: string }>`SELECT DISTINCT warehouse_code AS c FROM inventory_movements WHERE tenant_id = ${tid} AND warehouse_code = ANY(${whs.map((w) => w.code)}::text[])`.execute(trx)).rows.map((r) => r.c);
      if (used.length) chan.push(`${used.length} phân kho đã có nhập xuất: ${used.slice(0, 8).join(', ')}${used.length > 8 ? '…' : ''}`);
    }
    if (units.length) {
      const used = (await sql<{ c: string }>`SELECT b.code AS c FROM branches b WHERE b.id = ANY(${units.map((u) => u.id)}::bigint[])
        AND (EXISTS (SELECT 1 FROM ledger_entries e WHERE e.tenant_id = b.tenant_id AND e.branch_id = b.id)
          OR EXISTS (SELECT 1 FROM business_documents d WHERE d.tenant_id = b.tenant_id AND d.branch_code = b.code))`.execute(trx)).rows.map((r) => r.c);
      if (used.length) chan.push(`${used.length} đơn vị đã có chứng từ / sổ sách: ${used.slice(0, 8).join(', ')}${used.length > 8 ? '…' : ''}`);
    }
    if (deps.length) {
      const own = new Set(units.map((u) => u.department_code).filter(Boolean) as string[]);
      const used = [...(await usedDimensionCodes(trx, tid, 'department', deps.map((d) => d.code).filter((c) => !own.has(c))))];
      if (used.length) chan.push(`${used.length} bộ phận đã dùng ở sổ sách / tài sản / định mức: ${used.slice(0, 8).join(', ')}`);
    }
    const nhan = (x: { code: string; name: string }) => `${x.code} · ${x.name}`;
    const kq: XoaKQ = { ten, dem: { donVi: units.length, kho: whs.length, boPhan: deps.length }, donVi: units.map(nhan), kho: whs.map(nhan), boPhan: deps.map(nhan), chan, daXoa: false };
    if (dryRun) return kq;
    if (chan.length) throw Errors.conflict(`Không xoá được ${ten}: ${chan.join('; ')} — dùng "Ngừng hoạt động" thay vì xoá`);
    const chup = async (bang: string, ids: string[]) => (ids.length ? (await sql<{ r: unknown }>`SELECT to_jsonb(t) AS r FROM ${sql.table(bang)} t WHERE t.id = ANY(${ids}::bigint[])`.execute(trx)).rows.map((x) => x.r) : []);
    const anh = { branches: await chup('branches', units.map((u) => u.id)), warehouses: await chup('warehouses', whs.map((w) => w.id)), dimensions: await chup('dimensions', deps.map((d) => d.id)) };
    if (whs.length) await sql`DELETE FROM warehouses WHERE tenant_id = ${tid} AND id = ANY(${whs.map((w) => w.id)}::bigint[])`.execute(trx);
    if (units.length) {
      const ids = units.map((u) => u.id);
      await sql`UPDATE branches SET department_code = NULL WHERE id = ANY(${ids}::bigint[])`.execute(trx);
      await sql`UPDATE org_units SET purchase_branch_id = NULL WHERE tenant_id = ${tid} AND purchase_branch_id = ANY(${ids}::bigint[])`.execute(trx);
    }
    if (deps.length) await sql`DELETE FROM dimensions WHERE tenant_id = ${tid} AND id = ANY(${deps.map((d) => d.id)}::bigint[])`.execute(trx);
    for (const u of units) await sql`DELETE FROM branches WHERE id = ${u.id}`.execute(trx);
    const mirrors = units.map((u) => u.org_mirror_id).filter(Boolean) as string[];
    if (mirrors.length) {
      await sql`UPDATE branches SET org_unit_id = NULL WHERE org_unit_id = ANY(${mirrors}::bigint[])`.execute(trx);
      await sql`DELETE FROM org_units WHERE id = ANY(${mirrors}::bigint[])`.execute(trx);
    }
    if (units.length) await dongBoCoCau(trx, tid);
    await writeAudit(trx, { tenantId: tid, actor: auth.actor, action: 'co_cau.delete', objectType: 'co_cau', objectId: key, before: kq });
    await appendRunLog('xoa-co-cau', tid, { key, nguoi: auth.actorName || auth.actor, dem: kq.dem, rows: anh });
    return { ...kq, daXoa: true };
  });
}

/* ------------------------------------------------------------------ đường */

const anyOut = z.custom<object>((v) => typeof v === 'object' && v !== null);
const codeP = z.object({ code: z.string() });
export const coCauActions: AnyActionDef[] = [
  defineAction({
    id: 'core.co-cau.unit-create', title: 'Thêm đơn vị cơ cấu', tags, permission: 'catalog:write', effect: 'write', sideEffects: ['masterdata'], idempotency: 'natural',
    input: unitCreateSchema, output: anyOut, expose: { http: { method: 'POST', path: '/api/v1/co-cau/units', status: 201 }, mcp: false, ai: 'deny' },
    evidence: { objectType: 'branch' }, handler: (ctx, input) => coCauService.createUnitIn(ctx.data.tx, ctx.legacyAuth, input),
  }),
  defineAction({
    id: 'core.co-cau.unit-update', title: 'Sửa / đổi cha đơn vị cơ cấu', tags, permission: 'catalog:write', effect: 'write', sideEffects: ['masterdata'], idempotency: 'natural',
    input: unitUpdateSchema.merge(codeP), output: anyOut, expose: { http: { method: 'PATCH', path: '/api/v1/co-cau/units/:code' }, mcp: false, ai: 'deny' },
    evidence: { objectType: 'branch', objectId: (i) => String(i.code) },
    handler: (ctx, input) => { const { code, ...body } = input; return coCauService.updateUnitIn(ctx.data.tx, ctx.legacyAuth, code, body); },
  }),
  defineAction({
    id: 'core.co-cau.dept-save', title: 'Thêm / sửa bộ phận của đơn vị', tags, permission: 'catalog:write', effect: 'write', sideEffects: ['masterdata'], idempotency: 'natural',
    input: deptSchema.merge(codeP), output: anyOut, expose: { http: { method: 'PUT', path: '/api/v1/co-cau/departments/:code' }, mcp: false, ai: 'deny' },
    evidence: { objectType: 'department', objectId: (i) => String(i.code) },
    handler: (ctx, input) => { const { code, ...body } = input; return coCauService.saveDeptIn(ctx.data.tx, ctx.legacyAuth, code, body); },
  }),
  defineAction({
    id: 'core.co-cau.delete', title: 'Xoá vĩnh viễn đơn vị và mọi thứ bên trong', tags, permission: 'catalog:write', effect: 'write', sideEffects: ['masterdata'], idempotency: 'natural',
    input: z.object({ key: z.string().regex(/^[uwd]:.+$/).max(80), dryRun: z.boolean().default(true) }), output: anyOut,
    expose: { http: { method: 'POST', path: '/api/v1/co-cau/delete' }, mcp: false, ai: 'deny' },
    evidence: { objectType: 'co_cau', objectId: (i) => String(i.key) }, handler: (ctx, input) => xoaIn(ctx.data.tx, ctx.legacyAuth, input.key, input.dryRun),
  }),
];

export async function coCauRoutes(app: FastifyInstance): Promise<void> {
  const r = app.withTypeProvider<ZodTypeProvider>();
  r.get('/api/v1/co-cau', { preHandler: requirePermission('catalog:read'), schema: { tags, summary: 'Đơn vị, phân kho, bộ phận' }, handler: async (req) => ok(await coCau(db, authOf(req).tenantId)) });
  r.get('/api/v1/co-cau/doi-cha', {
    preHandler: requirePermission('catalog:read'), schema: { tags, summary: 'Lịch sử đổi cha của đơn vị', querystring: z.object({ code: z.string().optional() }) },
    handler: async (req) => {
      const rows = await readRunLog<{ code: string }>('co-cau-doi-cha', { tenantId: authOf(req).tenantId });
      return ok(rows.filter((x) => !req.query.code || x.data.code === req.query.code).reverse().slice(0, 300));
    },
  });
  mountActions(app, coCauActions);
}
