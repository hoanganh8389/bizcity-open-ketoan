// @bizcity-layer K kernel/subledgers/debts
// [2026-10-29 10:24 PM Johnny Chu - Chu Hoàng Anh] INIT — khởi tạo Bizcity Core Framework: sổ cái chỉ thêm, cửa nạp sự việc, CANON, hợp đồng, bộ kiểm chuẩn.
// [2026-10-30 09:58 AM Johnny Chu - Chu Hoàng Anh] PHASE-002 — nhãn lớp @bizcity-layer, đồ thị phụ thuộc mốc, bản nháp API module-sdk.
// [2026-11-01 04:39 PM Johnny Chu - Chu Hoàng Anh] PHASE-010 — dời từ apps/api/src/modules/debts/debt.routes.ts sang packages/kernel (@bizcity/kernel, D010-7 chặng 3); import Platform qua @bizcity/platform
/**
 * Khoản công nợ theo chứng từ và đối trừ.
 *   GET    /api/v1/debt-items                     danh sách khoản (lọc đối tượng, tài khoản, bên, còn mở, đến hạn…) + tổng còn lại
 *   GET    /api/v1/debt-items/:id/allocations     khoản này đã đối trừ với những chứng từ nào
 *   POST   /api/v1/debt-allocations               ghi các cặp đối trừ (người dùng chọn)
 *   POST   /api/v1/debt-allocations/auto          tự đối trừ theo hạn cũ trước
 *   DELETE /api/v1/debt-allocations/:id           gỡ một đối trừ
 * Ghi: action core.debt.{allocate,auto-allocate,unallocate} (W6, SC-ACT-1).
 */
import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { sql } from 'kysely';
import { z } from 'zod';
import { db, toNumber } from '@bizcity/platform/db/client';
import { authOf, requirePermission } from '@bizcity/platform/core/auth';
import { Errors } from '@bizcity/platform/core/errors';
import { idParamSchema, ok, pageMeta, pageQuerySchema } from '@bizcity/platform/core/http';
import { defineAction, mountActions, type AnyActionDef } from '@bizcity/platform/core/actions';
import { allocate, autoAllocate, unallocate } from './debt.service.js';

const tags = ['Công nợ theo chứng từ'];
const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const id = z.string().regex(/^[1-9][0-9]*$/);

