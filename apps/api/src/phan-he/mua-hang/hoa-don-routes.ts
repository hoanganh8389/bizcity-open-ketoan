// @bizcity-layer D modules/mua-hang
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
 *   POST   /api/v1/purchase/invoices/ingest-xml      nhận hoá đơn điện tử XML kèm tệp gốc (màn MH22, cầu nối)
 *   GET    /api/v1/purchase/invoice-aliases          bảng nhận diện mã NCC (dữ liệu học)
 *   DELETE /api/v1/purchase/invoice-aliases/:id      xoá một cách ghi đã học (nhật ký ghi đủ nội dung)
 */
import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import type { ParsedInvoice } from '@bizcity/mua-hang-domain';
import { db } from '../../db/client.js';
import { authOf, requirePermission } from '../../core/auth.js';
import { idParamSchema, ok } from '../../core/http.js';
import { listDocs } from './store.js';
import { listPolicies } from './store.js';
import {
  cancelInvoice, deleteAlias, getInvoice, importInvoices, invoiceInputSchema, listAliases, listInvoices, parsedInvoiceSchema, prepareInvoices, saveInvoice, scanConfigured, scanInvoice,
} from './hoa-don.js';
import { ingestInvoiceXml, ingestXmlSchema } from './hoa-don-xml.js';
import { defineAction, mountActions, type AnyActionDef, sameTx } from '@bizcity/platform/core/actions';

const tags = ['Mua hàng — Hoá đơn NCC'];
const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

// [2026-11-03 04:00 AM Johnny Chu - Chu Hoàng Anh] PHASE-014 — W6 đợt 3 (SC-ACT-1): trợ giúp dời ra cấp tệp để action dùng chung
const invoiceCtx = async (tenantId: string, partnerCode?: string) => ({ docs: await listDocs(db, tenantId, { kind: 'receipt', partnerCode }), policies: await listPolicies(db, tenantId) });

export async function invoiceRoutes(app: FastifyInstance): Promise<void> {
  const r = app.withTypeProvider<ZodTypeProvider>();
  const read = requirePermission('documents:read');
  const write = requirePermission('documents:write');

  r.get('/api/v1/purchase/invoices', { preHandler: read, schema: { tags, summary: 'Hoá đơn NCC + tình trạng đối soát', querystring: z.object({ partnerCode: z.string().optional(), from: day.optional(), to: day.optional(), status: z.enum(['active', 'cancelled']).optional() }) },
    handler: async (req) => { const a = authOf(req); const c = await invoiceCtx(a.tenantId, req.query.partnerCode); return ok(await listInvoices(db, a.tenantId, c.docs, c.policies, req.query)); } });
  r.get('/api/v1/purchase/invoices/scan/config', { preHandler: read, schema: { tags, summary: 'Dịch vụ đọc hoá đơn (AI) đã cấu hình chưa' }, handler: async () => ok({ configured: scanConfigured() }) });
  r.get('/api/v1/purchase/invoices/:id', { preHandler: read, schema: { tags, summary: 'Một hoá đơn NCC + gợi ý mã + đối soát phiếu nhập', params: idParamSchema },
    handler: async (req) => { const a = authOf(req); const inv = await db.selectFrom('supplier_invoices').select('partner_code').where('tenant_id', '=', a.tenantId).where('id', '=', req.params.id).executeTakeFirst(); const c = await invoiceCtx(a.tenantId, inv?.partner_code ?? '-'); return ok(await getInvoice(db, a.tenantId, req.params.id, c.docs, c.policies)); } });

  r.get('/api/v1/purchase/invoice-aliases', { preHandler: read, schema: { tags, summary: 'Bảng nhận diện mã hàng NCC (dữ liệu học)', querystring: z.object({ partnerCode: z.string().optional() }) },
    handler: async (req) => ok(await listAliases(db, authOf(req).tenantId, req.query.partnerCode)) });
  mountActions(app, hoaDonRoutesWriteActions);
  mountActions(app, hoaDonRoutesMoreWriteActions);
}

