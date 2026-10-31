// @bizcity-layer D modules/kho
// [2026-10-31 10:20 PM Johnny Chu - Chu Hoàng Anh] PHASE-012 — tách từ báo cáo hàng hoá (modules/reports/goods-reports.ts) về kho: bảng kê chuyển kho dựa trên nhập xuất có giá trị (SC-LAYER-2)
/**
 * GET /api/v1/reports/stock-transfers?from=&to=&branchCodes=&status=   bảng kê chuyển kho (HH01)
 *     mỗi phiếu × mặt hàng: chi nhánh xuất → nhận, số lượng, giá trị xuất, đã nhận, còn trên đường.
 * Lắp ở GOODS (phan-he/loi.ts) cho kho, mua-hang — như trước khi tách.
 */
import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { sql } from 'kysely';
import { db, toNumber } from '../../db/client.js';
import { authOf, requirePermission } from '../../core/auth.js';
import { ok } from '../../core/http.js';
import { valuedMovements } from '../../modules/inventory/inventory-report.service.js';

const tags = ['Báo cáo hàng hoá'];
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Ngày dạng YYYY-MM-DD');
const branchCodes = z.string().optional().transform((s) => (s ? s.split(',').map((x) => x.trim()).filter(Boolean) : undefined));

export async function stockTransferRoutes(app: FastifyInstance): Promise<void> {
  const r = app.withTypeProvider<ZodTypeProvider>();
  const pre = requirePermission('reports:read');

  r.get('/api/v1/reports/stock-transfers', {
    preHandler: pre,
    schema: {
      tags, summary: 'Bảng kê chuyển kho: chi nhánh xuất → nhận, đã nhận, còn trên đường',
      querystring: z.object({ from: date, to: date, branchCodes, status: z.enum(['all', 'pending', 'received']).default('all'), search: z.string().trim().max(100).optional() }),
    },
    handler: async (req) => {
      const auth = authOf(req);
      const q = req.query;
      // Một lần chuyển = một nhóm: phiếu cả cặp (một chứng từ hai đầu), hoặc hai phiếu một đầu (phiếu xuất nội bộ ở shop gửi,
      // phiếu nhận nội bộ ở shop nhận) cùng mã nhóm chuyển của hệ thống nguồn (payload.extra.transferGroup). Chỉ có một đầu
      // thì vẫn hiện, phần đầu kia để trống. Lọc theo ngày xuất, không có phiếu xuất thì theo ngày nhận.
      const res = await sql<{ event_id: string; doc_no: string; doc_key: string; in_doc_no: string | null; out_date: string | null; in_date: string | null; from_code: string | null; to_code: string | null; sku: string; name: string; unit: string; out_qty: string | null; out_value: string | null; in_qty: string | null; uncosted: string }>`
        WITH mv AS (${valuedMovements({ tenantId: auth.tenantId, to: q.to, branchIds: null, search: q.search || undefined })}),
        t AS (
          SELECT mv.*, d.doc_no, d.doc_key, b.code AS bcode, cb.code AS ccode,
                 COALESCE(NULLIF(d.payload->'extra'->>'transferGroup', ''), 'ev:' || d.id::text) AS grp
            FROM mv
            JOIN accounting_events d ON d.id = mv.event_id
            JOIN branches b ON b.id = mv.branch_id
            LEFT JOIN branches cb ON cb.id = mv.counter_branch_id
           WHERE mv.kind IN ('transfer_out', 'transfer_in')
        )
        SELECT MIN(t.event_id::text) FILTER (WHERE t.kind = 'transfer_out') AS out_event,
               COALESCE(MIN(t.event_id::text) FILTER (WHERE t.kind = 'transfer_out'), MIN(t.event_id::text)) AS event_id,
               COALESCE(MIN(t.doc_no) FILTER (WHERE t.kind = 'transfer_out'), MIN(t.doc_no)) AS doc_no,
               COALESCE(MIN(t.doc_key) FILTER (WHERE t.kind = 'transfer_out'), MIN(t.doc_key)) AS doc_key,
               MIN(t.doc_no) FILTER (WHERE t.kind = 'transfer_in') AS in_doc_no,
               MIN(t.doc_date) FILTER (WHERE t.kind = 'transfer_out')::text AS out_date,
               MAX(t.doc_date) FILTER (WHERE t.kind = 'transfer_in')::text AS in_date,
               COALESCE(MAX(t.bcode) FILTER (WHERE t.kind = 'transfer_out'), MAX(t.ccode) FILTER (WHERE t.kind = 'transfer_in')) AS from_code,
               COALESCE(MAX(t.bcode) FILTER (WHERE t.kind = 'transfer_in'), MAX(t.ccode) FILTER (WHERE t.kind = 'transfer_out')) AS to_code,
               t.sku, MAX(t.name) AS name, MAX(t.unit) AS unit,
               -SUM(t.qty) FILTER (WHERE t.kind = 'transfer_out') AS out_qty,
               -SUM(t.val) FILTER (WHERE t.kind = 'transfer_out') AS out_value,
               SUM(t.qty) FILTER (WHERE t.kind = 'transfer_in') AS in_qty,
               COUNT(*) FILTER (WHERE t.uncosted AND t.kind = 'transfer_out') AS uncosted
          FROM t
         GROUP BY t.grp, t.sku
        HAVING COALESCE(MIN(t.doc_date) FILTER (WHERE t.kind = 'transfer_out'), MIN(t.doc_date)) BETWEEN ${q.from}::date AND ${q.to}::date
         ORDER BY COALESCE(MIN(t.doc_date) FILTER (WHERE t.kind = 'transfer_out'), MIN(t.doc_date)), 3, t.sku`.execute(db);
      const codes = q.branchCodes ? new Set(q.branchCodes) : null;
      const rows = res.rows
        .map((x) => {
          const outQty = toNumber(x.out_qty), inQty = toNumber(x.in_qty);
          return {
            eventId: x.event_id, docNo: x.in_doc_no && x.in_doc_no !== x.doc_no ? (x.out_date ? `${x.doc_no} → ${x.in_doc_no}` : x.in_doc_no) : x.doc_no, docKey: x.doc_key, outDate: x.out_date, inDate: x.in_date, fromBranch: x.from_code ?? '', toBranch: x.to_code ?? '',
            sku: x.sku, name: x.name, unit: x.unit, outQty, outValue: toNumber(x.out_value), inQty, pendingQty: x.out_date === null ? 0 : outQty - inQty,
            // Chỉ có phiếu nhận (phiếu xuất của shop gửi chưa vào sổ / chưa kéo): coi như đã nhận, phần xuất để trống.
            status: x.out_date === null ? 'received' : inQty >= outQty && outQty > 0 ? 'received' : inQty > 0 ? 'partial' : 'pending', uncosted: Number(x.uncosted),
          };
        })
        .filter((x) => !codes || codes.has(x.fromBranch) || codes.has(x.toBranch))
        .filter((x) => q.status === 'all' || (q.status === 'received' ? x.status === 'received' : x.status !== 'received'));
      return ok({
        rows,
        totals: { outValue: rows.reduce((t, x) => t + x.outValue, 0), pendingLines: rows.filter((x) => x.status !== 'received').length },
        uncosted: rows.reduce((t, x) => t + x.uncosted, 0),
      });
    },
  });
}
