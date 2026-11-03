// @bizcity-layer M data/masterdata
/**
 * Tài khoản ngân hàng.
 *   GET /api/v1/bank-accounts?search=      danh sách (kèm tên tài khoản kế toán)
 *   PUT /api/v1/bank-accounts/:code        thêm hoặc sửa
 *   DELETE /api/v1/bank-accounts/:code     xoá tài khoản ngân hàng chưa gắn hình thức thanh toán
 * Không xoá: bỏ "Đang dùng" để khoá. Mỗi tài khoản kế toán 112 chi tiết chỉ gắn một tài khoản ngân hàng đang dùng.
 */
import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { db } from '../../db/client.js';
import { authOf, requirePermission } from '../../core/auth.js';
import { Errors } from '../../core/errors.js';
import { ok } from '../../core/http.js';
import { writeAudit } from '../../core/audit.js';
import { defineAction, mountActions, type AnyActionDef, sameTx } from '@bizcity/platform/core/actions';

const tags = ['Danh mục: Tài khoản ngân hàng'];

export async function bankAccountRoutes(app: FastifyInstance): Promise<void> {
  const r = app.withTypeProvider<ZodTypeProvider>();

  r.get('/api/v1/bank-accounts', {
    preHandler: requirePermission('catalog:read'),
    schema: { tags, summary: 'Danh sách tài khoản ngân hàng', querystring: z.object({ search: z.string().trim().optional() }) },
    handler: async (req) => {
      const auth = authOf(req);
      let q = db
        .selectFrom('bank_accounts as b')
        .leftJoin('accounts as a', (j) => j.onRef('a.tenant_id', '=', 'b.tenant_id').onRef('a.code', '=', 'b.account_code'))
        .select(['b.code', 'b.bank_name', 'b.bank_branch', 'b.account_no', 'b.holder', 'b.account_code', 'a.name as account_name', 'b.branch_code', 'b.currency', 'b.note', 'b.is_active', 'b.bank_address', 'b.bank_phone', 'b.contact'])
        .where('b.tenant_id', '=', auth.tenantId);
      const s = req.query.search?.toLowerCase();
      if (s) q = q.where((eb) => eb.or([eb(eb.fn('lower', ['b.code']), 'like', `%${s}%`), eb(eb.fn('lower', ['b.bank_name']), 'like', `%${s}%`), eb('b.account_no', 'like', `%${s}%`), eb('b.account_code', 'like', `${s}%`)]));
      const rows = await q.orderBy('b.code').execute();
      return ok(rows.map((b) => ({
        code: b.code, bankName: b.bank_name, bankBranch: b.bank_branch, accountNo: b.account_no, holder: b.holder,
        accountCode: b.account_code, accountName: b.account_name ?? '', branchCode: b.branch_code, currency: b.currency, note: b.note, isActive: b.is_active,
        bankAddress: b.bank_address, bankPhone: b.bank_phone, contact: b.contact,
      })));
    },
  });
  mountActions(app, bankAccountWriteActions);
}

// [2026-11-03 04:00 AM Johnny Chu - Chu Hoàng Anh] PHASE-014 — W6 đợt 3 (SC-ACT-1): route ghi qua defineAction — quyền, kiểm input, idempotency, giao dịch, bằng chứng do runtime; đường dẫn / thân yêu cầu / mã 201 như cũ.
// Mã cũ trong handler chạy trong giao dịch của action (sameTx); service tự mở giao dịch có bản *In.
const anyOut = z.custom<object>((v) => typeof v === 'object' && v !== null);

