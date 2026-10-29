/**
 * Add-in "Trợ lý" (tầng 1 — tra cứu, không dùng AI).
 *
 *   POST /api/v1/addins/tro-ly/simulate  → mô phỏng định khoản một phiếu MẪU theo cấu hình hạch toán hiện tại
 *   GET|POST /knowledge, PUT|DELETE /knowledge/:id, GET /knowledge/export, POST /knowledge/import
 *                                         → dữ liệu huấn luyện (câu hỏi, hướng dẫn) do người dùng soạn trên giao diện,
 *                                           lưu tệp JSONL (store.ts), không dùng bảng cơ sở dữ liệu
 *   POST /images, GET /images/:name       → ảnh chèn vào câu trả lời (GET công khai, tên tệp ngẫu nhiên khó đoán)
 *
 * Mô phỏng = dựng chứng từ mẫu (loại, lý do, chi nhánh, mặt hàng, số tiền, loại thuế, hình thức…), cho CHÍNH bộ định
 * khoản chạy trong một giao dịch rồi HUỶ giao dịch: không ghi sổ, không cấp số bút toán, không đổi danh mục. Vì dùng
 * đúng luật thật nên luồng bút toán luôn khớp cấu hình lý do / mặt hàng - tài khoản / tài khoản ngầm định đang dùng.
 * Giá vốn và giá trị phiếu kho dùng số minh hoạ (thực tế tính khi chạy Tính giá vốn cuối tháng).
 *
 * Mở rộng: thêm một loại luồng = thêm một nhánh trong sampleDocument() và một mục FLOW trong giao diện
 * (apps/web/src/addins/tro-ly/flows.ts).
 */
import { z } from 'zod';
import { sql } from 'kysely';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { ingestDocumentSchema, type IngestDocument } from '@ketoan/contracts';
import { defineAddIn } from '../../core/addins.js';
import { AppError } from '../../core/errors.js';
import { authOf, requirePermission } from '../../core/auth.js';
import { ok } from '../../core/http.js';
import { db } from '../../db/client.js';
import { postDocumentIn } from '../../modules/documents/document.service.js';
import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import path from 'node:path';
import { Errors } from '../../core/errors.js';
import { deleteEntry, imageDir, imageType, importEntries, readEntries, saveEntry, saveImage, type TrainingEntry } from './store.js';

const entrySchema = z.object({
  kind: z.enum(['faq', 'guide']).default('faq'),
  question: z.string().trim().min(3, 'Nhập câu hỏi / tiêu đề').max(500),
  keywords: z.array(z.string().trim().min(1).max(60)).max(30).default([]),
  answer: z.string().trim().min(1, 'Nhập câu trả lời').max(20000),
  screens: z.array(z.string().trim().min(1).max(20)).max(20).default([]),
  active: z.boolean().default(true),
});

const FLOWS = ['sale', 'sale_return', 'purchase', 'purchase_return', 'receipt', 'refund', 'supplier_payment', 'supplier_refund',
  'transfer_out', 'transfer_in', 'adjust_increase', 'adjust_decrease', 'cash_transfer'] as const;
type Flow = (typeof FLOWS)[number];

const simulateSchema = z.object({
  flow: z.enum(FLOWS),
  branchCode: z.string().trim().min(1).max(32),
  reasonCode: z.string().trim().max(32).optional(),
  sku: z.string().trim().max(64).optional(),
  amount: z.number().positive().max(1e12).default(1_000_000),
  taxCode: z.string().trim().max(16).optional(),
  methodCode: z.string().trim().max(32).optional(),
  toBranchCode: z.string().trim().max(32).optional(),
  toMethodCode: z.string().trim().max(32).optional(),
});
type SimulateInput = z.infer<typeof simulateSchema>;

