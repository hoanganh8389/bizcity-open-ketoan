// @bizcity-layer K kernel/closing
/**
 * Kết chuyển lãi lỗ cuối kỳ.
 *
 * Mỗi (chi nhánh, kỳ tháng) có MỘT chứng từ kết chuyển (docKey = closing:<chi nhánh>:<YYYY-MM>;
 * khoá cũ: closing:<internal|tax>:<chi nhánh>:<YYYY-MM>, gặp thì đảo bút toán và huỷ),
 * sinh một bút toán loại 'closing' ghi ngày cuối kỳ. Kết chuyển lại: bút toán cũ được đảo bằng ghi số âm
 * rồi ghi bút toán mới (không cần xoá tay).
 *
 * Cách tính (theo danh sách bút toán kết chuyển mẫu, chạy THEO THỨ TỰ):
 *   1. Lấy phát sinh Nợ, Có trong kỳ của từng tài khoản chi tiết — KHÔNG tính các bút toán kết chuyển.
 *   2. Với từng bút toán mẫu: gom các tài khoản có số bắt đầu bằng "từ tài khoản", kể cả số vừa sinh
 *      ở các bước trước (nhờ vậy giảm trừ doanh thu về 511 trước, rồi 511 mới sang 911 theo số thuần):
 *        - kiểu Nợ    : Nợ đích / Có nguồn = Nợ − Có
 *        - kiểu Có    : Nợ nguồn / Có đích = Có − Nợ
 *        - kiểu số dư : Có − Nợ > 0 → Nợ nguồn / Có đích; ngược lại Nợ đích / Có nguồn (trị tuyệt đối)
 *      Kết quả âm (tài khoản dư ngược chiều) thì đổi bên thay vì ghi số âm.
 *   3. Không sinh dòng nào thì không ghi gì (và huỷ chứng từ kết chuyển cũ nếu có).
 *
 * Kiểm soát:
 *   - Bộ quy tắc được kiểm tra khi lưu và khi chạy (validateRules): chỉ kết chuyển từ loại 5–8, 154, 911; đích chỉ là
 *     154, 155, 5xx, 632x, 911, 421x; bước đổ vào nguồn của bước khác phải chạy trước; đúng một bước 911 → 421x chạy sau cùng.
 *   - Mỗi lần lưu bộ quy tắc khác bộ đang dùng thêm một phiên bản (closing_rule_versions); chứng từ kết chuyển chụp
 *     lại bộ quy tắc, số phiên bản, dấu vân tay số liệu nguồn (sources) để truy vết và phát hiện kết chuyển lỗi thời.
 *   - Kết chuyển tuần tự: tháng trước (cùng năm) còn số doanh thu, chi phí chưa kết chuyển thì không kết chuyển tháng sau.
 *   - Sau khi ghi: 911 phải hết số dư (không thì huỷ cả lần chạy); loại 5–8 còn số dư thì báo (residuals).
 *
 * Kỳ đã khoá cho loại chứng từ "Kết chuyển" thì không kết chuyển, không huỷ được.
 */
import { createHash } from 'node:crypto';
import { fromCents, toCents, type ClosingMode, type ClosingRule, type ClosingRunInput, type YearEndRunInput } from '@ketoan/contracts';
import { sql } from 'kysely';
import { db, toNumber, type Db } from '../../db/client.js';
import { Errors } from '../../core/errors.js';
import { writeAudit } from '../../core/audit.js';
import type { AuthContext } from '../../core/auth.js';
import type { Account } from '../../db/types.js';
import { accountRepository } from '../accounts/account.repository.js';
import { documentRepository } from '../documents/document.repository.js';
import { ledgerRepository } from '../ledger/ledger.repository.js';
import { ledgerService } from '../ledger/ledger.service.js';
import type { DraftLine } from '../ledger/ledger.types.js';

/**
 * Bộ bút toán kết chuyển mặc định (đơn vị chưa khai riêng thì dùng bộ này), chạy theo thứ tự seq:
 * chi phí sản xuất về 154 rồi 154 về giá vốn; giảm trừ doanh thu về doanh thu; doanh thu, giá vốn,
 * thu nhập và chi phí sang 911; cuối cùng 911 sang lợi nhuận chưa phân phối (lấy cả số dư đầu kỳ).
 */
export const DEFAULT_CLOSING_RULES: ClosingRule[] = [
  { seq: 0, fromAccount: '621', toAccount: '154', mode: 'debit', description: 'Kết chuyển chi phí nguyên vật liệu sản xuất dịch vụ', isActive: true, includeOpening: false },
  { seq: 0, fromAccount: '711', toAccount: '911', mode: 'balance', description: 'Kết chuyển thu nhập khác', isActive: true, includeOpening: false },
  { seq: 0, fromAccount: '811', toAccount: '911', mode: 'debit', description: 'Kết chuyển chi phí khác', isActive: true, includeOpening: false },
  { seq: 10, fromAccount: '154', toAccount: '6324', mode: 'debit', description: 'Ghi nhận giá vốn dịch vụ sản xuất', isActive: true, includeOpening: false },
  { seq: 74, fromAccount: '5211', toAccount: '51111', mode: 'debit', description: 'Kết chuyển chiết khấu thương mại', isActive: true, includeOpening: false },
  { seq: 75, fromAccount: '5212', toAccount: '51111', mode: 'debit', description: 'Kết chuyển giảm giá hàng bán', isActive: true, includeOpening: false },
  { seq: 77, fromAccount: '5213', toAccount: '51111', mode: 'debit', description: 'Kết chuyển hàng bán bị trả lại', isActive: true, includeOpening: false },
  { seq: 80, fromAccount: '511', toAccount: '911', mode: 'credit', description: 'Kết chuyển doanh thu bán hàng', isActive: true, includeOpening: false },
  { seq: 85, fromAccount: '632', toAccount: '911', mode: 'debit', description: 'Kết chuyển giá vốn hàng bán', isActive: true, includeOpening: false },
  { seq: 87, fromAccount: '515', toAccount: '911', mode: 'credit', description: 'Kết chuyển doanh thu hoạt động tài chính', isActive: true, includeOpening: false },
  { seq: 90, fromAccount: '635', toAccount: '911', mode: 'debit', description: 'Kết chuyển chi phí hoạt động tài chính', isActive: true, includeOpening: false },
  { seq: 93, fromAccount: '821', toAccount: '911', mode: 'debit', description: 'Kết chuyển chi phí thuế thu nhập doanh nghiệp', isActive: true, includeOpening: false },
  { seq: 94, fromAccount: '641', toAccount: '911', mode: 'debit', description: 'Kết chuyển chi phí bán hàng', isActive: true, includeOpening: false },
  { seq: 95, fromAccount: '642', toAccount: '911', mode: 'debit', description: 'Kết chuyển chi phí quản lý doanh nghiệp', isActive: true, includeOpening: false },
  { seq: 100, fromAccount: '911', toAccount: '4212', mode: 'balance', description: 'Kết chuyển lãi, lỗ', isActive: true, includeOpening: true },
];

/** Đầu số được kết chuyển ĐI: doanh thu, chi phí (loại 5–8), chi phí sản xuất dở dang 154, xác định kết quả 911. */
const SOURCE_PREFIXES = ['5', '6', '7', '8', '154', '911'];
/** Đầu số được kết chuyển ĐẾN: 154, 155 (sản xuất), 5xx (nhận giảm trừ), 632x (giá vốn), 911, 421x (lợi nhuận). */
const TARGET_PREFIXES = ['154', '155', '5', '632', '911', '421'];
const PROFIT_PREFIX = '421';
const RESULT_PREFIX = '911';

const startsAny = (code: string, prefixes: string[]) => prefixes.some((p) => code.startsWith(p));
/** Tài khoản phải hết số dư sau kết chuyển: doanh thu, chi phí (loại 5–8) và 911. */
export const isProfitLossAccount = (code: string) => /^[5-8]/.test(code) || code.startsWith(RESULT_PREFIX);
const tracksPartner = (a: Account | undefined) => Boolean(a && (a.track_partner || a.is_debt || a.normal_side === 'both'));
const sha256 = (s: string) => createHash('sha256').update(s).digest('hex');

/** Thứ tự chạy: seq rồi đầu số nguồn (giống thứ tự đọc từ bảng closing_rules). */
export function orderRules(rules: ClosingRule[]): ClosingRule[] {
  return [...rules].sort((a, b) => a.seq - b.seq || (a.fromAccount < b.fromAccount ? -1 : a.fromAccount > b.fromAccount ? 1 : 0));
}

