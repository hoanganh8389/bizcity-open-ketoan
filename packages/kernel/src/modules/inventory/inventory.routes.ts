// @bizcity-layer K kernel/subledgers/inventory
// [2026-10-29 10:24 PM Johnny Chu - Chu Hoàng Anh] INIT — khởi tạo Bizcity Core Framework: sổ cái chỉ thêm, cửa nạp sự việc, CANON, hợp đồng, bộ kiểm chuẩn.
// [2026-10-30 09:58 AM Johnny Chu - Chu Hoàng Anh] PHASE-002 — nhãn lớp @bizcity-layer, đồ thị phụ thuộc mốc, bản nháp API module-sdk.
// [2026-11-01 03:40 PM Johnny Chu - Chu Hoàng Anh] PHASE-010 — route báo cáo kho tách sang inventory-report.routes.ts (module kho): Kernel không import báo cáo
// [2026-11-01 04:39 PM Johnny Chu - Chu Hoàng Anh] PHASE-010 — dời từ apps/api/src/modules/inventory/inventory.routes.ts sang packages/kernel (@bizcity/kernel, D010-7 chặng 3); import Platform qua @bizcity/platform
/**
 * Kho và giá vốn.
 *   POST /api/v1/inventory/costing        tính giá vốn bình quân một tháng và ghi sổ giá vốn hàng xuất (quyền periods:lock)
 *   GET  /api/v1/inventory/costs          bảng đơn giá vốn của một tháng
 *   Báo cáo kho (nhập xuất tồn, sổ chi tiết hàng, chọn mặt hàng): inventory-report.routes.ts (module kho), lắp ở GOODS.
 * Chứng từ kho (nhập mua, trả NCC, chuyển kho, điều chỉnh) lập ở hệ thống bán hàng, vào qua trạm ACC14 (kết nối / cổng chờ).
 */
import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { authOf, requirePermission } from '@bizcity/platform/core/auth';
import { idParamSchema, ok } from '@bizcity/platform/core/http';
import { checkCostImport, costingFormulas, costingRuns, costingService, formulaOf } from './costing.service.js';
import { sql } from 'kysely';
import { db } from '@bizcity/platform/db/client';
import { env } from '@bizcity/platform/config/env';
import { defineAction, mountActions, type AnyActionDef } from '@bizcity/platform/core/actions';

const tags = ['Kho và giá vốn'];
const period = z.string().regex(/^\d{4}-\d{2}$/, 'Kỳ dạng YYYY-MM');

export async function inventoryRoutes(app: FastifyInstance): Promise<void> {
  const r = app.withTypeProvider<ZodTypeProvider>();

  r.get('/api/v1/inventory/costs', {
    preHandler: requirePermission('reports:read'),
    schema: { tags, summary: 'Bảng đơn giá vốn của một tháng', querystring: z.object({ period, search: z.string().optional() }) },
    handler: async (req) => ok(await costingService.list(authOf(req), req.query)),
  });
  // [2026-11-17 Nguyễn Văn Thủy] chi nhánh tính giá vốn = điểm tính giá vốn trên Cơ cấu tổ chức (0147) và số shop bên dưới (đóng góp)
  r.get('/api/v1/inventory/cost-centers', {
    preHandler: requirePermission('reports:read'),
    schema: { tags, summary: 'Chi nhánh tính giá vốn (đơn vị hạch toán, sinh theo Cơ cấu tổ chức) và số shop' },
    handler: async (req) => {
      const rows = await sql<{ code: string; name: string; shops: string; org: boolean }>`
        SELECT u.code, u.name, COUNT(b.id) AS shops, (u.org_unit_id IS NOT NULL) AS org
          FROM accounting_units u LEFT JOIN branches b ON b.accounting_unit_id = u.id AND b.tenant_id = u.tenant_id
         WHERE u.tenant_id = ${authOf(req).tenantId} GROUP BY u.id ORDER BY u.code`.execute(db);
      return ok(rows.rows.map((r) => ({ code: r.code, name: r.name, shops: Number(r.shops), fromOrg: r.org })));
    },
  });
  // [2026-11-17 Nguyễn Văn Thủy] các lần tính giá vốn theo chi nhánh và bảng đơn giá của một lần (0148) (đóng góp)
  r.get('/api/v1/inventory/costing-formulas', {
    preHandler: requirePermission('reports:read'),
    schema: { tags, summary: 'Công thức giá vốn (bộ lựa chọn cách tính) của đơn vị' },
    handler: async (req) => ok(await costingFormulas.list(authOf(req))),
  });
  // [2026-11-17 Nguyễn Văn Thủy] kiểm tra tệp giá vốn bình quân đầu kỳ trước khi nhập (không ghi) (đóng góp)
  r.post('/api/v1/inventory/costing/import-check', {
    preHandler: requirePermission('reports:read'),
    schema: { tags, summary: 'Kiểm tra tệp giá vốn bình quân đầu kỳ (không ghi)', body: z.object({ period: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/), rows: z.array(z.object({ row: z.number().int(), sku: z.string().max(200).optional(), name: z.string().max(500).optional(), unitCost: z.union([z.string().max(60), z.number()]).nullable().optional() })).max(100000) }) },
    handler: async (req) => ok(await checkCostImport(authOf(req), req.body.period, req.body.rows)),
  });
  r.get('/api/v1/inventory/costing-runs', {
    preHandler: requirePermission('reports:read'),
    schema: { tags, summary: 'Các lần tính giá vốn (lọc chi nhánh, ngày tính)', querystring: z.object({ costCenter: z.string().max(60).optional(), from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(), to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional() }) },
    handler: async (req) => ok(await costingRuns.list(authOf(req), req.query)),
  });
  r.get('/api/v1/inventory/costing-runs/:id/lines', {
    preHandler: requirePermission('reports:read'),
    schema: { tags, summary: 'Bảng đơn giá các mã hàng của một lần tính giá vốn', params: z.object({ id: z.string().regex(/^[1-9][0-9]*$/) }) },
    handler: async (req) => ok(await costingRuns.lines(authOf(req), req.params.id)),
  });
  // [2026-11-05 09:30 PM Nguyễn Văn Thủy] PHASE-026 — màn Công thức giá vốn ACC49A (đóng góp)
  r.get('/api/v1/inventory/costing/formula', {
    preHandler: requirePermission('reports:read'),
    schema: { tags, summary: 'Công thức giá vốn của bản cài đang chạy và số chi nhánh đã gán đơn vị hạch toán' },
    handler: async (req) => {
      const c = await sql<{ branches: string; with_unit: string; units: string }>`
        SELECT COUNT(*) AS branches, COUNT(accounting_unit_id) AS with_unit, COUNT(DISTINCT accounting_unit_id) AS units
          FROM branches WHERE tenant_id = ${authOf(req).tenantId}`.execute(db);
      return ok({ book: env.BOOK_MODE, branches: Number(c.rows[0]!.branches), withUnit: Number(c.rows[0]!.with_unit), units: Number(c.rows[0]!.units) });
    },
  });
  mountActions(app, inventoryWriteActions);
}

