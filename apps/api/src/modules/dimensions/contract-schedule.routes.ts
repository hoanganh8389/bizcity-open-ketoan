/**
 * Lịch thanh toán hợp đồng.
 *   GET /api/v1/contracts/:code/schedules       các kỳ của một hợp đồng
 *   PUT /api/v1/contracts/:code/schedules       thay toàn bộ lịch của hợp đồng (kỳ đã trả giữ nguyên trạng thái nếu gửi lại cùng số kỳ)
 *   PATCH /api/v1/contract-schedules/:id        đánh dấu đã trả / chưa trả / huỷ một kỳ
 *   GET /api/v1/contract-schedules?from=&to=&status=&type=   các kỳ đến hạn của mọi hợp đồng (nhắc hạn)
 */
import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { db, toNumber } from '../../db/client.js';
import { authOf, requirePermission } from '../../core/auth.js';
import { Errors } from '../../core/errors.js';
import { ok } from '../../core/http.js';
import { writeAudit } from '../../core/audit.js';

const tags = ['Danh mục: Hợp đồng'];
const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Ngày dạng YYYY-MM-DD');
const STATUS = ['pending', 'paid', 'cancelled'] as const;

async function contractOf(tenantId: string, code: string) {
  const c = await db.selectFrom('dimensions').select(['code', 'name', 'extra']).where('tenant_id', '=', tenantId).where('kind', '=', 'contract').where('code', '=', code).executeTakeFirst();
  if (!c) throw Errors.notFound(`hợp đồng ${code}`);
  return c;
}

const toDto = (s: { id: string; contract_code: string; seq: number; due_date: string; amount: string; tax_amount: string; description: string; status: string; paid_date: string | null; paid_ref: string }) => ({
  id: s.id, contractCode: s.contract_code, seq: s.seq, dueDate: s.due_date, amount: toNumber(s.amount), taxAmount: toNumber(s.tax_amount),
  description: s.description, status: s.status, paidDate: s.paid_date, paidRef: s.paid_ref,
});

