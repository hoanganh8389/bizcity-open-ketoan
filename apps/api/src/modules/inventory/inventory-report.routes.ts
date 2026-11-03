// @bizcity-layer D modules/kho
// [2026-11-01 03:40 PM Johnny Chu - Chu Hoàng Anh] PHASE-010 — tách khỏi inventory.routes.ts (Kernel): route báo cáo kho là module kho; Kernel không import báo cáo (chuẩn bị packages/kernel, PHASES 2.3)
// [2026-11-03 06:30 PM Johnny Chu - Chu Hoàng Anh] PHASE-024 — route đối chiếu sổ chi tiết kho ↔ sổ cái (GET /api/v1/inventory/reconcile)
// [2026-11-03 04:30 PM Nguyễn Văn Thủy] NHOM — nhập xuất tồn: lọc ?groups= (nhóm hàng, gồm nhóm con), gom theo nhóm cấp 1 / 2 / 3 (đóng góp)
/**
 * Báo cáo kho (module kho, đọc inventory_movements qua inventory-report.service.ts):
 *   GET  /api/v1/inventory/stock-movement báo cáo nhập xuất tồn theo chi nhánh, mặt hàng
 *   GET  /api/v1/inventory/stock-summary  nhập xuất tồn, mua hàng, giá vốn gom theo phân loại hàng / chi nhánh / nhà cung cấp
 *   GET  /api/v1/inventory/item-ledger    sổ chi tiết một mặt hàng
 *   GET  /api/v1/inventory/items          danh sách mặt hàng để chọn (tìm theo mã, tên)
 *   GET  /api/v1/inventory/reconcile      đối chiếu sổ chi tiết kho với số dư tài khoản hàng tồn kho tới hết kỳ
 * Lắp ở GOODS (phan-he/loi.ts) cùng inventoryRoutes của Kernel — đường dẫn API như cũ.
 */
import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { authOf, requirePermission } from '../../core/auth.js';
import { ok } from '../../core/http.js';
import { inventoryReportService, STOCK_GROUPS } from './inventory-report.service.js';

const tags = ['Kho và giá vốn'];
const period = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, 'Kỳ dạng YYYY-MM');
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Ngày dạng YYYY-MM-DD');
const branchCodes = z
  .string()
  .optional()
  .transform((s) => (s ? s.split(',').map((x) => x.trim()).filter(Boolean) : undefined));

export async function inventoryReportRoutes(app: FastifyInstance): Promise<void> {
  const r = app.withTypeProvider<ZodTypeProvider>();

  r.get('/api/v1/inventory/stock-movement', {
    preHandler: requirePermission('reports:read'),
    schema: { tags, summary: 'Báo cáo nhập xuất tồn', querystring: z.object({ from: date, to: date, branchCodes, warehouseCodes: branchCodes, search: z.string().optional(), groups: branchCodes }) },
    handler: async (req) => ok(await inventoryReportService.stockMovement(authOf(req), req.query)),
  });

  r.get('/api/v1/inventory/stock-summary', {
    preHandler: requirePermission('reports:read'),
    schema: {
      tags, summary: 'Nhập xuất tồn, mua hàng, giá vốn gom theo phân loại hàng, chi nhánh, nhà cung cấp',
      querystring: z.object({ from: date, to: date, branchCodes, warehouseCodes: branchCodes, search: z.string().optional(), groupBy: z.enum(STOCK_GROUPS).default('itemGroup'), groups: branchCodes }),
    },
    handler: async (req) => ok(await inventoryReportService.stockSummary(authOf(req), req.query)),
  });

  r.get('/api/v1/inventory/item-ledger', {
    preHandler: requirePermission('reports:read'),
    schema: { tags, summary: 'Sổ chi tiết hàng hoá', querystring: z.object({ sku: z.string().min(1), from: date, to: date, branchCodes, warehouseCodes: branchCodes }) },
    handler: async (req) => ok(await inventoryReportService.itemLedger(authOf(req), req.query)),
  });

  r.get('/api/v1/inventory/items', {
    preHandler: requirePermission('reports:read'),
    schema: { tags, summary: 'Danh sách mặt hàng để chọn', querystring: z.object({ search: z.string().optional(), limit: z.coerce.number().int().min(1).max(200).default(50) }) },
    handler: async (req) => ok(await inventoryReportService.items(authOf(req), req.query)),
  });

  r.get('/api/v1/inventory/reconcile', {
    preHandler: requirePermission('reports:read'),
    schema: {
      tags, summary: 'Đối chiếu sổ chi tiết kho với số dư tài khoản hàng tồn kho (theo chi nhánh, mặt hàng) tới hết kỳ',
      querystring: z.object({ period, branchCodes, search: z.string().optional() }),
    },
    handler: async (req) => ok(await inventoryReportService.reconcile(authOf(req), req.query)),
  });
}
