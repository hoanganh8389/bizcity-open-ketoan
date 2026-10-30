// @bizcity-layer P data
/**
 * Danh mục chiều phân tích: khoản mục, bộ phận, hợp đồng (phân biệt bằng :kind).
 *   GET /api/v1/dimensions/:kind            danh sách   (kind = cost_item | department | contract)
 *   PUT /api/v1/dimensions/:kind/:code      thêm hoặc sửa theo mã (lần thêm đầu ghi người tạo vào extra.createdBy)
 *   DELETE /api/v1/dimensions/:kind/:code   xoá mã chưa dùng, chưa có mã con
 * Không xoá mã đã dùng: bỏ đánh dấu "Theo dõi" (isActive) để ngừng.
 * Hợp đồng: danh sách kèm tên khách hàng (partnerName) theo mã đối tượng.
 */
import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { DIMENSION_KINDS, DIMENSION_LABELS, dimensionInputSchema } from '@ketoan/contracts';
import { db } from '../../db/client.js';
import { authOf, requirePermission } from '../../core/auth.js';
import { Errors } from '../../core/errors.js';
import { ok } from '../../core/http.js';
import { writeAudit } from '../../core/audit.js';
import { usedDimensionCodes } from '../../kernel/public.js';

const tags = ['Danh mục: Khoản mục, bộ phận, hợp đồng'];
const kindParam = z.object({ kind: z.enum(DIMENSION_KINDS) });

export async function dimensionRoutes(app: FastifyInstance): Promise<void> {
  const r = app.withTypeProvider<ZodTypeProvider>();

  r.get('/api/v1/dimensions/:kind', {
    preHandler: requirePermission('catalog:read'),
    schema: { tags, summary: 'Danh sách khoản mục / bộ phận / hợp đồng', params: kindParam },
    handler: async (req) => {
      const { tenantId } = authOf(req);
      const rows = await db.selectFrom('dimensions').selectAll().where('tenant_id', '=', tenantId).where('kind', '=', req.params.kind).orderBy('code').execute();
      const partnerCodes = req.params.kind === 'contract' ? [...new Set(rows.map((d) => String((d.extra as { partnerCode?: string }).partnerCode ?? '')).filter(Boolean))] : [];
      const partners = partnerCodes.length ? new Map((await db.selectFrom('partners').select(['code', 'name']).where('tenant_id', '=', tenantId).where('code', 'in', partnerCodes).execute()).map((p) => [p.code, p.name])) : new Map<string, string>();
      return ok(rows.map((d) => {
        const extra = d.extra as Record<string, unknown>;
        return { code: d.code, name: d.name, parentCode: d.parent_code, note: d.note, isActive: d.is_active, extra: partnerCodes.length ? { ...extra, partnerName: partners.get(String(extra.partnerCode ?? '')) ?? '' } : extra };
      }));
    },
  });

  r.put('/api/v1/dimensions/:kind/:code', {
    preHandler: requirePermission('catalog:write'),
    schema: { tags, summary: 'Thêm hoặc sửa một mã', params: kindParam.extend({ code: z.string().trim().min(1).max(64) }), body: dimensionInputSchema },
    handler: async (req) => {
      const auth = authOf(req);
      const { kind, code } = req.params;
      const b = req.body;
      if (b.parentCode === code) throw Errors.validation(`${DIMENSION_LABELS[kind]} cha không được là chính nó`);
      if (b.parentCode) {
        const parent = await db.selectFrom('dimensions').select('id').where('tenant_id', '=', auth.tenantId).where('kind', '=', kind).where('code', '=', b.parentCode).executeTakeFirst();
        if (!parent) throw Errors.validation(`${DIMENSION_LABELS[kind]} cha "${b.parentCode}" không có trong danh mục`);
      }
      const cur = await db.selectFrom('dimensions').select('extra').where('tenant_id', '=', auth.tenantId).where('kind', '=', kind).where('code', '=', code).executeTakeFirst();
      const { partnerName: _p, createdBy: _c, ...rest } = b.extra as Record<string, unknown>;
      const createdBy = (cur?.extra as { createdBy?: string } | undefined)?.createdBy ?? (cur ? undefined : auth.actorName);
      const values = { name: b.name, parent_code: b.parentCode || null, note: b.note, is_active: b.isActive, extra: JSON.stringify(createdBy ? { ...rest, createdBy } : rest) };
      await db.transaction().execute(async (trx) => {
        await trx
          .insertInto('dimensions')
          .values({ tenant_id: auth.tenantId, kind, code, ...values })
          .onConflict((oc) => oc.columns(['tenant_id', 'kind', 'code']).doUpdateSet(values))
          .execute();
        await writeAudit(trx, { tenantId: auth.tenantId, actor: auth.actor, action: 'dimension.save', objectType: `dimension:${kind}`, objectId: code, after: { name: b.name, isActive: b.isActive } });
      });
      return ok({ code });
    },
  });

  r.delete('/api/v1/dimensions/:kind/:code', {
    preHandler: requirePermission('catalog:write'),
    schema: { tags, summary: 'Xoá một mã chưa dùng', params: kindParam.extend({ code: z.string().trim().min(1).max(64) }) },
    handler: async (req) => {
      const auth = authOf(req);
      const { kind, code } = req.params;
      await db.transaction().execute(async (trx) => {
        const before = await trx.selectFrom('dimensions').selectAll().where('tenant_id', '=', auth.tenantId).where('kind', '=', kind).where('code', '=', code).executeTakeFirst();
        if (!before) throw Errors.notFound(`${DIMENSION_LABELS[kind]} ${code}`);
        if ((await usedDimensionCodes(trx, auth.tenantId, kind, [code])).has(code)) {
          throw Errors.conflict(`${DIMENSION_LABELS[kind]} ${code} đang được dùng (sổ sách, thẻ tài sản, định mức, chi nhánh, lý do, lịch hợp đồng hoặc có mã con): bỏ tích "Theo dõi" để ngừng dùng`);
        }
        await trx.deleteFrom('dimensions').where('id', '=', before.id).execute();
        await writeAudit(trx, { tenantId: auth.tenantId, actor: auth.actor, action: 'dimension.delete', objectType: `dimension:${kind}`, objectId: code, before });
      });
      return ok({ code });
    },
  });
}
