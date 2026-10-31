// @bizcity-layer D modules/ke-toan
// [2026-10-31 08:24 PM Johnny Chu - Chu Hoàng Anh] PHASE-012 — ledger.query (PHASES 3.7): đọc sổ qua khung nhìn bizcity_read.* thay bảng ledger_* (SC-KERNEL-7)
/**
 * Báo cáo theo khoản mục, bộ phận, nhân viên, hợp đồng (Đợt 5.4).
 *   GET /api/v1/reports/expense-detail            ACC47 Chi tiết chi phí theo khoản mục, bộ phận: từng dòng sổ của TK chi phí
 *   GET /api/v1/reports/dimension-summary         ACC69 Tổng hợp phát sinh theo nhân viên / hợp đồng / bộ phận × tài khoản
 *   GET /api/v1/reports/cash-payments-by-item     ACC75 Nhật ký chi tiền theo khoản mục: mỗi lần chi tiền một dòng, chia cột theo khoản mục
 *   GET /api/v1/reports/expense-item-branch       ACC90 Tổng hợp chi phí theo tài khoản × khoản mục, mỗi chi nhánh một cột
 * Không tính bút toán kết chuyển. Khoản mục có cha: ACC75 gom về khoản mục gốc (cấp trên cùng) như cách kế toán đang dùng.
 */
import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { sql } from 'kysely';
import { fromCents, toCents } from '@ketoan/contracts';
import { db, toNumber } from '../../../db/client.js';
import { authOf, requirePermission } from '../../../core/auth.js';
import { ok } from '../../../core/http.js';
import { resolveScope } from './report.service.js';

const tags = ['Báo cáo'];
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const list = z.string().optional().transform((s) => (s ? s.split(',').map((x) => x.trim()).filter(Boolean) : undefined));
const base = z.object({ from: date, to: date, branchCodes: list });
const CASH = sql`(l.account_code LIKE '111%' OR l.account_code LIKE '112%' OR l.account_code LIKE '113%')`;

async function dimNames(tenantId: string, kind: string) {
  const rows = await db.selectFrom('dimensions').select(['code', 'name', 'parent_code']).where('tenant_id', '=', tenantId).where('kind', '=', kind).execute();
  return new Map(rows.map((r) => [r.code, r]));
}

