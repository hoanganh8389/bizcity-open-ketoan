// @bizcity-layer D modules/quy
/**
 * Yêu cầu thanh toán: đề nghị chi → duyệt một / hai cấp → lập phiếu chi hoặc báo nợ.
 * Mẫu đầu tiên chuyển sang defineAction (PHASES 2.5, bizcity_action@1 §9): mỗi thao tác là một action, runtime (core/actions.ts)
 * lo quyền, kiểm input, idempotency, giao dịch, bằng chứng, dry-run. Đường dẫn và khuôn phản hồi giữ như cũ.
 *   GET  /api/v1/payment-requests?status=&partnerCode=&from=&to=      quy.payment-request.list
 *   GET  /api/v1/payment-requests/:id                                 quy.payment-request.get
 *   POST /api/v1/payment-requests                 (Idempotency-Key)   quy.payment-request.create — nháp, hoặc gửi duyệt luôn với submit = true
 *   PUT  /api/v1/payment-requests/:id                                 quy.payment-request.update — khi còn nháp / bị từ chối
 *   POST /api/v1/payment-requests/:id/submit                          quy.payment-request.submit
 *   POST /api/v1/payment-requests/:id/approve                         quy.payment-request.approve — cấp 1: payments:approve; cấp 2: payments:approve-final
 *   POST /api/v1/payment-requests/:id/reject                          quy.payment-request.reject — kèm lý do
 *   POST /api/v1/payment-requests/:id/cancel                          quy.payment-request.cancel — chưa chi
 *   POST /api/v1/payment-requests/:id/pay[?dryRun=1] (Idempotency-Key) quy.payment-request.pay — lập phiếu chi / báo nợ, trừ công nợ đã chọn
 *   GET / PUT /api/v1/payment-request-settings                        quy.payment-request-settings.get / .update — ngưỡng cấp duyệt thứ hai
 */
