// @bizcity-layer D modules/mua-hang
/**
 * API tồn max / chuyển hàng shop / công thức đặt hàng (docs/nghiep-vu/09-ton-max-dat-hang.md, mục B3). Dùng chung cho POS:
 * gọi bằng khoá API (Bearer) cùng quyền như người dùng.
 *   Phân cấp     GET/PUT /api/v1/stock/hierarchy · POST /…/hierarchy/auto
 *   Tồn max      GET/PUT /api/v1/stock/levels · GET /…/max-board · GET/PUT /…/sku-settings
 *   Công thức    GET/PUT /api/v1/stock/formulas/:branchCode · GET /…/order-analysis
 *   Chuyển shop  GET /api/v1/stock/transfer-suggest · GET/POST /…/transfer-requests · POST /…/transfer-requests/:id/{done,cancel,reopen}
 *   Khởi đầu     POST /api/v1/stock/init/{prices,reconcile,max}/{preview,import} — nhập giá mua NCC, cân tồn (phiếu điều chỉnh), tồn max từ Excel
 *   Đăng ký max  GET/POST /api/v1/stock/max-requests · GET/PUT /…/:id · POST /…/:id/{approve,cancel} · GET /…/max-requests/suggest
 */
import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { db } from '../../db/client.js';
import { authOf, requirePermission } from '../../core/auth.js';
import { idParamSchema, ok } from '../../core/http.js';
import {
  approveMaxRequest, autoArrange, cancelMaxRequest, createTransferRequests, formulaSchema, getFormula, orderAnalysisMany, getMaxRequest, hierarchy, hierarchySaveSchema, levelInputSchema,
  listLevels, listMaxRequests, listSkuSettings, listTransferRequests, maxBoard, maxRequestSchema, maxRequestSuggest, orderAnalysis, saveFormula, saveHierarchy, saveLevels,
  saveMaxRequest, saveSkuSettings, setTransferStatus, skuSettingSchema, transferCreateSchema, transferSuggest,
} from './ton-max.js';
import { maxImport, maxPreview, maxRowsSchema, priceImport, pricePreview, priceRowsSchema, reconcileApply, reconcilePreview, stockRowsSchema } from './khoi-dau.js';
import { defineAction, mountActions, type AnyActionDef, sameTx } from '@bizcity/platform/core/actions';
// [2026-11-13 08:00 PM kiennt] NT-HT-003 — tồn max (MH16), đăng ký max (MH17), chuyển shop (MH19) gác theo thao tác màn; documents:read / write kéo theo (đóng góp)
import { quyenThaoTac } from '../../modules/access/man-hinh.js';
import './man-hinh-mua-hang.js'; // đăng ký màn Mua hàng trước khi lệnh đọc quyền

const tags = ['Mua hàng: Tồn max & đặt hàng'];
const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const list = z.string().optional().transform((s) => (s ? s.split(',').map((x) => x.trim()).filter(Boolean) : undefined));

