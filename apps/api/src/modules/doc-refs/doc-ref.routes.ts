// @bizcity-layer P documents
// [2026-11-01 12:16 AM Johnny Chu - Chu Hoàng Anh] PHASE-010 — documents.* (PHASES 2.7): HTTP xem phiên bản / liên kết / đính kèm, gửi / gỡ tệp, tải tệp cho mọi chứng từ
// [2026-11-01 12:47 AM Johnny Chu - Chu Hoàng Anh] PHASE-010 — sha256 có thể null (tệp Mua hàng chuyển ở 0046); loại tệp nhận gạch dưới
// [2026-11-01 03:13 PM Johnny Chu - Chu Hoàng Anh] PHASE-010 — core.document-signature.list (documents.signatures, 0047)
// [2026-11-18 Nguyễn Văn Thủy] Sổ chứng từ chung business_documents (0156): danh sách + một chứng từ đủ đầu phiếu, phiên bản, liên kết, đính kèm (đóng góp)
/**
 * Chứng từ dùng chung qua HTTP (bizcity_document@1 §7) — cho giao diện; module dùng ctx.documents.* trong action của mình.
 *   GET  /api/v1/document-versions?docRef=                core.document-version.list      các phiên bản (không kèm nội dung)
 *   GET  /api/v1/document-versions/:version?docRef=       core.document-version.get       một phiên bản kèm nội dung
 *   GET  /api/v1/document-links?docRef=                   core.document-link.list         liên kết đi ra / đi vào
 *   GET  /api/v1/document-attachments?docRef=             core.document-attachment.list   tệp đang đính
 *   POST /api/v1/document-attachments                     core.document-attachment.add    gửi tệp (base64); cùng tệp gửi lại → tệp cũ
 *   POST /api/v1/document-attachments/:id/archive         core.document-attachment.archive gỡ tệp (không xoá cứng)
 *   GET  /api/v1/document-attachments/:id/file            tải nội dung (kiểm sha256 trước khi trả)
 *   GET  /api/v1/document-signatures?docRef=              core.document-signature.list    chữ ký theo vai (ký / huỷ ký: ctx.documents trong action của module)
 *   GET  /api/v1/business-documents                       core.business-document.list     sổ chứng từ chung: lọc loại, trạng thái chuẩn, chi nhánh, ngày, số (0156)
 *   GET  /api/v1/business-documents/detail?docRef=        core.business-document.get      một chứng từ: đầu phiếu + phiên bản + liên kết + đính kèm
 * Gửi qua HTTP giới hạn bởi bodyLimit 20 MB của máy chủ (base64 ≈ 4/3 tệp) — tệp gần 15 MB nên gửi từ action của module.
 */
import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { DOC_LINK_ROLES, docRefSchema } from '@ketoan/contracts';
import { db, type Db } from '../../db/client.js';
import { authOf, requirePermission } from '../../core/auth.js';
import { idParamSchema } from '../../core/http.js';
import { defineAction, mountActions } from '../../core/actions.js';
import { documents } from '../../core/documents.js';
import { Errors } from '../../core/errors.js';
import { sql } from 'kysely';

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

const signatureList = defineAction({
  id: 'core.document-signature.list', title: 'Chữ ký trên chứng từ', tags,
  description: 'Chữ ký theo vai còn hiệu lực của chứng từ (docRef), mới → cũ; valid = ký đúng phiên bản hiện tại (phiên bản mới thì chữ ký cũ hết hiệu lực).',
  permission: 'documents:read', effect: 'read', idempotency: 'none',
  input: z.object({ docRef: docRefSchema }),
  output: z.object({ docRef: z.string(), currentVersion: z.number(), signatures: z.array(z.object({ role: z.string(), version: z.number(), signer: z.string(), signerName: z.string(), signedAt: z.string(), valid: z.boolean() })) }),
  expose: { http: { method: 'GET', path: '/api/v1/document-signatures' }, mcp: false, ai: 'read' },
  handler: async (ctx, q) => ({ docRef: q.docRef, currentVersion: await documents.currentVersion(ctx.data.tx, ctx.tenant.id, q.docRef), signatures: await documents.signatures(ctx.data.tx, ctx.tenant.id, q.docRef) }),
});

