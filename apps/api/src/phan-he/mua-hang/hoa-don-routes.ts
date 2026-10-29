/**
 * API Hoá đơn đầu vào của NCC (MH22) — hợp đồng: docs/api/14-mua-hang.md § Hoá đơn NCC.
 *   GET    /api/v1/purchase/invoices                 danh sách + tình trạng (chưa nhận diện / chưa có phiếu / lệch / khớp)
 *   GET    /api/v1/purchase/invoices/:id             một hoá đơn + gợi ý mã + phiếu nhập cùng số + đối soát
 *   POST   /api/v1/purchase/invoices                 thêm (trùng NCC × ký hiệu × số → 409)
 *   PUT    /api/v1/purchase/invoices/:id             sửa (đã huỷ → 409)
 *   POST   /api/v1/purchase/invoices/:id/cancel      huỷ (bắt buộc lý do) — chứng từ không xoá
 *   POST   /api/v1/purchase/invoices/prepare         hoá đơn đọc được (Excel / API) → chuẩn hoá + nhận diện + báo trùng (không lưu)
 *   POST   /api/v1/purchase/invoices/import          ghi nhiều hoá đơn (trùng bỏ qua)
 *   GET    /api/v1/purchase/invoices/scan/config     đã cấu hình dịch vụ đọc hoá đơn (AI) chưa
 *   POST   /api/v1/purchase/invoices/scan            gửi ảnh / PDF sang dịch vụ đọc hoá đơn → xem trước như prepare
 *   GET    /api/v1/purchase/invoice-aliases          bảng nhận diện mã NCC (dữ liệu học)
 *   DELETE /api/v1/purchase/invoice-aliases/:id      xoá một cách ghi đã học (nhật ký ghi đủ nội dung)
 */
import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import type { ParsedInvoice } from '@ketoan/contracts/mua-hang';
import { db } from '../../db/client.js';
import { authOf, requirePermission } from '../../core/auth.js';
import { idParamSchema, ok } from '../../core/http.js';
import { listDocs } from './store.js';
import { listPolicies } from './store.js';
import {
  cancelInvoice, deleteAlias, getInvoice, importInvoices, invoiceInputSchema, listAliases, listInvoices, parsedInvoiceSchema, prepareInvoices, saveInvoice, scanConfigured, scanInvoice,
} from './hoa-don.js';

const tags = ['Mua hàng — Hoá đơn NCC'];
const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

export async function invoiceRoutes(app: FastifyInstance): Promise<void> {
  const r = app.withTypeProvider<ZodTypeProvider>();
  const read = requirePermission('documents:read');
  const write = requirePermission('documents:write');
  const ctx = async (tenantId: string, partnerCode?: string) => ({ docs: await listDocs(db, tenantId, { kind: 'receipt', partnerCode }), policies: await listPolicies(db, tenantId) });

  r.get('/api/v1/purchase/invoices', { preHandler: read, schema: { tags, summary: 'Hoá đơn NCC + tình trạng đối soát', querystring: z.object({ partnerCode: z.string().optional(), from: day.optional(), to: day.optional(), status: z.enum(['active', 'cancelled']).optional() }) },
    handler: async (req) => { const a = authOf(req); const c = await ctx(a.tenantId, req.query.partnerCode); return ok(await listInvoices(db, a.tenantId, c.docs, c.policies, req.query)); } });
  r.get('/api/v1/purchase/invoices/scan/config', { preHandler: read, schema: { tags, summary: 'Dịch vụ đọc hoá đơn (AI) đã cấu hình chưa' }, handler: async () => ok({ configured: scanConfigured() }) });
  r.get('/api/v1/purchase/invoices/:id', { preHandler: read, schema: { tags, summary: 'Một hoá đơn NCC + gợi ý mã + đối soát phiếu nhập', params: idParamSchema },
    handler: async (req) => { const a = authOf(req); const inv = await db.selectFrom('supplier_invoices').select('partner_code').where('tenant_id', '=', a.tenantId).where('id', '=', req.params.id).executeTakeFirst(); const c = await ctx(a.tenantId, inv?.partner_code ?? '-'); return ok(await getInvoice(db, a.tenantId, req.params.id, c.docs, c.policies)); } });
  r.post('/api/v1/purchase/invoices', { preHandler: write, schema: { tags, summary: 'Thêm hoá đơn NCC', body: invoiceInputSchema },
    handler: async (req, reply) => { const a = authOf(req); return reply.code(201).send(ok(await db.transaction().execute((trx) => saveInvoice(trx, a.tenantId, a.actorName, req.body)))); } });
  r.put('/api/v1/purchase/invoices/:id', { preHandler: write, schema: { tags, summary: 'Sửa hoá đơn NCC', params: idParamSchema, body: invoiceInputSchema },
    handler: async (req) => { const a = authOf(req); return ok(await db.transaction().execute((trx) => saveInvoice(trx, a.tenantId, a.actorName, req.body, req.params.id))); } });
  r.post('/api/v1/purchase/invoices/:id/cancel', { preHandler: write, schema: { tags, summary: 'Huỷ hoá đơn NCC (bắt buộc lý do)', params: idParamSchema, body: z.object({ reason: z.string().trim().min(3, 'Ghi lý do huỷ') }) },
    handler: async (req) => { const a = authOf(req); await db.transaction().execute((trx) => cancelInvoice(trx, a.tenantId, a.actorName, req.params.id, req.body.reason)); return ok({ id: req.params.id }); } });
  r.post('/api/v1/purchase/invoices/prepare', { preHandler: read, schema: { tags, summary: 'Chuẩn hoá + nhận diện mã + báo trùng (không lưu)', body: z.object({ partnerCode: z.string().default(''), invoices: z.array(parsedInvoiceSchema).min(1).max(500) }) },
    handler: async (req) => ok(await prepareInvoices(db, authOf(req).tenantId, req.body.partnerCode, req.body.invoices as ParsedInvoice[])) });
  r.post('/api/v1/purchase/invoices/import', { preHandler: write, schema: { tags, summary: 'Ghi nhiều hoá đơn NCC (trùng bỏ qua)', body: z.object({ invoices: z.array(invoiceInputSchema).min(1).max(500) }) },
    handler: async (req) => { const a = authOf(req); return ok(await db.transaction().execute((trx) => importInvoices(trx, a.tenantId, a.actorName, req.body.invoices))); } });
  r.post('/api/v1/purchase/invoices/scan', { preHandler: write, bodyLimit: 30 * 1024 * 1024, schema: { tags, summary: 'Đọc ảnh / PDF hoá đơn bằng dịch vụ ngoài (AI) → xem trước', body: z.object({ partnerCode: z.string().min(1), fileName: z.string().min(1).max(200), mime: z.string().max(120).default(''), dataBase64: z.string().min(1) }) },
    handler: async (req) => { const a = authOf(req); return ok(await scanInvoice(db, a.tenantId, a.actorName, req.body)); } });

  r.get('/api/v1/purchase/invoice-aliases', { preHandler: read, schema: { tags, summary: 'Bảng nhận diện mã hàng NCC (dữ liệu học)', querystring: z.object({ partnerCode: z.string().optional() }) },
    handler: async (req) => ok(await listAliases(db, authOf(req).tenantId, req.query.partnerCode)) });
  r.delete('/api/v1/purchase/invoice-aliases/:id', { preHandler: write, schema: { tags, summary: 'Xoá một cách ghi đã học', params: idParamSchema },
    handler: async (req) => { const a = authOf(req); await deleteAlias(db, a.tenantId, a.actorName, req.params.id); return ok({ deleted: true }); } });
}
