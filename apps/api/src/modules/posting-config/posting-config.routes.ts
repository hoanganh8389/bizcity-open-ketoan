// @bizcity-layer K kernel/config
// [2026-10-29 10:24 PM Johnny Chu - Chu Hoàng Anh] INIT — khởi tạo Bizcity Core Framework: sổ cái chỉ thêm, cửa nạp sự việc, CANON, hợp đồng, bộ kiểm chuẩn.
// [2026-10-30 09:58 AM Johnny Chu - Chu Hoàng Anh] PHASE-002 — nhãn lớp @bizcity-layer, đồ thị phụ thuộc mốc, bản nháp API module-sdk.
// [2026-10-30 09:03 PM Johnny Chu - Chu Hoàng Anh] PHASE-005 — chính sách kế toán có phiên bản + ngày hiệu lực (ADR-0009).
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
import { db } from '../../db/client.js';
import { authOf, requirePermission } from '../../core/auth.js';
import { ok } from '../../core/http.js';
import { writeAudit } from '../../core/audit.js';
import { Errors } from '../../core/errors.js';
import { DEFAULT_KEYS, FORM_KEYS, defaultsSchema, groupSchema, paymentMethodSchema, reasonSchema } from './posting-config.schemas.js';
import { mountActions } from '../../core/actions.js';
import { policyActions } from './policy.actions.js';

const tags = ['Cấu hình hạch toán'];
const codeParam = z.object({ code: z.string() });

