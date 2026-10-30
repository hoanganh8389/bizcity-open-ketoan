// @bizcity-layer M data/masterdata
/**
 * Danh mục hàng chuẩn — khai ở phần mềm kế toán, hệ thống bán hàng kéo về (xem catalog.service.ts).
 *
 *   GET    /api/v1/catalog/products/:sku              trọn một mặt hàng (thông tin, cờ, đơn vị tính, giá mọi bảng giá)
 *   PUT    /api/v1/catalog/products/:sku              lưu trọn (?new=1: thêm mới, báo trùng mã)
 *   DELETE /api/v1/catalog/products/:sku              xoá mặt hàng chưa có nhập xuất
 *   GET    /api/v1/catalog/next-sku?groupCode=        mã hàng kế tiếp theo nhóm hàng (quy tắc 3 cấp nhóm + số thứ tự)
 *   POST   /api/v1/catalog/sku-codes/infer            suy mã SKU cho nhóm hàng chưa khai (apply=false: xem trước)
 *   GET    /api/v1/catalog/price-lists                bảng giá + chi nhánh áp dụng
 *   PUT    /api/v1/catalog/price-lists/:code          thêm / sửa bảng giá
 *   DELETE /api/v1/catalog/price-lists/:code
 *   PUT    /api/v1/catalog/price-lists/:code/branches gán chi nhánh
 *   GET    /api/v1/catalog/price-lists/:code/rows     lưới giá: mọi mặt hàng × ĐVT, giá bảng này + giá công ty
 *   PUT    /api/v1/catalog/price-lists/:code/prices   ghi nhiều ô giá (price null = bỏ giá)
 *   GET    /api/v1/catalog/feed/meta?since=           luồng thay đổi: nhóm hàng, bảng giá, gán chi nhánh, mục đã xoá
 *   GET    /api/v1/catalog/feed/products?after=&limit= luồng thay đổi mặt hàng (kèm đơn vị tính)
 *   GET    /api/v1/catalog/feed/prices?after=&limit=   luồng thay đổi dòng giá
 *   POST   /api/v1/catalog/import                     nạp dữ liệu ban đầu từ hệ thống bán hàng
 *   POST   /api/v1/catalog/products/import            nhập Excel mặt hàng (DM10): dryRun=true kiểm tra từng dòng; ghi chỉ dòng đúng
 *   POST   /api/v1/catalog/products/scan-parents      quét họ mã theo mã (mã cha – mã con 1 cấp; overwrite=false giữ mã cha đã chỉnh tay)
 */
import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { db } from '../../db/client.js';
import { authOf, requirePermission } from '../../core/auth.js';
import { ok } from '../../core/http.js';
import { Errors } from '../../core/errors.js';
import {
  deletePriceList, deleteProduct, feedMeta, feedPrices, feedProducts, getProduct, importCatalog, listPriceLists, listPriceRows, saveProduct, savePriceList, savePriceRows, scanParents, setPriceListBranches,
} from './catalog.service.js';
import { inferSkuCodes, nextSku, SKU_RULE } from './sku-rule.js';
import { importProducts } from './catalog-import.js';

const tags = ['Danh mục: Hàng hoá chuẩn'];
const code = z.string().trim().max(64);
const sku = z.string().trim().min(1).max(64);
const money = z.coerce.number().min(0).max(1e13);

