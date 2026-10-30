// @bizcity-layer D modules/tai-san
/**
 * Kế hoạch khấu hao / phân bổ và hạch toán ghi tăng, ghi giảm / thanh lý tài sản (KT-19, KT-20, KT-21).
 *
 *   GET  /api/v1/assets/plan?from=YYYY-MM&months=&kind=   kế hoạch các tháng của mọi tài sản (tháng đã ghi sổ lấy số
 *                                                              đã trích, tháng chưa ghi lấy số tính theo công thức)
 *   GET  /api/v1/assets/:code/plan                              lịch khấu hao cả vòng đời của một tài sản
 *   GET  /api/v1/assets/:code/posting-suggestion?kind=&date=   gợi ý định khoản ghi tăng / ghi giảm
 *   POST /api/v1/assets/:code/postings                          lập phiếu kế toán hạch toán ghi tăng / ghi giảm, thanh lý
 *
 * Gợi ý định khoản (sửa được trước khi ghi):
 *   - Ghi tăng TSCĐ: Nợ TK nguyên giá / Có TK đối ứng (331, 112, 241…) = nguyên giá.
 *     Ghi tăng CCDC, chi phí trả trước: Nợ TK chờ phân bổ (242…) / Có TK đối ứng = giá trị phân bổ.
 *   - Ghi giảm TSCĐ: Nợ TK hao mòn / Có TK nguyên giá = hao mòn luỹ kế; Nợ 8111 / Có TK nguyên giá = giá trị còn lại.
 *     Ghi giảm CCDC, chi phí trả trước: Nợ TK chi phí của thẻ / Có TK chờ phân bổ = phần chưa phân bổ.
 *   - Thanh lý, nhượng bán (thêm ở giao diện): Nợ 131 / Có 7111 giá bán (kèm thuế GTGT đầu ra); Nợ 8111 / Có 111… chi phí thanh lý.
 *
 *   GET  /api/v1/asset-events/:id/transfer-posting              gợi ý hạch toán một lần điều chuyển (FA-004)
 *   POST /api/v1/asset-events/:id/transfer-posting              lập hai phiếu kế toán (bên giao, bên nhận)
 *
 * Điều chuyển giữa hai chi nhánh KHÁC đơn vị hạch toán (mỗi bên tự ghi sổ), số liệu đến hết tháng trước tháng điều chuyển:
 *   - Bên giao TSCĐ: Nợ TK hao mòn / Có TK nguyên giá = hao mòn luỹ kế; Nợ phải thu nội bộ (13681, đối tượng chi nhánh nhận) / Có TK nguyên giá = giá trị còn lại.
 *     Bên nhận TSCĐ: Nợ TK nguyên giá / Có TK hao mòn = hao mòn luỹ kế; Nợ TK nguyên giá / Có phải trả nội bộ (33681, đối tượng chi nhánh giao) = giá trị còn lại.
 *   - CCDC, chi phí trả trước: bên giao Nợ 13681 / Có TK chờ phân bổ; bên nhận Nợ TK chờ phân bổ / Có 33681 = phần chưa phân bổ.
 *   Cùng đơn vị hạch toán: không ghi sổ (tài sản chỉ đổi nơi dùng, khấu hao tháng chia theo ngày như cũ).
 */
import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { sql } from 'kysely';
import { fromCents, toCents, voucherLineSchema } from '@ketoan/contracts';
import { db, toNumber, type Db } from '../../db/client.js';
import { authOf, requirePermission } from '../../core/auth.js';
import { ok } from '../../core/http.js';
import { Errors } from '../../core/errors.js';
import { writeAudit } from '../../core/audit.js';
import { voucherService } from '../vouchers/voucher.service.js';
import { partnerRepository } from '../partners/partner.repository.js';
import { assetService, buildRevaluations, calcOf, type CalcRow } from './asset.service.js';
import { chargeFor, effectiveAt, firstChargePeriod, fromIndex, monthIndex, periodLabel, periodOf } from './depreciation.js';

