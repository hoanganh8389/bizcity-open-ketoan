// @bizcity-layer K kernel/intake
// [2026-11-02 07:40 PM Johnny Chu - Chu Hoàng Anh] PHASE-021 — W2 (2.18, ADR-0014 D6, D11): route bể chờ — danh sách, chi tiết, Kiểm thử (preflight, lưu mục thử)
/**
 * BỂ CHỜ ĐẦU VÀO — API (docs/contracts/BIZCITY-INTAKE-FINDINGS-v1.md §5).
 *   GET  /api/v1/intake                 danh sách mục (lọc status, docKey, channel), kèm mã phát hiện   (documents:read)
 *   GET  /api/v1/intake/:id             chi tiết: nguyên văn, phát hiện, lỗi cửa nạp, lịch sử           (documents:read)
 *   POST /api/v1/intake/preflight       Kiểm thử: { document, save?, guard? } → { findings, score, guard, guardChanged?, trialId? } — không ghi sự việc (documents:write)
 *   POST /api/v1/intake/:id/patch       Sửa tại bể: { ops (RFC 6902), reason } → phát hiện mới, mã hết / mã mới (documents:write, mục của mình)
 *   POST /api/v1/intake/:id/resubmit    Nộp lại qua cửa nạp: 'blocked' (còn lỗi chặn, không nộp) | 'resubmitted' | 'accepted' (documents:write, mục của mình)
 *   POST /api/v1/intake/:id/accept      Chấp nhận mã warn có lý do (vai trò bizcity.intake.accept_roles)                          (documents:write)
 *   POST /api/v1/intake/:id/dismiss     Bỏ mục có lý do                                                                          (documents:edit-all)
 * Ghi: action core.intake.* (W6, SC-ACT-1).
 */
import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { db } from '@bizcity/platform/db/client';
import { authOf, requirePermission } from '@bizcity/platform/core/auth';
import { Errors } from '@bizcity/platform/core/errors';
import { ok, queryBool } from '@bizcity/platform/core/http';
import { getInbox, listInbox, saveTrial } from './inbox.js';
import { acceptItem, currentDocument, dismissItem, patchItem, resubmitItem } from './repair.js';
import { preflight } from './preflight.js';
import { defineAction, mountActions, type AnyActionDef } from '@bizcity/platform/core/actions';

const tags = ['Bể chờ đầu vào'];

export async function intakeRoutes(app: FastifyInstance): Promise<void> {
  const r = app.withTypeProvider<ZodTypeProvider>();

  r.get('/api/v1/intake', {
    preHandler: requirePermission('documents:read'),
    schema: {
      tags, summary: 'Chứng từ bị cửa nạp từ chối đang giữ ở bể chờ',
      querystring: z.object({
        status: z.enum(['open', 'trial', 'resubmitted', 'fixed_at_source', 'accepted', 'dismissed']).optional(),
        docKey: z.string().max(160).optional(), channel: z.string().max(16).optional(),
        // [2026-11-03 10:45 AM Johnny Chu - Chu Hoàng Anh] PHASE-021 — W3: thẻ Đã xử lý (closed + closedDays) và Thử của tôi (mine)
        closed: queryBool.optional().describe('Mục đã đóng (resubmitted / fixed_at_source / accepted / dismissed)'),
        closedDays: z.coerce.number().int().min(1).max(366).optional().describe('Chỉ mục đóng trong N ngày gần nhất'),
        mine: queryBool.optional().describe('Chỉ mục của người đang gọi'),
        limit: z.coerce.number().int().min(1).max(200).default(50), offset: z.coerce.number().int().min(0).default(0),
      }),
    },
    handler: async (req) => {
      const auth = authOf(req);
      const out = await db.transaction().execute((trx) => listInbox(trx, auth.tenantId, { ...req.query, ...(req.query.mine ? { actor: auth.actor } : {}) }));
      return ok(out.rows, { total: out.total });
    },
  });

  r.get('/api/v1/intake/:id', {
    preHandler: requirePermission('documents:read'),
    schema: { tags, summary: 'Một mục bể chờ: nguyên văn, phát hiện, lỗi cửa nạp', params: z.object({ id: z.string().regex(/^\d+$/) }) },
    handler: async (req) => {
      const auth = authOf(req);
      const row = await db.transaction().execute((trx) => getInbox(trx, auth.tenantId, req.params.id));
      if (!row) throw Errors.notFound('mục bể chờ');
      // [2026-11-03 10:45 AM Johnny Chu - Chu Hoàng Anh] PHASE-021 — W3: kèm `current` = nguyên văn + mọi bản vá (một chỗ luật áp bản vá, màn không tự tính)
      return ok({ ...row, current: currentDocument(row) });
    },
  });

  mountActions(app, intakeActions);
}

