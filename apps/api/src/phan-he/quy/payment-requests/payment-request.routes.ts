// @bizcity-layer D modules/quy
/**
 * Yêu cầu thanh toán: đề nghị chi → duyệt một / hai cấp → lập phiếu chi hoặc báo nợ.
 *   GET  /api/v1/payment-requests?status=&partnerCode=&from=&to=
 *   GET  /api/v1/payment-requests/:id
 *   POST /api/v1/payment-requests                 lập (nháp, hoặc gửi duyệt luôn với submit = true)
 *   PUT  /api/v1/payment-requests/:id             sửa khi còn nháp / bị từ chối
 *   POST /api/v1/payment-requests/:id/submit      gửi duyệt
 *   POST /api/v1/payment-requests/:id/approve     duyệt (cấp 1: payments:approve; cấp 2: payments:approve-final)
 *   POST /api/v1/payment-requests/:id/reject      từ chối, kèm lý do
 *   POST /api/v1/payment-requests/:id/cancel      huỷ (chưa chi)
 *   POST /api/v1/payment-requests/:id/pay         lập phiếu chi / báo nợ, tự trừ vào các khoản công nợ đã chọn
 *   GET / PUT /api/v1/payment-request-settings    ngưỡng số tiền cần cấp duyệt thứ hai
 */
import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { sql } from 'kysely';
import { z } from 'zod';
import { fromCents, toCents, voucherInputSchema } from '@ketoan/contracts';
import { db, toNumber, type Db } from '../../../db/client.js';
import { authOf, requirePermission, type AuthContext } from '../../../core/auth.js';
import { Errors } from '../../../core/errors.js';
import { idParamSchema, ok } from '../../../core/http.js';
import { writeAudit } from '../../../core/audit.js';
import { voucherService } from '../../../modules/vouchers/voucher.service.js';

const tags = ['Yêu cầu thanh toán'];
const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
export const PAYMENT_REQUEST_STATUS = { draft: 'Nháp', submitted: 'Chờ duyệt', approved1: 'Đã duyệt cấp 1', approved: 'Đã duyệt', rejected: 'Bị từ chối', paid: 'Đã chi', cancelled: 'Đã huỷ' } as const;

const bodySchema = z.object({
  requestDate: day,
  branchCode: z.string().trim().min(1).max(32),
  partnerCode: z.string().trim().min(1).max(64),
  dueDate: day.optional(),
  method: z.enum(['cash', 'bank']).default('bank'),
  description: z.string().trim().max(1000).default(''),
  sourceRef: z.string().trim().max(255).default('').describe('Chứng từ nguồn: số hợp đồng, đơn đặt hàng…'),
  items: z.array(z.object({ debtItemId: z.string().regex(/^[1-9][0-9]*$/), amount: z.number().finite().positive() })).max(200).default([]).describe('Các khoản phải trả đề nghị thanh toán'),
  amount: z.number().finite().positive().optional().describe('Số tiền, khi không chọn khoản công nợ nào'),
  debitAccount: z.string().trim().max(20).optional().describe('Tài khoản ghi Nợ, khi không chọn khoản công nợ nào'),
  contractScheduleId: z.string().regex(/^[1-9][0-9]*$/).optional(),
  submit: z.boolean().default(false),
});
type Body = z.infer<typeof bodySchema>;
interface StoredItem { debtItemId: string; docNo: string; accountCode: string; amount: number }

async function nextNo(trx: Db, tenantId: string, year: number): Promise<string> {
  const row = await trx
    .insertInto('document_sequences')
    .values({ tenant_id: tenantId, doc_type: 'payment_request', year, last_no: 1 })
    .onConflict((oc) => oc.columns(['tenant_id', 'doc_type', 'year']).doUpdateSet({ last_no: sql`document_sequences.last_no + 1` }))
    .returning('last_no')
    .executeTakeFirstOrThrow();
  return `YC${String(year).slice(2)}-${String(row.last_no).padStart(5, '0')}`;
}

