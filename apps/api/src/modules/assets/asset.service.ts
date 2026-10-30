// @bizcity-layer D modules/tai-san
/**
 * Tài sản cố định, công cụ dụng cụ, chi phí trả trước.
 *
 *  - Loại tài sản và thẻ tài sản: thêm, sửa, xoá (chỉ xoá được thẻ chưa trích tháng nào), nhập hàng loạt.
 *  - Phân bổ chi phí: một thẻ chia số trích cho nhiều dòng (tỷ lệ %, chi nhánh chịu chi phí, TK chi phí,
 *    khoản mục, bộ phận, hợp đồng). Không có dòng: dùng TK chi phí / khoản mục / bộ phận trên thẻ.
 *  - Sự kiện: đánh giá lại (đổi nguyên giá, giá trị tính khấu hao, luỹ kế, số tháng còn lại, mức tháng),
 *    điều chuyển (đổi chi nhánh, tháng điều chuyển chia số trích theo ngày cho hai nơi), kiểm kê.
 *    Sự kiện không tự ghi sổ cái: bút toán (nếu có) lập bằng phiếu kế toán.
 *  - run(): tính khấu hao / phân bổ một tháng, ghi sổ nhật ký chung mỗi chi nhánh một chứng từ
 *    "Khấu hao, phân bổ" (docKey depreciation:<chi nhánh>:<YYYY-MM>, ngày cuối tháng):
 *        Nợ TK chi phí (kèm khoản mục, bộ phận, hợp đồng)  /  Có TK hao mòn 214x hoặc chờ phân bổ 242x
 *    Kế toán sửa tay được số trích một tháng (kèm lý do).
 *    Tháng thiếu: tháng trước (sau mốc luỹ kế chuyển sổ) chưa trích mà lẽ ra có số. catchUp: tính lần lượt từng tháng
 *    thiếu và DỒN vào tháng đang tính; dòng trích của tháng ghi covers_from = tháng thiếu đầu tiên đã dồn, bút toán
 *    có dòng riêng "trích bổ sung". Tính lại tháng đó thì phần dồn được tính lại theo lựa chọn mới.
 *    Tính lại một tháng: bút toán cũ ghi số âm, số trích từng thẻ của tháng đó tính lại từ đầu.
 *  - register(): sổ tài sản / bảng tính khấu hao, phân bổ theo khoảng ngày.
 * Ghi tăng tài sản (Nợ 211 / Có 331, xuất CCDC dùng Nợ 242 / Có 153) và ghi giảm (Nợ 214, 811 / Có 211)
 * lập bằng phiếu kế toán; thẻ tài sản lo phần trích hằng tháng và lịch sử tài sản.
 */
import { fromCents, toCents } from '@ketoan/contracts';
import { sql } from 'kysely';
import { db, toNumber, type Db } from '../../db/client.js';
import { Errors } from '../../core/errors.js';
import { writeAudit } from '../../core/audit.js';
import type { AuthContext } from '../../core/auth.js';
import { accountRepository } from '../accounts/account.repository.js';
import { documentRepository } from '../documents/document.repository.js';
import { logPosting } from '../documents/document.service.js';
import { ledgerRepository } from '../ledger/ledger.repository.js';
import { ledgerService } from '../ledger/ledger.service.js';
import type { DraftLine } from '../ledger/ledger.types.js';
import {
  addDays, chargeFor, effectiveAt, firstChargePeriod, firstDayOf, fromIndex, lastDayOf, monthIndex, periodLabel, periodOf, scheduleAfter, splitByDays, splitByPercent,
  type DepreciableAsset, type Period, type Revaluation,
} from './depreciation.js';

export type AssetKind = 'fixed_asset' | 'tool' | 'prepaid';
export const KIND_LABEL: Record<AssetKind, string> = { fixed_asset: 'Tài sản cố định', tool: 'Công cụ dụng cụ', prepaid: 'Chi phí trả trước' };
export const EVENT_LABEL: Record<string, string> = { revaluation: 'Đánh giá lại', transfer: 'Điều chuyển', audit: 'Kiểm kê', increase: 'Hạch toán ghi tăng', decrease: 'Hạch toán ghi giảm / thanh lý' };
export const AUDIT_RESULT: Record<string, string> = { ok: 'Còn, đang dùng tốt', damaged: 'Hỏng, cần sửa chữa', unused: 'Không dùng đến', missing: 'Thiếu, không tìm thấy' };

export interface CategoryInput {
  code: string; name: string; kind: AssetKind; assetAccount?: string | null; depreciationAccount: string; expenseAccount: string; usefulLifeMonths?: number | null; parentCode?: string | null; isActive?: boolean;
}
export interface AllocationInput { percent: number; branchCode?: string | null; expenseAccount: string; costItemCode?: string | null; departmentCode?: string | null; contractCode?: string | null }
export interface AssetInput {
  code: string; name: string; kind: AssetKind; categoryCode?: string | null; branchCode: string; unit?: string; quantity?: number;
  acquiredDate?: string | null; startDate: string; originalCost: number; depreciableAmount?: number | null; usefulLifeMonths: number; monthlyAmount?: number | null;
  taxMonthlyAmount?: number | null; openingAccumulated?: number; openingAsOf?: string | null; openingRemainingMonths?: number | null;
  assetAccount?: string | null; depreciationAccount: string; expenseAccount: string;
  costItemCode?: string | null; departmentCode?: string | null; contractCode?: string | null; toolGroupCode?: string | null; usagePurposeCode?: string | null; specs?: { name: string; value: string }[]; allocations?: AllocationInput[];
  status?: 'in_use' | 'stopped' | 'disposed'; disposedDate?: string | null; note?: string;
}
export interface EventInput {
  kind: 'revaluation' | 'transfer' | 'audit';
  date: string;
  docNo?: string;
  note?: string;
  /** Đánh giá lại: chênh lệch (tăng +, giảm −) và thời gian còn lại. */
  costDelta?: number; depreciableDelta?: number | null; accumulatedDelta?: number; remainingMonths?: number | null; monthlyAmount?: number | null;
  /** Điều chuyển. */
  toBranchCode?: string;
  /** Kiểm kê. */
  result?: 'ok' | 'damaged' | 'unused' | 'missing'; actualQuantity?: number | null;
}

export function parsePeriod(s: string): Period {
  const m = /^(\d{4})-(\d{2})$/.exec(s);
  if (!m || Number(m[2]) < 1 || Number(m[2]) > 12) throw Errors.validation('Kỳ dạng YYYY-MM');
  return { year: Number(m[1]), month: Number(m[2]) };
}

const cents = (v: string | number | null | undefined) => toCents(toNumber(v ?? 0));
const centsOrNull = (v: string | number | null | undefined) => (v === null || v === undefined ? null : toCents(toNumber(v)));

export interface CalcRow {
  start_date: string; original_cost: string; depreciable_amount: string | null; useful_life_months: number; monthly_amount: string | null;
  opening_accumulated: string; opening_as_of: string | null; opening_remaining_months: number | null; status: string; disposed_date: string | null;
}
export const calcOf = (r: CalcRow, revaluations: Revaluation[] = []): DepreciableAsset => ({
  startDate: r.start_date,
  originalCost: cents(r.original_cost),
  depreciableAmount: centsOrNull(r.depreciable_amount),
  usefulLifeMonths: r.useful_life_months,
  monthlyAmount: centsOrNull(r.monthly_amount),
  openingAccumulated: cents(r.opening_accumulated),
  openingAsOf: r.opening_as_of,
  openingRemainingMonths: r.opening_remaining_months,
  status: r.status,
  disposedDate: r.disposed_date,
  revaluations,
});

export const revaluationOf = (e: { event_date: string; payload: Record<string, unknown> }): Revaluation => ({
  date: e.event_date,
  costDelta: cents(e.payload.costDelta as number),
  depreciableDelta: cents((e.payload.depreciableDelta ?? e.payload.costDelta) as number),
  accumulatedDelta: cents(e.payload.accumulatedDelta as number),
  monthlyAmount: centsOrNull(e.payload.monthlyAmount as number | null),
  remainingMonths: (e.payload.remainingMonths as number | null) ?? null,
});

