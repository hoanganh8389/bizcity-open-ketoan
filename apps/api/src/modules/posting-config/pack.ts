// @bizcity-layer K kernel/config
// [2026-10-30 10:11 PM Johnny Chu - Chu Hoàng Anh] PHASE-012 — gói định khoản cài / xem trước / gỡ: bảng config_packs, cài = phát hành một bản chính sách (ADR-0009 Q-5).
// [2026-10-30 10:52 PM Johnny Chu - Chu Hoàng Anh] PHASE-012 — chế độ baseline (khởi tạo đơn vị bằng gói nền db/packs, Q012-1): chỉ thêm mục thiếu, không phát hành bản; hình thức TT có receivable.
/**
 * GÓI ĐỊNH KHOẢN: cài / xem trước / gỡ (bizcity_posting_template@1 §5, PHASES 3.11; PHASE-012 S012-3).
 *
 *   planPack()       — so gói với cấu hình đơn vị: mỗi mục add (chưa có) · update (khác, người cài chọn ghi đè) · keep (trùng)
 *                      · conflict (khác, KHÔNG ghi đè — STD-TPL-7). Kiểm STD-TPL-2 (tài khoản tồn tại), -9 (docType / gói nền có).
 *   installPack()    — chốt bản chính sách đang áp (ensureHead) → ghi các mục add / update trong cùng giao dịch → kiểm STD-TPL-3
 *                      (mỗi khoá mặc định đúng một lý do) → cấu hình đổi thì phát hành MỘT bản chính sách (ADR-0009 Q-5,
 *                      note = "Cài gói <id>@<phiên bản>"), hiệu lực từ ngày người cài chọn. Bút toán đã ghi không đổi (STD-TPL-6).
 *                      Xem trước = chạy thật trong giao dịch rồi huỷ (dry-run của action, STD-TPL-5).
 *   uninstallPack()  — ngừng dùng mã gói đã THÊM mà chưa phát sinh; mã đã dùng, nhóm hạch toán, tài khoản ngầm định giữ nguyên
 *                      (STD-TPL-8); cấu hình đổi thì phát hành bản chính sách "Gỡ gói …".
 *   baseline         — khởi tạo đơn vị (seed) bằng gói nền `db/packs/vn-tt99-nen.posting-pack.json` (Q012-1): như seed cũ, chỉ THÊM
 *                      mục thiếu (không ghi đè, không bật lại mục đã ngừng), không chốt / phát hành bản chính sách (bản `initial` tự
 *                      chụp ở lần định khoản đầu), không chặn STD-TPL-3; vẫn ghi dòng config_packs → đơn vị đang chạy tự "nhận" gói nền.
 * Gói là dữ liệu: không code, không đổi luật định khoản. Tình huống mẫu (scenarios) và gợi ý AI lưu trong manifest, không cài.
 */
import { z } from 'zod';
import { APPROVABLE_DOC_TYPES } from '@ketoan/contracts';
import type { Db } from '../../db/client.js';
import { Errors } from '../../core/errors.js';
import { ensureHead, publishPolicy, policyHash, type PolicyVersionRow } from './policy.js';
import { loadPolicyRaw } from './posting-config.repository.js';

const code = z.string().regex(/^[A-Za-z0-9_.-]{1,32}$/, 'Mã 1–32 ký tự chữ, số, _ . -');
const account = z.string().regex(/^[0-9]{3,10}$/, 'Số tài khoản 3–10 chữ số');

