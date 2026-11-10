// @bizcity-layer D modules/ke-toan
// [2026-11-10 02:00 PM Nguyễn Văn Thủy] PHASE-026 — quy tắc định khoản: nghiệp vụ, đề xuất / duyệt / ngừng quy tắc, chạy thử trên phiếu mẫu (đóng góp)
/**
 * QUY TẮC ĐỊNH KHOẢN (docs/nghiep-vu/15-quy-tac-dinh-khoan.md, migration 0096).
 *
 *  - Nghiệp vụ: 10 nghiệp vụ hệ thống (theo loại chứng từ) + nghiệp vụ kế toán tự tạo dựa trên một nghiệp vụ hệ thống. Nghiệp vụ
 *    tự tạo gắn một lý do: chứng từ mang lý do đó (chọn ở màn nhập liệu) đi theo quy tắc của nghiệp vụ này trước.
 *  - Quy tắc: kế toán ĐỀ XUẤT (quyền catalog:write) → người có quyền settings:write (kế toán trưởng, chủ đơn vị) DUYỆT thì mới áp,
 *    từ ngày hiệu lực. Sửa quy tắc đang áp = đề xuất bản thay (replaces_id); duyệt thì bản cũ đóng ở ngày hiệu lực bản mới — chứng
 *    từ trước ngày đó (kể cả định khoản lại) vẫn theo bản cũ. Ngừng = đóng ngày hiệu lực. Không xoá quy tắc đã duyệt.
 *  - Đụng nhau: hai quy tắc có thể cùng khớp một dòng, cùng số điều kiện, cùng ưu tiên → chặn lúc lưu / duyệt (findTies).
 *  - Chạy thử: dựng phiếu mẫu của nghiệp vụ rồi định khoản bằng CHÍNH bộ định khoản (simulatePosting) — sơ đồ ACC92 và nút
 *    "Chạy thử" của quy tắc đề xuất thấy bút toán thật, trước và sau khi áp quy tắc.
 */
import { sql } from 'kysely';
import { ingestDocumentSchema, type IngestDocument } from '@ketoan/contracts';
import type { Db } from '../../db/client.js';
import { Errors } from '../../core/errors.js';
import { writeAudit } from '../../core/audit.js';
import { listVariantKinds } from '../catalog/san-pham-con.js';
import {
  COND_KEYS, PART_LABEL, condKeys, contextOf, findTies, pickRule, simulatePosting,
  type CondKey, type PostingRule, type RuleCond, type RulePart, type RuleTable,
} from '../../kernel/public.js';

// ------------------------------------------------------------------------------------------------ nghiệp vụ hệ thống

export interface BusinessSpec {
  code: string;
  name: string;
  area: 'Bán hàng' | 'Mua hàng' | 'Kho' | 'Tiền';
  /** Khoản tiền có quy tắc được và điều kiện dùng được cho từng khoản. */
  parts: Partial<Record<RulePart, CondKey[]>>;
  /** Loại lý do của nghiệp vụ tự tạo dựa trên nghiệp vụ này (posting_reasons.kind). */
  reasonKind: 'in' | 'out' | 'receipt' | 'payment';
  /** Màn nhập liệu (screen_reasons.screen_key) — nghiệp vụ tự tạo hiện ở màn này. */
  screen: string;
  note: string;
}

