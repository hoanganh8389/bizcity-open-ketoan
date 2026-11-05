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
import { costingService } from './costing.service.js';
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

export const inventoryWriteActions: AnyActionDef[] = [
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
      }), output: anyOut,
    expose: { http: { method: 'POST', path: '/api/v1/inventory/costing' }, mcp: false, ai: 'deny' },
    evidence: { objectType: 'inventory' },
    handler: (ctx, input) => costingService.runIn(ctx.data.tx, ctx.legacyAuth, input),
  }),
];
