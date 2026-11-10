// @bizcity-layer D modules/ke-toan
// [2026-11-10 02:00 PM Nguyễn Văn Thủy] PHASE-026 — quy tắc định khoản: nghiệp vụ hệ thống, điều kiện (đóng góp)
// [2026-11-11 Nguyễn Văn Thủy] PHASE-026 — bỏ màn Thiết kế hạch toán (ACC92): quy tắc chỉ còn là dòng thêm ở Tài khoản ngầm định (ACC41) (đóng góp)
/**
 * ĐỊNH KHOẢN THÊM Ở TÀI KHOẢN NGẦM ĐỊNH (ACC41) — lưu ở posting_rules (migration 0096), bộ định khoản đọc qua rule-table của lõi.
 *  - Dòng thêm: loại chứng từ (nghiệp vụ) + khoản + điều kiện (loại hàng, biến thể…) → TK Nợ / Có. Đang áp ngay, sửa / xoá tại chỗ.
 *    Dòng khớp nhiều điều kiện hơn thắng; không có dòng khớp thì theo dòng có sẵn (posting_defaults).
 *  - Phân hệ tự khai (nhận / xuất quà ở Mua hàng): nghiệp vụ dựa trên nghiệp vụ hệ thống + một dòng theo tài khoản ở cài đặt của
 *    phân hệ (syncModuleRule) — khai một nơi là cài đặt phân hệ, đổi cài đặt thì dòng đổi theo.
 */
import { sql } from 'kysely';
import type { Db } from '../../db/client.js';
import { Errors } from '../../core/errors.js';
import { writeAudit } from '../../core/audit.js';
import { listVariantKinds } from '../catalog/san-pham-con.js';
import { COND_KEYS, PART_LABEL, condKeys, findTies, type CondKey, type PostingRule, type RuleCond, type RulePart } from '../../kernel/public.js';

// ------------------------------------------------------------------------------------------------ nghiệp vụ hệ thống

export interface BusinessSpec {
  code: string;
  name: string;
  area: 'Bán hàng' | 'Mua hàng' | 'Kho' | 'Tiền';
  /** Khoản có dòng thêm được ở ACC41 và điều kiện xét được của từng khoản. */
  parts: Partial<Record<RulePart, CondKey[]>>;
  /** Loại lý do của nghiệp vụ phân hệ tự khai dựa trên nghiệp vụ này (posting_reasons.kind). */
  reasonKind: 'in' | 'out' | 'receipt' | 'payment';
}

const ITEM: CondKey[] = ['itemType', 'variant'];
const LINE = { goods: ITEM, tax: ITEM, cogs: ITEM };
export const BUSINESSES: BusinessSpec[] = [
  { code: 'sale', name: 'Bán hàng', area: 'Bán hàng', parts: LINE, reasonKind: 'out' },
  { code: 'sale_return', name: 'Khách trả hàng', area: 'Bán hàng', parts: LINE, reasonKind: 'in' },
  { code: 'purchase', name: 'Nhập mua hàng', area: 'Mua hàng', parts: { goods: ITEM, tax: ITEM }, reasonKind: 'in' },
  { code: 'purchase_return', name: 'Trả hàng nhà cung cấp', area: 'Mua hàng', parts: { goods: ITEM, tax: ITEM }, reasonKind: 'out' },
  { code: 'transfer', name: 'Chuyển kho', area: 'Kho', parts: { goods: ['leg', 'sameUnit', ...ITEM] }, reasonKind: 'out' },
  { code: 'stock_increase', name: 'Nhập điều chỉnh kho', area: 'Kho', parts: { goods: ITEM }, reasonKind: 'in' },
  { code: 'stock_decrease', name: 'Xuất điều chỉnh kho', area: 'Kho', parts: { goods: ITEM }, reasonKind: 'out' },
  { code: 'customer_payment', name: 'Thu tiền', area: 'Tiền', parts: {}, reasonKind: 'receipt' },
  { code: 'supplier_payment', name: 'Chi tiền', area: 'Tiền', parts: {}, reasonKind: 'payment' },
];
const specOf = (code: string) => BUSINESSES.find((b) => b.code === code);

