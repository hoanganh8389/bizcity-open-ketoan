// @bizcity-layer D modules/mua-hang
// [2026-11-01 12:47 AM Johnny Chu - Chu Hoàng Anh] PHASE-010 — gỡ tệp đính kèm = lưu trữ (đính kèm chung, 0046), ghi người gỡ
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
import { runScenarios } from '@bizcity/mua-hang-domain';
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
import { saveVariantSeparate, variantOverview, variantSeparate } from './bien-the.js';
import { skuInfoRows } from './thong-tin-ma.js';
import { deleteEmptyThungRows, emptyThungRows, thungApply, thungPlan } from './dvt-thung.js';
import { deletePolicy, listDocs, listPolicies, policyInputSchema, savePolicy } from './store.js';
import { defineAction, mountActions, type AnyActionDef, sameTx } from '@bizcity/platform/core/actions';

const tags = ['Mua hàng'];
const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

// [2026-11-03 04:00 AM Johnny Chu - Chu Hoàng Anh] PHASE-014 — W6 đợt 3 (SC-ACT-1): trợ giúp dời ra cấp tệp để action dùng chung
const ctxOf = async (tenantId: string) => loadCtx(db, tenantId, await listDocs(db, tenantId), { full: true });
const thungBody = z.object({ days: z.number().int().min(0).max(3650).default(30), specs: z.record(z.string(), z.string().trim().max(60)).default({}) });
const seedBody = z.object({ password: z.string().default(''), reset: z.boolean().default(false) }).optional();

