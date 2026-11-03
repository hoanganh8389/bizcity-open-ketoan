// @bizcity-layer M data/masterdata
/**
 * Danh mục đơn vị tính (DM15) — bảng unit_names: TÊN ĐVT dùng chung (Hộp, Lốc, Lốc_4, Thùng…), không có tỉ lệ.
 *   GET    /api/v1/unit-names            danh sách + số mặt hàng đang dùng mỗi tên
 *   POST   /api/v1/unit-names            thêm tên
 *   PATCH  /api/v1/unit-names/:id        sửa (tên, ghi chú, đang dùng)
 *   DELETE /api/v1/unit-names/:id        xoá tên chưa mặt hàng nào dùng
 * Luật:
 *   - tên 1–32 ký tự (chữ, số, khoảng trắng, _ - . / ( ) + ×), không trùng (không phân biệt hoa thường);
 *   - tên đã có mặt hàng dùng: không đổi tên, không xoá (phiếu cũ ghi theo tên) — bỏ tích "Đang dùng" để ẩn khỏi gợi ý;
 *   - khai ĐVT mới ở mặt hàng → CSDL tự thêm vào danh mục (trigger, migration 0014), không cần vào đây.
 * Tỉ lệ quy đổi khai ở từng mặt hàng (product_units); mọi số lượng cuối cùng quy về ĐVT nhỏ nhất (tỉ lệ 1) để tính tồn kho.
 */
import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { sql } from 'kysely';
import { z } from 'zod';
import { authOf, requirePermission, type AuthContext } from '../../core/auth.js';
import { ok } from '../../core/http.js';
import { Errors } from '../../core/errors.js';
import { defineAction, mountActions, type AnyActionDef } from '../../core/actions.js';
import { writeAudit } from '../../core/audit.js';
import { db, type Db } from '../../db/client.js';

const tags = ['Danh mục: Đơn vị tính'];
const NAME_RE = /^[\p{L}\p{N} _.\-/()+×]+$/u;
const nameSchema = z.string().transform((s) => s.replace(/\s+/g, ' ').trim())
  .pipe(z.string().min(1, 'Chưa nhập tên đơn vị tính').max(32, 'Tên đơn vị tính tối đa 32 ký tự').regex(NAME_RE, 'Tên đơn vị tính chỉ gồm chữ, số, khoảng trắng và _ - . / ( ) + ×'));
const bodySchema = z.object({ name: nameSchema, note: z.string().trim().max(300).default(''), isActive: z.boolean().default(true) });
const patchSchema = z.object({ name: nameSchema.optional(), note: z.string().trim().max(300).optional(), isActive: z.boolean().optional() });

export interface UnitNameDto { id: string; name: string; note: string; source: 'seed' | 'auto' | 'manual'; isActive: boolean; products: number; createdBy: string; updatedBy: string; createdAt: string; updatedAt: string }

/** Số mặt hàng đang dùng từng tên (khoá = tên viết thường). */
async function usage(trx: Db, tenantId: string, name?: string): Promise<Map<string, number>> {
  let q = trx.selectFrom('product_units').select([sql<string>`lower(unit)`.as('k'), sql<string>`count(DISTINCT sku)`.as('n')]).where('tenant_id', '=', tenantId);
  if (name) q = q.where(sql`lower(unit)`, '=', name.toLowerCase());
  const rows = await q.groupBy(sql`lower(unit)`).execute();
  return new Map(rows.map((r) => [r.k, Number(r.n)]));
}
const iso = (v: unknown) => new Date(v as string).toISOString();
type Row = { id: string; name: string; note: string; source: string; is_active: boolean; created_by: string; updated_by: string; created_at: unknown; updated_at: unknown };
const dto = (r: Row, used: Map<string, number>): UnitNameDto => ({
  id: String(r.id), name: r.name, note: r.note, source: r.source as UnitNameDto['source'], isActive: r.is_active, products: used.get(r.name.toLowerCase()) ?? 0,
  createdBy: r.created_by, updatedBy: r.updated_by, createdAt: iso(r.created_at), updatedAt: iso(r.updated_at),
});
const one = (trx: Db, tenantId: string, id: string) => trx.selectFrom('unit_names').selectAll().where('tenant_id', '=', tenantId).where('id', '=', id).executeTakeFirst();
async function assertFree(trx: Db, tenantId: string, name: string, exceptId?: string) {
  let q = trx.selectFrom('unit_names').select(['id', 'name']).where('tenant_id', '=', tenantId).where(sql`lower(name)`, '=', name.toLowerCase());
  if (exceptId) q = q.where('id', '<>', exceptId);
  const dup = await q.executeTakeFirst();
  if (dup) throw Errors.conflict(`Đơn vị tính "${dup.name}" đã có trong danh mục`);
}