/** Khuôn gói (BIZCITY-POSTING-TEMPLATE-v1.schema.json). */
export const postingPackSchema = z.object({
  contract: z.literal('bizcity_posting_template@1'),
  id: z.string().regex(/^[a-z][a-z0-9-]*\.[a-z0-9-]+\.[a-z0-9-]+$/, '<publisher>.<chế độ>.<ngành>'),
  version: z.string().regex(/^\d+\.\d+\.\d+(-[a-z0-9.]+)?$/, 'SemVer'),
  title: z.string().min(3).max(120),
  description: z.string().max(2000).optional(),
  publisher: z.object({ id: z.string().regex(/^[a-z][a-z0-9-]*$/), name: z.string().min(2), url: z.string().optional(), trust: z.enum(['official', 'verified', 'community']).optional() }).strict(),
  license: z.string().optional(),
  regime: z.enum(['vn-tt99-2025', 'vn-tt133-2016']),
  industries: z.array(z.string()).min(1),
  extends: z.array(z.string().regex(/^[a-z][a-z0-9-]*\.[a-z0-9-]+\.[a-z0-9-]+@\^?\d+(\.\d+){0,2}$/)).optional(),
  overrides: z.array(code).optional(),
  requires: z.object({ docTypes: z.array(z.string()).optional(), capabilities: z.array(z.string()).optional() }).strict().optional(),
  accounts: z.array(z.object({
    code: account, parent: account, name: z.string().min(2),
    track: z.array(z.enum(['partner', 'cost_item', 'department', 'contract', 'employee', 'cashflow', 'product'])).optional(),
  }).strict()).optional(),
  postingDefaults: z.record(z.string().regex(/^[a-z][a-z0-9_]*$/), account).optional(),
  reasons: z.array(z.object({
    code, name: z.string().min(2).max(200), kind: z.enum(['in', 'out', 'receipt', 'payment']),
    counterAccount: account.optional(), revenueAccount: account.optional(), expenseAccount: account.optional(), cashflowCode: z.string().optional(),
    flags: z.object({
      default: z.string().regex(/^[a-z_]+(:[a-z_]+)?$/).optional(), postToLedger: z.boolean().optional(), returnAtOpeningCost: z.boolean().optional(),
      excludeFromCost: z.boolean().optional(), costAtSalePrice: z.boolean().optional(), giftCostToPromotion: z.boolean().optional(), costItem: z.string().optional(),
    }).strict().optional(),
    ai: z.object({ keywords: z.array(z.string()).optional(), examples: z.array(z.string()).optional(), askIf: z.array(z.string()).optional(), notFor: z.array(z.string()).optional() }).strict().optional(),
  }).strict()).min(1),
  postingGroups: z.array(z.object({
    code, name: z.string(), inventoryAccount: account, cogsAccount: account, revenueAccount: account,
    discountAccount: account.optional(), salesReturnAccount: account.optional(), isDefault: z.boolean().optional(),
  }).strict()).optional(),
  paymentMethods: z.array(z.object({ code, name: z.string(), account, receivable: z.boolean().optional() }).strict()).optional(),
  taxCodes: z.array(z.object({ code, name: z.string(), rate: z.number().min(0).max(100), direction: z.enum(['output', 'input']), account, reportGroup: z.string().optional() }).strict()).optional(),
  costItems: z.array(z.object({ code, name: z.string(), parent: code.optional() }).strict()).optional(),
  scenarios: z.array(z.record(z.unknown())).optional(),
}).strict();
export type PostingPack = z.infer<typeof postingPackSchema>;

export type PackItemKind = 'account' | 'default' | 'reason' | 'group' | 'paymentMethod' | 'taxCode';
export interface PackItem {
  kind: PackItemKind;
  code: string;
  action: 'add' | 'update' | 'keep' | 'conflict';
  /** Trường khác giữa gói và cấu hình đang dùng (update / conflict). */
  changes?: string[];
  note?: string;
}

/** docType gói được khai trong requires: chứng từ nạp sổ + phiếu nhập tay theo lý do. */
const KNOWN_DOC_TYPES = new Set<string>([...APPROVABLE_DOC_TYPES, 'voucher']);
/** Năng lực Core đang chạy mà gói hay đòi (bizcity-standard.json, status available). */
const KNOWN_CAPABILITIES = new Set(['ledger.submit', 'posting.policy-version', 'events.outbox', 'mcp.tools']);

const itemKey = (i: { kind: string; code: string }) => `${i.kind}:${i.code}`;
const diff = (pairs: [string, unknown, unknown][]) => pairs.filter(([, a, b]) => JSON.stringify(a ?? null) !== JSON.stringify(b ?? null)).map(([k]) => k);

