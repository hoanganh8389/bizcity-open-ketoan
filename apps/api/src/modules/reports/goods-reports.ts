/**
 * Báo cáo hàng hoá, lãi lỗ theo cửa hàng.
 *   GET /api/v1/reports/gross-profit?from=&to=&groupBy=&branchCodes=&kind=&scope=   lãi gộp (BH04)
 *       doanh thu thuần (tiền hàng sau chiết khấu, trừ hàng trả lại) − giá vốn, theo mặt hàng, nhóm / loại / nhãn / ngành hàng,
 *       cửa hàng, bộ phận, khách, nhóm khách, tháng. Giá vốn dòng bán: giá vốn gửi kèm chứng từ, không có thì số lượng ×
 *       đơn giá vốn bình quân tháng (như nhập xuất tồn); tháng chưa tính giá vốn báo số dòng "chưa có giá vốn".
 *   GET /api/v1/reports/stock-transfers?from=&to=&branchCodes=&status=   bảng kê chuyển kho (HH01)
 *       mỗi phiếu × mặt hàng: chi nhánh xuất → nhận, số lượng, giá trị xuất, đã nhận, còn trên đường.
 *   GET /api/v1/reports/profit-by-department?from=&to=&by=department|branch   kết quả kinh doanh theo cửa hàng (KQ01)
 *       từ sổ cái (không tính bút toán kết chuyển): doanh thu, giảm trừ, giá vốn, lãi gộp, doanh thu / chi phí tài chính,
 *       chi phí bán hàng, quản lý, thu nhập / chi phí khác, lợi nhuận trước thuế.
 */
import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { sql } from 'kysely';
import { fromCents, toCents } from '@ketoan/contracts';
import { db, toNumber } from '../../db/client.js';
import { authOf, requirePermission } from '../../core/auth.js';
import { ok } from '../../core/http.js';
import { FROM, GROUP_SQL, SALES_GROUPS, where } from '../sales/sales-report.repository.js';
import { toFilter } from '../sales/sales-report.service.js';
import { valuedMovements } from '../inventory/inventory-report.service.js';

const tags = ['Báo cáo hàng hoá'];
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Ngày dạng YYYY-MM-DD');
const branchCodes = z.string().optional().transform((s) => (s ? s.split(',').map((x) => x.trim()).filter(Boolean) : undefined));
const c = (v: unknown) => toCents(toNumber(v as string));

/** Các dòng của báo cáo kết quả kinh doanh theo cửa hàng: đầu tài khoản và chiều số (Có − Nợ hay Nợ − Có). */
const PNL = [
  { key: 'revenue', prefix: '511', credit: true },
  { key: 'deductions', prefix: '521', credit: false },
  { key: 'cogs', prefix: '632', credit: false },
  { key: 'finIncome', prefix: '515', credit: true },
  { key: 'finExpense', prefix: '635', credit: false },
  { key: 'selling', prefix: '641', credit: false },
  { key: 'admin', prefix: '642', credit: false },
  { key: 'otherIncome', prefix: '711', credit: true },
  { key: 'otherExpense', prefix: '811', credit: false },
] as const;

export async function goodsReportRoutes(app: FastifyInstance): Promise<void> {
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

  r.get('/api/v1/reports/profit-by-department', {
    preHandler: pre,
    schema: {
      tags, summary: 'Kết quả kinh doanh theo cửa hàng (bộ phận) hoặc chi nhánh',
      querystring: z.object({ from: date, to: date, by: z.enum(['department', 'branch']).default('department'), branchCodes }),
    },
    handler: async (req) => {
      const { tenantId } = authOf(req);
      const q = req.query;
      const keyExpr = q.by === 'department' ? sql`COALESCE(l.dims->>'department', '')` : sql`br.code`;
      const res = await sql<{ key: string; prefix: string; debit: string; credit: string }>`
        SELECT ${keyExpr} AS key, left(l.account_code, 3) AS prefix, SUM(l.debit) AS debit, SUM(l.credit) AS credit
          FROM ledger_lines l
          JOIN ledger_entries e ON e.id = l.entry_id
          JOIN branches br ON br.id = l.branch_id
         WHERE l.tenant_id = ${tenantId} AND e.doc_type <> 'closing'
           AND l.posting_date BETWEEN ${q.from}::date AND ${q.to}::date
           AND left(l.account_code, 3) IN ('511', '521', '632', '515', '635', '641', '642', '711', '811')
           ${q.branchCodes ? sql`AND br.code = ANY(${q.branchCodes}::text[])` : sql``}
         GROUP BY 1, 2`.execute(db);
      const names = q.by === 'department'
        ? new Map((await db.selectFrom('dimensions').select(['code', 'name']).where('tenant_id', '=', tenantId).where('kind', '=', 'department').execute()).map((d) => [d.code, d.name]))
        : new Map((await db.selectFrom('branches').select(['code', 'name']).where('tenant_id', '=', tenantId).execute()).map((b) => [b.code, b.name]));
      type Row = Record<(typeof PNL)[number]['key'], number>;
      const by = new Map<string, Row>();
      for (const x of res.rows) {
        const line = PNL.find((p) => p.prefix === x.prefix);
        if (!line) continue;
        let row = by.get(x.key);
        if (!row) { row = Object.fromEntries(PNL.map((p) => [p.key, 0])) as Row; by.set(x.key, row); }
        row[line.key] += line.credit ? c(x.credit) - c(x.debit) : c(x.debit) - c(x.credit);
      }
      const derive = (v: Row) => {
        const netRevenue = v.revenue - v.deductions;
        const gross = netRevenue - v.cogs;
        const operating = gross + v.finIncome - v.finExpense - v.selling - v.admin;
        const other = v.otherIncome - v.otherExpense;
        const out: Record<string, number> = {};
        for (const p of PNL) out[p.key] = fromCents(v[p.key]);
        return { ...out, netRevenue: fromCents(netRevenue), gross: fromCents(gross), operating: fromCents(operating), other: fromCents(other), profit: fromCents(operating + other), margin: netRevenue ? Math.round((gross / netRevenue) * 1000) / 10 : null };
      };
      const total = Object.fromEntries(PNL.map((p) => [p.key, 0])) as Row;
      const rows = [...by.entries()].sort(([a], [b]) => (a === '' ? 1 : b === '' ? -1 : a.localeCompare(b))).map(([key, v]) => {
        for (const p of PNL) total[p.key] += v[p.key];
        return { key, name: key ? names.get(key) ?? '' : q.by === 'department' ? '(chưa gắn bộ phận)' : '', ...derive(v) };
      });
      return ok({ rows, totals: derive(total) });
    },
  });
}
