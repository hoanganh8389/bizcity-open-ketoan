// @bizcity-layer M data/masterdata
// [2026-11-07 03:34 PM Johnny Chu - Chu Hoàng Anh] PHASE-027 — CK-3: mật khẩu công cụ qua checkToolPassword (không mặc định trong mã, SC-SEC-5)
/**
 * Danh mục hàng chuẩn — khai ở phần mềm kế toán, hệ thống bán hàng kéo về (xem catalog.service.ts).
 *
 *   GET    /api/v1/catalog/products/:sku              trọn một mặt hàng (thông tin, cờ, đơn vị tính, giá mọi bảng giá)
 *   PUT    /api/v1/catalog/products/:sku              lưu trọn (?new=1: thêm mới, báo trùng mã)
 *   DELETE /api/v1/catalog/products/:sku              xoá mặt hàng chưa có nhập xuất
 *   GET    /api/v1/catalog/next-sku?groupCode=        mã hàng kế tiếp theo nhóm hàng (quy tắc 3 cấp nhóm + số thứ tự)
 *   GET    /api/v1/catalog/name-check?name=&except=   tên mặt hàng đã có mã nào dùng chưa (tên không được trùng)
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
 */
import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { db } from '../../db/client.js';
import { authOf, requirePermission } from '../../core/auth.js';
import { ok, queryBool } from '../../core/http.js';
import { mountActions, defineAction, type AnyActionDef, sameTx } from '../../core/actions.js';
import { masterdataActions } from './masterdata.actions.js';
import { checkToolPassword } from '@bizcity/platform/core/security/tool-password';
import {
  deletePriceList, deleteProduct, feedMeta, feedPrices, feedProducts, getProduct, importCatalog, listPriceLists, listPriceRows, sameNameProduct, saveProduct, savePriceList, savePriceRows, setPriceListBranches,
} from './catalog.service.js';
import { inferSkuCodes, nextSku, SKU_RULE } from './sku-rule.js';
import { importProducts } from './catalog-import.js';
import { itemHints } from '../products/item.hints.js';
import { recordWarnAck } from '@bizcity/platform/core/catalog-warn';

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
  warnAck: z.object({ reason: z.string().trim().min(5, 'Lý do ít nhất 5 ký tự').max(500), codes: z.array(z.string().max(32)).max(50).default([]) }).optional(), // [2026-11-03 12:20 AM Johnny Chu - Chu Hoàng Anh] PHASE-024 — S024-28: ghi nhận cảnh báo mềm (D023-6)
  isMain: z.boolean().optional(), isUnder24m: z.boolean().optional(), noSale: z.boolean().optional(), exportAdjust: z.boolean().optional(),
  isKct: z.boolean().optional(), trackIdentifier: z.boolean().optional(),
  parentSku: z.string().trim().max(64).nullable().optional(),
  sendToTax: z.boolean().optional(), // nhận để không vỡ client cũ, bỏ qua: suy theo mã (0111)
  variantCode: z.string().trim().min(1).max(32).optional(), // nhận để không vỡ client cũ, bỏ qua: suy theo mã (0111)
  units: z.array(unitSchema).max(50).optional(),
  prices: z.array(priceSchema).max(2000).optional(),
});

// [2026-11-03 08:00 AM Johnny Chu - Chu Hoàng Anh] PHASE-014 — W6 đợt 5 (SC-ACT-1): trợ giúp dời ra cấp tệp để action dùng chung
const cell = z.string().max(20000).optional();

