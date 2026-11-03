// @bizcity-layer P documents/links
// [2026-10-29 10:24 PM Johnny Chu - Chu Hoàng Anh] INIT — khởi tạo Bizcity Core Framework: sổ cái chỉ thêm, cửa nạp sự việc, CANON, hợp đồng, bộ kiểm chuẩn.
// [2026-10-30 09:58 AM Johnny Chu - Chu Hoàng Anh] PHASE-002 — nhãn lớp @bizcity-layer, đồ thị phụ thuộc mốc, bản nháp API module-sdk.
/**
 * Chứng từ nguồn (đơn đặt hàng, báo giá, phiếu nhập / xuất…): nhận từ hệ thống khác, chỉ lưu, không ghi sổ.
 *   GET   /api/v1/reference-documents?kind=&status=&partnerCode=&search=&from=&to=
 *   PUT   /api/v1/reference-documents          nhận / cập nhật hàng loạt theo docKey (tối đa 500)
 *   PATCH /api/v1/reference-documents/:id      đổi trạng thái (mở lại, đóng)
 */
import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { REFERENCE_DOC_KINDS } from '@ketoan/contracts';
import { db, toNumber, type Db } from '../../db/client.js';
import type { Insertable } from 'kysely';
import type { Database } from '@bizcity/platform/db/types';
import { authOf, requirePermission } from '../../core/auth.js';
import { Errors } from '../../core/errors.js';
import { idParamSchema, ok, pageMeta, pageQuerySchema } from '../../core/http.js';
import { writeAudit } from '../../core/audit.js';
import { partnerRepository } from '../partners/partner.repository.js';
import { defineAction, mountActions, type AnyActionDef, sameTx } from '@bizcity/platform/core/actions';

const tags = ['Chứng từ nguồn'];
const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const KIND_CODES = Object.keys(REFERENCE_DOC_KINDS) as [string, ...string[]];
/** Chứng từ nguồn phía mua: đối tượng tự thêm là nhà cung cấp. */
const SUPPLIER_KINDS = new Set(['purchase_order', 'purchase_quotation', 'goods_receipt', 'purchase_return', 'purchase_invoice']);

const item = z.object({
  kind: z.enum(KIND_CODES),
  docKey: z.string().trim().min(3).max(160).describe('Khoá ổn định của chứng từ ở hệ thống nguồn'),
  docNo: z.string().trim().min(1).max(64),
  docDate: day,
  partner: z.object({ code: z.string().trim().min(1).max(64), name: z.string().trim().max(255).default(''), taxCode: z.string().trim().max(32).optional() }).optional(),
  branchCode: z.string().trim().max(32).default(''),
  total: z.number().finite().min(0).default(0),
  dueDate: day.optional(),
  description: z.string().trim().max(1000).default(''),
  payload: z.record(z.unknown()).default({}).describe('Nội dung gốc (dòng hàng…) lưu nguyên để xem'),
  status: z.enum(['open', 'closed']).optional().describe('closed = đơn đã huỷ / đóng ở hệ thống nguồn'),
});

// [2026-11-03 12:10 AM Johnny Chu - Chu Hoàng Anh] PHASE-014 — W5 (SC-MOD-2): phân hệ thêm chứng từ tham chiếu qua hàm của module sở hữu bảng (không ghi thẳng reference_documents)
/** Thêm chứng từ tham chiếu theo docKey (đã có thì giữ nguyên). Trả true khi vừa thêm. */
export async function ensureReferenceDocument(trx: Db, tenantId: string, v: Omit<Insertable<Database['reference_documents']>, 'tenant_id'>): Promise<boolean> {
  const r = await trx.insertInto('reference_documents').values({ ...v, tenant_id: tenantId }).onConflict((oc) => oc.columns(['tenant_id', 'doc_key']).doNothing()).returning('id').executeTakeFirst();
  return Boolean(r);
}

export async function referenceDocumentRoutes(app: FastifyInstance): Promise<void> {
  const r = app.withTypeProvider<ZodTypeProvider>();

  r.get('/api/v1/reference-documents', {
    preHandler: requirePermission('documents:read'),
    schema: {
      tags,
      summary: 'Danh sách chứng từ nguồn',
      querystring: pageQuerySchema.extend({
        kind: z.string().optional().describe('Một hoặc nhiều loại, cách nhau dấu phẩy'),
        status: z.enum(['open', 'used', 'closed', 'all']).default('open'),
        partnerCode: z.string().trim().optional(),
        search: z.string().trim().optional(),
        from: day.optional(),
        to: day.optional(),
      }),
    },
    handler: async (req) => {
      const auth = authOf(req);
      const f = req.query;
      let q = db.selectFrom('reference_documents as d').leftJoin('partners as p', 'p.id', 'd.partner_id').leftJoin('accounting_events as e', 'e.id', 'd.used_event_id').where('d.tenant_id', '=', auth.tenantId);
      if (f.kind) q = q.where('d.kind', 'in', f.kind.split(',').map((x) => x.trim()).filter(Boolean));
      if (f.status !== 'all') q = q.where('d.status', '=', f.status);
      if (f.partnerCode) q = q.where('p.code', '=', f.partnerCode);
      if (f.search) q = q.where((eb) => eb.or([eb('d.doc_no', 'ilike', `%${f.search}%`), eb('d.description', 'ilike', `%${f.search}%`)]));
      if (f.from) q = q.where('d.doc_date', '>=', f.from);
      if (f.to) q = q.where('d.doc_date', '<=', f.to);
      const [rows, total] = await Promise.all([
        q.select(['d.id', 'd.kind', 'd.doc_key', 'd.doc_no', 'd.doc_date', 'd.branch_code', 'd.total', 'd.due_date', 'd.description', 'd.source_system', 'd.status', 'd.used_event_id', 'd.payload', 'p.code as partner_code', 'p.name as partner_name', 'e.doc_no as used_doc_no'])
          .orderBy('d.doc_date', 'desc').orderBy('d.id', 'desc').limit(f.pageSize).offset((f.page - 1) * f.pageSize).execute(),
        q.select((eb) => eb.fn.countAll<string>().as('n')).executeTakeFirst(),
      ]);
      return ok(rows.map((x) => ({
        id: x.id, kind: x.kind, kindLabel: REFERENCE_DOC_KINDS[x.kind as keyof typeof REFERENCE_DOC_KINDS] ?? x.kind, docKey: x.doc_key, docNo: x.doc_no, docDate: x.doc_date,
        partnerCode: x.partner_code ?? '', partnerName: x.partner_name ?? '', branchCode: x.branch_code, total: toNumber(x.total), dueDate: x.due_date, description: x.description,
        sourceSystem: x.source_system, status: x.status, usedDocumentId: x.used_event_id, usedDocNo: x.used_doc_no, payload: x.payload,
      })), pageMeta(f, Number(total?.n ?? 0)));
    },
  });
  mountActions(app, referenceDocumentWriteActions);
}

