// @bizcity-layer D modules/tai-san
/**
 * Tài sản cố định, công cụ dụng cụ, chi phí trả trước.
 *   GET    /api/v1/asset-categories            loại tài sản
 *   POST   /api/v1/asset-categories            thêm loại tài sản
 *   PATCH  /api/v1/asset-categories/:code      sửa loại tài sản
 *   GET    /api/v1/assets?kind=&search=        thẻ tài sản (kèm luỹ kế, giá trị còn lại)
 *   POST   /api/v1/assets                      thêm thẻ
 *   PUT    /api/v1/assets/:code                sửa thẻ (cả ghi giảm, tạm ngừng)
 *   DELETE /api/v1/assets/:code                xoá thẻ chưa trích tháng nào
 *   POST   /api/v1/assets/depreciation         tính khấu hao, phân bổ một tháng và ghi sổ (quyền periods:lock)
 *   GET    /api/v1/assets/register             sổ tài sản / bảng tính khấu hao, phân bổ
 *   POST   /api/v1/assets/import               nhập hàng loạt thẻ (chuyển sổ, Excel) — có dòng sai thì không ghi dòng nào
 *   GET    /api/v1/asset-events                đánh giá lại, điều chuyển, kiểm kê
 *   POST   /api/v1/assets/:code/events         thêm sự kiện cho một tài sản
 *   DELETE /api/v1/asset-events/:id            xoá sự kiện (điều chuyển: chỉ lần gần nhất, trả tài sản về chi nhánh cũ)
 *   PUT    /api/v1/assets/:code/override       sửa tay số trích của một tháng (amount null = bỏ sửa tay)
 */
import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { authOf, requirePermission } from '../../core/auth.js';
import { ok } from '../../core/http.js';
import { db } from '../../db/client.js';
import { Errors } from '../../core/errors.js';
import { writeAudit } from '../../core/audit.js';
import { assetService } from './asset.service.js';
import { defineAction, mountActions, type AnyActionDef } from '@bizcity/platform/core/actions';

const tags = ['Tài sản cố định, công cụ dụng cụ'];
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Ngày dạng YYYY-MM-DD');
const kind = z.enum(['fixed_asset', 'tool', 'prepaid']);
const money = z.coerce.number().nonnegative();
const optText = z.string().trim().nullish();

const categorySchema = z.object({
  code: z.string().trim().min(1).max(32),
  name: z.string().trim().min(1),
  kind,
  assetAccount: optText,
  depreciationAccount: z.string().trim().min(1),
  expenseAccount: z.string().trim().min(1),
  usefulLifeMonths: z.coerce.number().int().positive().nullish(),
  parentCode: optText,
  isActive: z.boolean().optional(),
});

const allocationSchema = z.object({
  percent: z.coerce.number().positive().max(100),
  branchCode: optText,
  expenseAccount: z.string().trim().min(1),
  costItemCode: optText,
  departmentCode: optText,
  contractCode: optText,
});

const assetSchema = z.object({
  code: z.string().trim().min(1).max(40),
  name: z.string().trim().min(1),
  kind,
  categoryCode: optText,
  branchCode: z.string().trim().min(1),
  unit: z.string().trim().optional(),
  quantity: z.coerce.number().positive().optional(),
  acquiredDate: date.nullish(),
  startDate: date,
  originalCost: z.coerce.number().positive('Nguyên giá phải lớn hơn 0'),
  usefulLifeMonths: z.coerce.number().int().positive('Số tháng phải lớn hơn 0'),
  monthlyAmount: money.nullish(),
  depreciableAmount: z.coerce.number().positive().nullish(),
  taxMonthlyAmount: money.nullish(),
  openingRemainingMonths: z.coerce.number().int().nonnegative().nullish(),
  contractCode: optText,
  toolGroupCode: optText,
  /** Thông số kỹ thuật; không gửi = giữ nguyên. */
  specs: z.array(z.object({ name: z.string().trim().min(1).max(100), value: z.string().trim().max(500) })).max(40).optional(),
  usagePurposeCode: optText,
  allocations: z.array(allocationSchema).optional(),
  openingAccumulated: money.optional(),
  openingAsOf: date.nullish(),
  assetAccount: optText,
  depreciationAccount: z.string().trim().min(1),
  expenseAccount: z.string().trim().min(1),
  costItemCode: optText,
  departmentCode: optText,
  status: z.enum(['in_use', 'stopped', 'disposed']).optional(),
  disposedDate: date.nullish(),
  note: z.string().optional(),
});