/** Mã băm của bộ quy tắc (không phụ thuộc thứ tự nhập): cùng nội dung thì cùng mã. */
export function hashRules(rules: ClosingRule[]): string {
  return sha256(JSON.stringify(orderRules(rules).map((r) => [r.seq, r.fromAccount, r.toAccount, r.mode, r.description, r.isActive, r.includeOpening])));
}

export interface RuleCheck {
  /** Lỗi: không cho lưu, không cho kết chuyển. */
  errors: string[];
  /** Cảnh báo: vẫn cho lưu, hiện để kế toán xem lại. */
  warnings: string[];
}

/**
 * Kiểm tra bộ bút toán kết chuyển mẫu. Dùng chung khi lưu ('save'), khi xem danh sách và trước mỗi lần kết chuyển ('run').
 * Khi chạy, bước có đầu số nguồn không khớp tài khoản nào trong danh mục không bao giờ sinh dòng nên chỉ cảnh báo
 * (bộ mặc định có 621, 154… mà danh mục của đơn vị có thể không có); khi lưu thì là lỗi như trước.
 */
export function validateRules(rules: ClosingRule[], accounts: Map<string, Account>, mode: 'save' | 'run' = 'run'): RuleCheck {
  const errors: string[] = [];
  const warnings: string[] = [];
  const codes = [...accounts.keys()];
  const name = (r: ClosingRule) => `${r.fromAccount} → ${r.toAccount}`;

  rules.forEach((r, i) => {
    const at = `Dòng ${i + 1} (${name(r)})`;
    const hasSource = codes.some((c) => c.startsWith(r.fromAccount));
    if (!hasSource) {
      if (mode === 'save') errors.push(`${at}: không có tài khoản nào bắt đầu bằng ${r.fromAccount}`);
      else if (r.isActive) warnings.push(`${at}: danh mục không có tài khoản nào bắt đầu bằng ${r.fromAccount}, bước này không có tác dụng`);
    }
    const t = accounts.get(r.toAccount);
    if (hasSource || mode === 'save') {
      if (!t) errors.push(`${at}: tài khoản đích ${r.toAccount} không có trong danh mục`);
      else if (!t.is_posting) errors.push(`${at}: tài khoản đích ${r.toAccount} là tài khoản tổng hợp, hãy khai tài khoản chi tiết`);
      else if (tracksPartner(t)) errors.push(`${at}: tài khoản đích ${r.toAccount} đang theo dõi đối tượng, không dùng làm tài khoản đích được`);
    }
    if (!r.isActive) return;
    if (!startsAny(r.fromAccount, SOURCE_PREFIXES)) errors.push(`${at}: chỉ kết chuyển từ tài khoản doanh thu, chi phí (loại 5–8), 154 hoặc 911; không kết chuyển ${r.fromAccount}`);
    if (!startsAny(r.toAccount, TARGET_PREFIXES)) errors.push(`${at}: tài khoản đích chỉ được là 154, 155, 5xx, 632x, 911 hoặc 421x; không dùng ${r.toAccount}`);
    if (r.toAccount.startsWith(r.fromAccount)) errors.push(`${at}: tài khoản đích nằm trong đầu số nguồn ${r.fromAccount}`);
    const revenue = (r.fromAccount.startsWith('5') && !r.fromAccount.startsWith('521')) || r.fromAccount.startsWith('7');
    const expense = /^[68]/.test(r.fromAccount) || r.fromAccount.startsWith('521') || r.fromAccount.startsWith('154');
    if (revenue && r.mode === 'debit') warnings.push(`${at}: ${r.fromAccount} là doanh thu, thu nhập nhưng chọn kết chuyển bên Nợ`);
    if (expense && r.mode === 'credit') warnings.push(`${at}: ${r.fromAccount} là chi phí, giảm trừ nhưng chọn kết chuyển bên Có`);
    if (r.includeOpening && !r.fromAccount.startsWith(RESULT_PREFIX)) warnings.push(`${at}: "Lấy số dư đầu" chỉ nên bật cho bước 911 → 421`);
  });

  const active = orderRules(rules.filter((r) => r.isActive));
  // Bước sau không được đổ số vào đầu số mà bước trước đã kết chuyển hết (số đó sẽ treo lại).
  for (let i = 0; i < active.length; i++) {
    for (let j = i + 1; j < active.length; j++) {
      const [a, b] = [active[i]!, active[j]!];
      if (b.toAccount.startsWith(a.fromAccount)) {
        errors.push(`Bước ${name(b)} (thứ tự ${b.seq}) đổ số vào ${b.toAccount} nhưng ${a.fromAccount} đã kết chuyển ở bước ${name(a)} (thứ tự ${a.seq}); hãy đặt ${name(b)} chạy trước`);
      }
    }
  }
  const profit = active.filter((r) => r.toAccount.startsWith(PROFIT_PREFIX));
  if (profit.length !== 1) {
    errors.push(profit.length ? `Có ${profit.length} bước kết chuyển vào ${PROFIT_PREFIX}x; chỉ được một bước 911 → 421x` : 'Chưa có bước kết chuyển lãi lỗ 911 → 421x đang áp dụng');
  } else {
    const p = profit[0]!;
    if (!p.fromAccount.startsWith(RESULT_PREFIX)) errors.push(`Bước kết chuyển lãi lỗ phải đi từ 911, không từ ${p.fromAccount}`);
    if (p.mode !== 'balance') errors.push('Bước kết chuyển lãi lỗ 911 → 421x phải là kiểu "Hai chiều (theo số dư)"');
    if (!p.includeOpening) errors.push('Bước kết chuyển lãi lỗ 911 → 421x phải bật "Lấy số dư đầu" để 911 không còn số treo từ kỳ trước');
    if (active.at(-1) !== p) errors.push('Bước kết chuyển lãi lỗ 911 → 421x phải chạy sau cùng (thứ tự lớn nhất)');
  }

  const sources = active.map((r) => r.fromAccount);
  const uncovered = [...accounts.values()].filter((a) => a.is_posting && /^[5-8]/.test(a.code) && !startsAny(a.code, sources)).map((a) => a.code).sort();
  if (uncovered.length) {
    warnings.push(`Tài khoản doanh thu, chi phí chưa có bước kết chuyển (phát sinh sẽ còn số dư): ${uncovered.slice(0, 30).join(', ')}${uncovered.length > 30 ? ` và ${uncovered.length - 30} tài khoản khác` : ''}`);
  }
  return { errors: [...new Set(errors)], warnings: [...new Set(warnings)] };
}

export interface ClosingLine {
  debitAccount: string;
  creditAccount: string;
  amount: number;
  description: string;
  partnerId: string | null;
  /** Khoản mục, phòng ban, hợp đồng của tài khoản nguồn (giữ nguyên khi kết chuyển, như HTsoft). */
  costItem: string;
  department: string;
  contract: string;
  /** Bước kết chuyển sinh ra dòng: kiểu (Bên Nợ / Bên Có / tự xác định) và "kết chuyển số dư cuối" (cột Kiểu, Số dư cuối kỳ của HTsoft). */
  mode: ClosingMode;
  includeOpening: boolean;
}
/** Tài khoản doanh thu, chi phí, 911 còn số dư sau kết chuyển (balance: Nợ dương, Có âm). */
export interface ClosingResidual {
  account: string;
  balance: number;
  /** no-rule: không có bước kết chuyển nào cho tài khoản này; prior-period: số dư từ trước kỳ (kỳ trước chưa kết chuyển, số dư đầu…). */
  reason: 'no-rule' | 'prior-period';
}
/** Dấu vân tay số liệu nguồn của một lần kết chuyển: truy vết và phát hiện số liệu đổi sau khi kết chuyển. */
export interface ClosingSources {
  /** Thời điểm chốt số (giờ máy chủ CSDL). Bút toán nguồn = bút toán trong kỳ, tạo không muộn hơn thời điểm này. */
  asOf: string;
  entryCount: number;
  fingerprint: string;
  openingFingerprint: string;
  byAccount: { account: string; debit: number; credit: number }[];
}
export type StaleReason = 'data' | 'opening' | 'rules';
export interface ClosingPreview {
  branchCode: string;
  branchName: string;
  lines: ClosingLine[];
  total: number;
  /** Lãi (+) hoặc lỗ (−) của kỳ theo bước kết chuyển sang tài khoản lợi nhuận; null nếu không có bước đó. */
  profit: number | null;
  /** Đã có chứng từ kết chuyển đang hiệu lực cho (chi nhánh, kỳ) này. */
  alreadyClosed: boolean;
  /** Chứng từ kết chuyển đang có đã lỗi thời: số liệu kỳ / số dư đầu 911 / bộ quy tắc đổi sau khi kết chuyển. */
  staleReasons: StaleReason[];
  /** Các tháng trước (cùng năm) còn số chưa kết chuyển: phải kết chuyển các tháng đó trước. */
  blockers: string[];
  /** Tài khoản doanh thu, chi phí sẽ còn số dư sau khi kết chuyển. */
  residuals: ClosingResidual[];
}
export interface ClosingRunResult {
  branchCode: string;
  period: string;
  /** blocked: tháng trước chưa kết chuyển (blockers), không ghi gì; error: lỗi khi kết chuyển lại dây chuyền. */
  status: 'posted' | 'empty' | 'blocked' | 'error';
  docNo?: string;
  lines: number;
  total: number;
  profit: number | null;
  residuals: ClosingResidual[];
  blockers?: string[];
  /** Kết chuyển lại theo dây chuyền (tháng sau của tháng vừa kết chuyển). */
  cascaded?: boolean;
  message?: string;
}