// [2026-11-03 10:10 AM Johnny Chu - Chu Hoàng Anh] PHASE-014 — W6 đợt 6 (action theo lô): route ghi qua defineAction — quyền, kiểm input, idempotency, giao dịch, bằng chứng do runtime; đường dẫn / thân yêu cầu / mã 201 như cũ.
// Mã cũ trong handler chạy trong giao dịch của action (sameTx); service tự mở giao dịch có bản *In.
const anyOut = z.custom<object>((v) => typeof v === 'object' && v !== null);

const formulaOptions = z.object({
  price: z.enum(['net', 'before_discount', 'with_vat']).optional(),
  costAlloc: z.boolean().optional(),
  rebateAlloc: z.boolean().optional(),
  purchaseReturn: z.enum(['reason', 'doc', 'opening']).optional(), // 'reason' (cũ) = theo phiếu
  transferIn: z.enum(['doc', 'sender']).optional(),
  adjustIn: z.boolean().optional(),
});

export const inventoryWriteActions: AnyActionDef[] = [
  defineAction({
    id: 'core.inventory.costing-formula-save', title: 'Đổi công thức giá vốn áp dụng từ một tháng (cần mật khẩu, không áp vào tháng đã khoá sổ)', tags,
    permission: 'periods:lock', effect: 'write', sideEffects: ['masterdata'], idempotency: 'natural',
    input: z.object({ name: z.string().trim().min(1).max(200), options: formulaOptions, applyFrom: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, 'Tháng áp dụng dạng YYYY-MM'), password: z.string().max(200), note: z.string().max(1000).optional() }),
    output: anyOut,
    expose: { http: { method: 'POST', path: '/api/v1/inventory/costing-formulas' }, mcp: false, ai: 'deny' },
    evidence: { objectType: 'costing_formula', objectId: (i) => i.applyFrom },
    handler: (ctx, input) => costingFormulas.saveIn(ctx.data.tx as never, ctx.legacyAuth, { ...input, options: formulaOf(input.options) }),
  }),
  defineAction({
    id: 'core.inventory.costing-run', title: 'Tính giá vốn tháng (bình quân; mã có trong bảng giá nhập từ Excel thì dùng giá đó), ghi đè dòng giá vốn chờ của các phiếu', tags,
    permission: 'periods:lock', effect: 'write', sideEffects: ['ledger'], idempotency: 'natural',
    input: z.object({
        period,
        /** Bảng giá vốn tháng nhập từ Excel (Mã hàng, Tên hàng, Giá vốn): thay toàn bộ giá đã nhập của tháng. */
        imported: z.array(z.object({ sku: z.string().trim().min(1).max(64), unitCost: z.number().finite().min(0), name: z.string().max(500).optional() })).max(100000).optional(),
        /** Bỏ giá đã nhập của tháng, tính bình quân cho mọi mã. */
        clearImport: z.boolean().optional(),
        /** Chỉ cập nhật giá vốn cho chứng từ có ngày chứng từ trong khoảng này (trong tháng; mặc định cả tháng). */
        from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
        to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
        /** [2026-11-17] Chỉ ra phiếu giá vốn cho shop thuộc chi nhánh này (mã đơn vị hạch toán / điểm tính giá vốn); trống = mọi chi nhánh. */
        costCenter: z.string().trim().max(60).optional(),
        /** [2026-11-17] Phạm vi chọn trên cây cơ cấu: nút bất kỳ (node) hoặc một shop (shop) — đặt làm điểm tính giá vốn rồi tính. */
        scope: z.object({ kind: z.enum(['node', 'shop']), code: z.string().trim().min(1).max(60) }).optional(),
        /** [2026-11-17] Loại kho tính giá vốn riêng (bỏ chọn ở ô Loại kho tính chung); trống = mọi loại kho tính chung. */
        separateTypes: z.array(z.string().trim().min(1).max(12)).max(50).optional(),
      }), output: anyOut,
    expose: { http: { method: 'POST', path: '/api/v1/inventory/costing' }, mcp: false, ai: 'deny' },
    evidence: { objectType: 'inventory' },
    handler: (ctx, input) => costingService.runIn(ctx.data.tx, ctx.legacyAuth, input),
  }),
];
