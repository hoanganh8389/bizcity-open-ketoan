// @bizcity-layer D modules/ke-toan
// [2026-11-10 02:00 PM Nguyễn Văn Thủy] PHASE-026 — quy tắc định khoản: nghiệp vụ, đề xuất / duyệt / ngừng, chạy thử trên bộ định khoản thật (đóng góp)
/**
 * Route của bảng quy tắc định khoản (docs/nghiep-vu/15). Danh sách đường ở đầu posting-flow.routes.ts.
 * Lớp module (D): chạy thử gọi simulatePosting qua cổng Kernel.
 */
import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { db } from '../../db/client.js';
import { authOf, requirePermission } from '../../core/auth.js';
import { ok } from '../../core/http.js';
import { defineAction, mountActions, type AnyActionDef } from '../../core/actions.js';
import {
  approveRule, deleteDraft, listBusinesses, listRules, proposeRule, rejectRule, ruleOptions, saveBusiness, simulateRules, stopRule, updateDraft,
} from './posting-rules.service.js';

const tags = ['Thiết kế hạch toán'];
const anyOut = z.any();
const isoDay = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Ngày theo dạng YYYY-MM-DD');
const condSchema = z.object({
  method: z.string().max(32).optional(), taxCode: z.string().max(16).optional(), itemType: z.string().max(64).optional(), programKind: z.string().max(32).optional(),
  program: z.string().max(128).optional(), gift: z.boolean().optional(), leg: z.enum(['in', 'out']).optional(), sameUnit: z.boolean().optional(),
});
const ruleSchema = z.object({
  business: z.string().min(1).max(32), part: z.enum(['goods', 'tax', 'cogs', 'payment']), book: z.enum(['all', 'internal', 'tax']).optional(), cond: condSchema.optional(),
  debit: z.string().max(32).nullish(), credit: z.string().max(32).nullish(), priority: z.number().int().min(-100).max(100).optional(),
  from: isoDay, note: z.string().max(500).optional(), changeReason: z.string().max(500).optional(),
});
const sampleSchema = z.object({
  business: z.string().min(1).max(32), sku: z.string().max(64).optional(), itemType: z.string().max(64).optional(), taxCode: z.string().max(16).optional(),
  method: z.string().max(32).optional(), gift: z.boolean().optional(), program: z.string().max(128).optional(), amount: z.number().positive().max(1e13).optional(),
  cost: z.number().min(0).max(1e13).optional(), sameUnit: z.boolean().optional(), date: isoDay.optional(),
  draftId: z.string().max(20).optional(), draft: ruleSchema.optional(),
});
const businessSchema = z.object({ name: z.string().min(1).max(200), baseCode: z.string().min(1).max(32), reasonCode: z.string().min(2).max(32), reasonName: z.string().max(200).optional(), note: z.string().max(500).optional(), isActive: z.boolean().optional() });


export async function postingRuleRoutes(app: FastifyInstance): Promise<void> {
  const r = app.withTypeProvider<ZodTypeProvider>();
  const read = requirePermission('catalog:read');

  r.get('/api/v1/posting-rules/options', {
    preHandler: read,
    schema: { tags, summary: 'Lựa chọn cho màn khai báo quy tắc định khoản' },
    handler: async (req) => ok(await ruleOptions(db, authOf(req).tenantId)),
  });
  r.get('/api/v1/posting-rules/businesses', {
    preHandler: read,
    schema: { tags, summary: 'Nghiệp vụ định khoản và số quy tắc' },
    handler: async (req) => ok(await listBusinesses(db, authOf(req).tenantId)),
  });
  r.get('/api/v1/posting-rules', {
    preHandler: read,
    schema: { tags, summary: 'Danh sách quy tắc định khoản', querystring: z.object({ business: z.string().optional(), state: z.enum(['draft', 'active', 'scheduled', 'closed', 'rejected']).optional() }) },
    handler: async (req) => ok(await listRules(db, authOf(req).tenantId, req.query)),
  });
  // @bizcity-route: chỉ đọc — định khoản thử phiếu mẫu, không ghi gì (POST vì thân yêu cầu có quy tắc đề xuất)
  r.post('/api/v1/posting-rules/simulate', {
    preHandler: read,
    schema: { tags, summary: 'Định khoản thử một phiếu mẫu (không ghi gì)', body: sampleSchema },
    handler: async (req) => ok(await simulateRules(db, authOf(req).tenantId, req.body)),
  });

  mountActions(app, postingRuleActions);
}