const NO_PARTNER = '';
const periodRange = (period: string) => {
  const [y, m] = period.split('-').map(Number) as [number, number];
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return { from: `${period}-01`, to: `${period}-${String(last).padStart(2, '0')}`, label: `${String(m).padStart(2, '0')}/${y}`, yearStart: `${y}-01-01` };
};
const monthLabel = (period: string) => `${period.slice(5, 7)}/${period.slice(0, 4)}`;
const docKeyOf = (branchCode: string, period: string) => `closing:${branchCode}:${period}`;
/** Khoá chứng từ thời còn hai sổ (internal, tax): closing:<sổ>:<chi nhánh>:<kỳ>, closing-year:<sổ>:<chi nhánh>:<năm>. */
const legacyKeysOf = (prefix: 'closing' | 'closing-year', branchCode: string, period: string) => ['internal', 'tax'].map((x) => `${prefix}:${x}:${branchCode}:${period}`);
const likes = (prefixes: string[]) => [...new Set(prefixes)].map((x) => `${x}%`);

/** Chứng từ khoá cũ còn hiệu lực: đảo bút toán và huỷ, để không ghi trùng với chứng từ khoá mới. */
async function retireLegacy(trx: Db, auth: AuthContext, keys: string[], accounts: Map<string, Account>, reason: string) {
  for (const k of keys) {
    const legacy = await documentRepository.findByKeyForUpdate(trx, auth.tenantId, k);
    if (!legacy || legacy.status === 'cancelled') continue;
    for (const e of await ledgerRepository.findActiveEntriesBySource(trx, auth.tenantId, legacy.id)) {
      await ledgerService.reverse(trx, auth.tenantId, auth.actor, e.id, accounts, reason);
    }
    await documentRepository.update(trx, legacy.id, { status: 'cancelled', error_message: 'Thay bằng chứng từ khoá mới' });
  }
}

interface RuleSet { rules: ClosingRule[]; isDefault: boolean; version: number | null; hash: string }

async function loadRuleSet(trx: Db, tenantId: string): Promise<RuleSet> {
  const rows = await trx.selectFrom('closing_rules').selectAll().where('tenant_id', '=', tenantId).execute();
  if (!rows.length) return { rules: DEFAULT_CLOSING_RULES, isDefault: true, version: 0, hash: hashRules(DEFAULT_CLOSING_RULES) };
  const rules = orderRules(rows.map((r) => ({ seq: r.seq, fromAccount: r.from_account, toAccount: r.to_account, mode: r.mode as ClosingMode, description: r.description, isActive: r.is_active, includeOpening: r.include_opening })));
  const v = await trx.selectFrom('closing_rule_versions').select((eb) => eb.fn.max('version').as('v')).where('tenant_id', '=', tenantId).executeTakeFirst();
  return { rules, isDefault: false, version: v?.v ?? null, hash: hashRules(rules) };
}

interface TurnoverRow { account_code: string; partner_id: string | null; cost_item: string; department: string; contract: string; debit: string; credit: string }

/** Phát sinh trong kỳ theo (tài khoản, đối tượng, khoản mục), bỏ qua các bút toán kết chuyển. */
async function periodTurnover(trx: Db, a: { tenantId: string; branchId: string; from: string; to: string }) {
  const res = await sql<TurnoverRow>`
    SELECT l.account_code, l.partner_id, COALESCE(l.dims->>'costItem', '') AS cost_item, COALESCE(l.dims->>'department', '') AS department,
           COALESCE(l.dims->>'contract', '') AS contract, SUM(l.debit) AS debit, SUM(l.credit) AS credit
      FROM ledger_lines l
      JOIN ledger_entries e ON e.id = l.entry_id
     WHERE l.tenant_id = ${a.tenantId} AND l.branch_id = ${a.branchId}
       AND l.posting_date BETWEEN ${a.from}::date AND ${a.to}::date
       AND e.doc_type <> 'closing'
     GROUP BY 1, 2, 3, 4, 5`.execute(trx);
  return res.rows;
}

/** Số dư (Nợ, Có) trước kỳ của các tài khoản theo đầu số, theo (tài khoản, đối tượng, khoản mục). */
async function openingOf(trx: Db, a: { tenantId: string; branchId: string; from: string; prefixes: string[] }): Promise<TurnoverRow[]> {
  if (!a.prefixes.length) return [];
  const res = await sql<TurnoverRow>`
    SELECT l.account_code, l.partner_id, COALESCE(l.dims->>'costItem', '') AS cost_item, COALESCE(l.dims->>'department', '') AS department,
           COALESCE(l.dims->>'contract', '') AS contract, SUM(l.debit) AS debit, SUM(l.credit) AS credit
      FROM ledger_lines l
     WHERE l.tenant_id = ${a.tenantId} AND l.branch_id = ${a.branchId}
       AND l.posting_date < ${a.from}::date AND l.account_code LIKE ANY(${likes(a.prefixes)}::text[])
     GROUP BY 1, 2, 3, 4, 5`.execute(trx);
  return res.rows;
}

/** Đầu số nguồn của các bước đang áp dụng; riêng các bước "lấy cả số dư đầu kỳ". */
const sourcePrefixes = (rules: ClosingRule[]) => rules.filter((r) => r.isActive).map((r) => r.fromAccount);
const openingPrefixes = (rules: ClosingRule[]) => rules.filter((r) => r.isActive && r.includeOpening).map((r) => r.fromAccount);

/** Phát sinh của kỳ + số dư đầu của các bước có "lấy cả số dư đầu kỳ" + số dư đầu của loại 5–8 (để báo số còn lại). */
async function closingInputs(trx: Db, rules: ClosingRule[], a: { tenantId: string; branchId: string; from: string; to: string }) {
  const turnover = await periodTurnover(trx, a);
  const opening = await openingOf(trx, { ...a, prefixes: openingPrefixes(rules) });
  const profitLossOpening = await openingOf(trx, { ...a, prefixes: ['5', '6', '7', '8', RESULT_PREFIX] });
  return { turnover, opening, profitLossOpening };
}
type ClosingInputs = Awaited<ReturnType<typeof closingInputs>>;

/** Dấu vân tay theo số thuần (Nợ − Có) từng ô: đảo rồi ghi lại cùng số, hay phiếu ghi rồi huỷ, không làm đổi dấu vân tay. */
const fingerprintOf = (rows: TurnoverRow[]) => {
  const net = new Map<string, number>();
  for (const t of rows) {
    const key = `${t.account_code}|${t.partner_id ?? NO_PARTNER}|${t.cost_item}`;
    net.set(key, (net.get(key) ?? 0) + toCents(toNumber(t.debit)) - toCents(toNumber(t.credit)));
  }
  return sha256([...net].filter(([, v]) => v !== 0).map(([k, v]) => `${k}|${v}`).sort().join('\n'));
};

/** Dấu vân tay: phát sinh trong kỳ của các tài khoản nguồn + số dư đầu của các bước "lấy cả số dư đầu kỳ". */
function sourceFingerprints(rules: ClosingRule[], inputs: ClosingInputs) {
  const src = sourcePrefixes(rules);
  const rows = inputs.turnover.filter((t) => startsAny(t.account_code, src));
  const byAccount = new Map<string, { d: number; c: number }>();
  for (const t of rows) {
    const cur = byAccount.get(t.account_code) ?? { d: 0, c: 0 };
    cur.d += toCents(toNumber(t.debit));
    cur.c += toCents(toNumber(t.credit));
    byAccount.set(t.account_code, cur);
  }
  return {
    fingerprint: fingerprintOf(rows),
    openingFingerprint: fingerprintOf(inputs.opening),
    byAccount: [...byAccount].filter(([, v]) => v.d || v.c).sort(([x], [y]) => (x < y ? -1 : 1)).map(([account, v]) => ({ account, debit: fromCents(v.d), credit: fromCents(v.c) })),
  };
}

