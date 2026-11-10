// @bizcity-layer M data/masterdata
// [2026-11-10 09:00 PM Nguyễn Văn Thủy] PHASE-026 — thiết kế hạch toán: lý do theo màn, sơ đồ dây chuyền định khoản (đóng góp)
/**
 * THIẾT KẾ HẠCH TOÁN (ACC90).
 *
 * 1. Lý do theo màn (screen_reasons, 0095): mỗi màn nghiệp vụ chỉ dùng vài lý do. Màn chưa gán thì lọc theo loại lý do như cũ.
 * 2. Sơ đồ dây chuyền của một lý do ở một màn: các bút toán màn đó sinh ra, mỗi bên Nợ / Có có CHUỖI NGUỒN theo đúng thứ tự
 *    bộ tra tài khoản của lõi (packages/kernel/src/modules/posting/account-resolver.ts và rules/*):
 *      lý do → nhóm hạch toán của mặt hàng → tài khoản ngầm định; thuế: loại thuế → ngầm định; tiền: hình thức thanh toán.
 *    Nguồn đầu tiên có giá trị là nguồn được dùng; các nguồn sau hiện mờ (nét đứt) để người xem biết "bỏ trống ở đây thì
 *    lấy ở đâu". Tính trên một chứng từ mẫu để thấy Nợ = Có.
 *    Đây là bản ĐỌC cấu hình: sửa tài khoản đi qua API cấu hình có sẵn (/api/v1/posting/*), lõi định khoản không đổi.
 *    Test posting-flow.test.ts đối chiếu sơ đồ với định khoản thật để hai bên không lệch nhau.
 */
import { sql } from 'kysely';
import type { Db } from '../../db/client.js';
import { Errors } from '../../core/errors.js';
import { writeAudit } from '../../core/audit.js';

export interface ScreenDef {
  key: string;
  label: string;
  /** Nhóm hiện ở cột trái. */
  area: 'Bán hàng' | 'Mua hàng' | 'Kho' | 'Tiền';
  /** Loại lý do được chọn cho màn (posting_reasons.kind). */
  kinds: string[];
  /** Cờ default của lý do mặc định (khi màn chưa gán lý do). */
  defaultFlag: string;
  note: string;
}

export const SCREENS: ScreenDef[] = [
  { key: 'sale', label: 'Bán hàng', area: 'Bán hàng', kinds: ['out'], defaultFlag: 'sale', note: 'Hoá đơn bán, phiếu bán ở quầy' },
  { key: 'sale_return', label: 'Khách trả hàng', area: 'Bán hàng', kinds: ['in'], defaultFlag: 'sale_return', note: 'Hàng bán bị trả lại' },
  { key: 'purchase', label: 'Nhập mua hàng', area: 'Mua hàng', kinds: ['in'], defaultFlag: 'purchase', note: 'Phiếu nhập mua từ nhà cung cấp' },
  { key: 'purchase_return', label: 'Trả hàng nhà cung cấp', area: 'Mua hàng', kinds: ['out'], defaultFlag: 'purchase_return', note: 'Xuất trả hàng mua' },
  { key: 'transfer', label: 'Chuyển kho', area: 'Kho', kinds: ['out'], defaultFlag: 'transfer', note: 'Chuyển hàng giữa chi nhánh, kho' },
  { key: 'stock_increase', label: 'Nhập điều chỉnh kho', area: 'Kho', kinds: ['in'], defaultFlag: 'stock_adjustment:increase', note: 'Kiểm kê thừa, nhập khác' },
  { key: 'stock_decrease', label: 'Xuất điều chỉnh kho', area: 'Kho', kinds: ['out'], defaultFlag: 'stock_adjustment:decrease', note: 'Kiểm kê thiếu, xuất huỷ, xuất dùng' },
  { key: 'cash_receipt', label: 'Phiếu thu', area: 'Tiền', kinds: ['receipt'], defaultFlag: 'customer_payment', note: 'Thu tiền khách, thu khác' },
  { key: 'cash_payment', label: 'Phiếu chi', area: 'Tiền', kinds: ['payment'], defaultFlag: 'supplier_payment', note: 'Trả tiền nhà cung cấp, chi khác' },
];
export const screenOf = (key: string) => {
  const s = SCREENS.find((x) => x.key === key);
  if (!s) throw Errors.validation(`Màn ${key} không có`);
  return s;
};

type ReasonRow = { code: string; name: string; kind: string; counter_account: string | null; revenue_account: string | null; expense_account: string | null; flags: Record<string, unknown> | null; is_active: boolean };

// ------------------------------------------------------------------------------------------------ lý do theo màn