/**
 * Các lần đánh giá lại của một tài sản, đã tính mức tháng khi chỉ khai số tháng còn lại:
 * mức = phần còn lại tại tháng đánh giá ÷ số tháng. `sumBefore(i)`: số đã trích (xu) trước tháng i.
 */
export function buildRevaluations(a: CalcRow, events: { kind: string; event_date: string | Date; payload: Record<string, unknown> }[], sumBefore: (i: number) => number): Revaluation[] {
  const revals: Revaluation[] = [];
  for (const e of events.filter((x) => x.kind === 'revaluation')) {
    const r = revaluationOf({ event_date: String(e.event_date), payload: e.payload });
    if (r.remainingMonths && r.monthlyAmount === null) {
      const before = calcOf(a, revals);
      const eff = effectiveAt({ ...before, revaluations: [...revals, { ...r, remainingMonths: null }] }, periodOf(r.date));
      const left = eff.depreciable - eff.opening - sumBefore(monthIndex(periodOf(r.date)));
      r.monthlyAmount = Math.max(Math.round(left / r.remainingMonths / 100) * 100, 0);
    }
    revals.push(r);
  }
  return revals;
}

/** Kiểm tra tài khoản: có trong danh mục, là tài khoản chi tiết, đang dùng. */
async function accountProblems(trx: Db, tenantId: string, codes: (string | null | undefined)[], accounts?: Awaited<ReturnType<typeof accountRepository.mapByCode>>) {
  const map = accounts ?? (await accountRepository.mapByCode(trx, tenantId));
  const problems: string[] = [];
  for (const c of codes) {
    if (!c) continue;
    const a = map.get(c);
    if (!a) problems.push(`Tài khoản ${c} không có trong danh mục`);
    else if (!a.is_posting) problems.push(`Tài khoản ${c} là tài khoản tổng hợp, hãy chọn tài khoản chi tiết`);
    else if (!a.is_active) problems.push(`Tài khoản ${c} đã ngừng sử dụng`);
  }
  return problems;
}
async function assertAccounts(trx: Db, tenantId: string, codes: (string | null | undefined)[]) {
  const problems = await accountProblems(trx, tenantId, codes);
  if (problems.length) throw Errors.validation('Tài khoản chưa đúng', problems);
}

/** Danh mục dùng khi kiểm tra một loạt thẻ (nạp một lần). */
async function loadLookups(trx: Db, tenantId: string) {
  const [branches, categories, accounts, extra] = await Promise.all([
    trx.selectFrom('branches').select(['id', 'code']).where('tenant_id', '=', tenantId).execute(),
    trx.selectFrom('asset_categories').select(['id', 'code']).where('tenant_id', '=', tenantId).execute(),
    accountRepository.mapByCode(trx, tenantId),
    trx.selectFrom('dimensions').select(['kind', 'code']).where('tenant_id', '=', tenantId).where('kind', 'in', ['tool_group', 'usage_purpose']).execute(),
  ]);
  return {
    branches: new Map(branches.map((b) => [b.code, b.id])), categories: new Map(categories.map((c) => [c.code, c.id])), accounts,
    toolGroups: new Set(extra.filter((d) => d.kind === 'tool_group').map((d) => d.code)),
    usagePurposes: new Set(extra.filter((d) => d.kind === 'usage_purpose').map((d) => d.code)),
  };
}
type Lookups = Awaited<ReturnType<typeof loadLookups>>;

/** Kiểm tra một thẻ và dựng dòng ghi bảng; trả lỗi thay vì ném để nhập hàng loạt báo đủ mọi dòng sai. */
async function buildAssetRow(trx: Db, tenantId: string, input: AssetInput, lk: Lookups) {
  const problems: string[] = [];
  const warnings: string[] = [];
  const branchId = lk.branches.get(input.branchCode);
  if (!branchId) problems.push(`Chi nhánh ${input.branchCode} không có trong danh mục`);
  const categoryId = input.categoryCode ? lk.categories.get(input.categoryCode) : null;
  if (input.categoryCode && !categoryId) problems.push(`Loại tài sản ${input.categoryCode} không có trong danh mục`);
  if (input.toolGroupCode && !lk.toolGroups.has(input.toolGroupCode)) problems.push(`Nhóm công cụ dụng cụ ${input.toolGroupCode} không có trong danh mục`);
  if (input.usagePurposeCode && !lk.usagePurposes.has(input.usagePurposeCode)) problems.push(`Mục đích sử dụng ${input.usagePurposeCode} không có trong danh mục`);
  const depreciable = input.depreciableAmount ?? input.originalCost;
  if ((input.openingAccumulated ?? 0) > depreciable + 0.5) {
    warnings.push(`Luỹ kế đầu ${fmt(input.openingAccumulated ?? 0)} vượt giá trị tính khấu hao ${fmt(depreciable)} (lố ${fmt((input.openingAccumulated ?? 0) - depreciable)}): không trích thêm; kiểm tra và điều chỉnh bằng Đánh giá lại kèm phiếu kế toán`);
  }
  if (input.status !== 'disposed' && input.openingAsOf && input.openingRemainingMonths === 0 && (input.openingAccumulated ?? 0) < depreciable - 0.5) {
    warnings.push(`Hết số tháng nhưng còn ${fmt(depreciable - (input.openingAccumulated ?? 0))} chưa trích: tháng đầu tiên sẽ trích nốt toàn bộ`);
  }
  if ((input.openingAccumulated ?? 0) > 0 && !input.openingAsOf) problems.push('Có luỹ kế đầu thì phải ghi luỹ kế tính tới ngày nào');
  if (input.status === 'disposed' && !input.disposedDate) problems.push('Thẻ đã ghi giảm phải có ngày ghi giảm');
  if (input.kind === 'fixed_asset' && !input.assetAccount) problems.push('Tài sản cố định phải có tài khoản nguyên giá (211x, 213x)');
  const allocations = input.allocations ?? [];
  if (allocations.length) {
    const total = allocations.reduce((s, a) => s + Number(a.percent), 0);
    if (Math.abs(total - 100) > 0.001) problems.push(`Tổng tỷ lệ phân bổ phải bằng 100% (đang ${total}%)`);
    for (const a of allocations) if (a.branchCode && !lk.branches.has(a.branchCode)) problems.push(`Chi nhánh chịu chi phí ${a.branchCode} không có trong danh mục`);
  }
  problems.push(...(await accountProblems(trx, tenantId, [input.assetAccount, input.depreciationAccount, input.expenseAccount, ...allocations.map((a) => a.expenseAccount)], lk.accounts)));
  const row = {
    code: input.code.trim(), name: input.name.trim(), kind: input.kind, category_id: categoryId ?? null, branch_id: branchId ?? '0',
    unit: input.unit ?? '', quantity: input.quantity ?? 1, acquired_date: input.acquiredDate || null, start_date: input.startDate,
    original_cost: input.originalCost, depreciable_amount: input.depreciableAmount && input.depreciableAmount !== input.originalCost ? input.depreciableAmount : null,
    useful_life_months: input.usefulLifeMonths, monthly_amount: input.monthlyAmount || null, tax_monthly_amount: input.taxMonthlyAmount ?? null,
    opening_accumulated: input.openingAccumulated ?? 0, opening_as_of: input.openingAsOf || null, opening_remaining_months: input.openingRemainingMonths ?? null,
    asset_account: input.assetAccount || null, depreciation_account: input.depreciationAccount, expense_account: input.expenseAccount,
    cost_item_code: input.costItemCode || null, department_code: input.departmentCode || null, contract_code: input.contractCode || null,
    tool_group_code: input.toolGroupCode || null, usage_purpose_code: input.usagePurposeCode || null,
    ...(input.specs !== undefined ? { specs: JSON.stringify(input.specs.filter((s) => s.value)) } : {}),
    status: input.status ?? 'in_use', disposed_date: input.disposedDate || null, note: input.note ?? '',
  };
  const allocRows = allocations.map((a, i) => ({
    line_no: i + 1, percent: a.percent, branch_id: a.branchCode ? lk.branches.get(a.branchCode) ?? null : null, expense_account: a.expenseAccount,
    cost_item_code: a.costItemCode || null, department_code: a.departmentCode || null, contract_code: a.contractCode || null,
  }));
  return { row, allocRows, problems, warnings };
}