const STATUS = ['draft', 'pending', 'approved', 'in_progress', 'done', 'cancelled'] as const;
const businessDocOut = z.object({
  docRef: z.string(), module: z.string(), docType: z.string(), docNo: z.string(), docDate: z.string().nullable(), branchCode: z.string(),
  partnerRef: z.string(), partnerName: z.string(), title: z.string(), total: z.number(), statusRaw: z.string(), status: z.enum(STATUS), version: z.number(),
  meta: z.record(z.string(), z.unknown()), createdBy: z.string(), createdAt: z.string(), updatedAt: z.string(),
  approvedBy: z.string(), approvedAt: z.string().nullable(),
});
type BusinessDocRow = {
  doc_ref: string; module: string; doc_type: string; doc_no: string; doc_date: string | null; branch_code: string; work_branch_code: string | null; partner_ref: string; title: string;
  total: string; status_raw: string; status: (typeof STATUS)[number]; version: number; meta: unknown; created_by: string; created_at: unknown; updated_at: unknown;
  approved_by: string; approved_at: unknown;
};
const iso = (v: unknown) => (v instanceof Date ? v.toISOString() : String(v));
const toBusinessDoc = (r: BusinessDocRow, names: Map<string, string>) => ({
  docRef: r.doc_ref, module: r.module, docType: r.doc_type, docNo: r.doc_no, docDate: r.doc_date, branchCode: r.branch_code, workBranchCode: r.work_branch_code, partnerRef: r.partner_ref,
  partnerName: names.get(r.partner_ref) ?? '',
  title: r.title, total: Number(r.total), statusRaw: r.status_raw, status: r.status, version: r.version, meta: (r.meta ?? {}) as Record<string, unknown>,
  createdBy: r.created_by, createdAt: iso(r.created_at), updatedAt: iso(r.updated_at),
  approvedBy: r.approved_by ?? '', approvedAt: r.approved_at ? iso(r.approved_at) : null,
});
/** Tên đối tượng theo mã (partner_ref là mã đối tượng hoặc dt_…). */
async function partnerNames(tx: Db, tenantId: string, refs: string[]): Promise<Map<string, string>> {
  const keys = [...new Set(refs.filter(Boolean))];
  if (!keys.length) return new Map();
  const rows = await tx.selectFrom('partners').select(['code', 'uid', 'name']).where('tenant_id', '=', tenantId)
    .where((eb) => eb.or([eb('code', 'in', keys), eb('uid', 'in', keys)])).execute();
  const m = new Map<string, string>();
  for (const p of rows) { m.set(p.code, p.name); if (p.uid) m.set(p.uid, p.name); }
  return m;
}
const BD_COLS = ['doc_ref', 'module', 'doc_type', 'doc_no', sql<string>`doc_date::text`.as('doc_date'), 'branch_code', 'work_branch_code', 'partner_ref', 'title', 'total', 'status_raw', 'status',
  'version', 'meta', 'created_by', 'created_at', 'updated_at', 'approved_by', 'approved_at'] as const;

