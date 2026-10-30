// @bizcity-layer K kernel/periods
/**
 * Kỳ kế toán, khoá sổ.
 *   GET    /api/v1/periods?year=        danh sách kỳ và khoá
 *   POST   /api/v1/periods              khai kỳ kế toán (một tháng hoặc cả năm)
 *   POST   /api/v1/periods/locks        khoá kỳ (một ô hoặc khoá chung: mọi chi nhánh / mọi loại)
 *   DELETE /api/v1/periods/locks/:id?reason=   mở khoá một dòng khoá (bắt buộc lý do)
 *   GET    /api/v1/periods/lock-grid?year=&month=   lưới khoá của một kỳ: chi nhánh × loại chứng từ
 *   PUT    /api/v1/periods/locks        khoá / mở hàng loạt ô (chi nhánh × loại chứng từ); có ô mở khoá thì bắt buộc lý do
 *   GET    /api/v1/periods/check?year=&month=   bảng kiểm trước khi khoá (chứng từ lỗi, lệch, chưa kết chuyển…)
 *   GET    /api/v1/periods/lock-events?year=&month=    nhật ký khoá / mở khoá
 */
import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { db } from '../../db/client.js';
import { authOf, requirePermission, type AuthContext } from '../../core/auth.js';
import { runDiagnostics, saveDiagnosticRun } from '../system/diagnostics.js';
import { ok, idParamSchema } from '../../core/http.js';
import { Errors } from '../../core/errors.js';
import { writeAudit } from '../../core/audit.js';
import { sql } from 'kysely';
import { DOC_TYPE_LIST } from '@ketoan/contracts';
import { emitKernelEvent } from '../documents/kernel-events.js';
import { periodRepository } from './period.repository.js';
import { closingService } from '../closing/closing.service.js';
import { documentChecks } from '../reports/control-reports.js';
import { toNumber } from '../../db/client.js';

const tags = ['Kỳ kế toán'];
const ym = (year: number, month: number) => `${year}-${String(month).padStart(2, '0')}`;
const periodQuery = z.object({ year: z.coerce.number().int().min(2000).max(2100), month: z.coerce.number().int().min(1).max(12) });
const docTypeEnum = z.enum(DOC_TYPE_LIST as [string, ...string[]]);
const lastDay = (year: number, month: number) => `${ym(year, month)}-${String(new Date(Date.UTC(year, month, 0)).getUTCDate()).padStart(2, '0')}`;
const acceptSchema = z.string().trim().max(500).optional()
  .describe('R-DIAG-4: sổ trong kỳ có lỗi toàn vẹn mà vẫn khoá thì ghi lý do chấp nhận (ít nhất 10 ký tự); lý do + lượt chẩn đoán vào nhật ký khoá');

/**
 * R-DIAG-4: chạy tự chẩn đoán L3 trên kỳ (và chi nhánh) trước khi khoá; có mục error thì chặn, trừ khi người khoá ghi lý do chấp nhận.
 * Lượt chẩn đoán luôn được lưu (diagnostic_runs, trigger period-lock) làm bằng chứng. Trả nhãn ghi vào period_lock_events.reason.
 */
async function guardLock(auth: AuthContext, year: number, month: number, branchId: string | null, accept: string | undefined): Promise<string | null> {
  const report = await runDiagnostics({ tenantId: auth.tenantId, from: `${ym(year, month)}-01`, to: lastDay(year, month), branchId: branchId ?? undefined }, { layer: 'L3' });
  const runId = await saveDiagnosticRun(report, { tenantId: auth.tenantId, actor: auth.actor, trigger: 'period-lock' });
  const errors = report.checks.filter((c) => c.level === 'error');
  if (!errors.length) return null;
  if (!accept || accept.length < 10) {
    throw Errors.conflict(
      `Không khoá được kỳ ${ym(year, month)}: sổ trong kỳ có lỗi toàn vẹn (${errors.map((c) => `${c.code} ×${c.count}`).join(', ')}). ` +
        'Sửa trước khi khoá, hoặc ghi lý do chấp nhận (ít nhất 10 ký tự).',
      { diagnostics: { runId, errors: errors.map((c) => ({ code: c.code, title: c.title, count: c.count, sample: c.sample, fix: c.fix })) } },
    );
  }
  return `Chấp nhận lỗi chẩn đoán lượt #${runId} (${errors.map((c) => c.code).join(', ')}): ${accept}`;
}