export async function debtRoutes(app: FastifyInstance): Promise<void> {
  const r = app.withTypeProvider<ZodTypeProvider>();
  const read = requirePermission('ledger:read');
  const write = requirePermission('documents:write');

  r.get('/api/v1/debt-items', {
    preHandler: read,
    schema: {
      tags,
      summary: 'Khoản công nợ theo chứng từ',
      querystring: pageQuerySchema.extend({
        partnerCode: z.string().trim().optional(),
        groupCode: z.string().trim().optional().describe('Nhóm đối tượng'),
        account: z.string().trim().optional().describe('Đầu số tài khoản (131, 331…)'),
        side: z.enum(['debit', 'credit']).optional().describe('debit = khoản ghi Nợ, credit = khoản ghi Có'),
        status: z.enum(['open', 'settled', 'all']).default('open'),
        purpose: z.string().trim().optional().describe('Mục đích phiếu (deposit_received, deposit_paid…); nhiều mã cách nhau dấu phẩy'),
        from: day.optional().describe('Ngày chứng từ từ'),
        to: day.optional().describe('Ngày chứng từ đến'),
        dueTo: day.optional().describe('Hạn thanh toán đến ngày'),
        asOf: day.optional().describe('Ngày tính số ngày quá hạn; mặc định hôm nay'),
        branchCode: z.string().trim().optional(),
        search: z.string().trim().optional().describe('Số chứng từ'),
      }),
    },
    handler: async (req) => {
      const auth = authOf(req);
      const f = req.query;
      const asOf = f.asOf ?? new Date().toISOString().slice(0, 10);
      let q = db
        .selectFrom('debt_items as i')
        .innerJoin('partners as p', 'p.id', 'i.partner_id')
        .innerJoin('accounting_events as d', 'd.id', 'i.event_id')
        .innerJoin('branches as b', 'b.id', 'i.branch_id')
        .where('i.tenant_id', '=', auth.tenantId);
      if (f.partnerCode) q = q.where('p.code', '=', f.partnerCode);
      if (f.groupCode) q = q.where('p.group_code', '=', f.groupCode);
      if (f.account) q = q.where('i.account_code', 'like', `${f.account}%`);
      if (f.side) q = q.where('i.side', '=', f.side);
      if (f.status === 'open') q = q.whereRef('i.amount', '>', 'i.settled_amount');
      if (f.status === 'settled') q = q.whereRef('i.amount', '=', 'i.settled_amount');
      if (f.purpose) q = q.where(sql<string>`d.payload->>'purpose'`, 'in', f.purpose.split(',').map((x) => x.trim()).filter(Boolean));
      if (f.from) q = q.where('i.doc_date', '>=', f.from);
      if (f.to) q = q.where('i.doc_date', '<=', f.to);
      if (f.dueTo) q = q.where('i.due_date', '<=', f.dueTo);
      if (f.branchCode) q = q.where('b.code', '=', f.branchCode);
      if (f.search) q = q.where('i.doc_no', 'ilike', `%${f.search}%`);
      const [rows, agg] = await Promise.all([
        q.select([
          'i.id', 'i.event_id', 'i.account_code', 'i.side', 'i.amount', 'i.settled_amount', 'i.doc_no', 'i.doc_date', 'i.due_date',
          'p.code as partner_code', 'p.name as partner_name', 'b.code as branch_code', 'd.doc_type', 'd.doc_key',
          sql<string | null>`d.payload->>'purpose'`.as('purpose'), sql<string | null>`d.payload->>'description'`.as('description'),
        ]).orderBy('i.due_date').orderBy('i.doc_date').orderBy('i.id').limit(f.pageSize).offset((f.page - 1) * f.pageSize).execute(),
        q.select([
          (eb) => eb.fn.countAll<string>().as('n'),
          sql<string>`COALESCE(SUM(CASE WHEN i.side = 'debit' THEN i.amount - i.settled_amount ELSE 0 END), 0)`.as('debit_left'),
          sql<string>`COALESCE(SUM(CASE WHEN i.side = 'credit' THEN i.amount - i.settled_amount ELSE 0 END), 0)`.as('credit_left'),
          sql<string>`COALESCE(SUM(CASE WHEN i.due_date < ${asOf}::date THEN i.amount - i.settled_amount ELSE 0 END), 0)`.as('overdue'),
        ]).executeTakeFirst(),
      ]);
      const asOfMs = Date.parse(asOf);
      return ok(
        rows.map((x) => {
          const amount = toNumber(x.amount);
          const settled = toNumber(x.settled_amount);
          const remaining = Math.round((amount - settled) * 100) / 100;
          return {
            id: x.id, documentId: x.event_id, docKey: x.doc_key, docType: x.doc_type, purpose: x.purpose, docNo: x.doc_no, docDate: x.doc_date, dueDate: x.due_date,
            description: x.description ?? '', partnerCode: x.partner_code, partnerName: x.partner_name, branchCode: x.branch_code, accountCode: x.account_code, side: x.side,
            amount, settled, remaining, overdueDays: remaining > 0 ? Math.max(0, Math.round((asOfMs - Date.parse(x.due_date)) / 86_400_000)) : 0,
          };
        }),
        { ...pageMeta(f, Number(agg?.n ?? 0)), debitRemaining: toNumber(agg?.debit_left ?? 0), creditRemaining: toNumber(agg?.credit_left ?? 0), overdue: toNumber(agg?.overdue ?? 0), asOf } as never,
      );
    },
  });

  r.get('/api/v1/debt-items/:id/allocations', {
    preHandler: read,
    schema: { tags, summary: 'Các đối trừ của một khoản công nợ', params: idParamSchema },
    handler: async (req) => {
      const auth = authOf(req);
      const rows = await db
        .selectFrom('debt_allocations as a')
        .innerJoin('debt_items as di', 'di.id', 'a.debit_item_id')
        .innerJoin('debt_items as ci', 'ci.id', 'a.credit_item_id')
        .select(['a.id', 'a.amount', 'a.alloc_date', 'a.is_auto', 'a.note', 'a.created_by', 'a.debit_item_id', 'a.credit_item_id', 'di.doc_no as debit_doc_no', 'di.doc_date as debit_doc_date', 'di.event_id as debit_event_id', 'ci.doc_no as credit_doc_no', 'ci.doc_date as credit_doc_date', 'ci.event_id as credit_event_id'])
        .where('a.tenant_id', '=', auth.tenantId)
        .where((eb) => eb.or([eb('a.debit_item_id', '=', req.params.id), eb('a.credit_item_id', '=', req.params.id)]))
        .orderBy('a.id')
        .execute();
      return ok(rows.map((x) => {
        const other = x.debit_item_id === req.params.id ? { docNo: x.credit_doc_no, docDate: x.credit_doc_date, documentId: x.credit_event_id } : { docNo: x.debit_doc_no, docDate: x.debit_doc_date, documentId: x.debit_event_id };
        return { id: x.id, amount: toNumber(x.amount), date: x.alloc_date, isAuto: x.is_auto, note: x.note, createdBy: x.created_by, ...other };
      }));
    },
  });

  mountActions(app, debtActions);
}