/** Tính các dòng kết chuyển của một chi nhánh (chưa ghi gì). */
function compute(rules: ClosingRule[], inputs: ClosingInputs, accounts: Map<string, Account>, label: string) {
  const tracks = (code: string) => tracksPartner(accounts.get(code));
  // Số đang có của từng (tài khoản, đối tượng, khoản mục), tính bằng xu: cập nhật dần qua các bước.
  // Chiều phân tích giữ nguyên khi kết chuyển: khoản mục, phòng ban, hợp đồng.
  type Dims = { costItem: string; department: string; contract: string };
  type Cell = { account: string; partnerId: string | null; dims: Dims; d: number; c: number };
  const dimsOf = (t: TurnoverRow): Dims => ({ costItem: t.cost_item, department: t.department, contract: t.contract });
  const keyOf = (account: string, partnerId: string | null, dims: Dims) => `${account}|${partnerId ?? NO_PARTNER}|${dims.costItem}|${dims.department}|${dims.contract}`;
  const state = new Map<string, Cell>();
  const bump = (account: string, partnerId: string | null, dims: Dims, d: number, c: number) => {
    const pid = tracks(account) ? partnerId : null;
    const key = keyOf(account, pid, dims);
    const cur = state.get(key) ?? { account, partnerId: pid, dims, d: 0, c: 0 };
    cur.d += d;
    cur.c += c;
    state.set(key, cur);
  };
  for (const t of inputs.turnover) bump(t.account_code, t.partner_id, dimsOf(t), toCents(toNumber(t.debit)), toCents(toNumber(t.credit)));
  // Số dư đầu kỳ chỉ dùng cho các bước có "lấy cả số dư đầu kỳ": giữ riêng, cộng vào khi tới bước đó.
  const opening = new Map<string, Cell>();
  for (const t of inputs.opening) {
    const pid = tracks(t.account_code) ? t.partner_id : null;
    const key = keyOf(t.account_code, pid, dimsOf(t));
    const cur = opening.get(key) ?? { account: t.account_code, partnerId: pid, dims: dimsOf(t), d: 0, c: 0 };
    cur.d += toCents(toNumber(t.debit));
    cur.c += toCents(toNumber(t.credit));
    opening.set(key, cur);
  }

  const lines: ClosingLine[] = [];
  let profit: number | null = null;
  const problems: string[] = [];
  for (const rule of rules.filter((r) => r.isActive)) {
    if (rule.includeOpening) {
      for (const [key, o] of opening) {
        if (!o.account.startsWith(rule.fromAccount)) continue;
        bump(o.account, o.partnerId, o.dims, o.d, o.c);
        opening.delete(key);
      }
    }
    const target = accounts.get(rule.toAccount);
    const sources = [...state.values()].filter((s) => s.account.startsWith(rule.fromAccount) && s.account !== rule.toAccount).sort((x, y) => x.account.localeCompare(y.account));
    let ruleNet = 0;
    for (const s of sources) {
      // net > 0: tài khoản nguồn đang nghiêng về bên cần kết chuyển.
      const net = rule.mode === 'debit' ? s.d - s.c : s.c - s.d;
      if (net === 0) continue;
      if (!target) { problems.push(`Tài khoản kết chuyển ${rule.toAccount} không có trong danh mục`); break; }
      if (!target.is_posting) { problems.push(`Tài khoản kết chuyển ${rule.toAccount} là tài khoản tổng hợp, hãy khai tài khoản chi tiết`); break; }
      if (tracks(rule.toAccount)) { problems.push(`Tài khoản kết chuyển ${rule.toAccount} đang theo dõi đối tượng, không dùng làm tài khoản đích được`); break; }
      // Nguồn nghiêng bên Nợ (chi phí) → ghi Có nguồn; nghiêng bên Có (doanh thu) → ghi Nợ nguồn.
      const sourceIsDebitSide = rule.mode === 'debit' ? net > 0 : net < 0;
      const amount = Math.abs(net);
      const [debitAccount, creditAccount] = sourceIsDebitSide ? [rule.toAccount, s.account] : [s.account, rule.toAccount];
      lines.push({
        debitAccount, creditAccount, amount: fromCents(amount), description: `${rule.description || 'Kết chuyển'} ${label}`, partnerId: s.partnerId,
        costItem: s.dims.costItem, department: s.dims.department, contract: s.dims.contract, mode: rule.mode, includeOpening: rule.includeOpening,
      });
      if (sourceIsDebitSide) { bump(s.account, s.partnerId, s.dims, 0, amount); bump(rule.toAccount, null, s.dims, amount, 0); }
      else { bump(s.account, s.partnerId, s.dims, amount, 0); bump(rule.toAccount, null, s.dims, 0, amount); }
      ruleNet += rule.mode === 'debit' ? -net : net;
    }
    if (rule.toAccount.startsWith(PROFIT_PREFIX)) profit = fromCents(ruleNet);
  }
  if (problems.length) throw Errors.posting('Danh sách bút toán kết chuyển chưa đúng', [...new Set(problems)]);

  // Số còn lại của doanh thu, chi phí, 911 sau kết chuyển = số trong kỳ còn lại + số dư đầu (trừ phần đã cộng ở bước "lấy số dư đầu").
  const net = new Map<string, number>();
  const add = (account: string, cents: number) => net.set(account, (net.get(account) ?? 0) + cents);
  for (const s of state.values()) if (isProfitLossAccount(s.account)) add(s.account, s.d - s.c);
  const merged = openingPrefixes(rules);
  for (const t of inputs.profitLossOpening) if (!startsAny(t.account_code, merged)) add(t.account_code, toCents(toNumber(t.debit)) - toCents(toNumber(t.credit)));
  const residuals = residualsOf([...net].map(([account, cents]) => ({ account, cents })), rules);

  return { lines, profit, total: fromCents(lines.reduce((s, l) => s + toCents(l.amount), 0)), residuals };
}

function residualsOf(rows: { account: string; cents: number }[], rules: ClosingRule[]): ClosingResidual[] {
  const src = sourcePrefixes(rules);
  return rows
    .filter((r) => r.cents !== 0)
    .sort((x, y) => (x.account < y.account ? -1 : 1))
    .map((r) => ({ account: r.account, balance: fromCents(r.cents), reason: startsAny(r.account, src) ? 'prior-period' as const : 'no-rule' as const }));
}

/** Số dư thực trên sổ cái đến cuối kỳ của doanh thu, chi phí, 911 (sau khi ghi kết chuyển). */
async function actualResiduals(trx: Db, rules: ClosingRule[], a: { tenantId: string; branchId: string; to: string }): Promise<ClosingResidual[]> {
  const res = await sql<{ account_code: string; bal: string }>`
    SELECT l.account_code, SUM(l.debit - l.credit) AS bal
      FROM ledger_lines l
     WHERE l.tenant_id = ${a.tenantId} AND l.branch_id = ${a.branchId}
       AND l.posting_date <= ${a.to}::date AND l.account_code LIKE ANY(${likes(['5', '6', '7', '8', RESULT_PREFIX])}::text[])
     GROUP BY 1 HAVING SUM(l.debit - l.credit) <> 0`.execute(trx);
  return residualsOf(res.rows.map((r) => ({ account: r.account_code, cents: toCents(toNumber(r.bal)) })), rules);
}

/**
 * Các tháng trước kỳ (cùng năm) của chi nhánh còn số doanh thu, chi phí chưa kết chuyển: có tài khoản nguồn (trừ các
 * bước "lấy cả số dư đầu kỳ") phát sinh thuần khác 0 mà chưa có chứng từ kết chuyển hiệu lực. Trả về dạng YYYY-MM.
 */
