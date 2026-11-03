// @bizcity-layer M data/masterdata
/**
 * Chi nhánh.
 *   GET   /api/v1/branches
 *   GET   /api/v1/branches/sites    website của hệ thống bán hàng (qua kết nối chính) và chi nhánh từng website đang nối
 *   POST  /api/v1/branches
 *   PATCH /api/v1/branches/:code
 *   DELETE /api/v1/branches/:code   xoá chi nhánh chưa có chứng từ
 */
import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { authOf, requirePermission } from '../../core/auth.js';
import { ok } from '../../core/http.js';
import { branchCreateSchema, branchUpdateSchema } from './branch.schemas.js';
import { branchService } from './branch.service.js';
import { branchSites } from './branch-sites.js';
import { defineAction, mountActions, type AnyActionDef } from '@bizcity/platform/core/actions';

const tags = ['Danh mục: Chi nhánh'];

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
  mountActions(app, branchWriteActions);
}

// [2026-11-03 04:00 AM Johnny Chu - Chu Hoàng Anh] PHASE-014 — W6 đợt 3 (SC-ACT-1): route ghi qua defineAction — quyền, kiểm input, idempotency, giao dịch, bằng chứng do runtime; đường dẫn / thân yêu cầu / mã 201 như cũ.
// Mã cũ trong handler chạy trong giao dịch của action (sameTx); service tự mở giao dịch có bản *In.
const anyOut = z.custom<object>((v) => typeof v === 'object' && v !== null);

export const branchWriteActions: AnyActionDef[] = [
  defineAction({
    id: 'core.branch.create', title: 'Thêm chi nhánh', tags,
    permission: 'catalog:write', effect: 'write', sideEffects: ['masterdata'], idempotency: 'natural',
    input: branchCreateSchema, output: anyOut,
    expose: { http: { method: 'POST', path: '/api/v1/branches', status: 201 }, mcp: false, ai: 'deny' },
    evidence: { objectType: 'branch' },
    handler: (ctx, input) => branchService.createIn(ctx.data.tx, ctx.legacyAuth, input),
  }),
  defineAction({
    id: 'core.branch.update', title: 'Sửa chi nhánh', tags,
    permission: 'catalog:write', effect: 'write', sideEffects: ['masterdata'], idempotency: 'natural',
    input: (branchUpdateSchema).merge(z.object({ code: z.string() })), output: anyOut,
    expose: { http: { method: 'PATCH', path: '/api/v1/branches/:code' }, mcp: false, ai: 'deny' },
    evidence: { objectType: 'branch', objectId: (i) => String(i.code) },
    handler: (ctx, input) => {
      const { code, ...reqBody } = input;
      return branchService.updateIn(ctx.data.tx, ctx.legacyAuth, code, reqBody);
    },
  }),
  defineAction({
    id: 'core.branch.delete', title: 'Xoá chi nhánh chưa có chứng từ', tags,
    permission: 'catalog:write', effect: 'write', sideEffects: ['masterdata'], idempotency: 'natural',
    input: z.object({ code: z.string() }), output: anyOut,
    expose: { http: { method: 'DELETE', path: '/api/v1/branches/:code' }, mcp: false, ai: 'deny' },
    evidence: { objectType: 'branch', objectId: (i) => String(i.code) },
    handler: (ctx, input) => branchService.removeIn(ctx.data.tx, ctx.legacyAuth, input.code),
  }),
];
