// @bizcity-layer M data/masterdata
/**
 * Danh mục kho theo chi nhánh (DM12).
 *   GET    /api/v1/warehouses?branchCodes=A,B   danh sách (lọc theo chi nhánh, trống = tất cả)
 *   POST   /api/v1/warehouses                   thêm kho
 *   PATCH  /api/v1/warehouses/:code             sửa kho (đổi chi nhánh, tên, theo dõi, mặc định…)
 *   DELETE /api/v1/warehouses/:code             xoá kho chưa có dòng nhập xuất
 * Kho mặc định của chi nhánh nhận các dòng nhập xuất không ghi mã kho (lọc báo cáo kho theo kho).
 * Luật (như danh mục kho của phần mềm bán hàng cũ):
 *   - mã kho duy nhất toàn hệ thống, tối đa 12 ký tự; chi nhánh và tên kho bắt buộc;
 *   - mỗi chi nhánh tối đa MỘT kho khuyến mại; kho mặc định có thể nhiều (dòng không mã kho tính vào mọi kho mặc định);
 *   - kho đã có dòng nhập xuất: không chuyển sang chi nhánh khác, không xoá (bỏ tích "Theo dõi" để ngừng dùng).
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
import { sameTx, type ActionTx, defineAction, mountActions, type AnyActionDef } from '@bizcity/platform/core/actions';

const tags = ['Danh mục: Kho'];

const bodySchema = z.object({
  code: z.string().trim().min(1, 'Chưa nhập mã kho').max(12, 'Mã kho tối đa 12 ký tự'),
  branchCode: z.string().trim().min(1, 'Chưa chọn chi nhánh').max(32),
  name: z.string().trim().min(1, 'Chưa nhập tên kho').max(50, 'Tên kho tối đa 50 ký tự'),
  address: z.string().trim().max(500).default(''),
  isActive: z.boolean().default(true),
  isDefault: z.boolean().default(false),
  isPromo: z.boolean().default(false),
  /** [2026-11-13 Nguyễn Văn Thủy] Loại kho (0128); trống = KHH (hoặc KKM nếu isPromo) (đóng góp) */
  typeCode: z.string().trim().regex(/^[A-Z][A-Z0-9_]{1,11}$/, 'Mã loại kho viết hoa').optional(),
  // [2026-11-13 Nguyễn Văn Thủy] MST kê khai của kho (0121): trống = theo chi nhánh → công ty (đóng góp)
  taxId: z.string().trim().regex(/^$|^[0-9]{10}(-[0-9]{3})?$/, 'MST gồm 10 số hoặc 10 số-3 số').default(''),
  /** Ngày MST mới bắt đầu có hiệu lực (YYYY-MM-DD); trống = hôm nay. */
  taxValidFrom: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  account: z.string().trim().max(32).default(''),
  note: z.string().trim().max(500).default(''),
});
const patchSchema = bodySchema.omit({ code: true }).partial();
type Body = z.infer<typeof bodySchema>;

// [2026-11-09 03:20 PM kiennt] PHASE-028 — S028-19: trả thêm id kho (gán vai trò theo kho ở HT12 cần warehouses.id); trường cũ giữ nguyên
export interface WarehouseDto { id: string; code: string; branchCode: string; branchName: string; name: string; address: string; isActive: boolean; isDefault: boolean; isPromo: boolean; account: string; note: string; typeCode: string; typeName: string; taxId: string; taxIdUsed: string; uid: string }

const select = (trx: Db, tenantId: string) => trx.selectFrom('warehouses as w').innerJoin('branches as b', 'b.id', 'w.branch_id')
  .select(['w.id', 'w.code', 'b.code as branch_code', 'b.name as branch_name', 'w.name', 'w.address', 'w.is_active', 'w.is_default', 'w.is_promo', 'w.account', 'w.note', 'w.tax_id', 'w.uid', 'w.type_code',
    sql<string>`(SELECT t.name FROM warehouse_types t WHERE t.tenant_id = w.tenant_id AND t.code = w.type_code)`.as('type_name'),
    sql<string>`bizcity_tax_id_at(w.tenant_id, w.branch_id, w.id, current_date)`.as('tax_id_used')])
  .where('w.tenant_id', '=', tenantId);
type Row = Awaited<ReturnType<ReturnType<typeof select>['executeTakeFirstOrThrow']>>;
const dto = (r: Row): WarehouseDto => ({
  id: String(r.id), code: r.code, branchCode: r.branch_code, branchName: r.branch_name, name: r.name, address: r.address,
  isActive: r.is_active, isDefault: r.is_default, isPromo: r.is_promo, account: r.account, note: r.note, typeCode: r.type_code, typeName: r.type_name ?? '',
  taxId: r.tax_id, taxIdUsed: r.tax_id_used ?? '', uid: r.uid,
});