export const COND_LABEL: Record<CondKey, string> = {
  method: 'Hình thức thanh toán', taxCode: 'Loại thuế', itemType: 'Loại hàng', variant: 'Biến thể', programKind: 'Loại chương trình', program: 'Chương trình',
  gift: 'Hàng tặng', leg: 'Chiều chuyển kho', sameUnit: 'Cùng đơn vị hạch toán',
};

/** Nghiệp vụ hệ thống và loại chương trình mặc định cho đơn vị (đơn vị tạo sau migration 0096). */
export async function ensureBusinesses(trx: Db, tenantId: string): Promise<void> {
  for (const [i, b] of BUSINESSES.entries()) {
    await sql`INSERT INTO posting_businesses (tenant_id, code, name, area, sort_order, is_system, created_by)
              VALUES (${tenantId}, ${b.code}, ${b.name}, ${b.area}, ${(i + 1) * 10}, true, 'system') ON CONFLICT DO NOTHING`.execute(trx);
  }
  await sql`INSERT INTO posting_businesses (tenant_id, code, name, area, sort_order, is_system, created_by)
            VALUES (${tenantId}, 'cash_transfer', 'Chuyển tiền', 'Tiền', 100, true, 'system') ON CONFLICT DO NOTHING`.execute(trx);
  for (const [i, k] of [['KM-NCC', 'Khuyến mại của nhà cung cấp', 'both'], ['KM-CTY', 'Khuyến mại của công ty', 'sale'], ['XA-DATE', 'Xả hàng cận date', 'sale']].entries()) {
    await sql`INSERT INTO program_kinds (tenant_id, code, name, side, sort_order) VALUES (${tenantId}, ${k[0]}, ${k[1]}, ${k[2]}, ${(i + 1) * 10}) ON CONFLICT DO NOTHING`.execute(trx);
  }
}

/**
 * Nghiệp vụ phân hệ tự khai, dựa trên một nghiệp vụ hệ thống, gắn một lý do (chứng từ mang lý do đó đi theo dòng của nghiệp vụ này).
 * Lý do chưa có thì thêm (đúng loại của nghiệp vụ gốc).
 */
async function createBusiness(trx: Db, tenantId: string, actor: string, b: { name: string; baseCode: string; reasonCode: string }): Promise<string> {
  await ensureBusinesses(trx, tenantId);
  const base = specOf(b.baseCode);
  if (!base) throw Errors.validation(`Nghiệp vụ gốc ${b.baseCode} không có`);
  const code = b.reasonCode.trim().toUpperCase();
  const reason = (await sql<{ kind: string }>`SELECT kind FROM posting_reasons WHERE tenant_id = ${tenantId} AND code = ${code}`.execute(trx)).rows[0];
  if (reason && reason.kind !== base.reasonKind) throw Errors.validation(`Lý do ${code} là loại "${reason.kind}", không hợp ${base.name} (cần loại "${base.reasonKind}")`);
  if (!reason) {
    await sql`INSERT INTO posting_reasons (tenant_id, code, name, kind, flags)
              VALUES (${tenantId}, ${code}, ${b.name}, ${base.reasonKind}, ${JSON.stringify({ postToLedger: true, business: b.baseCode })}::jsonb)`.execute(trx);
  }
  await sql`INSERT INTO posting_businesses (tenant_id, code, name, area, base_code, reason_code, sort_order, is_system, note, created_by)
            VALUES (${tenantId}, ${code}, ${b.name}, ${base.area}, ${b.baseCode}, ${code},
                    (SELECT COALESCE(max(sort_order), 0) + 1 FROM posting_businesses WHERE tenant_id = ${tenantId} AND (code = ${b.baseCode} OR base_code = ${b.baseCode})),
                    false, ${`${actor} tự khai`}, ${actor})`.execute(trx);
  await writeAudit(trx, { tenantId, actor, action: 'posting.business.create', objectType: 'posting_business', objectId: code, after: b });
  return code;
}