export async function listScreens(trx: Db, tenantId: string) {
  const rows = (await sql<{ screen_key: string; reason_code: string; sort_order: number; is_default: boolean; name: string | null; kind: string | null; is_active: boolean | null }>`
    SELECT s.screen_key, s.reason_code, s.sort_order, s.is_default, r.name, r.kind, r.is_active
      FROM screen_reasons s LEFT JOIN posting_reasons r ON r.tenant_id = s.tenant_id AND r.code = s.reason_code
     WHERE s.tenant_id = ${tenantId} ORDER BY s.screen_key, s.sort_order, s.reason_code`.execute(trx)).rows;
  return SCREENS.map((s) => ({
    ...s,
    reasons: rows.filter((r) => r.screen_key === s.key).map((r) => ({ code: r.reason_code, name: r.name ?? '(lý do đã xoá)', kind: r.kind, isActive: r.is_active ?? false, isDefault: r.is_default, missing: r.name === null })),
  }));
}

/** Lý do dùng được ở một màn: đã gán thì chỉ các lý do đó; chưa gán thì mọi lý do đang dùng có loại hợp với màn. */
export async function screenReasons(trx: Db, tenantId: string, key: string) {
  const s = screenOf(key);
  const assigned = (await sql<ReasonRow & { is_default: boolean }>`
    SELECT r.code, r.name, r.kind, r.counter_account, r.revenue_account, r.expense_account, r.flags, r.is_active, s.is_default
      FROM screen_reasons s JOIN posting_reasons r ON r.tenant_id = s.tenant_id AND r.code = s.reason_code
     WHERE s.tenant_id = ${tenantId} AND s.screen_key = ${key} AND r.is_active ORDER BY s.sort_order, r.code`.execute(trx)).rows;
  if (assigned.length) return { screen: s.key, assigned: true, reasons: assigned.map((r) => ({ code: r.code, name: r.name, kind: r.kind, isDefault: r.is_default })) };
  const all = (await sql<ReasonRow>`SELECT code, name, kind, flags FROM posting_reasons WHERE tenant_id = ${tenantId} AND is_active AND kind = ANY(${s.kinds}) ORDER BY code`.execute(trx)).rows;
  return { screen: s.key, assigned: false, reasons: all.map((r) => ({ code: r.code, name: r.name, kind: r.kind, isDefault: r.flags?.default === s.defaultFlag })) };
}

/** Thay cả danh sách lý do của một màn (thứ tự theo mảng; tối đa một lý do chọn sẵn). */
export async function setScreenReasons(trx: Db, tenantId: string, actor: string, key: string, list: { code: string; isDefault?: boolean }[]) {
  const s = screenOf(key);
  const codes = list.map((x) => x.code.trim()).filter(Boolean);
  if (new Set(codes).size !== codes.length) throw Errors.validation('Một lý do chỉ gán một lần cho một màn');
  if (list.filter((x) => x.isDefault).length > 1) throw Errors.validation('Mỗi màn chỉ một lý do chọn sẵn');
  if (codes.length) {
    const found = (await sql<{ code: string; kind: string; is_active: boolean }>`SELECT code, kind, is_active FROM posting_reasons WHERE tenant_id = ${tenantId} AND code = ANY(${codes})`.execute(trx)).rows;
    const missing = codes.filter((c) => !found.some((f) => f.code === c));
    if (missing.length) throw Errors.validation(`Lý do chưa có: ${missing.join(', ')}`);
    const wrong = found.filter((f) => !s.kinds.includes(f.kind));
    if (wrong.length) throw Errors.validation(`Lý do ${wrong.map((w) => w.code).join(', ')} không hợp màn ${s.label} (màn này dùng lý do loại ${s.kinds.join(', ')})`);
  }
  await sql`DELETE FROM screen_reasons WHERE tenant_id = ${tenantId} AND screen_key = ${key} AND NOT (reason_code = ANY(${codes}))`.execute(trx);
  for (const [i, x] of list.entries()) {
    await sql`INSERT INTO screen_reasons (tenant_id, screen_key, reason_code, sort_order, is_default, created_by)
              VALUES (${tenantId}, ${key}, ${x.code.trim()}, ${i}, false, ${actor})
              ON CONFLICT (tenant_id, screen_key, reason_code) DO UPDATE SET sort_order = EXCLUDED.sort_order, is_default = false, updated_at = now()`.execute(trx);
  }
  const def = list.find((x) => x.isDefault);
  if (def) await sql`UPDATE screen_reasons SET is_default = true WHERE tenant_id = ${tenantId} AND screen_key = ${key} AND reason_code = ${def.code.trim()}`.execute(trx);
  return listScreens(trx, tenantId).then((all) => all.find((x) => x.key === key)!);
}

// ------------------------------------------------------------------------------------------------ sơ đồ dây chuyền

export type SourceKind = 'reason' | 'payReason' | 'group' | 'defaults' | 'tax' | 'payment';
export interface SourceField { key: string; label: string; value: string | null; name?: string | null }
export interface FlowSource { id: SourceKind; label: string; code: string | null; title: string; fields: SourceField[]; edit: string }
export interface ChainStep { source: SourceKind; field: string; label: string; value: string | null }
export interface FlowSide { account: string | null; accountName: string | null; from: ChainStep | null; chain: ChainStep[] }
export interface FlowEntry { key: string; label: string; note?: string; amount: number; debit: FlowSide; credit: FlowSide }

