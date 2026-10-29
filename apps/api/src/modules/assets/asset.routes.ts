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
  r.post('/api/v1/asset-categories', {
    preHandler: requirePermission('catalog:write'),
    schema: { tags, summary: 'Thêm loại tài sản', body: categorySchema },
    handler: async (req, reply) => reply.status(201).send(ok(await assetService.saveCategory(authOf(req), req.body))),
  });
  r.patch('/api/v1/asset-categories/:code', {
    preHandler: requirePermission('catalog:write'),
    schema: { tags, summary: 'Sửa loại tài sản', params: z.object({ code: z.string() }), body: categorySchema },
    handler: async (req) => ok(await assetService.saveCategory(authOf(req), req.body, req.params.code)),
  });
  r.delete('/api/v1/asset-categories/:code', {
    preHandler: requirePermission('catalog:write'),
    schema: { tags, summary: 'Xoá loại tài sản chưa dùng', params: z.object({ code: z.string() }) },
    handler: async (req) => ok(await assetService.removeCategory(authOf(req), req.params.code)),
  });

  r.get('/api/v1/assets', {
    preHandler: requirePermission('catalog:read'),
    schema: { tags, summary: 'Thẻ tài sản', querystring: z.object({ kind: kind.optional(), search: z.string().optional(), code: z.string().optional() }) },
    handler: async (req) => ok(await assetService.list(authOf(req), req.query)),
  });
  r.post('/api/v1/assets', {
    preHandler: requirePermission('catalog:write'),
    schema: { tags, summary: 'Thêm thẻ tài sản', body: assetSchema },
    handler: async (req, reply) => reply.status(201).send(ok(await assetService.create(authOf(req), req.body))),
  });
  r.put('/api/v1/assets/:code', {
    preHandler: requirePermission('catalog:write'),
    schema: { tags, summary: 'Sửa thẻ tài sản (cả ghi giảm, tạm ngừng)', params: z.object({ code: z.string() }), body: assetSchema },
    handler: async (req) => ok(await assetService.update(authOf(req), req.params.code, req.body)),
  });
  r.delete('/api/v1/assets/:code', {
    preHandler: requirePermission('catalog:write'),
    schema: { tags, summary: 'Xoá thẻ tài sản chưa trích tháng nào', params: z.object({ code: z.string() }) },
    handler: async (req) => ok(await assetService.remove(authOf(req), req.params.code)),
  });

  r.post('/api/v1/assets/import', {
    preHandler: requirePermission('catalog:write'),
    schema: { tags, summary: 'Nhập hàng loạt thẻ tài sản', body: z.object({ assets: z.array(assetSchema).min(1).max(5000), createBranches: z.boolean().optional(), dryRun: z.boolean().optional() }) },
    handler: async (req) => ok(await assetService.importMany(authOf(req), req.body)),
  });

  r.get('/api/v1/asset-events', {
    preHandler: requirePermission('catalog:read'),
    schema: { tags, summary: 'Đánh giá lại, điều chuyển, kiểm kê', querystring: z.object({ kind: z.enum(['revaluation', 'transfer', 'audit']).optional(), assetCode: z.string().optional(), from: date.optional(), to: date.optional() }) },
    handler: async (req) => ok(await assetService.listEvents(authOf(req), req.query)),
  });
  r.post('/api/v1/assets/:code/events', {
    preHandler: requirePermission('catalog:write'),
    schema: {
      tags,
      summary: 'Thêm sự kiện tài sản (đánh giá lại, điều chuyển, kiểm kê)',
      params: z.object({ code: z.string() }),
      body: z.object({
        kind: z.enum(['revaluation', 'transfer', 'audit']), date, docNo: z.string().optional(), note: z.string().optional(),
        costDelta: z.coerce.number().optional(), depreciableDelta: z.coerce.number().nullish(), accumulatedDelta: z.coerce.number().optional(),
        remainingMonths: z.coerce.number().int().positive().nullish(), monthlyAmount: money.nullish(),
        toBranchCode: z.string().optional(), result: z.enum(['ok', 'damaged', 'unused', 'missing']).optional(), actualQuantity: z.coerce.number().nullish(),
      }),
    },
    handler: async (req, reply) => reply.status(201).send(ok(await assetService.addEvent(authOf(req), req.params.code, req.body))),
  });
  r.delete('/api/v1/asset-events/:id', {
    preHandler: requirePermission('catalog:write'),
    schema: { tags, summary: 'Xoá sự kiện tài sản', params: z.object({ id: z.string() }) },
    handler: async (req) => ok(await assetService.removeEvent(authOf(req), req.params.id)),
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

  r.put('/api/v1/assets/:code/photo', {
    preHandler: requirePermission('catalog:write'),
    schema: { tags, summary: 'Ghi / bỏ ảnh của thẻ tài sản', params: z.object({ code: z.string() }), body: z.object({ photo: z.string().max(700_000).nullable() }) },
    handler: async (req) => {
      const auth = authOf(req);
      const photo = req.body.photo;
      if (photo && !/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(photo)) throw Errors.validation('Ảnh phải là PNG, JPEG hoặc WebP');
      const res = await db.updateTable('assets').set({ photo, updated_at: new Date() }).where('tenant_id', '=', auth.tenantId).where('code', '=', req.params.code).executeTakeFirst();
      if (!Number(res.numUpdatedRows)) throw Errors.notFound(`tài sản ${req.params.code}`);
      await writeAudit(db, { tenantId: auth.tenantId, actor: auth.actor, action: 'asset.photo', objectType: 'asset', objectId: req.params.code, after: { photo: photo ? `(ảnh ${photo.length} ký tự)` : null } });
      return ok({ saved: true });
    },
  });

  r.put('/api/v1/assets/:code/override', {
    preHandler: requirePermission('periods:lock'),
    schema: { tags, summary: 'Sửa tay số trích một tháng', params: z.object({ code: z.string() }), body: z.object({ period: z.string().regex(/^\d{4}-\d{2}$/), amount: z.coerce.number().nonnegative().nullable(), reason: z.string().optional() }) },
    handler: async (req) => ok(await assetService.setOverride(authOf(req), req.params.code, req.body)),
  });

  r.post('/api/v1/assets/depreciation', {
    preHandler: requirePermission('periods:lock'),
    schema: { tags, summary: 'Tính khấu hao, phân bổ một tháng và ghi sổ (tính lại thì bút toán cũ ghi số âm)', body: z.object({ period: z.string().regex(/^\d{4}-\d{2}$/, 'Kỳ dạng YYYY-MM'), catchUp: z.boolean().optional() }) },
    handler: async (req) => ok(await assetService.run(authOf(req), req.body)),
  });
  r.get('/api/v1/assets/register', {
    preHandler: requirePermission('reports:read'),
    schema: { tags, summary: 'Sổ tài sản, bảng tính khấu hao / phân bổ', querystring: z.object({ from: date, to: date, kind: kind.optional(), branchCodes }) },
    handler: async (req) => ok(await assetService.register(authOf(req), req.query)),
  });
}
