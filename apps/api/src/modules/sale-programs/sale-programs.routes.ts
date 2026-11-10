// @bizcity-layer D modules/ban-hang
// [2026-11-10 03:00 PM Nguyễn Văn Thủy] PHASE-026 — chương trình bán có hạn mức: khai báo, hạn mức theo cửa hàng, trừ / trả hạn mức, báo cáo (đóng góp)
/**
 *   GET  /api/v1/sale-programs?state=&sku=&search=         danh sách chương trình (kèm hạn mức từng cửa hàng, đã dùng, còn lại)
 *   GET  /api/v1/sale-programs/active?branchCode=&date=&skus=   chương trình đang chạy còn hạn mức ở một cửa hàng (POS gọi)
 *   GET  /api/v1/sale-programs/report?from=&to=&program=&branchCode=&kind=   báo cáo quản lý chương trình
 *   GET  /api/v1/sale-programs/:id/usage?branchCode=&from=&to=   lượt dùng chi tiết
 *   GET  /api/v1/program-kinds                              loại chương trình
 *   POST /api/v1/sale-programs                              thêm chương trình;  PUT /api/v1/sale-programs/:id  sửa
 *   PUT  /api/v1/sale-programs/:id/quotas                   đổi hạn mức các cửa hàng
 *   POST /api/v1/sale-programs/consume                      trừ hạn mức theo dòng phiếu bán (POS)
 *   POST /api/v1/sale-programs/release                      trả hạn mức khi huỷ phiếu
 *   POST /api/v1/program-kinds                              thêm / sửa loại chương trình
 */
import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { db } from '../../db/client.js';
import { authOf, requirePermission } from '../../core/auth.js';
import { ok } from '../../core/http.js';
import { defineAction, mountActions, type AnyActionDef } from '../../core/actions.js';
import {
  activeFor, consume, listProgramKinds, listPrograms, programReport, release, saveProgram, saveProgramKind, setQuotas, usageDetail,
} from './sale-programs.service.js';

const tags = ['Chương trình bán'];
const anyOut = z.any();
const isoDay = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Ngày theo dạng YYYY-MM-DD');
const quotaSchema = z.object({ branchCode: z.string().min(1).max(32), quotaQty: z.number().min(0).max(1e9) });
const programSchema = z.object({
  code: z.string().min(2).max(64), name: z.string().min(1).max(300), programKind: z.string().min(1).max(32), mode: z.enum(['gift', 'discount']),
  sku: z.string().min(1).max(64), buyQty: z.number().positive().max(1e6).optional(), giftSku: z.string().max(64).nullish(), giftQty: z.number().positive().max(1e6).nullish(),
  discountPct: z.number().positive().max(100).nullish(), discountAmount: z.number().positive().max(1e12).nullish(), salePrice: z.number().min(0).max(1e12).nullish(),
  validFrom: isoDay, validTo: isoDay, isActive: z.boolean().optional(), note: z.string().max(1000).optional(), quotas: z.array(quotaSchema).max(500).optional(),
});

export async function saleProgramRoutes(app: FastifyInstance): Promise<void> {
  const r = app.withTypeProvider<ZodTypeProvider>();
  const read = requirePermission('catalog:read');

  r.get('/api/v1/sale-programs', {
    preHandler: read,
    schema: { tags, summary: 'Danh sách chương trình bán', querystring: z.object({ state: z.enum(['running', 'upcoming', 'ended', 'stopped']).optional(), sku: z.string().optional(), search: z.string().max(100).optional() }) },
    handler: async (req) => ok(await listPrograms(db, authOf(req).tenantId, req.query)),
  });
  r.get('/api/v1/sale-programs/active', {
    preHandler: read,
    schema: { tags, summary: 'Chương trình đang chạy, còn hạn mức ở một cửa hàng', querystring: z.object({ branchCode: z.string().min(1), date: isoDay.optional(), skus: z.string().optional() }) },
    handler: async (req) => ok(await activeFor(db, authOf(req).tenantId, { branchCode: req.query.branchCode, date: req.query.date, skus: req.query.skus?.split(',').map((s) => s.trim()).filter(Boolean) })),
  });
  r.get('/api/v1/sale-programs/report', {
    preHandler: requirePermission('reports:read'),
    schema: { tags, summary: 'Báo cáo quản lý chương trình bán', querystring: z.object({ from: isoDay, to: isoDay, program: z.string().optional(), branchCode: z.string().optional(), kind: z.string().optional() }) },
    handler: async (req) => ok(await programReport(db, authOf(req).tenantId, req.query)),
  });
  r.get('/api/v1/sale-programs/:id/usage', {
    preHandler: requirePermission('reports:read'),
    schema: { tags, summary: 'Lượt dùng hạn mức của chương trình', params: z.object({ id: z.string() }), querystring: z.object({ branchCode: z.string().optional(), from: isoDay.optional(), to: isoDay.optional() }) },
    handler: async (req) => ok(await usageDetail(db, authOf(req).tenantId, req.params.id, req.query)),
  });
  r.get('/api/v1/program-kinds', {
    preHandler: read,
    schema: { tags, summary: 'Loại chương trình' },
    handler: async (req) => ok(await listProgramKinds(db, authOf(req).tenantId)),
  });

  mountActions(app, saleProgramActions);
}