const businessDocList = defineAction({
  id: 'core.business-document.list', title: 'Sổ chứng từ chung', tags,
  description: 'Mọi chứng từ nghiệp vụ (đơn đặt, phiếu nhập, chuyển kho, đề nghị thanh toán…) ở một chỗ, theo trạng thái chuẩn draft / pending / approved / done / cancelled. Mới → cũ.',
  permission: 'documents:read', effect: 'read', idempotency: 'none',
  input: z.object({
    docType: z.string().max(60).optional().describe('Loại chứng từ, vd purchase.order, inventory.receipt, pricing.policy; hoặc tiền tố inventory.'),
    status: z.enum(STATUS).optional(), branchCode: z.string().max(60).optional(),
    from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(), to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    q: z.string().max(100).optional().describe('Tìm theo số chứng từ hoặc đối tượng'),
    limit: z.coerce.number().int().min(1).max(1000).default(200),
  }),
  output: z.object({ items: z.array(businessDocOut), counts: z.record(z.string(), z.number()) }),
  expose: { http: { method: 'GET', path: '/api/v1/business-documents' }, mcp: false, ai: 'read' },
  handler: async (ctx, q) => {
    let base = ctx.data.tx.selectFrom('business_documents').where('tenant_id', '=', ctx.tenant.id);
    if (q.docType) base = q.docType.endsWith('.') ? base.where('doc_type', 'like', `${q.docType}%`) : base.where('doc_type', '=', q.docType);
    if (q.branchCode) base = base.where('branch_code', '=', q.branchCode);
    if (q.from) base = base.where('doc_date', '>=', q.from);
    if (q.to) base = base.where('doc_date', '<=', q.to);
    if (q.q) { const like = `%${q.q.trim()}%`; base = base.where((eb) => eb.or([eb('doc_no', 'ilike', like), eb('partner_ref', 'ilike', like)])); }
    const counts = await base.select(['status', sql<string>`count(*)`.as('n')]).groupBy('status').execute();
    const rows = await (q.status ? base.where('status', '=', q.status) : base).select([...BD_COLS])
      .orderBy('doc_date', 'desc').orderBy('id', 'desc').limit(q.limit).execute();
    const list = rows as unknown as BusinessDocRow[];
    const names = await partnerNames(ctx.data.tx, ctx.tenant.id, list.map((r) => r.partner_ref));
    return { items: list.map((r) => toBusinessDoc(r, names)), counts: Object.fromEntries(counts.map((c) => [c.status, Number(c.n)])) };
  },
});

// [2026-11-19 10:46 AM Võ Hoàng] NT-BH-033 — tên loại của định danh chứng từ bán (pos / phieu-ban / voucher / loyalty)
const SALES_REF_TEXT: [string, string][] = [
  ['pos.order:', 'Đơn bán máy POS'], ['pos.return:', 'Phiếu trả hàng máy POS'], ['phieu-ban.order:', 'Đơn đặt hàng bán'],
  ['phieu-ban.doc:', 'Phiếu bán / trả hàng'], ['voucher.campaign:', 'Chiến dịch voucher'], ['loyalty.program:', 'Chương trình tích điểm'],
];