// [2026-11-03 04:00 AM Johnny Chu - Chu Hoàng Anh] PHASE-014 — W6 đợt 3 (SC-ACT-1): route ghi qua defineAction — quyền, kiểm input, idempotency, giao dịch, bằng chứng do runtime; đường dẫn / thân yêu cầu / mã 201 như cũ.
// Mã cũ trong handler chạy trong giao dịch của action (sameTx); service tự mở giao dịch có bản *In.
const anyOut = z.custom<object>((v) => typeof v === 'object' && v !== null);

export const hoaDonRoutesWriteActions: AnyActionDef[] = [
  defineAction({
    id: 'mua-hang.invoice.create', title: 'Thêm hoá đơn NCC', tags,
    permission: 'documents:write', effect: 'write', sideEffects: ['documents'], idempotency: 'required',
    input: invoiceInputSchema, output: anyOut,
    expose: { http: { method: 'POST', path: '/api/v1/purchase/invoices', status: 201 }, mcp: false, ai: 'deny' },
    evidence: { objectType: 'invoice' },
    handler: async (ctx, input) => {
      const trx = ctx.data.tx; const a = ctx.legacyAuth; return await sameTx(trx, (trx) => saveInvoice(trx, a.tenantId, a.actorName, input)); },
  }),
  defineAction({
    id: 'mua-hang.invoice.update', title: 'Sửa hoá đơn NCC', tags,
    permission: 'documents:write', effect: 'write', sideEffects: ['documents'], idempotency: 'natural',
    input: (invoiceInputSchema).merge(idParamSchema), output: anyOut,
    expose: { http: { method: 'PUT', path: '/api/v1/purchase/invoices/:id' }, mcp: false, ai: 'deny' },
    evidence: { objectType: 'invoice', objectId: (i) => String(i.id) },
    handler: async (ctx, input) => {
      const { id: _id, ...reqBody } = input;
      const trx = ctx.data.tx; const a = ctx.legacyAuth; return await sameTx(trx, (trx) => saveInvoice(trx, a.tenantId, a.actorName, reqBody, input.id)); },
  }),
  defineAction({
    id: 'mua-hang.invoice.cancel', title: 'Huỷ hoá đơn NCC (bắt buộc lý do)', tags,
    permission: 'documents:write', effect: 'write', sideEffects: ['documents'], idempotency: 'natural',
    input: (z.object({ reason: z.string().trim().min(3, 'Ghi lý do huỷ') })).merge(idParamSchema), output: anyOut,
    expose: { http: { method: 'POST', path: '/api/v1/purchase/invoices/:id/cancel' }, mcp: false, ai: 'deny' },
    evidence: { objectType: 'invoice', objectId: (i) => String(i.id) },
    handler: async (ctx, input) => {
      const { id: _id, ...reqBody } = input;
      const trx = ctx.data.tx; const a = ctx.legacyAuth; await sameTx(trx, (trx) => cancelInvoice(trx, a.tenantId, a.actorName, input.id, reqBody.reason)); return { id: input.id }; },
  }),
  defineAction({
    id: 'mua-hang.invoice.prepare', title: 'Chuẩn hoá + nhận diện mã + báo trùng (không lưu)', tags,
    permission: 'documents:read', effect: 'read', idempotency: 'none',
    input: z.object({ partnerCode: z.string().default(''), invoices: z.array(parsedInvoiceSchema).min(1).max(500) }), output: anyOut,
    expose: { http: { method: 'POST', path: '/api/v1/purchase/invoices/prepare' }, mcp: false, ai: 'read' },
    handler: async (ctx, input) => {
      const trx = ctx.data.tx;
      return await prepareInvoices(trx, ctx.legacyAuth.tenantId, input.partnerCode, input.invoices as ParsedInvoice[]);
    },
  }),
  defineAction({
    id: 'mua-hang.invoice.import', title: 'Ghi nhiều hoá đơn NCC (trùng bỏ qua)', tags,
    permission: 'documents:write', effect: 'write', sideEffects: ['documents'], idempotency: 'natural',
    input: z.object({ invoices: z.array(invoiceInputSchema).min(1).max(500) }), output: anyOut,
    expose: { http: { method: 'POST', path: '/api/v1/purchase/invoices/import' }, mcp: false, ai: 'deny' },
    evidence: { objectType: 'invoice' },
    handler: async (ctx, input) => {
      const trx = ctx.data.tx; const a = ctx.legacyAuth; return await sameTx(trx, (trx) => importInvoices(trx, a.tenantId, a.actorName, input.invoices)); },
  }),
  defineAction({
    id: 'mua-hang.invoice-alias.delete', title: 'Xoá một cách ghi đã học', tags,
    permission: 'documents:write', effect: 'write', sideEffects: ['documents'], idempotency: 'natural',
    input: idParamSchema, output: anyOut,
    expose: { http: { method: 'DELETE', path: '/api/v1/purchase/invoice-aliases/:id' }, mcp: false, ai: 'deny' },
    evidence: { objectType: 'invoice_alias', objectId: (i) => String(i.id) },
    handler: async (ctx, input) => {
      const trx = ctx.data.tx; const a = ctx.legacyAuth; await deleteAlias(trx, a.tenantId, a.actorName, input.id); return { deleted: true }; },
  }),
];