export async function stockRoutes(app: FastifyInstance): Promise<void> {
  const r = app.withTypeProvider<ZodTypeProvider>();
  const read = requirePermission('documents:read');
  const write = requirePermission('documents:write');
  const catalog = requirePermission('catalog:write');
  const tx = <T>(fn: (trx: typeof db) => Promise<T>) => db.transaction().execute(fn);

  // ---------------- Phân cấp
  r.get('/api/v1/stock/hierarchy', { preHandler: read, schema: { tags, summary: 'Chi nhánh cha → shop (2 cấp) + kho của từng chi nhánh' }, handler: async (req) => ok(await hierarchy(db, authOf(req).tenantId)) });

  // ---------------- Tồn max
  r.get('/api/v1/stock/levels', { preHandler: requirePermission(quyenThaoTac('mua-hang.ton-max', 'xem')), schema: { tags, summary: 'Tồn max / min (lọc theo chi nhánh, mã)', querystring: z.object({ branchCodes: list, skus: list }) },
    handler: async (req) => ok(await listLevels(db, authOf(req).tenantId, { branchCodes: req.query.branchCodes, skus: req.query.skus })) });
  r.get('/api/v1/stock/max-board', { preHandler: requirePermission(quyenThaoTac('mua-hang.ton-max', 'xem')), schema: { tags, summary: 'Bảng tồn max: một chi nhánh / shop (mỗi mã một dòng) hoặc một mã ở mọi chi nhánh trong cây', querystring: z.object({ parentCode: z.string().min(1), branchCode: z.string().optional(), warehouseCode: z.string().optional(), sku: z.string().optional(), asOf: day.optional() }) },
    handler: async (req) => ok(await maxBoard(db, authOf(req).tenantId, req.query.parentCode, req.query)) });
  r.get('/api/v1/stock/sku-settings', { preHandler: read, schema: { tags, summary: 'Cài riêng từng mã (số ngày đo bán, số ngày đủ hàng, cách làm tròn khi chuyển)', querystring: z.object({ skus: list }) },
    handler: async (req) => ok(await listSkuSettings(db, authOf(req).tenantId, req.query.skus)) });

  // ---------------- Công thức + phân tích đặt hàng
  r.get('/api/v1/stock/formulas/:branchCode', { preHandler: read, schema: { tags, summary: 'Công thức đặt hàng của chi nhánh cha (chưa lưu = công thức chuẩn)', params: z.object({ branchCode: z.string().min(1) }) },
    handler: async (req) => ok(await getFormula(db, authOf(req).tenantId, req.params.branchCode)) });
  // [2026-11-03 03:00 PM Nguyễn Văn Thủy] SDTC — branchCode nhận nhiều mã cách dấu phẩy: gộp nhiều chi nhánh
  r.get('/api/v1/stock/order-analysis', { preHandler: read, schema: { tags, summary: 'Phân tích đặt hàng theo công thức của chi nhánh (nhiều chi nhánh: mã cách dấu phẩy, cộng theo mã)', querystring: z.object({ branchCode: z.string().min(1), sku: z.string().optional(), asOf: day.optional() }) },
    handler: async (req) => ok(await orderAnalysisMany(db, authOf(req).tenantId, req.query.branchCode.split(','), req.query)) });

  // ---------------- Chuyển hàng xuống shop
  r.get('/api/v1/stock/transfer-suggest', { preHandler: requirePermission(quyenThaoTac('mua-hang.chuyen-shop', 'xem')), schema: { tags, summary: 'Đề xuất chuyển hàng từ kho chi nhánh cha xuống shop (max − tồn − đi đường, làm tròn thùng)', querystring: z.object({ branchCode: z.string().min(1), fromWarehouse: z.string().optional(), shopCodes: list, asOf: day.optional(), rounding: z.enum(['sku', 'pack', 'none']).optional(), allocation: z.enum(['shortage', 'selected', 'equal', 'manual']).optional() }) },
    handler: async (req) => ok(await transferSuggest(db, authOf(req).tenantId, req.query.branchCode, req.query)) });
  r.get('/api/v1/stock/transfer-requests', { preHandler: requirePermission(quyenThaoTac('mua-hang.chuyen-shop', 'xem')), schema: { tags, summary: 'Đề nghị chuyển hàng đã chốt (kho / POS quét để lên phiếu chuyển)', querystring: z.object({ from: day.optional(), to: day.optional(), status: z.string().optional(), branchCode: z.string().optional() }) },
    handler: async (req) => ok(await listTransferRequests(db, authOf(req).tenantId, req.query)) });

  // ---------------- Phiếu đăng ký tồn max
  r.get('/api/v1/stock/max-requests', { preHandler: requirePermission(quyenThaoTac('mua-hang.dang-ky-max', 'xem')), schema: { tags, summary: 'Phiếu đăng ký tồn max (lọc ngày lập, trạng thái, chi nhánh, loại)', querystring: z.object({ from: day.optional(), to: day.optional(), status: z.string().optional(), branchCode: z.string().optional(), kind: z.string().optional() }) },
    handler: async (req) => ok(await listMaxRequests(db, authOf(req).tenantId, req.query)) });
  r.get('/api/v1/stock/max-requests/suggest', { preHandler: requirePermission(quyenThaoTac('mua-hang.dang-ky-max', 'xem')), schema: { tags, summary: 'Dòng gợi ý cho phiếu đăng ký của một shop (bán / ngày, max gợi ý, max hiện tại)', querystring: z.object({ branchCode: z.string().min(1) }) },
    handler: async (req) => ok(await maxRequestSuggest(db, authOf(req).tenantId, req.query.branchCode)) });
  r.get('/api/v1/stock/max-requests/:id', { preHandler: requirePermission(quyenThaoTac('mua-hang.dang-ky-max', 'xem')), schema: { tags, summary: 'Một phiếu đăng ký tồn max', params: idParamSchema }, handler: async (req) => ok(await getMaxRequest(db, authOf(req).tenantId, req.params.id)) });

  // ---------------- Nhập dữ liệu khởi đầu (MH20)
  const init = requirePermission('catalog:write');
  mountActions(app, tonMaxRoutesWriteActions);
}

