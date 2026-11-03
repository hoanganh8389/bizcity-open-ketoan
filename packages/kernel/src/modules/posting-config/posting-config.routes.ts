// @bizcity-layer K kernel/config
// [2026-10-29 10:24 PM Johnny Chu - Chu Hoàng Anh] INIT — khởi tạo Bizcity Core Framework: sổ cái chỉ thêm, cửa nạp sự việc, CANON, hợp đồng, bộ kiểm chuẩn.
// [2026-10-30 09:58 AM Johnny Chu - Chu Hoàng Anh] PHASE-002 — nhãn lớp @bizcity-layer, đồ thị phụ thuộc mốc, bản nháp API module-sdk.
// [2026-10-30 09:03 PM Johnny Chu - Chu Hoàng Anh] PHASE-005 — chính sách kế toán có phiên bản + ngày hiệu lực (ADR-0009).
// [2026-10-30 10:11 PM Johnny Chu - Chu Hoàng Anh] PHASE-012 — gắn action gói định khoản core.template.list / install / uninstall.
// [2026-11-02 02:10 AM Johnny Chu - Chu Hoàng Anh] PHASE-020 — gắn action hồ sơ kế toán accounting.profile.get / publish (ADR-0013).
// [2026-11-01 04:39 PM Johnny Chu - Chu Hoàng Anh] PHASE-010 — dời từ apps/api/src/modules/posting-config/posting-config.routes.ts sang packages/kernel (@bizcity/kernel, D010-7 chặng 3); import Platform qua @bizcity/platform
// [2026-11-02 08:45 PM Johnny Chu - Chu Hoàng Anh] PHASE-011 — 3.15: lý do journal — đọc / ghi cặp tài khoản Nợ / Có, kiểm có thật, chi tiết, khác nhau
/**
 * Cấu hình hạch toán.
 *   GET/PUT/DELETE  /api/v1/posting/reasons[/:code]    lý do (xoá: chưa dùng trên chứng từ)
 *   GET/PUT  /api/v1/posting/groups[/:code]            nhóm hạch toán mặt hàng
 *   GET/PUT  /api/v1/posting/payment-methods[/:code]   hình thức thanh toán
 *   GET/PUT  /api/v1/posting/defaults                  tài khoản ngầm định
 *
 * PUT theo mã = tạo mới hoặc cập nhật (idempotent), tiện cho cả giao diện lẫn nạp từ file.
 */
import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { sql } from 'kysely';
import { db } from '@bizcity/platform/db/client';
import { authOf, requirePermission } from '@bizcity/platform/core/auth';
import { ok } from '@bizcity/platform/core/http';
import { Errors } from '@bizcity/platform/core/errors';
import { DEFAULT_KEYS, FORM_KEYS, defaultsSchema, groupSchema, paymentMethodSchema, reasonSchema } from './posting-config.schemas.js';
import { defineAction, mountActions, type AnyActionDef } from '@bizcity/platform/core/actions';
import { policyActions } from './policy.actions.js';
import { packActions } from './pack.actions.js';
import { profileActions } from './profile.actions.js';

const tags = ['Cấu hình hạch toán'];
const codeParam = z.object({ code: z.string() });

