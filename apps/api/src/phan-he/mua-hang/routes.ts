// @bizcity-layer D modules/mua-hang
/**
 * API phân hệ Mua hàng — hợp đồng: docs/api/14-mua-hang.md.
 *   Chứng từ   GET/POST /api/v1/purchase/documents · GET/PUT /…/:id · POST /…/:id/{submit,approve,override,unapprove,cancel}
 *              POST /api/v1/purchase/analyze (chạy bộ máy, không lưu)
 *   Chính sách GET/POST /api/v1/purchase/policies · PUT /…/:id · POST /…/:id/transfer-limit
 *   Báo cáo    GET /api/v1/purchase/{credit,due,lots,gifts,logs} · POST /…/rebates/preview · GET /…/allocations/:id · GET /…/real-cost/:id
 *   Cài đặt    GET/PUT /api/v1/purchase/settings · Dữ liệu mẫu POST /api/v1/purchase/demo/{seed,clear}
 *   NCC        GET /api/v1/purchase/suppliers · GET /…/suppliers/:code (hồ sơ)
 *   Đính kèm   GET/POST /api/v1/purchase/attachments · GET /…/attachments/:id/file · DELETE /…/attachments/:id
 */
import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { runScenarios } from '@ketoan/contracts/mua-hang';
import { db } from '../../db/client.js';
import { authOf, requirePermission } from '../../core/auth.js';
import { Errors } from '../../core/errors.js';
import { idParamSchema, ok } from '../../core/http.js';
import { loadCtx, loadSettings, priceHistory, resolveAccounts, saveSettings } from './analysis.js';
import { checkSeedPassword, clearDemo, ensureDemoWarehouses, seedDemo } from './demo.js';
import { readLog, logEvents } from './log.js';
import { brandBranchUsage, costAllocation, creditOverview, dueList, giftLedger, lotStock, orderReconcileReport, purchaseSummary, purchaseTodo, realCost, rebateOverview, rebatePreview } from './reports.js';
import { ATTACHMENT_KINDS, addAttachment, deleteAttachment, listAttachments, readAttachment, supplierBrandList, supplierList, supplierProfile } from './ncc.js';
import { purchaseSchema } from './csdl.js';
import { deleteSupplierProduct, listSupplierProducts, productCost, saveSupplierProducts, supplierProductSchema, unitsOf } from './gia-mua.js';
import { purchaseService } from './service.js';
import { stockLedgerBySku, stockOnHandBySku } from './bao-cao-kho.js';
import { deletePolicy, listDocs, listPolicies, policyInputSchema, savePolicy } from './store.js';

const tags = ['Mua hàng'];
const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

