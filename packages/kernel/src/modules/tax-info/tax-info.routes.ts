// @bizcity-layer K kernel/tax
// [2026-10-29 10:24 PM Johnny Chu - Chu Hoàng Anh] INIT — khởi tạo Bizcity Core Framework: sổ cái chỉ thêm, cửa nạp sự việc, CANON, hợp đồng, bộ kiểm chuẩn.
// [2026-10-30 09:58 AM Johnny Chu - Chu Hoàng Anh] PHASE-002 — nhãn lớp @bizcity-layer, đồ thị phụ thuộc mốc, bản nháp API module-sdk.
// [2026-11-01 04:39 PM Johnny Chu - Chu Hoàng Anh] PHASE-010 — dời từ apps/api/src/modules/tax-info/tax-info.routes.ts sang packages/kernel (@bizcity/kernel, D010-7 chặng 3); import Platform qua @bizcity/platform
/**
 * Bổ sung thông tin thuế (ACC78).
 *   GET    /api/v1/tax-info               chứng từ mua bán, hoá đơn trong kỳ, kèm các điểm còn thiếu
 *   PUT    /api/v1/tax-info/:eventId      bổ sung / sửa (hoá đơn, kỳ kê khai, được khấu trừ, chứng từ thanh toán)
 *   DELETE /api/v1/tax-info/:eventId      bỏ phần đã bổ sung, trở về thông tin gốc của chứng từ
 * Ghi: action core.tax-info.{save,remove} (W6, SC-ACT-1).
 */
import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { authOf, requirePermission } from '@bizcity/platform/core/auth';
import { ok } from '@bizcity/platform/core/http';
import { defineAction, mountActions, type AnyActionDef } from '@bizcity/platform/core/actions';
import { taxInfoService } from './tax-info.service.js';

const tags = ['Thuế: Bổ sung thông tin thuế'];
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Ngày dạng YYYY-MM-DD');
const branchCodes = z
  .string()
  .optional()
  .transform((s) => (s ? s.split(',').map((x) => x.trim()).filter(Boolean) : undefined));
const text = (max: number) => z.string().trim().max(max).optional();
const eventParam = z.object({ eventId: z.string().regex(/^\d+$/) });

export async function taxInfoRoutes(app: FastifyInstance): Promise<void> {
  const r = app.withTypeProvider<ZodTypeProvider>();

  r.get('/api/v1/tax-info', {
    preHandler: requirePermission('documents:read'),
    schema: {
      tags,
      summary: 'Chứng từ, hoá đơn trong kỳ và các điểm còn thiếu',
      querystring: z.object({
        from: date,
        to: date,
        direction: z.enum(['input', 'output']).optional(),
        branchCodes,
        show: z.enum(['issues', 'all', 'patched']).default('issues'),
        search: z.string().trim().max(100).optional(),
      }),
    },
    handler: async (req) => ok(await taxInfoService.list(authOf(req), req.query)),
  });

  mountActions(app, taxInfoActions);
}

// [2026-11-03 02:30 AM Johnny Chu - Chu Hoàng Anh] PHASE-014 — W6 đợt 2 (SC-ACT-1): bổ sung / bỏ thông tin thuế qua defineAction — một giao dịch của runtime, bằng chứng do runtime
const taxInfoOut = z.object({ eventId: z.string(), pendingRepost: z.boolean() });

export const taxInfoActions: AnyActionDef[] = [
  defineAction({
    id: 'core.tax-info.save', title: 'Bổ sung thông tin thuế cho một chứng từ', tags,
    permission: 'documents:write', effect: 'write', sideEffects: ['documents'], idempotency: 'natural',
    input: eventParam.extend({
      invoice: z.object({ no: text(32), serial: text(32), form: text(32), date: text(10), buyerName: text(255), buyerTaxCode: text(32), buyerAddress: text(500) }).default({}),
      declareMonth: z.string().regex(/^(\d{4}-\d{2})?$/, 'Kỳ kê khai dạng YYYY-MM').default(''),
      deductible: z.boolean().default(true),
      paymentRef: z.string().trim().max(255).default(''),
      note: z.string().trim().max(500).default(''),
    }),
    output: taxInfoOut,
    expose: { http: { method: 'PUT', path: '/api/v1/tax-info/:eventId' }, mcp: false, ai: 'deny' },
    evidence: { objectType: 'accounting_event', objectId: (i) => i.eventId },
    handler: (ctx, { eventId, ...input }) => taxInfoService.saveIn(ctx.data.tx, ctx.legacyAuth, eventId, input),
  }),
  defineAction({
    id: 'core.tax-info.remove', title: 'Bỏ phần đã bổ sung', tags,
    permission: 'documents:write', effect: 'write', sideEffects: ['documents'], idempotency: 'natural',
    input: eventParam, output: taxInfoOut,
    expose: { http: { method: 'DELETE', path: '/api/v1/tax-info/:eventId' }, mcp: false, ai: 'deny' },
    evidence: { objectType: 'accounting_event', objectId: (i) => i.eventId },
    handler: (ctx, { eventId }) => taxInfoService.removeIn(ctx.data.tx, ctx.legacyAuth, eventId),
  }),
];