async function branchId(trx: Db, tenantId: string, code: string): Promise<string> {
  const b = await trx.selectFrom('branches').select('id').where('tenant_id', '=', tenantId).where('code', '=', code).executeTakeFirst();
  if (!b) throw Errors.validation(`Chi nhánh ${code} không có trong danh mục chi nhánh`);
  return b.id;
}

/** Loại kho phải có trong danh mục và đang dùng (0128). */
async function assertType(trx: Db, tenantId: string, code: string) {
  const t = await trx.selectFrom('warehouse_types').select('is_active').where('tenant_id', '=', tenantId).where('code', '=', code).executeTakeFirst();
  if (!t) throw Errors.validation(`Loại kho ${code} chưa có trong danh mục Loại kho`);
  if (!t.is_active) throw Errors.validation(`Loại kho ${code} đã ngừng dùng`);
}

/** Mỗi chi nhánh tối đa một kho khuyến mại. */
async function assertOnePromo(trx: Db, tenantId: string, branch: string, code: string) {
  const other = await trx.selectFrom('warehouses').select('code').where('tenant_id', '=', tenantId).where('branch_id', '=', branch)
    .where('is_promo', '=', true).where('code', '<>', code).executeTakeFirst();
  if (other) throw Errors.conflict(`Chi nhánh đã có kho khuyến mại ${other.code} — mỗi chi nhánh chỉ một kho khuyến mại`);
}

const usedBy = (trx: Db, tenantId: string, code: string) =>
  trx.selectFrom('inventory_movements').select('id').where('tenant_id', '=', tenantId).where('warehouse_code', '=', code).limit(1).executeTakeFirst();

/** Phiên bản MST của kho (0121): mới nhất trước; kèm MST thực dùng tại ngày bắt đầu mỗi phiên bản. */
export async function warehouseTaxHistory(tenantId: string, code: string) {
  const res = await sql<{ valid_from: string; valid_to: string | null; tax_id: string; tax_id_used: string; changed_by: string; changed_at: Date }>`
    SELECT v.valid_from::text, v.valid_to::text, v.tax_id, bizcity_tax_id_at(w.tenant_id, w.branch_id, w.id, greatest(v.valid_from, DATE '2000-01-01')) AS tax_id_used, v.changed_by, v.changed_at
      FROM tax_id_versions v JOIN warehouses w ON w.id = v.ref_id
     WHERE v.tenant_id = ${tenantId} AND v.scope = 'warehouse' AND w.code = ${code}
     ORDER BY v.valid_from DESC LIMIT 200`.execute(db);
  return res.rows.map((r) => ({ validFrom: r.valid_from, validTo: r.valid_to, taxId: r.tax_id, taxIdUsed: r.tax_id_used, changedBy: r.changed_by, changedAt: r.changed_at }));
}

/** Biến phiên cho trigger phiên bản (0121): người đổi, ngày hiệu lực (mặc định hôm nay). */
export async function setVersionContext(trx: Db, by: string, validFrom?: string | null) {
  await sql`SELECT set_config('ketoan.actor_name', ${by}, true), set_config('ketoan.valid_from', ${validFrom ?? ''}, true)`.execute(trx);
}