// [2026-11-03 02:30 AM Johnny Chu - Chu Hoàng Anh] PHASE-014 — W6 đợt 2 (SC-ACT-1): Kiểm thử qua defineAction — không ghi sự việc; save = lưu mục thử (gửi trùng gộp vào mục cũ, natural)
export const intakeActions: AnyActionDef[] = [
  defineAction({
    id: 'core.intake.preflight', title: 'Kiểm thử chứng từ', tags,
    description: 'Mọi phát hiện L1–L4 + điểm, không ghi sự việc; save = lưu mục thử (giữ 7 ngày)',
    permission: 'documents:write', effect: 'write', sideEffects: ['analysis'], idempotency: 'natural',
    // [2026-11-03 10:20 AM Johnny Chu - Chu Hoàng Anh] PHASE-024 — S024-29: Commit Guard — trả guard (dấu cấu hình), nhận guard cũ → guardChanged
    input: z.object({ document: z.unknown(), save: z.boolean().default(false), guard: z.string().trim().max(64).optional().describe('Dấu cũ (lần Kiểm thử trước) — có thì trả guardChanged') }),
    output: z.object({ findings: z.array(z.unknown()), score: z.number(), guard: z.string(), guardChanged: z.boolean().optional(), trialId: z.string().optional(), attempt: z.number().optional() }),
    expose: { http: { method: 'POST', path: '/api/v1/intake/preflight' }, mcp: false, ai: 'deny' },
    evidence: { objectType: 'intake_inbox', objectId: (_i, o) => o.trialId },
    handler: async (ctx, b) => {
      const pf = await preflight(ctx.data.tx, ctx.legacyAuth, b.document, b.guard ? { guard: b.guard } : {});
      const trial = b.save ? await saveTrial(ctx.data.tx, ctx.legacyAuth, b.document, pf.findings, pf.score) : null;
      return { findings: pf.findings, score: pf.score, guard: pf.guard, ...(pf.guardChanged !== undefined ? { guardChanged: pf.guardChanged } : {}), ...(trial ? { trialId: trial.id, attempt: trial.attempt } : {}) };
    },
  }),
  // [2026-11-03 10:45 AM Johnny Chu - Chu Hoàng Anh] PHASE-021 — W3 (S021-15, S021-16): sửa tại bể, nộp lại, chấp nhận cảnh báo, bỏ mục — bằng chứng giữ lý do (input)
  defineAction({
    id: 'core.intake.patch', title: 'Sửa tại bể', tags,
    description: 'Thêm bản vá (RFC 6902) chồng lên nguyên văn — nguyên văn không đổi; chạy lại tiền kiểm, trả phát hiện mới và mã hết / mã mới so với lần trước',
    permission: 'documents:write', effect: 'write', sideEffects: ['documents'], idempotency: 'required',
    input: z.object({
      id: z.string().regex(/^\d+$/),
      ops: z.array(z.object({ op: z.enum(['add', 'replace', 'remove']), path: z.string().max(300), value: z.unknown().optional() })).min(1).max(200),
      reason: z.string().trim().min(3).max(500).describe('Lý do sửa tại bể (bắt buộc — chứng từ sửa tại bể lệch nguồn)'),
    }),
    output: z.object({ id: z.string(), findings: z.array(z.unknown()), score: z.number(), fixed: z.array(z.string()), added: z.array(z.string()), patchNo: z.number() }),
    expose: { http: { method: 'POST', path: '/api/v1/intake/:id/patch' }, mcp: false, ai: 'deny' },
    evidence: { objectType: 'intake_inbox' },
    handler: (ctx, b) => patchItem(ctx.data.tx, ctx.legacyAuth, b.id, b.ops, b.reason),
  }),
  defineAction({
    id: 'core.intake.resubmit', title: 'Nộp lại chứng từ từ bể chờ', tags,
    description: 'Nguyên văn + bản vá qua đúng cửa nạp (cùng luật). Còn lỗi chặn → blocked (không nộp); đạt → resubmitted / accepted, sự việc mang extra.intake',
    permission: 'documents:write', effect: 'write', sideEffects: ['documents', 'ledger'], idempotency: 'natural',
    input: z.object({ id: z.string().regex(/^\d+$/), reason: z.string().trim().max(500).optional() }),
    output: z.object({ status: z.enum(['blocked', 'resubmitted', 'accepted']), findings: z.array(z.unknown()), score: z.number(), eventId: z.string().optional(), docKey: z.string().optional(), version: z.number().optional(), postStatus: z.string().optional() }),
    expose: { http: { method: 'POST', path: '/api/v1/intake/:id/resubmit' }, mcp: false, ai: 'deny' },
    evidence: { objectType: 'intake_inbox', objectId: (i) => i.id },
    handler: (ctx, b) => resubmitItem(ctx.data.tx, ctx.legacyAuth, b.id, b.reason),
  }),
  defineAction({
    id: 'core.intake.accept', title: 'Chấp nhận cảnh báo đầu vào', tags,
    description: 'Chấp nhận mã warn danh mục cho phép (acceptable), có lý do; vai trò theo bizcity.intake.accept_roles. Mã block không bao giờ chấp nhận được',
    permission: 'documents:write', effect: 'write', sideEffects: ['documents'], idempotency: 'natural',
    input: z.object({ id: z.string().regex(/^\d+$/), codes: z.array(z.string().max(32)).min(1).max(30), reason: z.string().trim().min(3).max(500) }),
    output: z.object({ id: z.string(), acceptedCodes: z.array(z.string()), score: z.number() }),
    expose: { http: { method: 'POST', path: '/api/v1/intake/:id/accept' }, mcp: false, ai: 'deny' },
    evidence: { objectType: 'intake_inbox' },
    handler: (ctx, b) => acceptItem(ctx.data.tx, ctx.legacyAuth, b.id, b.codes, b.reason),
  }),
  defineAction({
    id: 'core.intake.dismiss', title: 'Bỏ mục bể chờ', tags,
    description: 'Bỏ mục (không nộp), có lý do — kế toán trưởng / chủ đơn vị',
    permission: 'documents:edit-all', effect: 'write', sideEffects: ['documents'], idempotency: 'natural',
    input: z.object({ id: z.string().regex(/^\d+$/), reason: z.string().trim().min(3).max(500) }),
    output: z.object({ id: z.string(), status: z.literal('dismissed') }),
    expose: { http: { method: 'POST', path: '/api/v1/intake/:id/dismiss' }, mcp: false, ai: 'deny' },
    evidence: { objectType: 'intake_inbox' },
    handler: (ctx, b) => dismissItem(ctx.data.tx, ctx.legacyAuth, b.id, b.reason),
  }),
];