export async function purchaseRoutes(app: FastifyInstance): Promise<void> {
  const r = app.withTypeProvider<ZodTypeProvider>();
  const read = requirePermission('documents:read');
  const write = requirePermission('documents:write');
  const catalog = requirePermission('catalog:write');
  const settings = requirePermission('settings:write');

  // ---------------- Chứng từ
  r.get('/api/v1/purchase/documents', { preHandler: read, schema: { tags, summary: 'Danh sách chứng từ mua hàng', querystring: z.object({ kind: z.string().optional(), status: z.string().optional(), partnerCode: z.string().optional(), from: day.optional(), to: day.optional() }) },
    handler: async (req) => {
      const rows = await purchaseService.list(authOf(req), req.query);
      return ok(rows, { total: rows.length, page: 1, pageSize: rows.length });
    } });
  r.get('/api/v1/purchase/documents/:id', { preHandler: read, schema: { tags, summary: 'Một chứng từ + kết quả bộ máy', params: idParamSchema }, handler: async (req) => ok(await purchaseService.get(authOf(req), req.params.id)) });

  // ---------------- Nhà cung cấp (mọi việc mua hàng đi từ NCC)
  r.get('/api/v1/purchase/suppliers', { preHandler: read, schema: { tags, summary: 'Nhà cung cấp mua hàng: nợ, quá hạn, hạn mức, điều khoản, chính sách, hợp đồng, lần nhập gần nhất', querystring: z.object({ scope: z.enum(['active', 'all']).default('active'), asOf: day.optional() }) },
    handler: async (req) => { const a = authOf(req); return ok(await supplierList(db, a.tenantId, await ctxOf(a.tenantId), req.query.scope, req.query.asOf)); } });
  r.get('/api/v1/purchase/suppliers/:code', { preHandler: read, schema: { tags, summary: 'Hồ sơ một nhà cung cấp', params: z.object({ code: z.string().min(1) }) },
    handler: async (req) => { const a = authOf(req); return ok(await supplierProfile(db, a.tenantId, await ctxOf(a.tenantId), req.params.code)); } });

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
  r.get('/api/v1/purchase/suppliers/:code/brands', { preHandler: read, schema: { tags, summary: 'Các nhãn hàng NCC bán (suy từ mặt hàng NCC bán / đã nhập, nhãn theo danh mục mặt hàng) — gợi ý khi lập chính sách', params: z.object({ code: z.string().min(1).max(64) }) },
    handler: async (req) => ok(await supplierBrandList(db, authOf(req).tenantId, req.params.code)) });
  r.get('/api/v1/purchase/product-cost/:sku', { preHandler: read, schema: { tags, summary: 'Giá vốn của một mã theo ĐVT nhỏ nhất: bình quân tháng gần nhất + tạm tính theo tồn hiện tại', params: z.object({ sku: z.string().min(1).max(64) }) },
    handler: async (req) => ok(await productCost(db, authOf(req).tenantId, req.params.sku)) });
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
  r.get('/api/v1/purchase/variants', { preHandler: read, schema: { tags, summary: 'Biến thể mặt hàng (MH26): đuôi mã, số mã con, đuôi nào tách riêng khi phân tích đặt hàng' },
    handler: async (req) => ok(await variantOverview(db, authOf(req).tenantId)) });
  r.get('/api/v1/purchase/units/thung/empty-rows', { preHandler: read, schema: { tags, summary: 'MH27: dòng Thùng trống giá thừa (bản đầu từng thêm) — cùng NCC × mã còn dòng có giá' },
    handler: async (req) => ok(await emptyThungRows(db, authOf(req).tenantId)) });
  r.post('/api/v1/purchase/demo/seed', { preHandler: settings, schema: { tags, summary: 'Nạp dữ liệu tình huống (25 tình huống + ví dụ bổ sung) vào sổ thật — cần mật khẩu; reset = xoá bản cũ rồi nạp', body: seedBody },
    handler: async (req) => { checkSeedPassword(req.body?.password); return ok(await seedDemo(authOf(req), { reset: req.body?.reset })); } });
  r.post('/api/v1/purchase/demo/warehouses', { preHandler: settings, schema: { tags, summary: 'Thêm kho mặc định cho chi nhánh mẫu chưa có kho (CN-NA, CN-ND, CN-PT, CN-HCM) — không sửa phiếu; cần mật khẩu', body: seedBody },
    handler: async (req) => { checkSeedPassword(req.body?.password); return ok(await ensureDemoWarehouses(authOf(req))); } });
  r.post('/api/v1/purchase/demo/clear', { preHandler: settings, schema: { tags, summary: 'Xoá dữ liệu tình huống (đảo bút toán đã ghi) — cần mật khẩu', body: seedBody },
    handler: async (req) => { checkSeedPassword(req.body?.password); return ok(await clearDemo(authOf(req))); } });
  mountActions(app, routesTsWriteActions);
  mountActions(app, routesWriteActions);
}

// [2026-11-03 04:00 AM Johnny Chu - Chu Hoàng Anh] PHASE-014 — W6 đợt 3 (SC-ACT-1): route ghi qua defineAction — quyền, kiểm input, idempotency, giao dịch, bằng chứng do runtime; đường dẫn / thân yêu cầu / mã 201 như cũ.
// Mã cũ trong handler chạy trong giao dịch của action (sameTx); service tự mở giao dịch có bản *In.
const anyOut = z.custom<object>((v) => typeof v === 'object' && v !== null);

