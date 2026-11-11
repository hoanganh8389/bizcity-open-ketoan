// @bizcity-layer K kernel/accounts
// [2026-10-29 10:24 PM Johnny Chu - Chu Hoàng Anh] INIT — khởi tạo Bizcity Core Framework: sổ cái chỉ thêm, cửa nạp sự việc, CANON, hợp đồng, bộ kiểm chuẩn.
// [2026-10-30 09:58 AM Johnny Chu - Chu Hoàng Anh] PHASE-002 — nhãn lớp @bizcity-layer, đồ thị phụ thuộc mốc, bản nháp API module-sdk.
// [2026-11-01 04:39 PM Johnny Chu - Chu Hoàng Anh] PHASE-010 — dời từ apps/api/src/modules/accounts/account.service.ts sang packages/kernel (@bizcity/kernel, D010-7 chặng 3); import Platform qua @bizcity/platform
// [2026-11-02 10:40 PM Johnny Chu - Chu Hoàng Anh] PHASE-023 — S023-14 / 15: lưu trả phát hiện khung Vì sao; cảnh báo mềm có lý do → catalog.warn.ack, không lý do (API / plugin) → catalog.warn.unacked
/**
 * Luật danh mục tài khoản:
 *  - Tài khoản con phải có tài khoản cha tồn tại; số tài khoản con bắt đầu bằng số cha.
 *  - Khi thêm con, tài khoản cha thành tài khoản tổng hợp (không ghi sổ trực tiếp).
 *    Nếu cha đã có phát sinh thì không cho thêm con (số liệu cũ sẽ treo ở cha).
 *  - Không đổi số tài khoản sau khi tạo.
 *  - Xoá: chỉ tài khoản chưa có con, chưa có phát sinh, chưa dùng ở danh mục khác. Tài khoản mẹ hết con thì ghi sổ trực tiếp lại.
 *  - Khung Vì sao (PHASE-023): lưu luôn trả `findings`; còn cảnh báo mềm thì ghi nhận vào nhật ký — có lý do (giao diện bắt buộc,
 *    D023-6) là `catalog.warn.ack`, không có lý do (API / plugin) là `catalog.warn.unacked`. Cảnh báo mềm không chặn lưu.
 */
import { db, type Db } from '@bizcity/platform/db/client';
import type { Account } from '@bizcity/platform/db/types';
import { Errors } from '@bizcity/platform/core/errors';
import { writeAudit } from '@bizcity/platform/core/audit';
import type { AuthContext } from '@bizcity/platform/core/auth';
import { accountRepository, toAccountDto } from './account.repository.js';
import type { AccountCreate, AccountDto, AccountListQuery, AccountUpdate } from './account.schemas.js';
import type { CatalogFinding } from '@ketoan/contracts';
import { accountHints, type AccountDraft } from './account.hints.js';