const unitSchema = z.object({
  unit: z.string().trim().min(1).max(64),
  ratio: z.coerce.number().positive().max(1e9),
  isDefault: z.boolean().optional(),
  isPurchaseDefault: z.boolean().optional(),
  weightKg: z.coerce.number().min(0).nullish(),
  note: z.string().max(500).optional(),
});
const priceSchema = z.object({
  priceListCode: code.min(1),
  unit: z.string().trim().min(1).max(64),
  price: money.nullable(),
  isDefaultUnit: z.boolean().optional(),
  note: z.string().max(500).optional(),
});
const productSchema = z.object({
  name: z.string().trim().max(500).optional(), unit: z.string().trim().max(64).optional(), note: z.string().max(500).optional(),
  groupCode: code.nullish(), industryCode: code.nullish(), brandCode: code.nullish(), typeCode: code.nullish(),
  postingGroupCode: code.nullish(), taxOutCode: code.nullish(), taxInCode: code.nullish(), exciseRate: z.coerce.number().min(0).max(100).nullish(),
  isActive: z.boolean().optional(),
  barcode: z.string().trim().max(500).optional(), imageUrl: z.string().trim().max(1000).optional(), description: z.string().max(20000).optional(),
  weightKg: z.coerce.number().min(0).nullish(), origin: z.string().trim().max(255).optional(),
  isMain: z.boolean().optional(), isUnder24m: z.boolean().optional(), noSale: z.boolean().optional(), exportAdjust: z.boolean().optional(),
  isKct: z.boolean().optional(), trackIdentifier: z.boolean().optional(),
  parentSku: z.string().trim().max(64).nullable().optional(),
  units: z.array(unitSchema).max(50).optional(),
  prices: z.array(priceSchema).max(2000).optional(),
});