export const routesTsWriteActions: AnyActionDef[] = [
  defineAction({
    id: 'mua-hang.purchase.document-upsert', title: 'Sửa chứng từ nháp / chờ duyệt', tags,
    permission: 'documents:write', effect: 'write', sideEffects: ['documents'], idempotency: 'natural',
    input: idParamSchema.passthrough(), output: anyOut,
    expose: { http: { method: 'PUT', path: '/api/v1/purchase/documents/:id' }, mcp: false, ai: 'deny' },
    evidence: { objectType: 'purchase', objectId: (i) => String(i.id) },
    handler: (ctx, input) => {
      const { id, ...reqBody } = input;
      return purchaseService.saveIn(ctx.data.tx, ctx.legacyAuth, reqBody, id);
    },
  }),
  defineAction({
    id: 'mua-hang.purchase.analyze', title: 'Chạy bộ máy cho phiếu đang nhập: tiền, hạn, cảnh báo, hạn mức, giá mua, bút toán xem trước', tags,
    permission: 'documents:read', effect: 'read', idempotency: 'none',
    input: z.object({}).passthrough(), output: anyOut,
    expose: { http: { method: 'POST', path: '/api/v1/purchase/analyze' }, mcp: false, ai: 'read' },
    handler: (ctx, input) => purchaseService.analyzeIn(ctx.data.tx, ctx.legacyAuth, input),
  }),
  defineAction({
    id: 'mua-hang.purchase.documents-submit', title: 'Gửi duyệt', tags,
    permission: 'documents:write', effect: 'write', sideEffects: ['documents'], idempotency: 'natural',
    input: idParamSchema, output: anyOut,
    expose: { http: { method: 'POST', path: '/api/v1/purchase/documents/:id/submit' }, mcp: false, ai: 'deny' },
    evidence: { objectType: 'purchase', objectId: (i) => String(i.id) },
    handler: (ctx, input) => purchaseService.submitIn(ctx.data.tx, ctx.legacyAuth, input.id),
  }),
  defineAction({
    id: 'mua-hang.purchase.documents-approve', title: 'Duyệt = ghi sổ (409 nếu còn cảnh báo chặn)', tags,
    permission: 'documents:write', effect: 'write', sideEffects: ['documents'], idempotency: 'natural',
    input: idParamSchema, output: anyOut,
    expose: { http: { method: 'POST', path: '/api/v1/purchase/documents/:id/approve' }, mcp: false, ai: 'deny' },
    evidence: { objectType: 'purchase', objectId: (i) => String(i.id) },
    handler: (ctx, input) => purchaseService.approveIn(ctx.data.tx, ctx.legacyAuth, input.id),
  }),
  defineAction({
    id: 'mua-hang.purchase.documents-override', title: 'Duyệt ngoại lệ vượt hạn mức (bắt buộc lý do)', tags,
    permission: 'payments:approve', effect: 'write', sideEffects: ['documents'], idempotency: 'natural',
    input: (z.object({ reason: z.string().trim().min(3, 'Ghi lý do duyệt ngoại lệ') })).merge(idParamSchema), output: anyOut,
    expose: { http: { method: 'POST', path: '/api/v1/purchase/documents/:id/override' }, mcp: false, ai: 'deny' },
    evidence: { objectType: 'purchase', objectId: (i) => String(i.id) },
    handler: (ctx, input) => {
      const { id, ...reqBody } = input;
      return purchaseService.approveIn(ctx.data.tx, ctx.legacyAuth, id, { reason: reqBody.reason });
    },
  }),
  defineAction({
    id: 'mua-hang.purchase.documents-review-outside', title: 'Rà soát phiếu nhập ngoài đơn đã duyệt (ghi người, lúc, ghi chú)', tags,
    permission: 'payments:approve', effect: 'write', sideEffects: ['documents'], idempotency: 'natural',
    input: (z.object({ note: z.string().trim().max(500).default('') })).merge(idParamSchema), output: anyOut,
    expose: { http: { method: 'POST', path: '/api/v1/purchase/documents/:id/review-outside' }, mcp: false, ai: 'deny' },
    evidence: { objectType: 'purchase', objectId: (i) => String(i.id) },
    handler: (ctx, input) => {
      const { id, ...reqBody } = input;
      return purchaseService.reviewOutsideIn(ctx.data.tx, ctx.legacyAuth, id, reqBody.note);
    },
  }),
  defineAction({
    id: 'mua-hang.purchase.documents-cancel', title: 'Huỷ chứng từ chưa duyệt (không xoá)', tags,
    permission: 'documents:write', effect: 'write', sideEffects: ['documents'], idempotency: 'natural',
    input: idParamSchema, output: anyOut,
    expose: { http: { method: 'POST', path: '/api/v1/purchase/documents/:id/cancel' }, mcp: false, ai: 'deny' },
    evidence: { objectType: 'purchase', objectId: (i) => String(i.id) },
    handler: (ctx, input) => purchaseService.cancelIn(ctx.data.tx, ctx.legacyAuth, input.id),
  }),
  defineAction({
    id: 'mua-hang.purchase.products-lookup', title: 'Tra nhiều mã hàng một lần (nhập Excel): tên, ĐVT, thuế đầu vào, nhãn', tags,
    permission: 'documents:read', effect: 'read', idempotency: 'none',
    input: z.object({ skus: z.array(z.string()).max(5000) }), output: anyOut,
    expose: { http: { method: 'POST', path: '/api/v1/purchase/products-lookup' }, mcp: false, ai: 'read' },
    handler: async (ctx, input) => {
      const trx = ctx.data.tx;
      const skus = [...new Set(input.skus.map((s) => s.trim()).filter(Boolean))];
      const rows = skus.length ? await trx.selectFrom('products').select(['sku', 'name', 'unit', 'tax_in_code', 'brand_code']).where('tenant_id', '=', ctx.legacyAuth.tenantId).where('sku', 'in', skus).execute() : [];
      return rows.map((p) => ({ sku: p.sku, name: p.name, unit: p.unit, taxInCode: p.tax_in_code, brandCode: p.brand_code }));
    },
  }),
  defineAction({
    id: 'mua-hang.purchase.attachment-delete', title: 'Gỡ tệp khỏi hồ sơ (lưu trữ, không xoá cứng — tệp vẫn trên ổ)', tags,
    permission: 'documents:write', effect: 'write', sideEffects: ['documents'], idempotency: 'natural',
    input: idParamSchema, output: anyOut,
    expose: { http: { method: 'DELETE', path: '/api/v1/purchase/attachments/:id' }, mcp: false, ai: 'deny' },
    evidence: { objectType: 'purchase', objectId: (i) => String(i.id) },
    handler: async (ctx, input) => {
      const trx = ctx.data.tx; const a = ctx.legacyAuth; await deleteAttachment(trx, a.tenantId, input.id, a.actorName); return { deleted: true }; },
  }),
  defineAction({
    id: 'mua-hang.purchase.policy-delete', title: 'Xoá chính sách chưa áp vào phiếu nào (đã áp: 409, tắt "Áp dụng")', tags,
    permission: 'catalog:write', effect: 'write', sideEffects: ['documents'], idempotency: 'natural',
    input: idParamSchema, output: anyOut,
    expose: { http: { method: 'DELETE', path: '/api/v1/purchase/policies/:id' }, mcp: false, ai: 'deny' },
    evidence: { objectType: 'purchase', objectId: (i) => String(i.id) },
    handler: async (ctx, input) => {
      const trx = ctx.data.tx;
      const auth = ctx.legacyAuth;
      const p = await sameTx(trx, (trx) => deletePolicy(trx, auth.tenantId, input.id));
      await logEvents(auth.tenantId, [{ event: 'policy_deleted', docNo: p.code, user: auth.actorName, data: { code: p.code, kind: p.kind, name: p.name, partnerCode: p.scope.partnerCode, rule: p.rule, scope: p.scope } }]);
      return { id: input.id };
    },
  }),
  defineAction({
    id: 'mua-hang.purchase.supplier-products', title: 'Thêm / sửa nhiều dòng mặt hàng & giá mua (chọn mã, dán nhiều mã, nhập Excel); ĐVT phải có ở mặt hàng', tags,
    permission: 'catalog:write', effect: 'write', sideEffects: ['documents'], idempotency: 'natural',
    input: z.object({ rows: z.array(supplierProductSchema).min(1).max(5000) }), output: anyOut,
    expose: { http: { method: 'POST', path: '/api/v1/purchase/supplier-products' }, mcp: false, ai: 'deny' },
    evidence: { objectType: 'purchase' },
    handler: async (ctx, input) => {
      const trx = ctx.data.tx;
      const a = ctx.legacyAuth;
      const out = await sameTx(trx, (trx) => saveSupplierProducts(trx, a.tenantId, a.actorName, input.rows));
      const partners = [...new Set(input.rows.map((r) => r.partnerCode ?? ''))];
      await logEvents(a.tenantId, partners.map((pc) => ({ event: 'supplier_products', docNo: '', user: a.actorName, data: { partnerCode: pc || undefined, ...out, rows: input.rows.filter((r) => (r.partnerCode ?? '') === pc).slice(0, 30).map((r) => `${r.sku} ${r.unit}${r.price !== null && r.price !== undefined ? ` ${r.price.toLocaleString('vi-VN')}đ` : ''}${r.isActive ? '' : ' (bỏ)'}`) } })));
      return out;
    },
  }),
  defineAction({
    id: 'mua-hang.purchase.supplier-product-delete', title: 'Xoá hẳn một dòng mặt hàng & giá mua', tags,
    permission: 'catalog:write', effect: 'write', sideEffects: ['documents'], idempotency: 'natural',
    input: idParamSchema, output: anyOut,
    expose: { http: { method: 'DELETE', path: '/api/v1/purchase/supplier-products/:id' }, mcp: false, ai: 'deny' },
    evidence: { objectType: 'purchase', objectId: (i) => String(i.id) },
    handler: async (ctx, input) => {
      const trx = ctx.data.tx;
      const a = ctx.legacyAuth;
      const row = await sameTx(trx, (trx) => deleteSupplierProduct(trx, a.tenantId, input.id));
      await logEvents(a.tenantId, [{ event: 'supplier_products', docNo: '', user: a.actorName, data: { partnerCode: row.partnerCode || undefined, added: 0, updated: 0, rows: [`${row.sku} ${row.unit}${row.price !== null && row.price !== undefined ? ` ${row.price.toLocaleString('vi-VN')}đ (${row.priceIncludesVat ? 'gồm' : 'chưa'} thuế)` : ' chưa có giá'}${row.validFrom ? `, hiệu lực từ ${row.validFrom.split('-').reverse().join('/')}` : ''}${row.validTo ? ` đến ${row.validTo.split('-').reverse().join('/')}` : ''}${row.note ? `, ghi chú: ${row.note}` : ''} (xoá vĩnh viễn)`], deleted: row } }]);
      return { id: input.id };
    },
  }),
  defineAction({
    id: 'mua-hang.purchase.settings', title: 'Lưu cài đặt mua hàng', tags,
    permission: 'settings:write', effect: 'write', sideEffects: ['documents'], idempotency: 'natural',
    input: z.object({ holidays: z.array(day).default([]), brandOpening: z.record(z.record(z.number())).default({}), accounts: z.record(z.string()).default({}), warnDays: z.number().int().min(0).max(60).default(3), priceWarnPct: z.number().min(0).max(100).default(2), requireOrder: z.boolean().default(false) }), output: anyOut,
    expose: { http: { method: 'PUT', path: '/api/v1/purchase/settings' }, mcp: false, ai: 'deny' },
    evidence: { objectType: 'purchase' },
    handler: async (ctx, input) => {
      const trx = ctx.data.tx;
      const a = ctx.legacyAuth;
      // Giữ cấu hình biến thể (MH26) — màn MH12 không gửi trường này.
      const keep = (await loadSettings(trx, a.tenantId)).variantSeparate;
      await saveSettings(trx, a.tenantId, { ...input, ...(keep ? { variantSeparate: keep } : {}) });
      return input;
    },
  }),
  defineAction({
    id: 'mua-hang.purchase.variants', title: 'Lưu đuôi mã tách riêng khi phân tích đặt hàng', tags,
    permission: 'settings:write', effect: 'write', sideEffects: ['documents'], idempotency: 'natural',
    input: z.object({ separate: z.array(z.string().trim().min(1).max(3)).max(30) }), output: anyOut,
    expose: { http: { method: 'PUT', path: '/api/v1/purchase/variants' }, mcp: false, ai: 'deny' },
    evidence: { objectType: 'purchase' },
    handler: async (ctx, input) => {
      const trx = ctx.data.tx;
      const a = ctx.legacyAuth;
      const before = await variantSeparate(trx, a.tenantId);
      const separate = await saveVariantSeparate(trx, a.tenantId, input.separate);
      await logEvents(a.tenantId, [{ event: 'variants_saved', docNo: '', user: a.actorName, data: { before, after: separate } }]);
      return { separate };
    },
  }),
];

