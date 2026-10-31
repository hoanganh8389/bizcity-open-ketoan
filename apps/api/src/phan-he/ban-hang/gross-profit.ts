// @bizcity-layer D modules/ban-hang
// [2026-10-31 10:20 PM Johnny Chu - Chu Hoàng Anh] PHASE-012 — tách từ báo cáo hàng hoá (modules/reports/goods-reports.ts) về ban-hang: lãi gộp dựa trên dòng bán (SC-LAYER-2)
/**
 * GET /api/v1/reports/gross-profit?from=&to=&groupBy=&branchCodes=&kind=&scope=   lãi gộp (BH04)
 *     doanh thu thuần (tiền hàng sau chiết khấu, trừ hàng trả lại) − giá vốn, theo mặt hàng, nhóm / loại / nhãn / ngành hàng,
 *     cửa hàng, bộ phận, khách, nhóm khách, tháng. Giá vốn dòng bán: giá vốn gửi kèm chứng từ, không có thì số lượng ×
 *     đơn giá vốn bình quân tháng (như nhập xuất tồn); tháng chưa tính giá vốn báo số dòng "chưa có giá vốn".
 * Lắp ở GOODS (phan-he/loi.ts) cho kho, mua-hang — như trước khi tách.
 */
import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { sql } from 'kysely';
import { fromCents, toCents } from '@ketoan/contracts';
import { db, toNumber } from '../../db/client.js';
import { authOf, requirePermission } from '../../core/auth.js';
import { ok } from '../../core/http.js';
import { FROM, GROUP_SQL, SALES_GROUPS, where } from '../../modules/sales/sales-report.repository.js';
import { toFilter } from '../../modules/sales/sales-report.service.js';

const tags = ['Báo cáo hàng hoá'];
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Ngày dạng YYYY-MM-DD');
const branchCodes = z.string().optional().transform((s) => (s ? s.split(',').map((x) => x.trim()).filter(Boolean) : undefined));
const c = (v: unknown) => toCents(toNumber(v as string));

export async function grossProfitRoutes(app: FastifyInstance): Promise<void> {
  const r = app.withTypeProvider<ZodTypeProvider>();
  const pre = requirePermission('reports:read');

  r.get('/api/v1/reports/gross-profit', {
    preHandler: pre,
    schema: {
      tags, summary: 'Lãi gộp theo mặt hàng, nhóm hàng, cửa hàng, khách',
      querystring: z.object({ from: date, to: date, branchCodes, groupBy: z.enum(SALES_GROUPS).default('product'), kind: z.enum(['all', 'sale', 'return']).default('all'), scope: z.enum(['all', 'invoiced', 'internal']).default('all'), search: z.string().trim().max(100).optional() }),
    },
    handler: async (req) => {
      const auth = authOf(req);
      const q = req.query;
      const f = await toFilter(auth, q);
      const g = GROUP_SQL[q.groupBy];
      const res = await sql<{ key: string; label: string; extra: string; qty: string; revenue: string; cost: string; gift_cost: string; uncosted: string; lines: string }>`
        SELECT ${g.key} AS key, ${g.label} AS label, ${g.extra} AS extra,
               COALESCE(SUM(l.qty * l.sign), 0) AS qty,
               COALESCE(SUM(l.amount_before_tax * l.sign), 0) AS revenue,
               COALESCE(SUM(COALESCE(l.cost, ROUND(l.qty * ic2.unit_cost)) * l.sign), 0) AS cost,
               COALESCE(SUM(COALESCE(l.cost, ROUND(l.qty * ic2.unit_cost)) * l.sign) FILTER (WHERE l.is_gift), 0) AS gift_cost,
               COUNT(*) FILTER (WHERE l.cost IS NULL AND ic2.unit_cost IS NULL AND l.qty <> 0) AS uncosted,
               COUNT(*) AS lines
          ${FROM}
          LEFT JOIN inventory_costs ic2
            ON ic2.tenant_id = l.tenant_id AND ic2.sku = l.sku
           AND ic2.year = EXTRACT(YEAR FROM l.doc_date)::int AND ic2.month = EXTRACT(MONTH FROM l.doc_date)::int
           AND ic2.cost_group = COALESCE(br.accounting_unit_id, 0)
          ${g.join ?? sql``}
         WHERE ${where(f)}
         GROUP BY 1
         ORDER BY 1`.execute(db);
      const tot = { qty: 0, revenue: 0, cost: 0, giftCost: 0, uncosted: 0 };
      const rows = res.rows.map((x) => {
        const revenue = c(x.revenue), cost = c(x.cost), gross = revenue - cost;
        tot.qty += toNumber(x.qty); tot.revenue += revenue; tot.cost += cost; tot.giftCost += c(x.gift_cost); tot.uncosted += Number(x.uncosted);
        return {
          key: x.key, label: x.label, extra: x.extra, qty: toNumber(x.qty), revenue: fromCents(revenue), cost: fromCents(cost), giftCost: fromCents(c(x.gift_cost)),
          gross: fromCents(gross), margin: revenue ? Math.round((gross / revenue) * 1000) / 10 : null, uncosted: Number(x.uncosted),
        };
      });
      const gross = tot.revenue - tot.cost;
      return ok({
        rows,
        totals: { qty: tot.qty, revenue: fromCents(tot.revenue), cost: fromCents(tot.cost), giftCost: fromCents(tot.giftCost), gross: fromCents(gross), margin: tot.revenue ? Math.round((gross / tot.revenue) * 1000) / 10 : null },
        uncosted: tot.uncosted,
      });
    },
  });
}