export async function postingConfigRoutes(app: FastifyInstance): Promise<void> {
  // Chính sách kế toán có phiên bản (ADR-0009): lịch sử + phát hành chế độ mới.
  mountActions(app, policyActions);
  // Gói định khoản (bizcity_posting_template@1): cài / xem trước / gỡ — PHASE-012.
  mountActions(app, packActions);
  // Hồ sơ kế toán của đơn vị (ADR-0013): năm tài chính, chế độ kế toán, loại pháp nhân có phiên bản.
  mountActions(app, profileActions);
  const r = app.withTypeProvider<ZodTypeProvider>();
  const read = requirePermission('catalog:read');

  // ---------------- Lý do ----------------
  r.get('/api/v1/posting/reasons', {
    preHandler: read,
    schema: { tags, summary: 'Danh sách lý do' },
    handler: async (req) => {
      const rows = await db.selectFrom('posting_reasons').selectAll().where('tenant_id', '=', authOf(req).tenantId).orderBy('kind').orderBy('code').execute();
      return ok(
        rows.map((x) => ({
          code: x.code,
          name: x.name,
          kind: x.kind,
          counterAccount: x.counter_account,
          revenueAccount: x.revenue_account,
          expenseAccount: x.expense_account,
          cashflowCode: x.cashflow_code,
          debitAccount: x.debit_account,
          creditAccount: x.credit_account,
          flags: x.flags,
          isActive: x.is_active,
        })),
      );
    },
  });

  // ---------------- Nhóm hạch toán mặt hàng ----------------
  r.get('/api/v1/posting/groups', {
    preHandler: read,
    schema: { tags, summary: 'Danh sách nhóm hạch toán mặt hàng' },
    handler: async (req) => {
      const rows = await db.selectFrom('product_posting_groups').selectAll().where('tenant_id', '=', authOf(req).tenantId).orderBy('code').execute();
      return ok(
        rows.map((g) => ({
          code: g.code,
          name: g.name,
          inventoryAccount: g.inventory_account,
          cogsAccount: g.cogs_account,
          revenueAccount: g.revenue_account,
          discountAccount: g.discount_account,
          salesReturnAccount: g.sales_return_account,
          isDefault: g.is_default,
        })),
      );
    },
  });

  // ---------------- Hình thức thanh toán ----------------
  r.get('/api/v1/posting/payment-methods', {
    preHandler: read,
    schema: { tags, summary: 'Danh sách hình thức thanh toán' },
    handler: async (req) => {
      const rows = await db.selectFrom('payment_methods').selectAll().where('tenant_id', '=', authOf(req).tenantId).orderBy(sql`sort_order NULLS LAST`).orderBy('code').execute();
      return ok(rows.map((m) => ({ code: m.code, name: m.name, accountCode: m.account_code, bankAccountCode: m.bank_account_code, isReceivable: m.is_receivable, isActive: m.is_active,
        note: m.note, sortOrder: m.sort_order, discountRate: m.discount_rate === null ? null : Number(m.discount_rate), partnerCode: m.partner_code })));
    },
  });

  // ---------------- Tài khoản ngầm định ----------------
  r.get('/api/v1/posting/defaults', {
    preHandler: read,
    schema: { tags, summary: 'Tài khoản ngầm định' },
    handler: async (req) => {
      const rows = await db.selectFrom('posting_defaults').selectAll().where('tenant_id', '=', authOf(req).tenantId).execute();
      const map = new Map(rows.map((x) => [x.key, x.account_code]));
      return ok(Object.entries(DEFAULT_KEYS).map(([key, label]) => ({ key, label, accountCode: map.get(key) ?? null, onForm: (FORM_KEYS as readonly string[]).includes(key) })));
    },
  });

  mountActions(app, postingConfigActions);
}

// [2026-11-03 03:05 AM Johnny Chu - Chu Hoàng Anh] PHASE-014 — W6 đợt 2 (SC-ACT-1): ghi cấu hình hạch toán (lý do, nhóm hạch toán, hình thức thanh toán, tài khoản ngầm định) qua defineAction —
// quyền settings:write, giao dịch, bằng chứng do runtime; đường dẫn / thân yêu cầu như cũ.
/** Thân PUT /posting/defaults: từng khoá ngầm định (tuỳ chọn) → tài khoản; khoá lạ bị từ chối như bản record cũ. */
const defaultsBody = z.object(Object.fromEntries(Object.keys(DEFAULT_KEYS).map((k) => [k, defaultsSchema.valueSchema.optional()]))).strict();