/** Phiếu mẫu cho một luồng. Số tiền dương; luật định khoản quyết định chiều Nợ / Có. */
function sampleDocument(q: SimulateInput, taxRate: number): Record<string, unknown> {
  const today = new Date(Date.now() + 7 * 3_600_000).toISOString().slice(0, 10);
  const base = {
    docKey: `tro-ly:mo-phong:${Date.now()}`, version: 1, branchCode: q.branchCode, docNo: 'MAU-0001', docDate: today,
    description: 'Phiếu mẫu — mô phỏng định khoản', sourceSystem: 'tro-ly', ...(q.reasonCode ? { reasonCode: q.reasonCode } : {}),
  };
  const customer = { code: 'KHACH-MAU', name: 'Khách hàng mẫu' };
  const supplier = { code: 'NCC-MAU', name: 'Nhà cung cấp mẫu' };
  const amount = Math.round(q.amount);
  const tax = Math.round((amount * taxRate) / 100);
  const sku = q.sku || 'MAT-HANG-MAU';
  const tradeLine = (withCost: boolean) => ({
    lineKey: 'l1', sku, name: 'Mặt hàng mẫu', unit: 'Cái', qty: 1, unitPrice: amount, amountBeforeTax: amount,
    taxCode: q.taxCode || 'KCT', taxAmount: tax, ...(withCost ? { cost: Math.round(amount * 0.7) } : {}),
  });
  const trade = (docType: string, partner: object, withCost: boolean) => ({
    ...base, docType, partner, lines: [tradeLine(withCost)], payments: [], totals: { beforeTax: amount, tax, total: amount + tax },
  });
  const stockLine = { lineKey: 'l1', sku, name: 'Mặt hàng mẫu', unit: 'Cái', qty: 1, amount };
  const pay = (docType: string, partner: object, direction: 'in' | 'out') => ({
    ...base, docType, partner, direction, methodCode: q.methodCode || 'TM', lines: [], totals: { total: amount },
  });
  const map: Record<Flow, () => Record<string, unknown>> = {
    sale: () => trade('sale', customer, true),
    sale_return: () => trade('sale_return', customer, true),
    purchase: () => trade('purchase', supplier, false),
    purchase_return: () => trade('purchase_return', supplier, false),
    receipt: () => pay('customer_payment', customer, 'in'),
    refund: () => pay('customer_payment', customer, 'out'),
    supplier_payment: () => pay('supplier_payment', supplier, 'out'),
    supplier_refund: () => pay('supplier_payment', supplier, 'in'),
    transfer_out: () => ({ ...base, docType: 'transfer', leg: 'out', ...(q.toBranchCode ? { toBranchCode: q.toBranchCode } : {}), lines: [stockLine], totals: { total: amount } }),
    transfer_in: () => ({ ...base, docType: 'transfer', leg: 'in', ...(q.toBranchCode ? { fromBranchCode: q.toBranchCode } : {}), lines: [stockLine], totals: { total: amount } }),
    adjust_increase: () => ({ ...base, docType: 'stock_adjustment', direction: 'increase', lines: [stockLine], totals: { total: amount } }),
    adjust_decrease: () => ({ ...base, docType: 'stock_adjustment', direction: 'decrease', lines: [stockLine], totals: { total: amount } }),
    cash_transfer: () => ({
      ...base, docType: 'cash_transfer', toBranchCode: q.toBranchCode || q.branchCode, fromMethodCode: q.methodCode || 'TM',
      toMethodCode: q.toMethodCode || (q.toBranchCode && q.toBranchCode !== q.branchCode ? 'TM' : 'CK'), status: 'received', totals: { total: amount },
    }),
  };
  return map[q.flow]();
}

class Rollback extends Error { constructor(readonly data: unknown) { super('rollback'); } }