const DEFAULT_LABEL: Record<string, string> = {
  receivable: 'Phải thu khách hàng', payable: 'Phải trả nhà cung cấp', tax_output: 'Thuế GTGT đầu ra', tax_input: 'Thuế GTGT đầu vào',
  cash: 'Tiền mặt', promotion_expense: 'Chi phí hàng khuyến mãi', goods_in_transit: 'Hàng đang chuyển', stock_surplus: 'Hàng thừa chờ xử lý',
  stock_shortage: 'Hàng thiếu chờ xử lý', internal_receivable_goods: 'Phải thu nội bộ hàng',
};

export interface FlowInput { screen: string; reason?: string; group?: string; taxCode?: string; method?: string; amount?: number; cost?: number; gift?: boolean }

export async function buildFlow(trx: Db, tenantId: string, q: FlowInput) {
  const s = screenOf(q.screen);
  const reasons = (await sql<ReasonRow>`SELECT code, name, kind, counter_account, revenue_account, expense_account, flags, is_active FROM posting_reasons WHERE tenant_id = ${tenantId}`.execute(trx)).rows;
  const reason = q.reason ? reasons.find((r) => r.code === q.reason) : reasons.find((r) => r.flags?.default === s.defaultFlag);
  if (!reason) throw Errors.validation(q.reason ? `Lý do ${q.reason} chưa có` : `Màn ${s.label} chưa có lý do mặc định — gán một lý do cho màn`);

  const groups = (await sql<{ code: string; name: string; inventory_account: string; cogs_account: string; revenue_account: string; sales_return_account: string; is_default: boolean }>`
    SELECT code, name, inventory_account, cogs_account, revenue_account, sales_return_account, is_default FROM product_posting_groups WHERE tenant_id = ${tenantId} ORDER BY code`.execute(trx)).rows;
  const group = (q.group ? groups.find((g) => g.code === q.group) : groups.find((g) => g.is_default)) ?? groups[0];
  if (!group) throw Errors.validation('Chưa có nhóm hạch toán mặt hàng nào');
  const defaults = new Map((await sql<{ key: string; account_code: string }>`SELECT key, account_code FROM posting_defaults WHERE tenant_id = ${tenantId}`.execute(trx)).rows.map((d) => [d.key, d.account_code]));
  const taxes = (await sql<{ code: string; name: string; rate: string; direction: string; account_code: string | null }>`SELECT code, name, rate::text, direction, account_code FROM tax_codes WHERE tenant_id = ${tenantId} AND is_active ORDER BY code`.execute(trx)).rows;
  const wantDir = s.key === 'purchase' || s.key === 'purchase_return' ? 'input' : 'output';
  const tax = (q.taxCode ? taxes.find((t) => t.code === q.taxCode) : undefined)
    ?? taxes.find((t) => t.direction === wantDir && Number(t.rate) === 8) ?? taxes.find((t) => t.direction === wantDir) ?? null;
  const methods = (await sql<{ code: string; name: string; account_code: string; is_receivable: boolean }>`SELECT code, name, account_code, is_receivable FROM payment_methods WHERE tenant_id = ${tenantId} AND is_active ORDER BY sort_order NULLS LAST, code`.execute(trx)).rows;
  const method = (q.method ? methods.find((m) => m.code === q.method) : undefined) ?? methods.find((m) => !m.is_receivable) ?? null;
  const payReasonFlag = s.key === 'sale' ? 'receipt' : s.key === 'sale_return' ? 'sale_refund' : null;
  const payReason = payReasonFlag ? reasons.find((r) => r.flags?.default === payReasonFlag) ?? null : null;
  const flags = (reason.flags ?? {}) as Record<string, unknown>;

  const A = q.amount ?? 1_000_000;
  const rate = tax ? Number(tax.rate) : 0;
  const T = Math.round((A * rate) / 100);
  const COST = flags.costAtSalePrice ? A : q.cost ?? 700_000;

  // ---- nguồn (cột giữa sơ đồ)
  const reasonSrc: FlowSource = { id: 'reason', label: 'Lý do', code: reason.code, title: `${reason.code} — ${reason.name}`, edit: 'reason', fields: [
    { key: 'counterAccount', label: 'TK đối ứng', value: reason.counter_account },
    { key: 'revenueAccount', label: s.key === 'sale_return' ? 'TK doanh thu / trả lại (đè)' : 'TK doanh thu (đè)', value: reason.revenue_account },
    { key: 'expenseAccount', label: s.key.startsWith('purchase') ? 'TK chi phí (mua thẳng vào chi phí)' : 'TK giá vốn / chi phí (đè)', value: reason.expense_account },
  ] };
  const groupSrc: FlowSource = { id: 'group', label: 'Nhóm hạch toán mặt hàng', code: group.code, title: `${group.code} — ${group.name}`, edit: 'group', fields: [
    { key: 'inventoryAccount', label: 'TK kho', value: group.inventory_account },
    { key: 'cogsAccount', label: 'TK giá vốn', value: group.cogs_account },
    { key: 'revenueAccount', label: 'TK doanh thu', value: group.revenue_account },
    { key: 'salesReturnAccount', label: 'TK hàng bán trả lại', value: group.sales_return_account },
  ] };
  const usedDefaults = new Set<string>();
  const def = (k: string): ChainStep => { usedDefaults.add(k); return { source: 'defaults', field: k, label: DEFAULT_LABEL[k] ?? k, value: defaults.get(k) ?? null }; };
  const R = (field: 'counterAccount' | 'revenueAccount' | 'expenseAccount'): ChainStep => ({ source: 'reason', field, label: reasonSrc.fields.find((f) => f.key === field)!.label, value: reasonSrc.fields.find((f) => f.key === field)!.value });
  const G = (field: 'inventoryAccount' | 'cogsAccount' | 'revenueAccount' | 'salesReturnAccount'): ChainStep => ({ source: 'group', field, label: groupSrc.fields.find((f) => f.key === field)!.label, value: groupSrc.fields.find((f) => f.key === field)!.value });
  const TX: ChainStep = { source: 'tax', field: 'account', label: 'TK của loại thuế', value: tax?.account_code ?? null };
  const PM: ChainStep = { source: 'payment', field: 'account', label: 'TK tiền của hình thức', value: method?.account_code ?? null };
  const PR: ChainStep = { source: 'payReason', field: 'counterAccount', label: 'TK đối ứng của lý do thu / trả mặc định', value: payReason?.counter_account ?? null };

  const counter = [R('counterAccount'), def('receivable')];
  const payable = [R('counterAccount'), def('payable')];
  type RawEntry = { key: string; label: string; amount: number; debit: ChainStep[]; credit: ChainStep[]; note?: string };
  const raw: RawEntry[] = [];
  const push = (key: string, label: string, amount: number, debit: ChainStep[], credit: ChainStep[], note?: string) => { raw.push({ key, label, amount, debit, credit, note }); };
  const cogsChain = q.gift && flags.giftCostToPromotion ? [def('promotion_expense')] : [R('expenseAccount'), G('cogsAccount')];

  switch (s.key) {
    case 'sale':
      push('goods', 'Doanh thu bán hàng', A, counter, [R('revenueAccount'), G('revenueAccount')]);
      if (T) push('tax', 'Thuế GTGT đầu ra', T, counter, [TX, def('tax_output')]);
      push('cogs', flags.costAtSalePrice ? 'Giá vốn nội bộ (theo giá bán)' : 'Giá vốn hàng bán', COST, cogsChain, [G('inventoryAccount')], flags.costAtSalePrice ? 'Ghi ngay bằng tiền hàng' : 'Ghi khi tính giá vốn cuối tháng (phiếu giá vốn)');
      if (method) push('payment', 'Thu tiền bán hàng', A + T, [PM], [PR, ...counter], 'Bút toán riêng như phiếu thu, khi khách trả tiền ngay');
      break;
    case 'sale_return':
      push('goods', 'Hàng bán bị trả lại', A, [R('revenueAccount'), G('salesReturnAccount')], counter);
      if (T) push('tax', 'Giảm thuế GTGT đầu ra', T, [TX, def('tax_output')], counter);
      push('cogs', 'Nhập lại kho hàng trả', COST, [G('inventoryAccount')], cogsChain, 'Hoàn nhập theo giá vốn');
      if (method) push('payment', 'Trả tiền cho khách', A + T, [PR, ...counter], [PM], 'Khi trả tiền ngay cho khách');
      break;
    case 'purchase':
      push('goods', reason.expense_account ? 'Mua hàng, dịch vụ vào chi phí' : 'Nhập mua hàng', A, [R('expenseAccount'), G('inventoryAccount')], payable);
      if (T) push('tax', 'Thuế GTGT đầu vào', T, [TX, def('tax_input')], payable);
      if (method) push('payment', 'Trả tiền nhà cung cấp', A + T, payable, [PM], 'Bút toán riêng như phiếu chi, khi trả tiền ngay');
      break;
    case 'purchase_return':
      push('goods', 'Trả hàng nhà cung cấp', A, payable, [R('expenseAccount'), G('inventoryAccount')]);
      if (T) push('tax', 'Giảm thuế GTGT đầu vào', T, payable, [TX, def('tax_input')]);
      break;
    case 'transfer': {
      // TK kho không dùng làm TK trung gian (lõi bỏ qua TK đối ứng 15x trừ 157).
      const c = reason.counter_account && reason.counter_account.startsWith('15') && !reason.counter_account.startsWith('157') ? { ...R('counterAccount'), value: null } : R('counterAccount');
      push('out', 'Chi nhánh xuất', COST, [c, def('goods_in_transit')], [G('inventoryAccount')], 'Ghi ngay khi lập phiếu');
      push('in', 'Chi nhánh nhận', COST, [G('inventoryAccount')], [c, def('goods_in_transit')], 'Ghi khi bên nhận xác nhận; khác đơn vị hạch toán thì dùng phải thu nội bộ hàng');
      break;
    }
    case 'stock_increase':
      push('goods', 'Điều chỉnh tăng kho', COST, [G('inventoryAccount')], [R('counterAccount'), def('stock_surplus')]);
      break;
    case 'stock_decrease':
      push('goods', 'Điều chỉnh giảm kho', COST, [R('counterAccount'), def('stock_shortage')], [G('inventoryAccount')]);
      break;
    case 'cash_receipt':
      push('payment', 'Thu tiền', A, [PM], [R('counterAccount'), def('receivable')]);
      break;
    case 'cash_payment':
      push('payment', 'Chi tiền', A, [R('counterAccount'), def('payable')], [PM]);
      break;
  }

  const codes = new Set<string>();
  for (const e of raw) for (const c of [...e.debit, ...e.credit]) if (c.value) codes.add(c.value);
  const accNames = new Map((codes.size ? (await sql<{ code: string; name: string }>`SELECT code, name FROM accounts WHERE tenant_id = ${tenantId} AND code = ANY(${[...codes]})`.execute(trx)).rows : []).map((a) => [a.code, a.name]));
  const side = (chain: ChainStep[]): FlowSide => { const from = chain.find((c) => c.value) ?? null; return { account: from?.value ?? null, accountName: from?.value ? accNames.get(from.value) ?? null : null, from, chain }; };
  const flow: FlowEntry[] = raw.map((e) => ({ key: e.key, label: e.label, note: e.note, amount: e.amount, debit: side(e.debit), credit: side(e.credit) }));

  const missing: string[] = [];
  for (const e of flow) for (const [k, sd] of [['Nợ', e.debit], ['Có', e.credit]] as const) {
    if (!sd.account) missing.push(`${e.label}: chưa có tài khoản bên ${k} (khai ở ${sd.chain.map((c) => c.label).join(' hoặc ')})`);
    else if (!accNames.has(sd.account)) missing.push(`${e.label}: tài khoản ${sd.account} bên ${k} chưa có trong danh mục tài khoản`);
  }
  for (const e of flow) if (e.debit.account && e.debit.account === e.credit.account) missing.push(`${e.label}: Nợ và Có cùng tài khoản ${e.debit.account}`);
  const debit = flow.filter((e) => e.debit.account).reduce((a, e) => a + e.amount, 0);
  const credit = flow.filter((e) => e.credit.account).reduce((a, e) => a + e.amount, 0);

  // ---- ảnh hưởng khi sửa
  const groupProducts = Number((await sql<{ n: string }>`SELECT count(*)::text AS n FROM products WHERE tenant_id = ${tenantId} AND (posting_group_code = ${group.code} OR (posting_group_code IS NULL AND ${group.is_default}))`.execute(trx)).rows[0]?.n ?? 0);
  const reasonScreens = (await sql<{ screen_key: string }>`SELECT screen_key FROM screen_reasons WHERE tenant_id = ${tenantId} AND reason_code = ${reason.code}`.execute(trx)).rows.map((r) => screenOf(r.screen_key).label);
  const reasonEntries = Number((await sql<{ n: string }>`SELECT count(*)::text AS n FROM bizcity_read.ledger_entries WHERE tenant_id = ${tenantId} AND reason_code = ${reason.code} AND status = 'posted'`.execute(trx)).rows[0]?.n ?? 0);

  const sources: FlowSource[] = [reasonSrc, groupSrc];
  if (raw.some((e) => [...e.debit, ...e.credit].some((c) => c.source === 'tax'))) sources.push({ id: 'tax', label: 'Loại thuế', code: tax?.code ?? null, title: tax ? `${tax.code} — ${tax.name} (${rate}%)` : 'Chưa có loại thuế', edit: 'tax', fields: [{ key: 'account', label: 'TK thuế', value: tax?.account_code ?? null }] });
  if (raw.some((e) => [...e.debit, ...e.credit].some((c) => c.source === 'payment'))) sources.push({ id: 'payment', label: 'Hình thức thanh toán', code: method?.code ?? null, title: method ? `${method.code} — ${method.name}` : 'Chưa có hình thức', edit: 'payment', fields: [{ key: 'account', label: 'TK tiền', value: method?.account_code ?? null }] });
  if (payReason && raw.some((e) => [...e.debit, ...e.credit].some((c) => c.source === 'payReason'))) sources.push({ id: 'payReason', label: s.key === 'sale' ? 'Lý do thu mặc định' : 'Lý do trả tiền mặc định', code: payReason.code, title: `${payReason.code} — ${payReason.name}`, edit: 'reason', fields: [{ key: 'counterAccount', label: 'TK đối ứng', value: payReason.counter_account }] });
  sources.push({ id: 'defaults', label: 'Tài khoản ngầm định', code: null, title: 'Dùng khi các nguồn trên bỏ trống', edit: 'defaults', fields: [...usedDefaults].map((k) => ({ key: k, label: DEFAULT_LABEL[k] ?? k, value: defaults.get(k) ?? null })) });
  for (const src of sources) for (const f of src.fields) f.name = f.value ? accNames.get(f.value) ?? null : null;

  return {
    screen: { key: s.key, label: s.label, area: s.area },
    reason: { code: reason.code, name: reason.name, kind: reason.kind, flags },
    sample: { amount: A, taxRate: rate, tax: T, cost: COST, groupCode: group.code, taxCode: tax?.code ?? null, methodCode: method?.code ?? null, gift: Boolean(q.gift) },
    options: {
      groups: groups.map((g) => ({ code: g.code, name: g.name, isDefault: g.is_default })),
      taxes: taxes.filter((t) => t.direction === wantDir).map((t) => ({ code: t.code, name: t.name, rate: Number(t.rate) })),
      methods: methods.map((m) => ({ code: m.code, name: m.name, isReceivable: m.is_receivable })),
    },
    sources,
    entries: flow,
    totals: { debit, credit, balanced: debit === credit && !missing.length },
    missing,
    impact: { groupProducts, reasonScreens, reasonEntries },
  };
}