export const accountService = {
  async list(auth: AuthContext, q: AccountListQuery): Promise<AccountDto[]> {
    return (await accountRepository.list(db, auth.tenantId, q)).map(toAccountDto);
  },

  async get(auth: AuthContext, code: string): Promise<AccountDto> {
    const a = await accountRepository.findByCode(db, auth.tenantId, code);
    if (!a) throw Errors.notFound(`tài khoản ${code}`);
    return toAccountDto(a);
  },

  /** Khung Vì sao: phát hiện cho một bản khai báo (chỉ đọc). */ // [2026-11-03 10:30 AM Johnny Chu - Chu Hoàng Anh] PHASE-023 — S023-14 / 15 (gộp main W6)
  validate(auth: AuthContext, draft: AccountDraft, mode: 'create' | 'update'): Promise<CatalogFinding[]> {
    return accountHints(db, auth.tenantId, draft, mode);
  },

  // [2026-11-03 01:40 AM Johnny Chu - Chu Hoàng Anh] PHASE-014 — W6 (SC-ACT-1): bản *In chạy trong giao dịch có sẵn, không ghi bằng chứng (action core.account.* — runtime ghi); bản cũ giữ chữ ký, tự mở giao dịch + bằng chứng
  async createIn(trx: Db, tenantId: string, input: AccountCreate): Promise<AccountDto> {
    let level = 1;
    if (input.parentCode) {
      const parent = await accountRepository.findByCode(trx, tenantId, input.parentCode);
      if (!parent) throw Errors.validation(`Tài khoản cha ${input.parentCode} chưa có trong danh mục`);
      if (!parent.is_active) throw Errors.validation(`Tài khoản mẹ ${parent.code} đã ngừng sử dụng, không thêm tài khoản con được`);
      if (!input.code.startsWith(parent.code)) throw Errors.validation('Số tài khoản con phải bắt đầu bằng số tài khoản cha');
      if (parent.is_posting && (await accountRepository.hasLedgerLines(trx, tenantId, parent.code))) {
        throw Errors.conflict(`Tài khoản ${parent.code} đã có phát sinh, không thể thêm tài khoản con`);
      }
      level = parent.level + 1;
      await accountRepository.markNonPosting(trx, tenantId, parent.code);
    }
    const row = await accountRepository.insert(trx, {
      tenant_id: tenantId,
      code: input.code,
      name: input.name,
      name_en: input.nameEn ?? null,
      description: input.description ?? '',
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
      track_cash_item: input.trackCashItem,
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
    return toAccountDto(row);
  },

  async create(auth: AuthContext, input: AccountCreate): Promise<AccountDto> {
    return db.transaction().execute(async (trx) => {
      const dto = await accountService.createIn(trx, auth.tenantId, input);
      await writeAudit(trx, { tenantId: auth.tenantId, actor: auth.actor, action: 'account.create', objectType: 'account', objectId: input.code, after: dto });
      return dto;
    });
  },

  /** Xoá tài khoản chưa có phát sinh; trả bản trước khi xoá. */
  async removeIn(trx: Db, tenantId: string, code: string): Promise<Account> {
    const before = await accountRepository.findByCode(trx, tenantId, code);
    if (!before) throw Errors.notFound(`tài khoản ${code}`);
    const child = await trx.selectFrom('accounts').select('code').where('tenant_id', '=', tenantId).where('parent_code', '=', code).executeTakeFirst();
    if (child) throw Errors.conflict(`Tài khoản ${code} có tài khoản con (${child.code}): xoá tài khoản con trước`);
    if (await accountRepository.hasLedgerLines(trx, tenantId, code)) throw Errors.conflict(`Tài khoản ${code} đã có phát sinh, không xoá được (có thể ngừng sử dụng)`);
    await trx.deleteFrom('accounts').where('tenant_id', '=', tenantId).where('code', '=', code).execute();
    if (before.parent_code) {
      const sibling = await trx.selectFrom('accounts').select('code').where('tenant_id', '=', tenantId).where('parent_code', '=', before.parent_code).executeTakeFirst();
      if (!sibling) await trx.updateTable('accounts').set({ is_posting: true }).where('tenant_id', '=', tenantId).where('code', '=', before.parent_code).execute();
    }
    return before;
  },

  async remove(auth: AuthContext, code: string): Promise<{ code: string }> {
    return db.transaction().execute(async (trx) => {
      const before = await accountService.removeIn(trx, auth.tenantId, code);
      await writeAudit(trx, { tenantId: auth.tenantId, actor: auth.actor, action: 'account.delete', objectType: 'account', objectId: code, before });
      return { code };
    });
  },

  /** Sửa tài khoản; trả bản trước / sau (sau = trước khi không đổi gì). */
  async updateIn(trx: Db, tenantId: string, code: string, input: AccountUpdate): Promise<{ before: Account; after: Account; changed: boolean }> {
    const before = await accountRepository.findByCode(trx, tenantId, code);
    if (!before) throw Errors.notFound(`tài khoản ${code}`);
    const patch: Record<string, unknown> = {};
    if (input.name !== undefined) patch.name = input.name;
    if (input.nameEn !== undefined) patch.name_en = input.nameEn;
    if (input.description !== undefined) patch.description = input.description;
    if (input.normalSide !== undefined) patch.normal_side = input.normalSide;
    if (input.trackPartner !== undefined) patch.track_partner = input.trackPartner;
    if (input.trackCostItem !== undefined) patch.track_cost_item = input.trackCostItem;
    if (input.trackDepartment !== undefined) patch.track_department = input.trackDepartment;
    if (input.trackContract !== undefined) patch.track_contract = input.trackContract;
    if (input.trackEmployee !== undefined) patch.track_employee = input.trackEmployee;
    if (input.trackCase !== undefined) patch.track_case = input.trackCase;
    if (input.trackProject !== undefined) patch.track_project = input.trackProject;
    if (input.trackCapitalSource !== undefined) patch.track_capital_source = input.trackCapitalSource;
    if (input.trackCashItem !== undefined) patch.track_cash_item = input.trackCashItem;
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
    if (Object.keys(patch).length === 0) return { before, after: before, changed: false };
    const after = await accountRepository.update(trx, tenantId, code, patch);
    return { before, after: after!, changed: true };
  },

  async update(auth: AuthContext, code: string, input: AccountUpdate): Promise<AccountDto> {
    return db.transaction().execute(async (trx) => {
      const r = await accountService.updateIn(trx, auth.tenantId, code, input);
      if (r.changed) await writeAudit(trx, { tenantId: auth.tenantId, actor: auth.actor, action: 'account.update', objectType: 'account', objectId: code, before: r.before, after: r.after });
      return toAccountDto(r.after);
    });
  },
};