export async function purchaseRoutes(app: FastifyInstance): Promise<void> {
  const r = app.withTypeProvider<ZodTypeProvider>();
  const read = requirePermission('documents:read');
  const write = requirePermission('documents:write');
  const catalog = requirePermission('catalog:write');
  const settings = requirePermission('settings:write');
  const ctxOf = async (tenantId: string) => loadCtx(db, tenantId, await listDocs(db, tenantId), { full: true });

  // ---------------- Chứng từ
  r.get('/api/v1/purchase/documents', { preHandler: read, schema: { tags, summary: 'Danh sách chứng từ mua hàng', querystring: z.object({ kind: z.string().optional(), status: z.string().optional(), partnerCode: z.string().optional(), from: day.optional(), to: day.optional() }) },
    handler: async (req) => {
      const rows = await purchaseService.list(authOf(req), req.query);
      return ok(rows, { total: rows.length, page: 1, pageSize: rows.length });
    } });
  r.get('/api/v1/purchase/documents/:id', { preHandler: read, schema: { tags, summary: 'Một chứng từ + kết quả bộ máy', params: idParamSchema }, handler: async (req) => ok(await purchaseService.get(authOf(req), req.params.id)) });
  r.post('/api/v1/purchase/documents', { preHandler: write, schema: { tags, summary: 'Thêm chứng từ (nháp); số phiếu trống thì tự cấp' }, handler: async (req, reply) => reply.code(201).send(ok(await purchaseService.save(authOf(req), req.body))) });
  r.put('/api/v1/purchase/documents/:id', { preHandler: write, schema: { tags, summary: 'Sửa chứng từ nháp / chờ duyệt', params: idParamSchema }, handler: async (req) => ok(await purchaseService.save(authOf(req), req.body, req.params.id)) });
  r.post('/api/v1/purchase/analyze', { preHandler: read, schema: { tags, summary: 'Chạy bộ máy cho phiếu đang nhập: tiền, hạn, cảnh báo, hạn mức, giá mua, bút toán xem trước' }, handler: async (req) => ok(await purchaseService.analyze(authOf(req), req.body)) });
  r.post('/api/v1/purchase/documents/:id/submit', { preHandler: write, schema: { tags, summary: 'Gửi duyệt', params: idParamSchema }, handler: async (req) => ok(await purchaseService.submit(authOf(req), req.params.id)) });
  r.post('/api/v1/purchase/documents/:id/approve', { preHandler: write, schema: { tags, summary: 'Duyệt = ghi sổ (409 nếu còn cảnh báo chặn)', params: idParamSchema }, handler: async (req) => ok(await purchaseService.approve(authOf(req), req.params.id)) });
  r.post('/api/v1/purchase/documents/:id/override', { preHandler: requirePermission('payments:approve'), schema: { tags, summary: 'Duyệt ngoại lệ vượt hạn mức (bắt buộc lý do)', params: idParamSchema, body: z.object({ reason: z.string().trim().min(3, 'Ghi lý do duyệt ngoại lệ') }) },
    handler: async (req) => ok(await purchaseService.approve(authOf(req), req.params.id, { reason: req.body.reason })) });
  r.post('/api/v1/purchase/documents/:id/review-outside', { preHandler: requirePermission('payments:approve'), schema: { tags, summary: 'Rà soát phiếu nhập ngoài đơn đã duyệt (ghi người, lúc, ghi chú)', params: idParamSchema, body: z.object({ note: z.string().trim().max(500).default('') }) },
    handler: async (req) => ok(await purchaseService.reviewOutside(authOf(req), req.params.id, req.body.note)) });
  r.post('/api/v1/purchase/documents/:id/unapprove', { preHandler: write, schema: { tags, summary: 'Bỏ duyệt: huỷ chứng từ kế toán đã sinh, về nháp (body tuỳ chọn { reason })', params: idParamSchema },
    handler: async (req) => ok(await purchaseService.unapprove(authOf(req), req.params.id, String((req.body as { reason?: unknown } | undefined)?.reason ?? '') || undefined)) });
  r.post('/api/v1/purchase/documents/:id/cancel', { preHandler: write, schema: { tags, summary: 'Huỷ chứng từ chưa duyệt (không xoá)', params: idParamSchema }, handler: async (req) => ok(await purchaseService.cancel(authOf(req), req.params.id)) });

  // ---------------- Nhà cung cấp (mọi việc mua hàng đi từ NCC)
  r.get('/api/v1/purchase/suppliers', { preHandler: read, schema: { tags, summary: 'Nhà cung cấp mua hàng: nợ, quá hạn, hạn mức, điều khoản, chính sách, hợp đồng, lần nhập gần nhất', querystring: z.object({ scope: z.enum(['active', 'all']).default('active'), asOf: day.optional() }) },
    handler: async (req) => { const a = authOf(req); return ok(await supplierList(db, a.tenantId, await ctxOf(a.tenantId), req.query.scope, req.query.asOf)); } });
  r.get('/api/v1/purchase/suppliers/:code', { preHandler: read, schema: { tags, summary: 'Hồ sơ một nhà cung cấp', params: z.object({ code: z.string().min(1) }) },
    handler: async (req) => { const a = authOf(req); return ok(await supplierProfile(db, a.tenantId, await ctxOf(a.tenantId), req.params.code)); } });

  r.post('/api/v1/purchase/products-lookup', { preHandler: read, schema: { tags, summary: 'Tra nhiều mã hàng một lần (nhập Excel): tên, ĐVT, thuế đầu vào, nhãn', body: z.object({ skus: z.array(z.string()).max(5000) }) },
    handler: async (req) => {
      const skus = [...new Set(req.body.skus.map((s) => s.trim()).filter(Boolean))];
      const rows = skus.length ? await db.selectFrom('products').select(['sku', 'name', 'unit', 'tax_in_code', 'brand_code']).where('tenant_id', '=', authOf(req).tenantId).where('sku', 'in', skus).execute() : [];
      return ok(rows.map((p) => ({ sku: p.sku, name: p.name, unit: p.unit, taxInCode: p.tax_in_code, brandCode: p.brand_code })));
    } });

  // ---------------- Tệp đính kèm (hợp đồng, CO, CQ, báo giá, chứng từ) — lưu trên ổ dữ liệu ERP
  const owner = z.object({ ownerType: z.enum(['partner', 'document', 'policy', 'invoice']), ownerId: z.string().min(1) });
  r.get('/api/v1/purchase/attachments', { preHandler: read, schema: { tags, summary: 'Tệp đính kèm của NCC / chứng từ / chính sách', querystring: owner },
    handler: async (req) => ok({ files: await listAttachments(db, authOf(req).tenantId, req.query.ownerType, req.query.ownerId), kinds: ATTACHMENT_KINDS }) });
  r.post('/api/v1/purchase/attachments', { preHandler: write, schema: { tags, summary: 'Gửi tệp (nội dung base64, tối đa 15 MB)', body: owner.extend({ kind: z.string().default('khac'), fileName: z.string().min(1).max(200), mime: z.string().max(120).default(''), dataBase64: z.string().min(1), note: z.string().max(500).optional() }) },
    handler: async (req, reply) => {
      const a = authOf(req);
      const out = await addAttachment(db, a.tenantId, a.actorName, req.body);
      await logEvents(a.tenantId, [{ event: 'attachment_added', docNo: req.body.ownerType === 'partner' ? '' : req.body.ownerId, user: a.actorName, data: { ownerType: req.body.ownerType, ownerId: req.body.ownerId, partnerCode: req.body.ownerType === 'partner' ? req.body.ownerId : undefined, fileName: req.body.fileName, kind: req.body.kind } }]);
      return reply.code(201).send(ok(out));
    } });
  r.get('/api/v1/purchase/attachments/:id/file', { preHandler: read, schema: { tags, summary: 'Tải nội dung tệp', params: idParamSchema },
    handler: async (req, reply) => {
      const f = await readAttachment(db, authOf(req).tenantId, req.params.id);
      return reply.header('content-type', f.mime).header('content-disposition', `inline; filename*=UTF-8''${encodeURIComponent(f.fileName)}`).send(f.data);
    } });
  r.delete('/api/v1/purchase/attachments/:id', { preHandler: write, schema: { tags, summary: 'Xoá tệp', params: idParamSchema },
    handler: async (req) => { await deleteAttachment(db, authOf(req).tenantId, req.params.id); return ok({ deleted: true }); } });

  // ---------------- Chính sách
  r.get('/api/v1/purchase/policies', { preHandler: read, schema: { tags, summary: 'Danh sách chính sách mua hàng' }, handler: async (req) => ok(await listPolicies(db, authOf(req).tenantId)) });
  const savePol = async (req: { body: unknown }, auth: ReturnType<typeof authOf>, id?: string) => {
    const p = policyInputSchema.parse(req.body);
    const before = id ? (await listPolicies(db, auth.tenantId)).find((x) => x.id === id) : undefined;
    const saved = await db.transaction().execute((trx) => savePolicy(trx, auth.tenantId, auth.actorName, p, id));
    await logEvents(auth.tenantId, [{ event: id ? 'policy_changed' : 'policy_created', docNo: p.code, user: auth.actorName, data: { code: p.code, kind: p.kind, name: p.name, partnerCode: p.scope.partnerCode, rule: p.rule, scope: p.scope, isActive: p.isActive, validFrom: p.validFrom, validTo: p.validTo, ...(before ? { before: { name: before.name, rule: before.rule, scope: before.scope, isActive: before.isActive, validFrom: before.validFrom, validTo: before.validTo } } : {}) } }]);
    return { id: saved };
  };
  r.post('/api/v1/purchase/policies', { preHandler: catalog, schema: { tags, summary: 'Thêm chính sách (nội dung kiểm theo loại)' }, handler: async (req, reply) => reply.code(201).send(ok(await savePol(req, authOf(req)))) });
  r.put('/api/v1/purchase/policies/:id', { preHandler: catalog, schema: { tags, summary: 'Sửa chính sách', params: idParamSchema }, handler: async (req) => ok(await savePol(req, authOf(req), req.params.id)) });
  r.delete('/api/v1/purchase/policies/:id', { preHandler: catalog, schema: { tags, summary: 'Xoá chính sách chưa áp vào phiếu nào (đã áp: 409, tắt "Áp dụng")', params: idParamSchema },
    handler: async (req) => {
      const auth = authOf(req);
      const p = await db.transaction().execute((trx) => deletePolicy(trx, auth.tenantId, req.params.id));
      await logEvents(auth.tenantId, [{ event: 'policy_deleted', docNo: p.code, user: auth.actorName, data: { code: p.code, kind: p.kind, name: p.name, partnerCode: p.scope.partnerCode, rule: p.rule, scope: p.scope } }]);
      return ok({ id: req.params.id });
    } });
  r.post('/api/v1/purchase/policies/:id/transfer-limit', { preHandler: catalog, schema: { tags, summary: 'Điều chuyển hạn mức nhãn giữa chi nhánh', params: idParamSchema, body: z.object({ from: z.string().default(''), to: z.string().min(1), amount: z.number().positive() }) },
    handler: async (req) => {
      const auth = authOf(req);
      const p = (await listPolicies(db, auth.tenantId)).find((x) => x.id === req.params.id && x.kind === 'credit_limit');
      if (!p) throw Errors.notFound('chính sách hạn mức');
      const rule = p.rule as { limit: number; warnPct?: number; branches?: Record<string, number> };
      const branches = { ...(rule.branches ?? {}) };
      const { from, to, amount } = req.body;
      if (from === to) throw Errors.validation('Nơi chuyển và nơi nhận trùng nhau');
      const pool = from ? branches[from] ?? 0 : rule.limit - Object.values(branches).reduce((a, b) => a + b, 0);
      // Chuyển từ chi nhánh: chỉ được chuyển phần CÒN TRỐNG (hạn mức − nợ nhãn đã ghi − phiếu đang chờ); phần đã bị nợ chiếm vẫn nằm ở chi nhánh đó
      const used = from ? await brandBranchUsage(db, auth.tenantId, await ctxOf(auth.tenantId), p.scope.brandCode!, from) : { current: 0, pending: 0 };
      const free = Math.max(0, pool - used.current - used.pending);
      if (amount > free) throw Errors.validation(from
        ? `Số chuyển vượt phần còn trống của ${from}: chỉ còn ${free.toLocaleString('vi-VN')} (hạn mức ${pool.toLocaleString('vi-VN')} − nợ đã ghi ${used.current.toLocaleString('vi-VN')} − đang chờ ${used.pending.toLocaleString('vi-VN')})`
        : `Số chuyển vượt hạn mức chưa phân bổ (${pool.toLocaleString('vi-VN')})`);
      if (from) branches[from] = pool - amount;
      branches[to] = (branches[to] ?? 0) + amount;
      await db.transaction().execute((trx) => savePolicy(trx, auth.tenantId, auth.actor, policyInputSchema.parse({ ...p, rule: { ...rule, branches }, validFrom: p.validFrom ?? null, validTo: p.validTo ?? null }), p.id));
      await logEvents(auth.tenantId, [{ event: 'limit_transfer', docNo: '', user: auth.actorName, data: { policy: p.code, brand: p.scope.brandCode, from: from || 'Chưa phân bổ', to, amount, before: rule.branches ?? {}, after: branches } }]);
      return ok({ branches });
    } });

  // ---------------- Báo cáo
  r.get('/api/v1/purchase/credit', { preHandler: read, schema: { tags, summary: 'Hạn mức NCC / nhãn theo chi nhánh, chỉ tiêu cung ứng', querystring: z.object({ asOf: day.optional() }) },
    handler: async (req) => { const a = authOf(req); return ok(await creditOverview(db, a.tenantId, await ctxOf(a.tenantId), req.query.asOf)); } });
  r.get('/api/v1/purchase/due', { preHandler: read, schema: { tags, summary: 'Khoản phải trả NCC đang mở, từng đợt, tuổi nợ', querystring: z.object({ partnerCode: z.string().optional(), asOf: day.optional() }) },
    handler: async (req) => { const a = authOf(req); return ok(await dueList(db, a.tenantId, await ctxOf(a.tenantId), req.query)); } });
  r.get('/api/v1/purchase/price-history/:sku', { preHandler: read, schema: { tags, summary: 'Các lần nhập gần nhất của một mã (đơn giá thực tế sau CK, mọi nguồn nhập)', params: z.object({ sku: z.string().min(1) }), querystring: z.object({ asOf: day.optional(), limit: z.coerce.number().int().min(1).max(50).default(10) }) },
    handler: async (req) => { const a = authOf(req); return ok(await priceHistory(db, a.tenantId, req.params.sku, req.query.asOf ?? '9999-12-31', undefined, req.query.limit)); } });
  r.get('/api/v1/purchase/lots', { preHandler: read, schema: { tags, summary: 'Tồn theo lô / hạn dùng (FEFO)', querystring: z.object({ asOf: day.optional() }) },
    handler: async (req) => { const a = authOf(req); return ok(await lotStock(db, a.tenantId, await ctxOf(a.tenantId), req.query.asOf)); } });
  r.get('/api/v1/purchase/gifts', { preHandler: read, schema: { tags, summary: 'Nhập - xuất - tồn quà theo kỳ, ngân sách chương trình', querystring: z.object({ from: day.optional(), to: day.optional() }) },
    handler: async (req) => ok(giftLedger(await ctxOf(authOf(req).tenantId), req.query)) });
  r.get('/api/v1/purchase/order-reconcile', { preHandler: read, schema: { tags, summary: 'Đối chiếu đơn đặt ↔ phiếu nhập theo mã (đặt / nhận / chờ / chênh / lệch giá / ngoài đơn / đổi mã) + phiếu nhập ngoài đơn', querystring: z.object({ from: day.optional(), to: day.optional(), partnerCode: z.string().max(64).optional(), branchCode: z.string().max(64).optional() }) },
    handler: async (req) => { const a = authOf(req); return ok(await orderReconcileReport(db, a.tenantId, await ctxOf(a.tenantId), req.query)); } });
  const codes = z.string().optional().transform((v) => (v ? v.split(',').map((x) => x.trim()).filter(Boolean) : undefined));
  r.get('/api/v1/purchase/stock-ledger', { preHandler: read, schema: { tags, summary: 'Sổ kho theo mặt hàng: tồn đầu, nhập, nhập lại, nhập / xuất nội bộ, xuất bán, xuất trả, xuất điều chỉnh, SL điều chỉnh ±, khác, tồn cuối', querystring: z.object({ from: day, to: day, branchCodes: codes, warehouseCodes: codes, search: z.string().optional() }) },
    handler: async (req) => ok(await stockLedgerBySku(db, authOf(req).tenantId, req.query)) });
  r.get('/api/v1/purchase/stock-on-hand', { preHandler: read, schema: { tags, summary: 'Tồn kho theo mặt hàng theo kho: số lượng, đơn giá, thành tiền, đi đường, tồn max / min, SL cần nhập', querystring: z.object({ to: day, branchCodes: codes, warehouseCodes: codes, search: z.string().optional() }) },
    handler: async (req) => ok(await stockOnHandBySku(db, authOf(req).tenantId, req.query)) });
  r.get('/api/v1/purchase/summary', { preHandler: read, schema: { tags, summary: 'Tổng hợp mua hàng theo NCC / nhãn / ngành / nhóm / mã / chi nhánh', querystring: z.object({ from: day, to: day, groupBy: z.enum(['partner', 'brand', 'industry', 'group', 'sku', 'branch']).default('sku') }) },
    handler: async (req) => { const a = authOf(req); return ok(await purchaseSummary(db, a.tenantId, await ctxOf(a.tenantId), req.query)); } });
  r.get('/api/v1/purchase/rebates/overview', { preHandler: read, schema: { tags, summary: 'Tổng hợp thưởng mọi chính sách trong kỳ', querystring: z.object({ month: z.string().regex(/^\d{4}-\d{2}$/) }) },
    handler: async (req) => { const a = authOf(req); return ok(await rebateOverview(db, a.tenantId, await ctxOf(a.tenantId), req.query.month)); } });
  r.post('/api/v1/purchase/rebates/preview', { preHandler: read, schema: { tags, summary: 'Tính thưởng cuối kỳ (xem trước)', body: z.object({ policyCode: z.string().min(1), period: z.string().min(4), manualTotal: z.number().nonnegative().optional() }) },
    handler: async (req) => {
      const a = authOf(req); const ctx = await ctxOf(a.tenantId);
      const p = ctx.policies.find((x) => x.code === req.body.policyCode && ['period_rebate', 'target_rebate', 'stage_rebate'].includes(x.kind));
      if (!p) throw Errors.notFound('chính sách thưởng');
      if (p.kind === 'stage_rebate' && req.body.manualTotal !== undefined) throw Errors.validation('Thưởng theo giai đoạn tính theo doanh số từng ngày từ phiếu đã duyệt — không nhập doanh số tay');
      return ok(await rebatePreview(db, a.tenantId, ctx, p, req.body.period, req.body.manualTotal));
    } });
  r.get('/api/v1/purchase/allocations/:id', { preHandler: read, schema: { tags, summary: 'Phân bổ phiếu chi phí vào phiếu nhập', params: idParamSchema, querystring: z.object({ basis: z.enum(['value', 'qty']).optional() }) },
    handler: async (req) => ok(costAllocation(await ctxOf(authOf(req).tenantId), req.params.id, req.query.basis)) });
  r.get('/api/v1/purchase/real-cost/:id', { preHandler: read, schema: { tags, summary: 'Giá vốn thực tế từng mã của phiếu nhập', params: idParamSchema }, handler: async (req) => ok(await realCost(db, authOf(req).tenantId, await ctxOf(authOf(req).tenantId), req.params.id)) });
  r.get('/api/v1/purchase/logs', { preHandler: read, schema: { tags, summary: 'Nhật ký mua hàng (JSONL)', querystring: z.object({ event: z.string().optional(), from: z.string().optional(), to: z.string().optional(), docNo: z.string().optional(), partnerCode: z.string().optional() }) },
    handler: async (req) => {
      const q = req.query;
      // docNo: số phiếu / mã chính sách (lịch sử một phiếu, một chính sách); partnerCode: mọi việc của một NCC.
      const rows = (await readLog(authOf(req).tenantId, q)).filter((r) => (!q.docNo || r.docNo === q.docNo) && (!q.partnerCode || (r.data as { partnerCode?: string })?.partnerCode === q.partnerCode));
      return ok(rows);
    } });
  // Mặt hàng & giá mua của NCC (một nơi: hồ sơ NCC và form mặt hàng cùng dùng).
  r.get('/api/v1/purchase/supplier-products', { preHandler: read, schema: { tags, summary: 'Mặt hàng & giá mua: theo NCC (kèm giá chung nếu withGeneral=1) hoặc theo mã; units=1 trả kèm ĐVT các mã', querystring: z.object({ partnerCode: z.string().optional(), sku: z.string().optional(), withGeneral: z.coerce.boolean().optional(), all: z.coerce.boolean().optional() }) },
    handler: async (req) => {
      const a = authOf(req);
      const rows = await listSupplierProducts(db, a.tenantId, req.query);
      return ok({ rows, units: await unitsOf(db, a.tenantId, rows.map((r) => r.sku).concat(req.query.sku ? [req.query.sku] : [])) });
    } });
  r.post('/api/v1/purchase/supplier-products', { preHandler: catalog, schema: { tags, summary: 'Thêm / sửa nhiều dòng mặt hàng & giá mua (chọn mã, dán nhiều mã, nhập Excel); ĐVT phải có ở mặt hàng', body: z.object({ rows: z.array(supplierProductSchema).min(1).max(5000) }) },
    handler: async (req) => {
      const a = authOf(req);
      const out = await db.transaction().execute((trx) => saveSupplierProducts(trx, a.tenantId, a.actorName, req.body.rows));
      const partners = [...new Set(req.body.rows.map((r) => r.partnerCode ?? ''))];
      await logEvents(a.tenantId, partners.map((pc) => ({ event: 'supplier_products', docNo: '', user: a.actorName, data: { partnerCode: pc || undefined, ...out, rows: req.body.rows.filter((r) => (r.partnerCode ?? '') === pc).slice(0, 30).map((r) => `${r.sku} ${r.unit}${r.price !== null && r.price !== undefined ? ` ${r.price.toLocaleString('vi-VN')}đ` : ''}${r.isActive ? '' : ' (bỏ)'}`) } })));
      return ok(out);
    } });
  r.delete('/api/v1/purchase/supplier-products/:id', { preHandler: catalog, schema: { tags, summary: 'Xoá hẳn một dòng mặt hàng & giá mua', params: idParamSchema },
    handler: async (req) => {
      const a = authOf(req);
      const row = await db.transaction().execute((trx) => deleteSupplierProduct(trx, a.tenantId, req.params.id));
      await logEvents(a.tenantId, [{ event: 'supplier_products', docNo: '', user: a.actorName, data: { partnerCode: row.partnerCode || undefined, added: 0, updated: 0, rows: [`${row.sku} ${row.unit}${row.price !== null && row.price !== undefined ? ` ${row.price.toLocaleString('vi-VN')}đ (${row.priceIncludesVat ? 'gồm' : 'chưa'} thuế)` : ' chưa có giá'}${row.validFrom ? `, hiệu lực từ ${row.validFrom.split('-').reverse().join('/')}` : ''}${row.validTo ? ` đến ${row.validTo.split('-').reverse().join('/')}` : ''}${row.note ? `, ghi chú: ${row.note}` : ''} (xoá vĩnh viễn)`], deleted: row } }]);
      return ok({ id: req.params.id });
    } });
  r.get('/api/v1/purchase/suppliers/:code/brands', { preHandler: read, schema: { tags, summary: 'Các nhãn hàng NCC bán (suy từ mặt hàng NCC bán / đã nhập, nhãn theo danh mục mặt hàng) — gợi ý khi lập chính sách', params: z.object({ code: z.string().min(1).max(64) }) },
    handler: async (req) => ok(await supplierBrandList(db, authOf(req).tenantId, req.params.code)) });
  r.get('/api/v1/purchase/product-cost/:sku', { preHandler: read, schema: { tags, summary: 'Giá vốn của một mã theo ĐVT nhỏ nhất: bình quân tháng gần nhất + tạm tính theo tồn hiện tại', params: z.object({ sku: z.string().min(1).max(64) }) },
    handler: async (req) => ok(await productCost(db, authOf(req).tenantId, req.params.sku)) });
  r.post('/api/v1/purchase/units', { preHandler: read, schema: { tags, summary: 'ĐVT của nhiều mã (danh sách dài: gửi trong thân)', body: z.object({ skus: z.array(z.string().max(64)).max(20000) }) },
    handler: async (req) => ok(await unitsOf(db, authOf(req).tenantId, req.body.skus)) });
  r.get('/api/v1/purchase/units', { preHandler: read, schema: { tags, summary: 'ĐVT của các mã (tỉ lệ, bán chính, mua mặc định)', querystring: z.object({ skus: z.string() }) },
    handler: async (req) => ok(await unitsOf(db, authOf(req).tenantId, req.query.skus.split(',').map((x) => x.trim()))) });
  r.get('/api/v1/purchase/db-schema', { preHandler: read, schema: { tags, summary: 'Cấu trúc CSDL phân hệ Mua hàng đọc thẳng từ PostgreSQL: bảng, cột, chú thích, chỉ mục, trigger, số dòng' },
    handler: async (req) => ok(await purchaseSchema(db, authOf(req).tenantId)) });
  r.get('/api/v1/purchase/todo', { preHandler: read, schema: { tags, summary: 'Việc cần làm + số chứng từ theo loại (trang Quy trình)', querystring: z.object({ asOf: day.optional() }) },
    handler: async (req) => { const a = authOf(req); return ok(await purchaseTodo(db, a.tenantId, await ctxOf(a.tenantId), req.query.asOf)); } });
  r.get('/api/v1/purchase/scenarios', { preHandler: read, schema: { tags, summary: '25 tình huống của tài liệu yêu cầu — phép thử công thức' }, handler: async () => ok(runScenarios().map(({ actual: _a, ...x }) => x)) });

  // ---------------- Cài đặt, dữ liệu mẫu
  r.get('/api/v1/purchase/settings', { preHandler: read, schema: { tags, summary: 'Cài đặt mua hàng: ngày nghỉ, số dư nhãn đầu kỳ, tài khoản' },
    handler: async (req) => { const a = authOf(req); const s = await loadSettings(db, a.tenantId); return ok({ ...s, resolvedAccounts: await resolveAccounts(db, a.tenantId, s) }); } });
  r.put('/api/v1/purchase/settings', { preHandler: settings, schema: { tags, summary: 'Lưu cài đặt mua hàng', body: z.object({ holidays: z.array(day).default([]), brandOpening: z.record(z.record(z.number())).default({}), accounts: z.record(z.string()).default({}), warnDays: z.number().int().min(0).max(60).default(3), priceWarnPct: z.number().min(0).max(100).default(2), requireOrder: z.boolean().default(false) }) },
    handler: async (req) => { const a = authOf(req); await saveSettings(db, a.tenantId, req.body); return ok(req.body); } });
  const seedBody = z.object({ password: z.string().default(''), reset: z.boolean().default(false) }).optional();
  r.post('/api/v1/purchase/demo/seed', { preHandler: settings, schema: { tags, summary: 'Nạp dữ liệu tình huống (25 tình huống + ví dụ bổ sung) vào sổ thật — cần mật khẩu; reset = xoá bản cũ rồi nạp', body: seedBody },
    handler: async (req) => { checkSeedPassword(req.body?.password); return ok(await seedDemo(authOf(req), { reset: req.body?.reset })); } });
  r.post('/api/v1/purchase/demo/warehouses', { preHandler: settings, schema: { tags, summary: 'Thêm kho mặc định cho chi nhánh mẫu chưa có kho (CN-NA, CN-ND, CN-PT, CN-HCM) — không sửa phiếu; cần mật khẩu', body: seedBody },
    handler: async (req) => { checkSeedPassword(req.body?.password); return ok(await ensureDemoWarehouses(authOf(req))); } });
  r.post('/api/v1/purchase/demo/clear', { preHandler: settings, schema: { tags, summary: 'Xoá dữ liệu tình huống (đảo bút toán đã ghi) — cần mật khẩu', body: seedBody },
    handler: async (req) => { checkSeedPassword(req.body?.password); return ok(await clearDemo(authOf(req))); } });
}