// ------------------------------------------------------------------------------------------------ đổi nhóm hạch toán hàng loạt

export interface BulkGroupInput { targetGroup: string; classCode?: string; fromGroup?: string; search?: string; dryRun?: boolean }

/**
 * Đổi nhóm hạch toán cho nhiều mặt hàng một lần (ví dụ: đổi cả nhóm hàng sang nhóm hạch toán thuế suất khác).
 * Lọc: nhóm hàng (gồm mọi nhóm con), nhóm hạch toán hiện tại ('' = chưa gán), mã / tên. dryRun: chỉ đếm và xem trước.
 * Định khoản từ nay theo nhóm mới; bút toán đã ghi không đổi. Ghi nhật ký số mặt hàng đã đổi.
 */
export async function bulkPostingGroup(trx: Db, tenantId: string, actor: string, b: BulkGroupInput) {
  const target = (await sql<{ code: string; name: string }>`SELECT code, name FROM product_posting_groups WHERE tenant_id = ${tenantId} AND code = ${b.targetGroup}`.execute(trx)).rows[0];
  if (!target) throw Errors.validation(`Nhóm hạch toán ${b.targetGroup} chưa có`);
  if (!b.classCode && b.fromGroup === undefined && !b.search?.trim()) throw Errors.validation('Chọn ít nhất một điều kiện lọc (nhóm hàng, nhóm hạch toán hiện tại hoặc mã / tên)');
  const search = b.search?.trim() ? `%${b.search.trim().toLowerCase()}%` : null;
  const where = sql`p.tenant_id = ${tenantId}
    ${b.classCode ? sql`AND p.group_code IN (WITH RECURSIVE t AS (SELECT code FROM item_classes WHERE tenant_id = ${tenantId} AND kind = 'group' AND code = ${b.classCode}
                                                   UNION SELECT c.code FROM item_classes c JOIN t ON c.parent_code = t.code WHERE c.tenant_id = ${tenantId} AND c.kind = 'group')
                                       SELECT code FROM t)` : sql``}
    ${b.fromGroup === undefined ? sql`` : b.fromGroup === '' ? sql`AND p.posting_group_code IS NULL` : sql`AND p.posting_group_code = ${b.fromGroup}`}
    ${search ? sql`AND (lower(p.sku) LIKE ${search} OR lower(p.name) LIKE ${search})` : sql``}`;
  const stats = (await sql<{ matched: string; change: string }>`SELECT count(*)::text AS matched, count(*) FILTER (WHERE p.posting_group_code IS DISTINCT FROM ${target.code})::text AS change FROM products p WHERE ${where}`.execute(trx)).rows[0]!;
  const byCurrent = (await sql<{ code: string | null; n: string }>`SELECT p.posting_group_code AS code, count(*)::text AS n FROM products p WHERE ${where} GROUP BY 1 ORDER BY 2 DESC`.execute(trx)).rows;
  const sample = (await sql<{ sku: string; name: string; posting_group_code: string | null }>`SELECT p.sku, p.name, p.posting_group_code FROM products p WHERE ${where} ORDER BY p.sku LIMIT 50`.execute(trx)).rows;
  const res = { target: target.code, targetName: target.name, matched: Number(stats.matched), toChange: Number(stats.change), changed: 0,
    byCurrent: byCurrent.map((x) => ({ code: x.code, count: Number(x.n) })), sample: sample.map((x) => ({ sku: x.sku, name: x.name, current: x.posting_group_code })) };
  if (b.dryRun || !res.toChange) return res;
  const upd = await sql`UPDATE products p SET posting_group_code = ${target.code}, updated_at = now() WHERE ${where} AND p.posting_group_code IS DISTINCT FROM ${target.code}`.execute(trx);
  res.changed = Number(upd.numAffectedRows ?? 0);
  await writeAudit(trx, { tenantId, actor, action: 'catalog.product.posting_group_bulk', objectType: 'product_posting_group', objectId: target.code,
    after: { classCode: b.classCode ?? null, fromGroup: b.fromGroup ?? null, search: b.search ?? null, changed: res.changed, byCurrent: res.byCurrent } });
  return res;
}