import type { FastifyInstance } from 'fastify';
import { sql } from 'kysely';
import { z } from 'zod';
import { fromCents, toCents, voucherInputSchema } from '@ketoan/contracts';
import { toNumber, type Db } from '../../../db/client.js';
import type { Permission } from '../../../core/auth.js';
import { Errors } from '../../../core/errors.js';
import { idSchema } from '../../../core/http.js';
import { defineAction, mountActions, type ActionContext, type ActionDef, type ActionSideEffect, type AnyActionDef } from '../../../core/actions.js';
import { voucherService } from '../../../kernel/public.js';

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
async function resolve(trx: Db, tenantId: string, b: Body, selfId?: string) {
  const partner = await trx.selectFrom('partners').select(['id', 'is_active']).where('tenant_id', '=', tenantId).where('code', '=', b.partnerCode).executeTakeFirst();
  if (!partner) throw Errors.validation(`Mã đối tượng này không tồn tại: ${b.partnerCode}`);
  const branch = await trx.selectFrom('branches').select('id').where('tenant_id', '=', tenantId).where('code', '=', b.branchCode).executeTakeFirst();
  if (!branch) throw Errors.validation(`Chi nhánh ${b.branchCode} chưa khai báo`);
  let items: StoredItem[] = [];
  let amount = b.amount ?? 0;
  if (b.items.length) {
    const rows = await trx.selectFrom('debt_items').selectAll().where('tenant_id', '=', tenantId).where('id', 'in', b.items.map((i) => i.debtItemId)).execute();
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
    const acc = await trx.selectFrom('accounts').select(['is_posting']).where('tenant_id', '=', tenantId).where('code', '=', b.debitAccount).executeTakeFirst();
    if (!acc?.is_posting) throw Errors.validation(`Tài khoản ${b.debitAccount} chưa có hoặc không phải tài khoản chi tiết`);
  }
  if (b.contractScheduleId) {
    const s = await trx.selectFrom('contract_schedules').select(['id', 'status']).where('tenant_id', '=', tenantId).where('id', '=', b.contractScheduleId).executeTakeFirst();
    if (!s) throw Errors.validation('Kỳ thanh toán hợp đồng không tồn tại');
    if (s.status !== 'pending') throw Errors.conflict('Kỳ hợp đồng này không còn ở trạng thái chưa trả');
    // Một kỳ hợp đồng chỉ một yêu cầu thanh toán đang hiệu lực.
    let dup = trx.selectFrom('payment_requests').select('request_no').where('tenant_id', '=', tenantId).where('contract_schedule_id', '=', b.contractScheduleId).where('status', 'not in', ['rejected', 'cancelled']);
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

async function list(trx: Db, tenantId: string, f: { status?: string; partnerCode?: string; from?: string; to?: string; id?: string }) {
  let q = trx
    .selectFrom('payment_requests as r')
    .innerJoin('partners as p', 'p.id', 'r.partner_id')
    .leftJoin('accounting_events as d', 'd.id', 'r.paid_event_id')
    .selectAll('r')
    .select(['p.code as partner_code', 'p.name as partner_name', 'p.bank_account_no', 'p.bank_account_holder', 'p.bank_name', 'd.doc_no as paid_doc_no'])
    .where('r.tenant_id', '=', tenantId);
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
}

const idInput = z.object({ id: idSchema });
const prSchema = z.object({
  id: z.string(), requestNo: z.string(), requestDate: z.string(), branchCode: z.string(), partnerCode: z.string(), partnerName: z.string(),
  amount: z.number(), status: z.string(), statusLabel: z.string(), levelsRequired: z.number(),
}).passthrough();
const stateSchema = z.object({ id: z.string(), requestNo: z.string(), status: z.string() });

type Current = Awaited<ReturnType<typeof load>>;
type Patch = Record<string, unknown> & { status: string; extra?: Record<string, unknown> };

/**
 * Đổi trạng thái có kiểm trạng thái hiện tại. Mặc định idempotency 'natural': gửi lại thì trạng thái đã đổi, kiểm chặn, không tạo
 * thêm gì. Bằng chứng (audit_logs, mã action) do runtime ghi.
 */
function transition<B extends z.AnyZodObject>(def: {
  verb: string; title: string; permission: Permission; body: B;
  idempotency?: 'required' | 'natural'; dryRun?: boolean; errors?: ActionDef['errors']; sideEffects?: ActionSideEffect[];
  run: (ctx: ActionContext, cur: Current, body: z.infer<B>) => Promise<Patch>;
}): AnyActionDef {
  return defineAction({
    id: `quy.payment-request.${def.verb}`, title: def.title, tags, permission: def.permission, effect: 'write',
    idempotency: def.idempotency ?? 'natural', dryRun: def.dryRun, errors: def.errors ?? ['NOT_FOUND', 'CONFLICT', 'FORBIDDEN'],
    sideEffects: def.sideEffects ?? ['documents'],
    input: idInput.merge(def.body), output: stateSchema.passthrough(),
    expose: { http: { method: 'POST', path: `/api/v1/payment-requests/:id/${def.verb}` }, mcp: true, ai: 'deny' },
    evidence: { objectType: 'payment_request', objectId: (_i, o) => o.requestNo },
    handler: async (ctx, input) => {
      const trx = ctx.data.tx;
      const { id, ...body } = input as { id: string } & Record<string, unknown>;
      const cur = await load(trx, ctx.tenant.id, id, true);
      const { extra, ...set } = await def.run(ctx, cur, body as z.infer<B>);
      await trx.updateTable('payment_requests').set({ ...set, updated_at: new Date() }).where('id', '=', cur.id).execute();
      return { id: cur.id, requestNo: cur.request_no, status: set.status, ...extra };
    },
  });
}

export const paymentRequestActions: AnyActionDef[] = [
  defineAction({
    id: 'quy.payment-request.list', title: 'Danh sách yêu cầu thanh toán', tags, permission: 'documents:read', effect: 'read', idempotency: 'none',
    input: z.object({ status: z.string().optional().describe('draft, submitted, approved1, approved, rejected, paid, cancelled; pending = đang chờ duyệt'), partnerCode: z.string().optional(), from: day.optional(), to: day.optional() }),
    output: z.array(prSchema),
    expose: { http: { method: 'GET', path: '/api/v1/payment-requests' }, mcp: true, ai: 'read' },
    handler: (ctx, input) => list(ctx.data.tx, ctx.tenant.id, input),
  }),
  defineAction({
    id: 'quy.payment-request.get', title: 'Một yêu cầu thanh toán', tags, permission: 'documents:read', effect: 'read', idempotency: 'none',
    input: idInput, output: prSchema,
    expose: { http: { method: 'GET', path: '/api/v1/payment-requests/:id' }, mcp: true, ai: 'read' },
    handler: async (ctx, input) => {
      const [row] = await list(ctx.data.tx, ctx.tenant.id, { id: input.id });
      if (!row) throw Errors.notFound('yêu cầu thanh toán');
      return row;
    },
  }),
  defineAction({
    id: 'quy.payment-request.create', title: 'Lập yêu cầu thanh toán', tags, permission: 'documents:write', effect: 'write', idempotency: 'required', dryRun: true, sideEffects: ['documents'],
    description: 'Lập nháp, hoặc gửi duyệt luôn với submit = true.',
    input: bodySchema, output: stateSchema, errors: ['VALIDATION_ERROR', 'CONFLICT', 'IDEMPOTENCY_CONFLICT'],
    expose: { http: { method: 'POST', path: '/api/v1/payment-requests', status: 201 }, mcp: true, ai: 'propose' },
    evidence: { objectType: 'payment_request', objectId: (_i, o) => o.requestNo },
    handler: async (ctx, b) => {
      const trx = ctx.data.tx;
      const values = await resolve(trx, ctx.tenant.id, b);
      const requestNo = await nextNo(trx, ctx.tenant.id, Number(b.requestDate.slice(0, 4)));
      const row = await trx.insertInto('payment_requests').values({
        tenant_id: ctx.tenant.id, request_no: requestNo, ...values, status: b.submit ? 'submitted' : 'draft', submitted_at: b.submit ? new Date() : null,
        levels_required: await levelsFor(trx, ctx.tenant.id, values.amount), created_by: ctx.actor.id, created_by_name: ctx.actor.name,
      }).returning(['id', 'request_no', 'status']).executeTakeFirstOrThrow();
      return { id: row.id, requestNo: row.request_no, status: row.status };
    },
  }),
  defineAction({
    id: 'quy.payment-request.update', title: 'Sửa yêu cầu thanh toán (nháp hoặc bị từ chối)', tags, permission: 'documents:write', effect: 'write', idempotency: 'natural', sideEffects: ['documents'],
    input: idInput.merge(bodySchema), output: z.object({ id: z.string(), requestNo: z.string() }), errors: ['NOT_FOUND', 'VALIDATION_ERROR', 'CONFLICT', 'FORBIDDEN'],
    expose: { http: { method: 'PUT', path: '/api/v1/payment-requests/:id' }, mcp: true, ai: 'propose' },
    evidence: { objectType: 'payment_request', objectId: (_i, o) => o.requestNo },
    handler: async (ctx, input) => {
      const trx = ctx.data.tx;
      const { id, ...b } = input;
      const cur = await load(trx, ctx.tenant.id, id, true);
      if (!['draft', 'rejected'].includes(cur.status)) throw Errors.conflict('Chỉ sửa được yêu cầu còn nháp hoặc bị từ chối');
      if (cur.created_by !== ctx.actor.id && !ctx.can('documents:edit-all')) throw Errors.forbidden('Bạn chỉ sửa được yêu cầu do chính mình lập');
      const values = await resolve(trx, ctx.tenant.id, b, cur.id);
      await trx.updateTable('payment_requests').set({
        ...values, status: b.submit ? 'submitted' : 'draft', submitted_at: b.submit ? new Date() : null, levels_required: await levelsFor(trx, ctx.tenant.id, values.amount),
        approved1_by: null, approved1_at: null, approved2_by: null, approved2_at: null, rejected_by: null, rejected_reason: '', updated_at: new Date(),
      }).where('id', '=', cur.id).execute();
      return { id: cur.id, requestNo: cur.request_no };
    },
  }),
  transition({
    verb: 'submit', title: 'Gửi duyệt', permission: 'documents:write', body: z.object({}),
    run: async (ctx, cur) => {
      if (!['draft', 'rejected'].includes(cur.status)) throw Errors.conflict('Yêu cầu đã được gửi duyệt');
      return { status: 'submitted', submitted_at: new Date(), levels_required: await levelsFor(ctx.data.tx, ctx.tenant.id, toNumber(cur.amount)), rejected_by: null, rejected_reason: '' };
    },
  }),
  // Quyền vào là documents:read; cấp duyệt kiểm trong handler (payments:approve / payments:approve-final theo trạng thái).
  transition({
    verb: 'approve', title: 'Duyệt (cấp 1 hoặc cấp 2 tuỳ trạng thái)', permission: 'documents:read', body: z.object({}),
    run: async (ctx, cur) => {
      if (cur.status === 'submitted') {
        if (!ctx.can('payments:approve')) throw Errors.forbidden('Bạn không có quyền duyệt yêu cầu thanh toán');
        return cur.levels_required === 2
          ? { status: 'approved1', approved1_by: ctx.actor.name, approved1_at: new Date() }
          : { status: 'approved', approved1_by: ctx.actor.name, approved1_at: new Date() };
      }
      if (cur.status === 'approved1') {
        if (!ctx.can('payments:approve-final')) throw Errors.forbidden('Yêu cầu vượt ngưỡng: cần người có quyền duyệt cấp 2');
        return { status: 'approved', approved2_by: ctx.actor.name, approved2_at: new Date() };
      }
      throw Errors.conflict('Yêu cầu không ở trạng thái chờ duyệt');
    },
  }),
  transition({
    verb: 'reject', title: 'Từ chối', permission: 'documents:read', body: z.object({ reason: z.string().trim().min(1, 'Cần ghi lý do từ chối').max(500) }),
    run: async (ctx, cur, body) => {
      if (!['submitted', 'approved1'].includes(cur.status)) throw Errors.conflict('Yêu cầu không ở trạng thái chờ duyệt');
      if (!ctx.can(cur.status === 'approved1' ? 'payments:approve-final' : 'payments:approve')) throw Errors.forbidden('Bạn không có quyền duyệt yêu cầu thanh toán');
      return { status: 'rejected', rejected_by: ctx.actor.name, rejected_reason: body.reason };
    },
  }),
  transition({
    verb: 'cancel', title: 'Huỷ yêu cầu chưa chi', permission: 'documents:write', body: z.object({}),
    run: async (ctx, cur) => {
      if (cur.status === 'paid') throw Errors.conflict('Yêu cầu đã chi; muốn huỷ thì huỷ phiếu chi trước');
      if (cur.status === 'cancelled') throw Errors.conflict('Yêu cầu đã huỷ');
      if (cur.created_by !== ctx.actor.id && !ctx.can('documents:edit-all')) throw Errors.forbidden('Bạn chỉ huỷ được yêu cầu do chính mình lập');
      return { status: 'cancelled' };
    },
  }),
  // Chạm sổ: lập phiếu chi / báo nợ (voucherService → cửa ghi sổ). Gửi lặp sẽ tạo phiếu trùng nên idempotency bắt buộc;
  // ?dryRun=1 = xem trước phiếu và bút toán trong giao dịch rồi huỷ.
  transition({
    verb: 'pay', title: 'Lập phiếu chi / báo nợ từ yêu cầu đã duyệt', permission: 'documents:write', idempotency: 'required', dryRun: true, sideEffects: ['documents', 'ledger'],
    errors: ['NOT_FOUND', 'CONFLICT', 'FORBIDDEN', 'VALIDATION_ERROR', 'IDEMPOTENCY_CONFLICT', 'PERIOD_LOCKED', 'POSTING_FAILED'],
    body: z.object({ docDate: day, moneyAccount: z.string().trim().min(3).max(20), counterparty: z.string().trim().max(255).optional() }),
    run: async (ctx, cur, body) => {
      if (cur.status !== 'approved') throw Errors.conflict('Yêu cầu chưa được duyệt xong, chưa lập phiếu chi được');
      const trx = ctx.data.tx;
      const partner = await trx.selectFrom('partners').select(['code', 'name']).where('id', '=', cur.partner_id).executeTakeFirstOrThrow();
      const items = cur.items as unknown as StoredItem[];
      const description = cur.description || `Thanh toán theo yêu cầu ${cur.request_no}`;
      // Mỗi tài khoản công nợ một dòng; khoản chi chưa ghi công nợ thì một dòng theo tài khoản ghi Nợ đã khai.
      const byAccount = new Map<string, number>();
      for (const i of items) byAccount.set(i.accountCode, (byAccount.get(i.accountCode) ?? 0) + toCents(i.amount));
      const lines = items.length
        ? [...byAccount].map(([debitAccount, cents]) => ({ debitAccount, creditAccount: body.moneyAccount, amount: fromCents(cents), description }))
        : [{ debitAccount: cur.debit_account!, creditAccount: body.moneyAccount, amount: toNumber(cur.amount), description }];
      const input = voucherInputSchema.parse({
        docType: body.moneyAccount.startsWith('112') ? 'bank_payment' : 'payment',
        branchCode: cur.branch_code, docDate: body.docDate, description, counterparty: body.counterparty || partner.name, partnerCode: partner.code,
        reference: `Yêu cầu thanh toán ${cur.request_no}`, lines,
        // Chi chưa ghi công nợ mà ghi Nợ TK phải trả (331…): là khoản trả trước / đặt cọc cho nhà cung cấp.
        purpose: !items.length && cur.debit_account?.startsWith('331') ? 'deposit_paid' : undefined,
        settle: items.length ? items.map((i) => ({ debtItemId: i.debtItemId, amount: i.amount })) : undefined,
      });
      const created = await voucherService.createIn(trx, ctx.legacyAuth, input);
      if (cur.contract_schedule_id) {
        await trx.updateTable('contract_schedules').set({ status: 'paid', paid_date: body.docDate, paid_ref: created.docNo, updated_by: ctx.actor.id, updated_at: new Date() }).where('id', '=', cur.contract_schedule_id).execute();
      }
      ctx.evidence.note('voucher', created.docNo);
      return { status: 'paid', paid_event_id: created.id, extra: { paidDocumentId: created.id, paidDocNo: created.docNo } };
    },
  }),
  defineAction({
    id: 'quy.payment-request-settings.get', title: 'Cấu hình duyệt yêu cầu thanh toán', tags, permission: 'documents:read', effect: 'read', idempotency: 'none',
    input: z.object({}), output: z.object({ secondLevelFrom: z.number().nullable() }),
    expose: { http: { method: 'GET', path: '/api/v1/payment-request-settings' }, mcp: true, ai: 'read' },
    handler: async (ctx) => {
      const s = await ctx.data.tx.selectFrom('payment_request_settings').select('second_level_from').where('tenant_id', '=', ctx.tenant.id).executeTakeFirst();
      return { secondLevelFrom: s?.second_level_from ? toNumber(s.second_level_from) : null };
    },
  }),
  defineAction({
    id: 'quy.payment-request-settings.update', title: 'Đặt ngưỡng cần cấp duyệt thứ hai', tags, permission: 'settings:write', effect: 'write', idempotency: 'natural', sideEffects: ['settings'],
    input: z.object({ secondLevelFrom: z.number().positive().nullable().describe('null = mọi yêu cầu chỉ một cấp duyệt') }),
    output: z.object({ secondLevelFrom: z.number().nullable() }),
    expose: { http: { method: 'PUT', path: '/api/v1/payment-request-settings' }, ai: 'deny' },
    evidence: { objectType: 'payment_request_settings' },
    handler: async (ctx, input) => {
      const values = { second_level_from: input.secondLevelFrom, updated_by: ctx.actor.name, updated_at: new Date() };
      await ctx.data.tx.insertInto('payment_request_settings').values({ tenant_id: ctx.tenant.id, ...values }).onConflict((oc) => oc.column('tenant_id').doUpdateSet(values)).execute();
      return input;
    },
  }),
];

/** Gắn route HTTP cho các action yêu cầu thanh toán. */
export async function paymentRequestRoutes(app: FastifyInstance): Promise<void> {
  mountActions(app, paymentRequestActions);
}