export async function postingConfigRoutes(app: FastifyInstance): Promise<void> {
  // Chính sách kế toán có phiên bản (ADR-0009): lịch sử + phát hành chế độ mới.
  mountActions(app, policyActions);
  const r = app.withTypeProvider<ZodTypeProvider>();
  const read = requirePermission('catalog:read');
  const write = requirePermission('settings:write');

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
          flags: x.flags,
          isActive: x.is_active,
        })),
      );
    },
  });

  r.put('/api/v1/posting/reasons/:code', {
    preHandler: write,
    schema: { tags, summary: 'Tạo/cập nhật lý do', params: codeParam, body: reasonSchema.omit({ code: true }) },
    handler: async (req) => {
      const auth = authOf(req);
      const b = req.body;
      const values = {
        name: b.name,
        kind: b.kind,
        counter_account: b.counterAccount || null,
        revenue_account: b.revenueAccount || null,
        expense_account: b.expenseAccount || null,
        cashflow_code: b.cashflowCode || null,
        flags: JSON.stringify(b.flags),
        is_active: b.isActive,
      };
      await db.transaction().execute(async (trx) => {
        await trx
          .insertInto('posting_reasons')
          .values({ tenant_id: auth.tenantId, code: req.params.code, ...values })
          .onConflict((oc) => oc.columns(['tenant_id', 'code']).doUpdateSet(values))
          .execute();
        await writeAudit(trx, { tenantId: auth.tenantId, actor: auth.actor, action: 'reason.upsert', objectType: 'posting_reason', objectId: req.params.code, after: b });
      });
      return ok({ code: req.params.code, ...b });
    },
  });

  r.delete('/api/v1/posting/reasons/:code', {
    preHandler: write,
    schema: { tags, summary: 'Xoá lý do chưa dùng', params: codeParam },
    handler: async (req) => {
      const auth = authOf(req);
      const code = req.params.code;
      await db.transaction().execute(async (trx) => {
        const before = await trx.selectFrom('posting_reasons').selectAll().where('tenant_id', '=', auth.tenantId).where('code', '=', code).executeTakeFirst();
        if (!before) throw Errors.notFound(`lý do ${code}`);
        const used = await sql<{ n: number }>`SELECT 1 AS n FROM ledger_entries WHERE tenant_id = ${auth.tenantId} AND reason_code = ${code}
          UNION ALL SELECT 1 FROM inventory_movements WHERE tenant_id = ${auth.tenantId} AND reason_code = ${code} LIMIT 1`.execute(trx);
        if (used.rows.length) throw Errors.conflict(`Lý do ${code} đã dùng trên chứng từ: bỏ tích "Đang dùng" để ngừng`);
        await trx.deleteFrom('posting_reasons').where('id', '=', before.id).execute();
        await writeAudit(trx, { tenantId: auth.tenantId, actor: auth.actor, action: 'reason.delete', objectType: 'posting_reason', objectId: code, before });
      });
      return ok({ code });
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

  r.put('/api/v1/posting/groups/:code', {
    preHandler: write,
    schema: { tags, summary: 'Tạo/cập nhật nhóm hạch toán', params: codeParam, body: groupSchema.omit({ code: true }) },
    handler: async (req) => {
      const auth = authOf(req);
      const b = req.body;
      const values = {
        name: b.name,
        inventory_account: b.inventoryAccount,
        cogs_account: b.cogsAccount,
        revenue_account: b.revenueAccount,
        discount_account: b.discountAccount || null,
        sales_return_account: b.salesReturnAccount,
        is_default: b.isDefault,
      };
      await db.transaction().execute(async (trx) => {
        // Chỉ một nhóm mặc định: đặt nhóm này làm mặc định thì bỏ cờ ở nhóm khác.
        if (b.isDefault) await trx.updateTable('product_posting_groups').set({ is_default: false }).where('tenant_id', '=', auth.tenantId).execute();
        await trx
          .insertInto('product_posting_groups')
          .values({ tenant_id: auth.tenantId, code: req.params.code, ...values })
          .onConflict((oc) => oc.columns(['tenant_id', 'code']).doUpdateSet(values))
          .execute();
        await writeAudit(trx, { tenantId: auth.tenantId, actor: auth.actor, action: 'posting_group.upsert', objectType: 'posting_group', objectId: req.params.code, after: b });
      });
      return ok({ code: req.params.code, ...b });
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

  r.put('/api/v1/posting/payment-methods/:code', {
    preHandler: write,
    schema: { tags, summary: 'Tạo/cập nhật hình thức thanh toán', params: codeParam, body: paymentMethodSchema.omit({ code: true }) },
    handler: async (req) => {
      const auth = authOf(req);
      const b = req.body;
      let accountCode = b.accountCode;
      // Có đối tượng nhận hộ (13681) hoặc ghi qua tiền đang chuyển (113…): giữ tài khoản người dùng chọn.
      if (b.bankAccountCode && !b.partnerCode && !b.accountCode.startsWith('113')) {
        const bank = await db.selectFrom('bank_accounts').select('account_code').where('tenant_id', '=', auth.tenantId).where('code', '=', b.bankAccountCode).executeTakeFirst();
        if (!bank) throw Errors.validation(`Tài khoản ngân hàng ${b.bankAccountCode} chưa có trong danh mục`);
        accountCode = bank.account_code;
      }
      if (b.partnerCode) {
        const p = await db.selectFrom('partners').select('id').where('tenant_id', '=', auth.tenantId).where('code', '=', b.partnerCode).executeTakeFirst();
        if (!p) throw Errors.validation(`Đối tượng ${b.partnerCode} chưa có trong danh mục đối tượng`);
      }
      const values = { name: b.name, account_code: accountCode, bank_account_code: b.bankAccountCode || null, is_receivable: b.isReceivable, is_active: b.isActive,
        note: b.note, sort_order: b.sortOrder ?? null, discount_rate: b.discountRate === null || b.discountRate === undefined ? null : String(b.discountRate),
        partner_code: b.partnerCode || null };
      await db.transaction().execute(async (trx) => {
        await trx
          .insertInto('payment_methods')
          .values({ tenant_id: auth.tenantId, code: req.params.code, ...values })
          .onConflict((oc) => oc.columns(['tenant_id', 'code']).doUpdateSet(values))
          .execute();
        await writeAudit(trx, { tenantId: auth.tenantId, actor: auth.actor, action: 'payment_method.upsert', objectType: 'payment_method', objectId: req.params.code, after: b });
      });
      return ok({ code: req.params.code, ...b });
    },
  });

  r.delete('/api/v1/posting/payment-methods/:code', {
    preHandler: write,
    schema: { tags, summary: 'Xoá hình thức thanh toán chưa dùng', params: codeParam },
    handler: async (req) => {
      const auth = authOf(req);
      const code = req.params.code;
      await db.transaction().execute(async (trx) => {
        const before = await trx.selectFrom('payment_methods').selectAll().where('tenant_id', '=', auth.tenantId).where('code', '=', code).executeTakeFirst();
        if (!before) throw Errors.notFound(`hình thức thanh toán ${code}`);
        const used = await trx.selectFrom('sales_payments').select('id').where('tenant_id', '=', auth.tenantId).where('method_code', '=', code).limit(1).executeTakeFirst();
        if (used) throw Errors.conflict(`Hình thức ${code} đã dùng trên chứng từ: bỏ tích "Đang sử dụng" để ngừng`);
        await trx.deleteFrom('payment_methods').where('id', '=', before.id).execute();
        await writeAudit(trx, { tenantId: auth.tenantId, actor: auth.actor, action: 'payment_method.delete', objectType: 'payment_method', objectId: code, before });
      });
      return ok({ code });
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

  r.put('/api/v1/posting/defaults', {
    preHandler: write,
    schema: { tags, summary: 'Cập nhật tài khoản ngầm định', body: defaultsSchema },
    handler: async (req) => {
      const auth = authOf(req);
      await db.transaction().execute(async (trx) => {
        for (const [key, account] of Object.entries(req.body)) {
          await trx
            .insertInto('posting_defaults')
            .values({ tenant_id: auth.tenantId, key, account_code: account })
            .onConflict((oc) => oc.columns(['tenant_id', 'key']).doUpdateSet({ account_code: account }))
            .execute();
        }
        await writeAudit(trx, { tenantId: auth.tenantId, actor: auth.actor, action: 'posting_defaults.update', objectType: 'posting_defaults', after: req.body });
      });
      return ok(req.body);
    },
  });
}