export default defineAddIn({
  manifest: {
    id: 'tro-ly',
    name: 'Trợ lý',
    version: '0.1.0',
    description: 'Tra cứu luồng bút toán theo cấu hình hạch toán hiện tại, tìm tính năng, hỏi đáp thường gặp.',
    menuParent: 'tien-ich',
    menu: [{ key: 'tro-ly', label: 'Trợ lý: luồng bút toán, tính năng, hỏi đáp', path: '/addins/tro-ly', code: 'TI12' }],
  },
  register(app) {
    const r = app.withTypeProvider<ZodTypeProvider>();
    const ktags = ['Add-in: Trợ lý — dữ liệu huấn luyện'];

    r.get('/knowledge', {
      preHandler: requirePermission('catalog:read'),
      schema: { tags: ktags, summary: 'Danh sách mục huấn luyện (câu hỏi, hướng dẫn)' },
      handler: async (req) => ok(await readEntries(authOf(req).tenantId)),
    });
    r.post('/knowledge', {
      preHandler: requirePermission('catalog:write'),
      schema: { tags: ktags, summary: 'Thêm mục huấn luyện', body: entrySchema },
      handler: async (req, reply) => reply.status(201).send(ok(await saveEntry(authOf(req).tenantId, authOf(req).actor, req.body))),
    });
    r.put('/knowledge/:id', {
      preHandler: requirePermission('catalog:write'),
      schema: { tags: ktags, summary: 'Sửa mục huấn luyện', params: z.object({ id: z.string().uuid() }), body: entrySchema },
      handler: async (req) => {
        try { return ok(await saveEntry(authOf(req).tenantId, authOf(req).actor, req.body, req.params.id)); }
        catch (e) { if ((e as { notFound?: boolean }).notFound) throw Errors.notFound('mục huấn luyện'); throw e; }
      },
    });
    r.delete('/knowledge/:id', {
      preHandler: requirePermission('catalog:write'),
      schema: { tags: ktags, summary: 'Xoá mục huấn luyện', params: z.object({ id: z.string().uuid() }) },
      handler: async (req) => {
        if (!(await deleteEntry(authOf(req).tenantId, req.params.id))) throw Errors.notFound('mục huấn luyện');
        return ok({ deleted: true });
      },
    });
    r.get('/knowledge/export', {
      preHandler: requirePermission('catalog:read'),
      schema: { tags: ktags, summary: 'Xuất toàn bộ mục huấn luyện dạng JSONL' },
      handler: async (req, reply) => {
        const list = await readEntries(authOf(req).tenantId);
        reply.header('content-type', 'application/x-ndjson; charset=utf-8').header('content-disposition', 'attachment; filename="tro-ly-huan-luyen.jsonl"');
        return list.map((x) => JSON.stringify(x)).join('\n') + (list.length ? '\n' : '');
      },
    });
    r.post('/knowledge/import', {
      preHandler: requirePermission('catalog:write'),
      schema: { tags: ktags, summary: 'Nhập mục huấn luyện từ JSONL (trùng id thì ghi đè)', body: z.object({ jsonl: z.string().max(5_000_000) }) },
      handler: async (req) => {
        const items: Partial<TrainingEntry>[] = [];
        const bad: number[] = [];
        req.body.jsonl.split('\n').forEach((line, i) => {
          const t = line.trim();
          if (!t) return;
          try { items.push(JSON.parse(t)); } catch { bad.push(i + 1); }
        });
        if (!items.length) throw Errors.validation('Tệp không có dòng JSON hợp lệ nào');
        return ok({ ...(await importEntries(authOf(req).tenantId, authOf(req).actor, items)), badLines: bad.slice(0, 20) });
      },
    });
    r.post('/images', {
      preHandler: requirePermission('catalog:write'),
      schema: { tags: ktags, summary: 'Tải ảnh chèn vào câu trả lời (data URL, tối đa 3 MB)', body: z.object({ dataUrl: z.string().max(5_000_000) }) },
      handler: async (req) => {
        try { return ok({ url: `/api/v1/addins/tro-ly/images/${await saveImage(req.body.dataUrl)}` }); }
        catch (e) { throw Errors.validation((e as Error).message); }
      },
    });
    r.get('/images/:name', {
      config: { public: true },
      schema: { tags: ktags, summary: 'Ảnh của câu trả lời (công khai, tên ngẫu nhiên)', params: z.object({ name: z.string().regex(/^[0-9a-f]{32}\.(png|jpg|webp|gif)$/) }) },
      handler: async (req, reply) => {
        const file = path.join(imageDir(), req.params.name);
        try { await stat(file); } catch { throw Errors.notFound('ảnh'); }
        reply.header('content-type', imageType(req.params.name)).header('cache-control', 'public, max-age=31536000, immutable');
        return reply.send(createReadStream(file));
      },
    });
    r.post('/simulate', {
      preHandler: requirePermission('catalog:read'),
      schema: { tags: ['Add-in: Trợ lý'], summary: 'Mô phỏng định khoản một phiếu mẫu (không ghi sổ)', body: simulateSchema },
      handler: async (req) => {
        const auth = authOf(req);
        const q = req.body;
        const rate = q.taxCode
          ? Number((await db.selectFrom('tax_codes').select('rate').where('tenant_id', '=', auth.tenantId).where('code', '=', q.taxCode).executeTakeFirst())?.rate ?? 0)
          : 0;
        const parsed = ingestDocumentSchema.safeParse(sampleDocument(q, Math.max(0, rate)));
        if (!parsed.success) return ok({ ok: false, error: `Phiếu mẫu chưa hợp lệ: ${parsed.error.issues.slice(0, 2).map((i) => `${i.path.join('.')} ${i.message}`).join('; ')}` });
        const doc = parsed.data as IngestDocument;
        try {
          await db.transaction().execute(async (trx) => {
            const res = await postDocumentIn(trx, auth, doc, { post: true, force: true });
            const ids = res.entryIds ?? [];
            const lines = ids.length ? await trx.selectFrom('ledger_lines as l')
              .innerJoin('ledger_entries as e', 'e.id', 'l.entry_id')
              .innerJoin('accounts as a', (j) => j.onRef('a.tenant_id', '=', 'l.tenant_id').onRef('a.code', '=', 'l.account_code'))
              .select(['l.entry_id', 'e.doc_type', 'e.reason_code', 'l.pair_no', 'l.part', 'l.account_code', 'a.name as account_name', 'l.debit', 'l.credit', 'l.description', 'l.tax_code'])
              .where('l.entry_id', 'in', ids).orderBy('l.entry_id').orderBy('l.line_no').execute() : [];
            const event = await trx.selectFrom('accounting_events').select('id').where('tenant_id', '=', auth.tenantId).where('doc_key', '=', doc.docKey).executeTakeFirst();
            const moves = event ? (await sql<{ branch_code: string; kind: string; qty: string }>`
              SELECT b.code AS branch_code, m.kind, m.qty FROM inventory_movements m JOIN branches b ON b.id = m.branch_id
               WHERE m.event_id = ${event.id} ORDER BY m.line_no`.execute(trx)).rows : [];
            throw new Rollback({
              ok: true,
              entries: ids.map((id) => {
                const own = lines.filter((l) => String(l.entry_id) === String(id));
                return {
                  docType: own[0]?.doc_type ?? doc.docType, reasonCode: own[0]?.reason_code ?? null,
                  lines: own.map((l) => ({ pairNo: l.pair_no, part: l.part, accountCode: l.account_code, accountName: l.account_name, debit: Number(l.debit), credit: Number(l.credit), description: l.description ?? '', taxCode: l.tax_code })),
                };
              }),
              movements: moves.map((m) => ({ branchCode: m.branch_code, kind: m.kind, qty: Number(m.qty) })),
            });
          });
        } catch (e) {
          if (e instanceof Rollback) return ok(e.data);
          if (e instanceof AppError) return ok({ ok: false, error: e.message });
          throw e;
        }
        return ok({ ok: false, error: 'Không mô phỏng được' });
      },
    });
  },
});