/** Dòng bảng đích của từng mục gói (để so và ghi). */
function rowsOf(pack: PostingPack) {
  return {
    reasons: pack.reasons.map((r) => ({
      code: r.code, name: r.name, kind: r.kind, counter_account: r.counterAccount ?? null, revenue_account: r.revenueAccount ?? null,
      expense_account: r.expenseAccount ?? null, cashflow_code: r.cashflowCode ?? null, flags: r.flags ?? {},
    })),
    groups: (pack.postingGroups ?? []).map((g) => ({
      code: g.code, name: g.name, inventory_account: g.inventoryAccount, cogs_account: g.cogsAccount, revenue_account: g.revenueAccount,
      discount_account: g.discountAccount ?? null, sales_return_account: g.salesReturnAccount ?? g.revenueAccount, isDefault: !!g.isDefault,
    })),
    methods: (pack.paymentMethods ?? []).map((m) => ({ code: m.code, name: m.name, account_code: m.account, is_receivable: !!m.receivable })),
    taxes: (pack.taxCodes ?? []).map((t) => ({ code: t.code, name: t.name, rate: t.rate, direction: t.direction, account_code: t.account, report_group: t.reportGroup ?? String(t.rate) })),
    defaults: Object.entries(pack.postingDefaults ?? {}).map(([key, acc]) => ({ key, account_code: acc })),
  };
}

/** Mục đang thuộc gói khác đã cài (đã thêm / đã ghi đè) → gói này chỉ ghi đè được khi khai overrides (BIZCITY-POSTING-TEMPLATE §4). */
async function ownersOf(trx: Db, tenantId: string, packId: string): Promise<Map<string, string>> {
  const rows = await trx.selectFrom('config_packs').select(['pack_id', 'items']).where('tenant_id', '=', tenantId).where('status', '=', 'installed').where('pack_id', '!=', packId).execute();
  const owners = new Map<string, string>();
  for (const r of rows) for (const i of r.items as PackItem[]) if (i.action === 'add' || i.action === 'update') owners.set(itemKey(i), r.pack_id);
  return owners;
}

