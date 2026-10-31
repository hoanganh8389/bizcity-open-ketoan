// @bizcity-layer P audit
// [2026-10-30 11:27 AM Johnny Chu - Chu Hoàng Anh] PHASE-003 — bằng chứng chỉ thêm, chuỗi băm theo đơn vị, biên nhận (PHASES 2.6).
/**
 * Bằng chứng (bizcity_evidence@1 §3): ai giữ biên nhận (người dùng, Cell, plugin WP) hỏi lại một bản ghi và tự kiểm.
 *   GET /api/v1/evidence/:id   core.evidence.get — bản ghi + kiểm: hash tính lại có khớp không, có nối đúng dòng liền trước không
 * Kiểm cả chuỗi của đơn vị: tự chẩn đoán EVIDENCE_CHAIN (GET /api/v1/system/diagnostics).
 */
import type { FastifyInstance } from 'fastify';
import { sql } from 'kysely';
import { z } from 'zod';
import { Errors } from '../../core/errors.js';
import { idSchema } from '../../core/http.js';
import { defineAction, mountActions } from '../../core/actions.js';

const evidenceSchema = z.object({
  id: z.string(),
  at: z.string(),
  actor: z.object({ kind: z.string(), id: z.string(), via: z.string().nullable(), onBehalfOf: z.string().nullable() }),
  action: z.string(),
  module: z.string().nullable(),
  subject: z.string().nullable(),
  object: z.object({ type: z.string(), id: z.string().nullable() }),
  requestId: z.string().nullable(),
  idempotencyKey: z.string().nullable(),
  inputHash: z.string().nullable(),
  result: z.object({ ok: z.boolean(), code: z.string().nullable() }),
  changes: z.object({ before: z.unknown(), after: z.unknown() }),
  chain: z.object({ seq: z.string().nullable(), prevHash: z.string().nullable(), hash: z.string().nullable() }),
  verify: z.object({ hashValid: z.boolean().nullable(), linked: z.boolean().nullable() }).describe('null = dòng trước khi có chuỗi băm (migration 0036)'),
});

const getEvidence = defineAction({
  id: 'core.evidence.get', title: 'Một bản ghi bằng chứng, kèm kiểm băm', tags: ['Bằng chứng'],
  description: 'Kiểm biên nhận: so `hash` với hash trong meta.receipt đã nhận; verify.hashValid = băm tính lại khớp, verify.linked = prev_hash bằng hash của dòng liền trước trong chuỗi của đơn vị.',
  permission: 'documents:read', effect: 'read', idempotency: 'none',
  input: z.object({ id: idSchema }), output: evidenceSchema,
  expose: { http: { method: 'GET', path: '/api/v1/evidence/:id' }, mcp: true, ai: 'read' },
  handler: async (ctx, input) => {
    const res = await sql<{
      id: string; created_at: Date; actor: string; actor_kind: string; actor_via: string | null; on_behalf_of: string | null; action: string; module_id: string | null;
      subject: string | null; object_type: string; object_id: string | null; request_id: string | null; idempotency_key: string | null; input_hash: string | null;
      result_ok: boolean; result_code: string | null; before_data: unknown; after_data: unknown; chain_seq: string | null; prev_hash: string | null; hash: string | null;
      recomputed: string; prev_actual: string | null;
    }>`
      SELECT a.*, audit_log_hash(a) AS recomputed,
             (SELECT p.hash FROM audit_logs p WHERE p.tenant_id = a.tenant_id AND p.chain_seq = a.chain_seq - 1) AS prev_actual
        FROM audit_logs a WHERE a.tenant_id = ${ctx.tenant.id} AND a.id = ${input.id}`.execute(ctx.data.tx);
    const x = res.rows[0];
    if (!x) throw Errors.notFound('bản ghi bằng chứng');
    const chained = x.chain_seq != null;
    return {
      id: x.id, at: new Date(x.created_at).toISOString(),
      actor: { kind: x.actor_kind, id: x.actor, via: x.actor_via, onBehalfOf: x.on_behalf_of },
      action: x.action, module: x.module_id, subject: x.subject, object: { type: x.object_type, id: x.object_id },
      requestId: x.request_id, idempotencyKey: x.idempotency_key, inputHash: x.input_hash,
      result: { ok: x.result_ok, code: x.result_code },
      changes: { before: x.before_data, after: x.after_data },
      chain: { seq: x.chain_seq, prevHash: x.prev_hash, hash: x.hash },
      verify: chained
        ? { hashValid: x.recomputed === x.hash, linked: x.chain_seq === '1' ? x.prev_hash === null : x.prev_hash === x.prev_actual }
        : { hashValid: null, linked: null },
    };
  },
});

export async function evidenceRoutes(app: FastifyInstance): Promise<void> {
  mountActions(app, [getEvidence]);
}
