// @bizcity-layer M data/masterdata
// [2026-11-13 Nguyễn Văn Thủy] Loại kho + nghiệp vụ dùng loại kho nào theo thứ tự ưu tiên (0128) (đóng góp)
/**
 * LOẠI KHO
 *   GET  /api/v1/warehouse-types                    loại kho (kèm số kho) + nghiệp vụ → loại kho ưu tiên
 *   PUT  /api/v1/warehouse-types/:code              thêm / sửa loại (luật: không sở hữu thì không được bán; loại gốc không đổi mã;
 *                                                   ngừng dùng chỉ khi không còn kho đang theo dõi)
 *   PUT  /api/v1/warehouse-types/ops/:op            danh sách loại kho của nghiệp vụ (thứ tự = ưu tiên, ít nhất một loại)
 *   GET  /api/v1/warehouses/pick?branchCode=&op=    kho tự chọn cho màn hình: kho đang dùng của chi nhánh thuộc loại ưu tiên nhất
 *                                                   (cùng loại thì kho mặc định trước)
 *   POST /api/v1/warehouses/quick                   tạo nhanh bộ kho cho chi nhánh theo các loại chọn (mã gợi ý 5 số đầu + loại)
 *   THÙNG RÁC (0133): DELETE /api/v1/warehouse-types/:code → vào thùng rác (vẫn trong CSDL, ngừng dùng, bỏ khỏi nghiệp vụ);
 *     GET /api/v1/warehouse-types/trash; POST /api/v1/warehouse-types/:code/restore khôi phục;
 *     DELETE /api/v1/warehouse-types/:code/permanent xoá vĩnh viễn (nhật ký ghi đủ nội dung). Chứng từ đã ghi giữ nguyên.
 * checkWarehouseFor(): luật dùng chung cho các phân hệ — kho có thuộc loại được dùng cho nghiệp vụ không.
 */
import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { db, type Db } from '../../db/client.js';
import { authOf, requirePermission } from '../../core/auth.js';
import { ok } from '../../core/http.js';
import { Errors } from '../../core/errors.js';
import { writeAudit } from '../../core/audit.js';
import { defineAction, mountActions, type AnyActionDef } from '../../core/actions.js';

const tags = ['Danh mục: Kho'];

/** Nghiệp vụ dùng kho (màn hình nào hỏi kho). Thêm nghiệp vụ mới: thêm một dòng ở đây; loại kho của nó khai trên giao diện. */
export const WAREHOUSE_OPS: { op: string; label: string; area: string }[] = [
  { op: 'purchase_in', label: 'Nhập mua hàng', area: 'Mua hàng' },
  { op: 'purchase_return_out', label: 'Trả hàng nhà cung cấp', area: 'Mua hàng' },
  { op: 'gift_in', label: 'Nhận quà, hàng khuyến mại', area: 'Mua hàng' },
  { op: 'gift_out', label: 'Xuất quà tặng', area: 'Mua hàng' },
  { op: 'sale_out', label: 'Bán hàng (cả máy bán hàng)', area: 'Bán hàng' },
  { op: 'sale_return_in', label: 'Khách trả hàng', area: 'Bán hàng' },
  { op: 'consignment_out', label: 'Gửi bán đại lý', area: 'Bán hàng' },
  { op: 'transfer', label: 'Chuyển kho', area: 'Kho' },
  { op: 'stock_in_other', label: 'Nhập kho khác', area: 'Kho' },
  { op: 'stock_out_other', label: 'Xuất kho khác, tiêu huỷ', area: 'Kho' },
];

export interface WarehouseTypeDto { code: string; name: string; purpose: string; canSell: boolean; owned: boolean; trackExpiry: boolean; accountPrefix: string; isSystem: boolean; isActive: boolean; sortOrder: number; warehouses: number; activeWarehouses: number }

