// @bizcity-layer D modules/ke-toan
// [2026-10-31 08:24 PM Johnny Chu - Chu Hoàng Anh] PHASE-012 — ledger.query (PHASES 3.7): đọc sổ qua khung nhìn bizcity_read.* thay bảng ledger_* (SC-KERNEL-7)
// [2026-10-31 10:20 PM Johnny Chu - Chu Hoàng Anh] PHASE-012 — chỉ còn kết quả kinh doanh theo cửa hàng (đọc sổ); lãi gộp → phan-he/ban-hang/gross-profit.ts, chuyển kho → phan-he/kho/stock-transfers.ts
/**
 * GET /api/v1/reports/profit-by-department?from=&to=&by=department|branch   kết quả kinh doanh theo cửa hàng (KQ01)
 *     từ sổ cái (không tính bút toán kết chuyển): doanh thu, giảm trừ, giá vốn, lãi gộp, doanh thu / chi phí tài chính,
 *     chi phí bán hàng, quản lý, thu nhập / chi phí khác, lợi nhuận trước thuế.
 * Lắp ở GOODS (phan-he/loi.ts) cho kho, mua-hang — như trước khi tách.
 */
import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { sql } from 'kysely';
import { fromCents, toCents } from '@ketoan/contracts';
import { db, toNumber } from '../../../db/client.js';
import { authOf, requirePermission } from '../../../core/auth.js';
import { ok } from '../../../core/http.js';


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

export async function departmentReportRoutes(app: FastifyInstance): Promise<void> {
  const r = app.withTypeProvider<ZodTypeProvider>();
  const pre = requirePermission('reports:read');

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
          FROM bizcity_read.ledger_lines l
          JOIN bizcity_read.ledger_entries e ON e.id = l.entry_id
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