export async function contractScheduleRoutes(app: FastifyInstance): Promise<void> {
  const r = app.withTypeProvider<ZodTypeProvider>();

  r.get('/api/v1/contracts/:code/schedules', {
    preHandler: requirePermission('catalog:read'),
    schema: { tags, summary: 'Lịch thanh toán của một hợp đồng', params: z.object({ code: z.string().min(1) }) },
    handler: async (req) => {
      const auth = authOf(req);
      await contractOf(auth.tenantId, req.params.code);
      const rows = await db.selectFrom('contract_schedules').selectAll().where('tenant_id', '=', auth.tenantId).where('contract_code', '=', req.params.code).orderBy('seq').execute();
      return ok(rows.map(toDto));
    },
  });

  r.put('/api/v1/contracts/:code/schedules', {
    preHandler: requirePermission('catalog:write'),
    schema: {
      tags,
      summary: 'Lưu lịch thanh toán của hợp đồng (thay toàn bộ)',
      params: z.object({ code: z.string().min(1) }),
      body: z.object({
        schedules: z.array(z.object({
          seq: z.number().int().positive(),
          dueDate: day,
          amount: z.number().min(0),
          taxAmount: z.number().min(0).default(0),
          description: z.string().trim().max(500).default(''),
          status: z.enum(STATUS).default('pending'),
          paidDate: day.nullish(),
          paidRef: z.string().trim().max(255).default(''),
        })).max(600),
      }),
    },
    handler: async (req) => {
      const auth = authOf(req);
      const code = req.params.code;
      await contractOf(auth.tenantId, code);
      const seqs = req.body.schedules.map((s) => s.seq);
      if (new Set(seqs).size !== seqs.length) throw Errors.validation('Số kỳ bị trùng');
      await db.transaction().execute(async (trx) => {
        await trx.deleteFrom('contract_schedules').where('tenant_id', '=', auth.tenantId).where('contract_code', '=', code).execute();
        if (req.body.schedules.length) {
          await trx.insertInto('contract_schedules').values(req.body.schedules.map((s) => ({
            tenant_id: auth.tenantId, contract_code: code, seq: s.seq, due_date: s.dueDate, amount: s.amount, tax_amount: s.taxAmount,
            description: s.description, status: s.status, paid_date: s.status === 'paid' ? s.paidDate ?? null : null, paid_ref: s.paidRef, updated_by: auth.actor,
          }))).execute();
        }
        await writeAudit(trx, { tenantId: auth.tenantId, actor: auth.actor, action: 'contract_schedule.save', objectType: 'contract', objectId: code, after: { periods: req.body.schedules.length } });
      });
      return ok({ code, periods: req.body.schedules.length });
    },
  });

  r.patch('/api/v1/contract-schedules/:id', {
    preHandler: requirePermission('catalog:write'),
    schema: {
      tags,
      summary: 'Đánh dấu một kỳ đã trả / chưa trả / huỷ',
      params: z.object({ id: z.string().regex(/^\d+$/) }),
      body: z.object({ status: z.enum(STATUS), paidDate: day.nullish(), paidRef: z.string().trim().max(255).default('') }),
    },
    handler: async (req) => {
      const auth = authOf(req);
      const b = req.body;
      const res = await db.updateTable('contract_schedules')
        .set({ status: b.status, paid_date: b.status === 'paid' ? b.paidDate ?? new Date().toISOString().slice(0, 10) : null, paid_ref: b.status === 'paid' ? b.paidRef : '', updated_by: auth.actor, updated_at: new Date() })
        .where('tenant_id', '=', auth.tenantId).where('id', '=', req.params.id)
        .returningAll().executeTakeFirst();
      if (!res) throw Errors.notFound('kỳ thanh toán');
      await writeAudit(db, { tenantId: auth.tenantId, actor: auth.actor, action: 'contract_schedule.status', objectType: 'contract', objectId: `${res.contract_code}#${res.seq}`, after: b });
      return ok(toDto(res));
    },
  });

  r.get('/api/v1/contract-schedules', {
    preHandler: requirePermission('catalog:read'),
    schema: {
      tags,
      summary: 'Các kỳ thanh toán hợp đồng đến hạn (nhắc hạn)',
      querystring: z.object({ from: day.optional(), to: day, status: z.enum([...STATUS, 'all']).default('pending'), type: z.string().trim().optional() }),
    },
    handler: async (req) => {
      const auth = authOf(req);
      const q = req.query;
      let sel = db
        .selectFrom('contract_schedules as s')
        .innerJoin('dimensions as c', (j) => j.onRef('c.tenant_id', '=', 's.tenant_id').onRef('c.code', '=', 's.contract_code').on('c.kind', '=', 'contract'))
        .selectAll('s')
        .select(['c.name as contract_name', 'c.extra'])
        .where('s.tenant_id', '=', auth.tenantId)
        .where('s.due_date', '<=', q.to);
      if (q.from) sel = sel.where('s.due_date', '>=', q.from);
      if (q.status !== 'all') sel = sel.where('s.status', '=', q.status);
      const rows = await sel.orderBy('s.due_date').orderBy('s.contract_code').orderBy('s.seq').execute();
      const extraOf = (x: unknown) => (x ?? {}) as { type?: string; partnerCode?: string };
      const filtered = q.type ? rows.filter((s) => extraOf(s.extra).type === q.type) : rows;
      const partnerCodes = [...new Set(filtered.map((s) => extraOf(s.extra).partnerCode).filter((c): c is string => Boolean(c)))];
      const partners = partnerCodes.length ? await db.selectFrom('partners').select(['code', 'name']).where('tenant_id', '=', auth.tenantId).where('code', 'in', partnerCodes).execute() : [];
      // Yêu cầu thanh toán đang hiệu lực đã lập từ kỳ (DM-012): một kỳ chỉ một yêu cầu.
      const ids = filtered.map((s) => s.id);
      const reqs = ids.length
        ? await db.selectFrom('payment_requests').select(['contract_schedule_id', 'request_no', 'status']).where('tenant_id', '=', auth.tenantId)
            .where('contract_schedule_id', 'in', ids).where('status', 'not in', ['rejected', 'cancelled']).execute()
        : [];
      const today = new Date().toISOString().slice(0, 10);
      return ok(filtered.map((s) => {
        const e = extraOf(s.extra);
        const pr = reqs.find((r) => r.contract_schedule_id === s.id);
        return {
          paymentRequestNo: pr?.request_no ?? '', paymentRequestStatus: pr?.status ?? '',
          ...toDto(s), contractName: s.contract_name, contractType: e.type ?? '', partnerCode: e.partnerCode ?? '',
          partnerName: partners.find((p) => p.code === e.partnerCode)?.name ?? '', overdue: s.status === 'pending' && s.due_date < today,
        };
      }));
    },
  });
}