export const saleProgramActions: AnyActionDef[] = [
  defineAction({
    id: 'core.sale-program.create', title: 'Thêm chương trình bán', tags,
    permission: 'catalog:write', effect: 'write', sideEffects: ['masterdata'], idempotency: 'natural',
    input: programSchema, output: anyOut,
    expose: { http: { method: 'POST', path: '/api/v1/sale-programs' }, mcp: false, ai: 'deny' },
    evidence: { objectType: 'sale_program', objectId: (i) => i.code },
    handler: async (ctx, i) => saveProgram(ctx.data.tx, ctx.tenant.id, ctx.legacyAuth.actor, null, i),
  }),
  defineAction({
    id: 'core.sale-program.update', title: 'Sửa chương trình bán', tags,
    permission: 'catalog:write', effect: 'write', sideEffects: ['masterdata'], idempotency: 'natural',
    input: programSchema.extend({ id: z.string().max(20) }), output: anyOut,
    expose: { http: { method: 'PUT', path: '/api/v1/sale-programs/:id' }, mcp: false, ai: 'deny' },
    evidence: { objectType: 'sale_program', objectId: (i) => i.code },
    handler: async (ctx, i) => saveProgram(ctx.data.tx, ctx.tenant.id, ctx.legacyAuth.actor, i.id, i),
  }),
  defineAction({
    id: 'core.sale-program.quotas', title: 'Đổi hạn mức chương trình theo cửa hàng', tags,
    permission: 'catalog:write', effect: 'write', sideEffects: ['masterdata'], idempotency: 'natural',
    input: z.object({ id: z.string().max(20), quotas: z.array(quotaSchema).max(500) }), output: anyOut,
    expose: { http: { method: 'PUT', path: '/api/v1/sale-programs/:id/quotas' }, mcp: false, ai: 'deny' },
    evidence: { objectType: 'sale_program', objectId: (i) => i.id },
    handler: async (ctx, i) => setQuotas(ctx.data.tx, ctx.tenant.id, ctx.legacyAuth.actor, i.id, i.quotas),
  }),
  defineAction({
    id: 'core.sale-program.consume', title: 'Trừ hạn mức chương trình theo phiếu bán', tags,
    permission: 'documents:write', effect: 'write', sideEffects: ['masterdata'], idempotency: 'natural',
    input: z.object({
      branchCode: z.string().min(1).max(32), docKey: z.string().min(3).max(160), docNo: z.string().max(64).optional(), docDate: isoDay, source: z.string().max(32).optional(),
      lines: z.array(z.object({ lineKey: z.string().min(1).max(64), program: z.string().min(1).max(64), sku: z.string().max(64).optional(), qty: z.number().positive().max(1e6), amount: z.number().min(0).max(1e13).optional() })).max(500),
    }), output: anyOut,
    expose: { http: { method: 'POST', path: '/api/v1/sale-programs/consume' }, mcp: false, ai: 'deny' },
    evidence: { objectType: 'sale_document', objectId: (i) => i.docKey },
    handler: async (ctx, i) => consume(ctx.data.tx, ctx.tenant.id, ctx.legacyAuth.actor, i),
  }),
  defineAction({
    id: 'core.sale-program.release', title: 'Trả hạn mức chương trình khi huỷ phiếu bán', tags,
    permission: 'documents:write', effect: 'write', sideEffects: ['masterdata'], idempotency: 'natural',
    input: z.object({ docKey: z.string().min(3).max(160) }), output: anyOut,
    expose: { http: { method: 'POST', path: '/api/v1/sale-programs/release' }, mcp: false, ai: 'deny' },
    evidence: { objectType: 'sale_document', objectId: (i) => i.docKey },
    handler: async (ctx, i) => release(ctx.data.tx, ctx.tenant.id, ctx.legacyAuth.actor, i.docKey),
  }),
  defineAction({
    id: 'core.program-kind.save', title: 'Thêm / sửa loại chương trình', tags,
    permission: 'catalog:write', effect: 'write', sideEffects: ['masterdata'], idempotency: 'natural',
    input: z.object({ code: z.string().min(2).max(32), name: z.string().min(1).max(200), side: z.enum(['sale', 'purchase', 'both']), note: z.string().max(500).optional(), isActive: z.boolean().optional() }), output: anyOut,
    expose: { http: { method: 'POST', path: '/api/v1/program-kinds' }, mcp: false, ai: 'deny' },
    evidence: { objectType: 'program_kind', objectId: (i) => i.code },
    handler: async (ctx, i) => saveProgramKind(ctx.data.tx, ctx.tenant.id, ctx.legacyAuth.actor, i),
  }),
];