// [2026-11-03 08:00 AM Johnny Chu - Chu Hoàng Anh] PHASE-014 — W6 đợt 5 (SC-ACT-1): route ghi qua defineAction — quyền, kiểm input, idempotency, giao dịch, bằng chứng do runtime; đường dẫn / thân yêu cầu / mã 201 như cũ.
// Mã cũ trong handler chạy trong giao dịch của action (sameTx); service tự mở giao dịch có bản *In.


export const hoaDonRoutesMoreWriteActions: AnyActionDef[] = [
  // [2026-11-06 10:25 PM Nguyễn Văn Thủy] MH22 — nhận một hoá đơn điện tử XML kèm tệp gốc; từng hoá đơn một giao dịch để hoá đơn lỗi không kéo theo hoá đơn khác (đóng góp)
  defineAction({
    id: 'mua-hang.invoice.ingest-xml', title: 'Nhận hoá đơn điện tử XML kèm tệp gốc', tags,
    description: 'Đọc XML, kiểm người mua, tìm hoặc tạo NCC theo MST, lưu hoá đơn. Trùng thì chỉ đính thêm tệp mới. Hoá đơn bị thay thế / huỷ không nhập.',
    permission: 'documents:write', effect: 'write', sideEffects: ['documents', 'masterdata'], idempotency: 'natural',
    input: ingestXmlSchema, output: anyOut,
    expose: { http: { method: 'POST', path: '/api/v1/purchase/invoices/ingest-xml', bodyLimit: 24 * 1024 * 1024 }, mcp: false, ai: 'deny' },
    evidence: { objectType: 'invoice', objectId: (_i, o) => (o as { invoiceId?: string } | undefined)?.invoiceId },
    handler: async (ctx, input) => {
      const trx = ctx.data.tx; const a = ctx.legacyAuth; return await sameTx(trx, (trx) => ingestInvoiceXml(trx, a.tenantId, a.actor, a.actorName, input)); },
  }),
  defineAction({
    id: 'mua-hang.invoice.scan', title: 'Đọc ảnh / PDF hoá đơn bằng dịch vụ ngoài (AI) → xem trước', tags,
    permission: 'documents:write', effect: 'write', sideEffects: ['external'], idempotency: 'natural',
    input: z.object({ partnerCode: z.string().min(1), fileName: z.string().min(1).max(200), mime: z.string().max(120).default(''), dataBase64: z.string().min(1) }), output: anyOut,
    expose: { http: { method: 'POST', path: '/api/v1/purchase/invoices/scan', bodyLimit: 30 * 1024 * 1024 }, mcp: false, ai: 'deny' },
    evidence: { objectType: 'invoice' },
    handler: async (ctx, input) => {
      const trx = ctx.data.tx; const a = ctx.legacyAuth; return await scanInvoice(trx, a.tenantId, a.actorName, input); },
  }),
];