/** So gói với cấu hình đơn vị. overwrite: các mục "<kind>:<mã>" người cài đồng ý ghi đè (STD-TPL-7). */
export async function planPack(trx: Db, tenantId: string, pack: PostingPack, overwrite: string[] = [], opts: { baseline?: boolean } = {}): Promise<PackItem[]> {
  // STD-TPL-9: docType / năng lực / gói nền chưa có → không cài được.
  const missing = [
    ...(pack.requires?.docTypes ?? []).filter((t) => !KNOWN_DOC_TYPES.has(t)).map((t) => `docType ${t}`),
    ...(pack.requires?.capabilities ?? []).filter((c) => !KNOWN_CAPABILITIES.has(c)).map((c) => `năng lực ${c}`),
  ];
  for (const ref of pack.extends ?? []) {
    const base = ref.split('@')[0]!;
    const row = await trx.selectFrom('config_packs').select('status').where('tenant_id', '=', tenantId).where('pack_id', '=', base).executeTakeFirst();
    if (row?.status !== 'installed') missing.push(`gói nền ${ref}`);
  }
  if (missing.length) throw Errors.capabilityMissing(`${missing.join(', ')} (gói ${pack.id} cần)`);

  // STD-TPL-2: mọi tài khoản gói dùng có trong hệ thống tài khoản của đơn vị hoặc trong accounts của gói (con có cha).
  const accounts = new Map((await trx.selectFrom('accounts').select(['code', 'is_active']).where('tenant_id', '=', tenantId).execute()).map((a) => [a.code, a]));
  const packAccounts = new Set((pack.accounts ?? []).map((a) => a.code));
  const rows = rowsOf(pack);
  const used = new Set<string>([
    ...rows.reasons.flatMap((r) => [r.counter_account, r.revenue_account, r.expense_account]),
    ...rows.groups.flatMap((g) => [g.inventory_account, g.cogs_account, g.revenue_account, g.discount_account, g.sales_return_account]),
    ...rows.methods.map((m) => m.account_code), ...rows.taxes.map((t) => t.account_code), ...rows.defaults.map((d) => d.account_code),
  ].filter((c): c is string => !!c));
  const unknown = [...used].filter((c) => !accounts.has(c) && !packAccounts.has(c));
  const orphans = (pack.accounts ?? []).filter((a) => !a.code.startsWith(a.parent) || (!accounts.has(a.parent) && !packAccounts.has(a.parent)));
  if (unknown.length || orphans.length) {
    throw Errors.validation(`Gói ${pack.id} dùng tài khoản đơn vị chưa có: ${[...unknown, ...orphans.map((a) => `${a.code} (cha ${a.parent})`)].join(', ')}`, { unknown, orphans: orphans.map((a) => a.code) });
  }

  const owners = await ownersOf(trx, tenantId, pack.id);
  const allow = new Set(overwrite);
  const overrides = new Set(pack.overrides ?? []);
  const decide = (kind: PackItemKind, c: string, changes: string[] | null, inactive = false): PackItem => {
    if (changes === null) return { kind, code: c, action: 'add' };
    if (!changes.length) return inactive && !opts.baseline ? { kind, code: c, action: 'update', changes: ['is_active'] } : { kind, code: c, action: 'keep' };
    const owner = owners.get(`${kind}:${c}`);
    if (owner && !overrides.has(c)) return { kind, code: c, action: 'conflict', changes, note: `thuộc gói ${owner}; gói này không khai overrides` };
    return allow.has(`${kind}:${c}`) ? { kind, code: c, action: 'update', changes } : { kind, code: c, action: 'conflict', changes, note: 'đang khác cấu hình của đơn vị — giữ nguyên trừ khi chọn ghi đè' };
  };

  const items: PackItem[] = [];
  for (const a of pack.accounts ?? []) items.push(accounts.has(a.code) ? { kind: 'account', code: a.code, action: 'keep' } : { kind: 'account', code: a.code, action: 'add' });

  const [reasons, groups, methods, taxes, defaults] = await Promise.all([
    trx.selectFrom('posting_reasons').selectAll().where('tenant_id', '=', tenantId).execute(),
    trx.selectFrom('product_posting_groups').selectAll().where('tenant_id', '=', tenantId).execute(),
    trx.selectFrom('payment_methods').selectAll().where('tenant_id', '=', tenantId).execute(),
    trx.selectFrom('tax_codes').selectAll().where('tenant_id', '=', tenantId).execute(),
    trx.selectFrom('posting_defaults').selectAll().where('tenant_id', '=', tenantId).execute(),
  ]);
  for (const d of rows.defaults) {
    const cur = defaults.find((x) => x.key === d.key);
    items.push(decide('default', d.key, cur ? diff([['account_code', cur.account_code, d.account_code]]) : null));
  }
  for (const r of rows.reasons) {
    const cur = reasons.find((x) => x.code === r.code);
    items.push(decide('reason', r.code, cur ? diff([['name', cur.name, r.name], ['kind', cur.kind, r.kind], ['counter_account', cur.counter_account, r.counter_account],
      ['revenue_account', cur.revenue_account, r.revenue_account], ['expense_account', cur.expense_account, r.expense_account],
      ['cashflow_code', cur.cashflow_code, r.cashflow_code], ['flags', sortKeys(cur.flags), sortKeys(r.flags)]]) : null, cur ? !cur.is_active : false));
  }
  for (const g of rows.groups) {
    const cur = groups.find((x) => x.code === g.code);
    items.push(decide('group', g.code, cur ? diff([['name', cur.name, g.name], ['inventory_account', cur.inventory_account, g.inventory_account], ['cogs_account', cur.cogs_account, g.cogs_account],
      ['revenue_account', cur.revenue_account, g.revenue_account], ['discount_account', cur.discount_account, g.discount_account], ['sales_return_account', cur.sales_return_account, g.sales_return_account]]) : null));
  }
  for (const m of rows.methods) {
    const cur = methods.find((x) => x.code === m.code);
    items.push(decide('paymentMethod', m.code, cur ? diff([['name', cur.name, m.name], ['account_code', cur.account_code, m.account_code], ['is_receivable', cur.is_receivable, m.is_receivable]]) : null, cur ? !cur.is_active : false));
  }
  for (const t of rows.taxes) {
    const cur = taxes.find((x) => x.code === t.code);
    items.push(decide('taxCode', t.code, cur ? diff([['name', cur.name, t.name], ['rate', Number(cur.rate), t.rate], ['direction', cur.direction, t.direction],
      ['account_code', cur.account_code, t.account_code], ['report_group', cur.report_group, t.report_group]]) : null, cur ? !cur.is_active : false));
  }
  const unknownOverwrite = overwrite.filter((k) => !items.some((i) => itemKey(i) === k));
  if (unknownOverwrite.length) throw Errors.validation(`Mục ghi đè không có trong gói: ${unknownOverwrite.join(', ')}`);
  return items;
}

