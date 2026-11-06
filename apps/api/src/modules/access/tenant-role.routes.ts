// @bizcity-layer P permissions
// [2026-11-06 04:30 PM Johnny Chu - Chu Hoàng Anh] PHASE-028 — W2 đợt 2 (ADR-0027 Phụ lục A, chữ chốt bước 3): route đọc + action ghi vai trò của đơn vị
/**
 * Vai trò của đơn vị:
 *   GET  /api/v1/roles                                    danh sách (số luật, số người giữ)
 *   GET  /api/v1/roles/:id                                chi tiết + luật (cả luật đã gỡ)
 *   POST /api/v1/roles                                    core.role.create
 *   PATCH /api/v1/roles/:id                               core.role.update (tên, bật / tắt; version hiện tại)
 *   POST /api/v1/roles/:id/rules                          core.role.rule-add (Cho đích danh / Cấm)
 *   POST /api/v1/roles/:id/rules/:ruleId/remove           core.role.rule-remove (lý do bắt buộc)
 * Quyền users:write, không cho AI / MCP. Gán vai trò cho người: core.user.role-assign (access.routes.ts).
 */
import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { authOf, requirePermission } from '../../core/auth.js';
import { ok, idParamSchema, idSchema } from '../../core/http.js';
import { defineAction, type AnyActionDef } from '@bizcity/platform/core/actions';
import { tenantRoleCreateSchema, tenantRoleUpdateSchema, tenantRuleAddSchema, tenantRuleRemoveSchema } from './access.schemas.js';
import { tenantRoleService } from './tenant-role.service.js';

const tags = ['Vai trò của đơn vị'];
const anyOut = z.custom<object>((v) => typeof v === 'object' && v !== null);

export async function tenantRoleReadRoutes(app: FastifyInstance): Promise<void> {
  const r = app.withTypeProvider<ZodTypeProvider>();
  const admin = requirePermission('users:write');
  r.get('/api/v1/roles', { preHandler: admin, schema: { tags, summary: 'Danh sách vai trò của đơn vị' }, handler: async (req) => ok(await tenantRoleService.list(authOf(req))) });
  r.get('/api/v1/roles/:id', {
    preHandler: admin, schema: { tags, summary: 'Một vai trò của đơn vị kèm luật (cả luật đã gỡ)', params: idParamSchema },
    handler: async (req) => ok(await tenantRoleService.get(authOf(req), req.params.id)),
  });
}

export const tenantRoleActions: AnyActionDef[] = [
  defineAction({
    id: 'core.role.create', title: 'Tạo vai trò của đơn vị', tags,
    permission: 'users:write', effect: 'write', sideEffects: ['settings'], idempotency: 'natural',
    input: tenantRoleCreateSchema, output: anyOut,
    expose: { http: { method: 'POST', path: '/api/v1/roles', status: 201 }, mcp: false, ai: 'deny' },
    evidence: { objectType: 'tenant_role' },
    handler: (ctx, input) => tenantRoleService.createIn(ctx.data.tx, ctx.legacyAuth, input),
  }),
  defineAction({
    id: 'core.role.update', title: 'Sửa tên / bật tắt vai trò của đơn vị', tags,
    permission: 'users:write', effect: 'write', sideEffects: ['settings'], idempotency: 'natural',
    input: tenantRoleUpdateSchema.merge(idParamSchema), output: anyOut,
    expose: { http: { method: 'PATCH', path: '/api/v1/roles/:id' }, mcp: false, ai: 'deny' },
    evidence: { objectType: 'tenant_role', objectId: (i) => String(i.id) },
    handler: (ctx, input) => {
      const { id, ...body } = input;
      return tenantRoleService.updateIn(ctx.data.tx, ctx.legacyAuth, id, body);
    },
  }),
  defineAction({
    id: 'core.role.rule-add', title: 'Thêm luật Cho / Cấm cho vai trò của đơn vị', tags,
    permission: 'users:write', effect: 'write', sideEffects: ['settings'], idempotency: 'natural',
    input: tenantRuleAddSchema.merge(idParamSchema), output: anyOut,
    expose: { http: { method: 'POST', path: '/api/v1/roles/:id/rules', status: 201 }, mcp: false, ai: 'deny' },
    evidence: { objectType: 'tenant_role', objectId: (i) => String(i.id) },
    handler: (ctx, input) => {
      const { id, ...body } = input;
      return tenantRoleService.ruleAddIn(ctx.data.tx, ctx.legacyAuth, id, body);
    },
  }),
  defineAction({
    id: 'core.role.rule-remove', title: 'Gỡ luật của vai trò của đơn vị', tags,
    permission: 'users:write', effect: 'write', sideEffects: ['settings'], idempotency: 'natural',
    input: tenantRuleRemoveSchema.merge(idParamSchema).extend({ ruleId: idSchema }), output: anyOut,
    expose: { http: { method: 'POST', path: '/api/v1/roles/:id/rules/:ruleId/remove' }, mcp: false, ai: 'deny' },
    evidence: { objectType: 'tenant_role', objectId: (i) => String(i.id) },
    handler: (ctx, input) => tenantRoleService.ruleRemoveIn(ctx.data.tx, ctx.legacyAuth, input.id, input.ruleId, input.reason),
  }),
];