// [2026-11-03 04:00 AM Johnny Chu - Chu Hoàng Anh] PHASE-014 — W6 đợt 3 (SC-ACT-1): route ghi qua defineAction — quyền, kiểm input, idempotency, giao dịch, bằng chứng do runtime; đường dẫn / thân yêu cầu / mã 201 như cũ.
// Mã cũ trong handler chạy trong giao dịch của action (sameTx); service tự mở giao dịch có bản *In.
const anyOut = z.custom<object>((v) => typeof v === 'object' && v !== null);

export const referenceDocumentWriteActions: AnyActionDef[] = [
  defineAction({
    id: 'core.reference-document.sync', title: 'Nhận chứng từ nguồn từ hệ thống mua hàng / bán hàng', tags,
    description: 'Tạo mới hoặc cập nhật theo docKey. Chỉ lưu để kế toán chọn khi lập phiếu công nợ; không ghi sổ. Chứng từ đã dùng (đã lập phiếu) giữ nguyên trạng thái.',
    permission: 'documents:write', effect: 'write', sideEffects: ['documents'], idempotency: 'natural',
    input: z.object({ source: z.string().trim().max(32).default('external'), documents: z.array(item).min(1).max(500) }), output: anyOut,
    expose: { http: { method: 'PUT', path: '/api/v1/reference-documents' }, mcp: false, ai: 'deny' },
    evidence: { objectType: 'reference_document' },
    handler: async (ctx, input) => {
      const trx = ctx.data.tx;
      const auth = ctx.legacyAuth;
      const { source, documents } = input;
      await sameTx(trx, async (trx) => {
        for (const d of documents) {
          const partnerId = d.partner ? await partnerRepository.upsert(trx, auth.tenantId, d.partner, SUPPLIER_KINDS.has(d.kind) ? 'supplier' : 'customer') : null;
          const values = {
            kind: d.kind, doc_no: d.docNo, doc_date: d.docDate, partner_id: partnerId, branch_code: d.branchCode, total: d.total, due_date: d.dueDate ?? null,
            description: d.description, source_system: source, payload: JSON.stringify(d.payload), updated_at: new Date(),
          };
          await trx.insertInto('reference_documents').values({ tenant_id: auth.tenantId, doc_key: d.docKey, ...values, status: d.status ?? 'open' })
            .onConflict((oc) => oc.columns(['tenant_id', 'doc_key']).doUpdateSet((eb) => ({
              ...values,
              // Đã lập phiếu thì giữ "đã dùng"; còn lại theo bên gửi (không gửi = giữ nguyên).
              status: d.status ? eb.case().when('reference_documents.status', '=', 'used').then('used').else(d.status).end() : eb.ref('reference_documents.status'),
            }))).execute();
        }
        await writeAudit(trx, { tenantId: auth.tenantId, actor: auth.actor, action: 'reference_document.sync', objectType: 'reference_document', objectId: `${documents.length} chứng từ`, after: { source, keys: documents.map((d) => d.docKey).slice(0, 50) } });
      });
      return { count: documents.length };
    },
  }),
  defineAction({
    id: 'core.reference-document.update', title: 'Đóng / mở lại chứng từ nguồn', tags,
    permission: 'documents:write', effect: 'write', sideEffects: ['documents'], idempotency: 'natural',
    input: (z.object({ status: z.enum(['open', 'closed']) })).merge(idParamSchema), output: anyOut,
    expose: { http: { method: 'PATCH', path: '/api/v1/reference-documents/:id' }, mcp: false, ai: 'deny' },
    evidence: { objectType: 'reference_document', objectId: (i) => String(i.id) },
    handler: async (ctx, input) => {
      const { id: _id, ...reqBody } = input;
      const trx = ctx.data.tx;
      const auth = ctx.legacyAuth;
      const res = await trx.updateTable('reference_documents').set({ status: reqBody.status, used_event_id: null, updated_at: new Date() }).where('tenant_id', '=', auth.tenantId).where('id', '=', input.id).executeTakeFirst();
      if (!Number(res.numUpdatedRows)) throw Errors.notFound('chứng từ nguồn');
      return { id: input.id, status: reqBody.status };
    },
  }),
];
