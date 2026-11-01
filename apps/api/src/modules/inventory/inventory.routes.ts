// @bizcity-layer K kernel/subledgers/inventory
// [2026-10-29 10:24 PM Johnny Chu - Chu Hoàng Anh] INIT — khởi tạo Bizcity Core Framework: sổ cái chỉ thêm, cửa nạp sự việc, CANON, hợp đồng, bộ kiểm chuẩn.
// [2026-10-30 09:58 AM Johnny Chu - Chu Hoàng Anh] PHASE-002 — nhãn lớp @bizcity-layer, đồ thị phụ thuộc mốc, bản nháp API module-sdk.
// [2026-11-01 03:40 PM Johnny Chu - Chu Hoàng Anh] PHASE-010 — route báo cáo kho tách sang inventory-report.routes.ts (module kho): Kernel không import báo cáo
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
import { authOf, requirePermission } from '../../core/auth.js';
import { idParamSchema, ok } from '../../core/http.js';
import { costingService } from './costing.service.js';

const tags = ['Kho và giá vốn'];
const period = z.string().regex(/^\d{4}-\d{2}$/, 'Kỳ dạng YYYY-MM');

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
}
