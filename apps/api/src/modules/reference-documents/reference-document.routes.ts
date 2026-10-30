// @bizcity-layer P documents/links
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
import { db, toNumber } from '../../db/client.js';
import { authOf, requirePermission } from '../../core/auth.js';
import { Errors } from '../../core/errors.js';
import { idParamSchema, ok, pageMeta, pageQuerySchema } from '../../core/http.js';
import { writeAudit } from '../../core/audit.js';
import { partnerRepository } from '../partners/partner.repository.js';

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

  r.put('/api/v1/reference-documents', {
    preHandler: requirePermission('documents:write'),
    schema: {
      tags,
      summary: 'Nhận chứng từ nguồn từ hệ thống mua hàng / bán hàng',
      description: 'Tạo mới hoặc cập nhật theo docKey. Chỉ lưu để kế toán chọn khi lập phiếu công nợ; không ghi sổ. Chứng từ đã dùng (đã lập phiếu) giữ nguyên trạng thái.',
      body: z.object({ source: z.string().trim().max(32).default('external'), documents: z.array(item).min(1).max(500) }),
    },
    handler: async (req) => {
      const auth = authOf(req);
      const { source, documents } = req.body;
      await db.transaction().execute(async (trx) => {
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
      return ok({ count: documents.length });
    },
  });

  r.patch('/api/v1/reference-documents/:id', {
    preHandler: requirePermission('documents:write'),
    schema: { tags, summary: 'Đóng / mở lại chứng từ nguồn', params: idParamSchema, body: z.object({ status: z.enum(['open', 'closed']) }) },
    handler: async (req) => {
      const auth = authOf(req);
      const res = await db.updateTable('reference_documents').set({ status: req.body.status, used_event_id: null, updated_at: new Date() }).where('tenant_id', '=', auth.tenantId).where('id', '=', req.params.id).executeTakeFirst();
      if (!Number(res.numUpdatedRows)) throw Errors.notFound('chứng từ nguồn');
      return ok({ id: req.params.id, status: req.body.status });
    },
  });
}