// [2026-11-03 02:10 AM Johnny Chu - Chu Hoàng Anh] PHASE-014 — W6 đợt 2 (SC-ACT-1): đối trừ công nợ qua defineAction — quyền, giao dịch, bằng chứng do runtime; đường dẫn / mã 201 như cũ.
// Đối trừ tay bắt buộc khoá idempotency (gửi lặp không đối trừ hai lần); tự đối trừ / gỡ chạy lại vô hại (natural).
const countOut = z.object({ count: z.number().int() });

export const debtActions: AnyActionDef[] = [
  defineAction({
    id: 'core.debt.allocate', title: 'Đối trừ công nợ (người dùng chọn cặp)', tags,
    permission: 'documents:write', effect: 'write', sideEffects: ['ledger'], idempotency: 'required',
    input: z.object({
      pairs: z.array(z.object({ debitItemId: id, creditItemId: id, amount: z.number().finite().positive() })).min(1).max(500),
      date: day.optional(),
      note: z.string().trim().max(500).default(''),
    }),
    output: countOut,
    expose: { http: { method: 'POST', path: '/api/v1/debt-allocations', status: 201 }, mcp: false, ai: 'deny' },
    evidence: { objectType: 'debt_allocation', objectId: (_i, o) => `${o.count} cặp` },
    handler: async (ctx, b) => ({ count: await allocate(ctx.data.tx, ctx.tenant.id, b.pairs, { actor: ctx.actor.name, date: b.date, note: b.note }) }),
  }),
  defineAction({
    id: 'core.debt.auto-allocate', title: 'Tự đối trừ theo hạn cũ trước', tags,
    description: 'Trong từng (đối tượng, tài khoản): khoản ghi Nợ cũ nhất ghép với khoản ghi Có cũ nhất. Không truyền đối tượng = mọi đối tượng.',
    permission: 'documents:write', effect: 'write', sideEffects: ['ledger'], idempotency: 'natural',
    input: z.object({ partnerCode: z.string().trim().optional(), account: z.string().trim().optional() }),
    output: countOut,
    expose: { http: { method: 'POST', path: '/api/v1/debt-allocations/auto' }, mcp: false, ai: 'deny' },
    evidence: { objectType: 'debt_allocation', objectId: (_i, o) => `${o.count} cặp` },
    handler: async (ctx, b) => {
      let partnerId: string | undefined;
      if (b.partnerCode) {
        const p = await ctx.data.tx.selectFrom('partners').select('id').where('tenant_id', '=', ctx.tenant.id).where('code', '=', b.partnerCode).executeTakeFirst();
        if (!p) throw Errors.notFound(`đối tượng ${b.partnerCode}`);
        partnerId = p.id;
      }
      return { count: await autoAllocate(ctx.data.tx, ctx.tenant.id, { partnerId, accountCode: b.account || undefined, actor: ctx.actor.name }) };
    },
  }),
  defineAction({
    id: 'core.debt.unallocate', title: 'Gỡ một đối trừ', tags,
    permission: 'documents:write', effect: 'write', sideEffects: ['ledger'], idempotency: 'natural',
    input: z.object({ id }), output: z.object({ id: z.string() }),
    expose: { http: { method: 'DELETE', path: '/api/v1/debt-allocations/:id' }, mcp: false, ai: 'deny' },
    evidence: { objectType: 'debt_allocation', objectId: (i) => i.id },
    handler: async (ctx, { id: allocId }) => { await unallocate(ctx.data.tx, ctx.tenant.id, allocId); return { id: allocId }; },
  }),
];
