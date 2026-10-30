// @bizcity-layer K kernel/intake
/**
 * Chứng từ gốc.
 *   POST /api/v1/documents              gửi một chứng từ (khuôn ở @ketoan/contracts → documents.ts)
 *   POST /api/v1/documents/batch        gửi tối đa 200 chứng từ
 *   POST /api/v1/documents/cancel       huỷ chứng từ theo docKey (đảo bút toán); hệ thống nguồn gọi bằng khoá API thì chỉ
 *                                       đưa chứng từ về cổng chờ (Chờ huỷ) — kế toán định khoản ở ACC14 mới huỷ
 *   GET  /api/v1/documents              danh sách (lọc ngày, chi nhánh, trạng thái, loại, nguồn, loại phiếu nguồn, tìm kiếm)
 *   GET  /api/v1/documents/:id          chi tiết + bút toán
 *   POST /api/v1/documents/post         trạm định khoản (ACC14): định khoản / định khoản lại các chứng từ đã chọn
 *   GET  /api/v1/documents/:id/preview  xem trước định khoản (chạy thử rồi huỷ, không ghi gì)
 *   GET  /api/v1/documents/:id/posting-log  nhật ký định khoản của một chứng từ
 *   GET  /api/v1/posting-log            nhật ký định khoản theo ngày, loại chứng từ, hành động, chi nhánh
 * Chứng từ gửi vào được lưu và hiện ở trạm ACC14; loại chứng từ đặt chế độ "chờ định khoản" (mặc định) thì chỉ vào sổ
 * khi kế toán định khoản ở trạm.
 */
import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { VOUCHER_MONEY, ingestBatchSchema, ingestDocumentSchema, type VoucherType } from '@ketoan/contracts';
import { db, toNumber } from '../../db/client.js';
import { authOf, requirePermission } from '../../core/auth.js';
import { ok, pageMeta, pageQuerySchema, idParamSchema } from '../../core/http.js';
import { documentService } from './document.service.js';
import { registerActions } from '../../core/actions.js';
import { documentActions } from './document.actions.js';

const tags = ['Chứng từ'];
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

interface VoucherInfoRow {
  doc_type: string; created_by: string | null; updated_by: string | null; reason_code: string | null; employee_code: string | null; phone: string | null; address: string | null;
  first_debit: string | null; first_credit: string | null; line_invoice_no: string | null; created_at: Date | null; updated_at: Date | null;
}
/** Tra một lần tên nhân viên, tên người tạo / sửa cho cả trang danh sách phiếu thu chi. */
async function voucherListNames(tenantId: string, rows: VoucherInfoRow[]) {
  const actors = [...new Set(rows.flatMap((r) => [r.created_by, r.updated_by]).filter((a): a is string => Boolean(a)))];
  const userIds = actors.filter((a) => a.startsWith('user:')).map((a) => a.slice(5));
  const keyIds = actors.filter((a) => a.startsWith('apikey:')).map((a) => a.slice(7));
  const empCodes = [...new Set(rows.map((r) => r.employee_code).filter((c): c is string => Boolean(c)))];
  const [users, keys, emps] = await Promise.all([
    userIds.length ? db.selectFrom('users').select(['id', 'full_name']).where('tenant_id', '=', tenantId).where('id', 'in', userIds).execute() : [],
    keyIds.length ? db.selectFrom('api_keys').select(['id', 'name']).where('tenant_id', '=', tenantId).where('id', 'in', keyIds).execute() : [],
    empCodes.length ? db.selectFrom('dimensions').select(['code', 'name']).where('tenant_id', '=', tenantId).where('kind', '=', 'employee').where('code', 'in', empCodes).execute() : [],
  ]);
  const names = new Map<string, string>([...users.map((u) => [`user:${u.id}`, u.full_name] as const), ...keys.map((k) => [`apikey:${k.id}`, k.name] as const)]);
  const empNames = new Map(emps.map((e) => [e.code, e.name]));
  return (r: VoucherInfoRow) => {
    const side = VOUCHER_MONEY[r.doc_type as VoucherType]?.side;
    return {
      reasonCode: r.reason_code ?? '', employeeCode: r.employee_code ?? '', employeeName: empNames.get(r.employee_code ?? '') ?? '',
      phone: r.phone ?? '', address: r.address ?? '', invoiceRef: r.line_invoice_no ?? '',
      moneyAccount: (side === 'credit' ? r.first_credit : side === 'debit' ? r.first_debit : null) ?? '',
      createdAt: r.created_at, updatedAt: r.updated_at,
      createdByName: r.created_by ? names.get(r.created_by) ?? r.created_by : '', updatedByName: r.updated_by ? names.get(r.updated_by) ?? r.updated_by : '',
    };
  };
}

