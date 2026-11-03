// @bizcity-layer M data/masterdata
// [2026-11-03 10:39 AM Nguyễn Văn Thủy] SDTC — API sơ đồ tổ chức (cây, nút, gắn chi nhánh, đơn vị mua hàng, nhập Excel) (đóng góp)
// [2026-11-03 03:10 PM Nguyễn Văn Thủy] SDTC — DELETE /api/v1/org-units/:code: xoá nút trống (đóng góp)
/**
 * Sơ đồ tổ chức (DM16).
 *   GET   /api/v1/org-units/tree                 cây + chi nhánh + kho (bộ lọc cây, màn DM16, MH15)
 *   GET   /api/v1/org-units/purchase-units       đơn vị mua hàng (ô chọn ở MH02 / MH16 / MH18 / MH19)
 *   POST  /api/v1/org-units                      thêm nút
 *   PATCH /api/v1/org-units/:code                sửa / chuyển cha / ngừng dùng
 *   PUT   /api/v1/org-units/:code/branches       gắn chi nhánh vào nút
 *   POST  /api/v1/org-units/import               nhập Excel (dryRun = xem trước)
 *   GET   /api/v1/org-units/defaults             số bản ghi tệp dữ liệu gốc
 *   POST  /api/v1/org-units/restore-defaults     quay về dữ liệu gốc (db/seeds/so-do-to-chuc*.jsonl, quyền settings:write)
 */
import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { authOf, requirePermission } from '../../core/auth.js';
import { ok } from '../../core/http.js';
import { orgAssignSchema, orgCreateSchema, orgImportSchema, orgUpdateSchema } from './org-unit.schemas.js';
import { orgUnitService } from './org-unit.service.js';

const tags = ['Danh mục: Sơ đồ tổ chức'];
const params = z.object({ code: z.string() });

export async function orgUnitRoutes(app: FastifyInstance): Promise<void> {
  const r = app.withTypeProvider<ZodTypeProvider>();
  const read = requirePermission('catalog:read');
  const write = requirePermission('catalog:write');

  r.get('/api/v1/org-units/tree', { preHandler: read, schema: { tags, summary: 'Cây sơ đồ tổ chức + chi nhánh + kho' }, handler: async (req) => ok(await orgUnitService.tree(authOf(req))) });
  r.get('/api/v1/org-units/purchase-units', { preHandler: read, schema: { tags, summary: 'Đơn vị mua hàng (nút + kho tổng)' }, handler: async (req) => ok(await orgUnitService.purchaseUnits(authOf(req))) });
  r.post('/api/v1/org-units', { preHandler: write, schema: { tags, summary: 'Thêm nút sơ đồ tổ chức', body: orgCreateSchema }, handler: async (req, reply) => reply.status(201).send(ok(await orgUnitService.create(authOf(req), req.body))) });
  r.patch('/api/v1/org-units/:code', { preHandler: write, schema: { tags, summary: 'Sửa / chuyển cha / ngừng dùng nút', params, body: orgUpdateSchema }, handler: async (req) => ok(await orgUnitService.update(authOf(req), req.params.code, req.body)) });
  r.delete('/api/v1/org-units/:code', { preHandler: write, schema: { tags, summary: 'Xoá nút (không có nút con, không gắn chi nhánh)', params }, handler: async (req) => ok(await orgUnitService.remove(authOf(req), req.params.code)) });
  r.put('/api/v1/org-units/:code/branches', { preHandler: write, schema: { tags, summary: 'Gắn chi nhánh vào nút', params, body: orgAssignSchema }, handler: async (req) => ok(await orgUnitService.assign(authOf(req), req.params.code, req.body.branchCodes)) });
  r.get('/api/v1/org-units/defaults', { preHandler: read, schema: { tags, summary: 'Số bản ghi trong tệp dữ liệu gốc sơ đồ tổ chức' }, handler: async () => ok(orgUnitService.defaultsInfo()) });
  r.post('/api/v1/org-units/restore-defaults', { preHandler: requirePermission('settings:write'), schema: { tags, summary: 'Quay về dữ liệu gốc sơ đồ tổ chức (db/seeds/so-do-to-chuc*.jsonl)', body: z.object({ confirm: z.literal(true) }) },
    handler: async (req) => ok(await orgUnitService.restoreDefaults(authOf(req))) });
  r.post('/api/v1/org-units/import', { preHandler: write, schema: { tags, summary: 'Nhập sơ đồ tổ chức từ Excel', body: orgImportSchema }, handler: async (req) => ok(await orgUnitService.importAll(authOf(req), req.body)) });
}