const tags = ['Tài sản'];
const month = z.string().regex(/^\d{4}-\d{2}$/, 'Tháng dạng YYYY-MM');
const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const cents = (v: string | number | null | undefined) => toCents(toNumber(v ?? 0));

export interface PlanMonth { period: string; amount: number; status: 'posted' | 'planned' | 'missing'; accumulated: number; remaining: number }
interface PlanAsset { code: string; name: string; kind: string; branchCode: string; depreciable: number; months: PlanMonth[] }

/** Lịch khấu hao của các tài sản (xu → đồng ở kết quả). Tháng trước tháng hiện tại chưa ghi sổ = "missing". */
export async function buildPlans(trx: Db, tenantId: string, filter: { code?: string; kind?: string }, today = new Date()): Promise<PlanAsset[]> {
  const assets = await sql<CalcRow & { id: string; code: string; name: string; kind: string; branch_code: string; tax_monthly_amount: string | null }>`
    SELECT a.id, a.code, a.name, a.kind, b.code AS branch_code, a.start_date::text, a.original_cost, a.depreciable_amount, a.useful_life_months, a.monthly_amount, a.tax_monthly_amount,
           a.opening_accumulated, a.opening_as_of::text, a.opening_remaining_months, a.status, a.disposed_date::text
      FROM assets a JOIN branches b ON b.id = a.branch_id
     WHERE a.tenant_id = ${tenantId}
       ${filter.code ? sql`AND a.code = ${filter.code}` : sql``}
       ${filter.kind ? sql`AND a.kind = ${filter.kind}` : sql``}
     ORDER BY a.kind, a.code`.execute(trx);
  const ids = assets.rows.map((a) => a.id);
  if (!ids.length) return [];
  const [posted, events, overrides] = await Promise.all([
    trx.selectFrom('asset_depreciations').select(['asset_id', 'year', 'month', 'amount', 'covers_from']).where('asset_id', 'in', ids).execute(),
    trx.selectFrom('asset_events').select(['asset_id', 'kind', 'event_date', 'payload']).where('asset_id', 'in', ids).where('kind', '=', 'revaluation').orderBy('event_date').orderBy('id').execute(),
    trx.selectFrom('asset_depreciation_overrides').select(['asset_id', 'year', 'month', 'amount']).where('asset_id', 'in', ids).execute(),
  ]);
  const nowIdx = today.getFullYear() * 12 + today.getMonth();
  return assets.rows.map((a) => {
    const done = new Map(posted.filter((r) => r.asset_id === a.id).map((r) => [r.year * 12 + r.month - 1, cents(r.amount)]));
    const ov = new Map(overrides.filter((r) => r.asset_id === a.id).map((r) => [r.year * 12 + r.month - 1, cents(r.amount)]));
    // Tháng đã được dòng "trích bổ sung" của một tháng sau bao gồm: không tính lại.
    const covered = new Set<number>();
    for (const r of posted.filter((x) => x.asset_id === a.id && x.covers_from !== null)) for (let i = r.covers_from!; i < r.year * 12 + r.month - 1; i++) covered.add(i);
    const sumBefore = (i: number) => [...done.entries()].filter(([k]) => k < i).reduce((s, [, v]) => s + v, 0);
    const calc = calcOf(a, buildRevaluations(a, events.filter((e) => e.asset_id === a.id), sumBefore));
    const taxMonthly: number | null = null;
    const first = monthIndex(firstChargePeriod(calc));
    const lastPosted = Math.max(-1, ...done.keys());
    // Tháng cuối theo thời gian sử dụng sau mọi lần đánh giá lại; cộng thêm vài tháng phòng phần lẻ dồn cuối.
    const end = Math.max(effectiveAt(calc, fromIndex(monthIndex({ year: 2200, month: 1 }))).lastIdx + 2, lastPosted);
    const months: PlanMonth[] = [];
    let acc = 0;
    for (let i = first; i <= end; i++) {
      let amount: number;
      let status: PlanMonth['status'];
      if (done.has(i)) { amount = done.get(i)!; status = 'posted'; }
      else if (covered.has(i)) continue;
      else { amount = ov.get(i) ?? chargeFor(calc, fromIndex(i), acc, taxMonthly); status = i < nowIdx ? 'missing' : 'planned'; }
      acc += amount;
      const eff = effectiveAt(calc, fromIndex(i));
      if (amount !== 0 || status === 'posted') months.push({ period: periodLabel(fromIndex(i)), amount: fromCents(amount), status, accumulated: fromCents(eff.opening + acc), remaining: fromCents(eff.depreciable - eff.opening - acc) });
    }
    const eff = effectiveAt(calc, fromIndex(end));
    return { code: a.code, name: a.name, kind: a.kind, branchCode: a.branch_code, depreciable: fromCents(eff.depreciable), months };
  });
}

