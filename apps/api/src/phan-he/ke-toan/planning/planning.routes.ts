// @bizcity-layer D modules/ke-toan
// [2026-10-31 08:24 PM Johnny Chu - Chu Hoàng Anh] PHASE-012 — ledger.query (PHASES 3.7): đọc sổ qua khung nhìn bizcity_read.* thay bảng ledger_* (SC-KERNEL-7)
/**
 * Kế hoạch tài chính (KT-30), định mức chi phí (KT-32), cảnh báo (KT-31).
 *
 *   GET    /api/v1/cash-plans?from=YYYY-MM&to=YYYY-MM          dòng kế hoạch thu / chi
 *   POST   /api/v1/cash-plans                                  thêm dòng (nhập tay)
 *   PATCH  /api/v1/cash-plans/:id                              sửa dòng
 *   DELETE /api/v1/cash-plans/:id
 *   POST   /api/v1/cash-plans/fill { period }                  điền từ khoản công nợ đến hạn trong tháng (phải thu → thu,
 *                                                              phải trả → chi; theo số còn nợ) và lịch thanh toán hợp đồng chưa trả
 *   GET    /api/v1/reports/cash-plan-vs-actual?from=&to=  kế hoạch so thực hiện theo tháng × chi nhánh × thu / chi
 *                                                              (thực hiện = tiền vào / ra TK 111, 112, 113, trừ chuyển tiền nội bộ)
 *   GET    /api/v1/cost-norms?period=YYYY-MM                   định mức chi phí
 *   PUT    /api/v1/cost-norms { period, items }                ghi hàng loạt (số tiền 0 = bỏ định mức)
 *   POST   /api/v1/cost-norms/copy { from, to[] }              chép định mức một tháng sang các tháng khác
 *   GET    /api/v1/reports/cost-vs-norm?from=&to=&account=  chi phí thực tế so định mức theo chi nhánh × bộ phận × khoản mục
 *   GET    /api/v1/alerts                                      cảnh báo ở Tổng quan
 */
import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { sql } from 'kysely';
import { fromCents, toCents } from '@ketoan/contracts';
import { db, toNumber, type Db } from '../../../db/client.js';
import { authOf, requirePermission } from '../../../core/auth.js';
import { ok, idParamSchema } from '../../../core/http.js';
import { Errors } from '../../../core/errors.js';
import { writeAudit } from '../../../core/audit.js';