export async function dimensionReportRoutes(app: FastifyInstance): Promise<void> {
  const r = app.withTypeProvider<ZodTypeProvider>();
  const pre = requirePermission('reports:read');

  r.get('/api/v1/reports/expense-detail', {
    preHandler: pre,
    schema: {
      tags, summary: 'Chi tiết chi phí theo khoản mục, bộ phận (ACC47)',
      querystring: base.extend({ account: z.string().trim().default('6'), costItems: list, departments: list }),
    },
    handler: async (req) => {
      const auth = authOf(req);
      const q = req.query;
      const { branchIds } = await resolveScope(auth, q.branchCodes);
      const res = await sql<{ posting_date: string; doc_no: string; invoice_no: string | null; event_id: string | null; account_code: string; counter: string | null; description: string; entry_description: string; debit: string; credit: string; branch_code: string; cost_item: string | null; department: string | null; employee: string | null; contract: string | null }>`
        SELECT l.posting_date::text, e.doc_no, e.invoice_no, e.event_id, l.account_code,
               (SELECT string_agg(DISTINCT o.account_code, ', ') FROM bizcity_read.ledger_lines o WHERE o.entry_id = l.entry_id AND o.pair_no = l.pair_no AND o.id <> l.id AND (o.debit > 0) <> (l.debit > 0)) AS counter,
               l.description, e.description AS entry_description, l.debit, l.credit, b.code AS branch_code,
               l.dims->>'costItem' AS cost_item, l.dims->>'department' AS department, l.dims->>'employee' AS employee, l.dims->>'contract' AS contract
          FROM bizcity_read.ledger_lines l JOIN bizcity_read.ledger_entries e ON e.id = l.entry_id JOIN branches b ON b.id = l.branch_id
         WHERE l.tenant_id = ${auth.tenantId} AND l.posting_date BETWEEN ${q.from}::date AND ${q.to}::date
           AND l.account_code LIKE ${q.account + '%'} AND e.doc_type <> 'closing'
           ${branchIds ? sql`AND l.branch_id = ANY(${branchIds}::bigint[])` : sql``}
           ${q.costItems?.length ? sql`AND l.dims->>'costItem' = ANY(${q.costItems}::text[])` : sql``}
           ${q.departments?.length ? sql`AND l.dims->>'department' = ANY(${q.departments}::text[])` : sql``}
         ORDER BY l.posting_date, e.doc_no, l.line_no`.execute(db);
      const [items, depts, emps] = await Promise.all([dimNames(auth.tenantId, 'cost_item'), dimNames(auth.tenantId, 'department'), dimNames(auth.tenantId, 'employee')]);
      return ok(res.rows.map((x) => ({
        date: x.posting_date, docNo: x.doc_no, invoiceNo: x.invoice_no ?? '', eventId: x.event_id, accountCode: x.account_code, counterAccounts: x.counter ?? '',
        description: x.description || x.entry_description, debit: toNumber(x.debit), credit: toNumber(x.credit), branchCode: x.branch_code,
        costItemCode: x.cost_item ?? '', costItemName: x.cost_item ? items.get(x.cost_item)?.name ?? '' : '',
        departmentCode: x.department ?? '', departmentName: x.department ? depts.get(x.department)?.name ?? '' : '',
        employeeCode: x.employee ?? '', employeeName: x.employee ? emps.get(x.employee)?.name ?? '' : '', contractCode: x.contract ?? '',
      })));
    },
  });

  r.get('/api/v1/reports/dimension-summary', {
    preHandler: pre,
    schema: {
      tags, summary: 'Tổng hợp phát sinh theo nhân viên, hợp đồng, bộ phận (ACC69)',
      querystring: base.extend({ dimension: z.enum(['employee', 'contract', 'department', 'costItem']).default('department'), account: z.string().trim().default('') }),
    },
    handler: async (req) => {
      const auth = authOf(req);
      const q = req.query;
      const { branchIds } = await resolveScope(auth, q.branchCodes);
      const res = await sql<{ code: string; account_code: string; debit: string; credit: string }>`
        SELECT l.dims->>${q.dimension} AS code, l.account_code, SUM(l.debit) AS debit, SUM(l.credit) AS credit
          FROM bizcity_read.ledger_lines l JOIN bizcity_read.ledger_entries e ON e.id = l.entry_id
         WHERE l.tenant_id = ${auth.tenantId} AND l.posting_date BETWEEN ${q.from}::date AND ${q.to}::date
           AND COALESCE(l.dims->>${q.dimension}, '') <> '' AND e.doc_type <> 'closing'
           ${q.account ? sql`AND l.account_code LIKE ${q.account + '%'}` : sql``}
           ${branchIds ? sql`AND l.branch_id = ANY(${branchIds}::bigint[])` : sql``}
         GROUP BY 1, 2 ORDER BY 1, 2`.execute(db);
      const kind = { employee: 'employee', contract: 'contract', department: 'department', costItem: 'cost_item' }[q.dimension];
      const names = await dimNames(auth.tenantId, kind);
      const accounts = new Map((await db.selectFrom('accounts').select(['code', 'name']).where('tenant_id', '=', auth.tenantId).execute()).map((a) => [a.code, a.name]));
      return ok(res.rows.map((x) => ({
        code: x.code, name: names.get(x.code)?.name ?? '', accountCode: x.account_code, accountName: accounts.get(x.account_code) ?? '',
        debit: toNumber(x.debit), credit: toNumber(x.credit), net: fromCents(toCents(toNumber(x.debit)) - toCents(toNumber(x.credit))),
      })));
    },
  });

  r.get('/api/v1/reports/cash-payments-by-item', {
    preHandler: pre,
    schema: {
      tags, summary: 'Sổ nhật ký chi tiền theo khoản mục (ACC75)',
      querystring: base.extend({ account: z.string().trim().default('').describe('Tài khoản tiền (111, 1121…); trống = mọi TK 111, 112, 113') }),
    },
    handler: async (req) => {
      const auth = authOf(req);
      const q = req.query;
      const { branchIds } = await resolveScope(auth, q.branchCodes);
      // Mỗi dòng Có tài khoản tiền: tách theo các dòng Nợ cùng cặp (một Có nhiều Nợ thì lấy số của từng dòng Nợ).
      const res = await sql<{ entry_id: string; posting_date: string; doc_no: string; event_id: string | null; description: string; branch_code: string; partner_name: string | null; cash_account: string; debit_account: string; cost_item: string | null; amount: string }>`
        SELECT l.entry_id, l.posting_date::text, e.doc_no, e.event_id, COALESCE(NULLIF(d.description, ''), e.description) AS description, b.code AS branch_code, p.name AS partner_name,
               l.account_code AS cash_account, d.account_code AS debit_account, d.dims->>'costItem' AS cost_item,
               CASE WHEN (SELECT COUNT(*) FROM bizcity_read.ledger_lines x WHERE x.entry_id = l.entry_id AND x.pair_no = l.pair_no AND x.debit > 0) = 1 THEN l.credit ELSE d.debit END AS amount
          FROM bizcity_read.ledger_lines l
          JOIN bizcity_read.ledger_entries e ON e.id = l.entry_id
          JOIN bizcity_read.ledger_lines d ON d.entry_id = l.entry_id AND d.pair_no = l.pair_no AND d.debit > 0
          JOIN branches b ON b.id = l.branch_id
          LEFT JOIN partners p ON p.id = COALESCE(d.partner_id, e.partner_id)
         WHERE l.tenant_id = ${auth.tenantId} AND l.credit > 0 AND ${CASH}
           AND l.posting_date BETWEEN ${q.from}::date AND ${q.to}::date AND e.doc_type NOT IN ('cash_transfer', 'closing')
           ${q.account ? sql`AND l.account_code LIKE ${q.account + '%'}` : sql``}
           ${branchIds ? sql`AND l.branch_id = ANY(${branchIds}::bigint[])` : sql``}
         ORDER BY l.posting_date, e.doc_no, l.line_no`.execute(db);
      const items = await dimNames(auth.tenantId, 'cost_item');
      const root = (code: string) => { let c = code; for (let i = 0; i < 10; i++) { const p = items.get(c)?.parent_code; if (!p || !items.has(p)) break; c = p; } return c; };
      const columns = new Map<string, string>();
      const rows = new Map<string, { entryId: string; date: string; docNo: string; eventId: string | null; branchCode: string; partnerName: string; description: string; cashAccount: string; total: number; byItem: Record<string, number>; otherAccounts: Set<string> }>();
      for (const x of res.rows) {
        const key = `${x.entry_id}|${x.cash_account}`;
        let v = rows.get(key);
        if (!v) { v = { entryId: x.entry_id, date: x.posting_date, docNo: x.doc_no, eventId: x.event_id, branchCode: x.branch_code, partnerName: x.partner_name ?? '', description: x.description, cashAccount: x.cash_account, total: 0, byItem: {}, otherAccounts: new Set() }; rows.set(key, v); }
        const amt = toNumber(x.amount);
        v.total += amt;
        const col = x.cost_item ? root(x.cost_item) : '';
        if (col) columns.set(col, items.get(col)?.name ?? col);
        else v.otherAccounts.add(x.debit_account);
        v.byItem[col] = (v.byItem[col] ?? 0) + amt;
      }
      return ok({
        columns: [...columns.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([code, name]) => ({ code, name })),
        rows: [...rows.values()].map(({ otherAccounts, ...v }) => ({ ...v, other: v.byItem[''] ?? 0, otherAccounts: [...otherAccounts].sort().join(', ') })),
      });
    },
  });

  r.get('/api/v1/reports/expense-item-branch', {
    preHandler: pre,
    schema: {
      tags, summary: 'Tổng hợp chi phí theo tài khoản, khoản mục và chi nhánh (ACC90)',
      querystring: base.extend({ account: z.string().trim().default('64'), byDepartment: z.union([z.boolean(), z.enum(['true', 'false'])]).transform((v) => v === true || v === 'true').default(false) }),
    },
    handler: async (req) => {
      const auth = authOf(req);
      const q = req.query;
      const { branchIds } = await resolveScope(auth, q.branchCodes);
      const res = await sql<{ account_code: string; cost_item: string; department: string; branch_code: string; amount: string }>`
        SELECT l.account_code, COALESCE(l.dims->>'costItem', '') AS cost_item, ${q.byDepartment ? sql`COALESCE(l.dims->>'department', '')` : sql`''`} AS department,
               b.code AS branch_code, SUM(l.debit - l.credit) AS amount
          FROM bizcity_read.ledger_lines l JOIN bizcity_read.ledger_entries e ON e.id = l.entry_id JOIN branches b ON b.id = l.branch_id
         WHERE l.tenant_id = ${auth.tenantId} AND l.posting_date BETWEEN ${q.from}::date AND ${q.to}::date
           AND l.account_code LIKE ${q.account + '%'} AND e.doc_type <> 'closing'
           ${branchIds ? sql`AND l.branch_id = ANY(${branchIds}::bigint[])` : sql``}
         GROUP BY 1, 2, 3, 4`.execute(db);
      const [items, depts] = await Promise.all([dimNames(auth.tenantId, 'cost_item'), dimNames(auth.tenantId, 'department')]);
      const accounts = new Map((await db.selectFrom('accounts').select(['code', 'name']).where('tenant_id', '=', auth.tenantId).execute()).map((a) => [a.code, a.name]));
      const branches = [...new Set(res.rows.map((x) => x.branch_code))].sort();
      const rows = new Map<string, { accountCode: string; accountName: string; costItemCode: string; costItemName: string; departmentCode: string; departmentName: string; byBranch: Record<string, number>; total: number }>();
      for (const x of res.rows) {
        const k = `${x.account_code}|${x.cost_item}|${x.department}`;
        let v = rows.get(k);
        if (!v) {
          v = { accountCode: x.account_code, accountName: accounts.get(x.account_code) ?? '', costItemCode: x.cost_item, costItemName: x.cost_item ? items.get(x.cost_item)?.name ?? '' : '(chưa gắn khoản mục)', departmentCode: x.department, departmentName: x.department ? depts.get(x.department)?.name ?? '' : '', byBranch: {}, total: 0 };
          rows.set(k, v);
        }
        const amt = toNumber(x.amount);
        v.byBranch[x.branch_code] = (v.byBranch[x.branch_code] ?? 0) + amt;
        v.total += amt;
      }
      return ok({ branches, rows: [...rows.values()].filter((v) => v.total !== 0 || Object.values(v.byBranch).some((n) => n !== 0)).sort((a, b) => a.accountCode.localeCompare(b.accountCode) || a.costItemCode.localeCompare(b.costItemCode) || a.departmentCode.localeCompare(b.departmentCode)) });
    },
  });
}