export const postingRuleActions: AnyActionDef[] = [
  defineAction({
    id: 'core.posting-rule.business-create', title: 'Thêm nghiệp vụ định khoản tự tạo', tags,
    permission: 'catalog:write', effect: 'write', sideEffects: ['settings'], idempotency: 'natural',
    input: businessSchema, output: anyOut,
    expose: { http: { method: 'POST', path: '/api/v1/posting-rules/businesses' }, mcp: false, ai: 'deny' },
    evidence: { objectType: 'posting_business', objectId: (i) => i.reasonCode },
    handler: async (ctx, i) => saveBusiness(ctx.data.tx, ctx.tenant.id, ctx.legacyAuth.actor, null, i),
  }),
  defineAction({
    id: 'core.posting-rule.business-update', title: 'Sửa nghiệp vụ định khoản', tags,
    permission: 'catalog:write', effect: 'write', sideEffects: ['settings'], idempotency: 'natural',
    input: businessSchema.extend({ code: z.string().min(1).max(32) }), output: anyOut,
    expose: { http: { method: 'PUT', path: '/api/v1/posting-rules/businesses/:code' }, mcp: false, ai: 'deny' },
    evidence: { objectType: 'posting_business', objectId: (i) => i.code },
    handler: async (ctx, i) => saveBusiness(ctx.data.tx, ctx.tenant.id, ctx.legacyAuth.actor, i.code, i),
  }),
  defineAction({
    id: 'core.posting-rule.propose', title: 'Đề xuất quy tắc định khoản (chờ duyệt)', tags,
    permission: 'catalog:write', effect: 'write', sideEffects: ['settings'], idempotency: 'natural',
    input: ruleSchema.extend({ replacesId: z.string().max(20).optional() }), output: anyOut,
    expose: { http: { method: 'POST', path: '/api/v1/posting-rules' }, mcp: false, ai: 'deny' },
    evidence: { objectType: 'posting_rule', objectId: (i) => `${i.business}:${i.part}` },
    handler: async (ctx, i) => proposeRule(ctx.data.tx, ctx.tenant.id, ctx.legacyAuth.actor, i),
  }),
  defineAction({
    id: 'core.posting-rule.update', title: 'Sửa đề xuất quy tắc định khoản', tags,
    permission: 'catalog:write', effect: 'write', sideEffects: ['settings'], idempotency: 'natural',
    input: ruleSchema.extend({ id: z.string().max(20) }), output: anyOut,
    expose: { http: { method: 'PUT', path: '/api/v1/posting-rules/:id' }, mcp: false, ai: 'deny' },
    evidence: { objectType: 'posting_rule', objectId: (i) => i.id },
    handler: async (ctx, i) => updateDraft(ctx.data.tx, ctx.tenant.id, ctx.legacyAuth.actor, i.id, i),
  }),
  defineAction({
    id: 'core.posting-rule.delete', title: 'Xoá đề xuất quy tắc định khoản', tags,
    permission: 'catalog:write', effect: 'write', sideEffects: ['settings'], idempotency: 'natural',
    input: z.object({ id: z.string().max(20) }), output: anyOut,
    expose: { http: { method: 'DELETE', path: '/api/v1/posting-rules/:id' }, mcp: false, ai: 'deny' },
    evidence: { objectType: 'posting_rule', objectId: (i) => i.id },
    handler: async (ctx, i) => deleteDraft(ctx.data.tx, ctx.tenant.id, ctx.legacyAuth.actor, i.id),
  }),
  defineAction({
    id: 'core.posting-rule.approve', title: 'Duyệt quy tắc định khoản', tags,
    permission: 'settings:write', effect: 'write', sideEffects: ['settings'], idempotency: 'natural',
    input: z.object({ id: z.string().max(20) }), output: anyOut,
    expose: { http: { method: 'POST', path: '/api/v1/posting-rules/:id/approve' }, mcp: false, ai: 'deny' },
    evidence: { objectType: 'posting_rule', objectId: (i) => i.id },
    handler: async (ctx, i) => approveRule(ctx.data.tx, ctx.tenant.id, ctx.legacyAuth.actor, i.id),
  }),
  defineAction({
    id: 'core.posting-rule.reject', title: 'Từ chối đề xuất quy tắc định khoản', tags,
    permission: 'settings:write', effect: 'write', sideEffects: ['settings'], idempotency: 'natural',
    input: z.object({ id: z.string().max(20), note: z.string().min(1).max(500) }), output: anyOut,
    expose: { http: { method: 'POST', path: '/api/v1/posting-rules/:id/reject' }, mcp: false, ai: 'deny' },
    evidence: { objectType: 'posting_rule', objectId: (i) => i.id },
    handler: async (ctx, i) => rejectRule(ctx.data.tx, ctx.tenant.id, ctx.legacyAuth.actor, i.id, i.note),
  }),
  defineAction({
    id: 'core.posting-rule.stop', title: 'Ngừng áp quy tắc định khoản từ một ngày', tags,
    permission: 'settings:write', effect: 'write', sideEffects: ['settings'], idempotency: 'natural',
    input: z.object({ id: z.string().max(20), from: isoDay, reason: z.string().min(1).max(500) }), output: anyOut,
    expose: { http: { method: 'POST', path: '/api/v1/posting-rules/:id/stop' }, mcp: false, ai: 'deny' },
    evidence: { objectType: 'posting_rule', objectId: (i) => i.id },
    handler: async (ctx, i) => stopRule(ctx.data.tx, ctx.tenant.id, ctx.legacyAuth.actor, i.id, i.from, i.reason),
  }),
];