// [2026-11-03 04:10 PM Johnny Chu - Chu Hoàng Anh] PHASE-014 — W6 đợt 3 (SC-ACT-1): service tách bản *In chạy trong giao dịch của runtime action (audit=false: bằng chứng do runtime ghi), bản cũ giữ chữ ký cho nơi khác gọi
export const unitNameService = {
  async list(auth: AuthContext): Promise<UnitNameDto[]> {
    const [rows, used] = await Promise.all([db.selectFrom('unit_names').selectAll().where('tenant_id', '=', auth.tenantId).orderBy(sql`lower(name)`).execute(), usage(db, auth.tenantId)]);
    return rows.map((r) => dto(r as unknown as Row, used));
  },
  async createIn(trx: Db, auth: AuthContext, input: z.infer<typeof bodySchema>, audit = true): Promise<UnitNameDto> {
    await assertFree(trx, auth.tenantId, input.name);
    const r = await trx.insertInto('unit_names').values({ tenant_id: auth.tenantId, name: input.name, note: input.note, is_active: input.isActive, source: 'manual', created_by: auth.actorName, updated_by: auth.actorName })
      .returningAll().executeTakeFirstOrThrow();
    if (audit) await writeAudit(trx, { tenantId: auth.tenantId, actor: auth.actor, action: 'unit_name.create', objectType: 'unit_name', objectId: input.name, after: input });
    return dto(r as unknown as Row, await usage(trx, auth.tenantId, input.name));
  },
  async create(auth: AuthContext, input: z.infer<typeof bodySchema>): Promise<UnitNameDto> {
    return db.transaction().execute((trx) => unitNameService.createIn(trx, auth, input));
  },
  async updateIn(trx: Db, auth: AuthContext, id: string, input: z.infer<typeof patchSchema>, audit = true): Promise<UnitNameDto> {
    const before = await one(trx, auth.tenantId, id);
    if (!before) throw Errors.notFound(`đơn vị tính #${id}`);
    if (input.name !== undefined && input.name !== before.name) {
      await assertFree(trx, auth.tenantId, input.name, id);
      const n = (await usage(trx, auth.tenantId, before.name)).get(before.name.toLowerCase()) ?? 0;
      if (n) throw Errors.conflict(`"${before.name}" đang dùng ở ${n} mặt hàng — không đổi tên được (phiếu đã ghi theo tên này). Thêm tên mới rồi khai lại ở mặt hàng, hoặc bỏ tích "Đang dùng" để ẩn.`);
    }
    const patch: Record<string, unknown> = { updated_at: new Date(), updated_by: auth.actorName };
    if (input.name !== undefined) patch.name = input.name;
    if (input.note !== undefined) patch.note = input.note;
    if (input.isActive !== undefined) patch.is_active = input.isActive;
    const r = await trx.updateTable('unit_names').set(patch).where('tenant_id', '=', auth.tenantId).where('id', '=', id).returningAll().executeTakeFirstOrThrow();
    if (audit) await writeAudit(trx, { tenantId: auth.tenantId, actor: auth.actor, action: 'unit_name.update', objectType: 'unit_name', objectId: before.name, before, after: input });
    return dto(r as unknown as Row, await usage(trx, auth.tenantId, r.name));
  },
  async update(auth: AuthContext, id: string, input: z.infer<typeof patchSchema>): Promise<UnitNameDto> {
    return db.transaction().execute((trx) => unitNameService.updateIn(trx, auth, id, input));
  },
  async removeIn(trx: Db, auth: AuthContext, id: string, audit = true): Promise<{ id: string }> {
    const before = await one(trx, auth.tenantId, id);
    if (!before) throw Errors.notFound(`đơn vị tính #${id}`);
    const n = (await usage(trx, auth.tenantId, before.name)).get(before.name.toLowerCase()) ?? 0;
    if (n) throw Errors.conflict(`"${before.name}" đang dùng ở ${n} mặt hàng — không xoá được. Bỏ tích "Đang dùng" để ẩn khỏi gợi ý.`);
    await trx.deleteFrom('unit_names').where('tenant_id', '=', auth.tenantId).where('id', '=', id).execute();
    if (audit) await writeAudit(trx, { tenantId: auth.tenantId, actor: auth.actor, action: 'unit_name.delete', objectType: 'unit_name', objectId: before.name, before });
    return { id };
  },
  async remove(auth: AuthContext, id: string): Promise<{ id: string }> {
    return db.transaction().execute((trx) => unitNameService.removeIn(trx, auth, id));
  },
};

