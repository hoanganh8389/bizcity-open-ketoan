// @bizcity-layer D modules/ke-toan
/**
 * Bút toán mẫu và bút toán lặp.
 *   GET  /api/v1/voucher-templates?docType=&status=     danh sách mẫu
 *   GET  /api/v1/voucher-templates/:code                một mẫu (để "Lập từ mẫu")
 *   PUT  /api/v1/voucher-templates/:code                thêm hoặc sửa mẫu
 *   GET  /api/v1/voucher-recurrences                    danh sách lịch lặp
 *   POST /api/v1/voucher-recurrences                    thêm lịch lặp
 *   PUT  /api/v1/voucher-recurrences/:id                sửa lịch lặp
 *   DELETE /api/v1/voucher-recurrences/:id              xoá lịch lặp chưa sinh phiếu nào
 *   GET  /api/v1/voucher-recurrences/due?to=            các kỳ đến hạn chưa sinh phiếu
 *   POST /api/v1/voucher-recurrences/generate           sinh phiếu cho các kỳ được chọn (mỗi kỳ một giao dịch)
 */
import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import {
  RECURRENCE_FREQUENCIES, fillPeriodText, periodLabel, voucherInputSchema, voucherRecurrenceInputSchema, voucherTemplateInputSchema,
  type RecurrenceFrequency, type VoucherTemplateInput,
} from '@ketoan/contracts';
import { db } from '../../db/client.js';
import { authOf, requirePermission, type AuthContext } from '../../core/auth.js';
import { Errors } from '../../core/errors.js';
import { idParamSchema, ok } from '../../core/http.js';
import { writeAudit } from '../../core/audit.js';
import { voucherService } from '../../kernel/public.js';

const tags = ['Bút toán mẫu, bút toán lặp'];
const STEP: Record<RecurrenceFrequency, number> = { monthly: 1, quarterly: 3, yearly: 12 };
const pad = (n: number) => String(n).padStart(2, '0');

interface Recurrence { frequency: string; day_of_month: number; start_month: string; end_month: string | null }

/** Các kỳ (YYYY-MM) và ngày phiếu của một lịch lặp, đến ngày `to` (tối đa 600 kỳ). */
export function periodsOf(r: Recurrence, to: string): { period: string; docDate: string }[] {
  const out: { period: string; docDate: string }[] = [];
  let [y, m] = r.start_month.split('-').map(Number) as [number, number];
  const step = STEP[r.frequency as RecurrenceFrequency] ?? 1;
  while (out.length < 600) {
    const period = `${y}-${pad(m)}`;
    if (r.end_month && period > r.end_month) break;
    const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
    const docDate = `${period}-${pad(Math.min(r.day_of_month, last))}`;
    if (docDate > to) break;
    out.push({ period, docDate });
    m += step;
    while (m > 12) { m -= 12; y += 1; }
  }
  return out;
}

const totalOf = (v: VoucherTemplateInput) => v.lines.reduce((s, l) => s + l.amount + (l.taxAmount ?? 0), 0);

async function loadTemplate(tenantId: string, code: string) {
  const t = await db.selectFrom('voucher_templates').selectAll().where('tenant_id', '=', tenantId).where('code', '=', code).executeTakeFirst();
  if (!t) throw Errors.notFound(`bút toán mẫu ${code}`);
  return t;
}

const templateDto = (t: { code: string; name: string; doc_type: string; voucher: unknown; is_active: boolean; updated_at: Date }) => {
  const v = t.voucher as VoucherTemplateInput;
  return { code: t.code, name: t.name, docType: t.doc_type, isActive: t.is_active, voucher: v, lineCount: v.lines.length, total: totalOf(v), updatedAt: t.updated_at };
};