// [2026-11-03 04:00 AM Johnny Chu - Chu Hoàng Anh] PHASE-014 — W6 đợt 3 (SC-ACT-1): route ghi qua defineAction — quyền, kiểm input, idempotency, giao dịch, bằng chứng do runtime; đường dẫn / thân yêu cầu / mã 201 như cũ.
// Mã cũ trong handler chạy trong giao dịch của action (sameTx); service tự mở giao dịch có bản *In.


export const routesWriteActions: AnyActionDef[] = [
  // [2026-11-03 11:20 AM Johnny Chu - Chu Hoàng Anh] PHASE-014 — W6 đợt 6: hai route dạng r.post(url, opts, handler) công cụ chuyển đổi bỏ sót
  defineAction({
    id: 'mua-hang.sku-info.lookup', title: 'Tên theo danh mục, đường dẫn nhóm hàng, ngành · nhãn · nhóm của nhiều mã (báo cáo MH23)', tags,
    permission: 'documents:read', effect: 'read', idempotency: 'none',
    input: z.object({ skus: z.array(z.string().max(64)).max(20000) }), output: anyOut,
    expose: { http: { method: 'POST', path: '/api/v1/purchase/sku-info' }, mcp: false, ai: 'read' },
    handler: (ctx, input) => skuInfoRows(ctx.data.tx, ctx.tenant.id, input.skus),
  }),
  defineAction({
    id: 'mua-hang.unit.thung-empty-rows-delete', title: 'MH27: xoá vĩnh viễn các dòng Thùng trống giá thừa, ghi nhật ký đủ nội dung', tags,
    permission: 'settings:write', effect: 'write', sideEffects: ['masterdata'], idempotency: 'natural',
    input: z.object({}), output: z.object({ count: z.number() }),
    expose: { http: { method: 'POST', path: '/api/v1/purchase/units/thung/empty-rows/delete' }, mcp: false, ai: 'deny' },
    evidence: { objectType: 'supplier_product' },
    handler: async (ctx) => {
      const a = ctx.legacyAuth;
      const res = await deleteEmptyThungRows(ctx.data.tx, a.tenantId);
      if (res.count) {
        ctx.evidence.note('deleted', res.deleted);
        await logEvents(a.tenantId, [{ event: 'units_thung_cleanup', docNo: '', user: a.actorName, data: { count: res.count, deleted: res.deleted } }]);
      }
      return { count: res.count };
    },
  }),
  // [2026-11-03 06:40 AM Johnny Chu - Chu Hoàng Anh] PHASE-014 — W6 đợt 4: bỏ duyệt trong giao dịch của action (huỷ chứng từ con + về nháp cùng lúc)
  defineAction({
    id: 'mua-hang.purchase.documents-unapprove', title: 'Bỏ duyệt: huỷ chứng từ kế toán đã sinh, về nháp (body tuỳ chọn { reason })', tags,
    permission: 'documents:write', effect: 'write', sideEffects: ['documents', 'ledger'], idempotency: 'natural',
    input: idParamSchema.extend({ reason: z.string().trim().max(500).optional() }), output: anyOut,
    expose: { http: { method: 'POST', path: '/api/v1/purchase/documents/:id/unapprove' }, mcp: false, ai: 'deny' },
    evidence: { objectType: 'purchase', objectId: (i) => String(i.id) },
    handler: (ctx, input) => purchaseService.unapproveIn(ctx.data.tx, ctx.legacyAuth, input.id, input.reason || undefined),
  }),
  defineAction({
    id: 'mua-hang.purchase.document-create', title: 'Thêm chứng từ (nháp); số phiếu trống thì tự cấp', tags,
    permission: 'documents:write', effect: 'write', sideEffects: ['documents'], idempotency: 'required',
    input: z.object({}).passthrough(), output: anyOut,
    expose: { http: { method: 'POST', path: '/api/v1/purchase/documents', status: 201 }, mcp: false, ai: 'deny' },
    evidence: { objectType: 'purchase' },
    handler: (ctx, input) => purchaseService.saveIn(ctx.data.tx, ctx.legacyAuth, input),
  }),
  defineAction({
    id: 'mua-hang.policy.transfer-limit', title: 'Điều chuyển hạn mức nhãn giữa chi nhánh', tags,
    permission: 'catalog:write', effect: 'write', sideEffects: ['documents'], idempotency: 'natural',
    input: (z.object({ from: z.string().default(''), to: z.string().min(1), amount: z.number().positive() })).merge(idParamSchema), output: anyOut,
    expose: { http: { method: 'POST', path: '/api/v1/purchase/policies/:id/transfer-limit' }, mcp: false, ai: 'deny' },
    evidence: { objectType: 'policy', objectId: (i) => String(i.id) },
    handler: async (ctx, input) => {
      const { id: _id, ...reqBody } = input;
      const trx = ctx.data.tx;
      const auth = ctx.legacyAuth;
      const p = (await listPolicies(trx, auth.tenantId)).find((x) => x.id === input.id && x.kind === 'credit_limit');
      if (!p) throw Errors.notFound('chính sách hạn mức');
      const rule = p.rule as { limit: number; warnPct?: number; branches?: Record<string, number> };
      const branches = { ...(rule.branches ?? {}) };
      const { from, to, amount } = reqBody;
      if (from === to) throw Errors.validation('Nơi chuyển và nơi nhận trùng nhau');
      const pool = from ? branches[from] ?? 0 : rule.limit - Object.values(branches).reduce((a, b) => a + b, 0);
      // Chuyển từ chi nhánh: chỉ được chuyển phần CÒN TRỐNG (hạn mức − nợ nhãn đã ghi − phiếu đang chờ); phần đã bị nợ chiếm vẫn nằm ở chi nhánh đó
      const used = from ? await brandBranchUsage(trx, auth.tenantId, await ctxOf(auth.tenantId), p.scope.brandCode!, from) : { current: 0, pending: 0 };
      const free = Math.max(0, pool - used.current - used.pending);
      if (amount > free) throw Errors.validation(from
        ? `Số chuyển vượt phần còn trống của ${from}: chỉ còn ${free.toLocaleString('vi-VN')} (hạn mức ${pool.toLocaleString('vi-VN')} − nợ đã ghi ${used.current.toLocaleString('vi-VN')} − đang chờ ${used.pending.toLocaleString('vi-VN')})`
        : `Số chuyển vượt hạn mức chưa phân bổ (${pool.toLocaleString('vi-VN')})`);
      if (from) branches[from] = pool - amount;
      branches[to] = (branches[to] ?? 0) + amount;
      await sameTx(trx, (trx) => savePolicy(trx, auth.tenantId, auth.actor, policyInputSchema.parse({ ...p, rule: { ...rule, branches }, validFrom: p.validFrom ?? null, validTo: p.validTo ?? null }), p.id));
      await logEvents(auth.tenantId, [{ event: 'limit_transfer', docNo: '', user: auth.actorName, data: { policy: p.code, brand: p.scope.brandCode, from: from || 'Chưa phân bổ', to, amount, before: rule.branches ?? {}, after: branches } }]);
      return { branches };
    },
  }),
  defineAction({
    id: 'mua-hang.rebate.preview', title: 'Tính thưởng cuối kỳ (xem trước)', tags,
    permission: 'documents:read', effect: 'read', idempotency: 'none',
    input: z.object({ policyCode: z.string().min(1), period: z.string().min(4), manualTotal: z.number().nonnegative().optional() }), output: anyOut,
    expose: { http: { method: 'POST', path: '/api/v1/purchase/rebates/preview' }, mcp: false, ai: 'read' },
    handler: async (ctx, input) => {
      const trx = ctx.data.tx;
      const a = ctx.legacyAuth; const cx = await ctxOf(a.tenantId);
      const p = cx.policies.find((x) => x.code === input.policyCode && ['period_rebate', 'target_rebate', 'stage_rebate'].includes(x.kind));
      if (!p) throw Errors.notFound('chính sách thưởng');
      if (p.kind === 'stage_rebate' && input.manualTotal !== undefined) throw Errors.validation('Thưởng theo giai đoạn tính theo doanh số từng ngày từ phiếu đã duyệt — không nhập doanh số tay');
      return await rebatePreview(trx, a.tenantId, cx, p, input.period, input.manualTotal);
    },
  }),
  defineAction({
    id: 'mua-hang.unit.lookup', title: 'ĐVT của nhiều mã (danh sách dài: gửi trong thân)', tags,
    permission: 'documents:read', effect: 'read', idempotency: 'none',
    input: z.object({ skus: z.array(z.string().max(64)).max(20000) }), output: anyOut,
    expose: { http: { method: 'POST', path: '/api/v1/purchase/units' }, mcp: false, ai: 'read' },
    handler: async (ctx, input) => {
      const trx = ctx.data.tx;
      return await unitsOf(trx, ctx.legacyAuth.tenantId, input.skus);
    },
  }),
  defineAction({
    id: 'mua-hang.unit.thung-preview', title: 'ĐVT Thùng đặt hàng (MH27): xem trước — mã có tương tác mua / NCC khai trong N ngày, quy cách nhập vào (specs: 12 Lốc, 12CAN/THÙNG) quy về ĐVT nhỏ nhất; không có thì đoán theo ngữ cảnh (mặc định 48)', tags,
    permission: 'documents:read', effect: 'read', idempotency: 'none',
    input: thungBody, output: anyOut,
    expose: { http: { method: 'POST', path: '/api/v1/purchase/units/thung/preview' }, mcp: false, ai: 'read' },
    handler: async (ctx, input) => {
      const trx = ctx.data.tx;
      return await thungPlan(trx, ctx.legacyAuth.tenantId, input);
    },
  }),
  defineAction({
    id: 'mua-hang.unit.thung-apply', title: 'ĐVT Thùng đặt hàng (MH27): chạy thật cho các mã chọn — thêm / sửa ĐVT Thùng, đặt làm ĐVT mua mặc định; dòng giá NCC giữ nguyên (lập đơn tự quy đổi)', tags,
    permission: 'settings:write', effect: 'write', sideEffects: ['documents'], idempotency: 'natural',
    input: thungBody.extend({ skus: z.array(z.string().trim().min(1).max(64)).min(1).max(20000) }), output: anyOut,
    expose: { http: { method: 'POST', path: '/api/v1/purchase/units/thung/apply' }, mcp: false, ai: 'deny' },
    evidence: { objectType: 'unit' },
    handler: async (ctx, input) => {
      const trx = ctx.data.tx;
      const a = ctx.legacyAuth;
      const res = await sameTx(trx, (trx) => thungApply(trx, a.tenantId, a.actor, input));
      const manual = Object.keys(input.specs).filter((k) => input.skus.includes(k));
      await logEvents(a.tenantId, [{ event: 'units_thung', docNo: '', user: a.actorName, data: { ...res, days: input.days, manual: manual.slice(0, 200), skus: input.skus.slice(0, 500) } }]);
      return res;
    },
  }),
];
