/**
 * Tra cứu sổ cái.
 *   GET /api/v1/ledger/entries        danh sách bút toán (lọc ngày, chi nhánh, tài khoản, số chứng từ)
 *   GET /api/v1/ledger/entries/:id    chi tiết bút toán
 *   GET /api/v1/ledger/vouchers       màn Chứng từ kế toán (Tiện ích, như CtrlLedger HTsoft): mode = all | unlinked | unbalanced | source-diff
 *   POST /api/v1/ledger/vouchers/unpost  bỏ định khoản phiếu gốc của các bút toán được chọn (nút Xoá của HTsoft)
 */
import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { db, toNumber } from '../../db/client.js';
import { authOf, requirePermission } from '../../core/auth.js';
import { ok, pageMeta, pageQuerySchema, idParamSchema } from '../../core/http.js';
import { Errors } from '../../core/errors.js';
import { ledgerRepository } from './ledger.repository.js';
import { listVouchers, VOUCHER_MODES } from './ledger-vouchers.js';
import { documentService } from '../documents/document.service.js';

const tags = ['Sổ cái'];
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

export async function ledgerRoutes(app: FastifyInstance): Promise<void> {
  const r = app.withTypeProvider<ZodTypeProvider>();

  r.get('/api/v1/ledger/entries', {
    preHandler: requirePermission('ledger:read'),
    schema: {
      tags,
      summary: 'Danh sách bút toán',
      querystring: pageQuerySchema.extend({
        from: date.optional(),
        to: date.optional(),
        branchCode: z.string().optional(),
        branchCodes: z.string().optional().describe('Nhiều chi nhánh, mã cách nhau dấu phẩy'),
        account: z.string().optional().describe('Lọc bút toán có dòng thuộc tài khoản (theo tiền tố)'),
        search: z.string().optional(),
      }),
    },
    handler: async (req) => {
      const auth = authOf(req);
      const f = req.query;
      let q = db
        .selectFrom('ledger_entries as e')
        .innerJoin('branches as br', 'br.id', 'e.branch_id')
        .leftJoin('partners as p', 'p.id', 'e.partner_id')
        .where('e.tenant_id', '=', auth.tenantId);
      if (f.from) q = q.where('e.posting_date', '>=', f.from);
      if (f.to) q = q.where('e.posting_date', '<=', f.to);
      if (f.branchCode) q = q.where('br.code', '=', f.branchCode);
      if (f.branchCodes) q = q.where('br.code', 'in', f.branchCodes.split(',').map((x) => x.trim()).filter(Boolean));
      if (f.search) q = q.where((eb) => eb.or([eb('e.doc_no', 'ilike', `%${f.search}%`), eb('e.entry_no', '=', f.search!), eb('e.invoice_no', '=', f.search!)]));
      if (f.account) {
        q = q.where((eb) =>
          eb.exists(eb.selectFrom('ledger_lines as l').select('l.id').whereRef('l.entry_id', '=', 'e.id').where('l.account_code', 'like', `${f.account}%`)),
        );
      }
      const [rows, count] = await Promise.all([
        q
          .select(['e.id', 'e.entry_no', 'e.doc_type', 'e.doc_no', 'e.invoice_no', 'e.posting_date', 'e.description', 'e.total', 'e.status', 'e.reverses_entry_id', 'e.event_id', 'br.code as branch_code', 'p.name as partner_name'])
          .orderBy('e.posting_date', 'desc')
          .orderBy('e.entry_no', 'desc')
          .limit(f.pageSize)
          .offset((f.page - 1) * f.pageSize)
          .execute(),
        q.select((eb) => eb.fn.countAll<string>().as('n')).executeTakeFirst(),
      ]);
      return ok(
        rows.map((e) => ({
          id: e.id,
          entryNo: e.entry_no,
          docType: e.doc_type,
          docNo: e.doc_no,
          invoiceNo: e.invoice_no,
          postingDate: e.posting_date,
          description: e.description,
          total: toNumber(e.total),
          status: e.status,
          isReversal: Boolean(e.reverses_entry_id),
          sourceDocumentId: e.event_id,
          branchCode: e.branch_code,
          partnerName: e.partner_name,
        })),
        pageMeta(f, Number(count?.n ?? 0)),
      );
    },
  });

  r.get('/api/v1/ledger/vouchers', {
    preHandler: requirePermission('ledger:read'),
    schema: {
      tags,
      summary: 'Chứng từ kế toán (Tiện ích): bút toán đang hiệu lực theo bốn chế độ của HTsoft (ACC3, ACC3A, ACC3B, ACC3C)',
      querystring: z.object({
        mode: z.enum(VOUCHER_MODES).default('all'),
        from: date,
        to: date,
        branchCodes: z.string().optional().transform((v) => (v ? v.split(',').map((x) => x.trim()).filter(Boolean) : undefined)),
        docNo: z.string().trim().max(100).optional(),
        account: z.string().trim().max(20).optional(),
        docType: z.string().trim().max(40).optional(),
      }),
    },
    handler: async (req) => ok(await listVouchers(authOf(req), req.query)),
  });

  r.post('/api/v1/ledger/vouchers/unpost', {
    preHandler: requirePermission('documents:write'),
    schema: {
      tags,
      summary: 'Bỏ định khoản phiếu gốc của các bút toán được chọn: đảo bút toán, chứng từ về Chờ định khoản (ACC14)',
      body: z.object({ entryIds: z.array(z.string().regex(/^\d+$/)).min(1).max(500), reason: z.string().trim().min(1, 'Nhập lý do').max(500) }),
    },
    handler: async (req) => {
      const auth = authOf(req);
      // Chỉ người dùng (kế toán) bỏ định khoản; khoá API của hệ thống bán hàng có documents:write nhưng không được làm việc này.
      if (auth.kind !== 'user') throw Errors.forbidden('Bỏ định khoản chỉ làm ở màn Chứng từ kế toán, không qua khoá API');
      const entries = await db.selectFrom('ledger_entries').select(['id', 'event_id', 'doc_no', 'entry_no'])
        .where('tenant_id', '=', auth.tenantId).where('id', 'in', req.body.entryIds).execute();
      const results: { docNo: string; ok: boolean; reversed?: number; message?: string }[] = [];
      const seen = new Set<string>();
      for (const e of entries) {
        if (!e.event_id) { results.push({ docNo: e.doc_no || e.entry_no, ok: false, message: 'Bút toán không có phiếu gốc: đảo ở màn bút toán' }); continue; }
        if (seen.has(e.event_id)) continue;
        seen.add(e.event_id);
        try {
          const r = await documentService.unpost(auth, e.event_id, req.body.reason);
          results.push({ docNo: e.doc_no, ok: true, reversed: r.reversed });
        } catch (err) {
          results.push({ docNo: e.doc_no, ok: false, message: err instanceof Error ? err.message : String(err) });
        }
      }
      return ok({ results, done: results.filter((x) => x.ok).length, failed: results.filter((x) => !x.ok).length });
    },
  });

  r.get('/api/v1/ledger/entries/:id', {
    preHandler: requirePermission('ledger:read'),
    schema: { tags, summary: 'Chi tiết bút toán', params: idParamSchema },
    handler: async (req) => {
      const auth = authOf(req);
      const e = await db
        .selectFrom('ledger_entries as e')
        .innerJoin('branches as br', 'br.id', 'e.branch_id')
        .leftJoin('partners as p', 'p.id', 'e.partner_id')
        .leftJoin('posting_reasons as r', (j) => j.onRef('r.tenant_id', '=', 'e.tenant_id').onRef('r.code', '=', 'e.reason_code'))
        .select(['e.id', 'e.entry_no', 'e.doc_type', 'e.doc_no', 'e.invoice_no', 'e.doc_date', 'e.posting_date', 'e.description', 'e.total', 'e.status', 'e.reverses_entry_id', 'e.event_id', 'e.created_by', 'e.created_at', 'br.code as branch_code', 'br.name as branch_name', 'p.code as partner_code', 'p.name as partner_name', 'e.reason_code', 'r.name as reason_name', 'r.cashflow_code'])
        .where('e.tenant_id', '=', auth.tenantId)
        .where('e.id', '=', req.params.id)
        .executeTakeFirst();
      if (!e) throw Errors.notFound('bút toán');
      const lines = await db
        .selectFrom('ledger_lines as l')
        .innerJoin('accounts as a', (j) => j.onRef('a.tenant_id', '=', 'l.tenant_id').onRef('a.code', '=', 'l.account_code'))
        .leftJoin('partners as p', 'p.id', 'l.partner_id')
        .leftJoin('products as pr', (j) => j.onRef('pr.tenant_id', '=', 'l.tenant_id').onRef('pr.sku', '=', 'l.product_sku'))
        .select(['l.line_no', 'l.pair_no', 'l.account_code', 'a.name as account_name', 'a.track_cashflow', 'l.debit', 'l.credit', 'l.part', 'l.tax_code', 'l.description', 'p.code as partner_code', 'p.name as partner_name', 'l.product_sku', 'pr.name as product_name', 'l.dims'])
        .where('l.entry_id', '=', e.id)
        .orderBy('l.line_no')
        .execute();
      // Tên nhân viên của các dòng (chiều phân tích lưu mã).
      const dimOf = (l: (typeof lines)[number], k: string) => {
        const v = (l.dims as Record<string, unknown> | null)?.[k];
        return typeof v === 'string' ? v : '';
      };
      const empCodes = [...new Set(lines.map((l) => dimOf(l, 'employee')).filter(Boolean))];
      const empNames = new Map(empCodes.length
        ? (await db.selectFrom('dimensions').select(['code', 'name']).where('tenant_id', '=', auth.tenantId).where('kind', '=', 'employee').where('code', 'in', empCodes).execute()).map((x) => [x.code, x.name])
        : []);
      const links = await ledgerRepository.linksOf(db, auth.tenantId, e.id);
      const linkOut = (r: (typeof links.outgoing)[number]) => ({ type: r.link_type, reason: r.reason, createdAt: r.created_at, entryId: r.id, entryNo: r.entry_no, docType: r.doc_type, docNo: r.doc_no, postingDate: r.posting_date, total: toNumber(r.total) });
      // "user:<id>" → tên người dùng; "apikey:<id>" → tên khoá API của hệ thống gửi chứng từ.
      const [kind, actorId] = e.created_by.split(':');
      const isId = /^[1-9][0-9]{0,18}$/.test(actorId ?? '');
      let createdByName = e.created_by;
      if (kind === 'user' && isId) {
        const u = await db.selectFrom('users').select(['full_name']).where('tenant_id', '=', auth.tenantId).where('id', '=', actorId!).executeTakeFirst();
        if (u) createdByName = u.full_name;
      } else if (kind === 'apikey' && isId) {
        const k = await db.selectFrom('api_keys').select(['name']).where('tenant_id', '=', auth.tenantId).where('id', '=', actorId!).executeTakeFirst();
        createdByName = `Tự động — ${k?.name ?? 'hệ thống tích hợp'}`;
      }
      return ok({
        id: e.id,
        entryNo: e.entry_no,
        docType: e.doc_type,
        docNo: e.doc_no,
        invoiceNo: e.invoice_no,
        docDate: e.doc_date,
        postingDate: e.posting_date,
        description: e.description,
        total: toNumber(e.total),
        status: e.status,
        isReversal: Boolean(e.reverses_entry_id),
        reversesEntryId: e.reverses_entry_id,
        /** Bảng ledger_links: bút toán này trỏ tới gốc nào (links), bút toán nào trỏ tới nó (linkedBy). */
        links: links.outgoing.map(linkOut),
        linkedBy: links.incoming.map(linkOut),
        sourceDocumentId: e.event_id,
        createdBy: e.created_by,
        createdByName,
        createdAt: e.created_at,
        branch: { code: e.branch_code, name: e.branch_name },
        partner: e.partner_code ? { code: e.partner_code, name: e.partner_name } : null,
        reasonCode: e.reason_code,
        reasonName: e.reason_name,
        lines: lines.map((l) => ({
          lineNo: l.line_no,
          pairNo: l.pair_no,
          accountCode: l.account_code,
          accountName: l.account_name,
          debit: toNumber(l.debit),
          credit: toNumber(l.credit),
          part: l.part,
          taxCode: l.tax_code,
          description: l.description,
          partnerCode: l.partner_code,
          partnerName: l.partner_name,
          productSku: l.product_sku,
          productName: l.product_name,
          department: dimOf(l, 'department'),
          contract: dimOf(l, 'contract'),
          costItem: dimOf(l, 'costItem'),
          employeeCode: dimOf(l, 'employee'),
          employeeName: empNames.get(dimOf(l, 'employee')) ?? '',
          // Mã lưu chuyển tiền tệ: chỉ dòng của tài khoản có theo dõi lưu chuyển tiền tệ, lấy từ lý do của chứng từ.
          flowCode: l.track_cashflow ? (e.cashflow_code ?? '') : '',
        })),
      });
    },
  });
}