const tags = ['Kế hoạch tài chính'];
const month = z.string().regex(/^\d{4}-\d{2}$/, 'Tháng dạng YYYY-MM');
const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const lastDay = (p: string) => new Date(Date.UTC(Number(p.slice(0, 4)), Number(p.slice(5, 7)), 0)).toISOString().slice(0, 10);
const todayVN = () => new Date(Date.now() + 7 * 3600_000).toISOString().slice(0, 10);
const addDays = (d: string, n: number) => new Date(Date.parse(`${d}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);

const planInput = z.object({
  period: month,
  branchCode: z.string().trim().nullable().default(null),
  direction: z.enum(['in', 'out']),
  costItemCode: z.string().trim().nullable().default(null),
  partnerCode: z.string().trim().nullable().default(null),
  dueDate: day.nullable().default(null),
  description: z.string().trim().max(500).default(''),
  amount: z.number().finite().min(0),
});

async function branchIdOf(trx: Db, tenantId: string, code: string | null | undefined) {
  if (!code) return null;
  const b = await trx.selectFrom('branches').select('id').where('tenant_id', '=', tenantId).where('code', '=', code).executeTakeFirst();
  if (!b) throw Errors.validation(`Chi nhánh ${code} không có`);
  return b.id;
}
async function partnerIdOf(trx: Db, tenantId: string, code: string | null | undefined) {
  if (!code) return null;
  const p = await trx.selectFrom('partners').select('id').where('tenant_id', '=', tenantId).where('code', '=', code).executeTakeFirst();
  if (!p) throw Errors.validation(`Đối tượng ${code} không có`);
  return p.id;
}

export async function planningRoutes(app: FastifyInstance): Promise<void> {
  const r = app.withTypeProvider<ZodTypeProvider>();

  /* ------------------------------------------------------------------ kế hoạch thu chi */
  r.get('/api/v1/cash-plans', {
    preHandler: requirePermission('reports:read'),
    schema: { tags, summary: 'Dòng kế hoạch thu / chi', querystring: z.object({ from: month, to: month }) },
    handler: async (req) => {
      const { tenantId } = authOf(req);
      const rows = await db.selectFrom('cash_plans as c').leftJoin('branches as b', 'b.id', 'c.branch_id').leftJoin('partners as p', 'p.id', 'c.partner_id')
        .select(['c.id', 'c.period', 'b.code as branch_code', 'c.direction', 'c.cost_item_code', 'p.code as partner_code', 'p.name as partner_name', 'c.due_date', 'c.description', 'c.amount', 'c.source', 'c.updated_by', 'c.updated_at'])
        .where('c.tenant_id', '=', tenantId).where('c.period', '>=', req.query.from).where('c.period', '<=', req.query.to)
        .orderBy('c.period').orderBy('c.direction').orderBy('c.due_date').orderBy('c.id').execute();
      return ok(rows.map((x) => ({
        id: x.id, period: x.period, branchCode: x.branch_code, direction: x.direction, costItemCode: x.cost_item_code, partnerCode: x.partner_code, partnerName: x.partner_name,
        dueDate: x.due_date, description: x.description, amount: toNumber(x.amount), source: x.source, updatedBy: x.updated_by, updatedAt: x.updated_at,
      })));
    },
  });

  r.post('/api/v1/cash-plans', {
    preHandler: requirePermission('documents:write'),
    schema: { tags, summary: 'Thêm dòng kế hoạch thu / chi', body: planInput },
    handler: async (req, reply) => {
      const auth = authOf(req);
      const b = req.body;
      const row = await db.transaction().execute(async (trx) => trx.insertInto('cash_plans').values({
        tenant_id: auth.tenantId, period: b.period, branch_id: await branchIdOf(trx, auth.tenantId, b.branchCode), direction: b.direction,
        cost_item_code: b.costItemCode || null, partner_id: await partnerIdOf(trx, auth.tenantId, b.partnerCode), due_date: b.dueDate, description: b.description,
        amount: b.amount, source: 'manual', updated_by: auth.actorName,
      }).returning('id').executeTakeFirstOrThrow());
      reply.code(201);
      return ok({ id: row.id });
    },
  });

  r.patch('/api/v1/cash-plans/:id', {
    preHandler: requirePermission('documents:write'),
    schema: { tags, summary: 'Sửa dòng kế hoạch thu / chi', params: idParamSchema, body: planInput },
    handler: async (req) => {
      const auth = authOf(req);
      const b = req.body;
      await db.transaction().execute(async (trx) => {
        const res = await trx.updateTable('cash_plans').set({
          period: b.period, branch_id: await branchIdOf(trx, auth.tenantId, b.branchCode), direction: b.direction, cost_item_code: b.costItemCode || null,
          partner_id: await partnerIdOf(trx, auth.tenantId, b.partnerCode), due_date: b.dueDate, description: b.description, amount: b.amount, updated_by: auth.actorName, updated_at: new Date(),
        }).where('tenant_id', '=', auth.tenantId).where('id', '=', req.params.id).executeTakeFirst();
        if (!Number(res.numUpdatedRows)) throw Errors.notFound('dòng kế hoạch');
      });
      return ok({ id: req.params.id });
    },
  });

  r.delete('/api/v1/cash-plans/:id', {
    preHandler: requirePermission('documents:write'),
    schema: { tags, summary: 'Xoá dòng kế hoạch thu / chi', params: idParamSchema },
    handler: async (req) => {
      const res = await db.deleteFrom('cash_plans').where('tenant_id', '=', authOf(req).tenantId).where('id', '=', req.params.id).executeTakeFirst();
      if (!Number(res.numDeletedRows)) throw Errors.notFound('dòng kế hoạch');
      return ok({ deleted: true });
    },
  });

  r.post('/api/v1/cash-plans/fill', {
    preHandler: requirePermission('documents:write'),
    schema: { tags, summary: 'Điền kế hoạch từ khoản công nợ đến hạn và lịch thanh toán hợp đồng', body: z.object({ period: month }) },
    handler: async (req) => {
      const auth = authOf(req);
      const p = req.body.period;
      const from = `${p}-01`;
      const to = lastDay(p);
      const res = await db.transaction().execute(async (trx) => {
        const debts = await sql<{ id: string; branch_id: string; partner_id: string; account_code: string; side: string; due_date: string; doc_no: string; remaining: string; name: string }>`
          SELECT d.id, d.branch_id, d.partner_id, d.account_code, d.side, d.due_date::text, d.doc_no, d.amount - d.settled_amount AS remaining, p.name
            FROM debt_items d JOIN partners p ON p.id = d.partner_id
           WHERE d.tenant_id = ${auth.tenantId} AND d.amount > d.settled_amount AND d.due_date BETWEEN ${from}::date AND ${to}::date
             AND ((d.side = 'debit' AND d.account_code LIKE '13%') OR (d.side = 'credit' AND d.account_code LIKE '33%'))`.execute(trx);
        const sched = await sql<{ id: string; contract_code: string; seq: number; due_date: string; amount: string; tax_amount: string; description: string; partner_code: string | null; contract_name: string | null }>`
          SELECT s.id, s.contract_code, s.seq, s.due_date::text, s.amount, s.tax_amount, s.description, d.extra->>'partnerCode' AS partner_code, d.name AS contract_name
            FROM contract_schedules s LEFT JOIN dimensions d ON d.tenant_id = s.tenant_id AND d.kind = 'contract' AND d.code = s.contract_code
           WHERE s.tenant_id = ${auth.tenantId} AND s.status = 'pending' AND s.due_date BETWEEN ${from}::date AND ${to}::date`.execute(trx);
        const partnerIds = new Map((await trx.selectFrom('partners').select(['id', 'code']).where('tenant_id', '=', auth.tenantId)
          .where('code', 'in', [...new Set(sched.rows.map((s) => s.partner_code).filter((x): x is string => Boolean(x))), '__none__']).execute()).map((x) => [x.code, x.id]));
        const rows = [
          ...debts.rows.map((d) => ({
            period: p, branch_id: d.branch_id, direction: d.side === 'debit' ? 'in' : 'out', cost_item_code: null, partner_id: d.partner_id, due_date: d.due_date,
            description: `${d.side === 'debit' ? 'Thu' : 'Trả'} ${d.name} — ${d.doc_no}`, amount: toNumber(d.remaining), source: 'debt', source_ref: `debt:${d.id}`,
          })),
          ...sched.rows.map((s) => ({
            period: p, branch_id: null, direction: 'out', cost_item_code: null, partner_id: (s.partner_code && partnerIds.get(s.partner_code)) || null, due_date: s.due_date,
            description: `Hợp đồng ${s.contract_code}${s.contract_name ? ` ${s.contract_name}` : ''} kỳ ${s.seq}${s.description ? ` — ${s.description}` : ''}`,
            amount: toNumber(s.amount) + toNumber(s.tax_amount), source: 'contract', source_ref: `contract:${s.id}`,
          })),
        ];
        // Dòng đã điền trước mà nay không còn (đã thanh toán hết, đổi hạn): bỏ.
        const keep = rows.map((x) => x.source_ref);
        const removed = await trx.deleteFrom('cash_plans').where('tenant_id', '=', auth.tenantId).where('period', '=', p).where('source', 'in', ['debt', 'contract'])
          .where('source_ref', 'not in', keep.length ? keep : ['__none__']).executeTakeFirst();
        for (const x of rows) {
          await trx.insertInto('cash_plans').values({ tenant_id: auth.tenantId, ...x, updated_by: auth.actorName })
            .onConflict((oc) => oc.columns(['tenant_id', 'source_ref']).where('source_ref', 'is not', null).doUpdateSet({
              period: x.period, branch_id: x.branch_id, direction: x.direction, partner_id: x.partner_id, due_date: x.due_date, description: x.description, amount: x.amount, updated_by: auth.actorName, updated_at: new Date(),
            })).execute();
        }
        await writeAudit(trx, { tenantId: auth.tenantId, actor: auth.actor, action: 'cash-plans.fill', objectType: 'cash_plan', objectId: p, after: { debts: debts.rows.length, contracts: sched.rows.length } });
        return { debts: debts.rows.length, contracts: sched.rows.length, removed: Number(removed.numDeletedRows) };
      });
      return ok(res);
    },
  });

  r.get('/api/v1/reports/cash-plan-vs-actual', {
    preHandler: requirePermission('reports:read'),
    schema: { tags, summary: 'Kế hoạch thu chi so với thực hiện', querystring: z.object({ from: month, to: month }) },
    handler: async (req) => {
      const { tenantId } = authOf(req);
      const q = req.query;
      const plan = await sql<{ period: string; branch: string; direction: string; amount: string }>`
        SELECT c.period, COALESCE(b.code, '') AS branch, c.direction, SUM(c.amount) AS amount
          FROM cash_plans c LEFT JOIN branches b ON b.id = c.branch_id
         WHERE c.tenant_id = ${tenantId} AND c.period BETWEEN ${q.from} AND ${q.to}
         GROUP BY 1, 2, 3`.execute(db);
      const actual = await sql<{ period: string; branch: string; inflow: string; outflow: string }>`
        SELECT to_char(l.posting_date, 'YYYY-MM') AS period, b.code AS branch, SUM(l.debit) AS inflow, SUM(l.credit) AS outflow
          FROM bizcity_read.ledger_lines l JOIN bizcity_read.ledger_entries e ON e.id = l.entry_id JOIN branches b ON b.id = l.branch_id
         WHERE l.tenant_id = ${tenantId} AND (l.account_code LIKE '111%' OR l.account_code LIKE '112%' OR l.account_code LIKE '113%')
           AND l.posting_date BETWEEN ${`${q.from}-01`}::date AND ${lastDay(q.to)}::date AND e.doc_type NOT IN ('cash_transfer', 'closing', 'opening')
         GROUP BY 1, 2`.execute(db);
      const key = (period: string, branch: string) => `${period}|${branch}`;
      const map = new Map<string, { period: string; branchCode: string; planIn: number; planOut: number; actualIn: number; actualOut: number }>();
      const get = (period: string, branch: string) => {
        const k = key(period, branch);
        let v = map.get(k);
        if (!v) { v = { period, branchCode: branch, planIn: 0, planOut: 0, actualIn: 0, actualOut: 0 }; map.set(k, v); }
        return v;
      };
      for (const x of plan.rows) { const v = get(x.period, x.branch); if (x.direction === 'in') v.planIn += toNumber(x.amount); else v.planOut += toNumber(x.amount); }
      for (const x of actual.rows) { const v = get(x.period, x.branch); v.actualIn += toNumber(x.inflow); v.actualOut += toNumber(x.outflow); }
      const rows = [...map.values()].sort((a, b) => a.period.localeCompare(b.period) || a.branchCode.localeCompare(b.branchCode)).map((v) => ({
        ...v, planNet: fromCents(toCents(v.planIn) - toCents(v.planOut)), actualNet: fromCents(toCents(v.actualIn) - toCents(v.actualOut)),
        diffIn: fromCents(toCents(v.actualIn) - toCents(v.planIn)), diffOut: fromCents(toCents(v.actualOut) - toCents(v.planOut)),
      }));
      return ok({ rows });
    },
  });

  /* ------------------------------------------------------------------ định mức chi phí */
  r.get('/api/v1/cost-norms', {
    preHandler: requirePermission('reports:read'),
    schema: { tags, summary: 'Định mức chi phí của một tháng', querystring: z.object({ period: month }) },
    handler: async (req) => {
      const rows = await db.selectFrom('cost_norms as n').leftJoin('branches as b', 'b.id', 'n.branch_id')
        .select(['n.id', 'n.period', 'b.code as branch_code', 'n.department_code', 'n.cost_item_code', 'n.amount', 'n.note', 'n.updated_by', 'n.updated_at'])
        .where('n.tenant_id', '=', authOf(req).tenantId).where('n.period', '=', req.query.period).orderBy('b.code').orderBy('n.department_code').orderBy('n.cost_item_code').execute();
      return ok(rows.map((x) => ({ id: x.id, period: x.period, branchCode: x.branch_code, departmentCode: x.department_code, costItemCode: x.cost_item_code, amount: toNumber(x.amount), note: x.note, updatedBy: x.updated_by, updatedAt: x.updated_at })));
    },
  });

  r.put('/api/v1/cost-norms', {
    preHandler: requirePermission('catalog:write'),
    schema: {
      tags, summary: 'Ghi định mức chi phí của một tháng (số tiền 0 = bỏ định mức)',
      body: z.object({ period: month, items: z.array(z.object({ branchCode: z.string().trim().nullable().default(null), departmentCode: z.string().trim().nullable().default(null), costItemCode: z.string().trim().min(1), amount: z.number().min(0), note: z.string().trim().max(500).default('') })).min(1).max(5000) }),
    },
    handler: async (req) => {
      const auth = authOf(req);
      const b = req.body;
      const res = await db.transaction().execute(async (trx) => {
        const items = await trx.selectFrom('dimensions').select('code').where('tenant_id', '=', auth.tenantId).where('kind', '=', 'cost_item').execute();
        const known = new Set(items.map((x) => x.code));
        const bad = [...new Set(b.items.map((x) => x.costItemCode).filter((c) => !known.has(c)))];
        if (bad.length) throw Errors.validation(`Khoản mục không có trong danh mục: ${bad.join(', ')}`);
        const deps = new Set((await trx.selectFrom('dimensions').select('code').where('tenant_id', '=', auth.tenantId).where('kind', '=', 'department').execute()).map((x) => x.code));
        const badDep = [...new Set(b.items.map((x) => x.departmentCode).filter((c): c is string => Boolean(c) && !deps.has(c!)))];
        if (badDep.length) throw Errors.validation(`Bộ phận không có trong danh mục: ${badDep.join(', ')}`);
        let saved = 0;
        let removed = 0;
        for (const x of b.items) {
          const bid = await branchIdOf(trx, auth.tenantId, x.branchCode);
          await trx.deleteFrom('cost_norms').where('tenant_id', '=', auth.tenantId).where('period', '=', b.period).where('cost_item_code', '=', x.costItemCode)
            .where(bid ? sql<boolean>`branch_id = ${bid}` : sql<boolean>`branch_id IS NULL`)
            .where(x.departmentCode ? sql<boolean>`department_code = ${x.departmentCode}` : sql<boolean>`department_code IS NULL`).execute();
          if (x.amount > 0) {
            await trx.insertInto('cost_norms').values({ tenant_id: auth.tenantId, period: b.period, branch_id: bid, department_code: x.departmentCode || null, cost_item_code: x.costItemCode, amount: x.amount, note: x.note, updated_by: auth.actorName }).execute();
            saved++;
          } else removed++;
        }
        await writeAudit(trx, { tenantId: auth.tenantId, actor: auth.actor, action: 'cost-norms.save', objectType: 'cost_norm', objectId: b.period, after: { saved, removed } });
        return { saved, removed };
      });
      return ok(res);
    },
  });

  r.post('/api/v1/cost-norms/copy', {
    preHandler: requirePermission('catalog:write'),
    schema: { tags, summary: 'Chép định mức một tháng sang các tháng khác (ghi đè)', body: z.object({ from: month, to: z.array(month).min(1).max(36) }) },
    handler: async (req) => {
      const auth = authOf(req);
      const b = req.body;
      const res = await db.transaction().execute(async (trx) => {
        const src = await trx.selectFrom('cost_norms').selectAll().where('tenant_id', '=', auth.tenantId).where('period', '=', b.from).execute();
        if (!src.length) throw Errors.validation(`Tháng ${b.from} chưa có định mức`);
        for (const t of b.to.filter((x) => x !== b.from)) {
          await trx.deleteFrom('cost_norms').where('tenant_id', '=', auth.tenantId).where('period', '=', t).execute();
          await trx.insertInto('cost_norms').values(src.map((x) => ({ tenant_id: auth.tenantId, period: t, branch_id: x.branch_id, department_code: x.department_code, cost_item_code: x.cost_item_code, amount: x.amount, note: x.note, updated_by: auth.actorName }))).execute();
        }
        await writeAudit(trx, { tenantId: auth.tenantId, actor: auth.actor, action: 'cost-norms.copy', objectType: 'cost_norm', objectId: b.from, after: { to: b.to } });
        return { copied: src.length, months: b.to.length };
      });
      return ok(res);
    },
  });

  r.get('/api/v1/reports/cost-vs-norm', {
    preHandler: requirePermission('reports:read'),
    schema: {
      tags, summary: 'Chi phí thực tế so định mức theo chi nhánh × bộ phận × khoản mục',
      querystring: z.object({ from: month, to: month, account: z.string().trim().default('64').describe('Đầu số tài khoản chi phí (64 = 641, 642)') }),
    },
    handler: async (req) => {
      const { tenantId } = authOf(req);
      const q = req.query;
      const norms = await sql<{ branch: string | null; dep: string | null; item: string; amount: string }>`
        SELECT b.code AS branch, n.department_code AS dep, n.cost_item_code AS item, SUM(n.amount) AS amount
          FROM cost_norms n LEFT JOIN branches b ON b.id = n.branch_id
         WHERE n.tenant_id = ${tenantId} AND n.period BETWEEN ${q.from} AND ${q.to}
         GROUP BY 1, 2, 3`.execute(db);
      const actual = await sql<{ branch: string; dep: string; item: string; amount: string }>`
        SELECT b.code AS branch, COALESCE(l.dims->>'department', '') AS dep, COALESCE(l.dims->>'costItem', '') AS item, SUM(l.debit - l.credit) AS amount
          FROM bizcity_read.ledger_lines l JOIN bizcity_read.ledger_entries e ON e.id = l.entry_id JOIN branches b ON b.id = l.branch_id
         WHERE l.tenant_id = ${tenantId} AND l.account_code LIKE ${q.account + '%'} AND e.doc_type <> 'closing'
           AND l.posting_date BETWEEN ${`${q.from}-01`}::date AND ${lastDay(q.to)}::date
         GROUP BY 1, 2, 3`.execute(db);
      const dims = await db.selectFrom('dimensions').select(['kind', 'code', 'name']).where('tenant_id', '=', tenantId).where('kind', 'in', ['cost_item', 'department']).execute();
      const names = new Map(dims.filter((x) => x.kind === 'cost_item').map((x) => [x.code, x.name]));
      const depNames = new Map(dims.filter((x) => x.kind === 'department').map((x) => [x.code, x.name]));
      // Mỗi dòng định mức (chi nhánh | bộ phận | khoản mục, trống = mọi) so với tổng chi phí thực tế khớp với nó.
      // Chi phí không khớp định mức nào hiện riêng theo chi nhánh × khoản mục, "chưa có định mức".
      const rows = new Map<string, { branchCode: string; departmentCode: string; costItemCode: string; norm: number | null; actual: number }>();
      const get = (branch: string, dep: string, item: string) => {
        const k = `${branch}|${dep}|${item}`;
        let v = rows.get(k);
        if (!v) { v = { branchCode: branch, departmentCode: dep, costItemCode: item, norm: null, actual: 0 }; rows.set(k, v); }
        return v;
      };
      const normRows = norms.rows.map((n) => { const v = get(n.branch ?? '', n.dep ?? '', n.item); v.norm = (v.norm ?? 0) + toNumber(n.amount); return v; });
      const normKeys = [...new Set(normRows)];
      for (const a of actual.rows) {
        const hit = normKeys.filter((v) => v.costItemCode === a.item && (!v.branchCode || v.branchCode === a.branch) && (!v.departmentCode || v.departmentCode === a.dep));
        if (hit.length) for (const v of hit) v.actual += toNumber(a.amount);
        else get(a.branch, '', a.item).actual += toNumber(a.amount);
      }
      const out = [...rows.values()].filter((v) => v.norm !== null || v.actual !== 0).map((v) => {
        const diff = v.norm === null ? null : fromCents(toCents(v.actual) - toCents(v.norm));
        return {
          ...v, costItemName: v.costItemCode ? names.get(v.costItemCode) ?? '' : '(chưa gắn khoản mục)', departmentName: v.departmentCode ? depNames.get(v.departmentCode) ?? '' : '',
          actual: fromCents(toCents(v.actual)), diff, pct: v.norm ? Math.round((v.actual / v.norm) * 1000) / 10 : null, over: diff !== null && diff > 0,
        };
      }).sort((a, b) => a.branchCode.localeCompare(b.branchCode) || a.departmentCode.localeCompare(b.departmentCode) || a.costItemCode.localeCompare(b.costItemCode));
      return ok({ rows: out });
    },
  });

  /* ------------------------------------------------------------------ cảnh báo */
  r.get('/api/v1/alerts', {
    preHandler: requirePermission('reports:read'),
    schema: { tags, summary: 'Cảnh báo: công nợ quá hạn / sắp đến hạn, kỳ thanh toán hợp đồng, hợp đồng sắp hết hạn, chi phí vượt định mức' },
    handler: async (req) => {
      const { tenantId } = authOf(req);
      const today = todayVN();
      const debt = await sql<{ kind: string; side: string; n: string; amount: string }>`
        SELECT CASE WHEN due_date < ${today}::date THEN 'overdue' ELSE 'soon' END AS kind, side, COUNT(*) AS n, SUM(amount - settled_amount) AS amount
          FROM debt_items
         WHERE tenant_id = ${tenantId} AND amount > settled_amount AND due_date <= ${addDays(today, 7)}::date
           AND ((side = 'debit' AND account_code LIKE '13%') OR (side = 'credit' AND account_code LIKE '33%'))
         GROUP BY 1, 2`.execute(db);
      const pick = (kind: string, side: string) => debt.rows.find((x) => x.kind === kind && x.side === side);
      const dv = (kind: string, side: string) => ({ count: Number(pick(kind, side)?.n ?? 0), amount: toNumber(pick(kind, side)?.amount ?? 0) });
      const schedules = await sql<{ contract_code: string; seq: number; due_date: string; amount: string; tax_amount: string; name: string | null }>`
        SELECT s.contract_code, s.seq, s.due_date::text, s.amount, s.tax_amount, d.name
          FROM contract_schedules s LEFT JOIN dimensions d ON d.tenant_id = s.tenant_id AND d.kind = 'contract' AND d.code = s.contract_code
         WHERE s.tenant_id = ${tenantId} AND s.status = 'pending' AND s.due_date <= ${addDays(today, 15)}::date
         ORDER BY s.due_date LIMIT 20`.execute(db);
      const expiring = await sql<{ code: string; name: string; end_date: string }>`
        SELECT code, name, extra->>'endDate' AS end_date FROM dimensions
         WHERE tenant_id = ${tenantId} AND kind = 'contract' AND is_active AND COALESCE(extra->>'endDate', '') <> ''
           AND (extra->>'endDate') BETWEEN ${today} AND ${addDays(today, 30)}
         ORDER BY 3 LIMIT 20`.execute(db);
      return ok({
        today,
        receivable: { overdue: dv('overdue', 'debit'), dueSoon: dv('soon', 'debit') },
        payable: { overdue: dv('overdue', 'credit'), dueSoon: dv('soon', 'credit') },
        contractPayments: schedules.rows.map((s) => ({ contractCode: s.contract_code, contractName: s.name ?? '', seq: s.seq, dueDate: s.due_date, amount: toNumber(s.amount) + toNumber(s.tax_amount), overdue: s.due_date < today })),
        contractsExpiring: expiring.rows.map((c) => ({ code: c.code, name: c.name, endDate: c.end_date })),
      });
    },
  });
}