const branchCodes = z
  .string()
  .optional()
  .transform((s) => (s ? s.split(',').map((x) => x.trim()).filter(Boolean) : undefined));

export async function assetRoutes(app: FastifyInstance): Promise<void> {
  const r = app.withTypeProvider<ZodTypeProvider>();

  r.get('/api/v1/asset-categories', {
    preHandler: requirePermission('catalog:read'),
    schema: { tags, summary: 'Loại tài sản' },
    handler: async (req) => ok(await assetService.listCategories(authOf(req))),
  });

  r.get('/api/v1/assets', {
    preHandler: requirePermission('catalog:read'),
    schema: { tags, summary: 'Thẻ tài sản', querystring: z.object({ kind: kind.optional(), search: z.string().optional(), code: z.string().optional() }) },
    handler: async (req) => ok(await assetService.list(authOf(req), req.query)),
  });

  r.get('/api/v1/asset-events', {
    preHandler: requirePermission('catalog:read'),
    schema: { tags, summary: 'Đánh giá lại, điều chuyển, kiểm kê', querystring: z.object({ kind: z.enum(['revaluation', 'transfer', 'audit']).optional(), assetCode: z.string().optional(), from: date.optional(), to: date.optional() }) },
    handler: async (req) => ok(await assetService.listEvents(authOf(req), req.query)),
  });
  r.get('/api/v1/assets/:code/photo', {
    preHandler: requirePermission('catalog:read'),
    schema: { tags, summary: 'Ảnh của thẻ tài sản', params: z.object({ code: z.string() }) },
    handler: async (req) => {
      const a = await db.selectFrom('assets').select('photo').where('tenant_id', '=', authOf(req).tenantId).where('code', '=', req.params.code).executeTakeFirst();
      if (!a) throw Errors.notFound(`tài sản ${req.params.code}`);
      return ok({ photo: a.photo });
    },
  });
  r.get('/api/v1/assets/register', {
    preHandler: requirePermission('reports:read'),
    schema: { tags, summary: 'Sổ tài sản, bảng tính khấu hao / phân bổ', querystring: z.object({ from: date, to: date, kind: kind.optional(), branchCodes }) },
    handler: async (req) => ok(await assetService.register(authOf(req), req.query)),
  });
  mountActions(app, assetWriteActions);
}

// [2026-11-03 04:00 AM Johnny Chu - Chu Hoàng Anh] PHASE-014 — W6 đợt 3 (SC-ACT-1): route ghi qua defineAction — quyền, kiểm input, idempotency, giao dịch, bằng chứng do runtime; đường dẫn / thân yêu cầu / mã 201 như cũ.
// Mã cũ trong handler chạy trong giao dịch của action (sameTx); service tự mở giao dịch có bản *In.
const anyOut = z.custom<object>((v) => typeof v === 'object' && v !== null);