export const warehouseService = {
  async list(auth: AuthContext, branchCodes?: string[]): Promise<WarehouseDto[]> {
    let q = select(db, auth.tenantId);
    if (branchCodes?.length) q = q.where('b.code', 'in', branchCodes);
    return (await q.orderBy('b.code').orderBy('w.code').execute()).map(dto);
  },

  async create(auth: AuthContext, input: Body): Promise<WarehouseDto> {
    return db.transaction().execute((trx) => warehouseService.createIn(trx, auth, input));
  },

  // [2026-11-03 04:00 AM Johnny Chu - Chu Hoàng Anh] PHASE-014 — W6 đợt 3 (SC-ACT-1): bản *In chạy trong giao dịch của action (defineAction); bản cũ giữ chữ ký, tự mở giao dịch
  async createIn(trx: ActionTx, auth: AuthContext, input: Body): Promise<WarehouseDto> {
    return sameTx(trx, async (trx) => {
      const exists = await trx.selectFrom('warehouses').select('id').where('tenant_id', '=', auth.tenantId).where('code', '=', input.code).executeTakeFirst();
      if (exists) throw Errors.conflict(`Mã kho ${input.code} đã có`);
      const branch = await branchId(trx, auth.tenantId, input.branchCode);
      const typeCode = input.typeCode ?? (input.isPromo ? 'KKM' : 'KHH');
      await assertType(trx, auth.tenantId, typeCode);
      if (typeCode === 'KKM') await assertOnePromo(trx, auth.tenantId, branch, input.code);
      await setVersionContext(trx, auth.actorName || auth.actor, input.taxValidFrom); // phiên bản MST kho (0121)
      await trx.insertInto('warehouses').values({
        tenant_id: auth.tenantId, code: input.code, branch_id: branch, name: input.name, address: input.address, type_code: typeCode,
        is_active: input.isActive, is_default: input.isDefault, is_promo: typeCode === 'KKM', account: input.account, note: input.note, tax_id: input.taxId,
      }).execute();
      await writeAudit(trx, { tenantId: auth.tenantId, actor: auth.actor, action: 'warehouse.create', objectType: 'warehouse', objectId: input.code, after: input });
      return dto(await select(trx, auth.tenantId).where('w.code', '=', input.code).executeTakeFirstOrThrow());
    });
  },

  async update(auth: AuthContext, code: string, input: z.infer<typeof patchSchema>): Promise<WarehouseDto> {
    return db.transaction().execute((trx) => warehouseService.updateIn(trx, auth, code, input));
  },

  // [2026-11-03 04:00 AM Johnny Chu - Chu Hoàng Anh] PHASE-014 — W6 đợt 3 (SC-ACT-1): bản *In chạy trong giao dịch của action (defineAction); bản cũ giữ chữ ký, tự mở giao dịch
  async updateIn(trx: ActionTx, auth: AuthContext, code: string, input: z.infer<typeof patchSchema>): Promise<WarehouseDto> {
    return sameTx(trx, async (trx) => {
      const before = await select(trx, auth.tenantId).where('w.code', '=', code).executeTakeFirst();
      if (!before) throw Errors.notFound(`kho ${code}`);
      const patch: Record<string, unknown> = { updated_at: new Date() };
      const cur = await trx.selectFrom('warehouses').select(['branch_id', 'is_promo']).where('tenant_id', '=', auth.tenantId).where('code', '=', code).executeTakeFirstOrThrow();
      let branch = cur.branch_id;
      if (input.branchCode !== undefined && input.branchCode !== before.branch_code) {
        if (await usedBy(trx, auth.tenantId, code)) throw Errors.conflict(`Kho ${code} đã có dòng nhập xuất: không chuyển sang chi nhánh khác được`);
        branch = await branchId(trx, auth.tenantId, input.branchCode);
        patch.branch_id = branch;
      }
      if (input.typeCode !== undefined) { await assertType(trx, auth.tenantId, input.typeCode); patch.type_code = input.typeCode; }
      const promo = input.typeCode !== undefined ? input.typeCode === 'KKM' : input.isPromo ?? cur.is_promo;
      if (promo) await assertOnePromo(trx, auth.tenantId, branch, code);
      for (const [k, col] of [['name', 'name'], ['address', 'address'], ['isActive', 'is_active'], ['isDefault', 'is_default'], ['account', 'account'], ['note', 'note'], ['taxId', 'tax_id']] as const) {
        if (input[k] !== undefined) patch[col] = input[k];
      }
      if (input.typeCode === undefined && input.isPromo !== undefined) patch.is_promo = input.isPromo; // nơi gửi cũ: trigger suy ra loại
      await setVersionContext(trx, auth.actorName || auth.actor, input.taxValidFrom); // phiên bản MST kho (0121)
      await trx.updateTable('warehouses').set(patch).where('tenant_id', '=', auth.tenantId).where('code', '=', code).execute();
      await writeAudit(trx, { tenantId: auth.tenantId, actor: auth.actor, action: 'warehouse.update', objectType: 'warehouse', objectId: code, before, after: input });
      return dto(await select(trx, auth.tenantId).where('w.code', '=', code).executeTakeFirstOrThrow());
    });
  },

  async remove(auth: AuthContext, code: string): Promise<{ code: string }> {
    return db.transaction().execute((trx) => warehouseService.removeIn(trx, auth, code));
  },

  // [2026-11-03 04:00 AM Johnny Chu - Chu Hoàng Anh] PHASE-014 — W6 đợt 3 (SC-ACT-1): bản *In chạy trong giao dịch của action (defineAction); bản cũ giữ chữ ký, tự mở giao dịch
  async removeIn(trx: ActionTx, auth: AuthContext, code: string): Promise<{ code: string }> {
    return sameTx(trx, async (trx) => {
      const before = await select(trx, auth.tenantId).where('w.code', '=', code).executeTakeFirst();
      if (!before) throw Errors.notFound(`kho ${code}`);
      if (await usedBy(trx, auth.tenantId, code)) throw Errors.conflict(`Kho ${code} đã có dòng nhập xuất: bỏ tích "Theo dõi" để ngừng dùng`);
      await trx.deleteFrom('warehouses').where('tenant_id', '=', auth.tenantId).where('code', '=', code).execute();
      await writeAudit(trx, { tenantId: auth.tenantId, actor: auth.actor, action: 'warehouse.delete', objectType: 'warehouse', objectId: code, before });
      return { code };
    });
  },
};

