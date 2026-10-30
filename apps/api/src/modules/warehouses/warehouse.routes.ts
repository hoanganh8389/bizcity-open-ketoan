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
import { authOf, requirePermission, type AuthContext } from '../../core/auth.js';
import { ok } from '../../core/http.js';
import { Errors } from '../../core/errors.js';
import { writeAudit } from '../../core/audit.js';
import { db, type Db } from '../../db/client.js';

const tags = ['Danh mục: Kho'];

const bodySchema = z.object({
  code: z.string().trim().min(1, 'Chưa nhập mã kho').max(12, 'Mã kho tối đa 12 ký tự'),
  branchCode: z.string().trim().min(1, 'Chưa chọn chi nhánh').max(32),
  name: z.string().trim().min(1, 'Chưa nhập tên kho').max(50, 'Tên kho tối đa 50 ký tự'),
  address: z.string().trim().max(500).default(''),
  isActive: z.boolean().default(true),
  isDefault: z.boolean().default(false),
  isPromo: z.boolean().default(false),
  account: z.string().trim().max(32).default(''),
  note: z.string().trim().max(500).default(''),
});
const patchSchema = bodySchema.omit({ code: true }).partial();
type Body = z.infer<typeof bodySchema>;

export interface WarehouseDto { code: string; branchCode: string; branchName: string; name: string; address: string; isActive: boolean; isDefault: boolean; isPromo: boolean; account: string; note: string }

const select = (trx: Db, tenantId: string) => trx.selectFrom('warehouses as w').innerJoin('branches as b', 'b.id', 'w.branch_id')
  .select(['w.code', 'b.code as branch_code', 'b.name as branch_name', 'w.name', 'w.address', 'w.is_active', 'w.is_default', 'w.is_promo', 'w.account', 'w.note'])
  .where('w.tenant_id', '=', tenantId);
type Row = Awaited<ReturnType<ReturnType<typeof select>['executeTakeFirstOrThrow']>>;
const dto = (r: Row): WarehouseDto => ({
  code: r.code, branchCode: r.branch_code, branchName: r.branch_name, name: r.name, address: r.address,
  isActive: r.is_active, isDefault: r.is_default, isPromo: r.is_promo, account: r.account, note: r.note,
});

async function branchId(trx: Db, tenantId: string, code: string): Promise<string> {
  const b = await trx.selectFrom('branches').select('id').where('tenant_id', '=', tenantId).where('code', '=', code).executeTakeFirst();
  if (!b) throw Errors.validation(`Chi nhánh ${code} không có trong danh mục chi nhánh`);
  return b.id;
}

/** Mỗi chi nhánh tối đa một kho khuyến mại. */
async function assertOnePromo(trx: Db, tenantId: string, branch: string, code: string) {
  const other = await trx.selectFrom('warehouses').select('code').where('tenant_id', '=', tenantId).where('branch_id', '=', branch)
    .where('is_promo', '=', true).where('code', '<>', code).executeTakeFirst();
  if (other) throw Errors.conflict(`Chi nhánh đã có kho khuyến mại ${other.code} — mỗi chi nhánh chỉ một kho khuyến mại`);
}

const usedBy = (trx: Db, tenantId: string, code: string) =>
  trx.selectFrom('inventory_movements').select('id').where('tenant_id', '=', tenantId).where('warehouse_code', '=', code).limit(1).executeTakeFirst();

export const warehouseService = {
  async list(auth: AuthContext, branchCodes?: string[]): Promise<WarehouseDto[]> {
    let q = select(db, auth.tenantId);
    if (branchCodes?.length) q = q.where('b.code', 'in', branchCodes);
    return (await q.orderBy('b.code').orderBy('w.code').execute()).map(dto);
  },

  async create(auth: AuthContext, input: Body): Promise<WarehouseDto> {
    return db.transaction().execute(async (trx) => {
      const exists = await trx.selectFrom('warehouses').select('id').where('tenant_id', '=', auth.tenantId).where('code', '=', input.code).executeTakeFirst();
      if (exists) throw Errors.conflict(`Mã kho ${input.code} đã có`);
      const branch = await branchId(trx, auth.tenantId, input.branchCode);
      if (input.isPromo) await assertOnePromo(trx, auth.tenantId, branch, input.code);
      await trx.insertInto('warehouses').values({
        tenant_id: auth.tenantId, code: input.code, branch_id: branch, name: input.name, address: input.address,
        is_active: input.isActive, is_default: input.isDefault, is_promo: input.isPromo, account: input.account, note: input.note,
      }).execute();
      await writeAudit(trx, { tenantId: auth.tenantId, actor: auth.actor, action: 'warehouse.create', objectType: 'warehouse', objectId: input.code, after: input });
      return dto(await select(trx, auth.tenantId).where('w.code', '=', input.code).executeTakeFirstOrThrow());
    });
  },

  async update(auth: AuthContext, code: string, input: z.infer<typeof patchSchema>): Promise<WarehouseDto> {
    return db.transaction().execute(async (trx) => {
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
      if (input.isPromo ?? cur.is_promo) await assertOnePromo(trx, auth.tenantId, branch, code);
      for (const [k, col] of [['name', 'name'], ['address', 'address'], ['isActive', 'is_active'], ['isDefault', 'is_default'], ['isPromo', 'is_promo'], ['account', 'account'], ['note', 'note']] as const) {
        if (input[k] !== undefined) patch[col] = input[k];
      }
      await trx.updateTable('warehouses').set(patch).where('tenant_id', '=', auth.tenantId).where('code', '=', code).execute();
      await writeAudit(trx, { tenantId: auth.tenantId, actor: auth.actor, action: 'warehouse.update', objectType: 'warehouse', objectId: code, before, after: input });
      return dto(await select(trx, auth.tenantId).where('w.code', '=', code).executeTakeFirstOrThrow());
    });
  },

  async remove(auth: AuthContext, code: string): Promise<{ code: string }> {
    return db.transaction().execute(async (trx) => {
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

  r.get('/api/v1/warehouses', {
    preHandler: requirePermission('catalog:read'),
    schema: { tags, summary: 'Danh sách kho (lọc theo chi nhánh)', querystring: z.object({ branchCodes: codesParam }) },
    handler: async (req) => ok(await warehouseService.list(authOf(req), req.query.branchCodes)),
  });
  r.post('/api/v1/warehouses', {
    preHandler: requirePermission('catalog:write'),
    schema: { tags, summary: 'Thêm kho', body: bodySchema },
    handler: async (req, reply) => reply.status(201).send(ok(await warehouseService.create(authOf(req), req.body))),
  });
  r.patch('/api/v1/warehouses/:code', {
    preHandler: requirePermission('catalog:write'),
    schema: { tags, summary: 'Sửa kho', params: z.object({ code: z.string() }), body: patchSchema },
    handler: async (req) => ok(await warehouseService.update(authOf(req), req.params.code, req.body)),
  });
  r.delete('/api/v1/warehouses/:code', {
    preHandler: requirePermission('catalog:write'),
    schema: { tags, summary: 'Xoá kho chưa có dòng nhập xuất', params: z.object({ code: z.string() }) },
    handler: async (req) => ok(await warehouseService.remove(authOf(req), req.params.code)),
  });
}