export async function catalogRoutes(app: FastifyInstance): Promise<void> {
  // [2026-11-02 06:20 PM Johnny Chu - Chu Hoàng Anh] PHASE-011 — 3.17: core.partner.upsert, core.product.upsert (seed[] của manifest, ctx.actions)
  mountActions(app, masterdataActions);
  const r = app.withTypeProvider<ZodTypeProvider>();

  r.get('/api/v1/catalog/products/:sku', {
    preHandler: requirePermission('catalog:read'),
    schema: { tags, summary: 'Trọn một mặt hàng: thông tin, cờ, đơn vị tính, giá ở mọi bảng giá', params: z.object({ sku }) },
    handler: async (req) => ok(await getProduct(db, authOf(req).tenantId, req.params.sku)),
  });

  r.get('/api/v1/catalog/next-sku', {
    preHandler: requirePermission('catalog:read'),
    schema: { tags, summary: 'Mã hàng kế tiếp theo nhóm hàng', querystring: z.object({ groupCode: code.min(1) }) },
    handler: async (req) => ok({ ...(await db.transaction().execute((trx) => nextSku(trx, authOf(req).tenantId, req.query.groupCode))), rule: SKU_RULE }),
  });

  // [2026-11-10 03:00 PM Nguyễn Văn Thủy] PHASE-026 — tên mặt hàng không trùng: form báo ngay khi gõ (đóng góp)
  r.get('/api/v1/catalog/name-check', {
    preHandler: requirePermission('catalog:read'),
    schema: { tags, summary: 'Tên mặt hàng đã có ai dùng chưa (trừ mã except)', querystring: z.object({ name: z.string().max(255), except: z.string().max(64).optional() }) },
    handler: async (req) => ok({ same: await sameNameProduct(db, authOf(req).tenantId, req.query.name, req.query.except ?? '') }),
  });

  r.get('/api/v1/catalog/price-lists', {
    preHandler: requirePermission('catalog:read'),
    schema: { tags, summary: 'Bảng giá và chi nhánh áp dụng' },
    handler: async (req) => ok(await listPriceLists(db, authOf(req).tenantId)),
  });

  r.get('/api/v1/catalog/price-lists/:code/rows', {
    preHandler: requirePermission('catalog:read'),
    schema: { tags, summary: 'Lưới giá của bảng giá: mọi mặt hàng × ĐVT (kể cả ô chưa khai), kèm giá bảng giá công ty', params: z.object({ code: code.min(1) }) },
    handler: async (req) => ok(await listPriceRows(db, authOf(req).tenantId, req.params.code)),
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
  mountActions(app, catalogWriteActions);
  mountActions(app, catalogMoreWriteActions);
  mountActions(app, catalogBatchActions);
}

// [2026-11-03 04:00 AM Johnny Chu - Chu Hoàng Anh] PHASE-014 — W6 đợt 3 (SC-ACT-1): route ghi qua defineAction — quyền, kiểm input, idempotency, giao dịch, bằng chứng do runtime; đường dẫn / thân yêu cầu / mã 201 như cũ.
// Mã cũ trong handler chạy trong giao dịch của action (sameTx); service tự mở giao dịch có bản *In.
const anyOut = z.custom<object | null>((v) => typeof v === 'object');

export const catalogWriteActions: AnyActionDef[] = [
  defineAction({
    id: 'core.catalog.product-delete', title: 'Xoá mặt hàng chưa có nhập xuất (kèm đơn vị tính, giá)', tags,
    permission: 'catalog:write', effect: 'write', sideEffects: ['masterdata'], idempotency: 'natural',
    input: z.object({ sku }), output: anyOut,
    expose: { http: { method: 'DELETE', path: '/api/v1/catalog/products/:sku' }, mcp: false, ai: 'deny' },
    evidence: { objectType: 'catalog', objectId: (i) => String(i.sku) },
    handler: async (ctx, input) => {
      const trx = ctx.data.tx;
      const auth = ctx.legacyAuth;
      await sameTx(trx, (trx) => deleteProduct(trx, auth.tenantId, auth.actor, input.sku));
      return { sku: input.sku };
    },
  }),
  defineAction({
    id: 'core.catalog.sku-codes-infer', title: 'Suy mã SKU cho nhóm hàng chưa khai, từ mã hàng đang có', tags,
    permission: 'catalog:write', effect: 'write', sideEffects: ['masterdata'], idempotency: 'natural',
    input: z.object({ apply: z.boolean().default(false) }), output: anyOut,
    expose: { http: { method: 'POST', path: '/api/v1/catalog/sku-codes/infer' }, mcp: false, ai: 'deny' },
    evidence: { objectType: 'catalog' },
    handler: async (ctx, input) => {
      const trx = ctx.data.tx;
      const auth = ctx.legacyAuth;
      const rows = await sameTx(trx, (trx) => inferSkuCodes(trx, auth.tenantId, input.apply));
      return { applied: input.apply, rows };
    },
  }),
  defineAction({
    id: 'core.catalog.price-list-upsert', title: 'Thêm / sửa bảng giá', tags,
    permission: 'catalog:write', effect: 'write', sideEffects: ['masterdata'], idempotency: 'natural',
    input: (z.object({ name: z.string().trim().min(1).max(255), isCompany: z.boolean().optional(), isActive: z.boolean().optional(), note: z.string().max(500).optional() })).merge(z.object({ code: code.min(1) })), output: anyOut,
    expose: { http: { method: 'PUT', path: '/api/v1/catalog/price-lists/:code' }, mcp: false, ai: 'deny' },
    evidence: { objectType: 'catalog', objectId: (i) => String(i.code) },
    handler: async (ctx, input) => {
      const { code: _code, ...reqBody } = input;
      const trx = ctx.data.tx;
      const auth = ctx.legacyAuth;
      await sameTx(trx, (trx) => savePriceList(trx, auth.tenantId, auth.actor, input.code, reqBody));
      return { code: input.code };
    },
  }),
  defineAction({
    id: 'core.catalog.price-list-delete', title: 'Xoá bảng giá (không phải bảng giá công ty, chưa áp chi nhánh nào)', tags,
    permission: 'catalog:write', effect: 'write', sideEffects: ['masterdata'], idempotency: 'natural',
    input: z.object({ code: code.min(1) }), output: anyOut,
    expose: { http: { method: 'DELETE', path: '/api/v1/catalog/price-lists/:code' }, mcp: false, ai: 'deny' },
    evidence: { objectType: 'catalog', objectId: (i) => String(i.code) },
    handler: async (ctx, input) => {
      const trx = ctx.data.tx;
      const auth = ctx.legacyAuth;
      await sameTx(trx, (trx) => deletePriceList(trx, auth.tenantId, auth.actor, input.code));
      return { code: input.code };
    },
  }),
  defineAction({
    id: 'core.catalog.price-lists-branches', title: 'Gán chi nhánh cho bảng giá', tags,
    permission: 'catalog:write', effect: 'write', sideEffects: ['masterdata'], idempotency: 'natural',
    input: (z.object({ branchCodes: z.array(code.min(1)).max(2000) })).merge(z.object({ code: code.min(1) })), output: anyOut,
    expose: { http: { method: 'PUT', path: '/api/v1/catalog/price-lists/:code/branches' }, mcp: false, ai: 'deny' },
    evidence: { objectType: 'catalog', objectId: (i) => String(i.code) },
    handler: async (ctx, input) => {
      const { code: _code, ...reqBody } = input;
      const trx = ctx.data.tx;
      const auth = ctx.legacyAuth;
      await sameTx(trx, (trx) => setPriceListBranches(trx, auth.tenantId, auth.actor, input.code, reqBody.branchCodes));
      return { code: input.code };
    },
  }),
];

// [2026-11-03 08:00 AM Johnny Chu - Chu Hoàng Anh] PHASE-014 — W6 đợt 5 (SC-ACT-1): route ghi qua defineAction — quyền, kiểm input, idempotency, giao dịch, bằng chứng do runtime; đường dẫn / thân yêu cầu / mã 201 như cũ.
// Mã cũ trong handler chạy trong giao dịch của action (sameTx); service tự mở giao dịch có bản *In.


export const catalogMoreWriteActions: AnyActionDef[] = [
  defineAction({
    id: 'core.catalog-product.save', title: 'Lưu trọn một mặt hàng (units = thay cả bộ đơn vị tính; prices = ghi các ô giá gửi lên, price null = xoá ô)', tags,
    permission: 'catalog:write', effect: 'write', sideEffects: ['masterdata'], idempotency: 'natural',
    input: (productSchema).merge(z.object({ new: queryBool })).merge(z.object({ sku })), output: anyOut,
    expose: { http: { method: 'PUT', path: '/api/v1/catalog/products/:sku', query: z.object({ new: queryBool }) }, mcp: false, ai: 'deny' },
    evidence: { objectType: 'catalog_product', objectId: (i) => String(i.sku) },
    handler: async (ctx, input) => {
      const { sku: _sku, new: _new, warnAck, ...reqBody } = input;
      const trx = ctx.data.tx;
      const auth = ctx.legacyAuth;
      // [2026-11-03 12:20 AM Johnny Chu - Chu Hoàng Anh] PHASE-024 — S024-28: saveProduct áp cổng danh mục (nháp / kích hoạt); trả khung Vì sao + ghi nhận cảnh báo mềm.
      // [2026-11-03 05:30 PM Johnny Chu - Chu Hoàng Anh] PHASE-014 — gộp main: gate / findings / held trả qua ctx.meta (action không còn tự dựng phản hồi)
      const product = (await saveProduct(trx, auth.tenantId, auth.actor, input.sku, reqBody, { isNew: input.new, checkName: true }))!;
      const findings = await itemHints(trx, auth.tenantId, { sku: input.sku, unit: product.unit, postingGroupCode: product.postingGroupCode });
      await recordWarnAck(trx, auth, 'product', input.sku, findings, warnAck);
      Object.assign(ctx.meta, { gate: 'A', findings, ...(product.isDraft ? { held: { kind: 'draft', id: input.sku } } : {}) });
      return product;
    },
  }),
  defineAction({
    id: 'core.price-list.prices-save', title: 'Ghi nhiều ô giá của bảng giá (price null = bỏ giá ô đó)', tags,
    permission: 'catalog:write', effect: 'write', sideEffects: ['masterdata'], idempotency: 'natural',
    input: (z.object({ rows: z.array(z.object({ sku, unit: z.string().trim().min(1).max(64), price: money.nullable() })).max(50000) })).merge(z.object({ code: code.min(1) })), output: anyOut,
    expose: { http: { method: 'PUT', path: '/api/v1/catalog/price-lists/:code/prices', bodyLimit: 20 * 1024 * 1024 }, mcp: false, ai: 'deny' },
    evidence: { objectType: 'price_list', objectId: (i) => String(i.code) },
    handler: async (ctx, input) => {
      const { code: _code, ...reqBody } = input;
      const trx = ctx.data.tx;
      const auth = ctx.legacyAuth;
      return await sameTx(trx, (trx) => savePriceRows(trx, auth.tenantId, auth.actor, input.code, reqBody.rows));
    },
  }),
  defineAction({
    id: 'core.catalog.import', title: 'Nạp dữ liệu ban đầu từ hệ thống bán hàng (mặt hàng, đơn vị tính, bảng giá, giá, gán chi nhánh, mã SKU nhóm)', tags,
    permission: 'catalog:write', effect: 'write', sideEffects: ['masterdata'], idempotency: 'natural',
    input: z.object({
        products: z.array(productSchema.extend({ sku })).max(5000).optional(),
        priceLists: z.array(z.object({ code: code.min(1), name: z.string().trim().min(1).max(255), isCompany: z.boolean().optional(), isActive: z.boolean().optional(), note: z.string().max(500).optional() })).max(500).optional(),
        branches: z.array(z.object({ branchCode: code.min(1), priceListCode: code.min(1) })).max(5000).optional(),
        prices: z.array(priceSchema.extend({ sku })).max(50000).optional(),
        groupSkuCodes: z.array(z.object({ code: code.min(1), skuCode: z.string().trim().max(20) })).max(10000).optional(),
      }), output: anyOut,
    expose: { http: { method: 'POST', path: '/api/v1/catalog/import', bodyLimit: 50 * 1024 * 1024 }, mcp: false, ai: 'deny' },
    evidence: { objectType: 'catalog' },
    handler: async (ctx, input) => {
      const trx = ctx.data.tx;
      const auth = ctx.legacyAuth;
      return await sameTx(trx, (trx) => importCatalog(trx, auth.tenantId, auth.actor, input));
    },
  }),
];

// [2026-11-03 11:00 AM Johnny Chu - Chu Hoàng Anh] PHASE-014 — W6 đợt 6 (action theo lô): route ghi qua defineAction — quyền, kiểm input, idempotency, giao dịch, bằng chứng do runtime; đường dẫn / thân yêu cầu / mã 201 như cũ.
// Mã cũ trong handler chạy trong giao dịch của action (sameTx); service tự mở giao dịch có bản *In.


export const catalogBatchActions: AnyActionDef[] = [
  defineAction({
    id: 'core.catalog.products-import', title: 'Nhập Excel mặt hàng: dryRun kiểm tra từng dòng (không ghi); không dryRun thì ghi các dòng đúng, bỏ qua dòng lỗi', tags,
    permission: 'catalog:write', effect: 'write', sideEffects: ['masterdata'], idempotency: 'natural',
    input: z.object({
        dryRun: z.boolean().default(true),
        rows: z.array(z.object({
          row: z.number().int(), sku: z.string().max(200), name: cell, unit: cell, note: cell, groupCode: cell, industryCode: cell, brandCode: cell, typeCode: cell,
          postingGroupCode: cell, taxOutCode: cell, taxInCode: cell, vatRate: cell, isActive: cell,
        })).min(1).max(5000),
      }), output: anyOut,
    expose: { http: { method: 'POST', path: '/api/v1/catalog/products/import' }, mcp: false, ai: 'deny' },
    evidence: { objectType: 'catalog' },
    handler: async (ctx, input) => {
      const trx = ctx.data.tx; const auth = ctx.legacyAuth; return await importProducts(trx, auth.tenantId, auth.actor, input.rows, input.dryRun); },
  }),
];