/** Kiểm nội dung yêu cầu và dựng các trường lưu. */
async function resolve(trx: Db, auth: AuthContext, b: Body, selfId?: string) {
  const partner = await trx.selectFrom('partners').select(['id', 'is_active']).where('tenant_id', '=', auth.tenantId).where('code', '=', b.partnerCode).executeTakeFirst();
  if (!partner) throw Errors.validation(`Mã đối tượng này không tồn tại: ${b.partnerCode}`);
  const branch = await trx.selectFrom('branches').select('id').where('tenant_id', '=', auth.tenantId).where('code', '=', b.branchCode).executeTakeFirst();
  if (!branch) throw Errors.validation(`Chi nhánh ${b.branchCode} chưa khai báo`);
  let items: StoredItem[] = [];
  let amount = b.amount ?? 0;
  if (b.items.length) {
    const rows = await trx.selectFrom('debt_items').selectAll().where('tenant_id', '=', auth.tenantId).where('id', 'in', b.items.map((i) => i.debtItemId)).execute();
    items = b.items.map((i) => {
      const r = rows.find((x) => x.id === i.debtItemId);
      if (!r) throw Errors.validation('Khoản công nợ được chọn không còn tồn tại');
      if (r.partner_id !== partner.id) throw Errors.validation(`Chứng từ ${r.doc_no} không thuộc đối tượng ${b.partnerCode}`);
      if (r.side !== 'credit') throw Errors.validation(`Chứng từ ${r.doc_no} không phải khoản phải trả`);
      const left = toCents(toNumber(r.amount)) - toCents(toNumber(r.settled_amount));
      if (toCents(i.amount) > left) throw Errors.validation(`Số đề nghị ${i.amount.toLocaleString('vi-VN')} lớn hơn phần còn lại ${fromCents(left).toLocaleString('vi-VN')} của chứng từ ${r.doc_no}`);
      return { debtItemId: r.id, docNo: r.doc_no, accountCode: r.account_code, amount: i.amount };
    });
    amount = fromCents(items.reduce((s, i) => s + toCents(i.amount), 0));
  } else {
    if (!(amount > 0)) throw Errors.validation('Cần chọn khoản công nợ hoặc nhập số tiền');
    if (!b.debitAccount) throw Errors.validation('Khoản chi chưa ghi công nợ: cần chọn tài khoản ghi Nợ');
    const acc = await trx.selectFrom('accounts').select(['is_posting']).where('tenant_id', '=', auth.tenantId).where('code', '=', b.debitAccount).executeTakeFirst();
    if (!acc?.is_posting) throw Errors.validation(`Tài khoản ${b.debitAccount} chưa có hoặc không phải tài khoản chi tiết`);
  }
  if (b.contractScheduleId) {
    const s = await trx.selectFrom('contract_schedules').select(['id', 'status']).where('tenant_id', '=', auth.tenantId).where('id', '=', b.contractScheduleId).executeTakeFirst();
    if (!s) throw Errors.validation('Kỳ thanh toán hợp đồng không tồn tại');
    if (s.status !== 'pending') throw Errors.conflict('Kỳ hợp đồng này không còn ở trạng thái chưa trả');
    // Một kỳ hợp đồng chỉ một yêu cầu thanh toán đang hiệu lực.
    let dup = trx.selectFrom('payment_requests').select('request_no').where('tenant_id', '=', auth.tenantId).where('contract_schedule_id', '=', b.contractScheduleId).where('status', 'not in', ['rejected', 'cancelled']);
    if (selfId) dup = dup.where('id', '<>', selfId);
    const d = await dup.executeTakeFirst();
    if (d) throw Errors.conflict(`Kỳ hợp đồng này đã có yêu cầu thanh toán ${d.request_no}`);
  }
  return {
    request_date: b.requestDate, branch_code: b.branchCode, partner_id: partner.id, amount, due_date: b.dueDate ?? null, method: b.method,
    debit_account: items.length ? null : b.debitAccount ?? null, description: b.description, source_ref: b.sourceRef, items: JSON.stringify(items),
    contract_schedule_id: b.contractScheduleId ?? null,
  };
}