export const postingConfigActions: AnyActionDef[] = [
  defineAction({
    id: 'core.posting-reason.upsert', title: 'Tạo/cập nhật lý do', tags,
    permission: 'settings:write', effect: 'write', sideEffects: ['settings'], idempotency: 'natural',
    input: reasonSchema.omit({ code: true }).merge(codeParam), output: z.object({ code: z.string() }).passthrough(),
    expose: { http: { method: 'PUT', path: '/api/v1/posting/reasons/:code' }, mcp: false, ai: 'deny' },
    evidence: { objectType: 'posting_reason', objectId: (i) => i.code },
    handler: async (ctx, b) => {
      const trx = ctx.data.tx;
      // Lý do journal (manual_journal): cặp Nợ / Có bắt buộc, khác nhau, là tài khoản chi tiết đang dùng. Loại khác: không dùng cặp này.
      const journal = b.kind === 'journal';
      if (journal ? !b.debitAccount || !b.creditAccount || b.debitAccount === b.creditAccount : Boolean(b.debitAccount || b.creditAccount)) {
        throw Errors.validation(journal ? 'Lý do loại journal cần tài khoản Nợ và tài khoản Có khác nhau' : 'Chỉ lý do loại journal mới khai tài khoản Nợ / Có');
      }
      if (journal) {
        const accs = await trx.selectFrom('accounts').select(['code', 'is_active', 'is_posting']).where('tenant_id', '=', ctx.tenant.id).where('code', 'in', [b.debitAccount!, b.creditAccount!]).execute();
        const bad = [b.debitAccount!, b.creditAccount!].filter((c) => { const a = accs.find((x) => x.code === c); return !a || !a.is_active || !a.is_posting; });
        if (bad.length) throw Errors.validation(`Tài khoản ${bad.join(', ')} không có, đã ngừng dùng hoặc là tài khoản tổng hợp — chọn tài khoản chi tiết`);
      }
      const values = {
        name: b.name,
        kind: b.kind,
        counter_account: b.counterAccount || null,
        revenue_account: b.revenueAccount || null,
        expense_account: b.expenseAccount || null,
        cashflow_code: b.cashflowCode || null,
        debit_account: journal ? b.debitAccount! : null,
        credit_account: journal ? b.creditAccount! : null,
        flags: JSON.stringify(b.flags),
        is_active: b.isActive,
      };
      await trx
        .insertInto('posting_reasons')
        .values({ tenant_id: ctx.tenant.id, code: b.code, ...values })
        .onConflict((oc) => oc.columns(['tenant_id', 'code']).doUpdateSet(values))
        .execute();
      return b;
    },
  }),
  defineAction({
    id: 'core.posting-reason.delete', title: 'Xoá lý do chưa dùng', tags,
    permission: 'settings:write', effect: 'write', sideEffects: ['settings'], idempotency: 'natural',
    input: codeParam, output: z.object({ code: z.string() }),
    expose: { http: { method: 'DELETE', path: '/api/v1/posting/reasons/:code' }, mcp: false, ai: 'deny' },
    evidence: { objectType: 'posting_reason', objectId: (i) => i.code },
    handler: async (ctx, b) => {
      const trx = ctx.data.tx;
      const code = b.code;
      const before = await trx.selectFrom('posting_reasons').selectAll().where('tenant_id', '=', ctx.tenant.id).where('code', '=', code).executeTakeFirst();
      if (!before) throw Errors.notFound(`lý do ${code}`);
      const used = await sql<{ n: number }>`SELECT 1 AS n FROM ledger_entries WHERE tenant_id = ${ctx.tenant.id} AND reason_code = ${code}
        UNION ALL SELECT 1 FROM inventory_movements WHERE tenant_id = ${ctx.tenant.id} AND reason_code = ${code} LIMIT 1`.execute(trx);
      if (used.rows.length) throw Errors.conflict(`Lý do ${code} đã dùng trên chứng từ: bỏ tích "Đang dùng" để ngừng`);
      await trx.deleteFrom('posting_reasons').where('id', '=', before.id).execute();
      return { code };
    },
  }),
  defineAction({
    id: 'core.posting-group.upsert', title: 'Tạo/cập nhật nhóm hạch toán', tags,
    permission: 'settings:write', effect: 'write', sideEffects: ['settings'], idempotency: 'natural',
    input: groupSchema.omit({ code: true }).merge(codeParam), output: z.object({ code: z.string() }).passthrough(),
    expose: { http: { method: 'PUT', path: '/api/v1/posting/groups/:code' }, mcp: false, ai: 'deny' },
    evidence: { objectType: 'posting_group', objectId: (i) => i.code },
    handler: async (ctx, b) => {
      const trx = ctx.data.tx;
      const values = {
        name: b.name,
        inventory_account: b.inventoryAccount,
        cogs_account: b.cogsAccount,
        revenue_account: b.revenueAccount,
        discount_account: b.discountAccount || null,
        sales_return_account: b.salesReturnAccount,
        is_default: b.isDefault,
      };
      // Chỉ một nhóm mặc định: đặt nhóm này làm mặc định thì bỏ cờ ở nhóm khác.
      if (b.isDefault) await trx.updateTable('product_posting_groups').set({ is_default: false }).where('tenant_id', '=', ctx.tenant.id).execute();
      await trx
        .insertInto('product_posting_groups')
        .values({ tenant_id: ctx.tenant.id, code: b.code, ...values })
        .onConflict((oc) => oc.columns(['tenant_id', 'code']).doUpdateSet(values))
        .execute();
      return b;
    },
  }),
  defineAction({
    id: 'core.payment-method.upsert', title: 'Tạo/cập nhật hình thức thanh toán', tags,
    permission: 'settings:write', effect: 'write', sideEffects: ['settings'], idempotency: 'natural',
    input: paymentMethodSchema.omit({ code: true }).merge(codeParam), output: z.object({ code: z.string() }).passthrough(),
    expose: { http: { method: 'PUT', path: '/api/v1/posting/payment-methods/:code' }, mcp: false, ai: 'deny' },
    evidence: { objectType: 'payment_method', objectId: (i) => i.code },
    handler: async (ctx, b) => {
      const trx = ctx.data.tx;
      let accountCode = b.accountCode;
      // Có đối tượng nhận hộ (13681) hoặc ghi qua tiền đang chuyển (113…): giữ tài khoản người dùng chọn.
      if (b.bankAccountCode && !b.partnerCode && !b.accountCode.startsWith('113')) {
        const bank = await trx.selectFrom('bank_accounts').select('account_code').where('tenant_id', '=', ctx.tenant.id).where('code', '=', b.bankAccountCode).executeTakeFirst();
        if (!bank) throw Errors.validation(`Tài khoản ngân hàng ${b.bankAccountCode} chưa có trong danh mục`);
        accountCode = bank.account_code;
      }
      if (b.partnerCode) {
        const p = await trx.selectFrom('partners').select('id').where('tenant_id', '=', ctx.tenant.id).where('code', '=', b.partnerCode).executeTakeFirst();
        if (!p) throw Errors.validation(`Đối tượng ${b.partnerCode} chưa có trong danh mục đối tượng`);
      }
      const values = { name: b.name, account_code: accountCode, bank_account_code: b.bankAccountCode || null, is_receivable: b.isReceivable, is_active: b.isActive,
        note: b.note, sort_order: b.sortOrder ?? null, discount_rate: b.discountRate === null || b.discountRate === undefined ? null : String(b.discountRate),
        partner_code: b.partnerCode || null };
      await trx
        .insertInto('payment_methods')
        .values({ tenant_id: ctx.tenant.id, code: b.code, ...values })
        .onConflict((oc) => oc.columns(['tenant_id', 'code']).doUpdateSet(values))
        .execute();
      return b;
    },
  }),
  defineAction({
    id: 'core.payment-method.delete', title: 'Xoá hình thức thanh toán chưa dùng', tags,
    permission: 'settings:write', effect: 'write', sideEffects: ['settings'], idempotency: 'natural',
    input: codeParam, output: z.object({ code: z.string() }),
    expose: { http: { method: 'DELETE', path: '/api/v1/posting/payment-methods/:code' }, mcp: false, ai: 'deny' },
    evidence: { objectType: 'payment_method', objectId: (i) => i.code },
    handler: async (ctx, b) => {
      const trx = ctx.data.tx;
      const code = b.code;
      const before = await trx.selectFrom('payment_methods').selectAll().where('tenant_id', '=', ctx.tenant.id).where('code', '=', code).executeTakeFirst();
      if (!before) throw Errors.notFound(`hình thức thanh toán ${code}`);
      const used = await trx.selectFrom('sales_payments').select('id').where('tenant_id', '=', ctx.tenant.id).where('method_code', '=', code).limit(1).executeTakeFirst();
      if (used) throw Errors.conflict(`Hình thức ${code} đã dùng trên chứng từ: bỏ tích "Đang sử dụng" để ngừng`);
      await trx.deleteFrom('payment_methods').where('id', '=', before.id).execute();
      return { code };
    },
  }),
  defineAction({
    id: 'core.posting-defaults.update', title: 'Cập nhật tài khoản ngầm định', tags,
    permission: 'settings:write', effect: 'write', sideEffects: ['settings'], idempotency: 'natural',
    input: defaultsBody, output: defaultsBody,
    expose: { http: { method: 'PUT', path: '/api/v1/posting/defaults' }, mcp: false, ai: 'deny' },
    evidence: { objectType: 'posting_defaults', objectId: () => 'defaults' },
    handler: async (ctx, b) => {
      const trx = ctx.data.tx;
      for (const [key, account] of Object.entries(b)) {
        if (!account) continue;
        await trx
          .insertInto('posting_defaults')
          .values({ tenant_id: ctx.tenant.id, key, account_code: account })
          .onConflict((oc) => oc.columns(['tenant_id', 'key']).doUpdateSet({ account_code: account }))
          .execute();
      }
      return b;
    },
  }),
];