export async function listWarehouseTypes(trx: Db, tenantId: string) {
  const rows = await trx.selectFrom('warehouse_types as t')
    .select(['t.code', 't.name', 't.purpose', 't.can_sell', 't.owned', 't.track_expiry', 't.account_prefix', 't.is_system', 't.is_active', 't.sort_order',
      (eb) => eb.selectFrom('warehouses as w').whereRef('w.tenant_id', '=', 't.tenant_id').whereRef('w.type_code', '=', 't.code').select((e) => e.fn.countAll<string>().as('n')).as('n'),
      (eb) => eb.selectFrom('warehouses as w').whereRef('w.tenant_id', '=', 't.tenant_id').whereRef('w.type_code', '=', 't.code').where('w.is_active', '=', true).select((e) => e.fn.countAll<string>().as('n')).as('na')])
    .where('t.tenant_id', '=', tenantId).where('t.deleted_at', 'is', null).orderBy('t.sort_order').orderBy('t.code').execute();
  const types: WarehouseTypeDto[] = rows.map((r) => ({
    code: r.code, name: r.name, purpose: r.purpose, canSell: r.can_sell, owned: r.owned, trackExpiry: r.track_expiry, accountPrefix: r.account_prefix,
    isSystem: r.is_system, isActive: r.is_active, sortOrder: r.sort_order, warehouses: Number(r.n ?? 0), activeWarehouses: Number(r.na ?? 0),
  }));
  const ops = new Map((await trx.selectFrom('warehouse_type_ops').select(['op', 'type_codes']).where('tenant_id', '=', tenantId).execute()).map((o) => [o.op, o.type_codes]));
  return { types, ops: WAREHOUSE_OPS.map((o) => ({ ...o, typeCodes: ops.get(o.op) ?? [] })) };
}

/** Loại kho được dùng cho nghiệp vụ (thứ tự ưu tiên); nghiệp vụ chưa khai = mọi loại đang dùng. */
async function typesFor(trx: Db, tenantId: string, op: string): Promise<string[] | null> {
  const r = await trx.selectFrom('warehouse_type_ops').select('type_codes').where('tenant_id', '=', tenantId).where('op', '=', op).executeTakeFirst();
  return r?.type_codes.length ? r.type_codes : null;
}

/** Luật dùng chung: kho có dùng được cho nghiệp vụ không. Trả câu lỗi (rỗng = được). */
export async function checkWarehouseFor(trx: Db, tenantId: string, warehouseCode: string, op: string): Promise<string> {
  const w = await trx.selectFrom('warehouses').select(['type_code', 'is_active']).where('tenant_id', '=', tenantId).where('code', '=', warehouseCode).executeTakeFirst();
  if (!w) return '';
  const allowed = await typesFor(trx, tenantId, op);
  if (allowed && !allowed.includes(w.type_code)) {
    const label = WAREHOUSE_OPS.find((o) => o.op === op)?.label ?? op;
    return `Kho ${warehouseCode} thuộc loại ${w.type_code} — nghiệp vụ "${label}" chỉ dùng kho loại ${allowed.join(', ')} (khai ở Danh mục → Loại kho)`;
  }
  return '';
}

/** Kho tự chọn cho màn hình: kho đang dùng của chi nhánh thuộc loại ưu tiên nhất; cùng loại thì kho mặc định trước. */
export async function pickWarehouse(trx: Db, tenantId: string, branchCode: string, op: string): Promise<{ code: string; typeCode: string } | null> {
  const ws = await trx.selectFrom('warehouses as w').innerJoin('branches as b', 'b.id', 'w.branch_id')
    .select(['w.code', 'w.type_code', 'w.is_default']).where('w.tenant_id', '=', tenantId).where('b.code', '=', branchCode).where('w.is_active', '=', true).execute();
  const allowed = await typesFor(trx, tenantId, op);
  const rank = (t: string) => (allowed ? allowed.indexOf(t) : 0);
  const best = ws.filter((w) => rank(w.type_code) >= 0).sort((a, b) => rank(a.type_code) - rank(b.type_code) || Number(b.is_default) - Number(a.is_default) || a.code.localeCompare(b.code))[0];
  return best ? { code: best.code, typeCode: best.type_code } : null;
}