// ------------------------------------------------------------------------------------------------ dòng định khoản

type RuleRow = { id: string; business_code: string; part: string; cond: RuleCond; debit_account: string | null; credit_account: string | null; priority: number; note: string; change_reason: string };
const RULE_COLS = sql`id::text, business_code, part, cond, debit_account, credit_account, priority, note, change_reason`;
const toRule = (r: RuleRow): PostingRule => ({
  id: r.id, business: r.business_code, part: r.part as RulePart, book: 'all', cond: r.cond ?? {}, debit: r.debit_account, credit: r.credit_account, priority: r.priority, from: '2000-01-01', to: null,
});

/** Câu điều kiện cho người đọc: "Loại hàng = QUA · Biến thể = promo". */
function condText(c: RuleCond): string {
  const parts = condKeys(c).map((k) => {
    const v = c[k];
    if (k === 'gift') return v ? 'Hàng tặng' : 'Hàng bán (không tặng)';
    if (k === 'sameUnit') return v ? 'Cùng đơn vị hạch toán' : 'Khác đơn vị hạch toán';
    if (k === 'leg') return v === 'out' ? 'Bên xuất' : 'Bên nhận';
    return `${COND_LABEL[k]} = ${String(v)}`;
  });
  return parts.length ? parts.join(' · ') : 'Mọi trường hợp';
}

/** Bỏ ô điều kiện trống, chuẩn hoá kiểu. */
function cleanCond(c: RuleCond | undefined): RuleCond {
  const out: Record<string, unknown> = {};
  for (const k of COND_KEYS) {
    const v = (c ?? {})[k];
    if (v === undefined || v === null || v === '') continue;
    out[k] = typeof v === 'string' ? v.trim() : v;
  }
  return out as RuleCond;
}

interface RuleInput { business: string; part: RulePart; cond?: RuleCond; debit?: string | null; credit?: string | null }

async function validateRule(trx: Db, tenantId: string, i: RuleInput): Promise<{ cond: RuleCond; debit: string | null; credit: string | null }> {
  await ensureBusinesses(trx, tenantId);
  const biz = (await sql<{ code: string; base_code: string | null }>`SELECT code, base_code FROM posting_businesses WHERE tenant_id = ${tenantId} AND code = ${i.business}`.execute(trx)).rows[0];
  if (!biz) throw Errors.validation(`Loại chứng từ ${i.business} không có`);
  const spec = specOf(biz.base_code ?? biz.code);
  const allowed = spec?.parts[i.part];
  if (!spec || !allowed) throw Errors.validation(`${spec?.name ?? i.business} không có khoản "${PART_LABEL[i.part] ?? i.part}"`);
  const cond = cleanCond(i.cond);
  const extra = condKeys(cond).filter((k) => !allowed.includes(k));
  if (extra.length) throw Errors.validation(`Khoản ${PART_LABEL[i.part]} của ${spec.name} không xét được điều kiện: ${extra.map((k) => COND_LABEL[k]).join(', ')}`);
  const debit = i.debit?.trim() || null;
  const credit = i.credit?.trim() || null;
  if (!debit && !credit) throw Errors.validation('Chọn ít nhất một tài khoản Nợ hoặc Có');
  if (debit && debit === credit) throw Errors.validation('Nợ và Có cùng một tài khoản');
  const codes = [debit, credit].filter((x): x is string => Boolean(x));
  const accs = (await sql<{ code: string; is_posting: boolean; is_active: boolean }>`SELECT code, is_posting, is_active FROM accounts WHERE tenant_id = ${tenantId} AND code = ANY(${codes})`.execute(trx)).rows;
  for (const c of codes) {
    const a = accs.find((x) => x.code === c);
    if (!a) throw Errors.validation(`Tài khoản ${c} chưa có trong hệ thống tài khoản`);
    if (!a.is_posting) throw Errors.validation(`Tài khoản ${c} là tài khoản tổng hợp — chọn tài khoản chi tiết`);
    if (!a.is_active) throw Errors.validation(`Tài khoản ${c} đã ngừng dùng`);
  }
  return { cond, debit, credit };
}