/** Sinh phiếu của một kỳ: dựng phiếu từ mẫu, ghi sổ, ghi kỳ đã sinh cùng giao dịch. */
async function generateOne(auth: AuthContext, recurrenceId: string, period: string) {
  const r = await db.selectFrom('voucher_recurrences').selectAll().where('tenant_id', '=', auth.tenantId).where('id', '=', recurrenceId).executeTakeFirst();
  if (!r) throw Errors.notFound(`bút toán lặp ${recurrenceId}`);
  if (!r.is_active) throw Errors.conflict('Bút toán lặp đang ngừng');
  const slot = periodsOf(r, '9999-12-31').find((p) => p.period === period);
  if (!slot) throw Errors.validation(`Kỳ ${period} không nằm trong lịch lặp`);
  const t = await loadTemplate(auth.tenantId, r.template_code);
  if (!t.is_active) throw Errors.conflict(`Bút toán mẫu ${t.code} đang ngừng dùng`);
  const v = t.voucher as VoucherTemplateInput;
  const freq = r.frequency as RecurrenceFrequency;
  const parsed = voucherInputSchema.safeParse({
    docType: t.doc_type,
    branchCode: r.branch_code || v.branchCode,
    docDate: slot.docDate,
    description: fillPeriodText(v.description, slot.docDate, freq),
    counterparty: v.counterparty,
    partnerCode: v.partnerCode,
    reference: v.reference,
    lines: v.lines.map((l) => ({ ...l, description: fillPeriodText(l.description ?? '', slot.docDate, freq) })),
  });
  if (!parsed.success) {
    const i = parsed.error.issues[0]!;
    throw Errors.validation(`Mẫu ${t.code} chưa đủ để sinh phiếu tự động: ${i.path.join('.') === 'branchCode' ? 'chưa chọn chi nhánh' : i.message}`);
  }
  return db.transaction().execute(async (trx) => {
    const done = await trx.selectFrom('voucher_recurrence_runs').select('id').where('recurrence_id', '=', r.id).where('period', '=', period).executeTakeFirst();
    if (done) throw Errors.conflict(`Kỳ ${periodLabel(slot.docDate, freq)} đã sinh phiếu`);
    const created = await voucherService.createIn(trx, auth, parsed.data);
    await trx.insertInto('voucher_recurrence_runs').values({ tenant_id: auth.tenantId, recurrence_id: r.id, period, document_id: created.id, created_by: auth.actorName }).execute();
    return created;
  });
}