/** Chủ thể sự kiện khoá / mở kỳ: period:<yyyy-mm> (bizcity_event@1 §7). */
const periodSubject = (year: number, month: number) => `period:${year}-${String(month).padStart(2, '0')}`;

export async function periodRoutes(app: FastifyInstance): Promise<void> {
  const r = app.withTypeProvider<ZodTypeProvider>();

  r.get('/api/v1/periods', {
    preHandler: requirePermission('ledger:read'),
    schema: { tags, summary: 'Danh sách kỳ và khoá sổ', querystring: z.object({ year: z.coerce.number().int().optional() }) },
    handler: async (req) => {
      const rows = await periodRepository.listWithLocks(db, authOf(req).tenantId, req.query.year);
      // Gom khoá theo kỳ.
      const byPeriod = new Map<string, { id: string; year: number; month: number; startDate: string; endDate: string; locks: unknown[] }>();
      for (const x of rows) {
        let p = byPeriod.get(x.id);
        if (!p) {
          p = { id: x.id, year: x.year, month: x.month, startDate: x.start_date, endDate: x.end_date, locks: [] };
          byPeriod.set(x.id, p);
        }
        if (x.lock_id) p.locks.push({ id: x.lock_id, branch: x.branch_code, docType: x.doc_type, lockedBy: x.locked_by, lockedAt: x.locked_at });
      }
      return ok([...byPeriod.values()]);
    },
  });

  r.post('/api/v1/periods', {
    preHandler: requirePermission('periods:lock'),
    schema: {
      tags,
      summary: 'Khai kỳ kế toán',
      description: 'Kỳ là tháng dương lịch. Bỏ trống tháng thì khai đủ 12 tháng của năm. Kỳ đã có thì giữ nguyên.',
      body: z.object({ year: z.number().int().min(2000).max(2100), month: z.number().int().min(1).max(12).optional() }),
    },
    handler: async (req) => {
      const auth = authOf(req);
      const months = req.body.month ? [req.body.month] : Array.from({ length: 12 }, (_, i) => i + 1);
      await db.transaction().execute(async (trx) => {
        for (const m of months) await periodRepository.ensurePeriodFor(trx, auth.tenantId, `${req.body.year}-${String(m).padStart(2, '0')}-01`);
        await writeAudit(trx, { tenantId: auth.tenantId, actor: auth.actor, action: 'period.create', objectType: 'period', objectId: String(req.body.year), after: req.body });
      });
      return ok({ created: months.length });
    },
  });

  r.post('/api/v1/periods/locks', {
    preHandler: requirePermission('periods:lock'),
    schema: {
      tags,
      summary: 'Khoá kỳ',
      body: z.object({
        year: z.number().int(),
        month: z.number().int().min(1).max(12),
        branchCode: z.string().optional().describe('Bỏ trống = mọi chi nhánh'),
        docType: z.string().default('*').describe('* = mọi loại chứng từ'),
        acceptDiagnostics: acceptSchema,
      }),
    },
    handler: async (req) => {
      const auth = authOf(req);
      const b = req.body;
      const date = `${b.year}-${String(b.month).padStart(2, '0')}-01`;
      let branchId: string | null = null;
      if (b.branchCode) {
        const br = await db.selectFrom('branches').select('id').where('tenant_id', '=', auth.tenantId).where('code', '=', b.branchCode).executeTakeFirst();
        if (!br) throw Errors.notFound(`chi nhánh ${b.branchCode}`);
        branchId = br.id;
      }
      const accepted = await guardLock(auth, b.year, b.month, branchId, b.acceptDiagnostics);
      await db.transaction().execute(async (trx) => {
        const period = await periodRepository.ensurePeriodFor(trx, auth.tenantId, date);
        if (await periodRepository.insertLock(trx, { tenant_id: auth.tenantId, period_id: period.id, branch_id: branchId, doc_type: b.docType, locked_by: auth.actorName })) {
          await trx.insertInto('period_lock_events').values({ tenant_id: auth.tenantId, period_id: period.id, branch_id: branchId, doc_type: b.docType, action: 'lock', reason: accepted, actor: auth.actor, actor_name: auth.actorName }).execute();
          await emitKernelEvent(trx, auth, 'bizcity.period.locked', periodSubject(b.year, b.month), { year: b.year, month: b.month, locks: [{ branchCode: b.branchCode ?? null, docType: b.docType }] });
        }
        await writeAudit(trx, { tenantId: auth.tenantId, actor: auth.actor, action: 'period.lock', objectType: 'period', objectId: period.id, after: { ...b, acceptedDiagnostics: accepted ?? undefined } });
      });
      return ok({ locked: true });
    },
  });

  r.delete('/api/v1/periods/locks/:id', {
    preHandler: requirePermission('periods:lock'),
    schema: {
      tags, summary: 'Mở khoá kỳ', params: idParamSchema,
      querystring: z.object({ reason: z.string().trim().min(3, 'Cần ghi lý do mở khoá (ít nhất 3 ký tự)').max(500) }),
    },
    handler: async (req) => {
      const auth = authOf(req);
      await db.transaction().execute(async (trx) => {
        const removed = await periodRepository.deleteLock(trx, auth.tenantId, req.params.id);
        if (!removed) throw Errors.notFound('khoá sổ');
        await trx.insertInto('period_lock_events').values({ tenant_id: auth.tenantId, period_id: removed.period_id, branch_id: removed.branch_id, doc_type: removed.doc_type, action: 'unlock', reason: req.query.reason, actor: auth.actor, actor_name: auth.actorName }).execute();
        const p = await trx.selectFrom('fiscal_periods').select(['year', 'month']).where('id', '=', removed.period_id).executeTakeFirstOrThrow();
        const br = removed.branch_id ? await trx.selectFrom('branches').select('code').where('id', '=', removed.branch_id).executeTakeFirst() : undefined;
        await emitKernelEvent(trx, auth, 'bizcity.period.unlocked', periodSubject(p.year, p.month), { year: p.year, month: p.month, locks: [{ branchCode: br?.code ?? null, docType: removed.doc_type }] });
        await writeAudit(trx, { tenantId: auth.tenantId, actor: auth.actor, action: 'period.unlock', objectType: 'period', objectId: removed.period_id, before: removed });
      });
      return ok({ unlocked: true });
    },
  });
  r.get('/api/v1/periods/lock-grid', {
    preHandler: requirePermission('ledger:read'),
    schema: { tags, summary: 'Lưới khoá của một kỳ: chi nhánh × loại chứng từ', querystring: periodQuery },
    handler: async (req) => {
      const { tenantId } = authOf(req);
      const q = req.query;
      const res = await sql<{ id: string; branch: string | null; doc_type: string; locked_by: string; locked_at: string }>`
        SELECT l.id, br.code AS branch, l.doc_type, l.locked_by, l.locked_at
          FROM period_locks l
          JOIN fiscal_periods p ON p.id = l.period_id
          LEFT JOIN branches br ON br.id = l.branch_id
         WHERE l.tenant_id = ${tenantId} AND p.year = ${q.year} AND p.month = ${q.month}`.execute(db);
      const branches = await db.selectFrom('branches').select(['code', 'name', 'is_active']).where('tenant_id', '=', tenantId).orderBy('code').execute();
      return ok({
        branches: branches.map((b) => ({ code: b.code, name: b.name, isActive: b.is_active })),
        locks: res.rows.map((l) => ({ id: l.id, branch: l.branch, docType: l.doc_type, lockedBy: l.locked_by, lockedAt: l.locked_at })),
      });
    },
  });

  r.put('/api/v1/periods/locks', {
    preHandler: requirePermission('periods:lock'),
    schema: {
      tags,
      summary: 'Khoá / mở khoá hàng loạt ô của một kỳ',
      description: 'Mỗi thay đổi là một ô (chi nhánh, loại chứng từ). Khoá chung (mọi chi nhánh / mọi loại) không đổi ở đây. Có ô mở khoá thì bắt buộc lý do.',
      body: periodQuery.extend({
        changes: z.array(z.object({ branchCode: z.string().min(1), docType: docTypeEnum, locked: z.boolean() })).min(1).max(20000),
        reason: z.string().trim().max(500).default(''),
        acceptDiagnostics: acceptSchema,
      }),
    },
    handler: async (req) => {
      const auth = authOf(req);
      const b = req.body;
      if (b.changes.some((c) => !c.locked) && b.reason.length < 3) throw Errors.validation('Cần ghi lý do mở khoá (ít nhất 3 ký tự)');
      // R-DIAG-4: có ô được khoá thì chẩn đoán cả kỳ (mọi chi nhánh) một lần.
      const accepted = b.changes.some((c) => c.locked) ? await guardLock(auth, b.year, b.month, null, b.acceptDiagnostics) : null;
      const counts = await db.transaction().execute(async (trx) => {
        const period = await periodRepository.ensurePeriodFor(trx, auth.tenantId, `${ym(b.year, b.month)}-01`);
        const branchRows = await trx.selectFrom('branches').select(['id', 'code']).where('tenant_id', '=', auth.tenantId).execute();
        const branchId = new Map(branchRows.map((x) => [x.code, x.id]));
        const unknown = [...new Set(b.changes.map((c) => c.branchCode).filter((c) => !branchId.has(c)))];
        if (unknown.length) throw Errors.validation(`Chi nhánh không có: ${unknown.join(', ')}`);
        let locked = 0;
        let unlocked = 0;
        const events: { tenant_id: string; period_id: string; branch_id: string; doc_type: string; action: 'lock' | 'unlock'; reason: string | null; actor: string; actor_name: string }[] = [];
        for (const c of b.changes) {
          const bid = branchId.get(c.branchCode)!;
          if (c.locked) {
            if (await periodRepository.insertLock(trx, { tenant_id: auth.tenantId, period_id: period.id, branch_id: bid, doc_type: c.docType, locked_by: auth.actorName })) {
              locked++;
              events.push({ tenant_id: auth.tenantId, period_id: period.id, branch_id: bid, doc_type: c.docType, action: 'lock', reason: [accepted, b.reason].filter(Boolean).join(' · ') || null, actor: auth.actor, actor_name: auth.actorName });
            }
          } else {
            const del = await trx.deleteFrom('period_locks').where('tenant_id', '=', auth.tenantId).where('period_id', '=', period.id)
              .where('branch_id', '=', bid).where('doc_type', '=', c.docType).returning('id').execute();
            if (del.length) {
              unlocked++;
              events.push({ tenant_id: auth.tenantId, period_id: period.id, branch_id: bid, doc_type: c.docType, action: 'unlock', reason: b.reason, actor: auth.actor, actor_name: auth.actorName });
            }
          }
        }
        for (let i = 0; i < events.length; i += 1000) await trx.insertInto('period_lock_events').values(events.slice(i, i + 1000)).execute();
        const codeOf = new Map(branchRows.map((x) => [x.id, x.code]));
        for (const action of ['lock', 'unlock'] as const) {
          const locks = events.filter((e) => e.action === action).map((e) => ({ branchCode: codeOf.get(e.branch_id) ?? null, docType: e.doc_type }));
          if (locks.length) await emitKernelEvent(trx, auth, action === 'lock' ? 'bizcity.period.locked' : 'bizcity.period.unlocked', periodSubject(b.year, b.month), { year: b.year, month: b.month, locks });
        }
        await writeAudit(trx, { tenantId: auth.tenantId, actor: auth.actor, action: 'period.lock-batch', objectType: 'period', objectId: period.id, after: { locked, unlocked, reason: b.reason || undefined, acceptedDiagnostics: accepted ?? undefined } });
        return { locked, unlocked };
      });
      return ok(counts);
    },
  });

  r.get('/api/v1/periods/check', {
    preHandler: requirePermission('ledger:read'),
    schema: { tags, summary: 'Bảng kiểm trước khi khoá kỳ', querystring: periodQuery },
    handler: async (req) => {
      const { tenantId } = authOf(req);
      const q = req.query;
      const label = ym(q.year, q.month);
      const from = `${label}-01`;
      const toDate = (await sql<{ d: string }>`SELECT ((${from}::date + interval '1 month' - interval '1 day')::date)::text AS d`.execute(db)).rows[0]!.d;
      const checks = await documentChecks({ tenantId, from, to: toDate, branchIds: null });
      const pending = await sql<{ n: string; s: string }>`
        SELECT COUNT(*) AS n, COALESCE(SUM(amount), 0) AS s FROM payment_requests
         WHERE tenant_id = ${tenantId} AND status IN ('submitted', 'approved1', 'approved') AND request_date BETWEEN ${from}::date AND ${toDate}::date`.execute(db);
      // Chi nhánh có phát sinh trong kỳ (trừ kết chuyển) nhưng chưa có chứng từ kết chuyển của kỳ.
      // Nhận cả khoá mới (closing:<chi nhánh>:<kỳ>) lẫn khoá cũ (closing:<internal|tax>:<chi nhánh>:<kỳ>); giá vốn tương tự.
      const notClosed = await sql<{ code: string }>`
        SELECT DISTINCT br.code FROM ledger_lines l
          JOIN ledger_entries e ON e.id = l.entry_id
          JOIN branches br ON br.id = l.branch_id
         WHERE l.tenant_id = ${tenantId} AND l.posting_date BETWEEN ${from}::date AND ${toDate}::date AND e.doc_type <> 'closing'
           AND NOT EXISTS (SELECT 1 FROM accounting_events d WHERE d.tenant_id = ${tenantId} AND d.status = 'posted'
                            AND d.doc_key IN ('closing:' || br.code || ':' || ${label}, 'closing:internal:' || br.code || ':' || ${label}, 'closing:tax:' || br.code || ':' || ${label}))
         ORDER BY 1`.execute(db);
      // Chi nhánh có bán hàng trong kỳ nhưng chưa có chứng từ giá vốn của kỳ.
      const noCogs = await sql<{ code: string }>`
        SELECT DISTINCT br.code FROM accounting_events d JOIN branches br ON br.id = d.branch_id
         WHERE d.tenant_id = ${tenantId} AND d.status = 'posted' AND d.doc_type IN ('sale', 'sale_return') AND d.doc_date BETWEEN ${from}::date AND ${toDate}::date
           AND NOT EXISTS (SELECT 1 FROM accounting_events c WHERE c.tenant_id = ${tenantId} AND c.status = 'posted'
                            AND c.doc_key IN ('cogs:' || br.code || ':' || ${label}, 'cogs:internal:' || br.code || ':' || ${label}, 'cogs:tax:' || br.code || ':' || ${label}))
         ORDER BY 1`.execute(db);
      const list = (rows: { code: string }[]) => rows.map((r) => r.code).join(', ');
      const closing = await closingService.periodChecks(tenantId, label);
      // R-DIAG-4: lỗi toàn vẹn sổ (L3) chặn khoá kỳ — xem trước ở đây, không lưu lượt (lưu khi khoá thật).
      const diag = (await runDiagnostics({ tenantId, from, to: toDate }, { layer: 'L3' })).checks.filter((c) => c.level === 'error');
      return ok([
        { key: 'integrity', label: 'Lỗi toàn vẹn sổ (tự chẩn đoán) — chặn khoá kỳ nếu không ghi lý do chấp nhận', count: diag.reduce((s, c) => s + c.count, 0), detail: diag.map((c) => `${c.code} ×${c.count}: ${c.sample.slice(0, 5).join(', ')}`).join('; ') },
        { key: 'errors', label: 'Chứng từ nhận lỗi, chưa ghi sổ', count: checks.errors.count, link: '/bao-cao/kiem-tra-chung-tu' },
        { key: 'entryMismatch', label: 'Chứng từ lệch với bút toán (đã ghi mà không có bút toán, đã huỷ mà còn bút toán)', count: checks.entryMismatch.count, link: '/bao-cao/kiem-tra-chung-tu' },
        { key: 'balanceMismatch', label: 'Số dư lưu sẵn lệch với sổ cái', count: checks.balanceMismatch.count, link: '/bao-cao/kiem-tra-chung-tu' },
        { key: 'orphanReturns', label: 'Phiếu trả lại không nối được phiếu gốc', count: checks.orphanReturns.count, link: '/bao-cao/kiem-tra-chung-tu' },
        { key: 'paymentRequests', label: 'Yêu cầu thanh toán chờ duyệt hoặc chưa chi', count: Number(pending.rows[0]?.n ?? 0), amount: toNumber(pending.rows[0]?.s ?? 0), link: '/cong-no/yeu-cau-thanh-toan' },
        { key: 'cogs', label: 'Chi nhánh có bán hàng nhưng chưa tính giá vốn', count: noCogs.rows.length, detail: list(noCogs.rows), link: '/nghiep-vu/tinh-gia-von' },
        { key: 'closing', label: 'Chi nhánh có phát sinh nhưng chưa kết chuyển lãi lỗ', count: notClosed.rows.length, detail: list(notClosed.rows), link: '/nghiep-vu/ket-chuyen' },
        { key: 'closingStale', label: 'Chi nhánh có kết chuyển đã lỗi thời (số liệu hoặc quy tắc đổi sau khi kết chuyển)', count: closing.staleBranches.length, detail: closing.staleBranches.join(', '), link: '/nghiep-vu/ket-chuyen' },
        { key: 'closingResidual', label: 'Chi nhánh đã kết chuyển mà doanh thu, chi phí, 911 còn số dư', count: closing.residuals.length, detail: closing.residuals.map((r) => `${r.branchCode}: ${r.accounts.join(', ')}`).join('; '), link: '/bao-cao/can-doi-phat-sinh' },
      ]);
    },
  });

  r.get('/api/v1/periods/lock-events', {
    preHandler: requirePermission('ledger:read'),
    schema: { tags, summary: 'Nhật ký khoá / mở khoá kỳ', querystring: z.object({ year: z.coerce.number().int(), month: z.coerce.number().int().min(1).max(12).optional() }) },
    handler: async (req) => {
      const { tenantId } = authOf(req);
      let q = db.selectFrom('period_lock_events as e')
        .innerJoin('fiscal_periods as p', 'p.id', 'e.period_id')
        .leftJoin('branches as br', 'br.id', 'e.branch_id')
        .select(['e.id', 'p.year', 'p.month', 'br.code as branch', 'e.doc_type', 'e.action', 'e.reason', 'e.actor_name', 'e.created_at'])
        .where('e.tenant_id', '=', tenantId).where('p.year', '=', req.query.year);
      if (req.query.month) q = q.where('p.month', '=', req.query.month);
      const rows = await q.orderBy('e.created_at', 'desc').orderBy('e.id', 'desc').execute();
      return ok(rows.map((r) => ({ id: r.id, period: ym(r.year, r.month), branch: r.branch, docType: r.doc_type, action: r.action, reason: r.reason, actorName: r.actor_name, createdAt: r.created_at })));
    },
  });
}