async function unclosedBefore(trx: Db, tenantId: string, branch: { id: string; code: string }, period: string, rules: ClosingRule[]): Promise<string[]> {
  const merged = openingPrefixes(rules);
  const prefixes = sourcePrefixes(rules).filter((p) => !startsAny(p, merged));
  const r = periodRange(period);
  if (!prefixes.length || r.from === r.yearStart) return [];
  const res = await sql<{ m: string }>`
    SELECT DISTINCT to_char(l.posting_date, 'YYYY-MM') AS m
      FROM ledger_lines l
      JOIN ledger_entries e ON e.id = l.entry_id
     WHERE l.tenant_id = ${tenantId} AND l.branch_id = ${branch.id}
       AND l.posting_date >= ${r.yearStart}::date AND l.posting_date < ${r.from}::date
       AND e.doc_type <> 'closing' AND l.account_code LIKE ANY(${likes(prefixes)}::text[])
     GROUP BY to_char(l.posting_date, 'YYYY-MM'), l.account_code
    HAVING SUM(l.debit - l.credit) <> 0`.execute(trx);
  const months = res.rows.map((x) => x.m).sort();
  if (!months.length) return [];
  const keys = months.flatMap((m) => [docKeyOf(branch.code, m), ...legacyKeysOf('closing', branch.code, m)]);
  const closed = await trx.selectFrom('accounting_events').select('doc_key').where('tenant_id', '=', tenantId).where('doc_key', 'in', keys).where('status', '=', 'posted').execute();
  const closedKeys = new Set(closed.map((c) => c.doc_key));
  return months.filter((m) => ![docKeyOf(branch.code, m), ...legacyKeysOf('closing', branch.code, m)].some((k) => closedKeys.has(k)));
}

interface StoredPayload { kind?: string; period?: string; description?: string; profit?: number | null; rulesVersion?: number | null; rulesHash?: string; sources?: ClosingSources; residuals?: ClosingResidual[] }

/**
 * Chứng từ kết chuyển nào đã lỗi thời (so với thời điểm chốt số asOf):
 *   data    — có bút toán (trừ kết chuyển) mới ghi vào tài khoản nguồn trong kỳ: phiếu muộn, sửa, huỷ, tính lại giá vốn…;
 *   opening — số dư đầu của bước "lấy cả số dư đầu kỳ" (911) đổi: kỳ trước được kết chuyển lại / huỷ.
 * Bút toán trên sổ cái không bị sửa (sửa = đảo + ghi mới), nên chỉ cần xét các bút toán tạo sau asOf; chỉ tính là đổi khi
 * phần tạo thêm đó làm số thuần của một ô (tài khoản, đối tượng, khoản mục) khác 0 — ghi rồi huỷ, đảo rồi ghi lại cùng số thì không.
 * Ngoại lệ: tính giá vốn GHI ĐÈ số tiền lên dòng chờ giá vốn của bút toán cũ (migration 0059_dong_gia_von_cho), không tạo bút
 * toán mới — nhận biết qua nhật ký 'costing.fill' của (chi nhánh, kỳ) ghi sau asOf (chỉ ghi khi có dòng thực sự đổi số).
 */
async function staleByWatermark(trx: Db, tenantId: string, rules: ClosingRule[], runs: { id: string; branchId: string; branchCode: string; period: string; asOf: string }[]): Promise<Map<string, StaleReason[]>> {
  const out = new Map<string, StaleReason[]>();
  if (!runs.length) return out;
  const ranges = runs.map((r) => periodRange(r.period));
  const res = await sql<{ id: string; data_changed: boolean; opening_changed: boolean }>`
    WITH r AS (
      SELECT * FROM unnest(${runs.map((x) => x.id)}::bigint[], ${runs.map((x) => x.branchId)}::bigint[], ${ranges.map((x) => x.from)}::date[],
                           ${ranges.map((x) => x.to)}::date[], ${runs.map((x) => x.asOf)}::timestamptz[],
                           ${runs.map((x) => `${x.branchCode}:${x.period}`)}::text[]) AS r(id, branch_id, d_from, d_to, as_of, cost_key)
    )
    SELECT r.id::text AS id,
      EXISTS (SELECT 1 FROM audit_logs a
               WHERE a.tenant_id = ${tenantId} AND a.action = 'costing.fill' AND a.object_id = r.cost_key AND a.created_at > r.as_of)
      OR EXISTS (SELECT 1 FROM ledger_entries e JOIN ledger_lines l ON l.entry_id = e.id
               WHERE e.tenant_id = ${tenantId} AND e.created_at > r.as_of AND e.branch_id = r.branch_id
                 AND e.posting_date BETWEEN r.d_from AND r.d_to AND e.doc_type <> 'closing'
                 AND l.account_code LIKE ANY(${likes(sourcePrefixes(rules))}::text[])
               GROUP BY l.account_code, l.partner_id, l.dims->>'costItem' HAVING SUM(l.debit - l.credit) <> 0) AS data_changed,
      EXISTS (SELECT 1 FROM ledger_entries e JOIN ledger_lines l ON l.entry_id = e.id
               WHERE e.tenant_id = ${tenantId} AND e.created_at > r.as_of AND e.branch_id = r.branch_id
                 AND e.posting_date < r.d_from AND l.account_code LIKE ANY(${likes(openingPrefixes(rules))}::text[])
               GROUP BY l.account_code, l.partner_id, l.dims->>'costItem' HAVING SUM(l.debit - l.credit) <> 0) AS opening_changed
      FROM r`.execute(trx);
  for (const row of res.rows) {
    const reasons: StaleReason[] = [];
    if (row.data_changed) reasons.push('data');
    if (row.opening_changed) reasons.push('opening');
    out.set(row.id, reasons);
  }
  return out;
}

async function scope(trx: Db, auth: AuthContext, input: { period: string; branchCodes: string[] }) {
  const branches = await trx.selectFrom('branches').select(['id', 'code', 'name']).where('tenant_id', '=', auth.tenantId).where('code', 'in', input.branchCodes).orderBy('code').execute();
  const missing = input.branchCodes.filter((c) => !branches.some((b) => b.code === c));
  if (missing.length) throw Errors.validation(`Chi nhánh chưa khai báo: ${missing.join(', ')}`);
  return { branches, ruleSet: await loadRuleSet(trx, auth.tenantId), accounts: await accountRepository.mapByCode(trx, auth.tenantId), range: periodRange(input.period) };
}

/** Bộ quy tắc có lỗi thì không kết chuyển. */
function assertRulesUsable(ruleSet: RuleSet, accounts: Map<string, Account>) {
  const check = validateRules(ruleSet.rules, accounts);
  if (check.errors.length) throw Errors.posting('Bút toán kết chuyển mẫu chưa hợp lệ, sửa ở thẻ "Bút toán kết chuyển mẫu" trước khi kết chuyển', check.errors);
}