/** Lựa chọn cho hộp Thêm ở ACC41: loại hàng, biến thể. */
export async function ruleOptions(trx: Db, tenantId: string) {
  const types = (await sql<{ code: string; name: string }>`SELECT code, name FROM item_classes WHERE tenant_id = ${tenantId} AND kind = 'type' ORDER BY code`.execute(trx)).rows;
  return { itemTypes: types, variants: (await listVariantKinds(trx, tenantId)).filter((v) => v.isActive).map((v) => ({ code: v.code, name: v.name })) };
}

// ------------------------------------------------------------------------------------------------ dòng thêm ở ACC41

/** Dòng thêm ở ACC41 nhận ra bằng change_reason; áp ngay, mọi ngày. */
export const DEFAULT_MARK = 'Tài khoản ngầm định (ACC41)';
const DEFAULT_PRIORITY = -10;
export interface DefaultEntryInput { business: string; part: RulePart; cond?: RuleCond; debit?: string | null; credit?: string | null; name: string }

const entryOf = (r: RuleRow) => ({ id: r.id, business: r.business_code, part: r.part, cond: r.cond ?? {}, debit: r.debit_account, credit: r.credit_account, note: r.note });
async function entryRow(trx: Db, tenantId: string, id: string): Promise<RuleRow> {
  const r = (await sql<RuleRow>`SELECT ${RULE_COLS} FROM posting_rules WHERE tenant_id = ${tenantId} AND id = ${id} FOR UPDATE`.execute(trx)).rows[0];
  if (!r || r.change_reason !== DEFAULT_MARK) throw Errors.notFound('định khoản ngầm định');
  return r;
}

export async function listDefaultEntries(trx: Db, tenantId: string) {
  return (await sql<RuleRow>`SELECT ${RULE_COLS} FROM posting_rules WHERE tenant_id = ${tenantId} AND change_reason = ${DEFAULT_MARK} AND status = 'active' AND effective_to IS NULL
    ORDER BY business_code, part, id`.execute(trx)).rows.map(entryOf);
}

export async function saveDefaultEntry(trx: Db, tenantId: string, actor: string, id: string | null, i: DefaultEntryInput) {
  const name = i.name?.trim();
  if (!name) throw Errors.validation('Nhập tên định khoản');
  const v = await validateRule(trx, tenantId, i);
  const others = (await sql<RuleRow>`SELECT ${RULE_COLS} FROM posting_rules WHERE tenant_id = ${tenantId} AND business_code = ${i.business} AND status = 'active'`.execute(trx)).rows.map(toRule);
  const ties = findTies({ id: id ?? '0', business: i.business, part: i.part, book: 'all', cond: v.cond, debit: v.debit, credit: v.credit, priority: DEFAULT_PRIORITY, from: '2000-01-01', to: null }, others, id ? [id] : []);
  if (ties.length) throw Errors.validation(`Trùng định khoản đã có: ${ties.map((t) => condText(t.cond)).join(', ')} — chọn điều kiện khác`);
  if (id) {
    const cur = await entryRow(trx, tenantId, id);
    await sql`UPDATE posting_rules SET business_code = ${i.business}, part = ${i.part}, cond = ${JSON.stringify(v.cond)}::jsonb, debit_account = ${v.debit}, credit_account = ${v.credit},
                     note = ${name}, updated_at = now() WHERE tenant_id = ${tenantId} AND id = ${id}`.execute(trx);
    await writeAudit(trx, { tenantId, actor, action: 'posting.default-entry.update', objectType: 'posting_rule', objectId: id, before: entryOf(cur), after: { ...i, ...v } });
    return entryOf(await entryRow(trx, tenantId, id));
  }
  const row = (await sql<RuleRow>`
    INSERT INTO posting_rules (tenant_id, business_code, part, book, cond, debit_account, credit_account, priority, effective_from, status, note, change_reason, created_by, approved_by, approved_at)
    VALUES (${tenantId}, ${i.business}, ${i.part}, 'all', ${JSON.stringify(v.cond)}::jsonb, ${v.debit}, ${v.credit}, ${DEFAULT_PRIORITY}, DATE '2000-01-01', 'active', ${name}, ${DEFAULT_MARK}, ${actor}, ${actor}, now())
    RETURNING ${RULE_COLS}`.execute(trx)).rows[0]!;
  await writeAudit(trx, { tenantId, actor, action: 'posting.default-entry.create', objectType: 'posting_rule', objectId: row.id, after: { ...i, ...v } });
  return entryOf(row);
}