const sortKeys = (v: unknown) => (v && typeof v === 'object' ? Object.fromEntries(Object.entries(v as Record<string, unknown>).sort(([a], [b]) => (a < b ? -1 : 1))) : v);

/** Ghi các mục add / update của kế hoạch. */
async function applyPlan(trx: Db, tenantId: string, pack: PostingPack, items: PackItem[]): Promise<void> {
  const todo = new Map(items.filter((i) => i.action === 'add' || i.action === 'update').map((i) => [itemKey(i), i]));
  const rows = rowsOf(pack);
  for (const a of pack.accounts ?? []) {
    if (!todo.has(`account:${a.code}`)) continue;
    const parent = await trx.selectFrom('accounts').select(['code', 'level', 'normal_side', 'is_posting', 'is_active']).where('tenant_id', '=', tenantId).where('code', '=', a.parent).executeTakeFirstOrThrow();
    if (!parent.is_active) throw Errors.validation(`Tài khoản mẹ ${parent.code} đã ngừng sử dụng, gói không thêm tài khoản con ${a.code} được`);
    if (parent.is_posting) {
      const line = await trx.selectFrom('ledger_lines').select('id').where('tenant_id', '=', tenantId).where('account_code', '=', parent.code).limit(1).executeTakeFirst();
      if (line) throw Errors.conflict(`Tài khoản ${parent.code} đã có phát sinh, gói không thêm tài khoản con ${a.code} được`);
      await trx.updateTable('accounts').set({ is_posting: false }).where('tenant_id', '=', tenantId).where('code', '=', parent.code).execute();
    }
    const track = new Set(a.track ?? []);
    await trx.insertInto('accounts').values({
      tenant_id: tenantId, code: a.code, name: a.name, parent_code: a.parent, level: parent.level + 1, normal_side: parent.normal_side,
      track_partner: track.has('partner'), track_cost_item: track.has('cost_item'), track_department: track.has('department'), track_contract: track.has('contract'),
      track_employee: track.has('employee'), track_cashflow: track.has('cashflow'), track_product: track.has('product'),
    }).execute();
  }
  for (const d of rows.defaults) {
    if (!todo.has(`default:${d.key}`)) continue;
    await trx.insertInto('posting_defaults').values({ tenant_id: tenantId, ...d }).onConflict((oc) => oc.columns(['tenant_id', 'key']).doUpdateSet({ account_code: d.account_code })).execute();
  }
  for (const r of rows.reasons) {
    if (!todo.has(`reason:${r.code}`)) continue;
    const v = { ...r, flags: JSON.stringify(r.flags), is_active: true };
    await trx.insertInto('posting_reasons').values({ tenant_id: tenantId, ...v }).onConflict((oc) => oc.columns(['tenant_id', 'code']).doUpdateSet(v)).execute();
  }
  const hasDefaultGroup = !!(await trx.selectFrom('product_posting_groups').select('code').where('tenant_id', '=', tenantId).where('is_default', '=', true).executeTakeFirst());
  for (const { isDefault, ...g } of rows.groups) {
    if (!todo.has(`group:${g.code}`)) continue;
    await trx.insertInto('product_posting_groups').values({ tenant_id: tenantId, ...g, is_default: isDefault && !hasDefaultGroup }).onConflict((oc) => oc.columns(['tenant_id', 'code']).doUpdateSet(g)).execute();
  }
  for (const m of rows.methods) {
    if (!todo.has(`paymentMethod:${m.code}`)) continue;
    await trx.insertInto('payment_methods').values({ tenant_id: tenantId, ...m, sort_order: null }).onConflict((oc) => oc.columns(['tenant_id', 'code']).doUpdateSet({ ...m, is_active: true })).execute();
  }
  for (const t of rows.taxes) {
    if (!todo.has(`taxCode:${t.code}`)) continue;
    const v = { ...t, rate: String(t.rate) };
    await trx.insertInto('tax_codes').values({ tenant_id: tenantId, ...v }).onConflict((oc) => oc.columns(['tenant_id', 'code']).doUpdateSet({ ...v, is_active: true })).execute();
  }
}

