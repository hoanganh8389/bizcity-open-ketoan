// @bizcity-layer D modules/ke-toan
// [2026-11-10 02:00 PM Nguyễn Văn Thủy] PHASE-026 — quy tắc định khoản (đóng góp)
// [2026-11-11 Nguyễn Văn Thủy] PHASE-026 — bỏ màn Thiết kế hạch toán (ACC92): chỉ còn dòng thêm ở Tài khoản ngầm định (ACC41) (đóng góp)
/**
 *   GET    /api/v1/posting-rules/options        loại hàng, biến thể (hộp Thêm ở ACC41)
 *   GET    /api/v1/posting-rules/defaults       dòng thêm ở ACC41
 *   POST   /api/v1/posting-rules/defaults       thêm / sửa (có id) dòng thêm
 *   DELETE /api/v1/posting-rules/defaults/:id   xoá dòng thêm
 */
import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { db } from '../../db/client.js';
import { authOf, requirePermission } from '../../core/auth.js';
import { ok } from '../../core/http.js';
import { defineAction, mountActions, type AnyActionDef } from '../../core/actions.js';
import { deleteDefaultEntry, listDefaultEntries, ruleOptions, saveDefaultEntry } from './posting-rules.service.js';

const tags = ['Tài khoản ngầm định'];
const anyOut = z.any();
const condSchema = z.object({
  itemType: z.string().max(64).optional(), variant: z.string().max(32).optional(), leg: z.enum(['in', 'out']).optional(), sameUnit: z.boolean().optional(),
});
const entrySchema = z.object({
  id: z.string().max(20).optional(), business: z.string().min(1).max(32), part: z.enum(['goods', 'tax', 'cogs']), cond: condSchema.optional(),
  debit: z.string().max(32).nullish(), credit: z.string().max(32).nullish(), name: z.string().min(1).max(200),
});

export async function postingRuleRoutes(app: FastifyInstance): Promise<void> {
  const r = app.withTypeProvider<ZodTypeProvider>();
  const read = requirePermission('catalog:read');
  r.get('/api/v1/posting-rules/options', {
    preHandler: read,
    schema: { tags, summary: 'Loại hàng, biến thể cho hộp Thêm ở Tài khoản ngầm định' },
    handler: async (req) => ok(await ruleOptions(db, authOf(req).tenantId)),
  });
  r.get('/api/v1/posting-rules/defaults', {
    preHandler: read,
    schema: { tags, summary: 'Dòng thêm ở Tài khoản ngầm định (ACC41)' },
    handler: async (req) => ok(await listDefaultEntries(db, authOf(req).tenantId)),
  });
  mountActions(app, postingRuleActions);
}

const postingRuleActions: AnyActionDef[] = [
  defineAction({
    id: 'core.posting-default-entry.save', title: 'Thêm / sửa tài khoản ngầm định (ACC41)', tags,
    permission: 'settings:write', effect: 'write', sideEffects: ['settings'], idempotency: 'natural',
    input: entrySchema, output: anyOut,
    expose: { http: { method: 'POST', path: '/api/v1/posting-rules/defaults' }, mcp: false, ai: 'deny' },
    evidence: { objectType: 'posting_rule', objectId: (i) => i.id ?? `${i.business}:${i.part}` },
    handler: async (ctx, i) => { const { id, ...b } = i; return saveDefaultEntry(ctx.data.tx, ctx.tenant.id, ctx.legacyAuth.actor, id ?? null, b); },
  }),
  defineAction({
    id: 'core.posting-default-entry.delete', title: 'Xoá tài khoản ngầm định thêm (ACC41)', tags,
    permission: 'settings:write', effect: 'write', sideEffects: ['settings'], idempotency: 'natural',
    input: z.object({ id: z.string().max(20) }), output: anyOut,
    expose: { http: { method: 'DELETE', path: '/api/v1/posting-rules/defaults/:id' }, mcp: false, ai: 'deny' },
    evidence: { objectType: 'posting_rule', objectId: (i) => i.id },
    handler: async (ctx, i) => deleteDefaultEntry(ctx.data.tx, ctx.tenant.id, ctx.legacyAuth.actor, i.id),
  }),
];