export async function deleteDefaultEntry(trx: Db, tenantId: string, actor: string, id: string) {
  const cur = await entryRow(trx, tenantId, id);
  await sql`DELETE FROM posting_rules WHERE tenant_id = ${tenantId} AND id = ${id}`.execute(trx);
  await writeAudit(trx, { tenantId, actor, action: 'posting.default-entry.delete', objectType: 'posting_rule', objectId: id, before: entryOf(cur) });
  return { id, deleted: true };
}

// ------------------------------------------------------------------------------------------------ dòng phân hệ tự khai

/**
 * Nghiệp vụ của một phân hệ (vd Mua hàng: nhận / xuất quà) dựa trên nghiệp vụ hệ thống, với MỘT dòng tiền hàng theo tài khoản ở cài
 * đặt của phân hệ. Gọi mỗi lần ghi phiếu: chưa có thì tạo, tài khoản cài đặt đổi thì dòng đổi theo (khai một nơi là cài đặt phân hệ).
 */
export async function syncModuleRule(trx: Db, tenantId: string, actor: string, b: { reasonCode: string; name: string; baseCode: string; side: 'debit' | 'credit'; account: string; note: string }) {
  const code = (await sql<{ code: string }>`SELECT code FROM posting_businesses WHERE tenant_id = ${tenantId} AND reason_code = ${b.reasonCode}`.execute(trx)).rows[0]?.code
    ?? await createBusiness(trx, tenantId, actor, b);
  const debit = b.side === 'debit' ? b.account : null;
  const credit = b.side === 'credit' ? b.account : null;
  const cur = (await sql<RuleRow>`SELECT ${RULE_COLS} FROM posting_rules WHERE tenant_id = ${tenantId} AND business_code = ${code} AND part = 'goods' AND status = 'active' AND cond = '{}'::jsonb`.execute(trx)).rows[0];
  if (cur && cur.debit_account === debit && cur.credit_account === credit) return;
  if (cur) await sql`UPDATE posting_rules SET debit_account = ${debit}, credit_account = ${credit}, updated_at = now() WHERE id = ${cur.id}`.execute(trx);
  else {
    await sql`INSERT INTO posting_rules (tenant_id, business_code, part, book, cond, debit_account, credit_account, priority, effective_from, status, note, change_reason, created_by, approved_by, approved_at)
              VALUES (${tenantId}, ${code}, 'goods', 'all', '{}'::jsonb, ${debit}, ${credit}, 0, DATE '2000-01-01', 'active', ${b.note}, ${actor}, ${actor}, ${actor}, now())`.execute(trx);
  }
  await writeAudit(trx, { tenantId, actor, action: 'posting.module-rule.sync', objectType: 'posting_business', objectId: code, before: cur ? entryOf(cur) : undefined, after: { debit, credit } });
}