export const bankAccountWriteActions: AnyActionDef[] = [
  defineAction({
    id: 'core.bank-account.upsert', title: 'Thêm hoặc sửa tài khoản ngân hàng', tags,
    permission: 'catalog:write', effect: 'write', sideEffects: ['masterdata'], idempotency: 'natural',
    input: (z.object({
        bankName: z.string().trim().min(1).max(255),
        bankBranch: z.string().trim().max(255).default(''),
        accountNo: z.string().trim().min(1).max(64),
        holder: z.string().trim().max(255).default(''),
        accountCode: z.string().trim().min(3).max(20),
        branchCode: z.string().trim().max(32).optional(),
        currency: z.string().trim().length(3).default('VND'),
        note: z.string().trim().max(500).default(''),
        isActive: z.boolean().default(true),
        bankAddress: z.string().trim().max(500).default(''),
        bankPhone: z.string().trim().max(64).default(''),
        contact: z.string().trim().max(255).default(''),
      })).merge(z.object({ code: z.string().trim().min(1).max(64) })), output: anyOut,
    expose: { http: { method: 'PUT', path: '/api/v1/bank-accounts/:code' }, mcp: false, ai: 'deny' },
    evidence: { objectType: 'bank_account', objectId: (i) => String(i.code) },
    handler: async (ctx, input) => {
      const { code: _code, ...reqBody } = input;
      const trx = ctx.data.tx;
      const auth = ctx.legacyAuth;
      const { code } = input;
      const b = reqBody;
      const acc = await trx.selectFrom('accounts').select(['code', 'is_posting']).where('tenant_id', '=', auth.tenantId).where('code', '=', b.accountCode).executeTakeFirst();
      if (!acc) throw Errors.validation(`Tài khoản ${b.accountCode} chưa có trong danh mục tài khoản`);
      if (!acc.is_posting) throw Errors.validation(`Tài khoản ${b.accountCode} là tài khoản tổng hợp; chọn tài khoản 112 chi tiết`);
      if (!b.accountCode.startsWith('112')) throw Errors.validation('Tài khoản ngân hàng phải gắn tài khoản 112 (tiền gửi ngân hàng)');
      if (b.isActive) {
        const other = await trx.selectFrom('bank_accounts').select('code').where('tenant_id', '=', auth.tenantId).where('account_code', '=', b.accountCode).where('is_active', '=', true).where('code', '<>', code).executeTakeFirst();
        if (other) throw Errors.validation(`Tài khoản ${b.accountCode} đã gắn với tài khoản ngân hàng ${other.code}; mỗi tài khoản kế toán chỉ gắn một tài khoản ngân hàng`);
      }
      if (b.branchCode) {
        const br = await trx.selectFrom('branches').select('id').where('tenant_id', '=', auth.tenantId).where('code', '=', b.branchCode).executeTakeFirst();
        if (!br) throw Errors.validation(`Chi nhánh ${b.branchCode} chưa khai báo`);
      }
      const values = {
        bank_name: b.bankName, bank_branch: b.bankBranch, account_no: b.accountNo, holder: b.holder, account_code: b.accountCode,
        branch_code: b.branchCode || null, currency: b.currency.toUpperCase(), note: b.note, is_active: b.isActive,
        bank_address: b.bankAddress, bank_phone: b.bankPhone, contact: b.contact,
      };
      await sameTx(trx, async (trx) => {
        await trx.insertInto('bank_accounts').values({ tenant_id: auth.tenantId, code, ...values }).onConflict((oc) => oc.columns(['tenant_id', 'code']).doUpdateSet(values)).execute();
        // Hình thức thanh toán trỏ về tài khoản ngân hàng này: cập nhật tài khoản kế toán theo.
        await trx.updateTable('payment_methods').set({ account_code: b.accountCode }).where('tenant_id', '=', auth.tenantId).where('bank_account_code', '=', code).where('partner_code', 'is', null).where('account_code', 'not like', '113%').execute();
        await writeAudit(trx, { tenantId: auth.tenantId, actor: auth.actor, action: 'bank_account.save', objectType: 'bank_account', objectId: code, after: b });
      });
      return { code };
    },
  }),
  defineAction({
    id: 'core.bank-account.delete', title: 'Xoá tài khoản ngân hàng chưa dùng', tags,
    permission: 'catalog:write', effect: 'write', sideEffects: ['masterdata'], idempotency: 'natural',
    input: z.object({ code: z.string() }), output: anyOut,
    expose: { http: { method: 'DELETE', path: '/api/v1/bank-accounts/:code' }, mcp: false, ai: 'deny' },
    evidence: { objectType: 'bank_account', objectId: (i) => String(i.code) },
    handler: async (ctx, input) => {
      const trx = ctx.data.tx;
      const auth = ctx.legacyAuth;
      const code = input.code;
      await sameTx(trx, async (trx) => {
        const before = await trx.selectFrom('bank_accounts').selectAll().where('tenant_id', '=', auth.tenantId).where('code', '=', code).executeTakeFirst();
        if (!before) throw Errors.notFound(`tài khoản ngân hàng ${code}`);
        const used = await trx.selectFrom('payment_methods').select('code').where('tenant_id', '=', auth.tenantId).where('bank_account_code', '=', code).limit(1).executeTakeFirst();
        if (used) throw Errors.conflict(`Tài khoản ngân hàng ${code} đang gắn hình thức thanh toán ${used.code}: bỏ tích "Đang dùng" để ngừng`);
        await trx.deleteFrom('bank_accounts').where('id', '=', before.id).execute();
        await writeAudit(trx, { tenantId: auth.tenantId, actor: auth.actor, action: 'bank_account.delete', objectType: 'bank_account', objectId: code, before });
      });
      return { code };
    },
  }),
];