const typeInput = z.object({
  code: z.string().trim().toUpperCase().regex(/^[A-Z][A-Z0-9_]{1,11}$/, 'Mã loại kho: chữ in hoa / số, 2–12 ký tự, bắt đầu bằng chữ'),
  name: z.string().trim().min(1, 'Chưa nhập tên loại kho').max(80),
  purpose: z.string().trim().max(300).default(''),
  canSell: z.boolean().default(false),
  owned: z.boolean().default(true),
  trackExpiry: z.boolean().default(false),
  accountPrefix: z.string().trim().regex(/^[0-9]{0,12}$/, 'Đầu số TK kho chỉ gồm số').default(''),
  isActive: z.boolean().default(true),
});

async function saveType(trx: Db, tenantId: string, actor: string, i: z.infer<typeof typeInput>) {
  if (i.canSell && !i.owned) throw Errors.validation('Hàng không thuộc sở hữu (nhận giữ hộ) thì không được bán — bỏ tích "Được bán" hoặc tích "Thuộc sở hữu"');
  if (i.accountPrefix) {
    const a = await trx.selectFrom('accounts').select('code').where('tenant_id', '=', tenantId).where('code', 'like', `${i.accountPrefix}%`).executeTakeFirst();
    if (!a) throw Errors.validation(`Không có tài khoản nào bắt đầu bằng ${i.accountPrefix} trong hệ thống tài khoản`);
  }
  if (!i.owned && i.accountPrefix) throw Errors.validation('Hàng không thuộc sở hữu không ghi sổ kho — để trống đầu số TK kho');
  const cur = await trx.selectFrom('warehouse_types').select(['id', 'is_active', 'deleted_at']).where('tenant_id', '=', tenantId).where('code', '=', i.code).executeTakeFirst();
  if (cur?.deleted_at) throw Errors.conflict(`Mã ${i.code} đang nằm trong Thùng rác — vào Thùng rác bấm Khôi phục, hoặc dùng mã khác`);
  if (cur && cur.is_active && !i.isActive) {
    const used = await trx.selectFrom('warehouses').select('code').where('tenant_id', '=', tenantId).where('type_code', '=', i.code).where('is_active', '=', true).executeTakeFirst();
    if (used) throw Errors.conflict(`Còn kho ${used.code} đang theo dõi thuộc loại ${i.code} — đổi loại hoặc ngừng theo dõi kho đó trước`);
  }
  const values = { name: i.name, purpose: i.purpose, can_sell: i.canSell, owned: i.owned, track_expiry: i.trackExpiry, account_prefix: i.accountPrefix, is_active: i.isActive, updated_by: actor, updated_at: new Date() };
  if (cur) await trx.updateTable('warehouse_types').set(values).where('id', '=', cur.id).execute();
  else {
    const max = await trx.selectFrom('warehouse_types').select((e) => e.fn.max('sort_order').as('m')).where('tenant_id', '=', tenantId).executeTakeFirst();
    await trx.insertInto('warehouse_types').values({ tenant_id: tenantId, code: i.code, ...values, sort_order: Number(max?.m ?? 0) + 1 }).execute();
  }
  await writeAudit(trx, { tenantId, actor, action: cur ? 'warehouse_type.update' : 'warehouse_type.create', objectType: 'warehouse_type', objectId: i.code, after: i });
  return (await listWarehouseTypes(trx, tenantId)).types.find((t) => t.code === i.code);
}

// [2026-11-13 Nguyễn Văn Thủy] thùng rác loại kho (0133) (đóng góp)
export async function listTrash(trx: Db, tenantId: string) {
  const rows = await trx.selectFrom('warehouse_types').select(['code', 'name', 'purpose', 'account_prefix', 'is_system', 'deleted_at', 'deleted_by'])
    .where('tenant_id', '=', tenantId).where('deleted_at', 'is not', null).orderBy('deleted_at', 'desc').execute();
  return rows.map((r) => ({ code: r.code, name: r.name, purpose: r.purpose, accountPrefix: r.account_prefix, isSystem: r.is_system, deletedAt: r.deleted_at ? new Date(r.deleted_at).toISOString() : null, deletedBy: r.deleted_by }));
}