export async function voucherTemplateRoutes(app: FastifyInstance): Promise<void> {
  const r = app.withTypeProvider<ZodTypeProvider>();
  const read = requirePermission('documents:read');
  const write = requirePermission('documents:write');

  r.get('/api/v1/voucher-templates', {
    preHandler: read,
    schema: { tags, summary: 'Danh sách bút toán mẫu', querystring: z.object({ docType: z.string().optional(), status: z.enum(['all', 'active', 'inactive']).default('all') }) },
    handler: async (req) => {
      const auth = authOf(req);
      let q = db.selectFrom('voucher_templates').selectAll().where('tenant_id', '=', auth.tenantId);
      if (req.query.docType) q = q.where('doc_type', '=', req.query.docType);
      if (req.query.status !== 'all') q = q.where('is_active', '=', req.query.status === 'active');
      return ok((await q.orderBy('code').execute()).map(templateDto));
    },
  });

  r.get('/api/v1/voucher-templates/:code', {
    preHandler: read,
    schema: { tags, summary: 'Một bút toán mẫu', params: z.object({ code: z.string() }) },
    handler: async (req) => ok(templateDto(await loadTemplate(authOf(req).tenantId, req.params.code))),
  });

  r.put('/api/v1/voucher-templates/:code', {
    preHandler: write,
    schema: { tags, summary: 'Thêm hoặc sửa bút toán mẫu', params: z.object({ code: z.string().trim().min(1).max(64) }), body: voucherTemplateInputSchema },
    handler: async (req) => {
      const auth = authOf(req);
      const { name, docType, isActive, ...voucher } = req.body;
      const codes = [...new Set(voucher.lines.flatMap((l) => [l.debitAccount, l.creditAccount]))];
      const accounts = await db.selectFrom('accounts').select(['code', 'is_posting']).where('tenant_id', '=', auth.tenantId).where('code', 'in', codes).execute();
      const missing = codes.filter((c) => !accounts.some((a) => a.code === c && a.is_posting));
      if (missing.length) throw Errors.validation(`Tài khoản chưa có hoặc không phải tài khoản chi tiết: ${missing.join(', ')}`);
      if (voucher.branchCode) {
        const b = await db.selectFrom('branches').select('id').where('tenant_id', '=', auth.tenantId).where('code', '=', voucher.branchCode).executeTakeFirst();
        if (!b) throw Errors.validation(`Chi nhánh ${voucher.branchCode} chưa có`);
      }
      const old = await db.selectFrom('voucher_templates').select('doc_type').where('tenant_id', '=', auth.tenantId).where('code', '=', req.params.code).executeTakeFirst();
      if (old && old.doc_type !== docType) throw Errors.validation('Không đổi được loại phiếu của mẫu; hãy tạo mẫu mới');
      const values = { name, doc_type: docType, is_active: isActive, voucher: JSON.stringify(voucher), updated_by: auth.actorName, updated_at: new Date() };
      await db.transaction().execute(async (trx) => {
        await trx.insertInto('voucher_templates').values({ tenant_id: auth.tenantId, code: req.params.code, ...values })
          .onConflict((oc) => oc.columns(['tenant_id', 'code']).doUpdateSet(values)).execute();
        await writeAudit(trx, { tenantId: auth.tenantId, actor: auth.actor, action: 'voucher_template.save', objectType: 'voucher_template', objectId: req.params.code, after: req.body });
      });
      return ok({ code: req.params.code });
    },
  });

  r.get('/api/v1/voucher-recurrences', {
    preHandler: read,
    schema: { tags, summary: 'Danh sách bút toán lặp' },
    handler: async (req) => {
      const auth = authOf(req);
      const rows = await db
        .selectFrom('voucher_recurrences as r')
        .innerJoin('voucher_templates as t', (j) => j.onRef('t.tenant_id', '=', 'r.tenant_id').onRef('t.code', '=', 'r.template_code'))
        .select(['r.id', 'r.template_code', 'r.name', 'r.frequency', 'r.day_of_month', 'r.start_month', 'r.end_month', 'r.branch_code', 'r.is_active', 't.name as template_name', 't.doc_type'])
        .select((eb) => [
          eb.selectFrom('voucher_recurrence_runs as x').select((e) => e.fn.countAll<string>().as('n')).whereRef('x.recurrence_id', '=', 'r.id').as('runs'),
          eb.selectFrom('voucher_recurrence_runs as x').select((e) => e.fn.max('x.period').as('p')).whereRef('x.recurrence_id', '=', 'r.id').as('last_period'),
        ])
        .where('r.tenant_id', '=', auth.tenantId)
        .orderBy('r.id')
        .execute();
      return ok(rows.map((x) => ({
        id: x.id, templateCode: x.template_code, templateName: x.template_name, docType: x.doc_type, name: x.name || x.template_name,
        frequency: x.frequency, frequencyLabel: RECURRENCE_FREQUENCIES[x.frequency as RecurrenceFrequency], dayOfMonth: x.day_of_month,
        startMonth: x.start_month, endMonth: x.end_month, branchCode: x.branch_code, isActive: x.is_active, runs: Number(x.runs ?? 0), lastPeriod: x.last_period,
      })));
    },
  });

  const saveRecurrence = async (auth: AuthContext, id: string | null, b: z.infer<typeof voucherRecurrenceInputSchema>) => {
    await loadTemplate(auth.tenantId, b.templateCode);
    if (b.endMonth && b.endMonth < b.startMonth) throw Errors.validation('Tháng kết thúc trước tháng bắt đầu');
    const values = {
      template_code: b.templateCode, name: b.name, frequency: b.frequency, day_of_month: b.dayOfMonth, start_month: b.startMonth,
      end_month: b.endMonth ?? null, branch_code: b.branchCode || null, is_active: b.isActive, updated_by: auth.actorName, updated_at: new Date(),
    };
    return db.transaction().execute(async (trx) => {
      let rid = id;
      if (rid) {
        const runs = await trx.selectFrom('voucher_recurrence_runs').select('period').where('recurrence_id', '=', rid).execute();
        if (runs.length) {
          const slots = new Set(periodsOf({ frequency: b.frequency, day_of_month: b.dayOfMonth, start_month: b.startMonth, end_month: b.endMonth ?? null }, '9999-12-31').map((s) => s.period));
          const lost = runs.filter((x) => !slots.has(x.period)).map((x) => x.period);
          if (lost.length) throw Errors.validation(`Lịch mới không còn chứa kỳ đã sinh phiếu (${lost.join(', ')}); hãy ngừng lịch này và tạo lịch mới`);
        }
        const res = await trx.updateTable('voucher_recurrences').set(values).where('tenant_id', '=', auth.tenantId).where('id', '=', rid).executeTakeFirst();
        if (!Number(res.numUpdatedRows)) throw Errors.notFound(`bút toán lặp ${rid}`);
      } else {
        rid = (await trx.insertInto('voucher_recurrences').values({ tenant_id: auth.tenantId, ...values }).returning('id').executeTakeFirstOrThrow()).id;
      }
      await writeAudit(trx, { tenantId: auth.tenantId, actor: auth.actor, action: 'voucher_recurrence.save', objectType: 'voucher_recurrence', objectId: rid, after: b });
      return { id: rid };
    });
  };

  r.post('/api/v1/voucher-recurrences', {
    preHandler: write,
    schema: { tags, summary: 'Thêm bút toán lặp', body: voucherRecurrenceInputSchema },
    handler: async (req, reply) => reply.status(201).send(ok(await saveRecurrence(authOf(req), null, req.body))),
  });

  r.put('/api/v1/voucher-recurrences/:id', {
    preHandler: write,
    schema: { tags, summary: 'Sửa bút toán lặp', params: idParamSchema, body: voucherRecurrenceInputSchema },
    handler: async (req) => ok(await saveRecurrence(authOf(req), req.params.id, req.body)),
  });

  r.delete('/api/v1/voucher-recurrences/:id', {
    preHandler: write,
    schema: { tags, summary: 'Xoá bút toán lặp chưa sinh phiếu nào', params: idParamSchema },
    handler: async (req) => {
      const auth = authOf(req);
      const runs = await db.selectFrom('voucher_recurrence_runs').select('id').where('tenant_id', '=', auth.tenantId).where('recurrence_id', '=', req.params.id).executeTakeFirst();
      if (runs) throw Errors.conflict('Bút toán lặp đã sinh phiếu, không xoá được; hãy ngừng dùng');
      await db.transaction().execute(async (trx) => {
        await trx.deleteFrom('voucher_recurrences').where('tenant_id', '=', auth.tenantId).where('id', '=', req.params.id).execute();
        await writeAudit(trx, { tenantId: auth.tenantId, actor: auth.actor, action: 'voucher_recurrence.delete', objectType: 'voucher_recurrence', objectId: req.params.id });
      });
      return ok({ id: req.params.id });
    },
  });

  r.get('/api/v1/voucher-recurrences/due', {
    preHandler: read,
    schema: { tags, summary: 'Các kỳ đến hạn chưa sinh phiếu', querystring: z.object({ to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional() }) },
    handler: async (req) => {
      const auth = authOf(req);
      const now = new Date();
      const to = req.query.to ?? `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate())}`;
      const recs = await db
        .selectFrom('voucher_recurrences as r')
        .innerJoin('voucher_templates as t', (j) => j.onRef('t.tenant_id', '=', 'r.tenant_id').onRef('t.code', '=', 'r.template_code'))
        .selectAll('r')
        .select(['t.name as template_name', 't.doc_type', 't.voucher', 't.is_active as template_active'])
        .where('r.tenant_id', '=', auth.tenantId)
        .where('r.is_active', '=', true)
        .execute();
      const runs = recs.length
        ? await db.selectFrom('voucher_recurrence_runs').select(['recurrence_id', 'period']).where('recurrence_id', 'in', recs.map((x) => x.id)).execute()
        : [];
      const done = new Set(runs.map((x) => `${x.recurrence_id}|${x.period}`));
      const out = recs.flatMap((x) => {
        const v = x.voucher as VoucherTemplateInput;
        const freq = x.frequency as RecurrenceFrequency;
        return periodsOf(x, to)
          .filter((p) => !done.has(`${x.id}|${p.period}`))
          .map((p) => ({
            recurrenceId: x.id, period: p.period, periodLabel: periodLabel(p.docDate, freq), docDate: p.docDate,
            name: x.name || x.template_name, templateCode: x.template_code, docType: x.doc_type, branchCode: x.branch_code || v.branchCode,
            description: fillPeriodText(v.description, p.docDate, freq), total: totalOf(v),
            problem: !x.template_active ? 'Mẫu đang ngừng dùng' : v.lines.some((l) => !(l.amount > 0)) ? 'Mẫu có dòng chưa nhập số tiền' : !(x.branch_code || v.branchCode) ? 'Chưa chọn chi nhánh' : null,
          }));
      });
      out.sort((a, b) => a.docDate.localeCompare(b.docDate) || a.name.localeCompare(b.name));
      return ok(out, { to } as never);
    },
  });

  r.post('/api/v1/voucher-recurrences/generate', {
    preHandler: write,
    schema: {
      tags,
      summary: 'Sinh phiếu cho các kỳ đến hạn',
      description: 'Mỗi kỳ sinh trong một giao dịch riêng: kỳ lỗi không chặn kỳ khác. Kỳ đã sinh thì báo lỗi, không sinh trùng.',
      body: z.object({ items: z.array(z.object({ recurrenceId: z.string().regex(/^[1-9][0-9]*$/), period: z.string().regex(/^\d{4}-\d{2}$/) })).min(1).max(200) }),
    },
    handler: async (req) => {
      const auth = authOf(req);
      const results = [];
      for (const it of req.body.items) {
        try {
          const c = await generateOne(auth, it.recurrenceId, it.period);
          results.push({ ...it, ok: true as const, documentId: c.id, docNo: c.docNo });
        } catch (e) {
          results.push({ ...it, ok: false as const, error: e instanceof Error ? e.message : String(e) });
        }
      }
      return ok(results);
    },
  });
}
