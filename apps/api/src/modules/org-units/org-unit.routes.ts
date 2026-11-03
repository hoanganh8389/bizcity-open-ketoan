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
import { defineAction, mountActions, type AnyActionDef } from '@bizcity/platform/core/actions';

const tags = ['Danh mục: Sơ đồ tổ chức'];
const params = z.object({ code: z.string() });

export async function orgUnitRoutes(app: FastifyInstance): Promise<void> {
  const r = app.withTypeProvider<ZodTypeProvider>();
  const read = requirePermission('catalog:read');
  const write = requirePermission('catalog:write');

  r.get('/api/v1/org-units/tree', { preHandler: read, schema: { tags, summary: 'Cây sơ đồ tổ chức + chi nhánh + kho' }, handler: async (req) => ok(await orgUnitService.tree(authOf(req))) });
  r.get('/api/v1/org-units/purchase-units', { preHandler: read, schema: { tags, summary: 'Đơn vị mua hàng (nút + kho tổng)' }, handler: async (req) => ok(await orgUnitService.purchaseUnits(authOf(req))) });
  r.get('/api/v1/org-units/defaults', { preHandler: read, schema: { tags, summary: 'Số bản ghi trong tệp dữ liệu gốc sơ đồ tổ chức' }, handler: async () => ok(orgUnitService.defaultsInfo()) });
  mountActions(app, orgUnitWriteActions);
}

// [2026-11-03 05:50 PM Johnny Chu - Chu Hoàng Anh] PHASE-014 — W6 gộp main (sơ đồ tổ chức): route ghi qua defineAction — quyền, kiểm input, idempotency, giao dịch, bằng chứng do runtime; đường dẫn / thân yêu cầu / mã 201 như cũ.
// Mã cũ trong handler chạy trong giao dịch của action (sameTx); service tự mở giao dịch có bản *In.
const anyOut = z.custom<object>((v) => typeof v === 'object' && v !== null);

export const orgUnitWriteActions: AnyActionDef[] = [
  defineAction({
    id: 'core.org-unit.create', title: 'Thêm nút sơ đồ tổ chức', tags,
    permission: 'catalog:write', effect: 'write', sideEffects: ['masterdata'], idempotency: 'natural',
    input: orgCreateSchema, output: anyOut,
    expose: { http: { method: 'POST', path: '/api/v1/org-units', status: 201 }, mcp: false, ai: 'deny' },
    evidence: { objectType: 'org_unit' },
    handler: (ctx, input) => orgUnitService.createIn(ctx.data.tx, ctx.legacyAuth, input),
  }),
  defineAction({
    id: 'core.org-unit.update', title: 'Sửa / chuyển cha / ngừng dùng nút', tags,
    permission: 'catalog:write', effect: 'write', sideEffects: ['masterdata'], idempotency: 'natural',
    input: (orgUpdateSchema).merge(params), output: anyOut,
    expose: { http: { method: 'PATCH', path: '/api/v1/org-units/:code' }, mcp: false, ai: 'deny' },
    evidence: { objectType: 'org_unit', objectId: (i) => String(i.code) },
    handler: (ctx, input) => {
      const { code, ...reqBody } = input;
      return orgUnitService.updateIn(ctx.data.tx, ctx.legacyAuth, code, reqBody);
    },
  }),
  defineAction({
    id: 'core.org-unit.delete', title: 'Xoá nút (không có nút con, không gắn chi nhánh)', tags,
    permission: 'catalog:write', effect: 'write', sideEffects: ['masterdata'], idempotency: 'natural',
    input: params, output: anyOut,
    expose: { http: { method: 'DELETE', path: '/api/v1/org-units/:code' }, mcp: false, ai: 'deny' },
    evidence: { objectType: 'org_unit', objectId: (i) => String(i.code) },
    handler: (ctx, input) => orgUnitService.removeIn(ctx.data.tx, ctx.legacyAuth, input.code),
  }),
  defineAction({
    id: 'core.org-unit.branches-assign', title: 'Gắn chi nhánh vào nút', tags,
    permission: 'catalog:write', effect: 'write', sideEffects: ['masterdata'], idempotency: 'natural',
    input: (orgAssignSchema).merge(params), output: anyOut,
    expose: { http: { method: 'PUT', path: '/api/v1/org-units/:code/branches' }, mcp: false, ai: 'deny' },
    evidence: { objectType: 'org_unit', objectId: (i) => String(i.code) },
    handler: (ctx, input) => {
      const { code, ...reqBody } = input;
      return orgUnitService.assignIn(ctx.data.tx, ctx.legacyAuth, code, reqBody.branchCodes);
    },
  }),
  defineAction({
    id: 'core.org-unit.restore-defaults', title: 'Quay về dữ liệu gốc sơ đồ tổ chức (db/seeds/so-do-to-chuc*.jsonl)', tags,
    permission: 'settings:write', effect: 'write', sideEffects: ['masterdata'], idempotency: 'natural',
    input: z.object({ confirm: z.literal(true) }), output: anyOut,
    expose: { http: { method: 'POST', path: '/api/v1/org-units/restore-defaults' }, mcp: false, ai: 'deny' },
    evidence: { objectType: 'org_unit' },
    handler: (ctx, input) => orgUnitService.restoreDefaultsIn(ctx.data.tx, ctx.legacyAuth),
  }),
  defineAction({
    id: 'core.org-unit.import', title: 'Nhập sơ đồ tổ chức từ Excel', tags,
    permission: 'catalog:write', effect: 'write', sideEffects: ['masterdata'], idempotency: 'natural',
    input: orgImportSchema, output: anyOut,
    expose: { http: { method: 'POST', path: '/api/v1/org-units/import' }, mcp: false, ai: 'deny' },
    evidence: { objectType: 'org_unit' },
    handler: (ctx, input) => orgUnitService.importAllIn(ctx.data.tx, ctx.legacyAuth, input),
  }),
];