async function trashType(trx: Db, tenantId: string, actor: string, code: string) {
  const cur = await trx.selectFrom('warehouse_types').selectAll().where('tenant_id', '=', tenantId).where('code', '=', code).where('deleted_at', 'is', null).executeTakeFirst();
  if (!cur) throw Errors.notFound(`loại kho ${code}`);
  const used = await trx.selectFrom('warehouses').select('code').where('tenant_id', '=', tenantId).where('type_code', '=', code).where('is_active', '=', true).executeTakeFirst();
  if (used) throw Errors.conflict(`Kho ${used.code} đang thuộc loại ${code} — đổi loại của kho đó (Cơ cấu tổ chức) rồi mới xoá được`);
  await trx.updateTable('warehouse_types').set({ deleted_at: new Date(), deleted_by: actor, is_active: false, updated_by: actor, updated_at: new Date() }).where('id', '=', cur.id).execute();
  // Bỏ khỏi danh sách loại kho của các nghiệp vụ.
  const ops = await trx.selectFrom('warehouse_type_ops').select(['op', 'type_codes']).where('tenant_id', '=', tenantId).execute();
  for (const o of ops.filter((x) => x.type_codes.includes(code))) {
    await trx.updateTable('warehouse_type_ops').set({ type_codes: o.type_codes.filter((c) => c !== code), updated_by: actor, updated_at: new Date() }).where('tenant_id', '=', tenantId).where('op', '=', o.op).execute();
  }
  await writeAudit(trx, { tenantId, actor, action: 'warehouse_type.trash', objectType: 'warehouse_type', objectId: code, before: cur });
  return { code };
}

async function restoreType(trx: Db, tenantId: string, actor: string, code: string) {
  const cur = await trx.selectFrom('warehouse_types').select('id').where('tenant_id', '=', tenantId).where('code', '=', code).where('deleted_at', 'is not', null).executeTakeFirst();
  if (!cur) throw Errors.notFound(`loại kho ${code} trong thùng rác`);
  await trx.updateTable('warehouse_types').set({ deleted_at: null, deleted_by: '', is_active: true, updated_by: actor, updated_at: new Date() }).where('id', '=', cur.id).execute();
  await writeAudit(trx, { tenantId, actor, action: 'warehouse_type.restore', objectType: 'warehouse_type', objectId: code });
  return { code };
}

async function purgeType(trx: Db, tenantId: string, actor: string, code: string) {
  const cur = await trx.selectFrom('warehouse_types').selectAll().where('tenant_id', '=', tenantId).where('code', '=', code).where('deleted_at', 'is not', null).executeTakeFirst();
  if (!cur) throw Errors.notFound(`loại kho ${code} trong thùng rác`);
  const used = await trx.selectFrom('warehouses').select('code').where('tenant_id', '=', tenantId).where('type_code', '=', code).executeTakeFirst();
  if (used) throw Errors.conflict(`Kho ${used.code} (kể cả kho đã ngừng) còn ghi loại ${code} — đổi loại của kho đó rồi mới xoá vĩnh viễn được; hoặc để trong thùng rác`);
  await trx.deleteFrom('warehouse_types').where('id', '=', cur.id).execute();
  await writeAudit(trx, { tenantId, actor, action: 'warehouse_type.purge', objectType: 'warehouse_type', objectId: code, before: cur });
  return { code };
}

async function saveOp(trx: Db, tenantId: string, actor: string, op: string, typeCodes: string[]) {
  if (!WAREHOUSE_OPS.some((o) => o.op === op)) throw Errors.notFound(`nghiệp vụ ${op}`);
  const codes = [...new Set(typeCodes)];
  if (!codes.length) throw Errors.validation('Nghiệp vụ phải dùng ít nhất một loại kho');
  if (codes.length > 40) throw Errors.validation('Tối đa 40 loại kho cho một nghiệp vụ');
  const types = new Map((await trx.selectFrom('warehouse_types').select(['code', 'is_active', 'owned']).where('tenant_id', '=', tenantId).execute()).map((t) => [t.code, t]));
  const bad = codes.filter((c) => !types.get(c)?.is_active);
  if (bad.length) throw Errors.validation(`Loại kho chưa có hoặc đã ngừng dùng: ${bad.join(', ')}`);
  if (['sale_out', 'purchase_in'].includes(op) && !types.get(codes[0]!)?.owned) throw Errors.validation('Loại kho ưu tiên của nhập mua / bán hàng phải là hàng thuộc sở hữu');
  await trx.insertInto('warehouse_type_ops').values({ tenant_id: tenantId, op, type_codes: codes, updated_by: actor })
    .onConflict((oc) => oc.columns(['tenant_id', 'op']).doUpdateSet({ type_codes: codes, updated_by: actor, updated_at: new Date() })).execute();
  await writeAudit(trx, { tenantId, actor, action: 'warehouse_type_op.update', objectType: 'warehouse_type_op', objectId: op, after: { typeCodes: codes } });
  return { op, typeCodes: codes };
}