const idParam = z.object({ id: z.string().regex(/^[1-9][0-9]*$/, 'Mã không hợp lệ') });

// [2026-11-03 04:10 PM Johnny Chu - Chu Hoàng Anh] PHASE-014 — W6 đợt 3 (SC-ACT-1): ghi qua defineAction — quyền, kiểm input, giao dịch, bằng chứng do runtime; đường dẫn / mã 201 như cũ
const unitNameDto = z.object({ id: z.string(), name: z.string(), note: z.string(), source: z.enum(['seed', 'auto', 'manual']), isActive: z.boolean(), products: z.number(), createdBy: z.string(), updatedBy: z.string(), createdAt: z.string(), updatedAt: z.string() });

export const unitNameActions: AnyActionDef[] = [
  defineAction({
    id: 'core.unit-name.create', title: 'Thêm tên đơn vị tính', tags,
    permission: 'catalog:write', effect: 'write', sideEffects: ['masterdata'], idempotency: 'natural',
    input: bodySchema, output: unitNameDto,
    expose: { http: { method: 'POST', path: '/api/v1/unit-names', status: 201 }, mcp: false, ai: 'deny' },
    evidence: { objectType: 'unit_name', objectId: (_i, o) => o.id },
    handler: (ctx, b) => unitNameService.createIn(ctx.data.tx, ctx.legacyAuth, b, false),
  }),
  defineAction({
    id: 'core.unit-name.update', title: 'Sửa tên đơn vị tính (tên đang dùng không đổi được)', tags,
    permission: 'catalog:write', effect: 'write', sideEffects: ['masterdata'], idempotency: 'natural',
    input: patchSchema.extend({ id: idParam.shape.id }), output: unitNameDto,
    expose: { http: { method: 'PATCH', path: '/api/v1/unit-names/:id' }, mcp: false, ai: 'deny' },
    evidence: { objectType: 'unit_name', objectId: (i) => i.id },
    handler: ({ data, legacyAuth }, { id, ...patch }) => unitNameService.updateIn(data.tx, legacyAuth, id, patch, false),
  }),
  defineAction({
    id: 'core.unit-name.delete', title: 'Xoá tên đơn vị tính chưa mặt hàng nào dùng', tags,
    permission: 'catalog:write', effect: 'write', sideEffects: ['masterdata'], idempotency: 'natural',
    input: idParam, output: z.object({ id: z.string() }),
    expose: { http: { method: 'DELETE', path: '/api/v1/unit-names/:id' }, mcp: false, ai: 'deny', destructive: true },
    evidence: { objectType: 'unit_name', objectId: (i) => i.id },
    handler: (ctx, b) => unitNameService.removeIn(ctx.data.tx, ctx.legacyAuth, b.id, false),
  }),
];

export async function unitNameRoutes(app: FastifyInstance): Promise<void> {
  const r = app.withTypeProvider<ZodTypeProvider>();
  r.get('/api/v1/unit-names', { preHandler: requirePermission('catalog:read'), schema: { tags, summary: 'Danh mục tên đơn vị tính + số mặt hàng đang dùng' }, handler: async (req) => ok(await unitNameService.list(authOf(req))) });

  mountActions(app, unitNameActions);
}
