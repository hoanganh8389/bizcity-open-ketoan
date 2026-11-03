// @bizcity-layer K kernel/lineage
// [2026-11-03 09:00 PM Johnny Chu - Chu Hoàng Anh] PHASE-025 — W1 (ADR-0021): API truy vết vòng đời mặt hàng — chỉ đọc
/**
 * TRUY VẾT VÒNG ĐỜI MẶT HÀNG — API (bizcity_lineage@1, docs/contracts/BIZCITY-LINEAGE-v1.md). Quyền ledger:read.
 *   GET /api/v1/lineage/search?q=                         tìm mặt hàng theo mã, tên, mã vạch
 *   GET /api/v1/lineage/items/:sku?from=&to=&branch=      sự kiện kho + bút toán + giá vốn từng tháng của một mặt hàng
 *   GET /api/v1/lineage/items/:sku/cost?period=&costGroup=   "Vì sao giá vốn này?": công thức đơn giá bằng số thật + các phiếu góp vào
 *   GET /api/v1/lineage/items/:sku/history                Lịch sử mặt hàng: mã cũ / mới, hiệu lực, người đổi, phân loại, sửa có lý do (PHASE-026 S026-10)
 *   GET /api/v1/lineage/items/:sku/impact                 Tác động: chứng từ, tồn theo chi nhánh, tài khoản, bảng giá, kỳ đã khoá dùng mặt hàng (PHASE-026 S026-11)
 */
import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { db } from '@bizcity/platform/db/client';
import { authOf, requirePermission } from '@bizcity/platform/core/auth';
import { ok } from '@bizcity/platform/core/http';
import { explainCost, getItemHistory, getItemImpact, getItemLineage, searchItems } from './lineage.service.js';

const tags = ['Truy vết vòng đời'];
const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Ngày dạng YYYY-MM-DD');

export async function lineageRoutes(app: FastifyInstance): Promise<void> {
  const r = app.withTypeProvider<ZodTypeProvider>();

  r.get('/api/v1/lineage/search', {
    preHandler: requirePermission('ledger:read'),
    schema: { tags, summary: 'Tìm mặt hàng để truy vết: mã, tên, mã vạch', querystring: z.object({ q: z.string().trim().min(1).max(100), limit: z.coerce.number().int().min(1).max(50).default(20) }) },
    handler: async (req) => {
      const auth = authOf(req);
      return ok(await db.transaction().execute((trx) => searchItems(trx, auth.tenantId, req.query.q, req.query.limit)));
    },
  });

  r.get('/api/v1/lineage/items/:sku', {
    preHandler: requirePermission('ledger:read'),
    schema: {
      tags, summary: 'Hành trình một mặt hàng: sự kiện kho, bút toán mang mã hàng, giá vốn từng tháng',
      params: z.object({ sku: z.string().min(1).max(64) }),
      querystring: z.object({ from: day.optional(), to: day.optional(), branch: z.string().trim().max(64).optional(), limit: z.coerce.number().int().min(1).max(2000).default(500) }),
    },
    handler: async (req) => {
      const auth = authOf(req);
      return ok(await db.transaction().execute((trx) => getItemLineage(trx, auth.tenantId, req.params.sku, req.query)));
    },
  });

  r.get('/api/v1/lineage/items/:sku/cost', {
    preHandler: requirePermission('ledger:read'),
    schema: {
      tags, summary: 'Vì sao giá vốn này? Công thức đơn giá một tháng bằng số thật, các phiếu góp vào',
      params: z.object({ sku: z.string().min(1).max(64) }),
      querystring: z.object({ period: z.string().regex(/^\d{4}-\d{2}$/, 'Kỳ dạng YYYY-MM'), costGroup: z.string().trim().max(64).optional() }),
    },
    handler: async (req) => {
      const auth = authOf(req);
      return ok(await db.transaction().execute((trx) => explainCost(trx, auth.tenantId, req.params.sku, req.query.period, req.query.costGroup)));
    },
  });

  // [2026-11-04 03:40 AM Johnny Chu - Chu Hoàng Anh] PHASE-026 — S026-10 (D026-5): thẻ Lịch sử của mặt hàng — quyền catalog:read (người xem danh mục xem được lịch sử của nó)
  r.get('/api/v1/lineage/items/:sku/history', {
    preHandler: requirePermission('catalog:read'),
    schema: { tags, summary: 'Lịch sử mặt hàng: mã cũ / mới, ngày hiệu lực, người đổi, đổi phân loại, sửa và cảnh báo có lý do', params: z.object({ sku: z.string().min(1).max(64) }) },
    handler: async (req) => {
      const auth = authOf(req);
      return ok(await db.transaction().execute((trx) => getItemHistory(trx, auth.tenantId, req.params.sku)));
    },
  });

  // [2026-11-04 04:00 AM Johnny Chu - Chu Hoàng Anh] PHASE-026 — S026-11 (D026-5): thẻ Tác động — đọc trước khi đổi mã / đổi nhóm / ngừng dùng
  r.get('/api/v1/lineage/items/:sku/impact', {
    preHandler: requirePermission('catalog:read'),
    schema: { tags, summary: 'Tác động của mặt hàng: chứng từ, tồn theo chi nhánh, tài khoản, bảng giá, quy đổi, kỳ đã khoá — đọc trước khi đổi mã / nhóm / ngừng dùng', params: z.object({ sku: z.string().min(1).max(64) }) },
    handler: async (req) => {
      const auth = authOf(req);
      return ok(await db.transaction().execute((trx) => getItemImpact(trx, auth.tenantId, req.params.sku)));
    },
  });
}