/** Kết chuyển (hoặc kết chuyển lại) một chi nhánh, một kỳ, trong một giao dịch. */
async function runOne(auth: AuthContext, branchCode: string, period: string): Promise<ClosingRunResult> {
  return db.transaction().execute(async (trx) => {
    const s = await scope(trx, auth, { period, branchCodes: [branchCode] });
    assertRulesUsable(s.ruleSet, s.accounts);
    const rules = s.ruleSet.rules;
    const b = s.branches[0]!;
    const blockers = await unclosedBefore(trx, auth.tenantId, b, period, rules);
    if (blockers.length) {
      // Không ném lỗi: chạy nhiều chi nhánh thì chi nhánh khác vẫn kết chuyển được.
      return {
        branchCode: b.code, period, status: 'blocked', lines: 0, total: 0, profit: null, residuals: [], blockers,
        message: `Còn ${blockers.map(monthLabel).join(', ')} chưa kết chuyển; kết chuyển lần lượt từng tháng, tháng trước xong mới đến tháng sau`,
      };
    }
    const docKey = docKeyOf(b.code, period);
    const existing = await documentRepository.findByKeyForUpdate(trx, auth.tenantId, docKey);
    if (existing) {
      for (const e of await ledgerRepository.findActiveEntriesBySource(trx, auth.tenantId, existing.id)) {
        await ledgerService.reverse(trx, auth.tenantId, auth.actor, e.id, s.accounts, 'Kết chuyển lại');
      }
    }
    await retireLegacy(trx, auth, legacyKeysOf('closing', b.code, period), s.accounts, 'Kết chuyển lại');
    // Giờ bắt đầu giao dịch (= created_at của bút toán ghi trong giao dịch này), dạng ISO UTC đủ micro giây.
    const asOf = (await sql<{ t: string }>`SELECT to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS t`.execute(trx)).rows[0]!.t;
    const inputs = await closingInputs(trx, rules, { tenantId: auth.tenantId, branchId: b.id, from: s.range.from, to: s.range.to });
    const c = compute(rules, inputs, s.accounts, s.range.label);
    if (!c.lines.length) {
      if (existing) await documentRepository.update(trx, existing.id, { status: 'cancelled', error_message: 'Kết chuyển lại: kỳ không còn số để kết chuyển' });
      const residuals = await actualResiduals(trx, rules, { tenantId: auth.tenantId, branchId: b.id, to: s.range.to });
      return { branchCode: b.code, period, status: 'empty', lines: 0, total: 0, profit: c.profit, residuals };
    }

    const entryCount = await sql<{ n: string }>`
      SELECT COUNT(DISTINCT l.entry_id) AS n
        FROM ledger_lines l JOIN ledger_entries e ON e.id = l.entry_id
       WHERE l.tenant_id = ${auth.tenantId} AND l.branch_id = ${b.id} AND l.posting_date BETWEEN ${s.range.from}::date AND ${s.range.to}::date
         AND e.doc_type <> 'closing' AND l.account_code LIKE ANY(${likes(sourcePrefixes(rules))}::text[])`.execute(trx);
    const sources: ClosingSources = { asOf, entryCount: Number(entryCount.rows[0]?.n ?? 0), ...sourceFingerprints(rules, inputs) };

    const docNo = `KC ${s.range.label} ${b.code}`;
    const version = (existing?.version ?? 0) + 1;
    const payload = {
      period, branchCode: b.code, profit: c.profit, description: `Kết chuyển lãi lỗ ${s.range.label}`, lines: c.lines,
      rulesVersion: s.ruleSet.version, rulesHash: s.ruleSet.hash, rules, sources, residuals: c.residuals,
    };
    const fields = { version, branch_id: b.id, doc_date: s.range.to, total: c.total, payload: JSON.stringify(payload) };
    let docId: string;
    if (existing) {
      docId = existing.id;
      await documentRepository.archiveVersion(trx, existing.id, existing.version, existing.payload, existing.received_at);
      await documentRepository.update(trx, existing.id, { ...fields, received_at: new Date() });
    } else {
      docId = (await documentRepository.insert(trx, { tenant_id: auth.tenantId, source_system: 'manual', doc_key: docKey, doc_type: 'closing', doc_no: docNo, partner_id: null, invoice_no: null, created_by: auth.actor, ...fields })).id;
    }
    const lines: DraftLine[] = c.lines.flatMap((l, i) => [
      { accountCode: l.debitAccount, debit: l.amount, credit: 0, pairNo: i + 1, part: 'other' as const, partnerId: partnerFor(s.accounts, l.debitAccount, l.partnerId), description: l.description, dims: dimsForLedger(l) },
      { accountCode: l.creditAccount, debit: 0, credit: l.amount, pairNo: i + 1, part: 'other' as const, partnerId: partnerFor(s.accounts, l.creditAccount, l.partnerId), description: l.description, dims: dimsForLedger(l) },
    ]);
    await ledgerService.post(
      trx,
      auth.tenantId,
      auth.actor,
      { branchId: b.id, docType: 'closing', docNo, docDate: s.range.to, postingDate: s.range.to, description: `Kết chuyển lãi lỗ ${s.range.label}`, sourceDocumentId: docId, sourceVersion: version, lines },
      s.accounts,
    );

    // Tự kiểm tra trên sổ cái: 911 phải hết số dư (không thì huỷ cả lần chạy); doanh thu, chi phí còn số dư thì báo.
    const residuals = await actualResiduals(trx, rules, { tenantId: auth.tenantId, branchId: b.id, to: s.range.to });
    const left911 = residuals.filter((r) => r.account.startsWith(RESULT_PREFIX));
    if (left911.length) {
      throw Errors.posting(`Sau kết chuyển tài khoản 911 của ${b.code} vẫn còn số dư, chưa ghi gì. Kiểm tra bút toán kết chuyển mẫu`, left911.map((r) => `${r.account}: ${r.balance}`));
    }
    if (JSON.stringify(residuals) !== JSON.stringify(c.residuals)) {
      await documentRepository.update(trx, docId, { payload: JSON.stringify({ ...payload, residuals }) });
    }
    await documentRepository.update(trx, docId, { status: 'posted', posted_at: new Date(), error_message: null });
    await writeAudit(trx, { tenantId: auth.tenantId, actor: auth.actor, action: 'closing.run', objectType: 'source_document', objectId: docKey, after: { version, total: c.total, profit: c.profit, rulesVersion: s.ruleSet.version, entryCount: sources.entryCount, residuals: residuals.length } });
    return { branchCode: b.code, period, status: 'posted', docNo, lines: c.lines.length, total: c.total, profit: c.profit, residuals };
  });
}

/** Các kỳ sau `period` (cùng năm) của chi nhánh đang có chứng từ kết chuyển hiệu lực, theo thứ tự tháng. */
async function laterClosedPeriods(trx: Db, tenantId: string, branchCode: string, period: string): Promise<string[]> {
  const rows = await sql<{ p: string }>`
    SELECT DISTINCT d.payload->>'period' AS p
      FROM accounting_events d JOIN branches br ON br.id = d.branch_id
     WHERE d.tenant_id = ${tenantId} AND br.code = ${branchCode} AND d.doc_type = 'closing' AND d.status = 'posted'
       AND d.payload->>'kind' IS NULL AND d.payload->>'period' > ${period} AND d.payload->>'period' LIKE ${period.slice(0, 4) + '-%'}
     ORDER BY 1`.execute(trx);
  return rows.rows.map((r) => r.p);
}

