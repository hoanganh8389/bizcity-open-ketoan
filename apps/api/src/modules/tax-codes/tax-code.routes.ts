// @bizcity-layer K kernel/tax
/**
 * Loại thuế.
 *   GET   /api/v1/tax-codes
 *   POST  /api/v1/tax-codes
 *   PATCH /api/v1/tax-codes/:code
 */
import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { sql } from 'kysely';
import { db, toNumber } from '../../db/client.js';
import { authOf, requirePermission } from '../../core/auth.js';
import { ok } from '../../core/http.js';
import { Errors } from '../../core/errors.js';
import { writeAudit } from '../../core/audit.js';
import type { TaxCode } from '../../db/types.js';

const tags = ['Danh mục: Loại thuế'];

export const taxCodeCreateSchema = z.object({
  code: z.string().trim().min(1).max(16),
  name: z.string().trim().min(1).max(255),
  rate: z.number().min(0).max(100),
  direction: z.enum(['output', 'input']),
  accountCode: z.string().trim().max(20).optional(),
  reportGroup: z.string().trim().min(1).max(16).describe('Nhóm bảng kê: KCT | 0 | 5 | 8 | 10 | KKK'),
});

export function toTaxCodeDto(t: TaxCode) {
  return { code: t.code, name: t.name, rate: toNumber(t.rate), direction: t.direction, accountCode: t.account_code, reportGroup: t.report_group, isActive: t.is_active };
}

export async function taxCodeRoutes(app: FastifyInstance): Promise<void> {
  const r = app.withTypeProvider<ZodTypeProvider>();

  r.get('/api/v1/tax-codes', {
    preHandler: requirePermission('catalog:read'),
    schema: { tags, summary: 'Danh sách loại thuế' },
    handler: async (req) => {
      const rows = await db.selectFrom('tax_codes').selectAll().where('tenant_id', '=', authOf(req).tenantId).orderBy('direction').orderBy('code').execute();
      return ok(rows.map(toTaxCodeDto));
    },
  });

  r.post('/api/v1/tax-codes', {
    preHandler: requirePermission('catalog:write'),
    schema: { tags, summary: 'Thêm loại thuế', body: taxCodeCreateSchema },
    handler: async (req, reply) => {
      const auth = authOf(req);
      const b = req.body;
      const row = await db.transaction().execute(async (trx) => {
        const created = await trx
          .insertInto('tax_codes')
          .values({ tenant_id: auth.tenantId, code: b.code, name: b.name, rate: b.rate, direction: b.direction, account_code: b.accountCode ?? null, report_group: b.reportGroup })
          .returningAll()
          .executeTakeFirstOrThrow();
        await writeAudit(trx, { tenantId: auth.tenantId, actor: auth.actor, action: 'tax_code.create', objectType: 'tax_code', objectId: b.code, after: b });
        return created;
      });
      return reply.status(201).send(ok(toTaxCodeDto(row)));
    },
  });

  r.patch('/api/v1/tax-codes/:code', {
    preHandler: requirePermission('catalog:write'),
    schema: { tags, summary: 'Sửa loại thuế', params: z.object({ code: z.string() }), body: taxCodeCreateSchema.omit({ code: true }).partial().extend({ isActive: z.boolean().optional() }) },
    handler: async (req) => {
      const auth = authOf(req);
      const b = req.body;
      const patch: Record<string, unknown> = {};
      if (b.name !== undefined) patch.name = b.name;
      if (b.rate !== undefined) patch.rate = b.rate;
      if (b.direction !== undefined) patch.direction = b.direction;
      if (b.accountCode !== undefined) patch.account_code = b.accountCode || null;
      if (b.reportGroup !== undefined) patch.report_group = b.reportGroup;
      if (b.isActive !== undefined) patch.is_active = b.isActive;
      const row = await db.transaction().execute(async (trx) => {
        const updated = await trx.updateTable('tax_codes').set(patch).where('tenant_id', '=', auth.tenantId).where('code', '=', req.params.code).returningAll().executeTakeFirst();
        if (!updated) throw Errors.notFound(`loại thuế ${req.params.code}`);
        await writeAudit(trx, { tenantId: auth.tenantId, actor: auth.actor, action: 'tax_code.update', objectType: 'tax_code', objectId: req.params.code, after: b });
        return updated;
      });
      return ok(toTaxCodeDto(row));
    },
  });

  r.delete('/api/v1/tax-codes/:code', {
    preHandler: requirePermission('catalog:write'),
    schema: { tags, summary: 'Xoá loại thuế chưa dùng', params: z.object({ code: z.string() }) },
    handler: async (req) => {
      const auth = authOf(req);
      const code = req.params.code;
      await db.transaction().execute(async (trx) => {
        const before = await trx.selectFrom('tax_codes').selectAll().where('tenant_id', '=', auth.tenantId).where('code', '=', code).executeTakeFirst();
        if (!before) throw Errors.notFound(`loại thuế ${code}`);
        const used = await sql<{ n: number }>`SELECT 1 AS n FROM ledger_lines WHERE tenant_id = ${auth.tenantId} AND tax_code = ${code}
          UNION ALL SELECT 1 FROM products WHERE tenant_id = ${auth.tenantId} AND (tax_out_code = ${code} OR tax_in_code = ${code}) LIMIT 1`.execute(trx);
        if (used.rows.length) throw Errors.conflict(`Loại thuế ${code} đã dùng trên sổ hoặc mặt hàng: bỏ tích "Đang sử dụng" để ngừng`);
        await trx.deleteFrom('tax_codes').where('id', '=', before.id).execute();
        await writeAudit(trx, { tenantId: auth.tenantId, actor: auth.actor, action: 'tax_code.delete', objectType: 'tax_code', objectId: code, before });
      });
      return ok({ code });
    },
  });
}