/** Tên dễ đọc cho phía bên kia của mỗi liên kết: chứng từ (loại + số), chính sách (mã + tên), lô (mã hàng · lô · HSD), sự việc kế toán (số), kỳ hợp đồng. */
async function labelLinks(tx: Db, tenantId: string, self: string, links: Awaited<ReturnType<typeof documents.links>>) {
  const other = (l: (typeof links)[number]) => (l.from === self ? l.to : l.from);
  const refs = [...new Set(links.map(other))];
  const idsOf = (prefix: string) => refs.filter((r) => r.startsWith(prefix)).map((r) => r.slice(prefix.length)).filter((x) => /^\d+$/.test(x));
  const label = new Map<string, string>();
  const docs = await tx.selectFrom('business_documents').select(['doc_ref', 'title', 'doc_no']).where('tenant_id', '=', tenantId).where('doc_ref', 'in', refs.length ? refs : ['-']).execute();
  for (const d of docs) label.set(d.doc_ref, `${d.title} ${d.doc_no}`.trim());
  const pol = idsOf('mua-hang.policy:');
  if (pol.length) for (const p of (await sql<{ id: string; code: string; name: string }>`SELECT id::text, code, name FROM purchase_policies WHERE tenant_id = ${tenantId} AND id = ANY(${pol}::bigint[])`.execute(tx)).rows) label.set(`mua-hang.policy:${p.id}`, `Chính sách ${p.code} — ${p.name}`);
  const lots = idsOf('kho.lot:');
  if (lots.length) for (const x of (await sql<{ id: string; sku: string; lot_no: string; exp: string | null }>`SELECT id::text, sku, lot_no, exp_date::text AS exp FROM item_lots WHERE tenant_id = ${tenantId} AND id = ANY(${lots}::bigint[])`.execute(tx)).rows) label.set(`kho.lot:${x.id}`, `Lô ${x.lot_no} · ${x.sku}${x.exp ? ` · HSD ${x.exp}` : ''}`);
  const sch = idsOf('hop-dong.schedule:');
  if (sch.length) for (const x of (await sql<{ id: string; contract_code: string; seq: number }>`SELECT id::text, contract_code, seq FROM contract_schedules WHERE tenant_id = ${tenantId} AND id = ANY(${sch}::bigint[])`.execute(tx)).rows) label.set(`hop-dong.schedule:${x.id}`, `Hợp đồng ${x.contract_code} — kỳ ${x.seq}`);
  const keys = refs.filter((r) => r.startsWith('ledger.event:')).map((r) => r.slice('ledger.event:'.length));
  if (keys.length) for (const e of (await sql<{ doc_key: string; doc_no: string | null; doc_type: string }>`SELECT doc_key, doc_no, doc_type FROM accounting_events WHERE tenant_id = ${tenantId} AND doc_key = ANY(${keys}::text[])`.execute(tx)).rows) label.set(`ledger.event:${e.doc_key}`, `Chứng từ kế toán ${e.doc_no ?? e.doc_key} (${e.doc_type})`);
  // [2026-11-19 10:46 AM Võ Hoàng] NT-BH-033 — chứng từ bán chưa có trong sổ (module chưa cài / chưa nạp): tên loại + mã thay cho định danh thô
  for (const r of refs) {
    if (label.has(r)) continue;
    const name = SALES_REF_TEXT.find(([p]) => r.startsWith(p));
    if (name) label.set(r, `${name[1]} ${r.slice(name[0].length)}`);
  }
  const docSet = new Set(docs.map((d) => d.doc_ref));
  return links.map((l) => ({ ...l, label: label.get(other(l)) ?? other(l), openable: docSet.has(other(l)) }));
}

const businessDocGet = defineAction({
  id: 'core.business-document.get', title: 'Một chứng từ (sổ chứng từ chung)', tags,
  description: 'Đầu phiếu của chứng từ (docRef) kèm các phiên bản, chứng từ liên quan (lập từ, sự việc kế toán sinh ra…) và tệp đính kèm.',
  permission: 'documents:read', effect: 'read', idempotency: 'none',
  input: z.object({ docRef: docRefSchema }),
  output: z.object({
    document: businessDocOut, versions: z.array(versionOut),
    links: z.array(z.object({ from: z.string(), to: z.string(), role: z.enum(DOC_LINK_ROLES), createdBy: z.string(), createdAt: z.string(),
      label: z.string().describe('Tên dễ đọc của chứng từ / đối tượng phía bên kia'), openable: z.boolean().describe('Có trong sổ chứng từ chung (mở được)') })),
    files: z.array(attachmentOut),
  }),
  expose: { http: { method: 'GET', path: '/api/v1/business-documents/detail' }, mcp: false, ai: 'read' },
  handler: async (ctx, q) => {
    const tx = ctx.data.tx;
    const r = await tx.selectFrom('business_documents').select([...BD_COLS]).where('tenant_id', '=', ctx.tenant.id).where('doc_ref', '=', q.docRef).executeTakeFirst();
    if (!r) throw Errors.notFound(`chứng từ ${q.docRef}`);
    return {
      document: toBusinessDoc(r as unknown as BusinessDocRow, await partnerNames(tx, ctx.tenant.id, [(r as unknown as BusinessDocRow).partner_ref])),
      versions: await documents.versions(tx, ctx.tenant.id, q.docRef),
      links: await labelLinks(tx, ctx.tenant.id, q.docRef, await documents.links(tx, ctx.tenant.id, q.docRef)),
      files: await documents.attachments(tx, ctx.tenant.id, q.docRef),
    };
  },
});

export const docRefActions = [versionList, versionGet, linkList, attachmentList, attachmentAdd, attachmentArchive, signatureList, businessDocList, businessDocGet];

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