/** STD-TPL-3: mỗi khoá mặc định (flags.default) có đúng một lý do đang dùng. */
async function assertSingleDefaults(trx: Db, tenantId: string): Promise<void> {
  const rows = await trx.selectFrom('posting_reasons').select(['code', 'flags']).where('tenant_id', '=', tenantId).where('is_active', '=', true).execute();
  const byKey = new Map<string, string[]>();
  for (const r of rows) {
    const k = (r.flags as Record<string, unknown> | null)?.default;
    if (typeof k === 'string') byKey.set(k, [...(byKey.get(k) ?? []), r.code]);
  }
  const dup = [...byKey].filter(([, codes]) => codes.length > 1);
  if (dup.length) throw Errors.validation(`Mỗi loại chứng từ chỉ có một lý do mặc định (STD-TPL-3): ${dup.map(([k, c]) => `${k} → ${c.join(', ')}`).join('; ')}. Ghi đè lý do đang dùng hoặc bỏ cờ default trong gói.`, { duplicates: Object.fromEntries(dup) });
}

/** Ngày hôm nay theo giờ Việt Nam (ngày hiệu lực mặc định của bản chính sách do cài / gỡ gói). */
const todayVn = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Ho_Chi_Minh' }).format(new Date());

/** Phát hành bản chính sách nếu cấu hình đổi so với bản đã chốt trước khi ghi. */
async function publishIfChanged(trx: Db, tenantId: string, pinned: PolicyVersionRow, a: { effectiveFrom?: string; note: string; actor: string }): Promise<number | null> {
  const live = await loadPolicyRaw(trx, tenantId);
  if (policyHash(live) === pinned.hash) return null;
  return (await publishPolicy(trx, tenantId, live, { effectiveFrom: a.effectiveFrom ?? todayVn(), note: a.note, actor: a.actor, pinned })).version;
}

export interface PackResult { packId: string; version: string; items: PackItem[]; policyVersion: number | null }

/** Cài (hoặc cài lại / nâng cấp) gói. Gọi trong giao dịch của action (dry-run = xem trước). */
export async function installPack(trx: Db, tenantId: string, pack: PostingPack, a: { overwrite?: string[]; effectiveFrom?: string; actor: string; baseline?: boolean }): Promise<PackResult> {
  const items = await planPack(trx, tenantId, pack, a.overwrite, { baseline: a.baseline });
  let policyVersion: number | null = null;
  if (a.baseline) await applyPlan(trx, tenantId, pack, items);
  else {
    // Chốt bản chính sách đang áp TRƯỚC khi ghi: chứng từ trước ngày hiệu lực mới vẫn theo cấu hình cũ (STD-TPL-6).
    const pinned = await ensureHead(trx, tenantId, await loadPolicyRaw(trx, tenantId), a.actor);
    await applyPlan(trx, tenantId, pack, items);
    await assertSingleDefaults(trx, tenantId);
    policyVersion = await publishIfChanged(trx, tenantId, pinned, { effectiveFrom: a.effectiveFrom, note: `Cài gói định khoản ${pack.id}@${pack.version}`, actor: a.actor });
  }
  const prev = await trx.selectFrom('config_packs').select(['items', 'status']).where('tenant_id', '=', tenantId).where('pack_id', '=', pack.id).executeTakeFirst();
  // Cài lại: mục gói đã thêm lần trước vẫn tính là "gói thêm" (để gỡ đúng phần gói).
  const added = new Set(prev?.status === 'installed' ? (prev.items as PackItem[]).filter((i) => i.action === 'add').map(itemKey) : []);
  const stored = items.map((i) => (added.has(itemKey(i)) && i.action !== 'conflict' ? { ...i, action: 'add' as const } : i));
  const v = {
    version: pack.version, title: pack.title, regime: pack.regime, status: 'installed' as const, manifest: JSON.stringify(pack), items: JSON.stringify(stored),
    policy_version: policyVersion, installed_by: a.actor, installed_at: new Date(), uninstalled_by: null, uninstalled_at: null,
  };
  await trx.insertInto('config_packs').values({ tenant_id: tenantId, pack_id: pack.id, ...v }).onConflict((oc) => oc.columns(['tenant_id', 'pack_id']).doUpdateSet(v)).execute();
  return { packId: pack.id, version: pack.version, items, policyVersion };
}