export const closingService = {
  async listRules(auth: AuthContext): Promise<{ rules: ClosingRule[]; isDefault: boolean; version: number | null; hash: string } & RuleCheck> {
    const set = await loadRuleSet(db, auth.tenantId);
    const check = validateRules(set.rules, await accountRepository.mapByCode(db, auth.tenantId));
    return { rules: set.rules, isDefault: set.isDefault, version: set.version, hash: set.hash, ...check };
  },

  /** Thay toàn bộ danh sách bút toán kết chuyển mẫu của đơn vị; khác bộ đang dùng thì ghi thêm một phiên bản. */
  async saveRules(auth: AuthContext, rules: ClosingRule[], note = '') {
    if (!rules.length) throw Errors.validation('Bạn chưa khai báo tài khoản kết chuyển');
    const accounts = await accountRepository.mapByCode(db, auth.tenantId);
    const check = validateRules(rules, accounts, 'save');
    if (check.errors.length) throw Errors.validation('Bút toán kết chuyển mẫu chưa hợp lệ', check.errors);
    const ordered = orderRules(rules);
    await db.transaction().execute(async (trx) => {
      // Khoá theo đơn vị để hai người lưu cùng lúc không trùng số phiên bản.
      await sql`SELECT pg_advisory_xact_lock(hashtext('closing_rules'), ${Number(auth.tenantId)}::int)`.execute(trx);
      const before = await loadRuleSet(trx, auth.tenantId);
      const hash = hashRules(ordered);
      if (!before.isDefault && before.hash === hash) return;
      await trx.deleteFrom('closing_rules').where('tenant_id', '=', auth.tenantId).execute();
      await trx.insertInto('closing_rules').values(ordered.map((r) => ({ tenant_id: auth.tenantId, seq: r.seq, from_account: r.fromAccount, to_account: r.toAccount, mode: r.mode, description: r.description, is_active: r.isActive, include_opening: r.includeOpening }))).execute();
      const version = (before.version ?? 0) + 1;
      await trx.insertInto('closing_rule_versions').values({ tenant_id: auth.tenantId, version, rules: JSON.stringify(ordered), note, created_by: auth.actor, created_by_name: auth.actorName }).execute();
      await writeAudit(trx, {
        tenantId: auth.tenantId, actor: auth.actor, action: 'closing.rules', objectType: 'closing_rules', objectId: auth.tenantId,
        before: { version: before.version, isDefault: before.isDefault, rules: before.rules }, after: { version, rules: ordered, note },
      });
    });
    return closingService.listRules(auth);
  },

  /** Lịch sử phiên bản bộ bút toán kết chuyển mẫu, mới nhất trước. */
  async listRuleVersions(auth: AuthContext) {
    const rows = await db.selectFrom('closing_rule_versions').selectAll().where('tenant_id', '=', auth.tenantId).orderBy('version', 'desc').execute();
    return rows.map((r) => ({ version: r.version, rules: r.rules as ClosingRule[], note: r.note, createdBy: r.created_by_name || r.created_by, createdAt: r.created_at }));
  },

  /** Xem trước: các bút toán sẽ sinh, lãi lỗ, tháng trước chưa kết chuyển, số còn lại, kết chuyển cũ đã lỗi thời. Không ghi gì. */
  async preview(auth: AuthContext, input: ClosingRunInput): Promise<ClosingPreview[]> {
    const s = await scope(db, auth, input);
    assertRulesUsable(s.ruleSet, s.accounts);
    const rules = s.ruleSet.rules;
    const out: ClosingPreview[] = [];
    for (const b of s.branches) {
      const inputs = await closingInputs(db, rules, { tenantId: auth.tenantId, branchId: b.id, from: s.range.from, to: s.range.to });
      let current: { payload: unknown } | null = null;
      for (const k of [docKeyOf(b.code, input.period), ...legacyKeysOf('closing', b.code, input.period)]) {
        const d = await documentRepository.findByKey(db, auth.tenantId, k);
        if (d?.status === 'posted') current = d;
      }
      const staleReasons: StaleReason[] = [];
      const stored = current?.payload as StoredPayload | undefined;
      if (stored?.sources) {
        const now = sourceFingerprints(rules, inputs);
        if (now.fingerprint !== stored.sources.fingerprint) staleReasons.push('data');
        if (now.openingFingerprint !== stored.sources.openingFingerprint) staleReasons.push('opening');
      }
      if (stored?.rulesHash && stored.rulesHash !== s.ruleSet.hash) staleReasons.push('rules');
      const blockers = await unclosedBefore(db, auth.tenantId, b, input.period, rules);
      out.push({ branchCode: b.code, branchName: b.name, ...compute(rules, inputs, s.accounts, s.range.label), alreadyClosed: Boolean(current), staleReasons, blockers });
    }
    return out;
  },

  /**
   * Kết chuyển (hoặc kết chuyển lại) từng chi nhánh; mỗi chi nhánh, mỗi kỳ một giao dịch riêng.
   * cascade: kết chuyển xong thì kết chuyển lại luôn các tháng sau (cùng năm) đã kết chuyển của chi nhánh, vì số dư đầu
   * 911 của các tháng đó vừa đổi; tháng nào lỗi (kỳ đã khoá…) thì dừng dây chuyền của chi nhánh đó và báo.
   */
  async run(auth: AuthContext, input: ClosingRunInput): Promise<ClosingRunResult[]> {
    const results: ClosingRunResult[] = [];
    for (const branchCode of [...new Set(input.branchCodes)]) {
      const first = await runOne(auth, branchCode, input.period);
      results.push(first);
      if (!input.cascade || first.status === 'blocked') continue;
      for (const p of await laterClosedPeriods(db, auth.tenantId, branchCode, input.period)) {
        try {
          const r = await runOne(auth, branchCode, p);
          results.push({ ...r, cascaded: true });
          if (r.status === 'blocked') break;
        } catch (e) {
          results.push({ branchCode, period: p, status: 'error', lines: 0, total: 0, profit: null, residuals: [], cascaded: true, message: e instanceof Error ? e.message : String(e) });
          break;
        }
      }
    }
    return results;
  },

  /**
   * Kết chuyển lợi nhuận năm trước (4212 → 4211) cho năm mới `year`, từng chi nhánh một giao dịch.
   * Số chuyển = số dư tài khoản nguồn (gồm tài khoản con) đến hết 31/12 năm trước; dư Có (lãi): Nợ nguồn / Có đích;
   * dư Nợ (lỗ): Nợ đích / Có nguồn. Ghi ngày 01/01. Chạy lại: bút toán cũ được đảo rồi ghi lại.
   */
  async yearEnd(auth: AuthContext, input: YearEndRunInput) {
    const accounts = await accountRepository.mapByCode(db, auth.tenantId);
    const target = accounts.get(input.toAccount);
    if (!target) throw Errors.validation(`Tài khoản ${input.toAccount} không có trong danh mục`);
    if (!target.is_posting) throw Errors.validation(`Tài khoản ${input.toAccount} là tài khoản tổng hợp, hãy chọn tài khoản chi tiết`);
    const prevEnd = `${input.year - 1}-12-31`;
    const docDate = `${input.year}-01-01`;
    const label = `năm ${input.year - 1}`;
    const results: { branchCode: string; status: 'posted' | 'empty' | 'preview'; docNo?: string; lines: { account: string; balance: number }[]; total: number }[] = [];
    for (const branchCode of [...new Set(input.branchCodes)]) {
      const r = await db.transaction().execute(async (trx) => {
        const s = await scope(trx, auth, { period: `${input.year}-01`, branchCodes: [branchCode] });
        const b = s.branches[0]!;
        const res = await sql<{ account_code: string; bal: string }>`
          SELECT l.account_code, SUM(l.credit - l.debit) AS bal
            FROM ledger_lines l
           WHERE l.tenant_id = ${auth.tenantId} AND l.branch_id = ${b.id}
             AND l.posting_date <= ${prevEnd}::date AND l.account_code LIKE ${input.fromAccount + '%'} AND l.account_code <> ${input.toAccount}
           GROUP BY 1 HAVING SUM(l.credit - l.debit) <> 0 ORDER BY 1`.execute(trx);
        const rows = res.rows.map((x) => ({ account: x.account_code, cents: toCents(toNumber(x.bal)) }));
        const lines = rows.map((x) => ({ account: x.account, balance: fromCents(x.cents) }));
        const total = fromCents(rows.reduce((t, x) => t + Math.abs(x.cents), 0));
        if (input.dryRun) return { branchCode: b.code, status: 'preview' as const, lines, total };
        const docKey = `closing-year:${b.code}:${input.year}`;
        const existing = await documentRepository.findByKeyForUpdate(trx, auth.tenantId, docKey);
        if (existing) {
          for (const e of await ledgerRepository.findActiveEntriesBySource(trx, auth.tenantId, existing.id)) {
            await ledgerService.reverse(trx, auth.tenantId, auth.actor, e.id, s.accounts, 'Kết chuyển lại lợi nhuận năm trước');
          }
        }
        await retireLegacy(trx, auth, legacyKeysOf('closing-year', b.code, String(input.year)), s.accounts, 'Kết chuyển lại lợi nhuận năm trước');
        if (!rows.length) {
          if (existing) await documentRepository.update(trx, existing.id, { status: 'cancelled', error_message: 'Kết chuyển lại: không còn số dư để chuyển' });
          return { branchCode: b.code, status: 'empty' as const, lines, total: 0 };
        }
        const description = `Kết chuyển lợi nhuận ${label} sang lợi nhuận năm trước`;
        const docNo = `KC LN ${input.year - 1} ${b.code}`;
        const version = (existing?.version ?? 0) + 1;
        const payloadLines = rows.map((x) => (x.cents > 0
          ? { debitAccount: x.account, creditAccount: input.toAccount, amount: fromCents(x.cents), description }
          : { debitAccount: input.toAccount, creditAccount: x.account, amount: fromCents(-x.cents), description }));
        const fields = { version, branch_id: b.id, doc_date: docDate, total, payload: JSON.stringify({ kind: 'year-end', period: `${input.year}-01`, branchCode: b.code, description, lines: payloadLines }) };
        let docId: string;
        if (existing) {
          docId = existing.id;
          await documentRepository.archiveVersion(trx, existing.id, existing.version, existing.payload, existing.received_at);
          await documentRepository.update(trx, existing.id, { ...fields, received_at: new Date() });
        } else {
          docId = (await documentRepository.insert(trx, { tenant_id: auth.tenantId, source_system: 'manual', doc_key: docKey, doc_type: 'closing', doc_no: docNo, partner_id: null, invoice_no: null, created_by: auth.actor, ...fields })).id;
        }
        const draft: DraftLine[] = payloadLines.flatMap((l, i) => [
          { accountCode: l.debitAccount, debit: l.amount, credit: 0, pairNo: i + 1, part: 'other' as const, partnerId: null, description, dims: {} },
          { accountCode: l.creditAccount, debit: 0, credit: l.amount, pairNo: i + 1, part: 'other' as const, partnerId: null, description, dims: {} },
        ]);
        await ledgerService.post(trx, auth.tenantId, auth.actor, { branchId: b.id, docType: 'closing', docNo, docDate, postingDate: docDate, description, sourceDocumentId: docId, sourceVersion: version, lines: draft }, s.accounts);
        await documentRepository.update(trx, docId, { status: 'posted', posted_at: new Date(), error_message: null });
        await writeAudit(trx, { tenantId: auth.tenantId, actor: auth.actor, action: 'closing.year_end', objectType: 'source_document', objectId: docKey, after: { version, total } });
        return { branchCode: b.code, status: 'posted' as const, docNo, lines, total };
      });
      results.push(r);
    }
    return results;
  },

  /** Các chứng từ kết chuyển của một năm (kể cả đã huỷ), kèm phiên bản quy tắc, tóm tắt nguồn và lý do lỗi thời. */
  /** Các lần kết chuyển: theo năm, hoặc theo khoảng ngày chứng từ (Từ ngày / Đến ngày như màn HTsoft). */
  async listRuns(auth: AuthContext, q: { year?: number; from?: string; to?: string }) {
    const from = q.from ?? `${q.year ?? new Date().getFullYear()}-01-01`;
    const to = q.to ?? `${q.year ?? new Date().getFullYear()}-12-31`;
    const rows = await db
      .selectFrom('accounting_events as d')
      .innerJoin('branches as b', 'b.id', 'd.branch_id')
      // Người lập (cột User của HTsoft): created_by dạng "user:<id>".
      .leftJoin('users as u', (j) => j.on(sql`'user:' || u.id::text`, '=', sql.ref('d.created_by')))
      .select(['d.id', 'd.doc_key', 'd.doc_no', 'd.doc_date', 'd.total', 'd.status', 'd.version', 'd.posted_at', 'd.received_at', 'd.payload', 'd.branch_id', 'd.created_by', 'b.code as branch_code', 'b.name as branch_name', 'u.full_name as created_by_name', 'u.email as created_by_email'])
      .where('d.tenant_id', '=', auth.tenantId)
      .where('d.doc_type', '=', 'closing')
      .where('d.doc_date', '>=', from)
      .where('d.doc_date', '<=', to)
      .orderBy('d.doc_date', 'desc')
      .orderBy('b.code')
      .execute();
    const ruleSet = await loadRuleSet(db, auth.tenantId);
    const watch = rows.flatMap((r) => {
      const p = r.payload as StoredPayload;
      return r.status === 'posted' && !p.kind && p.period && p.sources?.asOf ? [{ id: String(r.id), branchId: String(r.branch_id), branchCode: r.branch_code, period: p.period, asOf: p.sources.asOf }] : [];
    });
    const stale = await staleByWatermark(db, auth.tenantId, ruleSet.rules, watch);
    return rows.map((r) => {
      const p = r.payload as StoredPayload;
      const staleReasons: StaleReason[] = [...(stale.get(String(r.id)) ?? [])];
      if (r.status === 'posted' && !p.kind && p.rulesHash && p.rulesHash !== ruleSet.hash) staleReasons.push('rules');
      return {
        id: r.id, docKey: r.doc_key, docNo: r.doc_no, docDate: r.doc_date, period: p.period ?? '', kind: p.kind ?? 'month',
        branchCode: r.branch_code, branchName: r.branch_name, total: toNumber(r.total), profit: p.profit ?? null, status: r.status, version: r.version, postedAt: r.posted_at,
        rulesVersion: p.rulesVersion ?? null, sources: p.sources ?? null, residuals: p.residuals ?? [], staleReasons,
        createdBy: r.created_by_name || r.created_by_email || r.created_by, description: p.description ?? '',
      };
    });
  },

  /**
   * Bút toán nguồn của một lần kết chuyển: các bút toán (trừ kết chuyển) trong kỳ của chi nhánh, có dòng vào tài khoản
   * bắt đầu bằng `account`, tạo không muộn hơn thời điểm chốt số. Phân trang 200 dòng.
   */
  async runSources(auth: AuthContext, id: string, q: { account: string; page: number }) {
    const d = await db.selectFrom('accounting_events').select(['id', 'branch_id', 'payload', 'doc_type']).where('tenant_id', '=', auth.tenantId).where('id', '=', id).executeTakeFirst();
    if (!d || d.doc_type !== 'closing') throw Errors.notFound('chứng từ kết chuyển');
    const p = d.payload as StoredPayload;
    if (!p.period || !p.sources?.asOf) throw Errors.validation('Chứng từ kết chuyển này ghi trước khi có lưu vết nguồn; kết chuyển lại để xem nguồn');
    const r = periodRange(p.period);
    const pageSize = 200;
    const res = await sql<{ entry_id: string; event_id: string | null; entry_no: string; doc_no: string; doc_type: string; posting_date: string; description: string; debit: string; credit: string; n: string }>`
      SELECT e.id AS entry_id, e.event_id, e.entry_no, e.doc_no, e.doc_type, e.posting_date, e.description,
             SUM(l.debit) AS debit, SUM(l.credit) AS credit, COUNT(*) OVER () AS n
        FROM ledger_lines l JOIN ledger_entries e ON e.id = l.entry_id
       WHERE l.tenant_id = ${auth.tenantId} AND l.branch_id = ${d.branch_id} AND l.posting_date BETWEEN ${r.from}::date AND ${r.to}::date
         AND e.doc_type <> 'closing' AND e.created_at <= ${p.sources.asOf}::timestamptz AND l.account_code LIKE ${q.account + '%'}
       GROUP BY e.id
       ORDER BY e.posting_date, e.entry_no
       LIMIT ${pageSize} OFFSET ${(q.page - 1) * pageSize}`.execute(db);
    return {
      total: Number(res.rows[0]?.n ?? 0), page: q.page, pageSize,
      rows: res.rows.map((x) => ({ entryId: x.entry_id, eventId: x.event_id, entryNo: x.entry_no, docNo: x.doc_no, docType: x.doc_type, postingDate: x.posting_date, description: x.description, debit: toNumber(x.debit), credit: toNumber(x.credit) })),
    };
  },

  /**
   * Bảng kiểm khoá kỳ: chi nhánh có kết chuyển của kỳ đã lỗi thời; chi nhánh đã kết chuyển mà doanh thu, chi phí, 911
   * còn số dư cuối kỳ.
   */
  async periodChecks(tenantId: string, period: string) {
    const r = periodRange(period);
    const ruleSet = await loadRuleSet(db, tenantId);
    const runs = await sql<{ id: string; branch_id: string; code: string; payload: StoredPayload }>`
      SELECT d.id::text AS id, d.branch_id::text AS branch_id, br.code, d.payload
        FROM accounting_events d JOIN branches br ON br.id = d.branch_id
       WHERE d.tenant_id = ${tenantId} AND d.doc_type = 'closing' AND d.status = 'posted'
         AND d.payload->>'kind' IS NULL AND d.payload->>'period' = ${period}
       ORDER BY br.code`.execute(db);
    const watch = runs.rows.flatMap((x) => (x.payload.sources?.asOf ? [{ id: x.id, branchId: x.branch_id, branchCode: x.code, period, asOf: x.payload.sources.asOf }] : []));
    const stale = await staleByWatermark(db, tenantId, ruleSet.rules, watch);
    const staleBranches = runs.rows.filter((x) => (stale.get(x.id)?.length ?? 0) > 0 || (x.payload.rulesHash && x.payload.rulesHash !== ruleSet.hash)).map((x) => x.code);
    const residual = await sql<{ code: string; account_code: string; bal: string }>`
      SELECT br.code, l.account_code, SUM(l.debit - l.credit) AS bal
        FROM ledger_lines l JOIN branches br ON br.id = l.branch_id
       WHERE l.tenant_id = ${tenantId} AND l.posting_date <= ${r.to}::date
         AND l.account_code LIKE ANY(${likes(['5', '6', '7', '8', RESULT_PREFIX])}::text[])
         AND l.branch_id = ANY(${runs.rows.map((x) => x.branch_id)}::bigint[])
       GROUP BY 1, 2 HAVING SUM(l.debit - l.credit) <> 0
       ORDER BY 1, 2`.execute(db);
    const byBranch = new Map<string, string[]>();
    for (const x of residual.rows) byBranch.set(x.code, [...(byBranch.get(x.code) ?? []), x.account_code]);
    return { staleBranches, residuals: [...byBranch].map(([branchCode, accounts]) => ({ branchCode, accounts })) };
  },
};

/** Chiều phân tích của dòng kết chuyển khi ghi sổ (bỏ chiều trống). */
function dimsForLedger(l: ClosingLine): Record<string, string> {
  return Object.fromEntries(Object.entries({ costItem: l.costItem, department: l.department, contract: l.contract }).filter(([, v]) => v));
}

/** Đối tượng chỉ gắn vào phía tài khoản có theo dõi đối tượng. */
function partnerFor(accounts: Map<string, Account>, code: string, partnerId: string | null): string | null {
  return tracksPartner(accounts.get(code)) ? partnerId : null;
}
