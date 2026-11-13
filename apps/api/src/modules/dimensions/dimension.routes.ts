// @bizcity-layer P data
// [2026-10-29 10:24 PM Johnny Chu - Chu Hoàng Anh] INIT — khởi tạo Bizcity Core Framework: sổ cái chỉ thêm, cửa nạp sự việc, CANON, hợp đồng, bộ kiểm chuẩn.
// [2026-10-30 09:58 AM Johnny Chu - Chu Hoàng Anh] PHASE-002 — nhãn lớp @bizcity-layer, đồ thị phụ thuộc mốc, bản nháp API module-sdk.
// [2026-10-30 09:36 PM Johnny Chu - Chu Hoàng Anh] PHASE-010 — cổng công khai apps/api/src/kernel/public.ts, SC-KERNEL-6: ngoài Kernel chỉ import qua cổng.
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
// [2026-11-03 12:40 AM Johnny Chu - Chu Hoàng Anh] PHASE-014 — W5 (SC-LAYER-2): hỏi Kernel qua cổng
import { corePort } from '@bizcity/platform/core/ports';
import { defineAction, mountActions, type AnyActionDef, sameTx } from '@bizcity/platform/core/actions';

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
  mountActions(app, dimensionWriteActions);
}

// [2026-11-03 04:00 AM Johnny Chu - Chu Hoàng Anh] PHASE-014 — W6 đợt 3 (SC-ACT-1): route ghi qua defineAction — quyền, kiểm input, idempotency, giao dịch, bằng chứng do runtime; đường dẫn / thân yêu cầu / mã 201 như cũ.
// Mã cũ trong handler chạy trong giao dịch của action (sameTx); service tự mở giao dịch có bản *In.
const anyOut = z.custom<object>((v) => typeof v === 'object' && v !== null);

export const dimensionWriteActions: AnyActionDef[] = [
  defineAction({
    id: 'core.dimension.upsert', title: 'Thêm hoặc sửa một mã', tags,
    permission: 'catalog:write', effect: 'write', sideEffects: ['masterdata'], idempotency: 'natural',
    input: (dimensionInputSchema).merge(kindParam.extend({ code: z.string().trim().min(1).max(64) })), output: anyOut,
    expose: { http: { method: 'PUT', path: '/api/v1/dimensions/:kind/:code' }, mcp: false, ai: 'deny' },
    evidence: { objectType: 'dimension', objectId: (i) => String(i.kind) },
    handler: async (ctx, input) => {
      const { kind: _kind, code: _code, ...reqBody } = input;
      const trx = ctx.data.tx;
      const auth = ctx.legacyAuth;
      const { kind, code } = input;
      const b = reqBody;
      if (b.parentCode === code) throw Errors.validation(`${DIMENSION_LABELS[kind]} cha không được là chính nó`);
      if (b.parentCode) {
        const parent = await trx.selectFrom('dimensions').select('id').where('tenant_id', '=', auth.tenantId).where('kind', '=', kind).where('code', '=', b.parentCode).executeTakeFirst();
        if (!parent) throw Errors.validation(`${DIMENSION_LABELS[kind]} cha "${b.parentCode}" không có trong danh mục`);
      }
      const cur = await trx.selectFrom('dimensions').select(['extra', 'name', 'note', 'is_active', 'parent_code']).where('tenant_id', '=', auth.tenantId).where('kind', '=', kind).where('code', '=', code).executeTakeFirst();
      const { partnerName: _p, createdBy: _c, ...rest } = b.extra as Record<string, unknown>;
      const createdBy = (cur?.extra as { createdBy?: string } | undefined)?.createdBy ?? (cur ? undefined : auth.actorName);
      const values = { name: b.name, parent_code: b.parentCode || null, note: b.note, is_active: b.isActive, extra: JSON.stringify(createdBy ? { ...rest, createdBy } : rest) };
      await sameTx(trx, async (trx) => {
        await trx
          .insertInto('dimensions')
          .values({ tenant_id: auth.tenantId, kind, code, ...values })
          .onConflict((oc) => oc.columns(['tenant_id', 'kind', 'code']).doUpdateSet(values))
          .execute();
        await writeAudit(trx, { tenantId: auth.tenantId, actor: auth.actor, action: 'dimension.save', objectType: `dimension:${kind}`, objectId: code,
          // [2026-11-13 Nguyễn Văn Thủy] ghi đủ trước / sau để xem lịch sử thay đổi (Cơ cấu tổ chức) (đóng góp)
          before: cur ? { name: cur.name, note: cur.note, isActive: cur.is_active, parentCode: cur.parent_code, extra: cur.extra } : undefined,
          after: { name: b.name, note: b.note, isActive: b.isActive, parentCode: b.parentCode || null, extra: rest } });
      });
      return { code };
    },
  }),
  defineAction({
    id: 'core.dimension.delete', title: 'Xoá một mã chưa dùng', tags,
    permission: 'catalog:write', effect: 'write', sideEffects: ['masterdata'], idempotency: 'natural',
    input: kindParam.extend({ code: z.string().trim().min(1).max(64) }), output: anyOut,
    expose: { http: { method: 'DELETE', path: '/api/v1/dimensions/:kind/:code' }, mcp: false, ai: 'deny' },
    evidence: { objectType: 'dimension', objectId: (i) => String(i.kind) },
    handler: async (ctx, input) => {
      const trx = ctx.data.tx;
      const auth = ctx.legacyAuth;
      const { kind, code } = input;
      await sameTx(trx, async (trx) => {
        const before = await trx.selectFrom('dimensions').selectAll().where('tenant_id', '=', auth.tenantId).where('kind', '=', kind).where('code', '=', code).executeTakeFirst();
        if (!before) throw Errors.notFound(`${DIMENSION_LABELS[kind]} ${code}`);
        if ((await corePort('usedDimensionCodes')(trx, auth.tenantId, kind, [code])).has(code)) {
          throw Errors.conflict(`${DIMENSION_LABELS[kind]} ${code} đang được dùng (sổ sách, thẻ tài sản, định mức, chi nhánh, lý do, lịch hợp đồng hoặc có mã con): bỏ tích "Theo dõi" để ngừng dùng`);
        }
        await trx.deleteFrom('dimensions').where('id', '=', before.id).execute();
        await writeAudit(trx, { tenantId: auth.tenantId, actor: auth.actor, action: 'dimension.delete', objectType: `dimension:${kind}`, objectId: code, before });
      });
      return { code };
    },
  }),
];