export async function catalogRoutes(app: FastifyInstance): Promise<void> {
  const r = app.withTypeProvider<ZodTypeProvider>();

  r.get('/api/v1/catalog/products/:sku', {
    preHandler: requirePermission('catalog:read'),
    schema: { tags, summary: 'Trọn một mặt hàng: thông tin, cờ, đơn vị tính, giá ở mọi bảng giá', params: z.object({ sku }) },
    handler: async (req) => ok(await getProduct(db, authOf(req).tenantId, req.params.sku)),
  });

  r.put('/api/v1/catalog/products/:sku', {
    preHandler: requirePermission('catalog:write'),
    schema: {
      tags, summary: 'Lưu trọn một mặt hàng (units = thay cả bộ đơn vị tính; prices = ghi các ô giá gửi lên, price null = xoá ô)',
      params: z.object({ sku }), querystring: z.object({ new: z.coerce.boolean().optional() }), body: productSchema,
    },
    handler: async (req) => {
      const auth = authOf(req);
      return ok(await db.transaction().execute((trx) => saveProduct(trx, auth.tenantId, auth.actor, req.params.sku, req.body, { isNew: req.query.new })));
    },
  });

  const cell = z.string().max(20000).optional();
  r.post('/api/v1/catalog/products/import', {
    preHandler: requirePermission('catalog:write'),
    schema: {
      tags, summary: 'Nhập Excel mặt hàng: dryRun kiểm tra từng dòng (không ghi); không dryRun thì ghi các dòng đúng, bỏ qua dòng lỗi',
      body: z.object({
        dryRun: z.boolean().default(true),
        rows: z.array(z.object({
          row: z.number().int(), sku: z.string().max(200), name: cell, unit: cell, note: cell, groupCode: cell, industryCode: cell, brandCode: cell, typeCode: cell,
          postingGroupCode: cell, taxOutCode: cell, taxInCode: cell, isActive: cell,
        })).min(1).max(5000),
      }),
    },
    handler: async (req) => { const auth = authOf(req); return ok(await importProducts(auth.tenantId, auth.actor, req.body.rows, req.body.dryRun)); },
  });

  r.post('/api/v1/catalog/products/scan-parents', {
    preHandler: requirePermission('catalog:write'),
    schema: { tags, summary: 'Quét họ mã theo mã: mã 9 số + đuôi (trừ T có tem) là mã con của mã gốc có trong danh mục (cần mật khẩu công cụ)', body: z.object({ overwrite: z.boolean().default(false), password: z.string().max(200).default('') }) },
    handler: async (req) => {
      const auth = authOf(req);
      // Công cụ chạy cho cả danh mục → hỏi mật khẩu công cụ (cùng mật khẩu nạp dữ liệu mẫu, đổi bằng PURCHASE_SEED_PASSWORD).
      if (req.body.password !== (process.env.PURCHASE_SEED_PASSWORD || 'Thuy!@#')) throw Errors.forbidden('Sai mật khẩu công cụ');
      return ok(await db.transaction().execute((trx) => scanParents(trx, auth.tenantId, { overwrite: req.body.overwrite })));
    },
  });

  r.delete('/api/v1/catalog/products/:sku', {
    preHandler: requirePermission('catalog:write'),
    schema: { tags, summary: 'Xoá mặt hàng chưa có nhập xuất (kèm đơn vị tính, giá)', params: z.object({ sku }) },
    handler: async (req) => {
      const auth = authOf(req);
      await db.transaction().execute((trx) => deleteProduct(trx, auth.tenantId, auth.actor, req.params.sku));
      return ok({ sku: req.params.sku });
    },
  });

  r.get('/api/v1/catalog/next-sku', {
    preHandler: requirePermission('catalog:read'),
    schema: { tags, summary: 'Mã hàng kế tiếp theo nhóm hàng', querystring: z.object({ groupCode: code.min(1) }) },
    handler: async (req) => ok({ ...(await db.transaction().execute((trx) => nextSku(trx, authOf(req).tenantId, req.query.groupCode))), rule: SKU_RULE }),
  });

  r.post('/api/v1/catalog/sku-codes/infer', {
    preHandler: requirePermission('catalog:write'),
    schema: { tags, summary: 'Suy mã SKU cho nhóm hàng chưa khai, từ mã hàng đang có', body: z.object({ apply: z.boolean().default(false) }) },
    handler: async (req) => {
      const auth = authOf(req);
      const rows = await db.transaction().execute((trx) => inferSkuCodes(trx, auth.tenantId, req.body.apply));
      return ok({ applied: req.body.apply, rows });
    },
  });

  r.get('/api/v1/catalog/price-lists', {
    preHandler: requirePermission('catalog:read'),
    schema: { tags, summary: 'Bảng giá và chi nhánh áp dụng' },
    handler: async (req) => ok(await listPriceLists(db, authOf(req).tenantId)),
  });

  r.put('/api/v1/catalog/price-lists/:code', {
    preHandler: requirePermission('catalog:write'),
    schema: {
      tags, summary: 'Thêm / sửa bảng giá', params: z.object({ code: code.min(1) }),
      body: z.object({ name: z.string().trim().min(1).max(255), isCompany: z.boolean().optional(), isActive: z.boolean().optional(), note: z.string().max(500).optional() }),
    },
    handler: async (req) => {
      const auth = authOf(req);
      await db.transaction().execute((trx) => savePriceList(trx, auth.tenantId, auth.actor, req.params.code, req.body));
      return ok({ code: req.params.code });
    },
  });

  r.delete('/api/v1/catalog/price-lists/:code', {
    preHandler: requirePermission('catalog:write'),
    schema: { tags, summary: 'Xoá bảng giá (không phải bảng giá công ty, chưa áp chi nhánh nào)', params: z.object({ code: code.min(1) }) },
    handler: async (req) => {
      const auth = authOf(req);
      await db.transaction().execute((trx) => deletePriceList(trx, auth.tenantId, auth.actor, req.params.code));
      return ok({ code: req.params.code });
    },
  });

  r.put('/api/v1/catalog/price-lists/:code/branches', {
    preHandler: requirePermission('catalog:write'),
    schema: { tags, summary: 'Gán chi nhánh cho bảng giá', params: z.object({ code: code.min(1) }), body: z.object({ branchCodes: z.array(code.min(1)).max(2000) }) },
    handler: async (req) => {
      const auth = authOf(req);
      await db.transaction().execute((trx) => setPriceListBranches(trx, auth.tenantId, auth.actor, req.params.code, req.body.branchCodes));
      return ok({ code: req.params.code });
    },
  });

  r.get('/api/v1/catalog/price-lists/:code/rows', {
    preHandler: requirePermission('catalog:read'),
    schema: { tags, summary: 'Lưới giá của bảng giá: mọi mặt hàng × ĐVT (kể cả ô chưa khai), kèm giá bảng giá công ty', params: z.object({ code: code.min(1) }) },
    handler: async (req) => ok(await listPriceRows(db, authOf(req).tenantId, req.params.code)),
  });

  r.put('/api/v1/catalog/price-lists/:code/prices', {
    preHandler: requirePermission('catalog:write'),
    bodyLimit: 20 * 1024 * 1024,
    schema: {
      tags, summary: 'Ghi nhiều ô giá của bảng giá (price null = bỏ giá ô đó)', params: z.object({ code: code.min(1) }),
      body: z.object({ rows: z.array(z.object({ sku, unit: z.string().trim().min(1).max(64), price: money.nullable() })).max(50000) }),
    },
    handler: async (req) => {
      const auth = authOf(req);
      return ok(await db.transaction().execute((trx) => savePriceRows(trx, auth.tenantId, auth.actor, req.params.code, req.body.rows)));
    },
  });

  r.get('/api/v1/catalog/feed/meta', {
    preHandler: requirePermission('catalog:read'),
    schema: { tags, summary: 'Luồng thay đổi: nhóm hàng, bảng giá, gán chi nhánh, mục đã xoá sau since', querystring: z.object({ since: z.string().max(80).optional() }) },
    handler: async (req) => ok(await feedMeta(db, authOf(req).tenantId, req.query.since)),
  });

  r.get('/api/v1/catalog/feed/products', {
    preHandler: requirePermission('catalog:read'),
    schema: { tags, summary: 'Luồng thay đổi mặt hàng (kèm đơn vị tính) sau con trỏ', querystring: z.object({ after: z.string().max(80).optional(), limit: z.coerce.number().int().min(1).max(5000).default(1000) }) },
    handler: async (req) => ok(await feedProducts(db, authOf(req).tenantId, req.query.after, req.query.limit)),
  });

  r.get('/api/v1/catalog/feed/prices', {
    preHandler: requirePermission('catalog:read'),
    schema: { tags, summary: 'Luồng thay đổi dòng giá sau con trỏ', querystring: z.object({ after: z.string().max(80).optional(), limit: z.coerce.number().int().min(1).max(20000).default(5000) }) },
    handler: async (req) => ok(await feedPrices(db, authOf(req).tenantId, req.query.after, req.query.limit)),
  });

  r.post('/api/v1/catalog/import', {
    preHandler: requirePermission('catalog:write'),
    bodyLimit: 50 * 1024 * 1024,
    schema: {
      tags, summary: 'Nạp dữ liệu ban đầu từ hệ thống bán hàng (mặt hàng, đơn vị tính, bảng giá, giá, gán chi nhánh, mã SKU nhóm)',
      body: z.object({
        products: z.array(productSchema.extend({ sku })).max(5000).optional(),
        priceLists: z.array(z.object({ code: code.min(1), name: z.string().trim().min(1).max(255), isCompany: z.boolean().optional(), isActive: z.boolean().optional(), note: z.string().max(500).optional() })).max(500).optional(),
        branches: z.array(z.object({ branchCode: code.min(1), priceListCode: code.min(1) })).max(5000).optional(),
        prices: z.array(priceSchema.extend({ sku })).max(50000).optional(),
        groupSkuCodes: z.array(z.object({ code: code.min(1), skuCode: z.string().trim().max(20) })).max(10000).optional(),
      }),
    },
    handler: async (req) => {
      const auth = authOf(req);
      return ok(await db.transaction().execute((trx) => importCatalog(trx, auth.tenantId, auth.actor, req.body)));
    },
  });
}
