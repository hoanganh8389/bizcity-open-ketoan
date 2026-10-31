// @bizcity-layer P documents
// [2026-11-01 12:16 AM Johnny Chu - Chu Hoàng Anh] PHASE-010 — documents.* (PHASES 2.7): HTTP xem phiên bản / liên kết / đính kèm, gửi / gỡ tệp, tải tệp cho mọi chứng từ
// [2026-11-01 12:47 AM Johnny Chu - Chu Hoàng Anh] PHASE-010 — sha256 có thể null (tệp Mua hàng chuyển ở 0046); loại tệp nhận gạch dưới
/**
 * Chứng từ dùng chung qua HTTP (bizcity_document@1 §7) — cho giao diện; module dùng ctx.documents.* trong action của mình.
 *   GET  /api/v1/document-versions?docRef=                core.document-version.list      các phiên bản (không kèm nội dung)
 *   GET  /api/v1/document-versions/:version?docRef=       core.document-version.get       một phiên bản kèm nội dung
 *   GET  /api/v1/document-links?docRef=                   core.document-link.list         liên kết đi ra / đi vào
 *   GET  /api/v1/document-attachments?docRef=             core.document-attachment.list   tệp đang đính
 *   POST /api/v1/document-attachments                     core.document-attachment.add    gửi tệp (base64); cùng tệp gửi lại → tệp cũ
 *   POST /api/v1/document-attachments/:id/archive         core.document-attachment.archive gỡ tệp (không xoá cứng)
 *   GET  /api/v1/document-attachments/:id/file            tải nội dung (kiểm sha256 trước khi trả)
 * Gửi qua HTTP giới hạn bởi bodyLimit 20 MB của máy chủ (base64 ≈ 4/3 tệp) — tệp gần 15 MB nên gửi từ action của module.
 */
import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { DOC_LINK_ROLES, docRefSchema } from '@ketoan/contracts';
import { db } from '../../db/client.js';
import { authOf, requirePermission } from '../../core/auth.js';
import { idParamSchema } from '../../core/http.js';
import { defineAction, mountActions } from '../../core/actions.js';
import { documents } from '../../core/documents.js';

const tags = ['Chứng từ dùng chung'];
const versionOut = z.object({ version: z.number(), contentHash: z.string(), createdBy: z.string(), createdAt: z.string(), snapshot: z.unknown().optional() });
const attachmentOut = z.object({
  id: z.string(), docRef: z.string(), kind: z.string(), fileName: z.string(), contentType: z.string(), sizeBytes: z.number(),
  sha256: z.string().nullable(), note: z.string(), createdBy: z.string(), createdAt: z.string(),
});

const versionList = defineAction({
  id: 'core.document-version.list', title: 'Các phiên bản của chứng từ', tags,
  description: 'Phiên bản đã lưu của một chứng từ (docRef), cũ → mới: số phiên bản, băm nội dung, người lưu, lúc lưu.',
  permission: 'documents:read', effect: 'read', idempotency: 'none',
  input: z.object({ docRef: docRefSchema }),
  output: z.object({ docRef: z.string(), versions: z.array(versionOut) }),
  expose: { http: { method: 'GET', path: '/api/v1/document-versions' }, mcp: false, ai: 'read' },
  handler: async (ctx, q) => ({ docRef: q.docRef, versions: await documents.versions(ctx.data.tx, ctx.tenant.id, q.docRef) }),
});

const versionGet = defineAction({
  id: 'core.document-version.get', title: 'Một phiên bản chứng từ', tags,
  description: 'Nội dung chứng từ (docRef) tại một phiên bản.',
  permission: 'documents:read', effect: 'read', idempotency: 'none',
  input: z.object({ docRef: docRefSchema, version: z.coerce.number().int().positive() }),
  output: versionOut,
  expose: { http: { method: 'GET', path: '/api/v1/document-versions/:version' }, mcp: false, ai: 'read' },
  handler: (ctx, q) => documents.version(ctx.data.tx, ctx.tenant.id, q.docRef, q.version),
});

const linkList = defineAction({
  id: 'core.document-link.list', title: 'Liên kết của chứng từ', tags,
  description: 'Chứng từ liên quan: liên kết đi ra (from = docRef) và đi vào (to = docRef), kèm vai trò.',
  permission: 'documents:read', effect: 'read', idempotency: 'none',
  input: z.object({ docRef: docRefSchema }),
  output: z.object({ docRef: z.string(), links: z.array(z.object({ from: z.string(), to: z.string(), role: z.enum(DOC_LINK_ROLES), createdBy: z.string(), createdAt: z.string() })) }),
  expose: { http: { method: 'GET', path: '/api/v1/document-links' }, mcp: false, ai: 'read' },
  handler: async (ctx, q) => ({ docRef: q.docRef, links: await documents.links(ctx.data.tx, ctx.tenant.id, q.docRef) }),
});