/** Gỡ gói: ngừng dùng mã gói đã thêm mà chưa phát sinh (STD-TPL-8). */
export async function uninstallPack(trx: Db, tenantId: string, packId: string, a: { effectiveFrom?: string; actor: string }): Promise<PackResult> {
  const row = await trx.selectFrom('config_packs').selectAll().where('tenant_id', '=', tenantId).where('pack_id', '=', packId).forUpdate().executeTakeFirst();
  if (!row) throw Errors.notFound(`gói ${packId}`);
  if (row.status !== 'installed') throw Errors.conflict(`Gói ${packId} đã gỡ`);
  const dependants = await trx.selectFrom('config_packs').select(['pack_id', 'manifest']).where('tenant_id', '=', tenantId).where('status', '=', 'installed').where('pack_id', '!=', packId).execute();
  const needs = dependants.filter((d) => ((d.manifest as PostingPack).extends ?? []).some((r) => r.split('@')[0] === packId)).map((d) => d.pack_id);
  if (needs.length) throw Errors.conflict(`Gói ${packId} là gói nền của ${needs.join(', ')} — gỡ các gói đó trước`);

  const pinned = await ensureHead(trx, tenantId, await loadPolicyRaw(trx, tenantId), a.actor);
  const out: PackItem[] = [];
  for (const i of row.items as PackItem[]) {
    if (i.action !== 'add') continue;
    const stop = async (table: 'posting_reasons' | 'payment_methods' | 'tax_codes' | 'accounts', usedBy: () => Promise<unknown>) => {
      if (await usedBy()) return out.push({ ...i, action: 'keep', note: 'đã phát sinh — giữ nguyên' });
      await trx.updateTable(table).set({ is_active: false }).where('tenant_id', '=', tenantId).where('code', '=', i.code).execute();
      return out.push({ ...i, action: 'update', changes: ['is_active'], note: 'ngừng dùng' });
    };
    if (i.kind === 'reason') await stop('posting_reasons', () => trx.selectFrom('ledger_entries').select('id').where('tenant_id', '=', tenantId).where('reason_code', '=', i.code).limit(1).executeTakeFirst());
    else if (i.kind === 'taxCode') await stop('tax_codes', () => trx.selectFrom('ledger_lines').select('id').where('tenant_id', '=', tenantId).where('tax_code', '=', i.code).limit(1).executeTakeFirst());
    else if (i.kind === 'account') await stop('accounts', () => trx.selectFrom('ledger_lines').select('id').where('tenant_id', '=', tenantId).where('account_code', '=', i.code).limit(1).executeTakeFirst());
    else if (i.kind === 'paymentMethod') {
      await stop('payment_methods', () => trx.selectFrom('accounting_events').select('id').where('tenant_id', '=', tenantId)
        .where((eb) => eb('payload', '@>', JSON.stringify({ payments: [{ methodCode: i.code }] }) as never)).limit(1).executeTakeFirst());
    } else out.push({ ...i, action: 'keep', note: i.kind === 'group' ? 'nhóm hạch toán có thể đang gán cho mặt hàng — giữ nguyên' : 'tài khoản ngầm định — giữ nguyên' });
  }
  const policyVersion = await publishIfChanged(trx, tenantId, pinned, { effectiveFrom: a.effectiveFrom, note: `Gỡ gói định khoản ${packId}@${row.version}`, actor: a.actor });
  await trx.updateTable('config_packs').set({ status: 'uninstalled', uninstalled_by: a.actor, uninstalled_at: new Date() }).where('tenant_id', '=', tenantId).where('pack_id', '=', packId).execute();
  return { packId, version: row.version, items: out, policyVersion };
}

/** Đọc gói từ tệp (gói nền ở db/packs) và kiểm khuôn. */
export function parsePack(json: unknown, source: string): PostingPack {
  const r = postingPackSchema.safeParse(json);
  if (!r.success) throw Errors.validation(`Gói ${source} không đúng khuôn bizcity_posting_template@1`, r.error.flatten());
  return r.data;
}

export async function listPacks(db: Db, tenantId: string) {
  return db.selectFrom('config_packs').select(['pack_id', 'version', 'title', 'regime', 'status', 'policy_version', 'installed_by', 'installed_at', 'uninstalled_at', 'items'])
    .where('tenant_id', '=', tenantId).orderBy('installed_at', 'desc').execute();
}