async function quickCreate(trx: Db, tenantId: string, actor: string, branchCode: string, typeCodes: string[]) {
  const b = await trx.selectFrom('branches').select(['id', 'name']).where('tenant_id', '=', tenantId).where('code', '=', branchCode).executeTakeFirst();
  if (!b) throw Errors.validation(`Chi nhánh ${branchCode} không có trong danh mục chi nhánh`);
  const types = await trx.selectFrom('warehouse_types').select(['code', 'name', 'is_active']).where('tenant_id', '=', tenantId).where('code', 'in', typeCodes.length ? typeCodes : ['-']).orderBy('sort_order').execute();
  const have = await trx.selectFrom('warehouses').select(['code', 'type_code']).where('tenant_id', '=', tenantId).where('branch_id', '=', b.id).execute();
  const base = branchCode.replace(/[^0-9A-Za-z]/g, '').slice(0, 5) || branchCode.slice(0, 5);
  const created: string[] = [], skipped: string[] = [];
  for (const t of types) {
    if (!t.is_active) { skipped.push(`${t.code} (loại đã ngừng dùng)`); continue; }
    if (have.some((w) => w.type_code === t.code)) { skipped.push(`${t.code} (chi nhánh đã có kho loại này)`); continue; }
    let code = `${base}-${t.code}`.slice(0, 12);
    for (let n = 2; await trx.selectFrom('warehouses').select('id').where('tenant_id', '=', tenantId).where('code', '=', code).executeTakeFirst(); n++) code = `${base}-${t.code}`.slice(0, 10) + String(n);
    await trx.insertInto('warehouses').values({ tenant_id: tenantId, code, branch_id: b.id, name: `${t.name} - ${b.name}`.slice(0, 50), type_code: t.code, is_promo: t.code === 'KKM' }).execute();
    created.push(code);
  }
  await writeAudit(trx, { tenantId, actor, action: 'warehouse.quick_create', objectType: 'branch', objectId: branchCode, after: { created, skipped } });
  return { created, skipped };
}

export async function warehouseTypeRoutes(app: FastifyInstance): Promise<void> {
  const r = app.withTypeProvider<ZodTypeProvider>();
  r.get('/api/v1/warehouse-types', {
    preHandler: requirePermission('catalog:read'),
    schema: { tags, summary: 'Loại kho và nghiệp vụ dùng loại kho nào' },
    handler: async (req) => ok(await listWarehouseTypes(db, authOf(req).tenantId)),
  });
  r.get('/api/v1/warehouse-types/trash', {
    preHandler: requirePermission('catalog:read'),
    schema: { tags, summary: 'Thùng rác loại kho (đã xoá, chưa xoá vĩnh viễn)' },
    handler: async (req) => ok(await listTrash(db, authOf(req).tenantId)),
  });
  r.get('/api/v1/warehouses/pick', {
    preHandler: requirePermission('catalog:read'),
    schema: { tags, summary: 'Kho tự chọn theo chi nhánh và nghiệp vụ', querystring: z.object({ branchCode: z.string().min(1), op: z.string().min(1) }) },
    handler: async (req) => ok(await pickWarehouse(db, authOf(req).tenantId, req.query.branchCode, req.query.op)),
  });
  mountActions(app, actions);
}

