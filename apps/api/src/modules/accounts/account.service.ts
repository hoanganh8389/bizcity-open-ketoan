/**
 * Luật danh mục tài khoản:
 *  - Tài khoản con phải có tài khoản cha tồn tại; số tài khoản con bắt đầu bằng số cha.
 *  - Khi thêm con, tài khoản cha thành tài khoản tổng hợp (không ghi sổ trực tiếp).
 *    Nếu cha đã có phát sinh thì không cho thêm con (số liệu cũ sẽ treo ở cha).
 *  - Không đổi số tài khoản sau khi tạo.
 *  - Xoá: chỉ tài khoản chưa có con, chưa có phát sinh, chưa dùng ở danh mục khác. Tài khoản mẹ hết con thì ghi sổ trực tiếp lại.
 */
import { db } from '../../db/client.js';
import { Errors } from '../../core/errors.js';
import { writeAudit } from '../../core/audit.js';
import type { AuthContext } from '../../core/auth.js';
import { accountRepository, toAccountDto } from './account.repository.js';
import type { AccountCreate, AccountDto, AccountListQuery, AccountUpdate } from './account.schemas.js';

export const accountService = {
  async list(auth: AuthContext, q: AccountListQuery): Promise<AccountDto[]> {
    return (await accountRepository.list(db, auth.tenantId, q)).map(toAccountDto);
  },

  async get(auth: AuthContext, code: string): Promise<AccountDto> {
    const a = await accountRepository.findByCode(db, auth.tenantId, code);
    if (!a) throw Errors.notFound(`tài khoản ${code}`);
    return toAccountDto(a);
  },

  async create(auth: AuthContext, input: AccountCreate): Promise<AccountDto> {
    return db.transaction().execute(async (trx) => {
      let level = 1;
      if (input.parentCode) {
        const parent = await accountRepository.findByCode(trx, auth.tenantId, input.parentCode);
        if (!parent) throw Errors.validation(`Tài khoản cha ${input.parentCode} chưa có trong danh mục`);
        if (!parent.is_active) throw Errors.validation(`Tài khoản mẹ ${parent.code} đã ngừng sử dụng, không thêm tài khoản con được`);
        if (!input.code.startsWith(parent.code)) throw Errors.validation('Số tài khoản con phải bắt đầu bằng số tài khoản cha');
        if (parent.is_posting && (await accountRepository.hasLedgerLines(trx, auth.tenantId, parent.code))) {
          throw Errors.conflict(`Tài khoản ${parent.code} đã có phát sinh, không thể thêm tài khoản con`);
        }
        level = parent.level + 1;
        await accountRepository.markNonPosting(trx, auth.tenantId, parent.code);
      }
      const row = await accountRepository.insert(trx, {
        tenant_id: auth.tenantId,
        code: input.code,
        name: input.name,
        name_en: input.nameEn ?? null,
        parent_code: input.parentCode ?? null,
        level,
        normal_side: input.normalSide,
        track_partner: input.trackPartner,
        track_cost_item: input.trackCostItem,
        track_department: input.trackDepartment,
        track_contract: input.trackContract,
        track_employee: input.trackEmployee,
        track_case: input.trackCase,
        track_project: input.trackProject,
        track_capital_source: input.trackCapitalSource,
        track_cashflow: input.trackCashflow,
        is_foreign_currency: input.isForeignCurrency,
        track_product: input.trackProduct,
        track_internal_debt: input.trackInternalDebt,
        is_vat: input.isVat,
        is_debt: input.isDebt,
        is_loan: input.isLoan,
        always_increase: input.alwaysIncrease,
        is_ledger: input.isLedger,
        is_cost: input.isCost,
      });
      await writeAudit(trx, { tenantId: auth.tenantId, actor: auth.actor, action: 'account.create', objectType: 'account', objectId: input.code, after: row });
      return toAccountDto(row);
    });
  },

  async remove(auth: AuthContext, code: string): Promise<{ code: string }> {
    return db.transaction().execute(async (trx) => {
      const before = await accountRepository.findByCode(trx, auth.tenantId, code);
      if (!before) throw Errors.notFound(`tài khoản ${code}`);
      const child = await trx.selectFrom('accounts').select('code').where('tenant_id', '=', auth.tenantId).where('parent_code', '=', code).executeTakeFirst();
      if (child) throw Errors.conflict(`Tài khoản ${code} có tài khoản con (${child.code}): xoá tài khoản con trước`);
      if (await accountRepository.hasLedgerLines(trx, auth.tenantId, code)) throw Errors.conflict(`Tài khoản ${code} đã có phát sinh, không xoá được (có thể ngừng sử dụng)`);
      await trx.deleteFrom('accounts').where('tenant_id', '=', auth.tenantId).where('code', '=', code).execute();
      if (before.parent_code) {
        const sibling = await trx.selectFrom('accounts').select('code').where('tenant_id', '=', auth.tenantId).where('parent_code', '=', before.parent_code).executeTakeFirst();
        if (!sibling) await trx.updateTable('accounts').set({ is_posting: true }).where('tenant_id', '=', auth.tenantId).where('code', '=', before.parent_code).execute();
      }
      await writeAudit(trx, { tenantId: auth.tenantId, actor: auth.actor, action: 'account.delete', objectType: 'account', objectId: code, before });
      return { code };
    });
  },

  async update(auth: AuthContext, code: string, input: AccountUpdate): Promise<AccountDto> {
    return db.transaction().execute(async (trx) => {
      const before = await accountRepository.findByCode(trx, auth.tenantId, code);
      if (!before) throw Errors.notFound(`tài khoản ${code}`);
      const patch: Record<string, unknown> = {};
      if (input.name !== undefined) patch.name = input.name;
      if (input.nameEn !== undefined) patch.name_en = input.nameEn;
      if (input.normalSide !== undefined) patch.normal_side = input.normalSide;
      if (input.trackPartner !== undefined) patch.track_partner = input.trackPartner;
      if (input.trackCostItem !== undefined) patch.track_cost_item = input.trackCostItem;
      if (input.trackDepartment !== undefined) patch.track_department = input.trackDepartment;
      if (input.trackContract !== undefined) patch.track_contract = input.trackContract;
      if (input.trackEmployee !== undefined) patch.track_employee = input.trackEmployee;
      if (input.trackCase !== undefined) patch.track_case = input.trackCase;
      if (input.trackProject !== undefined) patch.track_project = input.trackProject;
      if (input.trackCapitalSource !== undefined) patch.track_capital_source = input.trackCapitalSource;
      if (input.trackCashflow !== undefined) patch.track_cashflow = input.trackCashflow;
      if (input.isForeignCurrency !== undefined) patch.is_foreign_currency = input.isForeignCurrency;
      if (input.trackProduct !== undefined) patch.track_product = input.trackProduct;
      if (input.trackInternalDebt !== undefined) patch.track_internal_debt = input.trackInternalDebt;
      if (input.isVat !== undefined) patch.is_vat = input.isVat;
      if (input.isDebt !== undefined) patch.is_debt = input.isDebt;
      if (input.isLoan !== undefined) patch.is_loan = input.isLoan;
      if (input.alwaysIncrease !== undefined) patch.always_increase = input.alwaysIncrease;
      if (input.isLedger !== undefined) patch.is_ledger = input.isLedger;
      if (input.isCost !== undefined) patch.is_cost = input.isCost;
      if (input.isActive !== undefined) patch.is_active = input.isActive;
      if (Object.keys(patch).length === 0) return toAccountDto(before);
      const after = await accountRepository.update(trx, auth.tenantId, code, patch);
      await writeAudit(trx, { tenantId: auth.tenantId, actor: auth.actor, action: 'account.update', objectType: 'account', objectId: code, before, after });
      return toAccountDto(after!);
    });
  },
};