// ------------------------------------------------------------------------------------------------ lịch sử thay đổi cấu hình hạch toán

/** Thao tác ghi cấu hình hạch toán → đối tượng hiện trên lịch sử. */
const HISTORY_ACTIONS: Record<string, { kind: string; label: string; fields?: Record<string, string> }> = {
  'core.posting-reason.upsert': { kind: 'reason', label: 'Lý do', fields: { name: 'Tên', counterAccount: 'TK đối ứng', revenueAccount: 'TK doanh thu (đè)', expenseAccount: 'TK giá vốn / chi phí (đè)', isActive: 'Đang dùng' } },
  'core.posting-reason.delete': { kind: 'reason', label: 'Lý do' },
  'core.posting-group.upsert': { kind: 'group', label: 'Nhóm hạch toán', fields: { name: 'Tên', inventoryAccount: 'TK kho', cogsAccount: 'TK giá vốn', revenueAccount: 'TK doanh thu', discountAccount: 'TK chiết khấu', salesReturnAccount: 'TK hàng bán trả lại', isDefault: 'Nhóm mặc định' } },
  'core.posting-defaults.update': { kind: 'defaults', label: 'Tài khoản ngầm định' },
  'core.tax-code.create': { kind: 'tax', label: 'Loại thuế', fields: { name: 'Tên', rate: 'Thuế suất', accountCode: 'TK thuế', isActive: 'Đang dùng' } },
  'core.tax-code.update': { kind: 'tax', label: 'Loại thuế', fields: { name: 'Tên', rate: 'Thuế suất', accountCode: 'TK thuế', isActive: 'Đang dùng' } },
  'core.tax-code.delete': { kind: 'tax', label: 'Loại thuế' },
  'core.payment-method.upsert': { kind: 'payment', label: 'Hình thức thanh toán', fields: { name: 'Tên', accountCode: 'TK tiền', isActive: 'Đang dùng' } },
  'core.payment-method.delete': { kind: 'payment', label: 'Hình thức thanh toán' },
  'core.posting-flow.screen-reasons': { kind: 'screen', label: 'Lý do theo màn' },
  'core.posting-flow.bulk-posting-group': { kind: 'bulk', label: 'Đổi nhóm hạch toán hàng loạt' },
  // [2026-11-10 04:30 PM Nguyễn Văn Thủy] PHASE-026 — lịch sử quy tắc định khoản: đề xuất, sửa, duyệt, từ chối, ngừng; nghiệp vụ tự tạo (đóng góp)
  'core.posting-rule.propose': { kind: 'rule', label: 'Đề xuất quy tắc', fields: { business: 'Nghiệp vụ', part: 'Khoản', cond: 'Điều kiện', debit: 'Nợ', credit: 'Có', priority: 'Ưu tiên', from: 'Áp từ', note: 'Diễn giải', changeReason: 'Lý do đề xuất' } },
  'core.posting-rule.update': { kind: 'rule', label: 'Sửa đề xuất quy tắc', fields: { business: 'Nghiệp vụ', part: 'Khoản', cond: 'Điều kiện', debit: 'Nợ', credit: 'Có', priority: 'Ưu tiên', from: 'Áp từ', note: 'Diễn giải', changeReason: 'Lý do đề xuất' } },
  'core.posting-rule.delete': { kind: 'rule', label: 'Xoá đề xuất quy tắc' },
  'core.posting-rule.approve': { kind: 'rule', label: 'Duyệt quy tắc', fields: { id: 'Quy tắc' } },
  'core.posting-rule.reject': { kind: 'rule', label: 'Từ chối quy tắc', fields: { id: 'Quy tắc', note: 'Lý do' } },
  'core.posting-rule.stop': { kind: 'rule', label: 'Ngừng áp quy tắc', fields: { id: 'Quy tắc', from: 'Từ ngày', reason: 'Lý do' } },
  'core.posting-rule.business-create': { kind: 'business', label: 'Thêm nghiệp vụ', fields: { name: 'Tên', baseCode: 'Dựa trên', reasonCode: 'Mã', note: 'Ghi chú' } },
  'core.posting-rule.business-update': { kind: 'business', label: 'Sửa nghiệp vụ', fields: { name: 'Tên', note: 'Ghi chú', isActive: 'Đang dùng' } },
};