export async function documentRoutes(app: FastifyInstance): Promise<void> {
  // Công cụ ghi accounting.* cho trợ lý AI (MCP, chỉ đề xuất — luôn chờ duyệt): chỉ vào registry action, không thêm route HTTP.
  registerActions(documentActions);
  const r = app.withTypeProvider<ZodTypeProvider>();

  r.post('/api/v1/documents', {
    preHandler: requirePermission('documents:write'),
    schema: {
      tags,
      summary: 'Gửi một chứng từ',
      description: 'Idempotent theo docKey + version. Trả status: pending (đã lưu, chờ định khoản ở ACC14) | posted (loại chứng từ đặt định khoản ngay) | unchanged | error.',
      body: ingestDocumentSchema,
    },
    handler: async (req) => ok(await documentService.ingest(authOf(req), req.body)),
  });

  r.post('/api/v1/documents/batch', {
    preHandler: requirePermission('documents:write'),
    schema: { tags, summary: 'Gửi nhiều chứng từ', body: ingestBatchSchema },
    handler: async (req) => {
      const results = await documentService.ingestBatch(authOf(req), req.body.documents);
      const summary = results.reduce<Record<string, number>>((acc, x) => ((acc[x.status] = (acc[x.status] ?? 0) + 1), acc), {});
      return ok(results, summary);
    },
  });

  r.post('/api/v1/documents/post', {
    preHandler: requirePermission('documents:write'),
    schema: {
      tags,
      summary: 'Trạm định khoản: định khoản (chờ / lỗi) hoặc định khoản lại (repost = true) các chứng từ đã chọn theo nội dung mới nhất',
      body: z.object({ ids: z.array(z.string().regex(/^\d+$/)).min(1).max(500), repost: z.boolean().default(false) }),
    },
    handler: async (req) => ok(await documentService.postMany(authOf(req), req.body.ids, req.body.repost)),
  });

  r.post('/api/v1/documents/cancel', {
    preHandler: requirePermission('documents:write'),
    schema: { tags, summary: 'Huỷ chứng từ', body: z.object({ docKey: z.string().min(3), reason: z.string().trim().min(1).max(500) }) },
    handler: async (req) => {
      const auth = authOf(req);
      return ok(auth.kind === 'apikey' ? await documentService.requestCancel(auth, req.body.docKey, req.body.reason) : await documentService.cancel(auth, req.body.docKey, req.body.reason));
    },
  });

  r.get('/api/v1/documents', {
    preHandler: requirePermission('documents:read'),
    schema: {
      tags,
      summary: 'Danh sách chứng từ',
      querystring: pageQuerySchema.extend({
        from: date.optional(),
        to: date.optional(),
        branchCode: z.string().optional(),
        status: z.enum(['pending', 'posted', 'error', 'cancelled', 'auto']).optional().describe('auto = đã định khoản tự động (hệ thống nguồn đẩy vào, chế độ Tự động)'),
        docType: z.string().optional(),
        purpose: z.string().optional().describe('Mục đích phiếu nhập tay (ar_increase, deposit_paid…); nhiều mã cách nhau dấu phẩy'),
        search: z.string().optional(),
        sourceSystem: z.string().optional().describe('Nguồn (mã kết nối, manual…); nhiều mã cách nhau dấu phẩy'),
        sourceType: z.string().optional().describe('Loại phiếu ở hệ thống nguồn (sourceRef.type)'),
        branchCodes: z.string().optional().describe('Nhiều chi nhánh, mã cách nhau dấu phẩy'),
        voucherInfo: z.coerce.boolean().optional().describe('Kèm lý do, nhân viên, điện thoại, địa chỉ, tài khoản tiền, ngày / người tạo, sửa (danh sách phiếu thu chi)'),
      }),
    },
    handler: async (req) => {
      const auth = authOf(req);
      const { rows, total } = await documentService.list(auth, req.query);
      const info = req.query.voucherInfo ? await voucherListNames(auth.tenantId, rows as unknown as VoucherInfoRow[]) : null;
      return ok(
        rows.map((d) => ({
          ...(info ? info(d as unknown as VoucherInfoRow) : {}),
          id: d.id,
          docKey: d.doc_key,
          version: d.version,
          docType: d.doc_type,
          docNo: d.doc_no,
          docDate: d.doc_date,
          invoiceNo: d.invoice_no,
          total: toNumber(d.total),
          status: d.status,
          postedVersion: d.posted_version,
          errorMessage: d.error_message,
          cancelRequestedAt: d.cancel_requested_at,
          cancelReason: d.cancel_reason,
          receivedAt: d.received_at,
          postedAt: d.posted_at,
          sourceSystem: d.source_system,
          sourceType: d.source_type,
          sourceLabel: d.source_label,
          sourceUrl: d.source_url,
          branchCode: d.branch_code,
          branchName: d.branch_name,
          partnerCode: d.partner_code,
          partnerName: d.partner_name,
          description: d.description ?? '',
          counterparty: d.counterparty ?? '',
          purpose: d.purpose ?? null,
        })),
        pageMeta(req.query, total),
      );
    },
  });

  r.get('/api/v1/documents/:id', {
    preHandler: requirePermission('documents:read'),
    schema: { tags, summary: 'Chi tiết chứng từ', params: idParamSchema },
    handler: async (req) => ok(await documentService.get(authOf(req), req.params.id)),
  });

  // Phiếu chuyển tiền: kế toán xác nhận nơi nhận đã nhận tiền (thay bước duyệt của HTsoft; không qua khoá API).
  r.post('/api/v1/documents/:id/confirm-receipt', {
    preHandler: requirePermission('documents:write'),
    schema: { tags, summary: 'Xác nhận đã nhận tiền (phiếu chuyển tiền): định khoản thêm bút toán nơi nhận', params: idParamSchema, body: z.object({ note: z.string().trim().max(500).default('') }).default({}) },
    handler: async (req) => ok(await documentService.confirmReceipt(authOf(req), req.params.id, req.body.note)),
  });

  r.delete('/api/v1/documents/:id/confirm-receipt', {
    preHandler: requirePermission('documents:write'),
    schema: { tags, summary: 'Bỏ xác nhận đã nhận tiền: định khoản lại, đảo bút toán nơi nhận', params: idParamSchema },
    handler: async (req) => ok(await documentService.unconfirmReceipt(authOf(req), req.params.id)),
  });

  r.get('/api/v1/documents/cash-transfers', {
    preHandler: requirePermission('documents:read'),
    schema: {
      tags,
      summary: 'Màn Q2: phiếu chuyển tiền kèm trạng thái kế toán xác nhận nhận tiền',
      querystring: z.object({
        from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        branchCodes: z.string().optional().transform((v) => (v ? v.split(',').map((x) => x.trim()).filter((x) => x && x !== '-') : undefined)),
        receipt: z.enum(['waiting', 'confirmed', 'all']).default('all'),
      }),
    },
    handler: async (req) => ok(await documentService.listCashTransfers(authOf(req), req.query)),
  });

  r.post('/api/v1/documents/confirm-receipts', {
    preHandler: requirePermission('documents:write'),
    schema: { tags, summary: 'Xác nhận đã nhận tiền nhiều phiếu chuyển tiền một lần', body: z.object({ ids: z.array(z.string().regex(/^\d+$/)).min(1).max(500), note: z.string().trim().max(500).default('') }) },
    handler: async (req) => ok(await documentService.confirmReceipts(authOf(req), req.body.ids, req.body.note)),
  });

  r.get('/api/v1/documents/receipt-confirmations', {
    preHandler: requirePermission('documents:read'),
    schema: { tags, summary: 'Xác nhận nhận tiền của các phiếu chuyển tiền theo docKey (hệ thống bán hàng đọc)', querystring: z.object({ docKeys: z.string().max(20000).default('') }) },
    handler: async (req) => ok(await documentService.receiptConfirmations(authOf(req), req.query.docKeys.split(',').map((s) => s.trim()).filter(Boolean).slice(0, 500))),
  });

  r.get('/api/v1/documents/:id/preview', {
    preHandler: requirePermission('documents:read'),
    schema: { tags, summary: 'Xem trước định khoản: bút toán sẽ ghi theo nội dung mới nhất và cấu hình hiện tại (không ghi gì)', params: idParamSchema },
    handler: async (req) => ok(await documentService.preview(authOf(req), req.params.id)),
  });

  r.get('/api/v1/documents/:id/posting-log', {
    preHandler: requirePermission('documents:read'),
    schema: { tags, summary: 'Nhật ký định khoản của một chứng từ', params: idParamSchema },
    handler: async (req) => ok(await documentService.postingLog(authOf(req), { eventId: req.params.id })),
  });

  r.get('/api/v1/posting-log', {
    preHandler: requirePermission('documents:read'),
    schema: {
      tags,
      summary: 'Nhật ký định khoản (nhận phiên bản, định khoản, định khoản lại, lỗi, huỷ)',
      querystring: z.object({
        from: date, to: date, docType: z.string().trim().optional(),
        action: z.enum(['receive', 'post', 'repost', 'error', 'cancel']).optional(),
        branchCodes: z.string().optional().transform((v) => (v ? v.split(',').map((x) => x.trim()).filter(Boolean) : undefined)),
      }),
    },
    handler: async (req) => ok(await documentService.postingLog(authOf(req), req.query)),
  });
}
