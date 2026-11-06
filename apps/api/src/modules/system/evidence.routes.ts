// @bizcity-layer P audit
// [2026-10-30 11:27 AM Johnny Chu - Chu Hoàng Anh] PHASE-003 — bằng chứng chỉ thêm, chuỗi băm theo đơn vị, biên nhận (PHASES 2.6).
// [2026-11-06 09:30 PM Johnny Chu - Chu Hoàng Anh] PHASE-030 — S030-30b: GET /api/v1/evidence/verify — kiểm ba chiều bản niêm phong (ADR-0030 D-SEAL-7, STD-EVD-10)
/**
 * Bằng chứng (bizcity_evidence@1 §3): ai giữ biên nhận (người dùng, Cell, plugin WP) hỏi lại một bản ghi và tự kiểm.
 *   GET /api/v1/evidence/:id   core.evidence.get — bản ghi + kiểm: hash tính lại có khớp không, có nối đúng dòng liền trước không
 * Kiểm cả chuỗi của đơn vị: tự chẩn đoán EVIDENCE_CHAIN (GET /api/v1/system/diagnostics).
 *   GET /api/v1/evidence/verify   core.evidence.verify — bản niêm phong theo ngày: tệp ↔ manifest ↔ CSDL; chỉ số đếm và mã, không nội dung dòng
 */
import type { FastifyInstance } from 'fastify';
import { sql } from 'kysely';
import { z } from 'zod';
import { Errors } from '../../core/errors.js';
import { idSchema } from '../../core/http.js';
import { defineAction, mountActions } from '../../core/actions.js';
import { addDays, SEAL_MAX_DAYS, verifySeals, vnToday } from '@bizcity/platform/core/evidence-export';

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

const SEAL_CODES = ['EVIDENCE_SEAL_MISSING', 'EVIDENCE_SEAL_FILE', 'EVIDENCE_SEAL_DB', 'EVIDENCE_SEAL_CHAIN'] as const;
const dateSchema = z.string().regex(/^d{4}-d{2}-d{2}$/);

const verifySealsAction = defineAction({
  id: 'core.evidence.verify', title: 'Kiểm bản niêm phong bằng chứng theo ngày', tags: ['Bằng chứng'],
  description: 'So ba chiều cho từng ngày trong khoảng (mặc định 31 ngày tới hôm qua): tệp tự kiểm (băm dòng, nối dòng, băm tệp), manifest nối ngày, manifest ↔ CSDL. Chỉ trả số đếm, mã và ngày — không nội dung bằng chứng (ADR-0030).',
  permission: 'conformance:run', effect: 'read', idempotency: 'none',
  input: z.object({ from: dateSchema.optional(), to: dateSchema.optional() }),
  output: z.object({
    from: z.string(), to: z.string(), days: z.number(), sealed: z.number(), rows: z.number(), ok: z.boolean(),
    counts: z.record(z.string(), z.number()),
    findings: z.array(z.object({ code: z.enum(SEAL_CODES), date: z.string(), detail: z.string() })).describe('Tối đa 100 dòng'),
  }),
  expose: { http: { method: 'GET', path: '/api/v1/evidence/verify' }, mcp: true, ai: 'read' },
  handler: async (ctx, input) => {
    const today = vnToday();
    const to = input.to ?? addDays(today, -1);
    const from = input.from ?? addDays(to, -30);
    if (from > to) throw Errors.validation('from phải không sau to');
    if (Date.parse(to) - Date.parse(from) > (SEAL_MAX_DAYS - 1) * 86_400_000) throw Errors.validation(`Khoảng kiểm tối đa ${SEAL_MAX_DAYS} ngày`);
    const r = await verifySeals(ctx.data.tx, ctx.tenant.id, from, to, today);
    const counts = Object.fromEntries(SEAL_CODES.map((c) => [c, r.findings.filter((f) => f.code === c).length]));
    return { ...r, ok: r.findings.length === 0, counts, findings: r.findings.slice(0, 100) };
  },
});

export async function evidenceRoutes(app: FastifyInstance): Promise<void> {
  mountActions(app, [verifySealsAction, getEvidence]);
}