const LINE_CONDS: CondKey[] = ['taxCode', 'itemType', 'variant', 'gift', 'programKind', 'program'];
export const BUSINESSES: BusinessSpec[] = [
  { code: 'sale', name: 'Bán hàng', area: 'Bán hàng', parts: { goods: LINE_CONDS, tax: LINE_CONDS, cogs: LINE_CONDS, payment: ['method'] }, reasonKind: 'out', screen: 'sale', note: 'Hoá đơn bán, phiếu bán ở quầy; giá vốn ghi ở phiếu giá vốn cuối tháng' },
  { code: 'sale_return', name: 'Khách trả hàng', area: 'Bán hàng', parts: { goods: LINE_CONDS, tax: LINE_CONDS, cogs: LINE_CONDS, payment: ['method'] }, reasonKind: 'in', screen: 'sale_return', note: 'Hàng bán bị trả lại' },
  { code: 'purchase', name: 'Nhập mua hàng', area: 'Mua hàng', parts: { goods: LINE_CONDS, tax: LINE_CONDS, payment: ['method'] }, reasonKind: 'in', screen: 'purchase', note: 'Phiếu nhập mua từ nhà cung cấp' },
  { code: 'purchase_return', name: 'Trả hàng nhà cung cấp', area: 'Mua hàng', parts: { goods: LINE_CONDS, tax: LINE_CONDS, payment: ['method'] }, reasonKind: 'out', screen: 'purchase_return', note: 'Xuất trả hàng mua, thưởng / chiết khấu giảm giá vốn' },
  { code: 'transfer', name: 'Chuyển kho', area: 'Kho', parts: { goods: ['leg', 'sameUnit', 'itemType', 'variant'] }, reasonKind: 'out', screen: 'transfer', note: 'Chuyển hàng giữa chi nhánh; giá trị theo phiếu giá vốn tháng' },
  { code: 'stock_increase', name: 'Nhập điều chỉnh kho', area: 'Kho', parts: { goods: ['itemType', 'variant'] }, reasonKind: 'in', screen: 'stock_increase', note: 'Kiểm kê thừa, nhận quà, nhập khác' },
  { code: 'stock_decrease', name: 'Xuất điều chỉnh kho', area: 'Kho', parts: { goods: ['itemType', 'variant'] }, reasonKind: 'out', screen: 'stock_decrease', note: 'Kiểm kê thiếu, xuất huỷ, xuất dùng, xuất quà' },
  { code: 'customer_payment', name: 'Thu tiền', area: 'Tiền', parts: { payment: ['method'] }, reasonKind: 'receipt', screen: 'cash_receipt', note: 'Phiếu thu tiền khách, thu khác' },
  { code: 'supplier_payment', name: 'Chi tiền', area: 'Tiền', parts: { payment: ['method'] }, reasonKind: 'payment', screen: 'cash_payment', note: 'Phiếu chi trả nhà cung cấp, chi khác' },
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

type BizRow = { code: string; name: string; area: string; base_code: string | null; reason_code: string | null; sort_order: number; is_system: boolean; is_active: boolean; note: string; reason_name: string | null };

export async function listBusinesses(trx: Db, tenantId: string) {
  await ensureBusinesses(trx, tenantId);
  const rows = (await sql<BizRow>`
    SELECT b.code, b.name, b.area, b.base_code, b.reason_code, b.sort_order, b.is_system, b.is_active, b.note, r.name AS reason_name
      FROM posting_businesses b LEFT JOIN posting_reasons r ON r.tenant_id = b.tenant_id AND r.code = b.reason_code
     WHERE b.tenant_id = ${tenantId} ORDER BY b.sort_order, b.code`.execute(trx)).rows;
  const counts = (await sql<{ business_code: string; status: string; n: string }>`
    SELECT business_code, status, count(*)::text AS n FROM posting_rules
     WHERE tenant_id = ${tenantId} AND (status = 'draft' OR (status = 'active' AND (effective_to IS NULL OR effective_to > current_date)))
     GROUP BY 1, 2`.execute(trx)).rows;
  const n = (code: string, status: string) => Number(counts.find((c) => c.business_code === code && c.status === status)?.n ?? 0);
  return rows.filter((r) => r.code !== 'cash_transfer').map((r) => {
    const spec = specOf(r.base_code ?? r.code);
    return {
      code: r.code, name: r.name, area: spec?.area ?? r.area, baseCode: r.base_code, reasonCode: r.reason_code, reasonName: r.reason_name,
      isSystem: r.is_system, isActive: r.is_active, note: r.note || spec?.note || '', sortOrder: r.sort_order,
      parts: Object.entries(spec?.parts ?? {}).map(([part, conds]) => ({ part, label: PART_LABEL[part as RulePart], conds })),
      activeRules: n(r.code, 'active'), draftRules: n(r.code, 'draft'),
    };
  });
}

export interface BusinessInput { name: string; baseCode: string; reasonCode: string; reasonName?: string; note?: string; isActive?: boolean }

/**
 * Thêm / sửa nghiệp vụ tự tạo. Lý do chưa có thì thêm lý do mới (đúng loại của nghiệp vụ gốc) và đưa vào màn nhập liệu của nghiệp vụ
 * gốc (nếu màn đã giới hạn lý do) — chứng từ chọn lý do này đi theo quy tắc của nghiệp vụ.
 */
export async function saveBusiness(trx: Db, tenantId: string, actor: string, code: string | null, b: BusinessInput) {
  await ensureBusinesses(trx, tenantId);
  const base = specOf(b.baseCode);
  if (!base) throw Errors.validation(`Nghiệp vụ gốc ${b.baseCode} không có`);
  const reasonCode = b.reasonCode.trim().toUpperCase();
  if (!/^[A-Z0-9][A-Z0-9._-]{1,31}$/.test(reasonCode)) throw Errors.validation('Mã nghiệp vụ: 2–32 ký tự chữ, số, dấu chấm, gạch');
  const name = b.name.trim();
  if (!name) throw Errors.validation('Nhập tên nghiệp vụ');
  const existing = (await sql<{ code: string; kind: string; name: string }>`SELECT code, kind, name FROM posting_reasons WHERE tenant_id = ${tenantId} AND code = ${reasonCode}`.execute(trx)).rows[0];
  if (existing && existing.kind !== base.reasonKind) throw Errors.validation(`Lý do ${reasonCode} là loại "${existing.kind}", không hợp nghiệp vụ ${base.name} (cần loại "${base.reasonKind}")`);
  const owner = (await sql<{ code: string }>`SELECT code FROM posting_businesses WHERE tenant_id = ${tenantId} AND reason_code = ${reasonCode} AND code <> ${code ?? ''}`.execute(trx)).rows[0];
  if (owner) throw Errors.conflict(`Lý do ${reasonCode} đã dùng cho nghiệp vụ ${owner.code}`);
  if (!existing) {
    await sql`INSERT INTO posting_reasons (tenant_id, code, name, kind, flags)
              VALUES (${tenantId}, ${reasonCode}, ${b.reasonName?.trim() || name}, ${base.reasonKind}, ${JSON.stringify({ postToLedger: true, business: b.baseCode })}::jsonb)`.execute(trx);
    const limited = (await sql<{ n: string }>`SELECT count(*)::text AS n FROM screen_reasons WHERE tenant_id = ${tenantId} AND screen_key = ${base.screen}`.execute(trx)).rows[0]!;
    if (Number(limited.n) > 0) {
      await sql`INSERT INTO screen_reasons (tenant_id, screen_key, reason_code, sort_order, created_by)
                VALUES (${tenantId}, ${base.screen}, ${reasonCode}, 99, ${actor}) ON CONFLICT DO NOTHING`.execute(trx);
    }
  }
  if (code) {
    const cur = (await sql<{ is_system: boolean }>`SELECT is_system FROM posting_businesses WHERE tenant_id = ${tenantId} AND code = ${code}`.execute(trx)).rows[0];
    if (!cur) throw Errors.notFound(`nghiệp vụ ${code}`);
    if (cur.is_system) {
      await sql`UPDATE posting_businesses SET name = ${name}, note = ${b.note ?? ''}, updated_at = now() WHERE tenant_id = ${tenantId} AND code = ${code}`.execute(trx);
    } else {
      await sql`UPDATE posting_businesses SET name = ${name}, base_code = ${b.baseCode}, reason_code = ${reasonCode}, note = ${b.note ?? ''}, is_active = ${b.isActive ?? true}, updated_at = now()
                 WHERE tenant_id = ${tenantId} AND code = ${code}`.execute(trx);
    }
  } else {
    const dup = (await sql<{ code: string }>`SELECT code FROM posting_businesses WHERE tenant_id = ${tenantId} AND code = ${reasonCode}`.execute(trx)).rows[0];
    if (dup) throw Errors.conflict(`Mã nghiệp vụ ${reasonCode} đã có`);
    await sql`INSERT INTO posting_businesses (tenant_id, code, name, area, base_code, reason_code, sort_order, is_system, note, created_by)
              VALUES (${tenantId}, ${reasonCode}, ${name}, ${base.area}, ${b.baseCode}, ${reasonCode},
                      (SELECT COALESCE(max(sort_order), 0) + 1 FROM posting_businesses WHERE tenant_id = ${tenantId} AND (code = ${b.baseCode} OR base_code = ${b.baseCode})),
                      false, ${b.note ?? ''}, ${actor})`.execute(trx);
  }
  await writeAudit(trx, { tenantId, actor, action: 'posting.business.save', objectType: 'posting_business', objectId: code ?? reasonCode, after: { ...b, reasonCode } });
  return (await listBusinesses(trx, tenantId)).find((x) => x.code === (code ?? reasonCode));
}

// ------------------------------------------------------------------------------------------------ quy tắc

type RuleRow = {
  id: string; business_code: string; part: string; book: string; cond: RuleCond; debit_account: string | null; credit_account: string | null; priority: number;
  effective_from: string; effective_to: string | null; status: string; replaces_id: string | null; note: string; change_reason: string;
  created_by: string; created_at: string; approved_by: string | null; approved_at: string | null; rejected_note: string | null;
};
const RULE_COLS = sql`id::text, business_code, part, book, cond, debit_account, credit_account, priority, effective_from::text, effective_to::text, status, replaces_id::text,
  note, change_reason, created_by, created_at::text, approved_by, approved_at::text, rejected_note`;

const toRule = (r: RuleRow): PostingRule => ({
  id: r.id, business: r.business_code, part: r.part as RulePart, book: r.book as PostingRule['book'], cond: r.cond ?? {},
  debit: r.debit_account, credit: r.credit_account, priority: r.priority, from: r.effective_from, to: r.effective_to,
});

/** Trạng thái hiện cho người dùng: đề xuất / đang áp / sắp áp / đã đóng / từ chối. */
function stateOf(r: RuleRow, today: string): 'draft' | 'active' | 'scheduled' | 'closed' | 'rejected' {
  if (r.status === 'draft') return 'draft';
  if (r.status === 'rejected') return 'rejected';
  if (r.effective_to && r.effective_to <= today) return 'closed';
  return r.effective_from > today ? 'scheduled' : 'active';
}

export async function listRules(trx: Db, tenantId: string, q: { business?: string; state?: string } = {}) {
  const today = (await sql<{ d: string }>`SELECT current_date::text AS d`.execute(trx)).rows[0]!.d;
  const rows = (await sql<RuleRow>`SELECT ${RULE_COLS} FROM posting_rules WHERE tenant_id = ${tenantId}
    ${q.business ? sql`AND business_code = ${q.business}` : sql``} ORDER BY business_code, part, id`.execute(trx)).rows;
  const codes = [...new Set(rows.flatMap((r) => [r.debit_account, r.credit_account]).filter((c): c is string => Boolean(c)))];
  const names = new Map(codes.length ? (await sql<{ code: string; name: string }>`SELECT code, name FROM accounts WHERE tenant_id = ${tenantId} AND code = ANY(${codes})`.execute(trx)).rows.map((a) => [a.code, a.name]) : []);
  return rows.map((r) => ({
    id: r.id, business: r.business_code, part: r.part, partLabel: PART_LABEL[r.part as RulePart] ?? r.part, book: r.book, cond: r.cond ?? {},
    condText: condText(r.cond ?? {}), debit: r.debit_account, debitName: r.debit_account ? names.get(r.debit_account) ?? null : null,
    credit: r.credit_account, creditName: r.credit_account ? names.get(r.credit_account) ?? null : null, priority: r.priority,
    from: r.effective_from, to: r.effective_to, status: r.status, state: stateOf(r, today), replacesId: r.replaces_id, note: r.note, changeReason: r.change_reason,
    createdBy: r.created_by, createdAt: r.created_at, approvedBy: r.approved_by, approvedAt: r.approved_at, rejectedNote: r.rejected_note,
  })).filter((r) => !q.state || r.state === q.state);
}

/** Câu điều kiện cho người đọc: "Loại hàng = QUA · Hàng tặng". */
export function condText(c: RuleCond): string {
  const parts = condKeys(c).map((k) => {
    const v = c[k];
    if (k === 'gift') return v ? 'Hàng tặng' : 'Hàng bán (không tặng)';
    if (k === 'sameUnit') return v ? 'Cùng đơn vị hạch toán' : 'Khác đơn vị hạch toán';
    if (k === 'leg') return v === 'out' ? 'Bên xuất' : 'Bên nhận';
    return `${COND_LABEL[k]} = ${String(v)}`;
  });
  return parts.length ? parts.join(' · ') : 'Mọi trường hợp';
}

export interface RuleInput {
  business: string;
  part: RulePart;
  book?: 'all' | 'internal' | 'tax';
  cond?: RuleCond;
  debit?: string | null;
  credit?: string | null;
  priority?: number;
  from: string;
  note?: string;
  changeReason?: string;
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

async function validateRule(trx: Db, tenantId: string, i: RuleInput): Promise<{ cond: RuleCond; debit: string | null; credit: string | null }> {
  await ensureBusinesses(trx, tenantId);
  const biz = (await sql<{ code: string; base_code: string | null; is_active: boolean }>`SELECT code, base_code, is_active FROM posting_businesses WHERE tenant_id = ${tenantId} AND code = ${i.business}`.execute(trx)).rows[0];
  if (!biz) throw Errors.validation(`Nghiệp vụ ${i.business} không có`);
  const spec = specOf(biz.base_code ?? biz.code);
  const allowed = spec?.parts[i.part];
  if (!spec || !allowed) throw Errors.validation(`Nghiệp vụ ${i.business} không có khoản "${PART_LABEL[i.part] ?? i.part}"`);
  const cond = cleanCond(i.cond);
  const extra = condKeys(cond).filter((k) => !allowed.includes(k));
  if (extra.length) throw Errors.validation(`Khoản ${PART_LABEL[i.part]} của ${spec.name} không xét được điều kiện: ${extra.map((k) => COND_LABEL[k]).join(', ')}`);
  const debit = i.debit?.trim() || null;
  const credit = i.credit?.trim() || null;
  if (!debit && !credit) throw Errors.validation('Chọn ít nhất một tài khoản Nợ hoặc Có (ô trống = giữ tài khoản tự tra)');
  if (debit && debit === credit) throw Errors.validation('Nợ và Có cùng một tài khoản');
  const codes = [debit, credit].filter((x): x is string => Boolean(x));
  const accs = (await sql<{ code: string; is_posting: boolean; is_active: boolean }>`SELECT code, is_posting, is_active FROM accounts WHERE tenant_id = ${tenantId} AND code = ANY(${codes})`.execute(trx)).rows;
  for (const c of codes) {
    const a = accs.find((x) => x.code === c);
    if (!a) throw Errors.validation(`Tài khoản ${c} chưa có trong hệ thống tài khoản`);
    if (!a.is_posting) throw Errors.validation(`Tài khoản ${c} là tài khoản tổng hợp — chọn tài khoản chi tiết`);
    if (!a.is_active) throw Errors.validation(`Tài khoản ${c} đã ngừng dùng`);
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(i.from)) throw Errors.validation('Ngày hiệu lực theo dạng YYYY-MM-DD');
  const methodCodes = cond.method ? (await sql<{ code: string }>`SELECT code FROM payment_methods WHERE tenant_id = ${tenantId} AND code = ${cond.method}`.execute(trx)).rows : [{ code: '' }];
  if (!methodCodes.length) throw Errors.validation(`Hình thức thanh toán ${cond.method} chưa có`);
  if (cond.taxCode && !(await sql<{ code: string }>`SELECT code FROM tax_codes WHERE tenant_id = ${tenantId} AND code = ${cond.taxCode}`.execute(trx)).rows.length) throw Errors.validation(`Loại thuế ${cond.taxCode} chưa có`);
  if (cond.programKind && !(await sql<{ code: string }>`SELECT code FROM program_kinds WHERE tenant_id = ${tenantId} AND code = ${cond.programKind}`.execute(trx)).rows.length) throw Errors.validation(`Loại chương trình ${cond.programKind} chưa có`);
  return { cond, debit, credit };
}

async function rulesOf(trx: Db, tenantId: string, business: string, statuses: string[]): Promise<PostingRule[]> {
  return (await sql<RuleRow>`SELECT ${RULE_COLS} FROM posting_rules WHERE tenant_id = ${tenantId} AND business_code = ${business} AND status = ANY(${statuses})`.execute(trx)).rows.map(toRule);
}

function tieMessage(ties: PostingRule[]): string {
  return `Đụng quy tắc ${ties.map((t) => `#${t.id} (${condText(t.cond)})`).join(', ')}: cùng khớp một dòng với cùng số điều kiện, cùng ưu tiên — thêm điều kiện cho cụ thể hơn, hoặc đặt Ưu tiên khác`;
}

/** Đề xuất quy tắc mới, hoặc bản sửa của một quy tắc đang áp (replacesId). Trạng thái: chờ duyệt. */
export async function proposeRule(trx: Db, tenantId: string, actor: string, i: RuleInput & { replacesId?: string }) {
  const v = await validateRule(trx, tenantId, i);
  if (i.replacesId) {
    const old = (await sql<RuleRow>`SELECT ${RULE_COLS} FROM posting_rules WHERE tenant_id = ${tenantId} AND id = ${i.replacesId}`.execute(trx)).rows[0];
    if (!old || old.status !== 'active') throw Errors.validation(`Quy tắc #${i.replacesId} không phải quy tắc đang áp`);
    if (i.from <= old.effective_from) throw Errors.validation(`Bản sửa phải có hiệu lực sau ngày ${old.effective_from} (ngày hiệu lực của bản đang áp)`);
    if (old.business_code !== i.business || old.part !== i.part) throw Errors.validation('Bản sửa giữ nguyên nghiệp vụ và khoản tiền của quy tắc cũ');
  }
  const draft: PostingRule = { id: '0', business: i.business, part: i.part, book: i.book ?? 'all', cond: v.cond, debit: v.debit, credit: v.credit, priority: i.priority ?? 0, from: i.from, to: null };
  const ties = findTies(draft, await rulesOf(trx, tenantId, i.business, ['active']), i.replacesId ? [i.replacesId] : []);
  if (ties.length) throw Errors.validation(tieMessage(ties));
  const row = (await sql<{ id: string }>`
    INSERT INTO posting_rules (tenant_id, business_code, part, book, cond, debit_account, credit_account, priority, effective_from, status, replaces_id, note, change_reason, created_by)
    VALUES (${tenantId}, ${i.business}, ${i.part}, ${draft.book}, ${JSON.stringify(v.cond)}::jsonb, ${v.debit}, ${v.credit}, ${draft.priority}, ${i.from}::date, 'draft',
            ${i.replacesId ?? null}, ${i.note?.trim() ?? ''}, ${i.changeReason?.trim() ?? ''}, ${actor})
    RETURNING id::text`.execute(trx)).rows[0]!;
  await writeAudit(trx, { tenantId, actor, action: 'posting.rule.propose', objectType: 'posting_rule', objectId: row.id, after: { ...i, ...v } });
  return (await listRules(trx, tenantId, { business: i.business })).find((r) => r.id === row.id);
}

/** Sửa đề xuất chưa duyệt. */
export async function updateDraft(trx: Db, tenantId: string, actor: string, id: string, i: RuleInput) {
  const cur = (await sql<RuleRow>`SELECT ${RULE_COLS} FROM posting_rules WHERE tenant_id = ${tenantId} AND id = ${id} FOR UPDATE`.execute(trx)).rows[0];
  if (!cur) throw Errors.notFound(`quy tắc #${id}`);
  if (cur.status !== 'draft') throw Errors.validation('Chỉ sửa được đề xuất chờ duyệt. Quy tắc đã duyệt: đề xuất bản sửa (có ngày hiệu lực mới)');
  const v = await validateRule(trx, tenantId, i);
  const draft: PostingRule = { id, business: i.business, part: i.part, book: i.book ?? 'all', cond: v.cond, debit: v.debit, credit: v.credit, priority: i.priority ?? 0, from: i.from, to: null };
  const ties = findTies(draft, await rulesOf(trx, tenantId, i.business, ['active']), cur.replaces_id ? [cur.replaces_id] : []);
  if (ties.length) throw Errors.validation(tieMessage(ties));
  await sql`UPDATE posting_rules SET business_code = ${i.business}, part = ${i.part}, book = ${draft.book}, cond = ${JSON.stringify(v.cond)}::jsonb, debit_account = ${v.debit},
            credit_account = ${v.credit}, priority = ${draft.priority}, effective_from = ${i.from}::date, note = ${i.note?.trim() ?? ''}, change_reason = ${i.changeReason?.trim() ?? ''}, updated_at = now()
            WHERE tenant_id = ${tenantId} AND id = ${id}`.execute(trx);
  await writeAudit(trx, { tenantId, actor, action: 'posting.rule.update_draft', objectType: 'posting_rule', objectId: id, after: { ...i, ...v } });
  return (await listRules(trx, tenantId, { business: i.business })).find((r) => r.id === id);
}

/** Xoá đề xuất chưa duyệt (chưa áp vào chứng từ nào). Quy tắc đã duyệt không xoá — ngừng bằng ngày. */
export async function deleteDraft(trx: Db, tenantId: string, actor: string, id: string) {
  const cur = (await sql<RuleRow>`SELECT ${RULE_COLS} FROM posting_rules WHERE tenant_id = ${tenantId} AND id = ${id} FOR UPDATE`.execute(trx)).rows[0];
  if (!cur) throw Errors.notFound(`quy tắc #${id}`);
  if (cur.status !== 'draft' && cur.status !== 'rejected') throw Errors.validation('Quy tắc đã duyệt không xoá được (chứng từ cũ còn theo nó) — dùng Ngừng áp');
  await sql`DELETE FROM posting_rules WHERE tenant_id = ${tenantId} AND id = ${id}`.execute(trx);
  await writeAudit(trx, { tenantId, actor, action: 'posting.rule.delete_draft', objectType: 'posting_rule', objectId: id, before: { ...cur } });
  return { id, deleted: true };
}

/** Duyệt đề xuất: áp từ ngày hiệu lực; bản sửa thì đóng bản cũ ở ngày đó. Kiểm đụng lần cuối với quy tắc đang áp. */
export async function approveRule(trx: Db, tenantId: string, actor: string, id: string) {
  const cur = (await sql<RuleRow>`SELECT ${RULE_COLS} FROM posting_rules WHERE tenant_id = ${tenantId} AND id = ${id} FOR UPDATE`.execute(trx)).rows[0];
  if (!cur) throw Errors.notFound(`quy tắc #${id}`);
  if (cur.status !== 'draft') throw Errors.validation(`Quy tắc #${id} không ở trạng thái chờ duyệt`);
  await validateRule(trx, tenantId, { business: cur.business_code, part: cur.part as RulePart, book: cur.book as RuleInput['book'], cond: cur.cond, debit: cur.debit_account, credit: cur.credit_account, priority: cur.priority, from: cur.effective_from });
  const ties = findTies(toRule(cur), await rulesOf(trx, tenantId, cur.business_code, ['active']), cur.replaces_id ? [cur.replaces_id] : []);
  if (ties.length) throw Errors.validation(tieMessage(ties));
  if (cur.replaces_id) {
    const old = (await sql<RuleRow>`SELECT ${RULE_COLS} FROM posting_rules WHERE tenant_id = ${tenantId} AND id = ${cur.replaces_id} FOR UPDATE`.execute(trx)).rows[0];
    if (!old || old.status !== 'active') throw Errors.validation(`Quy tắc bị thay #${cur.replaces_id} không còn đang áp`);
    if (old.effective_to && old.effective_to <= cur.effective_from) { /* đã đóng trước ngày này: không cần đóng lại */ }
    else await sql`UPDATE posting_rules SET effective_to = ${cur.effective_from}::date, updated_at = now() WHERE tenant_id = ${tenantId} AND id = ${old.id}`.execute(trx);
  }
  await sql`UPDATE posting_rules SET status = 'active', approved_by = ${actor}, approved_at = now(), updated_at = now() WHERE tenant_id = ${tenantId} AND id = ${id}`.execute(trx);
  await writeAudit(trx, { tenantId, actor, action: 'posting.rule.approve', objectType: 'posting_rule', objectId: id, after: { business: cur.business_code, part: cur.part, from: cur.effective_from, replaces: cur.replaces_id, proposedBy: cur.created_by } });
  return (await listRules(trx, tenantId, { business: cur.business_code })).find((r) => r.id === id);
}

export async function rejectRule(trx: Db, tenantId: string, actor: string, id: string, note: string) {
  const cur = (await sql<RuleRow>`SELECT ${RULE_COLS} FROM posting_rules WHERE tenant_id = ${tenantId} AND id = ${id} FOR UPDATE`.execute(trx)).rows[0];
  if (!cur) throw Errors.notFound(`quy tắc #${id}`);
  if (cur.status !== 'draft') throw Errors.validation(`Quy tắc #${id} không ở trạng thái chờ duyệt`);
  if (!note.trim()) throw Errors.validation('Ghi lý do từ chối để người đề xuất biết sửa gì');
  await sql`UPDATE posting_rules SET status = 'rejected', rejected_note = ${note.trim()}, approved_by = ${actor}, approved_at = now(), updated_at = now() WHERE tenant_id = ${tenantId} AND id = ${id}`.execute(trx);
  await writeAudit(trx, { tenantId, actor, action: 'posting.rule.reject', objectType: 'posting_rule', objectId: id, after: { note } });
  return (await listRules(trx, tenantId, { business: cur.business_code })).find((r) => r.id === id);
}

/** Ngừng áp quy tắc đã duyệt từ một ngày (chứng từ trước ngày đó vẫn theo quy tắc). */
export async function stopRule(trx: Db, tenantId: string, actor: string, id: string, from: string, reason: string) {
  const cur = (await sql<RuleRow>`SELECT ${RULE_COLS} FROM posting_rules WHERE tenant_id = ${tenantId} AND id = ${id} FOR UPDATE`.execute(trx)).rows[0];
  if (!cur) throw Errors.notFound(`quy tắc #${id}`);
  if (cur.status !== 'active') throw Errors.validation('Chỉ ngừng được quy tắc đã duyệt');
  if (from <= cur.effective_from) throw Errors.validation(`Ngày ngừng phải sau ngày bắt đầu áp ${cur.effective_from}`);
  if (cur.effective_to && cur.effective_to <= from) throw Errors.validation(`Quy tắc đã đóng từ ${cur.effective_to}`);
  if (!reason.trim()) throw Errors.validation('Ghi lý do ngừng');
  await sql`UPDATE posting_rules SET effective_to = ${from}::date, updated_at = now() WHERE tenant_id = ${tenantId} AND id = ${id}`.execute(trx);
  await writeAudit(trx, { tenantId, actor, action: 'posting.rule.stop', objectType: 'posting_rule', objectId: id, after: { from, reason } });
  return (await listRules(trx, tenantId, { business: cur.business_code })).find((r) => r.id === id);
}

// ------------------------------------------------------------------------------------------------ lựa chọn cho màn khai báo

export async function ruleOptions(trx: Db, tenantId: string) {
  await ensureBusinesses(trx, tenantId);
  const [methods, taxes, types, kinds, programs] = await Promise.all([
    sql<{ code: string; name: string; account_code: string; is_receivable: boolean }>`SELECT code, name, account_code, is_receivable FROM payment_methods WHERE tenant_id = ${tenantId} AND is_active ORDER BY sort_order NULLS LAST, code`.execute(trx),
    sql<{ code: string; name: string; rate: string; direction: string }>`SELECT code, name, rate::text, direction FROM tax_codes WHERE tenant_id = ${tenantId} AND is_active ORDER BY direction, code`.execute(trx),
    sql<{ code: string; name: string }>`SELECT code, name FROM item_classes WHERE tenant_id = ${tenantId} AND kind = 'type' ORDER BY code`.execute(trx),
    sql<{ code: string; name: string; side: string; note: string }>`SELECT code, name, side, note FROM program_kinds WHERE tenant_id = ${tenantId} AND is_active ORDER BY sort_order, code`.execute(trx),
    sql<{ code: string; name: string; kind: string | null; side: string }>`
      SELECT code, name, program_kind AS kind, 'sale' AS side FROM sale_programs WHERE tenant_id = ${tenantId} AND is_active
      UNION ALL SELECT code, name, program_kind, 'purchase' FROM purchase_policies WHERE tenant_id = ${tenantId} AND is_active AND program_kind IS NOT NULL
      ORDER BY 1`.execute(trx),
  ]);
  return {
    businesses: BUSINESSES.map((b) => ({ code: b.code, name: b.name, area: b.area, parts: Object.entries(b.parts).map(([part, conds]) => ({ part, label: PART_LABEL[part as RulePart], conds })) })),
    condLabels: COND_LABEL,
    partLabels: PART_LABEL,
    methods: methods.rows.map((m) => ({ code: m.code, name: m.name, account: m.account_code, isReceivable: m.is_receivable })),
    taxes: taxes.rows.map((t) => ({ code: t.code, name: t.name, rate: Number(t.rate), direction: t.direction })),
    itemTypes: types.rows,
    variants: (await listVariantKinds(trx, tenantId)).filter((v) => v.isActive).map((v) => ({ code: v.code, name: v.name })),
    programKinds: kinds.rows,
    programs: programs.rows,
  };
}

// ------------------------------------------------------------------------------------------------ chạy thử

export interface SampleInput {
  business: string;
  sku?: string;
  itemType?: string;
  taxCode?: string;
  method?: string;
  gift?: boolean;
  program?: string;
  amount?: number;
  cost?: number;
  sameUnit?: boolean;
  date?: string;
  /** Quy tắc đề xuất cần thử (chưa duyệt): áp như đã duyệt. */
  draftId?: string;
  draft?: RuleInput;
}

const SIDE_LABEL: Record<string, string> = {
  sale: 'Bán hàng', sale_return: 'Khách trả hàng', purchase: 'Nhập mua', purchase_return: 'Trả NCC', transfer: 'Chuyển kho',
  stock_increase: 'Nhập điều chỉnh', stock_decrease: 'Xuất điều chỉnh', customer_payment: 'Thu tiền', supplier_payment: 'Chi tiền',
};

/**
 * Định khoản thử một phiếu mẫu của nghiệp vụ bằng bộ định khoản thật. Trả từng cặp Nợ / Có: tài khoản tự tra (trước quy tắc),
 * tài khoản sau quy tắc, quy tắc nào thắng và các quy tắc khác cũng khớp; kèm giá trị điều kiện của phiếu mẫu (để vẽ sơ đồ).
 */
export async function simulateRules(trx: Db, tenantId: string, s: SampleInput) {
  await ensureBusinesses(trx, tenantId);
  const biz = (await sql<{ code: string; name: string; base_code: string | null; reason_code: string | null }>`SELECT code, name, base_code, reason_code FROM posting_businesses WHERE tenant_id = ${tenantId} AND code = ${s.business}`.execute(trx)).rows[0];
  if (!biz) throw Errors.validation(`Nghiệp vụ ${s.business} không có`);
  const base = biz.base_code ?? biz.code;
  const spec = specOf(base);
  if (!spec) throw Errors.validation(`Nghiệp vụ ${biz.name} chưa chạy thử được`);
  const date = s.date ?? (await sql<{ d: string }>`SELECT current_date::text AS d`.execute(trx)).rows[0]!.d;
  const branch = (await sql<{ id: string; code: string }>`SELECT id::text, code FROM branches WHERE tenant_id = ${tenantId} ORDER BY id LIMIT 1`.execute(trx)).rows[0];
  if (!branch) throw Errors.validation('Chưa có chi nhánh nào');
  const product = s.sku
    ? (await sql<{ sku: string; name: string; type_code: string | null; tax_out_code: string | null; tax_in_code: string | null }>`SELECT sku, name, type_code, tax_out_code, tax_in_code FROM products WHERE tenant_id = ${tenantId} AND sku = ${s.sku}`.execute(trx)).rows[0]
    : (await sql<{ sku: string; name: string; type_code: string | null; tax_out_code: string | null; tax_in_code: string | null }>`
        SELECT sku, name, type_code, tax_out_code, tax_in_code FROM products WHERE tenant_id = ${tenantId} AND is_active AND NOT is_draft
           AND type_code IS NOT DISTINCT FROM ${s.itemType ?? 'HANG-BAN'} ORDER BY (variant_code = 'normal') DESC, sku LIMIT 1`.execute(trx)).rows[0]
      ?? (await sql<{ sku: string; name: string; type_code: string | null; tax_out_code: string | null; tax_in_code: string | null }>`SELECT sku, name, type_code, tax_out_code, tax_in_code FROM products WHERE tenant_id = ${tenantId} ORDER BY sku LIMIT 1`.execute(trx)).rows[0];
  const sku = product?.sku ?? 'MAU';
  const input = base === 'purchase' || base === 'purchase_return';
  const taxes = (await sql<{ code: string; rate: string; direction: string }>`SELECT code, rate::text, direction FROM tax_codes WHERE tenant_id = ${tenantId} AND is_active`.execute(trx)).rows;
  const wantDir = input ? 'input' : 'output';
  const taxCode = s.taxCode ?? (input ? product?.tax_in_code : product?.tax_out_code) ?? taxes.find((t) => t.direction === wantDir && Number(t.rate) === 8)?.code ?? taxes.find((t) => t.direction === wantDir)?.code ?? 'KCT';
  const rate = Number(taxes.find((t) => t.code === taxCode)?.rate ?? 0);
  const methods = (await sql<{ code: string; is_receivable: boolean }>`SELECT code, is_receivable FROM payment_methods WHERE tenant_id = ${tenantId} AND is_active ORDER BY sort_order NULLS LAST, code`.execute(trx)).rows;
  const method = s.method ?? methods.find((m) => !m.is_receivable)?.code;
  const A = s.gift ? 0 : s.amount ?? 1_000_000;
  const T = Math.round((A * rate) / 100);
  const COST = s.cost ?? 700_000;
  const reasonCode = biz.reason_code ?? undefined;
  const program = s.program?.trim() || undefined;
  const line = { lineKey: '1', sku, name: product?.name ?? sku, qty: 1, unitPrice: A, amountBeforeTax: A, taxCode, taxAmount: T, isGift: Boolean(s.gift), ...(program ? { policyRef: { key: program, version: 1 } } : {}) };
  const head = { docKey: 'chay-thu', branchCode: branch.code, docNo: 'MAU-01', docDate: date, reasonCode };
  const stock = { branchId: branch.id, branchCode: branch.code, branchPartnerId: '0', sameAccountingUnit: s.sameUnit ?? true };

  const docs: { doc: Record<string, unknown>; label: string }[] = [];
  switch (base) {
    case 'sale': case 'sale_return': case 'purchase': case 'purchase_return':
      docs.push({ label: SIDE_LABEL[base]!, doc: { ...head, docType: base, lines: [{ ...line, cost: base.startsWith('sale') ? COST : undefined }], payments: method && A ? [{ methodCode: method, amount: A + T }] : [], totals: { beforeTax: A, tax: T, total: A + T } } });
      break;
    case 'transfer':
      for (const leg of ['out', 'in'] as const) docs.push({ label: leg === 'out' ? 'Bên xuất' : 'Bên nhận', doc: { ...head, docType: 'transfer', leg, lines: [{ lineKey: '1', sku, qty: 1, amount: COST }], totals: { total: COST } } });
      break;
    case 'stock_increase': case 'stock_decrease':
      docs.push({ label: SIDE_LABEL[base]!, doc: { ...head, docType: 'stock_adjustment', direction: base === 'stock_increase' ? 'increase' : 'decrease', lines: [{ lineKey: '1', sku, qty: base === 'stock_increase' ? 1 : -1, amount: COST }], totals: { total: COST } } });
      break;
    case 'customer_payment': case 'supplier_payment':
      if (!method) throw Errors.validation('Chưa có hình thức thanh toán nào');
      docs.push({ label: SIDE_LABEL[base]!, doc: { ...head, docType: base, methodCode: method, lines: [], totals: { total: s.amount ?? 1_000_000 } } });
      break;
  }

  // Quy tắc đề xuất cần thử: thêm vào bảng như đã duyệt (thay bản nó sửa).
  let tryRule: PostingRule | null = null;
  if (s.draftId) {
    const r = (await sql<RuleRow>`SELECT ${RULE_COLS} FROM posting_rules WHERE tenant_id = ${tenantId} AND id = ${s.draftId}`.execute(trx)).rows[0];
    if (!r) throw Errors.notFound(`quy tắc #${s.draftId}`);
    tryRule = { ...toRule(r), from: date <= r.effective_from ? date : r.effective_from };
    if (r.replaces_id) tryRule = { ...tryRule, id: r.id };
  } else if (s.draft) {
    const v = await validateRule(trx, tenantId, s.draft);
    tryRule = { id: 'thu', business: s.draft.business, part: s.draft.part, book: s.draft.book ?? 'all', cond: v.cond, debit: v.debit, credit: v.credit, priority: s.draft.priority ?? 0, from: date, to: null };
  }
  const replaced = s.draftId ? (await sql<{ replaces_id: string | null }>`SELECT replaces_id::text FROM posting_rules WHERE tenant_id = ${tenantId} AND id = ${s.draftId}`.execute(trx)).rows[0]?.replaces_id ?? null : null;
  const withDraft = tryRule ? (t: RuleTable): RuleTable => ({ ...t, rules: [...t.rules.filter((x) => x.id !== replaced && x.id !== tryRule!.id), tryRule!] }) : undefined;

  const entries: SimEntry[] = [];
  const errors: string[] = [];
  let context: Record<string, unknown> = {};
  let accountNames = new Map<string, string>();
  let table: RuleTable | null = null;
  for (const [di, d] of docs.entries()) {
    let doc: IngestDocument;
    try { doc = ingestDocumentSchema.parse(d.doc); } catch (e) { errors.push(`Phiếu mẫu ${d.label}: ${(e as Error).message}`); continue; }
    try {
      const r = await simulatePosting(trx, tenantId, doc, { partnerId: null, stock, actor: 'simulate', table: withDraft });
      table = r.table;
      accountNames = new Map([...r.accounts.values()].map((a) => [a.code, a.name]));
      r.tagged.forEach((part, pi) => {
        const pairs = new Map<number, typeof part.lines>();
        for (const l of part.lines) pairs.set(l.pairNo, [...(pairs.get(l.pairNo) ?? []), l]);
        for (const [pairNo, ls] of pairs) {
          const [a, b] = ls as [typeof ls[number], typeof ls[number]];
          const after = r.parts[pi]!.lines.filter((x) => x.pairNo === pairNo);
          const tags = a.ruleTags;
          const swapped = Boolean(tags?.swapped);
          const ctx = tags ? contextOf(tags, a, r.table) : {};
          if (!Object.keys(context).length && tags) context = { ...ctx, business: tags.biz, reason: tags.reason ?? null };
          const pick = tags ? pickRule(r.table, { biz: tags.biz, reason: tags.reason, part: a.part, book: 'internal', date, ctx }) : null;
          const [dBefore, cBefore] = swapped ? [b, a] : [a, b];
          const [dAfter, cAfter] = swapped ? [after[1]!, after[0]!] : [after[0]!, after[1]!];
          entries.push({
            key: `${di}-${pi}-${pairNo}`, group: d.label, part: a.part, partLabel: PART_LABEL[a.part as RulePart] ?? a.part, label: a.description ?? '', amount: Math.max(a.debit, a.credit, b.debit, b.credit),
            debit: { auto: dBefore.accountCode, account: dAfter.accountCode },
            credit: { auto: cBefore.accountCode, account: cAfter.accountCode },
            ruleId: pick?.rule?.id ?? null, candidates: pick?.candidates.map((c) => c.id) ?? [], ties: pick?.ties.map((c) => c.id) ?? [],
            note: a.part === 'cogs' && base.startsWith('sale') ? 'Ghi ở phiếu giá vốn cuối tháng (cùng quy tắc)' : undefined,
          });
        }
      });
    } catch (e) {
      const err = e as { message?: string; details?: unknown };
      errors.push(`${d.label}: ${err.message ?? String(e)}${Array.isArray(err.details) ? ` — ${err.details.join('; ')}` : ''}`);
    }
  }
  const ruleIds = [...new Set(entries.flatMap((e) => e.candidates))];
  const rules = ruleIds.length ? (await listRules(trx, tenantId)).filter((r) => ruleIds.includes(r.id)) : [];
  if (tryRule && tryRule.id === 'thu') rules.push({ id: 'thu', business: tryRule.business, part: tryRule.part, partLabel: PART_LABEL[tryRule.part], book: tryRule.book, cond: tryRule.cond, condText: condText(tryRule.cond), debit: tryRule.debit, debitName: null, credit: tryRule.credit, creditName: null, priority: tryRule.priority, from: tryRule.from, to: null, status: 'draft', state: 'draft', replacesId: null, note: 'Đang thử', changeReason: '', createdBy: '', createdAt: '', approvedBy: null, approvedAt: null, rejectedNote: null });
  const name = (c: string) => accountNames.get(c) ?? null;
  const debit = entries.reduce((x, e) => x + e.amount, 0);
  return {
    business: { code: biz.code, name: biz.name, base, reasonCode: biz.reason_code },
    sample: { sku, name: product?.name ?? sku, itemType: product?.type_code ?? null, taxCode, taxRate: rate, method: method ?? null, gift: Boolean(s.gift), program: program ?? null, amount: A, tax: T, cost: COST, sameUnit: s.sameUnit ?? true, date, branchCode: branch.code },
    context: { ...context, programKind: program ? table?.programKinds.get(program) ?? null : null },
    entries: entries.map((e) => ({ ...e, debit: { ...e.debit, name: name(e.debit.account), autoName: name(e.debit.auto) }, credit: { ...e.credit, name: name(e.credit.account), autoName: name(e.credit.auto) } })),
    rules,
    totals: { debit, credit: debit, balanced: !errors.length },
    errors,
  };
}

interface SimEntry {
  key: string; group: string; part: string; partLabel: string; label: string; amount: number;
  debit: { auto: string; account: string }; credit: { auto: string; account: string };
  ruleId: string | null; candidates: string[]; ties: string[]; note?: string;
}

// ------------------------------------------------------------------------------------------------ định khoản ngầm định thêm ở ACC41
// [2026-11-11 Nguyễn Văn Thủy] PHASE-026 — Tài khoản ngầm định kiểu danh sách theo loại chứng từ: dòng thêm = quy tắc ưu tiên thấp, sửa tại chỗ (đóng góp)
/**
 * Dòng "Thêm tài khoản ngầm định" ở ACC41: một quy tắc ĐÃ DUYỆT, ưu tiên -10 (quy tắc ACC92 cùng mức điều kiện thắng), áp mọi ngày.
 * Khác quy tắc ACC92: không qua đề xuất / duyệt, sửa / xoá tại chỗ như danh mục (ghi nhật ký). Nhận ra bằng change_reason = DEFAULT_MARK.
 */
export const DEFAULT_MARK = 'Tài khoản ngầm định (ACC41)';
export const DEFAULT_PRIORITY = -10;
export interface DefaultEntryInput { business: string; part: RulePart; cond?: RuleCond; debit?: string | null; credit?: string | null; name: string }

export async function listDefaultEntries(trx: Db, tenantId: string) {
  return (await listRules(trx, tenantId)).filter((r) => r.changeReason === DEFAULT_MARK && r.status === 'active' && !r.to);
}

export async function saveDefaultEntry(trx: Db, tenantId: string, actor: string, id: string | null, i: DefaultEntryInput) {
  if (!i.name?.trim()) throw Errors.validation('Nhập tên định khoản');
  const input: RuleInput = { business: i.business, part: i.part, cond: i.cond, debit: i.debit, credit: i.credit, priority: DEFAULT_PRIORITY, from: '2000-01-01', note: i.name.trim(), changeReason: DEFAULT_MARK };
  const v = await validateRule(trx, tenantId, input);
  const draft: PostingRule = { id: id ?? '0', business: i.business, part: i.part, book: 'all', cond: v.cond, debit: v.debit, credit: v.credit, priority: DEFAULT_PRIORITY, from: '2000-01-01', to: null };
  const ties = findTies(draft, await rulesOf(trx, tenantId, i.business, ['active']), id ? [id] : []);
  if (ties.length) throw Errors.validation(`Trùng định khoản đã có: ${ties.map((t) => condText(t.cond)).join(', ')} — thêm điều kiện cho khác đi`);
  if (id) {
    const cur = (await sql<RuleRow>`SELECT ${RULE_COLS} FROM posting_rules WHERE tenant_id = ${tenantId} AND id = ${id} FOR UPDATE`.execute(trx)).rows[0];
    if (!cur || cur.change_reason !== DEFAULT_MARK) throw Errors.notFound('định khoản ngầm định');
    await sql`UPDATE posting_rules SET business_code = ${i.business}, part = ${i.part}, cond = ${JSON.stringify(v.cond)}::jsonb, debit_account = ${v.debit}, credit_account = ${v.credit},
                     note = ${input.note!}, updated_at = now() WHERE tenant_id = ${tenantId} AND id = ${id}`.execute(trx);
    await writeAudit(trx, { tenantId, actor, action: 'posting.default-entry.update', objectType: 'posting_rule', objectId: id, before: { cond: cur.cond, debit: cur.debit_account, credit: cur.credit_account, note: cur.note }, after: { ...i, ...v } });
    return (await listDefaultEntries(trx, tenantId)).find((r) => r.id === id);
  }
  const row = (await sql<{ id: string }>`
    INSERT INTO posting_rules (tenant_id, business_code, part, book, cond, debit_account, credit_account, priority, effective_from, status, note, change_reason, created_by, approved_by, approved_at)
    VALUES (${tenantId}, ${i.business}, ${i.part}, 'all', ${JSON.stringify(v.cond)}::jsonb, ${v.debit}, ${v.credit}, ${DEFAULT_PRIORITY}, DATE '2000-01-01', 'active', ${input.note!}, ${DEFAULT_MARK}, ${actor}, ${actor}, now())
    RETURNING id::text`.execute(trx)).rows[0]!;
  await writeAudit(trx, { tenantId, actor, action: 'posting.default-entry.create', objectType: 'posting_rule', objectId: row.id, after: { ...i, ...v } });
  return (await listDefaultEntries(trx, tenantId)).find((r) => r.id === row.id);
}

export async function deleteDefaultEntry(trx: Db, tenantId: string, actor: string, id: string) {
  const cur = (await sql<RuleRow>`SELECT ${RULE_COLS} FROM posting_rules WHERE tenant_id = ${tenantId} AND id = ${id} FOR UPDATE`.execute(trx)).rows[0];
  if (!cur || cur.change_reason !== DEFAULT_MARK) throw Errors.notFound('định khoản ngầm định');
  await sql`DELETE FROM posting_rules WHERE tenant_id = ${tenantId} AND id = ${id}`.execute(trx);
  await writeAudit(trx, { tenantId, actor, action: 'posting.default-entry.delete', objectType: 'posting_rule', objectId: id, before: { business: cur.business_code, part: cur.part, cond: cur.cond, debit: cur.debit_account, credit: cur.credit_account, note: cur.note } });
  return { id, deleted: true };
}