// [2026-11-03 04:00 AM Johnny Chu - Chu Hoàng Anh] PHASE-014 — W6 đợt 3 (SC-ACT-1): route ghi qua defineAction — quyền, kiểm input, idempotency, giao dịch, bằng chứng do runtime; đường dẫn / thân yêu cầu / mã 201 như cũ.
// Mã cũ trong handler chạy trong giao dịch của action (sameTx); service tự mở giao dịch có bản *In.
const anyOut = z.custom<object>((v) => typeof v === 'object' && v !== null);

export const tonMaxRoutesWriteActions: AnyActionDef[] = [
  // [2026-11-03 11:20 AM Johnny Chu - Chu Hoàng Anh] PHASE-014 — W6 đợt 6: ba route đổi trạng thái đề nghị chuyển hàng (trước: vòng lặp tạo route, công cụ bỏ sót)
  ...([['done', 'done', 'Đánh dấu đã lên phiếu chuyển'], ['cancel', 'cancelled', 'Huỷ đề nghị'], ['reopen', 'open', 'Mở lại đề nghị']] as const).map(([path, status, title]) => defineAction({
    id: `mua-hang.transfer-request.${path}`, title, tags,
    // [2026-11-13 08:00 PM kiennt] NT-HT-003 — huỷ đề nghị theo thao tác huy, đã lên phiếu / mở lại theo thao tác xong của màn MH19 (đóng góp)
    get permission() { return quyenThaoTac('mua-hang.chuyen-shop', path === 'cancel' ? 'huy' : 'xong'); }, effect: 'write', sideEffects: ['documents'], idempotency: 'natural',
    input: idParamSchema, output: anyOut,
    expose: { http: { method: 'POST', path: `/api/v1/stock/transfer-requests/:id/${path}` }, mcp: false, ai: 'deny' },
    evidence: { objectType: 'transfer_request', objectId: (i) => String(i.id) },
    handler: (ctx, input) => setTransferStatus(ctx.data.tx, ctx.tenant.id, ctx.actor.name, input.id, status),
  })),
  defineAction({
    id: 'mua-hang.stock.hierarchy', title: 'Lưu phân cấp (level: branch / shop / rỗng, parentCode cho shop)', tags,
    permission: 'catalog:write', effect: 'write', sideEffects: ['documents'], idempotency: 'natural',
    input: hierarchySaveSchema, output: anyOut,
    expose: { http: { method: 'PUT', path: '/api/v1/stock/hierarchy' }, mcp: false, ai: 'deny' },
    evidence: { objectType: 'stock' },
    handler: async (ctx, input) => {
      const trx = ctx.data.tx;
      return await sameTx(trx, (t) => saveHierarchy(t, ctx.legacyAuth.tenantId, input.items));
    },
  }),
  defineAction({
    id: 'mua-hang.stock.hierarchy-auto', title: 'Tự xếp theo mã: xx000 = chi nhánh cha, mã cùng 2 số đầu = shop', tags,
    permission: 'catalog:write', effect: 'write', sideEffects: ['documents'], idempotency: 'natural',
    input: z.object({ overwrite: z.boolean().default(false) }), output: anyOut,
    expose: { http: { method: 'POST', path: '/api/v1/stock/hierarchy/auto' }, mcp: false, ai: 'deny' },
    evidence: { objectType: 'stock' },
    handler: async (ctx, input) => {
      const trx = ctx.data.tx;
      return await sameTx(trx, (t) => autoArrange(t, ctx.legacyAuth.tenantId, input.overwrite));
    },
  }),
  defineAction({
    id: 'mua-hang.stock.levels', title: 'Ghi hàng loạt tồn max / min (kho trống = kho mặc định; remove = xoá)', tags,
    get permission() { return quyenThaoTac('mua-hang.ton-max', 'sua'); }, effect: 'write', sideEffects: ['documents'], idempotency: 'natural',
    input: z.object({ items: z.array(levelInputSchema).min(1).max(20000), source: z.enum(['manual', 'import', 'suggest']).default('manual') }), output: anyOut,
    expose: { http: { method: 'PUT', path: '/api/v1/stock/levels' }, mcp: false, ai: 'deny' },
    evidence: { objectType: 'stock' },
    handler: async (ctx, input) => {
      const trx = ctx.data.tx; const a = ctx.legacyAuth; return await sameTx(trx, (t) => saveLevels(t, a.tenantId, a.actorName, input.items, input.source)); },
  }),
  defineAction({
    id: 'mua-hang.stock.sku-settings', title: 'Ghi cài riêng từng mã', tags,
    get permission() { return quyenThaoTac('mua-hang.ton-max', 'sua'); }, effect: 'write', sideEffects: ['documents'], idempotency: 'natural',
    input: z.object({ items: z.array(skuSettingSchema).min(1).max(20000) }), output: anyOut,
    expose: { http: { method: 'PUT', path: '/api/v1/stock/sku-settings' }, mcp: false, ai: 'deny' },
    evidence: { objectType: 'stock' },
    handler: async (ctx, input) => {
      const trx = ctx.data.tx; const a = ctx.legacyAuth; return await sameTx(trx, (t) => saveSkuSettings(t, a.tenantId, a.actorName, input.items)); },
  }),
  defineAction({
    id: 'mua-hang.stock-formula.save', title: 'Lưu công thức đặt hàng', tags,
    permission: 'settings:write', effect: 'write', sideEffects: ['documents'], idempotency: 'natural',
    input: (formulaSchema).merge(z.object({ branchCode: z.string().min(1) })), output: anyOut,
    expose: { http: { method: 'PUT', path: '/api/v1/stock/formulas/:branchCode' }, mcp: false, ai: 'deny' },
    evidence: { objectType: 'stock_formula', objectId: (i) => String(i.branchCode) },
    handler: async (ctx, input) => {
      const { branchCode: _branchCode, ...reqBody } = input;
      const trx = ctx.data.tx; const a = ctx.legacyAuth; return await sameTx(trx, (t) => saveFormula(t, a.tenantId, a.actorName, input.branchCode, reqBody)); },
  }),
  defineAction({
    id: 'mua-hang.transfer-request.create', title: 'Chốt đề nghị chuyển hàng (mỗi shop một đề nghị)', tags,
    get permission() { return quyenThaoTac('mua-hang.chuyen-shop', 'them'); }, effect: 'write', sideEffects: ['documents'], idempotency: 'required',
    input: transferCreateSchema, output: anyOut,
    expose: { http: { method: 'POST', path: '/api/v1/stock/transfer-requests', status: 201 }, mcp: false, ai: 'deny' },
    evidence: { objectType: 'transfer_request' },
    handler: async (ctx, input) => {
      const trx = ctx.data.tx; const a = ctx.legacyAuth; return await sameTx(trx, (t) => createTransferRequests(t, a.tenantId, a.actorName, input)); },
  }),
  defineAction({
    id: 'mua-hang.max-request.create', title: 'Lập phiếu đăng ký tồn max (submit = gửi duyệt; POS gửi source pos)', tags,
    get permission() { return quyenThaoTac('mua-hang.dang-ky-max', 'them'); }, effect: 'write', sideEffects: ['documents'], idempotency: 'required',
    input: maxRequestSchema, output: anyOut,
    expose: { http: { method: 'POST', path: '/api/v1/stock/max-requests', status: 201 }, mcp: false, ai: 'deny' },
    evidence: { objectType: 'max_request' },
    handler: async (ctx, input) => {
      const trx = ctx.data.tx; const a = ctx.legacyAuth; return await sameTx(trx, (t) => saveMaxRequest(t, a.tenantId, a.actorName, input)); },
  }),
  defineAction({
    id: 'mua-hang.max-request.update', title: 'Sửa phiếu (phiếu hàng mới đã duyệt: gắn mã thì ghi max ngay)', tags,
    get permission() { return quyenThaoTac('mua-hang.dang-ky-max', 'sua'); }, effect: 'write', sideEffects: ['documents'], idempotency: 'natural',
    input: (maxRequestSchema).merge(idParamSchema), output: anyOut,
    expose: { http: { method: 'PUT', path: '/api/v1/stock/max-requests/:id' }, mcp: false, ai: 'deny' },
    evidence: { objectType: 'max_request', objectId: (i) => String(i.id) },
    handler: async (ctx, input) => {
      const { id: _id, ...reqBody } = input;
      const trx = ctx.data.tx; const a = ctx.legacyAuth; return await sameTx(trx, (t) => saveMaxRequest(t, a.tenantId, a.actorName, reqBody, input.id)); },
  }),
  defineAction({
    id: 'mua-hang.max-request.approve', title: 'Duyệt = ghi tồn max', tags,
    get permission() { return quyenThaoTac('mua-hang.dang-ky-max', 'duyet'); }, effect: 'write', sideEffects: ['documents'], idempotency: 'natural',
    input: idParamSchema, output: anyOut,
    expose: { http: { method: 'POST', path: '/api/v1/stock/max-requests/:id/approve' }, mcp: false, ai: 'deny' },
    evidence: { objectType: 'max_request', objectId: (i) => String(i.id) },
    handler: async (ctx, input) => {
      const trx = ctx.data.tx; const a = ctx.legacyAuth; return await sameTx(trx, (t) => approveMaxRequest(t, a.tenantId, a.actorName, input.id)); },
  }),
  defineAction({
    id: 'mua-hang.max-request.cancel', title: 'Huỷ phiếu', tags,
    get permission() { return quyenThaoTac('mua-hang.dang-ky-max', 'huy'); }, effect: 'write', sideEffects: ['documents'], idempotency: 'natural',
    input: idParamSchema, output: anyOut,
    expose: { http: { method: 'POST', path: '/api/v1/stock/max-requests/:id/cancel' }, mcp: false, ai: 'deny' },
    evidence: { objectType: 'max_request', objectId: (i) => String(i.id) },
    handler: async (ctx, input) => {
      const trx = ctx.data.tx;
      return await sameTx(trx, (t) => cancelMaxRequest(t, ctx.legacyAuth.tenantId, input.id));
    },
  }),
  defineAction({
    id: 'mua-hang.stock.init-prices-preview', title: 'Xem trước giá mua NCC từ tệp dòng phiếu nhập (giá = TT trước VAT ÷ SL, dòng mới nhất)', tags,
    permission: 'catalog:write', effect: 'read', idempotency: 'none',
    input: priceRowsSchema, output: anyOut,
    expose: { http: { method: 'POST', path: '/api/v1/stock/init/prices/preview' }, mcp: false, ai: 'read' },
    handler: async (ctx, input) => {
      const trx = ctx.data.tx;
      return await pricePreview(trx, ctx.legacyAuth.tenantId, input.rows);
    },
  }),
  defineAction({
    id: 'mua-hang.stock.init-prices-import', title: 'Ghi giá mua NCC (đè giá cũ cùng NCC × mã × ĐVT; NCC chưa có thì tạo)', tags,
    permission: 'catalog:write', effect: 'write', sideEffects: ['documents'], idempotency: 'natural',
    input: priceRowsSchema, output: anyOut,
    expose: { http: { method: 'POST', path: '/api/v1/stock/init/prices/import' }, mcp: false, ai: 'deny' },
    evidence: { objectType: 'stock' },
    handler: async (ctx, input) => {
      const trx = ctx.data.tx; const a = ctx.legacyAuth; return await sameTx(trx, (t) => priceImport(t, a.tenantId, a.actorName, input.rows)); },
  }),
  defineAction({
    id: 'mua-hang.stock.init-reconcile-preview', title: 'Xem trước cân tồn: tồn theo tệp so với tồn trên sổ từng kho', tags,
    permission: 'catalog:write', effect: 'read', idempotency: 'none',
    input: stockRowsSchema, output: anyOut,
    expose: { http: { method: 'POST', path: '/api/v1/stock/init/reconcile/preview' }, mcp: false, ai: 'read' },
    handler: async (ctx, input) => {
      const trx = ctx.data.tx;
      return await reconcilePreview(trx, ctx.legacyAuth.tenantId, input);
    },
  }),
  defineAction({
    id: 'mua-hang.stock.init-reconcile-import', title: 'Cân tồn: mỗi kho một phiếu điều chỉnh kho (+/−), ghi sổ ngay', tags,
    // [2026-11-10 09:45 PM Johnny Chu - Chu Hoàng Anh] PHASE-014 — S014-16 (SC-ACT-2, STD-ACT-9): phiếu điều chỉnh kho ghi sổ ngay (reconcileApply → postDocumentIn) → khai 'ledger'
    permission: 'catalog:write', effect: 'write', sideEffects: ['documents', 'ledger'], idempotency: 'natural',
    input: stockRowsSchema, output: anyOut,
    expose: { http: { method: 'POST', path: '/api/v1/stock/init/reconcile/import' }, mcp: false, ai: 'deny' },
    evidence: { objectType: 'stock' },
    handler: async (ctx, input) => {
      const trx = ctx.data.tx; const a = ctx.legacyAuth; return await sameTx(trx, (t) => reconcileApply(t, a, input)); },
  }),
  defineAction({
    id: 'mua-hang.stock.init-max-preview', title: 'Xem trước tồn max từ tệp (Kho, Mã hàng, Tồn max)', tags,
    permission: 'catalog:write', effect: 'read', idempotency: 'none',
    input: maxRowsSchema, output: anyOut,
    expose: { http: { method: 'POST', path: '/api/v1/stock/init/max/preview' }, mcp: false, ai: 'read' },
    handler: async (ctx, input) => {
      const trx = ctx.data.tx;
      return await maxPreview(trx, ctx.legacyAuth.tenantId, input.rows);
    },
  }),
  defineAction({
    id: 'mua-hang.stock.init-max-import', title: 'Ghi tồn max (min = 0), đè mức cũ', tags,
    permission: 'catalog:write', effect: 'write', sideEffects: ['documents'], idempotency: 'natural',
    input: maxRowsSchema, output: anyOut,
    expose: { http: { method: 'POST', path: '/api/v1/stock/init/max/import' }, mcp: false, ai: 'deny' },
    evidence: { objectType: 'stock' },
    handler: async (ctx, input) => {
      const trx = ctx.data.tx; const a = ctx.legacyAuth; return await sameTx(trx, (t) => maxImport(t, a.tenantId, a.actorName, input.rows)); },
  }),
];