const postingBody = z.object({
  kind: z.enum(['increase', 'decrease']),
  docDate: day,
  description: z.string().trim().min(1).max(1000),
  partnerCode: z.string().trim().max(64).optional(),
  lines: z.array(voucherLineSchema).min(1).max(50),
  /** Ghi giảm: đồng thời chuyển thẻ sang "đã ghi giảm" từ ngày này (thôi trích từ ngày này). */
  markDisposed: z.boolean().default(true),
  /** Thanh lý, nhượng bán: ghi lại để tra cứu. */
  salePrice: z.number().min(0).optional(),
  disposalCost: z.number().min(0).optional(),
});

export async function assetPlanRoutes(app: FastifyInstance): Promise<void> {
  const r = app.withTypeProvider<ZodTypeProvider>();

  r.get('/api/v1/assets/plan', {
    preHandler: requirePermission('reports:read'),
    schema: {
      tags, summary: 'Kế hoạch khấu hao / phân bổ các tháng',
      querystring: z.object({ from: month, months: z.coerce.number().int().min(1).max(60).default(12), kind: z.enum(['fixed_asset', 'tool', 'prepaid']).optional() }),
    },
    handler: async (req) => {
      const q = req.query;
      const plans = await buildPlans(db, authOf(req).tenantId, { kind: q.kind });
      const startIdx = monthIndex(periodOf(`${q.from}-01`));
      const periods = Array.from({ length: q.months }, (_, i) => periodLabel(fromIndex(startIdx + i)));
      const rows = plans.map((p) => {
        const by = new Map(p.months.map((m) => [m.period, m]));
        const amounts = periods.map((x) => by.get(x)?.amount ?? 0);
        const statuses = periods.map((x) => by.get(x)?.status ?? null);
        // Luỹ kế đến trước tháng đầu của bảng.
        const before = p.months.filter((m) => m.period < periods[0]!).at(-1);
        const firstIn = p.months.find((m) => m.period >= periods[0]!);
        const accumulatedBefore = before ? before.accumulated : firstIn ? firstIn.accumulated - firstIn.amount : 0;
        return { code: p.code, name: p.name, kind: p.kind, branchCode: p.branchCode, depreciable: p.depreciable, accumulatedBefore, amounts, statuses, total: amounts.reduce((s, x) => s + x, 0) };
      }).filter((x) => x.total !== 0);
      const totals = periods.map((_, i) => rows.reduce((s, x) => s + x.amounts[i]!, 0));
      return ok({ periods, rows, totals });
    },
  });

  r.get('/api/v1/assets/:code/plan', {
    preHandler: requirePermission('reports:read'),
    schema: { tags, summary: 'Lịch khấu hao / phân bổ cả vòng đời của một tài sản', params: z.object({ code: z.string() }) },
    handler: async (req) => {
      const [p] = await buildPlans(db, authOf(req).tenantId, { code: req.params.code });
      if (!p) throw Errors.notFound(`tài sản ${req.params.code} (trong bộ sổ này)`);
      return ok(p);
    },
  });

  r.get('/api/v1/assets/:code/posting-suggestion', {
    preHandler: requirePermission('documents:read'),
    schema: { tags, summary: 'Gợi ý định khoản ghi tăng / ghi giảm', params: z.object({ code: z.string() }), querystring: z.object({ kind: z.enum(['increase', 'decrease']), date: day }) },
    handler: async (req) => {
      const auth = authOf(req);
      const q = req.query;
      const [a] = await assetService.list(auth, { code: req.params.code });
      if (!a) throw Errors.notFound(`tài sản ${req.params.code}`);
      const dims = { costItem: a.costItemCode ?? undefined, department: a.departmentCode ?? undefined, contract: a.contractCode ?? undefined };
      const lines: { debitAccount: string; creditAccount: string; amount: number; description: string; costItem?: string; department?: string; contract?: string }[] = [];
      const warnings: string[] = [];
      const fa = a.kind === 'fixed_asset';
      if (q.kind === 'increase') {
        lines.push({ debitAccount: (fa ? a.assetAccount : a.depreciationAccount) ?? '', creditAccount: '', amount: fa ? a.currentCost : a.depreciableAmount ?? a.currentCost, description: `Ghi tăng ${a.kindLabel.toLowerCase()} ${a.name}` });
        if (a.openingAccumulated > 0) warnings.push('Thẻ có luỹ kế chuyển sổ: tài sản đã có trên sổ trước khi dùng phần mềm, thường không cần hạch toán ghi tăng lại');
      } else {
        const depreciable = (a.depreciableAmount ?? a.originalCost) + (a.currentCost - a.originalCost);
        const acc = a.accumulated;
        if (fa) {
          if (acc > 0) lines.push({ debitAccount: a.depreciationAccount, creditAccount: a.assetAccount ?? '', amount: acc, description: 'Giá trị hao mòn luỹ kế' });
          const left = a.currentCost - acc;
          if (left > 0) lines.push({ debitAccount: '8111', creditAccount: a.assetAccount ?? '', amount: left, description: 'Giá trị còn lại của tài sản ghi giảm', ...dims });
        } else {
          const left = depreciable - acc;
          if (left > 0) lines.push({ debitAccount: a.expenseAccount, creditAccount: a.depreciationAccount, amount: left, description: `Phần chưa phân bổ của ${a.name}`, ...dims });
        }
        const want = periodLabel(fromIndex(monthIndex(periodOf(q.date)) - 1));
        if (!a.lastPeriod || a.lastPeriod < want) warnings.push(`Thẻ mới ${fa ? 'khấu hao' : 'phân bổ'} đến ${a.lastPeriod ? a.lastPeriod.split('-').reverse().join('/') : '(chưa tháng nào)'}: nên tính ${fa ? 'khấu hao' : 'phân bổ'} đến tháng trước tháng ghi giảm rồi mới hạch toán, để luỹ kế đúng`);
        if (a.status === 'disposed') warnings.push(`Thẻ đã ghi giảm từ ${a.disposedDate ? a.disposedDate.split('-').reverse().join('/') : ''}`);
      }
      const prior = await sql<{ event_date: string; doc_no: string; status: string | null }>`
        SELECT e.event_date::text, e.doc_no, d.status FROM asset_events e JOIN assets s ON s.id = e.asset_id
          LEFT JOIN accounting_events d ON d.tenant_id = s.tenant_id AND d.doc_key = e.payload->>'docKey'
         WHERE s.tenant_id = ${auth.tenantId} AND s.code = ${a.code} AND e.kind = ${q.kind}`.execute(db);
      for (const p of prior.rows) if (p.status === 'posted') warnings.push(`Đã hạch toán ${q.kind === 'increase' ? 'ghi tăng' : 'ghi giảm'} ở phiếu ${p.doc_no} ngày ${String(p.event_date).split('-').reverse().join('/')}`);
      return ok({ asset: { code: a.code, name: a.name, kind: a.kind, branchCode: a.branchCode, currentCost: a.currentCost, accumulated: a.accumulated, remaining: a.remaining, lastPeriod: a.lastPeriod }, lines, warnings });
    },
  });

  r.post('/api/v1/assets/:code/postings', {
    preHandler: requirePermission('documents:write'),
    schema: { tags, summary: 'Lập phiếu kế toán hạch toán ghi tăng / ghi giảm, thanh lý tài sản', params: z.object({ code: z.string() }), body: postingBody },
    handler: async (req, reply) => {
      const auth = authOf(req);
      const b = req.body;
      const res = await db.transaction().execute(async (trx) => {
        const a = await trx.selectFrom('assets as a').innerJoin('branches as br', 'br.id', 'a.branch_id').select(['a.id', 'a.code', 'a.name', 'a.status', 'br.code as branch_code'])
          .where('a.tenant_id', '=', auth.tenantId).where('a.code', '=', req.params.code).executeTakeFirst();
        if (!a) throw Errors.notFound(`tài sản ${req.params.code}`);
        const created = await voucherService.createIn(trx, auth, {
          docType: 'manual', branchCode: a.branch_code, docDate: b.docDate, description: b.description, counterparty: '', reference: `Tài sản ${a.code}`,
          partnerCode: b.partnerCode, lines: b.lines,
        } as Parameters<typeof voucherService.createIn>[2]);
        const total = b.lines.reduce((s, l) => s + l.amount + (l.taxAmount ?? 0), 0);
        await trx.insertInto('asset_events').values({
          tenant_id: auth.tenantId, asset_id: a.id, kind: b.kind, event_date: b.docDate, doc_no: created.docNo,
          payload: JSON.stringify({ docKey: created.docKey, eventId: created.id, total, salePrice: b.salePrice ?? null, disposalCost: b.disposalCost ?? null }),
          note: b.description, created_by: auth.actorName,
        }).execute();
        if (b.kind === 'decrease' && b.markDisposed && a.status !== 'disposed') {
          await trx.updateTable('assets').set({ status: 'disposed', disposed_date: b.docDate, updated_at: new Date() }).where('id', '=', a.id).execute();
        }
        await writeAudit(trx, { tenantId: auth.tenantId, actor: auth.actor, action: `asset.${b.kind}`, objectType: 'asset', objectId: a.code, after: { docKey: created.docKey, total } });
        return { docNo: created.docNo, docKey: created.docKey, id: created.id };
      });
      reply.code(201);
      return ok(res);
    },
  });

  r.get('/api/v1/asset-events/:id/transfer-posting', {
    preHandler: requirePermission('documents:read'),
    schema: { tags, summary: 'Gợi ý hạch toán điều chuyển tài sản giữa hai đơn vị hạch toán', params: z.object({ id: z.string().regex(/^[1-9][0-9]*$/) }) },
    handler: async (req) => ok(await transferSuggestion(db, authOf(req).tenantId, req.params.id)),
  });

  r.post('/api/v1/asset-events/:id/transfer-posting', {
    preHandler: requirePermission('documents:write'),
    schema: {
      tags, summary: 'Lập hai phiếu kế toán hạch toán điều chuyển tài sản (bên giao, bên nhận)', params: z.object({ id: z.string().regex(/^[1-9][0-9]*$/) }),
      body: z.object({ docDate: day.optional() }),
    },
    handler: async (req, reply) => {
      const auth = authOf(req);
      const b = req.body;
      const res = await db.transaction().execute(async (trx) => {
        await sql`SELECT 1 FROM asset_events WHERE tenant_id = ${auth.tenantId} AND id = ${req.params.id} FOR UPDATE`.execute(trx);
        const s = await transferSuggestion(trx, auth.tenantId, req.params.id);
        if (s.sameUnit) throw Errors.validation('Hai chi nhánh cùng đơn vị hạch toán: điều chuyển không cần ghi sổ');
        if (s.posted.length) throw Errors.conflict(`Lần điều chuyển này đã hạch toán ở phiếu ${s.posted.map((p) => p.docNo).join(', ')}`);
        if (!s.parts.some((p) => p.lines.length)) throw Errors.validation('Tài sản không còn giá trị để hạch toán điều chuyển');
        const docDate = b.docDate ?? s.date;
        const postings: { branchCode: string; docNo: string; docKey: string; id: string }[] = [];
        for (const p of s.parts) {
          if (!p.lines.length) continue;
          const created = await voucherService.createIn(trx, auth, {
            docType: 'manual', branchCode: p.branchCode, docDate, description: p.description, counterparty: '', reference: `Tài sản ${s.asset.code}`,
            lines: p.lines,
          } as Parameters<typeof voucherService.createIn>[2]);
          postings.push({ branchCode: p.branchCode, docNo: created.docNo, docKey: created.docKey, id: created.id });
        }
        await sql`UPDATE asset_events SET payload = payload || ${JSON.stringify({ postings })}::jsonb WHERE id = ${req.params.id}`.execute(trx);
        await writeAudit(trx, { tenantId: auth.tenantId, actor: auth.actor, action: 'asset.transfer.post', objectType: 'asset', objectId: s.asset.code, after: { eventId: req.params.id, postings } });
        return { postings };
      });
      reply.code(201);
      return ok(res);
    },
  });
}

