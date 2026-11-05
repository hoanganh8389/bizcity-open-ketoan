// @bizcity-layer K kernel/intake
// [2026-11-05 08:00 PM Johnny Chu - Chu Hoàng Anh] PHASE-029 — W1: route lịch sử chứng từ (bizcity_document@1 §7.2) — chỉ đọc, quyền documents:read
/**
 * GET /api/v1/documents/history — lịch sử một chứng từ gốc từ MỘT trong ba khoá:
 *   id        sự việc kế toán (accounting_events.id)
 *   docKey    khoá chứng từ (docKey / docRef)
 *   entryId   dòng sổ — truy vết NGƯỢC từ một bút toán về chứng từ gốc, đúng phiên bản đã tạo ra bút toán đó
 * Tuỳ chọn: version (chỉ phiên bản đó), withPayload=1 (kèm nội dung từng phiên bản; mặc định không, cho nhẹ).
 */
import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { db } from '@bizcity/platform/db/client';
import { authOf, requirePermission } from '@bizcity/platform/core/auth';
import { ok, idSchema, queryBool } from '@bizcity/platform/core/http';
import { documentHistory } from './document-history.service.js';

const querySchema = z.object({
  id: idSchema.optional(),
  docKey: z.string().trim().min(1).max(250).optional(),
  entryId: idSchema.optional(),
  version: z.coerce.number().int().min(1).optional(),
  withPayload: queryBool,
}).refine((q) => [q.id, q.docKey, q.entryId].filter((x) => x !== undefined).length === 1, { message: 'Chỉ định đúng một trong id, docKey, entryId' });

export async function documentHistoryRoutes(app: FastifyInstance): Promise<void> {
  const r = app.withTypeProvider<ZodTypeProvider>();
  r.get('/api/v1/documents/history', {
    preHandler: requirePermission('documents:read'),
    schema: { tags: ['Chứng từ'], summary: 'Lịch sử chứng từ gốc: phiên bản, bút toán theo phiên bản, định khoản, bằng chứng (truy vết xuôi và ngược)', querystring: querySchema },
    handler: async (req) => ok(await documentHistory(db, authOf(req).tenantId, req.query)),
  });
}
