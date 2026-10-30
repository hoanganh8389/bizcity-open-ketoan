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
  approveMaxRequest, autoArrange, cancelMaxRequest, createTransferRequests, formulaSchema, getFormula, getMaxRequest, hierarchy, hierarchySaveSchema, levelInputSchema,
  listLevels, listMaxRequests, listSkuSettings, listTransferRequests, maxBoard, maxRequestSchema, maxRequestSuggest, orderAnalysis, saveFormula, saveHierarchy, saveLevels,
  saveMaxRequest, saveSkuSettings, setTransferStatus, skuSettingSchema, transferCreateSchema, transferSuggest,
} from './ton-max.js';
import { maxImport, maxPreview, maxRowsSchema, priceImport, pricePreview, priceRowsSchema, reconcileApply, reconcilePreview, stockRowsSchema } from './khoi-dau.js';

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
  r.put('/api/v1/stock/hierarchy', { preHandler: catalog, schema: { tags, summary: 'Lưu phân cấp (level: branch / shop / rỗng, parentCode cho shop)', body: hierarchySaveSchema },
    handler: async (req) => ok(await tx((t) => saveHierarchy(t, authOf(req).tenantId, req.body.items))) });
  r.post('/api/v1/stock/hierarchy/auto', { preHandler: catalog, schema: { tags, summary: 'Tự xếp theo mã: xx000 = chi nhánh cha, mã cùng 2 số đầu = shop', body: z.object({ overwrite: z.boolean().default(false) }).default({}) },
    handler: async (req) => ok(await tx((t) => autoArrange(t, authOf(req).tenantId, req.body.overwrite))) });

  // ---------------- Tồn max
  r.get('/api/v1/stock/levels', { preHandler: read, schema: { tags, summary: 'Tồn max / min (lọc theo chi nhánh, mã)', querystring: z.object({ branchCodes: list, skus: list }) },
    handler: async (req) => ok(await listLevels(db, authOf(req).tenantId, { branchCodes: req.query.branchCodes, skus: req.query.skus })) });
  r.put('/api/v1/stock/levels', { preHandler: write, schema: { tags, summary: 'Ghi hàng loạt tồn max / min (kho trống = kho mặc định; remove = xoá)', body: z.object({ items: z.array(levelInputSchema).min(1).max(20000), source: z.enum(['manual', 'import', 'suggest']).default('manual') }) },
    handler: async (req) => { const a = authOf(req); return ok(await tx((t) => saveLevels(t, a.tenantId, a.actorName, req.body.items, req.body.source))); } });
  r.get('/api/v1/stock/max-board', { preHandler: read, schema: { tags, summary: 'Bảng tồn max: một chi nhánh / shop (mỗi mã một dòng) hoặc một mã ở mọi chi nhánh trong cây', querystring: z.object({ parentCode: z.string().min(1), branchCode: z.string().optional(), warehouseCode: z.string().optional(), sku: z.string().optional(), asOf: day.optional() }) },
    handler: async (req) => ok(await maxBoard(db, authOf(req).tenantId, req.query.parentCode, req.query)) });
  r.get('/api/v1/stock/sku-settings', { preHandler: read, schema: { tags, summary: 'Cài riêng từng mã (số ngày đo bán, số ngày đủ hàng, cách làm tròn khi chuyển)', querystring: z.object({ skus: list }) },
    handler: async (req) => ok(await listSkuSettings(db, authOf(req).tenantId, req.query.skus)) });
  r.put('/api/v1/stock/sku-settings', { preHandler: write, schema: { tags, summary: 'Ghi cài riêng từng mã', body: z.object({ items: z.array(skuSettingSchema).min(1).max(20000) }) },
    handler: async (req) => { const a = authOf(req); return ok(await tx((t) => saveSkuSettings(t, a.tenantId, a.actorName, req.body.items))); } });

  // ---------------- Công thức + phân tích đặt hàng
  r.get('/api/v1/stock/formulas/:branchCode', { preHandler: read, schema: { tags, summary: 'Công thức đặt hàng của chi nhánh cha (chưa lưu = công thức chuẩn)', params: z.object({ branchCode: z.string().min(1) }) },
    handler: async (req) => ok(await getFormula(db, authOf(req).tenantId, req.params.branchCode)) });
  r.put('/api/v1/stock/formulas/:branchCode', { preHandler: requirePermission('settings:write'), schema: { tags, summary: 'Lưu công thức đặt hàng', params: z.object({ branchCode: z.string().min(1) }), body: formulaSchema },
    handler: async (req) => { const a = authOf(req); return ok(await tx((t) => saveFormula(t, a.tenantId, a.actorName, req.params.branchCode, req.body))); } });
  r.get('/api/v1/stock/order-analysis', { preHandler: read, schema: { tags, summary: 'Phân tích đặt hàng theo công thức của chi nhánh cha (SL cần nhập từng mã)', querystring: z.object({ branchCode: z.string().min(1), sku: z.string().optional(), asOf: day.optional() }) },
    handler: async (req) => ok(await orderAnalysis(db, authOf(req).tenantId, req.query.branchCode, req.query)) });

  // ---------------- Chuyển hàng xuống shop
  r.get('/api/v1/stock/transfer-suggest', { preHandler: read, schema: { tags, summary: 'Đề xuất chuyển hàng từ kho chi nhánh cha xuống shop (max − tồn − đi đường, làm tròn thùng)', querystring: z.object({ branchCode: z.string().min(1), fromWarehouse: z.string().optional(), shopCodes: list, asOf: day.optional() }) },
    handler: async (req) => ok(await transferSuggest(db, authOf(req).tenantId, req.query.branchCode, req.query)) });
  r.get('/api/v1/stock/transfer-requests', { preHandler: read, schema: { tags, summary: 'Đề nghị chuyển hàng đã chốt (kho / POS quét để lên phiếu chuyển)', querystring: z.object({ from: day.optional(), to: day.optional(), status: z.string().optional(), branchCode: z.string().optional() }) },
    handler: async (req) => ok(await listTransferRequests(db, authOf(req).tenantId, req.query)) });
  r.post('/api/v1/stock/transfer-requests', { preHandler: write, schema: { tags, summary: 'Chốt đề nghị chuyển hàng (mỗi shop một đề nghị)', body: transferCreateSchema },
    handler: async (req, reply) => { const a = authOf(req); return reply.code(201).send(ok(await tx((t) => createTransferRequests(t, a.tenantId, a.actorName, req.body)))); } });
  for (const [path, status] of [['done', 'done'], ['cancel', 'cancelled'], ['reopen', 'open']] as const) {
    r.post(`/api/v1/stock/transfer-requests/:id/${path}`, { preHandler: write, schema: { tags, summary: path === 'done' ? 'Đánh dấu đã lên phiếu chuyển' : path === 'cancel' ? 'Huỷ đề nghị' : 'Mở lại đề nghị', params: idParamSchema },
      handler: async (req) => { const a = authOf(req); return ok(await tx((t) => setTransferStatus(t, a.tenantId, a.actorName, req.params.id, status))); } });
  }

  // ---------------- Phiếu đăng ký tồn max
  r.get('/api/v1/stock/max-requests', { preHandler: read, schema: { tags, summary: 'Phiếu đăng ký tồn max (lọc ngày lập, trạng thái, chi nhánh, loại)', querystring: z.object({ from: day.optional(), to: day.optional(), status: z.string().optional(), branchCode: z.string().optional(), kind: z.string().optional() }) },
    handler: async (req) => ok(await listMaxRequests(db, authOf(req).tenantId, req.query)) });
  r.get('/api/v1/stock/max-requests/suggest', { preHandler: read, schema: { tags, summary: 'Dòng gợi ý cho phiếu đăng ký của một shop (bán / ngày, max gợi ý, max hiện tại)', querystring: z.object({ branchCode: z.string().min(1) }) },
    handler: async (req) => ok(await maxRequestSuggest(db, authOf(req).tenantId, req.query.branchCode)) });
  r.get('/api/v1/stock/max-requests/:id', { preHandler: read, schema: { tags, summary: 'Một phiếu đăng ký tồn max', params: idParamSchema }, handler: async (req) => ok(await getMaxRequest(db, authOf(req).tenantId, req.params.id)) });
  r.post('/api/v1/stock/max-requests', { preHandler: write, schema: { tags, summary: 'Lập phiếu đăng ký tồn max (submit = gửi duyệt; POS gửi source pos)', body: maxRequestSchema },
    handler: async (req, reply) => { const a = authOf(req); return reply.code(201).send(ok(await tx((t) => saveMaxRequest(t, a.tenantId, a.actorName, req.body)))); } });
  r.put('/api/v1/stock/max-requests/:id', { preHandler: write, schema: { tags, summary: 'Sửa phiếu (phiếu hàng mới đã duyệt: gắn mã thì ghi max ngay)', params: idParamSchema, body: maxRequestSchema },
    handler: async (req) => { const a = authOf(req); return ok(await tx((t) => saveMaxRequest(t, a.tenantId, a.actorName, req.body, req.params.id))); } });
  r.post('/api/v1/stock/max-requests/:id/approve', { preHandler: write, schema: { tags, summary: 'Duyệt = ghi tồn max', params: idParamSchema },
    handler: async (req) => { const a = authOf(req); return ok(await tx((t) => approveMaxRequest(t, a.tenantId, a.actorName, req.params.id))); } });
  r.post('/api/v1/stock/max-requests/:id/cancel', { preHandler: write, schema: { tags, summary: 'Huỷ phiếu', params: idParamSchema },
    handler: async (req) => ok(await tx((t) => cancelMaxRequest(t, authOf(req).tenantId, req.params.id))) });

  // ---------------- Nhập dữ liệu khởi đầu (MH20)
  const init = requirePermission('catalog:write');
  r.post('/api/v1/stock/init/prices/preview', { preHandler: init, schema: { tags, summary: 'Xem trước giá mua NCC từ tệp dòng phiếu nhập (giá = TT trước VAT ÷ SL, dòng mới nhất)', body: priceRowsSchema },
    handler: async (req) => ok(await pricePreview(db, authOf(req).tenantId, req.body.rows)) });
  r.post('/api/v1/stock/init/prices/import', { preHandler: init, schema: { tags, summary: 'Ghi giá mua NCC (đè giá cũ cùng NCC × mã × ĐVT; NCC chưa có thì tạo)', body: priceRowsSchema },
    handler: async (req) => { const a = authOf(req); return ok(await tx((t) => priceImport(t, a.tenantId, a.actorName, req.body.rows))); } });
  r.post('/api/v1/stock/init/reconcile/preview', { preHandler: init, schema: { tags, summary: 'Xem trước cân tồn: tồn theo tệp so với tồn trên sổ từng kho', body: stockRowsSchema },
    handler: async (req) => ok(await reconcilePreview(db, authOf(req).tenantId, req.body)) });
  r.post('/api/v1/stock/init/reconcile/import', { preHandler: init, schema: { tags, summary: 'Cân tồn: mỗi kho một phiếu điều chỉnh kho (+/−), ghi sổ ngay', body: stockRowsSchema },
    handler: async (req) => { const a = authOf(req); return ok(await tx((t) => reconcileApply(t, a, req.body))); } });
  r.post('/api/v1/stock/init/max/preview', { preHandler: init, schema: { tags, summary: 'Xem trước tồn max từ tệp (Kho, Mã hàng, Tồn max)', body: maxRowsSchema },
    handler: async (req) => ok(await maxPreview(db, authOf(req).tenantId, req.body.rows)) });
  r.post('/api/v1/stock/init/max/import', { preHandler: init, schema: { tags, summary: 'Ghi tồn max (min = 0), đè mức cũ', body: maxRowsSchema },
    handler: async (req) => { const a = authOf(req); return ok(await tx((t) => maxImport(t, a.tenantId, a.actorName, req.body.rows))); } });
}