/** Định khoản điều chuyển (xem đầu tệp). Số luỹ kế lấy theo kế hoạch đến hết tháng trước tháng điều chuyển. */
async function transferSuggestion(trx: Db, tenantId: string, eventId: string) {
  const e = await trx.selectFrom('asset_events as e').innerJoin('assets as a', 'a.id', 'e.asset_id')
    .select(['e.id', 'e.kind', 'e.event_date', 'e.doc_no', 'e.payload', 'a.code'])
    .where('e.tenant_id', '=', tenantId).where('e.id', '=', eventId).executeTakeFirst();
  if (!e || e.kind !== 'transfer') throw Errors.notFound('lần điều chuyển tài sản');
  const pl = e.payload as { fromBranchId: string; fromBranchCode: string; toBranchId: string; toBranchCode: string; postings?: { branchCode: string; docNo: string; docKey: string }[] };
  const branches = await trx.selectFrom('branches').select(['id', 'code', 'name', 'accounting_unit_id']).where('tenant_id', '=', tenantId).where('id', 'in', [pl.fromBranchId, pl.toBranchId]).execute();
  const from = branches.find((x) => x.id === pl.fromBranchId);
  const to = branches.find((x) => x.id === pl.toBranchId);
  if (!from || !to) throw Errors.validation('Chi nhánh của lần điều chuyển không còn trong danh mục');
  const sameUnit = (from.accounting_unit_id ?? null) === (to.accounting_unit_id ?? null);
  const date = typeof e.event_date === 'string' ? e.event_date : (e.event_date as Date).toISOString().slice(0, 10);

  const a = (await trx.selectFrom('assets').select(['id', 'code', 'name', 'kind', 'asset_account', 'depreciation_account']).where('tenant_id', '=', tenantId).where('code', '=', e.code).executeTakeFirstOrThrow());
  const [plan] = await buildPlans(trx, tenantId, { code: a.code });
  const [card] = await assetService.list({ tenantId } as Parameters<typeof assetService.list>[0], { code: a.code });
  const warnings: string[] = [];
  const prev = periodLabel(fromIndex(monthIndex(periodOf(date)) - 1));
  const before = plan?.months.filter((m) => m.period <= prev).at(-1);
  const accumulated = before ? before.accumulated : card?.openingAccumulated ?? 0;
  if (card && (!card.lastPeriod || card.lastPeriod < prev)) warnings.push(`Thẻ mới trích đến ${card.lastPeriod ? card.lastPeriod.split('-').reverse().join('/') : '(chưa tháng nào)'}: số luỹ kế dưới đây tính theo kế hoạch đến hết ${prev.split('-').reverse().join('/')}; nên tính khấu hao các tháng còn thiếu trước khi hạch toán`);
  const fa = a.kind === 'fixed_asset';
  const cost = card?.currentCost ?? 0;
  const value = fa ? cost : plan?.depreciable ?? card?.depreciableAmount ?? cost;
  const left = fromCents(toCents(value) - toCents(accumulated));
  const assetAcc = fa ? a.asset_account ?? '' : a.depreciation_account;
  const recv = await defaultAccount(trx, tenantId, 'internal_receivable', '13681');
  const pay = await defaultAccount(trx, tenantId, 'internal_payable', '33681');
  const fromPartner = `CN-${from.code}`;
  const toPartner = `CN-${to.code}`;
  type L = { debitAccount: string; creditAccount: string; amount: number; description: string; partnerCode?: string };
  const out: L[] = [];
  const into: L[] = [];
  if (fa && accumulated > 0) {
    out.push({ debitAccount: a.depreciation_account, creditAccount: assetAcc, amount: accumulated, description: 'Hao mòn luỹ kế của tài sản điều chuyển đi' });
    into.push({ debitAccount: assetAcc, creditAccount: a.depreciation_account, amount: accumulated, description: 'Hao mòn luỹ kế của tài sản nhận điều chuyển' });
  }
  if (left > 0) {
    out.push({ debitAccount: recv, creditAccount: assetAcc, amount: left, description: `Giá trị còn lại điều chuyển cho ${to.code}`, partnerCode: toPartner });
    into.push({ debitAccount: assetAcc, creditAccount: pay, amount: left, description: `Giá trị còn lại nhận từ ${from.code}`, partnerCode: fromPartner });
  }
  if (!assetAcc) warnings.push('Thẻ chưa khai tài khoản nguyên giá / chờ phân bổ');
  if (sameUnit) warnings.push('Hai chi nhánh cùng đơn vị hạch toán: không cần ghi sổ điều chuyển');
  // Đối tượng đại diện chi nhánh trên tài khoản nội bộ (giống phiếu chuyển kho, chuyển tiền).
  if (!sameUnit) {
    for (const x of [from, to]) await partnerRepository.upsert(trx, tenantId, { code: `CN-${x.code}`, name: x.name || `Chi nhánh ${x.code}` }, 'internal');
  }
  const posted: { branchCode: string; docNo: string }[] = [];
  for (const p of pl.postings ?? []) {
    const d = await trx.selectFrom('accounting_events').select('status').where('tenant_id', '=', tenantId).where('doc_key', '=', p.docKey).executeTakeFirst();
    if (d?.status === 'posted') posted.push({ branchCode: p.branchCode, docNo: p.docNo });
  }
  if (posted.length) warnings.push(`Đã hạch toán ở phiếu ${posted.map((p) => p.docNo).join(', ')}`);
  const label = fa ? 'tài sản' : a.kind === 'tool' ? 'công cụ dụng cụ' : 'chi phí trả trước';
  return {
    eventId: e.id, date, docNo: e.doc_no, sameUnit, posted, warnings, accumulated, remaining: left,
    asset: { code: a.code, name: a.name, kind: a.kind, cost },
    from: { code: from.code, name: from.name }, to: { code: to.code, name: to.name },
    parts: [
      { side: 'out' as const, branchCode: from.code, description: `Điều chuyển ${label} ${a.code} ${a.name} cho ${to.code}`, lines: out },
      { side: 'in' as const, branchCode: to.code, description: `Nhận điều chuyển ${label} ${a.code} ${a.name} từ ${from.code}`, lines: into },
    ],
  };
}

async function defaultAccount(trx: Db, tenantId: string, key: string, fallback: string): Promise<string> {
  const r = await trx.selectFrom('posting_defaults').select('account_code').where('tenant_id', '=', tenantId).where('key', '=', key).executeTakeFirst();
  return r?.account_code ?? fallback;
}