export interface HistoryChange { field: string; label: string; before: string | null; after: string | null }
export interface HistoryRow { id: string; at: string; actor: string; kind: string; label: string; object: string; action: 'save' | 'delete' | 'bulk'; changes: HistoryChange[]; note?: string }

const show = (v: unknown): string | null => (v === undefined || v === null || v === '' ? null : typeof v === 'boolean' ? (v ? 'Có' : 'Không') : typeof v === 'object' ? JSON.stringify(v) : String(v));

/**
 * Lịch sử sửa cấu hình hạch toán, mới nhất trước. Đọc bằng chứng của các thao tác ghi (audit_logs: mỗi lần lưu một dòng kèm dữ liệu
 * mới). "Trước" của một ô = giá trị ở lần lưu liền trước của cùng đối tượng; lần lưu đầu tiên trong nhật ký thì "trước" để trống.
 * Lần lưu không đổi ô nào thì bỏ qua.
 */
export async function configHistory(trx: Db, tenantId: string, opts: { kind?: string; limit?: number } = {}): Promise<HistoryRow[]> {
  const actions = Object.keys(HISTORY_ACTIONS).filter((a) => !opts.kind || HISTORY_ACTIONS[a]!.kind === opts.kind);
  const rows = (await sql<{ id: string; actor: string; action: string; object_id: string | null; after_data: unknown; created_at: string }>`
    SELECT id::text, actor, action, object_id, after_data, created_at::text FROM audit_logs
     WHERE tenant_id = ${tenantId} AND action = ANY(${actions}) AND result_ok IS NOT FALSE
     ORDER BY created_at, id`.execute(trx)).rows;
  const last = new Map<string, Record<string, unknown>>();
  const out: HistoryRow[] = [];
  for (const r of rows) {
    const def = HISTORY_ACTIONS[r.action]!;
    const a = (r.after_data ?? {}) as Record<string, unknown>;
    const snap = ((a.input ?? a.output ?? a) ?? {}) as Record<string, unknown>;
    const object = r.object_id ?? String(snap.code ?? snap.key ?? '');
    const key = `${def.kind}:${object}`;
    const base = { id: r.id, at: r.created_at, actor: r.actor, kind: def.kind, label: def.label, object };
    if (r.action.endsWith('.delete')) { out.push({ ...base, action: 'delete', changes: [] }); last.delete(key); continue; }
    if (def.kind === 'bulk') {
      // Bỏ lần "Xem trước" và lần chạy không đổi mặt hàng nào; số đã đổi nằm ở ghi chú nhật ký của thao tác.
      if (snap.dryRun) continue;
      const audits = ((a.notes as { audit?: { action: string; after?: Record<string, unknown> }[] } | undefined)?.audit ?? []);
      const res = audits.find((x) => x.action === 'catalog.product.posting_group_bulk')?.after;
      if (!res) continue;
      const note = [snap.classCode ? `nhóm hàng ${snap.classCode}` : '', snap.fromGroup !== undefined ? `từ nhóm ${snap.fromGroup || 'chưa gán'}` : '',
        snap.search ? `mã / tên chứa "${snap.search}"` : '', res.changed !== undefined ? `${res.changed} mặt hàng` : ''].filter(Boolean).join(' · ');
      out.push({ ...base, action: 'bulk', changes: [{ field: 'targetGroup', label: 'Đổi sang nhóm', before: null, after: show(snap.targetGroup) }], note });
      continue;
    }
    if (/\.(approve|reject|stop)$/.test(r.action)) {
      out.push({ ...base, action: 'save', changes: Object.entries(def.fields ?? {}).filter(([f]) => f in snap).map(([f, label]) => ({ field: f, label, before: null, after: show(snap[f]) })) });
      continue;
    }
    const prev = last.get(key);
    let changes: HistoryChange[];
    if (def.kind === 'screen') {
      const list = (snap.reasons as { code: string; isDefault?: boolean }[] | undefined) ?? [];
      const text = list.map((x) => (x.isDefault ? `★${x.code}` : x.code)).join(', ') || '(bỏ hết)';
      changes = [{ field: 'reasons', label: 'Lý do', before: prev ? String(prev.__text) : null, after: text }];
      last.set(key, { __text: text });
    } else {
      const fields = def.fields ?? Object.fromEntries(Object.keys(snap).filter((k) => !['code', 'key', 'warnAck'].includes(k)).map((k) => [k, k]));
      changes = Object.entries(fields).filter(([f]) => f in snap).map(([f, label]) => ({ field: f, label, before: prev ? show(prev[f]) : null, after: show(snap[f]) }))
        .filter((c) => !prev || c.before !== c.after);
      last.set(key, { ...(prev ?? {}), ...snap });
    }
    if (prev && !changes.length) continue;
    out.push({ ...base, action: 'save', changes });
  }
  return out.reverse().slice(0, opts.limit ?? 300);
}