async function levelsFor(trx: Db, tenantId: string, amount: number): Promise<1 | 2> {
  const s = await trx.selectFrom('payment_request_settings').select('second_level_from').where('tenant_id', '=', tenantId).executeTakeFirst();
  return s?.second_level_from && amount >= toNumber(s.second_level_from) ? 2 : 1;
}

async function load(trx: Db, tenantId: string, id: string, lock = false) {
  let q = trx.selectFrom('payment_requests').selectAll().where('tenant_id', '=', tenantId).where('id', '=', id);
  if (lock) q = q.forUpdate();
  const r = await q.executeTakeFirst();
  if (!r) throw Errors.notFound('yêu cầu thanh toán');
  return r;
}

export async function paymentRequestRoutes(app: FastifyInstance): Promise<void> {
  const r = app.withTypeProvider<ZodTypeProvider>();
  const read = requirePermission('documents:read');
  const write = requirePermission('documents:write');

  const list = async (auth: AuthContext, f: { status?: string; partnerCode?: string; from?: string; to?: string; id?: string }) => {
    let q = db
      .selectFrom('payment_requests as r')
      .innerJoin('partners as p', 'p.id', 'r.partner_id')
      .leftJoin('accounting_events as d', 'd.id', 'r.paid_event_id')
      .selectAll('r')
      .select(['p.code as partner_code', 'p.name as partner_name', 'p.bank_account_no', 'p.bank_account_holder', 'p.bank_name', 'd.doc_no as paid_doc_no'])
      .where('r.tenant_id', '=', auth.tenantId);
    if (f.id) q = q.where('r.id', '=', f.id);
    if (f.status === 'pending') q = q.where('r.status', 'in', ['submitted', 'approved1']);
    else if (f.status) q = q.where('r.status', '=', f.status);
    if (f.partnerCode) q = q.where('p.code', '=', f.partnerCode);
    if (f.from) q = q.where('r.request_date', '>=', f.from);
    if (f.to) q = q.where('r.request_date', '<=', f.to);
    const rows = await q.orderBy('r.request_date', 'desc').orderBy('r.id', 'desc').execute();
    return rows.map((x) => ({
      id: x.id, requestNo: x.request_no, requestDate: x.request_date, branchCode: x.branch_code, partnerCode: x.partner_code, partnerName: x.partner_name,
      partnerBank: { accountNo: x.bank_account_no, holder: x.bank_account_holder, bankName: x.bank_name },
      amount: toNumber(x.amount), dueDate: x.due_date, method: x.method, debitAccount: x.debit_account, description: x.description, sourceRef: x.source_ref,
      items: x.items as unknown as StoredItem[], contractScheduleId: x.contract_schedule_id,
      status: x.status, statusLabel: PAYMENT_REQUEST_STATUS[x.status as keyof typeof PAYMENT_REQUEST_STATUS] ?? x.status, levelsRequired: x.levels_required,
      createdBy: x.created_by, createdByName: x.created_by_name, submittedAt: x.submitted_at,
      approved1By: x.approved1_by, approved1At: x.approved1_at, approved2By: x.approved2_by, approved2At: x.approved2_at,
      rejectedBy: x.rejected_by, rejectedReason: x.rejected_reason, paidDocumentId: x.paid_event_id, paidDocNo: x.paid_doc_no,
    }));
  };

  r.get('/api/v1/payment-requests', {
    preHandler: read,
    schema: { tags, summary: 'Danh sách yêu cầu thanh toán', querystring: z.object({ status: z.string().optional().describe('draft, submitted, approved1, approved, rejected, paid, cancelled; pending = đang chờ duyệt'), partnerCode: z.string().optional(), from: day.optional(), to: day.optional() }) },
    handler: async (req) => ok(await list(authOf(req), req.query)),
  });

  r.get('/api/v1/payment-requests/:id', {
    preHandler: read,
    schema: { tags, summary: 'Một yêu cầu thanh toán', params: idParamSchema },
    handler: async (req) => {
      const [row] = await list(authOf(req), { id: req.params.id });
      if (!row) throw Errors.notFound('yêu cầu thanh toán');
      return ok(row);
    },
  });

  r.post('/api/v1/payment-requests', {
    preHandler: write,
    schema: { tags, summary: 'Lập yêu cầu thanh toán', body: bodySchema },
    handler: async (req, reply) => {
      const auth = authOf(req);
      const out = await db.transaction().execute(async (trx) => {
        const values = await resolve(trx, auth, req.body);
        const requestNo = await nextNo(trx, auth.tenantId, Number(req.body.requestDate.slice(0, 4)));
        const submit = req.body.submit;
        const row = await trx.insertInto('payment_requests').values({
          tenant_id: auth.tenantId, request_no: requestNo, ...values, status: submit ? 'submitted' : 'draft', submitted_at: submit ? new Date() : null,
          levels_required: await levelsFor(trx, auth.tenantId, values.amount), created_by: auth.actor, created_by_name: auth.actorName,
        }).returning(['id', 'request_no', 'status']).executeTakeFirstOrThrow();
        await writeAudit(trx, { tenantId: auth.tenantId, actor: auth.actor, action: 'payment_request.create', objectType: 'payment_request', objectId: requestNo, after: req.body });
        return { id: row.id, requestNo: row.request_no, status: row.status };
      });
      return reply.status(201).send(ok(out));
    },
  });

  r.put('/api/v1/payment-requests/:id', {
    preHandler: write,
    schema: { tags, summary: 'Sửa yêu cầu thanh toán (nháp hoặc bị từ chối)', params: idParamSchema, body: bodySchema },
    handler: async (req) => {
      const auth = authOf(req);
      await db.transaction().execute(async (trx) => {
        const cur = await load(trx, auth.tenantId, req.params.id, true);
        if (!['draft', 'rejected'].includes(cur.status)) throw Errors.conflict('Chỉ sửa được yêu cầu còn nháp hoặc bị từ chối');
        if (cur.created_by !== auth.actor && !auth.permissions.has('documents:edit-all')) throw Errors.forbidden('Bạn chỉ sửa được yêu cầu do chính mình lập');
        const values = await resolve(trx, auth, req.body, cur.id);
        const submit = req.body.submit;
        await trx.updateTable('payment_requests').set({
          ...values, status: submit ? 'submitted' : 'draft', submitted_at: submit ? new Date() : null, levels_required: await levelsFor(trx, auth.tenantId, values.amount),
          approved1_by: null, approved1_at: null, approved2_by: null, approved2_at: null, rejected_by: null, rejected_reason: '', updated_at: new Date(),
        }).where('id', '=', cur.id).execute();
        await writeAudit(trx, { tenantId: auth.tenantId, actor: auth.actor, action: 'payment_request.update', objectType: 'payment_request', objectId: cur.request_no, after: req.body });
      });
      return ok({ id: req.params.id });
    },
  });

  /** Đổi trạng thái có kiểm trạng thái hiện tại. */
  const transition = (action: string, run: (trx: Db, auth: AuthContext, cur: Awaited<ReturnType<typeof load>>, body: Record<string, unknown>) => Promise<Record<string, unknown>>) =>
    async (auth: AuthContext, id: string, body: Record<string, unknown> = {}) =>
      db.transaction().execute(async (trx) => {
        const cur = await load(trx, auth.tenantId, id, true);
        const patch = await run(trx, auth, cur, body);
        await trx.updateTable('payment_requests').set({ ...patch, updated_at: new Date() }).where('id', '=', cur.id).execute();
        await writeAudit(trx, { tenantId: auth.tenantId, actor: auth.actor, action: `payment_request.${action}`, objectType: 'payment_request', objectId: cur.request_no, after: { ...body, status: patch.status } });
        return { id: cur.id, requestNo: cur.request_no, status: patch.status as string };
      });

  const submit = transition('submit', async (trx, auth, cur) => {
    if (!['draft', 'rejected'].includes(cur.status)) throw Errors.conflict('Yêu cầu đã được gửi duyệt');
    return { status: 'submitted', submitted_at: new Date(), levels_required: await levelsFor(trx, auth.tenantId, toNumber(cur.amount)), rejected_by: null, rejected_reason: '' };
  });
  const approve = transition('approve', async (_trx, auth, cur) => {
    if (cur.status === 'submitted') {
      if (!auth.permissions.has('payments:approve')) throw Errors.forbidden('Bạn không có quyền duyệt yêu cầu thanh toán');
      return cur.levels_required === 2
        ? { status: 'approved1', approved1_by: auth.actorName, approved1_at: new Date() }
        : { status: 'approved', approved1_by: auth.actorName, approved1_at: new Date() };
    }
    if (cur.status === 'approved1') {
      if (!auth.permissions.has('payments:approve-final')) throw Errors.forbidden('Yêu cầu vượt ngưỡng: cần người có quyền duyệt cấp 2');
      return { status: 'approved', approved2_by: auth.actorName, approved2_at: new Date() };
    }
    throw Errors.conflict('Yêu cầu không ở trạng thái chờ duyệt');
  });
  const reject = transition('reject', async (_trx, auth, cur, body) => {
    if (!['submitted', 'approved1'].includes(cur.status)) throw Errors.conflict('Yêu cầu không ở trạng thái chờ duyệt');
    if (!auth.permissions.has(cur.status === 'approved1' ? 'payments:approve-final' : 'payments:approve')) throw Errors.forbidden('Bạn không có quyền duyệt yêu cầu thanh toán');
    return { status: 'rejected', rejected_by: auth.actorName, rejected_reason: String(body.reason ?? '') };
  });
  const cancel = transition('cancel', async (_trx, auth, cur) => {
    if (cur.status === 'paid') throw Errors.conflict('Yêu cầu đã chi; muốn huỷ thì huỷ phiếu chi trước');
    if (cur.status === 'cancelled') throw Errors.conflict('Yêu cầu đã huỷ');
    if (cur.created_by !== auth.actor && !auth.permissions.has('documents:edit-all')) throw Errors.forbidden('Bạn chỉ huỷ được yêu cầu do chính mình lập');
    return { status: 'cancelled' };
  });
  const pay = transition('pay', async (trx, auth, cur, body) => {
    if (cur.status !== 'approved') throw Errors.conflict('Yêu cầu chưa được duyệt xong, chưa lập phiếu chi được');
    const moneyAccount = String(body.moneyAccount);
    const docDate = String(body.docDate);
    const partner = await trx.selectFrom('partners').select(['code', 'name']).where('id', '=', cur.partner_id).executeTakeFirstOrThrow();
    const items = cur.items as unknown as StoredItem[];
    const description = cur.description || `Thanh toán theo yêu cầu ${cur.request_no}`;
    // Mỗi tài khoản công nợ một dòng; khoản chi chưa ghi công nợ thì một dòng theo tài khoản ghi Nợ đã khai.
    const byAccount = new Map<string, number>();
    for (const i of items) byAccount.set(i.accountCode, (byAccount.get(i.accountCode) ?? 0) + toCents(i.amount));
    const lines = items.length
      ? [...byAccount].map(([debitAccount, cents]) => ({ debitAccount, creditAccount: moneyAccount, amount: fromCents(cents), description }))
      : [{ debitAccount: cur.debit_account!, creditAccount: moneyAccount, amount: toNumber(cur.amount), description }];
    const input = voucherInputSchema.parse({
      docType: moneyAccount.startsWith('112') ? 'bank_payment' : 'payment',
      branchCode: cur.branch_code, docDate, description, counterparty: String(body.counterparty ?? '') || partner.name, partnerCode: partner.code,
      reference: `Yêu cầu thanh toán ${cur.request_no}`, lines,
      // Chi chưa ghi công nợ mà ghi Nợ TK phải trả (331…): là khoản trả trước / đặt cọc cho nhà cung cấp.
      purpose: !items.length && cur.debit_account?.startsWith('331') ? 'deposit_paid' : undefined,
      settle: items.length ? items.map((i) => ({ debtItemId: i.debtItemId, amount: i.amount })) : undefined,
    });
    const created = await voucherService.createIn(trx, auth, input);
    if (cur.contract_schedule_id) {
      await trx.updateTable('contract_schedules').set({ status: 'paid', paid_date: docDate, paid_ref: created.docNo, updated_by: auth.actor, updated_at: new Date() }).where('id', '=', cur.contract_schedule_id).execute();
    }
    return { status: 'paid', paid_event_id: created.id };
  });

  r.post('/api/v1/payment-requests/:id/submit', { preHandler: write, schema: { tags, summary: 'Gửi duyệt', params: idParamSchema }, handler: async (req) => ok(await submit(authOf(req), req.params.id)) });
  r.post('/api/v1/payment-requests/:id/approve', { preHandler: read, schema: { tags, summary: 'Duyệt (cấp 1 hoặc cấp 2 tuỳ trạng thái)', params: idParamSchema }, handler: async (req) => ok(await approve(authOf(req), req.params.id)) });
  r.post('/api/v1/payment-requests/:id/reject', {
    preHandler: read,
    schema: { tags, summary: 'Từ chối', params: idParamSchema, body: z.object({ reason: z.string().trim().min(1, 'Cần ghi lý do từ chối').max(500) }) },
    handler: async (req) => ok(await reject(authOf(req), req.params.id, req.body)),
  });
  r.post('/api/v1/payment-requests/:id/cancel', { preHandler: write, schema: { tags, summary: 'Huỷ yêu cầu chưa chi', params: idParamSchema }, handler: async (req) => ok(await cancel(authOf(req), req.params.id)) });
  r.post('/api/v1/payment-requests/:id/pay', {
    preHandler: write,
    schema: {
      tags,
      summary: 'Lập phiếu chi / báo nợ từ yêu cầu đã duyệt',
      description: 'Tài khoản tiền 111… → phiếu chi; 112… → phiếu báo nợ. Phiếu ghi sổ ngay và trừ vào các khoản công nợ của yêu cầu.',
      params: idParamSchema,
      body: z.object({ docDate: day, moneyAccount: z.string().trim().min(3).max(20), counterparty: z.string().trim().max(255).optional() }),
    },
    handler: async (req) => {
      const auth = authOf(req);
      const out = await pay(auth, req.params.id, req.body);
      const [row] = await list(auth, { id: req.params.id });
      return ok({ ...out, paidDocumentId: row?.paidDocumentId, paidDocNo: row?.paidDocNo });
    },
  });

  r.get('/api/v1/payment-request-settings', {
    preHandler: read,
    schema: { tags, summary: 'Cấu hình duyệt yêu cầu thanh toán' },
    handler: async (req) => {
      const s = await db.selectFrom('payment_request_settings').select('second_level_from').where('tenant_id', '=', authOf(req).tenantId).executeTakeFirst();
      return ok({ secondLevelFrom: s?.second_level_from ? toNumber(s.second_level_from) : null });
    },
  });

  r.put('/api/v1/payment-request-settings', {
    preHandler: requirePermission('settings:write'),
    schema: { tags, summary: 'Đặt ngưỡng cần cấp duyệt thứ hai', body: z.object({ secondLevelFrom: z.number().positive().nullable().describe('null = mọi yêu cầu chỉ một cấp duyệt') }) },
    handler: async (req) => {
      const auth = authOf(req);
      const values = { second_level_from: req.body.secondLevelFrom, updated_by: auth.actorName, updated_at: new Date() };
      await db.insertInto('payment_request_settings').values({ tenant_id: auth.tenantId, ...values }).onConflict((oc) => oc.column('tenant_id').doUpdateSet(values)).execute();
      return ok(req.body);
    },
  });
}