export const assetWriteActions: AnyActionDef[] = [
  defineAction({
    id: 'core.asset-category.create', title: 'Thêm loại tài sản', tags,
    permission: 'catalog:write', effect: 'write', sideEffects: ['masterdata'], idempotency: 'natural',
    input: categorySchema, output: anyOut,
    expose: { http: { method: 'POST', path: '/api/v1/asset-categories', status: 201 }, mcp: false, ai: 'deny' },
    evidence: { objectType: 'asset_category' },
    handler: (ctx, input) => assetService.saveCategoryIn(ctx.data.tx, ctx.legacyAuth, input),
  }),
  defineAction({
    id: 'core.asset-category.update', title: 'Sửa loại tài sản', tags,
    permission: 'catalog:write', effect: 'write', sideEffects: ['masterdata'], idempotency: 'natural',
    input: (categorySchema).merge(z.object({ code: z.string() })), output: anyOut,
    expose: { http: { method: 'PATCH', path: '/api/v1/asset-categories/:code' }, mcp: false, ai: 'deny' },
    evidence: { objectType: 'asset_category', objectId: (i) => String(i.code) },
    handler: (ctx, input) => {
      const { code, ...reqBody } = input;
      return assetService.saveCategoryIn(ctx.data.tx, ctx.legacyAuth, { ...reqBody, code }, code);
    },
  }),
  defineAction({
    id: 'core.asset-category.delete', title: 'Xoá loại tài sản chưa dùng', tags,
    permission: 'catalog:write', effect: 'write', sideEffects: ['masterdata'], idempotency: 'natural',
    input: z.object({ code: z.string() }), output: anyOut,
    expose: { http: { method: 'DELETE', path: '/api/v1/asset-categories/:code' }, mcp: false, ai: 'deny' },
    evidence: { objectType: 'asset_category', objectId: (i) => String(i.code) },
    handler: (ctx, input) => assetService.removeCategoryIn(ctx.data.tx, ctx.legacyAuth, input.code),
  }),
  defineAction({
    id: 'core.asset.create', title: 'Thêm thẻ tài sản', tags,
    permission: 'catalog:write', effect: 'write', sideEffects: ['masterdata'], idempotency: 'natural',
    input: assetSchema, output: anyOut,
    expose: { http: { method: 'POST', path: '/api/v1/assets', status: 201 }, mcp: false, ai: 'deny' },
    evidence: { objectType: 'asset' },
    handler: (ctx, input) => assetService.createIn(ctx.data.tx, ctx.legacyAuth, input),
  }),
  defineAction({
    id: 'core.asset.upsert', title: 'Sửa thẻ tài sản (cả ghi giảm, tạm ngừng)', tags,
    permission: 'catalog:write', effect: 'write', sideEffects: ['masterdata'], idempotency: 'natural',
    input: (assetSchema).merge(z.object({ code: z.string() })), output: anyOut,
    expose: { http: { method: 'PUT', path: '/api/v1/assets/:code' }, mcp: false, ai: 'deny' },
    evidence: { objectType: 'asset', objectId: (i) => String(i.code) },
    handler: (ctx, input) => {
      const { code, ...reqBody } = input;
      return assetService.updateIn(ctx.data.tx, ctx.legacyAuth, code, { ...reqBody, code });
    },
  }),
  defineAction({
    id: 'core.asset.delete', title: 'Xoá thẻ tài sản chưa trích tháng nào', tags,
    permission: 'catalog:write', effect: 'write', sideEffects: ['masterdata'], idempotency: 'natural',
    input: z.object({ code: z.string() }), output: anyOut,
    expose: { http: { method: 'DELETE', path: '/api/v1/assets/:code' }, mcp: false, ai: 'deny' },
    evidence: { objectType: 'asset', objectId: (i) => String(i.code) },
    handler: (ctx, input) => assetService.removeIn(ctx.data.tx, ctx.legacyAuth, input.code),
  }),
  defineAction({
    id: 'core.asset.import', title: 'Nhập hàng loạt thẻ tài sản', tags,
    permission: 'catalog:write', effect: 'write', sideEffects: ['masterdata'], idempotency: 'natural',
    input: z.object({ assets: z.array(assetSchema).min(1).max(5000), createBranches: z.boolean().optional(), dryRun: z.boolean().optional() }), output: anyOut,
    expose: { http: { method: 'POST', path: '/api/v1/assets/import' }, mcp: false, ai: 'deny' },
    evidence: { objectType: 'asset' },
    handler: (ctx, input) => assetService.importManyIn(ctx.data.tx, ctx.legacyAuth, input),
  }),
  defineAction({
    id: 'core.asset.events', title: 'Thêm sự kiện tài sản (đánh giá lại, điều chuyển, kiểm kê)', tags,
    permission: 'catalog:write', effect: 'write', sideEffects: ['masterdata'], idempotency: 'natural',
    input: (z.object({
        kind: z.enum(['revaluation', 'transfer', 'audit']), date, docNo: z.string().optional(), note: z.string().optional(),
        costDelta: z.coerce.number().optional(), depreciableDelta: z.coerce.number().nullish(), accumulatedDelta: z.coerce.number().optional(),
        remainingMonths: z.coerce.number().int().positive().nullish(), monthlyAmount: money.nullish(),
        toBranchCode: z.string().optional(), result: z.enum(['ok', 'damaged', 'unused', 'missing']).optional(), actualQuantity: z.coerce.number().nullish(),
      })).merge(z.object({ code: z.string() })), output: anyOut,
    expose: { http: { method: 'POST', path: '/api/v1/assets/:code/events', status: 201 }, mcp: false, ai: 'deny' },
    evidence: { objectType: 'asset', objectId: (i) => String(i.code) },
    handler: (ctx, input) => {
      const { code, ...reqBody } = input;
      return assetService.addEventIn(ctx.data.tx, ctx.legacyAuth, code, reqBody);
    },
  }),
  defineAction({
    id: 'core.asset-event.delete', title: 'Xoá sự kiện tài sản', tags,
    permission: 'catalog:write', effect: 'write', sideEffects: ['masterdata'], idempotency: 'natural',
    input: z.object({ id: z.string() }), output: anyOut,
    expose: { http: { method: 'DELETE', path: '/api/v1/asset-events/:id' }, mcp: false, ai: 'deny' },
    evidence: { objectType: 'asset_event', objectId: (i) => String(i.id) },
    handler: (ctx, input) => assetService.removeEventIn(ctx.data.tx, ctx.legacyAuth, input.id),
  }),
  defineAction({
    id: 'core.asset.photo', title: 'Ghi / bỏ ảnh của thẻ tài sản', tags,
    permission: 'catalog:write', effect: 'write', sideEffects: ['masterdata'], idempotency: 'natural',
    input: (z.object({ photo: z.string().max(700_000).nullable() })).merge(z.object({ code: z.string() })), output: anyOut,
    expose: { http: { method: 'PUT', path: '/api/v1/assets/:code/photo' }, mcp: false, ai: 'deny' },
    evidence: { objectType: 'asset', objectId: (i) => String(i.code) },
    handler: async (ctx, input) => {
      const { code: _code, ...reqBody } = input;
      const trx = ctx.data.tx;
      const auth = ctx.legacyAuth;
      const photo = reqBody.photo;
      if (photo && !/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(photo)) throw Errors.validation('Ảnh phải là PNG, JPEG hoặc WebP');
      const res = await trx.updateTable('assets').set({ photo, updated_at: new Date() }).where('tenant_id', '=', auth.tenantId).where('code', '=', input.code).executeTakeFirst();
      if (!Number(res.numUpdatedRows)) throw Errors.notFound(`tài sản ${input.code}`);
      await writeAudit(trx, { tenantId: auth.tenantId, actor: auth.actor, action: 'asset.photo', objectType: 'asset', objectId: input.code, after: { photo: photo ? `(ảnh ${photo.length} ký tự)` : null } });
      return { saved: true };
    },
  }),
  defineAction({
    id: 'core.asset.override', title: 'Sửa tay số trích một tháng', tags,
    permission: 'periods:lock', effect: 'write', sideEffects: ['masterdata'], idempotency: 'natural',
    input: (z.object({ period: z.string().regex(/^\d{4}-\d{2}$/), amount: z.coerce.number().nonnegative().nullable(), reason: z.string().optional() })).merge(z.object({ code: z.string() })), output: anyOut,
    expose: { http: { method: 'PUT', path: '/api/v1/assets/:code/override' }, mcp: false, ai: 'deny' },
    evidence: { objectType: 'asset', objectId: (i) => String(i.code) },
    handler: (ctx, input) => {
      const { code, ...reqBody } = input;
      return assetService.setOverrideIn(ctx.data.tx, ctx.legacyAuth, code, reqBody);
    },
  }),
  defineAction({
    id: 'core.asset.depreciation', title: 'Tính khấu hao, phân bổ một tháng và ghi sổ (tính lại thì bút toán cũ ghi số âm)', tags,
    // [2026-11-10 09:45 PM Johnny Chu - Chu Hoàng Anh] PHASE-014 — S014-16 (SC-ACT-2, STD-ACT-9): khấu hao ghi sổ (assetService.runIn) → khai 'ledger'
    permission: 'periods:lock', effect: 'write', sideEffects: ['masterdata', 'documents', 'ledger'], idempotency: 'natural',
    input: z.object({ period: z.string().regex(/^\d{4}-\d{2}$/, 'Kỳ dạng YYYY-MM'), catchUp: z.boolean().optional() }), output: anyOut,
    expose: { http: { method: 'POST', path: '/api/v1/assets/depreciation' }, mcp: false, ai: 'deny' },
    evidence: { objectType: 'asset' },
    handler: (ctx, input) => assetService.runIn(ctx.data.tx, ctx.legacyAuth, input),
  }),
];
