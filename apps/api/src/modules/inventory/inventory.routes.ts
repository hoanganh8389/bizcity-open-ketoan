// @bizcity-layer K kernel/subledgers/inventory
// [2026-10-29 10:24 PM Johnny Chu - Chu Hoàng Anh] INIT — khởi tạo Bizcity Core Framework: sổ cái chỉ thêm, cửa nạp sự việc, CANON, hợp đồng, bộ kiểm chuẩn.
// [2026-10-30 09:58 AM Johnny Chu - Chu Hoàng Anh] PHASE-002 — nhãn lớp @bizcity-layer, đồ thị phụ thuộc mốc, bản nháp API module-sdk.
/**
 * Kho và giá vốn.
 *   POST /api/v1/inventory/costing        tính giá vốn bình quân một tháng và ghi sổ giá vốn hàng xuất (quyền periods:lock)
 *   GET  /api/v1/inventory/costs          bảng đơn giá vốn của một tháng
 *   GET  /api/v1/inventory/stock-movement báo cáo nhập xuất tồn theo chi nhánh, mặt hàng
 *   GET  /api/v1/inventory/stock-summary  nhập xuất tồn, mua hàng, giá vốn gom theo phân loại hàng / chi nhánh / nhà cung cấp
 *   GET  /api/v1/inventory/item-ledger    sổ chi tiết một mặt hàng
 *   GET  /api/v1/inventory/items          danh sách mặt hàng để chọn (tìm theo mã, tên)
 * Chứng từ kho (nhập mua, trả NCC, chuyển kho, điều chỉnh) lập ở hệ thống bán hàng, vào qua trạm ACC14 (kết nối / cổng chờ).
 */
import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { authOf, requirePermission } from '../../core/auth.js';
import { idParamSchema, ok } from '../../core/http.js';
import { costingService } from './costing.service.js';
import { inventoryReportService, STOCK_GROUPS } from './inventory-report.service.js';

const tags = ['Kho và giá vốn'];
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Ngày dạng YYYY-MM-DD');
const period = z.string().regex(/^\d{4}-\d{2}$/, 'Kỳ dạng YYYY-MM');
const branchCodes = z
  .string()
  .optional()
  .transform((s) => (s ? s.split(',').map((x) => x.trim()).filter(Boolean) : undefined));

export async function inventoryRoutes(app: FastifyInstance): Promise<void> {
  const r = app.withTypeProvider<ZodTypeProvider>();

  r.post('/api/v1/inventory/costing', {
    preHandler: requirePermission('periods:lock'),
    schema: {
      tags,
      summary: 'Tính giá vốn tháng (bình quân; mã có trong bảng giá nhập từ Excel thì dùng giá đó), ghi đè dòng giá vốn chờ của các phiếu',
      body: z.object({
        period,
        /** Bảng giá vốn tháng nhập từ Excel (Mã hàng, Tên hàng, Giá vốn): thay toàn bộ giá đã nhập của tháng. */
        imported: z.array(z.object({ sku: z.string().trim().min(1).max(64), unitCost: z.number().finite().min(0), name: z.string().max(500).optional() })).max(100000).optional(),
        /** Bỏ giá đã nhập của tháng, tính bình quân cho mọi mã. */
        clearImport: z.boolean().optional(),
        /** Chỉ cập nhật giá vốn cho chứng từ có ngày chứng từ trong khoảng này (trong tháng; mặc định cả tháng). */
        from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
        to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
      }),
    },
    handler: async (req) => ok(await costingService.run(authOf(req), req.body)),
  });

  r.get('/api/v1/inventory/costs', {
    preHandler: requirePermission('reports:read'),
    schema: { tags, summary: 'Bảng đơn giá vốn của một tháng', querystring: z.object({ period, search: z.string().optional() }) },
    handler: async (req) => ok(await costingService.list(authOf(req), req.query)),
  });

  r.get('/api/v1/inventory/stock-movement', {
    preHandler: requirePermission('reports:read'),
    schema: { tags, summary: 'Báo cáo nhập xuất tồn', querystring: z.object({ from: date, to: date, branchCodes, warehouseCodes: branchCodes, search: z.string().optional() }) },
    handler: async (req) => ok(await inventoryReportService.stockMovement(authOf(req), req.query)),
  });

  r.get('/api/v1/inventory/stock-summary', {
    preHandler: requirePermission('reports:read'),
    schema: {
      tags, summary: 'Nhập xuất tồn, mua hàng, giá vốn gom theo phân loại hàng, chi nhánh, nhà cung cấp',
      querystring: z.object({ from: date, to: date, branchCodes, warehouseCodes: branchCodes, search: z.string().optional(), groupBy: z.enum(STOCK_GROUPS).default('itemGroup') }),
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
}