const fmt = (n: number) => Math.round(n).toLocaleString('vi-VN');

async function saveAllocations(trx: Db, assetId: string, rows: Awaited<ReturnType<typeof buildAssetRow>>['allocRows']) {
  await trx.deleteFrom('asset_allocations').where('asset_id', '=', assetId).execute();
  if (rows.length) await trx.insertInto('asset_allocations').values(rows.map((r) => ({ ...r, asset_id: assetId }))).execute();
}

interface AssetListRow extends CalcRow {
  id: string; code: string; name: string; kind: string; category_code: string | null; category_name: string | null; branch_code: string; branch_name: string;
  unit: string; quantity: string; acquired_date: string | null; tax_monthly_amount: string | null;
  asset_account: string | null; depreciation_account: string; expense_account: string;
  cost_item_code: string | null; department_code: string | null; contract_code: string | null; tool_group_code: string | null; usage_purpose_code: string | null; specs: { name: string; value: string }[] | null; has_photo: boolean; note: string; posted: string; last_period: string | null; reval_acc: string; reval_cost: string;
}

export const assetService = {
  /* ---------------- Loại tài sản ---------------- */
  async listCategories(auth: AuthContext) {
    const rows = await db.selectFrom('asset_categories').selectAll().where('tenant_id', '=', auth.tenantId).orderBy('kind').orderBy('code').execute();
    return rows.map((r) => ({ code: r.code, name: r.name, kind: r.kind, kindLabel: KIND_LABEL[r.kind as AssetKind], assetAccount: r.asset_account, depreciationAccount: r.depreciation_account, expenseAccount: r.expense_account, usefulLifeMonths: r.useful_life_months, parentCode: r.parent_code, isActive: r.is_active }));
  },

  async saveCategory(auth: AuthContext, input: CategoryInput, existingCode?: string) {
    return db.transaction().execute(async (trx) => {
      const code = (existingCode ?? input.code).trim();
      // Loại cha (đã có loại con) khai tài khoản tổng hợp; loại thường khai tài khoản chi tiết.
      const isGroup = Boolean(existingCode && (await trx.selectFrom('asset_categories').select('id').where('tenant_id', '=', auth.tenantId).where('parent_code', '=', code).executeTakeFirst()));
      if (isGroup) {
        const map = await accountRepository.mapByCode(trx, auth.tenantId);
        const missing = [input.assetAccount, input.depreciationAccount, input.expenseAccount].filter((c): c is string => Boolean(c) && !map.has(c!));
        if (missing.length) throw Errors.validation('Tài khoản chưa đúng', missing.map((c) => `Tài khoản ${c} không có trong danh mục`));
      } else await assertAccounts(trx, auth.tenantId, [input.assetAccount, input.depreciationAccount, input.expenseAccount]);
      const parent = input.parentCode?.trim() || null;
      if (parent) {
        if (parent === code) throw Errors.validation('Loại cha không được là chính nó');
        if (!(await trx.selectFrom('asset_categories').select('id').where('tenant_id', '=', auth.tenantId).where('code', '=', parent).executeTakeFirst())) throw Errors.validation(`Loại cha ${parent} không có trong danh mục`);
      }
      const values = { name: input.name.trim(), kind: input.kind, asset_account: input.assetAccount || null, depreciation_account: input.depreciationAccount, expense_account: input.expenseAccount, useful_life_months: input.usefulLifeMonths || null, parent_code: parent, is_active: input.isActive ?? true };
      if (existingCode) {
        const r = await trx.updateTable('asset_categories').set(values).where('tenant_id', '=', auth.tenantId).where('code', '=', existingCode).executeTakeFirst();
        if (!Number(r.numUpdatedRows)) throw Errors.notFound(`loại tài sản ${existingCode}`);
      } else {
        const dup = await trx.selectFrom('asset_categories').select('id').where('tenant_id', '=', auth.tenantId).where('code', '=', input.code.trim()).executeTakeFirst();
        if (dup) throw Errors.conflict(`Mã loại tài sản ${input.code} đã có`);
        await trx.insertInto('asset_categories').values({ tenant_id: auth.tenantId, code: input.code.trim(), ...values }).execute();
      }
      await writeAudit(trx, { tenantId: auth.tenantId, actor: auth.actor, action: existingCode ? 'asset_category.update' : 'asset_category.create', objectType: 'asset_category', objectId: existingCode ?? input.code, after: input });
      return { code: existingCode ?? input.code.trim() };
    });
  },

  async removeCategory(auth: AuthContext, code: string) {
    return db.transaction().execute(async (trx) => {
      const before = await trx.selectFrom('asset_categories').selectAll().where('tenant_id', '=', auth.tenantId).where('code', '=', code).executeTakeFirst();
      if (!before) throw Errors.notFound(`loại tài sản ${code}`);
      const child = await trx.selectFrom('asset_categories').select('code').where('tenant_id', '=', auth.tenantId).where('parent_code', '=', code).executeTakeFirst();
      if (child) throw Errors.conflict(`Loại ${code} có loại con (${child.code}): xoá loại con trước`);
      const used = await trx.selectFrom('assets').select('code').where('tenant_id', '=', auth.tenantId).where('category_id', '=', before.id).executeTakeFirst();
      if (used) throw Errors.conflict(`Loại ${code} đang dùng ở thẻ ${used.code}: bỏ tích "Theo dõi" để ngừng dùng`);
      await trx.deleteFrom('asset_categories').where('id', '=', before.id).execute();
      await writeAudit(trx, { tenantId: auth.tenantId, actor: auth.actor, action: 'asset_category.delete', objectType: 'asset_category', objectId: code, before });
      return { code };
    });
  },

  /* ---------------- Thẻ tài sản ---------------- */
  async list(auth: AuthContext, q: { kind?: AssetKind; search?: string; code?: string }) {
    const res = await sql<AssetListRow>`
      SELECT a.id, a.code, a.name, a.kind, c.code AS category_code, c.name AS category_name, b.code AS branch_code, b.name AS branch_name,
             a.unit, a.quantity, a.acquired_date::text, a.start_date::text, a.original_cost, a.depreciable_amount, a.useful_life_months, a.monthly_amount, a.tax_monthly_amount,
             a.opening_accumulated, a.opening_as_of::text, a.opening_remaining_months, a.asset_account, a.depreciation_account, a.expense_account,
             a.cost_item_code, a.department_code, a.contract_code, a.tool_group_code, a.usage_purpose_code, a.specs, (a.photo IS NOT NULL) AS has_photo, a.status, a.disposed_date::text, a.note,
             COALESCE((SELECT SUM(d.amount) FROM asset_depreciations d WHERE d.asset_id = a.id), 0) AS posted,
             (SELECT to_char(make_date(d.year, d.month, 1), 'YYYY-MM') FROM asset_depreciations d
               WHERE d.asset_id = a.id ORDER BY d.year DESC, d.month DESC LIMIT 1) AS last_period,
             COALESCE((SELECT SUM((e.payload->>'accumulatedDelta')::numeric) FROM asset_events e WHERE e.asset_id = a.id AND e.kind = 'revaluation'), 0) AS reval_acc,
             COALESCE((SELECT SUM((e.payload->>'costDelta')::numeric) FROM asset_events e WHERE e.asset_id = a.id AND e.kind = 'revaluation'), 0) AS reval_cost
        FROM assets a
        JOIN branches b ON b.id = a.branch_id
        LEFT JOIN asset_categories c ON c.id = a.category_id
       WHERE a.tenant_id = ${auth.tenantId}
         ${q.kind ? sql`AND a.kind = ${q.kind}` : sql``}
         ${q.code ? sql`AND a.code = ${q.code}` : sql``}
         ${q.search ? sql`AND (a.code ILIKE ${'%' + q.search + '%'} OR a.name ILIKE ${'%' + q.search + '%'})` : sql``}
       ORDER BY a.kind, a.code`.execute(db);
    const ids = res.rows.map((r) => r.id);
    const allocs = ids.length
      ? await db.selectFrom('asset_allocations as l').leftJoin('branches as b', 'b.id', 'l.branch_id').select(['l.asset_id', 'l.line_no', 'l.percent', 'b.code as branch_code', 'l.expense_account', 'l.cost_item_code', 'l.department_code', 'l.contract_code']).where('l.asset_id', 'in', ids).orderBy('l.line_no').execute()
      : [];
    return res.rows.map((r) => {
      const cost = toNumber(r.original_cost) + toNumber(r.reval_cost);
      const depreciable = (r.depreciable_amount === null ? toNumber(r.original_cost) : toNumber(r.depreciable_amount)) + toNumber(r.reval_cost);
      const accumulated = toNumber(r.opening_accumulated) + toNumber(r.reval_acc) + toNumber(r.posted);
      return {
        code: r.code, name: r.name, kind: r.kind, kindLabel: KIND_LABEL[r.kind as AssetKind], categoryCode: r.category_code, categoryName: r.category_name,
        branchCode: r.branch_code, branchName: r.branch_name, unit: r.unit, quantity: toNumber(r.quantity), acquiredDate: r.acquired_date, startDate: r.start_date,
        originalCost: toNumber(r.original_cost), currentCost: cost, depreciableAmount: r.depreciable_amount === null ? null : toNumber(r.depreciable_amount),
        usefulLifeMonths: r.useful_life_months, monthlyAmount: r.monthly_amount === null ? null : toNumber(r.monthly_amount), taxMonthlyAmount: r.tax_monthly_amount === null ? null : toNumber(r.tax_monthly_amount),
        openingAccumulated: toNumber(r.opening_accumulated), openingAsOf: r.opening_as_of, openingRemainingMonths: r.opening_remaining_months,
        assetAccount: r.asset_account, depreciationAccount: r.depreciation_account, expenseAccount: r.expense_account,
        costItemCode: r.cost_item_code, departmentCode: r.department_code, contractCode: r.contract_code, toolGroupCode: r.tool_group_code, usagePurposeCode: r.usage_purpose_code, specs: r.specs ?? [], hasPhoto: r.has_photo, status: r.status,
        disposedDate: r.disposed_date, note: r.note, accumulated: fromCents(toCents(accumulated)), remaining: fromCents(toCents(depreciable - accumulated)), lastPeriod: r.last_period,
        allocations: allocs.filter((l) => l.asset_id === r.id).map((l) => ({ percent: toNumber(l.percent), branchCode: l.branch_code, expenseAccount: l.expense_account, costItemCode: l.cost_item_code, departmentCode: l.department_code, contractCode: l.contract_code })),
      };
    });
  },

  async create(auth: AuthContext, input: AssetInput) {
    return db.transaction().execute(async (trx) => {
      const dup = await trx.selectFrom('assets').select('id').where('tenant_id', '=', auth.tenantId).where('code', '=', input.code.trim()).executeTakeFirst();
      if (dup) throw Errors.conflict(`Mã tài sản ${input.code} đã có`);
      const b = await buildAssetRow(trx, auth.tenantId, input, await loadLookups(trx, auth.tenantId));
      if (b.problems.length) throw Errors.validation('Thẻ tài sản chưa đúng', b.problems);
      const r = await trx.insertInto('assets').values({ tenant_id: auth.tenantId, ...b.row }).returning('id').executeTakeFirstOrThrow();
      await saveAllocations(trx, r.id, b.allocRows);
      await writeAudit(trx, { tenantId: auth.tenantId, actor: auth.actor, action: 'asset.create', objectType: 'asset', objectId: b.row.code, after: input });
      return { code: b.row.code, warnings: b.warnings };
    });
  },

  async update(auth: AuthContext, code: string, input: AssetInput) {
    return db.transaction().execute(async (trx) => {
      const cur = await trx.selectFrom('assets').selectAll().where('tenant_id', '=', auth.tenantId).where('code', '=', code).executeTakeFirst();
      if (!cur) throw Errors.notFound(`tài sản ${code}`);
      const b = await buildAssetRow(trx, auth.tenantId, { ...input, code }, await loadLookups(trx, auth.tenantId));
      if (b.problems.length) throw Errors.validation('Thẻ tài sản chưa đúng', b.problems);
      await trx.updateTable('assets').set({ ...b.row, updated_at: new Date() }).where('id', '=', cur.id).execute();
      await saveAllocations(trx, cur.id, b.allocRows);
      await writeAudit(trx, { tenantId: auth.tenantId, actor: auth.actor, action: 'asset.update', objectType: 'asset', objectId: code, before: cur, after: input });
      return { code, warnings: b.warnings };
    });
  },

  async remove(auth: AuthContext, code: string) {
    return db.transaction().execute(async (trx) => {
      const cur = await trx.selectFrom('assets').select(['id']).where('tenant_id', '=', auth.tenantId).where('code', '=', code).executeTakeFirst();
      if (!cur) throw Errors.notFound(`tài sản ${code}`);
      const used = await trx.selectFrom('asset_depreciations').select('id').where('asset_id', '=', cur.id).where('amount', '<>', '0').executeTakeFirst();
      if (used) throw Errors.conflict('Tài sản đã có tháng trích khấu hao / phân bổ: không xoá được. Ghi giảm (thanh lý) hoặc tạm ngừng thay cho xoá.');
      await trx.deleteFrom('assets').where('id', '=', cur.id).execute();
      await writeAudit(trx, { tenantId: auth.tenantId, actor: auth.actor, action: 'asset.delete', objectType: 'asset', objectId: code });
      return { code };
    });
  },

  /**
   * Nhập hàng loạt thẻ tài sản (chuyển sổ, nhập từ Excel). Kiểm tra hết rồi mới ghi: có dòng sai thì không ghi
   * dòng nào và trả danh sách lỗi theo dòng. Mã đã có: cập nhật nếu thẻ chưa trích tháng nào, ngược lại báo lỗi.
   * createBranches: chi nhánh chưa có thì tạo (tên = mã) thay vì báo lỗi.
   */
  async importMany(auth: AuthContext, q: { assets: AssetInput[]; createBranches?: boolean; dryRun?: boolean }) {
    return db.transaction().execute(async (trx) => {
      if (q.createBranches && !q.dryRun) {
        const codes = [...new Set(q.assets.flatMap((a) => [a.branchCode, ...(a.allocations ?? []).map((l) => l.branchCode ?? '')]).filter(Boolean))];
        const have = new Set((await trx.selectFrom('branches').select('code').where('tenant_id', '=', auth.tenantId).execute()).map((b) => b.code));
        const missing = codes.filter((c) => !have.has(c));
        if (missing.length) await trx.insertInto('branches').values(missing.map((c) => ({ tenant_id: auth.tenantId, code: c, name: `Chi nhánh ${c}` }))).execute();
      }
      const lk = await loadLookups(trx, auth.tenantId);
      const existing = new Map((await trx.selectFrom('assets').select(['id', 'code']).where('tenant_id', '=', auth.tenantId).execute()).map((a) => [a.code, a.id]));
      const used = new Set((await sql<{ code: string }>`SELECT DISTINCT a.code FROM assets a JOIN asset_depreciations d ON d.asset_id = a.id AND d.amount <> 0 WHERE a.tenant_id = ${auth.tenantId}`.execute(trx)).rows.map((r) => r.code));
      const errors: { row: number; code: string; problems: string[] }[] = [];
      const warnings: { row: number; code: string; warnings: string[] }[] = [];
      const seen = new Set<string>();
      const built = [];
      for (const [i, input] of q.assets.entries()) {
        const b = await buildAssetRow(trx, auth.tenantId, input, lk);
        // Kiểm tra trước khi tự tạo chi nhánh: chi nhánh chưa có không tính là lỗi.
        if (q.dryRun && q.createBranches) b.problems = b.problems.filter((x) => !/^Chi nhánh( chịu chi phí)? .* không có trong danh mục$/.test(x));
        if (seen.has(b.row.code)) b.problems.push('Trùng mã với dòng khác trong tệp');
        seen.add(b.row.code);
        if (used.has(b.row.code)) b.problems.push('Mã đã có và đã trích khấu hao: sửa trên thẻ, không nhập đè');
        if (b.problems.length) errors.push({ row: i + 1, code: b.row.code, problems: b.problems });
        if (b.warnings.length) warnings.push({ row: i + 1, code: b.row.code, warnings: b.warnings });
        built.push(b);
      }
      if (errors.length || q.dryRun) return { created: 0, updated: 0, errors, warnings, dryRun: Boolean(q.dryRun) };
      let created = 0;
      let updated = 0;
      for (const b of built) {
        const id = existing.get(b.row.code);
        if (id) {
          await trx.updateTable('assets').set({ ...b.row, updated_at: new Date() }).where('id', '=', id).execute();
          await saveAllocations(trx, id, b.allocRows);
          updated += 1;
        } else {
          const r = await trx.insertInto('assets').values({ tenant_id: auth.tenantId, ...b.row }).returning('id').executeTakeFirstOrThrow();
          await saveAllocations(trx, r.id, b.allocRows);
          created += 1;
        }
      }
      await writeAudit(trx, { tenantId: auth.tenantId, actor: auth.actor, action: 'asset.import', objectType: 'asset', objectId: `${q.assets.length}`, after: { created, updated } });
      return { created, updated, errors, warnings };
    });
  },

  /* ---------------- Sự kiện: đánh giá lại, điều chuyển, kiểm kê ---------------- */
  async listEvents(auth: AuthContext, q: { kind?: string; assetCode?: string; from?: string; to?: string }) {
    const rows = await sql<{ id: string; kind: string; event_date: string; doc_no: string; payload: Record<string, unknown>; note: string; created_by: string; code: string; name: string; asset_kind: string; branch_code: string }>`
      SELECT e.id, e.kind, e.event_date::text, e.doc_no, e.payload, e.note, e.created_by, a.code, a.name, a.kind AS asset_kind, b.code AS branch_code
        FROM asset_events e JOIN assets a ON a.id = e.asset_id JOIN branches b ON b.id = a.branch_id
       WHERE e.tenant_id = ${auth.tenantId}
         ${q.kind ? sql`AND e.kind = ${q.kind}` : sql``}
         ${q.assetCode ? sql`AND a.code = ${q.assetCode}` : sql``}
         ${q.from ? sql`AND e.event_date >= ${q.from}::date` : sql``}
         ${q.to ? sql`AND e.event_date <= ${q.to}::date` : sql``}
       ORDER BY e.event_date DESC, e.id DESC`.execute(db);
    return rows.rows.map((r) => ({
      id: r.id, kind: r.kind, kindLabel: EVENT_LABEL[r.kind] ?? r.kind, date: r.event_date, docNo: r.doc_no, note: r.note, createdBy: r.created_by,
      assetCode: r.code, assetName: r.name, assetKind: r.asset_kind, branchCode: r.branch_code, ...r.payload,
      resultLabel: r.kind === 'audit' ? AUDIT_RESULT[String(r.payload.result)] ?? '' : undefined,
    }));
  },

  async addEvent(auth: AuthContext, code: string, input: EventInput) {
    return db.transaction().execute(async (trx) => {
      const a = await trx.selectFrom('assets').selectAll().where('tenant_id', '=', auth.tenantId).where('code', '=', code).executeTakeFirst();
      if (!a) throw Errors.notFound(`tài sản ${code}`);
      if (input.date < String(a.start_date) && input.kind !== 'audit') throw Errors.validation('Ngày sự kiện trước ngày bắt đầu sử dụng tài sản');
      if (a.status === 'disposed' && a.disposed_date && input.date >= String(a.disposed_date)) throw Errors.validation('Tài sản đã ghi giảm trước ngày này');
      let payload: Record<string, unknown> = {};
      if (input.kind === 'revaluation') {
        if (!input.costDelta && !input.accumulatedDelta && !input.depreciableDelta && !input.remainingMonths && !input.monthlyAmount) throw Errors.validation('Đánh giá lại phải có ít nhất một thay đổi');
        payload = { costDelta: input.costDelta ?? 0, depreciableDelta: input.depreciableDelta ?? input.costDelta ?? 0, accumulatedDelta: input.accumulatedDelta ?? 0, remainingMonths: input.remainingMonths ?? null, monthlyAmount: input.monthlyAmount ?? null };
      } else if (input.kind === 'transfer') {
        const to = input.toBranchCode ? await trx.selectFrom('branches').select(['id', 'code']).where('tenant_id', '=', auth.tenantId).where('code', '=', input.toBranchCode).executeTakeFirst() : null;
        if (!to) throw Errors.validation(`Chi nhánh nhận ${input.toBranchCode ?? ''} không có trong danh mục`);
        if (to.id === a.branch_id) throw Errors.validation('Chi nhánh nhận trùng chi nhánh đang dùng');
        const later = await trx.selectFrom('asset_events').select('id').where('asset_id', '=', a.id).where('kind', '=', 'transfer').where('event_date', '>', input.date).executeTakeFirst();
        if (later) throw Errors.validation('Đã có lần điều chuyển sau ngày này');
        const from = await trx.selectFrom('branches').select('code').where('id', '=', a.branch_id).executeTakeFirstOrThrow();
        payload = { fromBranchId: a.branch_id, fromBranchCode: from.code, toBranchId: to.id, toBranchCode: to.code };
        await trx.updateTable('assets').set({ branch_id: to.id, updated_at: new Date() }).where('id', '=', a.id).execute();
      } else {
        if (!input.result || !AUDIT_RESULT[input.result]) throw Errors.validation('Kiểm kê phải có kết quả');
        payload = { result: input.result, actualQuantity: input.actualQuantity ?? null, bookQuantity: toNumber(a.quantity) };
      }
      const r = await trx.insertInto('asset_events').values({ tenant_id: auth.tenantId, asset_id: a.id, kind: input.kind, event_date: input.date, doc_no: input.docNo ?? '', payload: JSON.stringify(payload), note: input.note ?? '', created_by: auth.actor }).returning('id').executeTakeFirstOrThrow();
      await writeAudit(trx, { tenantId: auth.tenantId, actor: auth.actor, action: `asset.${input.kind}`, objectType: 'asset', objectId: code, after: { ...input, payload } });
      return { id: r.id };
    });
  },

  async removeEvent(auth: AuthContext, id: string) {
    return db.transaction().execute(async (trx) => {
      const e = await trx.selectFrom('asset_events').selectAll().where('tenant_id', '=', auth.tenantId).where('id', '=', id).executeTakeFirst();
      if (!e) throw Errors.notFound('sự kiện tài sản');
      if (e.kind === 'transfer') {
        const later = await trx.selectFrom('asset_events').select('id').where('asset_id', '=', e.asset_id).where('kind', '=', 'transfer').where('event_date', '>=', String(e.event_date)).where('id', '<>', e.id).executeTakeFirst();
        if (later) throw Errors.validation('Chỉ xoá được lần điều chuyển gần nhất');
        for (const p of (e.payload.postings ?? []) as { docKey: string; docNo: string }[]) {
          const d = await trx.selectFrom('accounting_events').select('status').where('tenant_id', '=', auth.tenantId).where('doc_key', '=', p.docKey).executeTakeFirst();
          if (d?.status === 'posted') throw Errors.conflict(`Lần điều chuyển đã hạch toán ở phiếu ${p.docNo}: huỷ phiếu trước rồi mới xoá`);
        }
        await trx.updateTable('assets').set({ branch_id: String(e.payload.fromBranchId), updated_at: new Date() }).where('id', '=', e.asset_id).execute();
      }
      await trx.deleteFrom('asset_events').where('id', '=', e.id).execute();
      await writeAudit(trx, { tenantId: auth.tenantId, actor: auth.actor, action: 'asset.event.delete', objectType: 'asset_event', objectId: id, before: e });
      return { id };
    });
  },

  /** Sửa tay số trích một tháng (amount null = bỏ số sửa tay, dùng lại số máy tính). Tính lại tháng để áp dụng. */
  async setOverride(auth: AuthContext, code: string, q: { period: string; amount: number | null; reason?: string }) {
    const p = parsePeriod(q.period);
    return db.transaction().execute(async (trx) => {
      const a = await trx.selectFrom('assets').select('id').where('tenant_id', '=', auth.tenantId).where('code', '=', code).executeTakeFirst();
      if (!a) throw Errors.notFound(`tài sản ${code}`);
      await trx.deleteFrom('asset_depreciation_overrides').where('asset_id', '=', a.id).where('year', '=', p.year).where('month', '=', p.month).execute();
      if (q.amount !== null) {
        if (!q.reason?.trim()) throw Errors.validation('Sửa tay số trích phải ghi lý do');
        await trx.insertInto('asset_depreciation_overrides').values({ asset_id: a.id, year: p.year, month: p.month, amount: q.amount, reason: q.reason.trim(), updated_by: auth.actor }).execute();
      }
      await writeAudit(trx, { tenantId: auth.tenantId, actor: auth.actor, action: 'asset.override', objectType: 'asset', objectId: code, after: q });
      return { code, period: q.period, amount: q.amount };
    });
  },

  /* ---------------- Tính khấu hao, phân bổ ---------------- */
  async run(auth: AuthContext, q: { period: string; catchUp?: boolean }) {
    const p = parsePeriod(q.period);
    const result = await db.transaction().execute((trx) => runPeriod(trx, auth, p, Boolean(q.catchUp)));
    return { period: periodLabel(p), ...result };
  },

  /** Sổ tài sản / bảng tính khấu hao, phân bổ trong khoảng ngày (theo tháng). */
  async register(auth: AuthContext, q: { from: string; to: string; kind?: AssetKind; branchCodes?: string[] }) {
    const fromIdx = q.from.slice(0, 7);
    const toIdx = q.to.slice(0, 7);
    const res = await sql<{
      code: string; name: string; kind: string; category_name: string | null; branch_code: string; unit: string; quantity: string; start_date: string; useful_life_months: number;
      original_cost: string; opening_accumulated: string; asset_account: string | null; depreciation_account: string; expense_account: string; status: string; disposed_date: string | null; acquired_date: string | null;
      before: string; within: string; overrides: string; cost_adj_before: string; cost_adj_within: string; acc_adj_before: string; acc_adj_within: string;
    }>`
      SELECT a.code, a.name, a.kind, c.name AS category_name, b.code AS branch_code, a.unit, a.quantity, a.start_date::text, a.useful_life_months,
             a.original_cost, a.opening_accumulated, a.asset_account, a.depreciation_account, a.expense_account, a.status, a.disposed_date::text, a.acquired_date::text,
             COALESCE((SELECT SUM(d.amount) FROM asset_depreciations d WHERE d.asset_id = a.id AND to_char(make_date(d.year, d.month, 1), 'YYYY-MM') < ${fromIdx}), 0) AS before,
             COALESCE((SELECT SUM(d.amount) FROM asset_depreciations d WHERE d.asset_id = a.id AND to_char(make_date(d.year, d.month, 1), 'YYYY-MM') BETWEEN ${fromIdx} AND ${toIdx}), 0) AS within,
             (SELECT COUNT(*) FROM asset_depreciation_overrides o WHERE o.asset_id = a.id AND to_char(make_date(o.year, o.month, 1), 'YYYY-MM') BETWEEN ${fromIdx} AND ${toIdx}) AS overrides,
             COALESCE((SELECT SUM((e.payload->>'costDelta')::numeric) FROM asset_events e WHERE e.asset_id = a.id AND e.kind = 'revaluation' AND e.event_date < ${q.from}::date), 0) AS cost_adj_before,
             COALESCE((SELECT SUM((e.payload->>'costDelta')::numeric) FROM asset_events e WHERE e.asset_id = a.id AND e.kind = 'revaluation' AND e.event_date BETWEEN ${q.from}::date AND ${q.to}::date), 0) AS cost_adj_within,
             COALESCE((SELECT SUM((e.payload->>'accumulatedDelta')::numeric) FROM asset_events e WHERE e.asset_id = a.id AND e.kind = 'revaluation' AND e.event_date < ${q.from}::date), 0) AS acc_adj_before,
             COALESCE((SELECT SUM((e.payload->>'accumulatedDelta')::numeric) FROM asset_events e WHERE e.asset_id = a.id AND e.kind = 'revaluation' AND e.event_date BETWEEN ${q.from}::date AND ${q.to}::date), 0) AS acc_adj_within
        FROM assets a
        JOIN branches b ON b.id = a.branch_id
        LEFT JOIN asset_categories c ON c.id = a.category_id
       WHERE a.tenant_id = ${auth.tenantId}
         AND a.start_date <= ${q.to}::date
         ${q.kind ? sql`AND a.kind = ${q.kind}` : sql``}
         ${q.branchCodes?.length ? sql`AND b.code = ANY(${q.branchCodes})` : sql``}
       ORDER BY a.kind, a.code`.execute(db);
    const t = { originalCost: 0, opening: 0, charge: 0, adjust: 0, closing: 0, remaining: 0 };
    const rows = res.rows
      .filter((r) => !(r.disposed_date && r.disposed_date < q.from && toNumber(r.within) === 0))
      .map((r) => {
        const cost = cents(r.original_cost) + cents(r.cost_adj_before) + cents(r.cost_adj_within);
        const opening = cents(r.opening_accumulated) + cents(r.before) + cents(r.acc_adj_before);
        const charge = cents(r.within);
        const adjust = cents(r.acc_adj_within);
        const closing = opening + charge + adjust;
        t.originalCost += cost; t.opening += opening; t.charge += charge; t.adjust += adjust; t.closing += closing; t.remaining += cost - closing;
        return {
          code: r.code, name: r.name, kind: r.kind, kindLabel: KIND_LABEL[r.kind as AssetKind], categoryName: r.category_name ?? '', branchCode: r.branch_code,
          unit: r.unit, quantity: toNumber(r.quantity), acquiredDate: r.acquired_date, startDate: r.start_date, usefulLifeMonths: r.useful_life_months,
          assetAccount: r.asset_account ?? '', depreciationAccount: r.depreciation_account, expenseAccount: r.expense_account,
          status: r.status, disposedDate: r.disposed_date, overridden: Number(r.overrides) > 0,
          increased: r.start_date >= q.from,
          decreased: Boolean(r.disposed_date && r.disposed_date >= q.from && r.disposed_date <= q.to),
          originalCost: fromCents(cost), costAdjust: fromCents(cents(r.cost_adj_within)), opening: fromCents(opening), charge: fromCents(charge), adjust: fromCents(adjust), closing: fromCents(closing), remaining: fromCents(cost - closing),
        };
      });
    return { rows, totals: { originalCost: fromCents(t.originalCost), opening: fromCents(t.opening), charge: fromCents(t.charge), adjust: fromCents(t.adjust), closing: fromCents(t.closing), remaining: fromCents(t.remaining) } };
  },

  /**
   * Phần chờ phân bổ còn lại của các thẻ công cụ / chi phí trả trước tại hết ngày `asOf`,
   * tách phần sẽ phân bổ trong 12 tháng tới (ngắn hạn) và phần sau đó (dài hạn), theo tài khoản 242x.
   */
  async prepaidSplit(trx: Db, tenantId: string, asOf: string) {
    const res = await sql<CalcRow & { depreciation_account: string; posted: string }>`
      SELECT a.depreciation_account, a.start_date::text, a.original_cost, a.depreciable_amount, a.useful_life_months, a.monthly_amount, a.opening_accumulated,
             a.opening_as_of::text, a.opening_remaining_months, a.status, a.disposed_date::text,
             COALESCE(SUM(d.amount) FILTER (WHERE make_date(d.year, d.month, 1) <= ${asOf}::date), 0) AS posted
        FROM assets a
        LEFT JOIN asset_depreciations d ON d.asset_id = a.id
       WHERE a.tenant_id = ${tenantId} AND a.kind <> 'fixed_asset' AND a.start_date <= ${asOf}::date
       GROUP BY a.id`.execute(trx);
    const p: Period = periodOf(asOf);
    const byAccount = new Map<string, { short: number; long: number }>();
    for (const r of res.rows) {
      const calc = calcOf(r);
      const posted = cents(r.posted);
      const remaining = (calc.depreciableAmount ?? calc.originalCost) - calc.openingAccumulated - posted;
      if (remaining <= 0 || (calc.disposedDate && calc.disposedDate <= asOf)) continue;
      const next12 = scheduleAfter(calc, p, posted, 12).reduce((s, x) => s + x, 0);
      const cur = byAccount.get(r.depreciation_account) ?? { short: 0, long: 0 };
      cur.short += Math.min(next12, remaining);
      cur.long += Math.max(remaining - next12, 0);
      byAccount.set(r.depreciation_account, cur);
    }
    return byAccount;
  },
};

