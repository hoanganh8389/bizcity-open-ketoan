// @bizcity-layer M data/masterdata
// [2026-11-03 04:10 PM Johnny Chu - Chu Hoàng Anh] PHASE-014 — W6 đợt 3 (SC-ACT-1): ghi chi nhánh qua defineAction (core.branch.{create,update,delete}) — quyền, kiểm input, giao dịch, bằng chứng do runtime; đường dẫn / mã 201 như cũ
/**
 * Chi nhánh.
 *   GET   /api/v1/branches
 *   GET   /api/v1/branches/sites    website của hệ thống bán hàng (qua kết nối chính) và chi nhánh từng website đang nối
 *   POST  /api/v1/branches
 *   PATCH /api/v1/branches/:code
 *   DELETE /api/v1/branches/:code   xoá chi nhánh chưa có chứng từ
 * Ghi: action core.branch.{create,update,delete} (W6, SC-ACT-1).
 */
import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { authOf, requirePermission } from '../../core/auth.js';
import { ok } from '../../core/http.js';
import { defineAction, mountActions, type AnyActionDef } from '../../core/actions.js';
import { branchCreateSchema, branchUpdateSchema } from './branch.schemas.js';
import { branchService } from './branch.service.js';
import { branchSites } from './branch-sites.js';

const tags = ['Danh mục: Chi nhánh'];

const branchDto = z.object({
  id: z.string(), code: z.string(), name: z.string(), accountingUnitCode: z.string().nullable(), address: z.string().nullable(), externalRef: z.string().nullable(),
  departmentCode: z.string().nullable(), note: z.string(), companyName: z.string(), taxCode: z.string(), phone: z.string(), fax: z.string(), isActive: z.boolean(),
  orgUnitCode: z.string().nullable(), orgPath: z.string(),
});

export const branchActions: AnyActionDef[] = [
  defineAction({
    id: 'core.branch.create', title: 'Thêm chi nhánh', tags,
    permission: 'catalog:write', effect: 'write', sideEffects: ['masterdata'], idempotency: 'natural',
    input: branchCreateSchema, output: branchDto,
    expose: { http: { method: 'POST', path: '/api/v1/branches', status: 201 }, mcp: false, ai: 'deny' },
    evidence: { objectType: 'branch', objectId: (i) => i.code },
    handler: (ctx, b) => branchService.createIn(ctx.data.tx, ctx.legacyAuth, b, false),
  }),
  defineAction({
    id: 'core.branch.update', title: 'Sửa chi nhánh', tags,
    permission: 'catalog:write', effect: 'write', sideEffects: ['masterdata'], idempotency: 'natural',
    input: branchUpdateSchema.extend({ code: z.string() }), output: branchDto,
    expose: { http: { method: 'PATCH', path: '/api/v1/branches/:code' }, mcp: false, ai: 'deny' },
    evidence: { objectType: 'branch', objectId: (i) => i.code },
    handler: ({ data, legacyAuth }, { code, ...patch }) => branchService.updateIn(data.tx, legacyAuth, code, patch, false),
  }),
  defineAction({
    id: 'core.branch.delete', title: 'Xoá chi nhánh chưa có chứng từ', tags,
    permission: 'catalog:write', effect: 'write', sideEffects: ['masterdata'], idempotency: 'natural',
    input: z.object({ code: z.string() }), output: z.object({ code: z.string() }),
    expose: { http: { method: 'DELETE', path: '/api/v1/branches/:code' }, mcp: false, ai: 'deny', destructive: true },
    evidence: { objectType: 'branch', objectId: (i) => i.code },
    handler: (ctx, b) => branchService.removeIn(ctx.data.tx, ctx.legacyAuth, b.code, false),
  }),
];

export async function branchRoutes(app: FastifyInstance): Promise<void> {
  const r = app.withTypeProvider<ZodTypeProvider>();

  r.get('/api/v1/branches', {
    preHandler: requirePermission('catalog:read'),
    schema: { tags, summary: 'Danh sách chi nhánh' },
    handler: async (req) => ok(await branchService.list(authOf(req))),
  });

  r.get('/api/v1/branches/sites', {
    preHandler: requirePermission('catalog:read'),
    schema: { tags, summary: 'Website của hệ thống bán hàng và chi nhánh đang nối (qua kết nối chính)', querystring: z.object({ refresh: z.string().optional() }) },
    handler: async (req) => ok(await branchSites(authOf(req).tenantId, req.query.refresh === '1')),
  });

  mountActions(app, branchActions);
}
