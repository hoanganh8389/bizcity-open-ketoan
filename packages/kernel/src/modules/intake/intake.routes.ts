// @bizcity-layer K kernel/intake
// [2026-11-02 07:40 PM Johnny Chu - Chu Hoàng Anh] PHASE-021 — W2 (2.18, ADR-0014 D6, D11): route bể chờ — danh sách, chi tiết, Kiểm thử (preflight, lưu mục thử)
/**
 * BỂ CHỜ ĐẦU VÀO — API (docs/contracts/BIZCITY-INTAKE-FINDINGS-v1.md §5).
 *   GET  /api/v1/intake                 danh sách mục (lọc status, docKey, channel), kèm mã phát hiện   (documents:read)
 *   GET  /api/v1/intake/:id             chi tiết: nguyên văn, phát hiện, lỗi cửa nạp, lịch sử           (documents:read)
 *   POST /api/v1/intake/preflight       Kiểm thử: { document, save?, guard? } → { findings, score, guard, guardChanged?, trialId? } — không ghi sự việc (documents:write)
 * Sửa tại bể, nộp lại, chấp nhận cảnh báo, bỏ mục: W3.
 */
import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { db } from '@bizcity/platform/db/client';
import { authOf, requirePermission } from '@bizcity/platform/core/auth';
import { Errors } from '@bizcity/platform/core/errors';
import { ok } from '@bizcity/platform/core/http';
import { getInbox, listInbox, saveTrial } from './inbox.js';
import { preflight } from './preflight.js';

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
        limit: z.coerce.number().int().min(1).max(200).default(50), offset: z.coerce.number().int().min(0).default(0),
      }),
    },
    handler: async (req) => {
      const auth = authOf(req);
      const out = await db.transaction().execute((trx) => listInbox(trx, auth.tenantId, req.query));
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
      return ok(row);
    },
  });

  r.post('/api/v1/intake/preflight', {
    preHandler: requirePermission('documents:write'),
    schema: {
      tags, summary: 'Kiểm thử chứng từ: mọi phát hiện L1–L4 + điểm, không ghi sự việc; save = lưu mục thử (giữ 7 ngày)',
      body: z.object({ document: z.unknown(), save: z.boolean().default(false), guard: z.string().trim().max(64).optional().describe('Dấu cũ (lần Kiểm thử trước) — có thì trả guardChanged') }),
    },
    handler: async (req) => {
      const auth = authOf(req);
      const out = await db.transaction().execute(async (trx) => {
        const pf = await preflight(trx, auth, req.body.document, req.body.guard ? { guard: req.body.guard } : {});
        const trial = req.body.save ? await saveTrial(trx, auth, req.body.document, pf.findings, pf.score) : null;
        return { findings: pf.findings, score: pf.score, guard: pf.guard, ...(pf.guardChanged !== undefined ? { guardChanged: pf.guardChanged } : {}), ...(trial ? { trialId: trial.id, attempt: trial.attempt } : {}) };
      });
      return ok(out);
    },
  });
}