/* ------------------------------------------------------------------ tính một tháng cho một bộ sổ */

interface PostLine { branchId: string; expense: string; credit: string; costItem: string | null; department: string | null; contract: string | null; cents: number; kind: string; catchUp?: boolean }

async function runPeriod(trx: Db, auth: AuthContext, p: Period, catchUp = false) {
  const idx = monthIndex(p);
  const assets = await sql<CalcRow & {
    id: string; code: string; name: string; kind: string; branch_id: string; depreciation_account: string; expense_account: string;
    cost_item_code: string | null; department_code: string | null; contract_code: string | null;
  }>`
    SELECT a.id, a.code, a.name, a.kind, a.branch_id, a.start_date::text, a.original_cost, a.depreciable_amount, a.useful_life_months, a.monthly_amount,
           a.opening_accumulated, a.opening_as_of::text, a.opening_remaining_months, a.status, a.disposed_date::text, a.depreciation_account, a.expense_account,
           a.cost_item_code, a.department_code, a.contract_code
      FROM assets a
     WHERE a.tenant_id = ${auth.tenantId} AND a.start_date <= ${lastDayOf(p)}::date
     ORDER BY a.code`.execute(trx);
  const ids = assets.rows.map((a) => a.id);
  const [posted, events, allocations, overrides, branchRows] = ids.length
    ? await Promise.all([
        trx.selectFrom('asset_depreciations').select(['asset_id', 'year', 'month', 'amount', 'covers_from']).where('asset_id', 'in', ids).execute(),
        trx.selectFrom('asset_events').select(['asset_id', 'kind', 'event_date', 'payload']).where('asset_id', 'in', ids).where('kind', 'in', ['revaluation', 'transfer']).orderBy('event_date').orderBy('id').execute(),
        trx.selectFrom('asset_allocations').selectAll().where('asset_id', 'in', ids).orderBy('line_no').execute(),
        trx.selectFrom('asset_depreciation_overrides').select(['asset_id', 'amount']).where('year', '=', p.year).where('month', '=', p.month).where('asset_id', 'in', ids).execute(),
        trx.selectFrom('branches').select(['id', 'code']).where('tenant_id', '=', auth.tenantId).execute(),
      ])
    : [[], [], [], [], await trx.selectFrom('branches').select(['id', 'code']).where('tenant_id', '=', auth.tenantId).execute()];
  const branchCode = new Map(branchRows.map((b) => [b.id, b.code]));
  const postedBy = new Map<string, Map<number, number>>();
  for (const r of posted) {
    const m = postedBy.get(r.asset_id) ?? new Map<number, number>();
    m.set(r.year * 12 + r.month - 1, cents(r.amount));
    postedBy.set(r.asset_id, m);
  }
  const overrideBy = new Map(overrides.map((o) => [o.asset_id, cents(o.amount)]));
  // Tháng đã được dòng "trích bổ sung" của một tháng sau bao gồm (trừ tháng đang tính: sẽ tính lại).
  const coveredBy = new Map<string, Set<number>>();
  for (const r of posted) {
    const at = r.year * 12 + r.month - 1;
    if (r.covers_from === null || at === idx) continue;
    const s = coveredBy.get(r.asset_id) ?? new Set<number>();
    for (let i = r.covers_from; i < at; i++) s.add(i);
    coveredBy.set(r.asset_id, s);
  }

  const missing: { assetCode: string; firstMissing: string; months: number }[] = [];
  const items: { a: (typeof assets.rows)[number]; cents: number; overridden: boolean; catchUp: number; coversFrom: number | null }[] = [];
  const lines: PostLine[] = [];
  for (const a of assets.rows) {
    const months = postedBy.get(a.id) ?? new Map<number, number>();
    const sumBefore = (i: number) => [...months.entries()].filter(([k]) => k < i).reduce((s, [, v]) => s + v, 0);
    const evs = events.filter((e) => e.asset_id === a.id);
    const calc = calcOf(a, buildRevaluations(a, evs, sumBefore));
    const taxMonthly: number | null = null;
    // Tháng thiếu: chưa có dòng trích, chưa được dồn ở tháng sau, và theo công thức lẽ ra có số trích.
    const covered = coveredBy.get(a.id) ?? new Set<number>();
    const gaps: number[] = [];
    let pending = 0;
    for (let i = monthIndex(firstChargePeriod(calc)); i < idx; i++) {
      if (months.has(i) || covered.has(i)) continue;
      const c = chargeFor(calc, fromIndex(i), sumBefore(i) + pending, taxMonthly);
      if (c > 0) { gaps.push(i); pending += c; }
    }
    const caught = catchUp ? pending : 0;
    if (!catchUp && gaps.length) missing.push({ assetCode: a.code, firstMissing: periodLabel(fromIndex(gaps[0]!)), months: gaps.length });
    const computed = chargeFor(calc, p, sumBefore(idx) + caught, taxMonthly) + caught;
    const ov = overrideBy.get(a.id);
    const value = ov ?? computed;
    items.push({ a, cents: value, overridden: ov !== undefined, catchUp: ov !== undefined ? 0 : caught, coversFrom: ov === undefined && caught > 0 ? gaps[0]! : null });
    if (value <= 0) continue;

    // Điều chuyển trong tháng: chia theo số ngày dùng ở mỗi chi nhánh.
    const transfers = evs.filter((e) => e.kind === 'transfer');
    const segments = transfers.length
      ? [{ from: '0001-01-01', branchId: String(transfers[0]!.payload.fromBranchId) }, ...transfers.map((t) => ({ from: String(t.event_date), branchId: String(t.payload.toBranchId) }))]
      : [{ from: '0001-01-01', branchId: a.branch_id }];
    const pStart = firstDayOf(p);
    const usedFrom = a.start_date > pStart ? a.start_date : pStart;
    const usedTo = a.disposed_date && a.disposed_date <= lastDayOf(p) ? addDays(a.disposed_date, -1) : lastDayOf(p);
    const rules = allocations.filter((l) => l.asset_id === a.id);
    for (const [segBranch, segCents] of splitByDays(value, p, usedFrom, usedTo, segments)) {
      if (!segCents) continue;
      const lineRules = rules.length
        ? rules.map((l) => ({ percent: toNumber(l.percent), branchId: l.branch_id ?? segBranch, expense: l.expense_account, costItem: l.cost_item_code, department: l.department_code, contract: l.contract_code }))
        : [{ percent: 100, branchId: segBranch, expense: a.expense_account, costItem: a.cost_item_code, department: a.department_code, contract: a.contract_code }];
      const parts = splitByPercent(segCents, lineRules.map((l) => l.percent));
      const caughtShare = ov === undefined && caught && value ? caught / value : 0;
      lineRules.forEach((l, i) => {
        if (!parts[i]) return;
        // Phần dồn của các tháng trước tách dòng riêng để diễn giải rõ ("trích bổ sung").
        const share = Math.round((parts[i]! * caughtShare) / 100) * 100;
        const current = parts[i]! - share;
        if (current) lines.push({ branchId: l.branchId, expense: l.expense, credit: a.depreciation_account, costItem: l.costItem, department: l.department, contract: l.contract, cents: current, kind: a.kind });
        if (share) lines.push({ branchId: l.branchId, expense: l.expense, credit: a.depreciation_account, costItem: l.costItem, department: l.department, contract: l.contract, cents: share, kind: a.kind, catchUp: true });
      });
    }
  }

  // Tính lại tháng: xoá số trích cũ của tháng, ghi lại.
  await trx.deleteFrom('asset_depreciations').where('tenant_id', '=', auth.tenantId).where('year', '=', p.year).where('month', '=', p.month).execute();
  const toInsert = items.filter((i) => i.cents > 0 || i.overridden);
  if (toInsert.length) {
    await trx.insertInto('asset_depreciations').values(toInsert.map((i) => ({ tenant_id: auth.tenantId, asset_id: i.a.id, year: p.year, month: p.month, amount: fromCents(i.cents), covers_from: i.coversFrom, event_id: null }))).execute();
  }

  const accounts = await accountRepository.mapByCode(trx, auth.tenantId);
  const byBranch = new Map<string, PostLine[]>();
  for (const l of lines) byBranch.set(l.branchId, [...(byBranch.get(l.branchId) ?? []), l]);
  // Chi nhánh từng có chứng từ khấu hao tháng này nhưng nay không còn số trích: vẫn phải đảo bút toán cũ.
  const prior = await trx.selectFrom('accounting_events').select('branch_id')
    .where('tenant_id', '=', auth.tenantId).where('doc_type', '=', 'depreciation').where('doc_key', 'like', `depreciation:%:${periodLabel(p)}`).execute();
  for (const r of prior) if (!byBranch.has(r.branch_id)) byBranch.set(r.branch_id, []);

  const branches = [];
  for (const [branchId, ls] of byBranch) {
    branches.push(await postBranch(trx, auth, { p, branchId, branchCode: branchCode.get(branchId) ?? branchId, lines: ls, accounts }));
  }
  branches.sort((a, b) => a.branchCode.localeCompare(b.branchCode));
  const out = items.filter((c) => c.cents > 0 || c.overridden).map((c) => ({ code: c.a.code, name: c.a.name, kind: c.a.kind, branchCode: branchCode.get(c.a.branch_id) ?? '', amount: fromCents(c.cents), catchUp: fromCents(c.catchUp), overridden: c.overridden, expenseAccount: c.a.expense_account, creditAccount: c.a.depreciation_account }));
  return { items: out, branches, missing, catchUpTotal: fromCents(items.reduce((s, c) => s + c.catchUp, 0)), catchUpAssets: items.filter((c) => c.coversFrom !== null).length, total: fromCents(items.reduce((s, c) => s + c.cents, 0)) };
}