const attachmentList = defineAction({
  id: 'core.document-attachment.list', title: 'Tệp đính kèm của chứng từ', tags,
  description: 'Tệp đang đính vào chứng từ (docRef); tải nội dung ở /api/v1/document-attachments/:id/file.',
  permission: 'documents:read', effect: 'read', idempotency: 'none',
  input: z.object({ docRef: docRefSchema }),
  output: z.object({ docRef: z.string(), files: z.array(attachmentOut) }),
  expose: { http: { method: 'GET', path: '/api/v1/document-attachments' }, mcp: false, ai: 'read' },
  handler: async (ctx, q) => ({ docRef: q.docRef, files: await documents.attachments(ctx.data.tx, ctx.tenant.id, q.docRef) }),
});

const attachmentAdd = defineAction({
  id: 'core.document-attachment.add', title: 'Đính tệp vào chứng từ', tags,
  description: 'Gửi tệp (nội dung base64, tối đa 15 MB) đính vào chứng từ. Cùng nội dung đã đính vào chứng từ này thì trả lại tệp cũ.',
  permission: 'documents:write', effect: 'write', idempotency: 'natural', sideEffects: ['documents'],
  input: z.object({
    docRef: docRefSchema,
    kind: z.string().regex(/^[a-z][a-z0-9_-]{0,39}$/).default('other').describe('Loại tệp, vd contract-scan, invoice, quote'),
    fileName: z.string().trim().min(1).max(200),
    contentType: z.string().max(120).default('application/octet-stream'),
    dataBase64: z.string().min(1).describe('Nội dung tệp mã hoá base64'),
    note: z.string().max(500).optional(),
  }),
  output: attachmentOut.extend({ created: z.boolean() }),
  expose: { http: { method: 'POST', path: '/api/v1/document-attachments', status: 201 }, mcp: false, ai: 'deny' },
  evidence: { objectType: 'document_attachment', objectId: (_input, output) => (output as { id?: string } | undefined)?.id },
  handler: (ctx, b) => documents.attach(ctx.data.tx, ctx.tenant.id, b.docRef, { fileName: b.fileName, contentType: b.contentType, data: Buffer.from(b.dataBase64, 'base64') }, { kind: b.kind, note: b.note }, ctx.actor.id),
});

const attachmentArchive = defineAction({
  id: 'core.document-attachment.archive', title: 'Gỡ tệp khỏi chứng từ', tags,
  description: 'Gỡ tệp đính kèm (ghi archived_at, không xoá cứng — STD-DATA-9). Gỡ lại tệp đã gỡ thì giữ nguyên.',
  permission: 'documents:write', effect: 'write', idempotency: 'natural', sideEffects: ['documents'],
  input: idParamSchema,
  output: attachmentOut.extend({ archivedAt: z.string() }),
  expose: { http: { method: 'POST', path: '/api/v1/document-attachments/:id/archive' }, mcp: false, ai: 'deny' },
  evidence: { objectType: 'document_attachment', objectId: (input) => input.id },
  handler: (ctx, q) => documents.archiveAttachment(ctx.data.tx, ctx.tenant.id, q.id, ctx.actor.id),
});

export const docRefActions = [versionList, versionGet, linkList, attachmentList, attachmentAdd, attachmentArchive];

export async function docRefRoutes(app: FastifyInstance): Promise<void> {
  mountActions(app, docRefActions);
  app.withTypeProvider<ZodTypeProvider>().get('/api/v1/document-attachments/:id/file', {
    preHandler: requirePermission('documents:read'),
    schema: { tags, summary: 'Tải nội dung tệp đính kèm (kiểm sha256 trước khi trả)', params: idParamSchema },
    handler: async (req, reply) => {
      const f = await documents.readAttachment(db, authOf(req).tenantId, req.params.id);
      return reply
        .header('content-type', f.contentType)
        .header('content-disposition', `attachment; filename*=UTF-8''${encodeURIComponent(f.fileName)}`)
        .header('x-content-sha256', f.sha256 ?? '')
        .send(f.data);
    },
  });
}
