// @bizcity-layer K kernel/accounts
/**
 * Đọc/ghi bảng accounts.
 */
import type { Insertable } from 'kysely';
import type { Db } from '../../db/client.js';
import type { Account, AccountsTable } from '../../db/types.js';
import type { AccountDto, AccountListQuery } from './account.schemas.js';

export function toAccountDto(a: Account): AccountDto {
  return {
    code: a.code,
    name: a.name,
    nameEn: a.name_en,
    parentCode: a.parent_code,
    level: a.level,
    normalSide: a.normal_side,
    isPosting: a.is_posting,
    trackPartner: a.track_partner,
    trackCostItem: a.track_cost_item,
    trackDepartment: a.track_department,
    trackContract: a.track_contract,
    trackEmployee: a.track_employee,
    trackCase: a.track_case,
    trackProject: a.track_project,
    trackCapitalSource: a.track_capital_source,
    trackCashflow: a.track_cashflow,
    isForeignCurrency: a.is_foreign_currency,
    trackProduct: a.track_product,
    trackInternalDebt: a.track_internal_debt,
    isVat: a.is_vat,
    isDebt: a.is_debt,
    isLoan: a.is_loan,
    alwaysIncrease: a.always_increase,
    isLedger: a.is_ledger,
    isCost: a.is_cost,
    isActive: a.is_active,
  };
}

export const accountRepository = {
  list(db: Db, tenantId: string, q: AccountListQuery) {
    let query = db.selectFrom('accounts').selectAll().where('tenant_id', '=', tenantId);
    if (!q.includeInactive) query = query.where('is_active', '=', true);
    if (q.postingOnly) query = query.where('is_posting', '=', true);
    if (q.search) {
      const s = `%${q.search.toLowerCase()}%`;
      query = query.where((eb) => eb.or([eb('code', 'like', `${q.search}%`), eb(eb.fn('lower', ['name']), 'like', s)]));
    }
    return query.orderBy('code').execute();
  },

  findByCode(db: Db, tenantId: string, code: string) {
    return db.selectFrom('accounts').selectAll().where('tenant_id', '=', tenantId).where('code', '=', code).executeTakeFirst();
  },

  /** Toàn bộ tài khoản của đơn vị dạng Map — dùng cho bộ định khoản và báo cáo. */
  async mapByCode(db: Db, tenantId: string): Promise<Map<string, Account>> {
    const rows = await db.selectFrom('accounts').selectAll().where('tenant_id', '=', tenantId).execute();
    return new Map(rows.map((r) => [r.code, r]));
  },

  insert(db: Db, row: Insertable<AccountsTable>) {
    return db.insertInto('accounts').values(row).returningAll().executeTakeFirstOrThrow();
  },

  update(db: Db, tenantId: string, code: string, patch: Record<string, unknown>) {
    return db.updateTable('accounts').set(patch).where('tenant_id', '=', tenantId).where('code', '=', code).returningAll().executeTakeFirst();
  },

  markNonPosting(db: Db, tenantId: string, code: string) {
    return db.updateTable('accounts').set({ is_posting: false }).where('tenant_id', '=', tenantId).where('code', '=', code).execute();
  },

  hasLedgerLines(db: Db, tenantId: string, code: string) {
    return db
      .selectFrom('ledger_lines')
      .select('id')
      .where('tenant_id', '=', tenantId)
      .where('account_code', '=', code)
      .limit(1)
      .executeTakeFirst()
      .then((r) => Boolean(r));
  },
};