async function postBranch(
  trx: Db,
  auth: AuthContext,
  a: { p: Period; branchId: string; branchCode: string; lines: PostLine[]; accounts: Awaited<ReturnType<typeof accountRepository.mapByCode>> },
) {
  const label = periodLabel(a.p);
  const docKey = `depreciation:${a.branchCode}:${label}`;
  const existing = await documentRepository.findByKeyForUpdate(trx, auth.tenantId, docKey);
  let reversed = 0;
  if (existing) {
    for (const e of await ledgerRepository.findActiveEntriesBySource(trx, auth.tenantId, existing.id)) {
      await ledgerService.reverse(trx, auth.tenantId, auth.actor, e.id, a.accounts, 'Tính lại khấu hao, phân bổ');
      reversed += 1;
    }
  }

  // Gộp theo (TK chi phí, TK ghi Có, khoản mục, bộ phận, hợp đồng).
  const groups = new Map<string, { expense: string; credit: string; costItem: string | null; department: string | null; contract: string | null; cents: number; kinds: Set<string>; catchUp: boolean }>();
  for (const l of a.lines) {
    const k = [l.expense, l.credit, l.costItem ?? '', l.department ?? '', l.contract ?? '', l.catchUp ? 'bs' : ''].join('|');
    const g = groups.get(k) ?? { expense: l.expense, credit: l.credit, costItem: l.costItem, department: l.department, contract: l.contract, cents: 0, kinds: new Set<string>(), catchUp: Boolean(l.catchUp) };
    g.cents += l.cents;
    g.kinds.add(l.kind);
    groups.set(k, g);
  }
  const mm = `${String(a.p.month).padStart(2, '0')}/${a.p.year}`;
  const draft: DraftLine[] = [];
  let pairNo = 0;
  for (const g of groups.values()) {
    if (g.cents <= 0) continue;
    pairNo += 1;
    const amount = fromCents(g.cents);
    const what = g.kinds.has('fixed_asset') && g.kinds.size === 1 ? 'Khấu hao TSCĐ' : g.kinds.has('fixed_asset') ? 'Khấu hao, phân bổ' : 'Phân bổ chi phí';
    const description = g.catchUp ? `${what} trích bổ sung các tháng trước chưa trích (ghi vào tháng ${mm})` : `${what} tháng ${mm}`;
    const dims: Record<string, string> = {};
    if (g.costItem) dims.costItem = g.costItem;
    if (g.department) dims.department = g.department;
    if (g.contract) dims.contract = g.contract;
    draft.push({ accountCode: g.expense, debit: amount, credit: 0, pairNo, part: 'other', description, dims });
    draft.push({ accountCode: g.credit, debit: 0, credit: amount, pairNo, part: 'other', description });
  }

  if (!draft.length) {
    if (existing) {
      await documentRepository.update(trx, existing.id, { status: 'cancelled', error_message: 'Tính lại: tháng này không còn số trích' });
      await logPosting(trx, { tenantId: auth.tenantId, eventId: existing.id, docType: 'depreciation', docNo: existing.doc_no, version: existing.version, action: 'cancel', reversed, message: 'Tính lại: tháng này không còn số trích', actor: auth.actor });
    }
    return { branchCode: a.branchCode, status: 'empty' as const, total: 0 };
  }
  const total = fromCents(draft.reduce((s, l) => s + toCents(l.debit), 0));
  const docNo = `KH ${mm} ${a.branchCode}`;
  const docDate = lastDayOf(a.p);
  const version = (existing?.version ?? 0) + 1;
  const description = `Khấu hao TSCĐ, phân bổ CCDC và chi phí trả trước tháng ${mm}`;
  const fields = { version, branch_id: a.branchId, doc_date: docDate, total, payload: JSON.stringify({ period: label, branchCode: a.branchCode, description, method: 'duong-thang' }) };
  let docId: string;
  if (existing) {
    docId = existing.id;
    await documentRepository.archiveVersion(trx, existing.id, existing.version, existing.payload, existing.received_at);
    await documentRepository.update(trx, existing.id, { ...fields, received_at: new Date() });
  } else {
    docId = (await documentRepository.insert(trx, { tenant_id: auth.tenantId, source_system: 'manual', doc_key: docKey, doc_type: 'depreciation', doc_no: docNo, partner_id: null, invoice_no: null, ...fields })).id;
  }
  const entry = await ledgerService.post(trx, auth.tenantId, auth.actor, { branchId: a.branchId, docType: 'depreciation', docNo, docDate, postingDate: docDate, description, sourceDocumentId: docId, sourceVersion: version, lines: draft }, a.accounts);
  await documentRepository.update(trx, docId, { status: 'posted', posted_at: new Date(), posted_version: version, error_message: null });
  await logPosting(trx, { tenantId: auth.tenantId, eventId: docId, docType: 'depreciation', docNo, version, action: existing ? 'repost' : 'post', entryIds: [entry.id], reversed, total, actor: auth.actor });
  await writeAudit(trx, { tenantId: auth.tenantId, actor: auth.actor, action: 'depreciation.run', objectType: 'source_document', objectId: docKey, after: { version, total } });
  return { branchCode: a.branchCode, status: 'posted' as const, docNo, total };
}