const actions: AnyActionDef[] = [
  defineAction({
    id: 'core.warehouse-type.trash', title: 'Xoá loại kho (chuyển vào thùng rác, vẫn lưu trong CSDL)', tags,
    permission: 'catalog:write', effect: 'write', sideEffects: ['masterdata'], idempotency: 'natural',
    input: z.object({ code: z.string().trim().min(1).max(12) }), output: z.any(),
    expose: { http: { method: 'DELETE', path: '/api/v1/warehouse-types/:code' }, mcp: false, ai: 'deny' },
    evidence: { objectType: 'warehouse_type', objectId: (i) => i.code },
    handler: (ctx, i) => trashType(ctx.data.tx, ctx.tenant.id, ctx.legacyAuth.actorName || ctx.legacyAuth.actor, i.code),
  }),
  defineAction({
    id: 'core.warehouse-type.restore', title: 'Khôi phục loại kho từ thùng rác', tags,
    permission: 'catalog:write', effect: 'write', sideEffects: ['masterdata'], idempotency: 'natural',
    input: z.object({ code: z.string().trim().min(1).max(12) }), output: z.any(),
    expose: { http: { method: 'POST', path: '/api/v1/warehouse-types/:code/restore' }, mcp: false, ai: 'deny' },
    evidence: { objectType: 'warehouse_type', objectId: (i) => i.code },
    handler: (ctx, i) => restoreType(ctx.data.tx, ctx.tenant.id, ctx.legacyAuth.actorName || ctx.legacyAuth.actor, i.code),
  }),
  defineAction({
    id: 'core.warehouse-type.purge', title: 'Xoá vĩnh viễn loại kho trong thùng rác (nhật ký ghi đủ nội dung)', tags,
    permission: 'settings:write', effect: 'write', sideEffects: ['masterdata'], idempotency: 'natural',
    input: z.object({ code: z.string().trim().min(1).max(12) }), output: z.any(),
    expose: { http: { method: 'DELETE', path: '/api/v1/warehouse-types/:code/permanent' }, mcp: false, ai: 'deny' },
    evidence: { objectType: 'warehouse_type', objectId: (i) => i.code },
    handler: (ctx, i) => purgeType(ctx.data.tx, ctx.tenant.id, ctx.legacyAuth.actorName || ctx.legacyAuth.actor, i.code),
  }),
  defineAction({
    id: 'core.warehouse-type.save', title: 'Thêm / sửa loại kho', tags,
    permission: 'catalog:write', effect: 'write', sideEffects: ['masterdata'], idempotency: 'natural',
    input: typeInput, output: z.any(),
    expose: { http: { method: 'PUT', path: '/api/v1/warehouse-types/:code' }, mcp: false, ai: 'deny' },
    evidence: { objectType: 'warehouse_type', objectId: (i) => i.code },
    handler: (ctx, i) => saveType(ctx.data.tx, ctx.tenant.id, ctx.legacyAuth.actorName || ctx.legacyAuth.actor, i),
  }),
  defineAction({
    id: 'core.warehouse-type-op.save', title: 'Loại kho dùng cho một nghiệp vụ (thứ tự ưu tiên)', tags,
    permission: 'catalog:write', effect: 'write', sideEffects: ['masterdata'], idempotency: 'natural',
    input: z.object({ op: z.string().min(1).max(40), typeCodes: z.array(z.string().trim().max(12)).max(40) }), output: z.any(),
    expose: { http: { method: 'PUT', path: '/api/v1/warehouse-types/ops/:op' }, mcp: false, ai: 'deny' },
    evidence: { objectType: 'warehouse_type_op', objectId: (i) => i.op },
    handler: (ctx, i) => saveOp(ctx.data.tx, ctx.tenant.id, ctx.legacyAuth.actorName || ctx.legacyAuth.actor, i.op, i.typeCodes),
  }),
  defineAction({
    id: 'core.warehouse.quick-create', title: 'Tạo nhanh bộ kho cho chi nhánh theo loại kho', tags,
    permission: 'catalog:write', effect: 'write', sideEffects: ['masterdata'], idempotency: 'natural',
    input: z.object({ branchCode: z.string().trim().min(1).max(32), typeCodes: z.array(z.string().trim().max(12)).min(1).max(40) }), output: z.any(),
    expose: { http: { method: 'POST', path: '/api/v1/warehouses/quick' }, mcp: false, ai: 'deny' },
    evidence: { objectType: 'branch', objectId: (i) => i.branchCode },
    handler: (ctx, i) => quickCreate(ctx.data.tx, ctx.tenant.id, ctx.legacyAuth.actorName || ctx.legacyAuth.actor, i.branchCode, i.typeCodes),
  }),
];