/** Lọc dòng nhập xuất theo kho: mã kho đã chọn, cộng dòng không ghi mã kho của chi nhánh có kho mặc định nằm trong số đã chọn. */
export async function warehouseScope(tenantId: string, codes?: string[]): Promise<{ codes: string[]; defaultBranchIds: string[] } | null> {
  if (!codes?.length) return null;
  const rows = await db.selectFrom('warehouses').select(['branch_id']).where('tenant_id', '=', tenantId).where('code', 'in', codes).where('is_default', '=', true).execute();
  return { codes, defaultBranchIds: [...new Set(rows.map((r) => r.branch_id))] };
}

const codesParam = z.string().optional().transform((v) => (v ? v.split(',').map((x) => x.trim()).filter(Boolean) : undefined));

export async function warehouseRoutes(app: FastifyInstance): Promise<void> {
  const r = app.withTypeProvider<ZodTypeProvider>();

  r.get('/api/v1/warehouses/:code/tax-history', {
    preHandler: requirePermission('catalog:read'),
    schema: { tags: ['Kho'], summary: 'Lịch sử phiên bản MST của kho', params: z.object({ code: z.string() }) },
    handler: async (req) => ok(await warehouseTaxHistory(authOf(req).tenantId, req.params.code)),
  });

  r.get('/api/v1/warehouses', {
    preHandler: requirePermission('catalog:read'),
    schema: { tags, summary: 'Danh sách kho (lọc theo chi nhánh)', querystring: z.object({ branchCodes: codesParam }) },
    handler: async (req) => ok(await warehouseService.list(authOf(req), req.query.branchCodes)),
  });
  mountActions(app, warehouseWriteActions);
}

// [2026-11-03 04:00 AM Johnny Chu - Chu Hoàng Anh] PHASE-014 — W6 đợt 3 (SC-ACT-1): route ghi qua defineAction — quyền, kiểm input, idempotency, giao dịch, bằng chứng do runtime; đường dẫn / thân yêu cầu / mã 201 như cũ.
// Mã cũ trong handler chạy trong giao dịch của action (sameTx); service tự mở giao dịch có bản *In.
const anyOut = z.custom<object>((v) => typeof v === 'object' && v !== null);

export const warehouseWriteActions: AnyActionDef[] = [
  defineAction({
    id: 'core.warehouse.create', title: 'Thêm kho', tags,
    permission: 'catalog:write', effect: 'write', sideEffects: ['masterdata'], idempotency: 'natural',
    input: bodySchema, output: anyOut,
    expose: { http: { method: 'POST', path: '/api/v1/warehouses', status: 201 }, mcp: false, ai: 'deny' },
    evidence: { objectType: 'warehouse' },
    handler: (ctx, input) => warehouseService.createIn(ctx.data.tx, ctx.legacyAuth, input),
  }),
  defineAction({
    id: 'core.warehouse.update', title: 'Sửa kho', tags,
    permission: 'catalog:write', effect: 'write', sideEffects: ['masterdata'], idempotency: 'natural',
    input: (patchSchema).merge(z.object({ code: z.string() })), output: anyOut,
    expose: { http: { method: 'PATCH', path: '/api/v1/warehouses/:code' }, mcp: false, ai: 'deny' },
    evidence: { objectType: 'warehouse', objectId: (i) => String(i.code) },
    handler: (ctx, input) => {
      const { code, ...reqBody } = input;
      return warehouseService.updateIn(ctx.data.tx, ctx.legacyAuth, code, reqBody);
    },
  }),
  defineAction({
    id: 'core.warehouse.delete', title: 'Xoá kho chưa có dòng nhập xuất', tags,
    permission: 'catalog:write', effect: 'write', sideEffects: ['masterdata'], idempotency: 'natural',
    input: z.object({ code: z.string() }), output: anyOut,
    expose: { http: { method: 'DELETE', path: '/api/v1/warehouses/:code' }, mcp: false, ai: 'deny' },
    evidence: { objectType: 'warehouse', objectId: (i) => String(i.code) },
    handler: (ctx, input) => warehouseService.removeIn(ctx.data.tx, ctx.legacyAuth, input.code),
  }),
];
