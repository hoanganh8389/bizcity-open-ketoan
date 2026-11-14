// @bizcity-layer K kernel/posting
// [2026-11-10 02:00 PM Nguyễn Văn Thủy] PHASE-026 — bảng quy tắc định khoản: cài đặt quyết tài khoản, lõi kiểm (docs/nghiep-vu/15) (đóng góp)
/**
 * BẢNG QUY TẮC ĐỊNH KHOẢN (posting_rules, migration 0096).
 *
 * Luật định khoản (rules/*.rule.ts) dựng bút toán như cũ, mỗi cặp Nợ / Có mang NHÃN của dòng chứng từ (nghiệp vụ, hàng tặng,
 * chương trình, hình thức thanh toán, chiều chuyển kho…). Sau đó bảng quy tắc được áp lên từng cặp:
 *
 *   1. Nghiệp vụ của cặp: nghiệp vụ hệ thống theo loại chứng từ (sale, transfer, stock_decrease…); chứng từ mang lý do của một
 *      nghiệp vụ kế toán tự tạo (dựa trên đúng nghiệp vụ hệ thống đó) thì xét thêm quy tắc của nghiệp vụ tự tạo.
 *   2. Lấy quy tắc đã duyệt, cùng nghiệp vụ, cùng khoản tiền (tiền hàng / thuế / giá vốn / thanh toán), cùng sổ, có hiệu lực tại
 *      ngày chứng từ, khớp MỌI điều kiện đã điền (ô điều kiện trống = mọi trường hợp).
 *   3. Cụ thể hơn thắng: quy tắc của nghiệp vụ tự tạo trước quy tắc của nghiệp vụ hệ thống; rồi nhiều điều kiện hơn; rồi Ưu tiên.
 *      Còn ngang nhau → lỗi khai báo, chặn định khoản (màn khai báo đã chặn trước lúc lưu, đây là lớp phòng thủ).
 *   4. Quy tắc thắng ghi tài khoản Nợ / Có của nó lên cặp; ô để trống = giữ tài khoản bộ định khoản tự tra (tài khoản ngầm định).
 *   5. Không quy tắc nào khớp → giữ nguyên bút toán bộ định khoản dựng (chưa khai quy tắc nào thì sổ không đổi).
 *
 * Sau đó ledgerService.post vẫn kiểm như mọi bút toán: Nợ = Có, tài khoản có trong hệ thống tài khoản và là tài khoản chi tiết,
 * đối tượng, kỳ khoá. Quy tắc trỏ tài khoản sai thì bị chặn ở đó.
 *
 * Hàm ở đây là hàm thuần (không đọc CSDL): posting-config nạp bảng, posting.service / costing gọi applyRuleTable.
 */
import type { DraftLine } from '../ledger/ledger.types.js';

export type RulePart = 'goods' | 'tax' | 'cogs' | 'payment';
export type RuleBook = 'all' | 'internal' | 'tax';

/** Điều kiện của quy tắc. Ô không có = mọi trường hợp. */
export interface RuleCond {
  /** Hình thức thanh toán (payment_methods.code). */
  method?: string;
  /** Loại thuế của dòng (tax_codes.code). */
  taxCode?: string;
  /** Loại hàng của mặt hàng (products.type_code: HANG-BAN, QUA, VAT-TU, DICH-VU…). */
  itemType?: string;
  // [2026-11-11 Nguyễn Văn Thủy] PHASE-026 — điều kiện Biến thể của mặt hàng (khuyến mại, chia giá, kẹp quà, nội bộ…) (đóng góp)
  /** Biến thể của mặt hàng (products.variant_code: normal, promo, share, clip, program, expiry, internal…). */
  variant?: string;
  /** Loại chương trình của dòng (program_kinds.code). */
  programKind?: string;
  /** Đúng một chương trình (mã chính sách trên dòng: policyRef.key). */
  program?: string;
  /** Dòng hàng tặng (true) / hàng bán thường (false). */
  gift?: boolean;
  /** Chuyển kho: bên xuất (out) / bên nhận (in). */
  leg?: 'in' | 'out';
  /** Chuyển kho: hai chi nhánh cùng đơn vị hạch toán (true) / khác (false). */
  sameUnit?: boolean;
}
export const COND_KEYS = ['method', 'taxCode', 'itemType', 'variant', 'programKind', 'program', 'gift', 'leg', 'sameUnit'] as const;
export type CondKey = (typeof COND_KEYS)[number];

export interface PostingRule {
  id: string;
  business: string;
  part: RulePart;
  book: RuleBook;
  cond: RuleCond;
  debit: string | null;
  credit: string | null;
  priority: number;
  /** Hiệu lực theo ngày chứng từ: from ≤ ngày < to (to trống = chưa đóng). YYYY-MM-DD. */
  from: string;
  to: string | null;
}

export interface PostingBusiness {
  code: string;
  name: string;
  /** Nghiệp vụ tự tạo: nghiệp vụ hệ thống gốc; trống = nghiệp vụ hệ thống. */
  baseCode: string | null;
  /** Nghiệp vụ tự tạo: lý do chứng từ dẫn vào nghiệp vụ này. */
  reasonCode: string | null;
}

/**
 * Nhãn của một cặp Nợ / Có do luật định khoản gắn (không ghi vào sổ, không vào dấu vân tay bút toán).
 * biz: nghiệp vụ hệ thống; reason: lý do của chứng từ (dẫn tới nghiệp vụ tự tạo).
 */
export interface RuleTags {
  biz: string;
  reason?: string | null;
  gift?: boolean;
  program?: string | null;
  method?: string | null;
  leg?: 'in' | 'out';
  sameUnit?: boolean;
  /** Số tiền âm nên luật đã đổi bên Nợ / Có của cặp (quy tắc cũng đổi theo). */
  swapped?: boolean;
  /** Phía Nợ / Có là TK kho lấy theo loại kho — quy tắc không đè (TK theo loại kho thắng). */
  whDebit?: boolean;
  whCredit?: boolean;
}

export interface RuleTable {
  rules: PostingRule[];
  businesses: PostingBusiness[];
  /** Mã hàng → loại hàng (products.type_code). */
  itemTypes: Map<string, string>;
  /** Mã hàng → biến thể (products.variant_code). */
  variants?: Map<string, string>;
  /** Mã chương trình / chính sách → loại chương trình. */
  programKinds: Map<string, string>;
}

/** Giá trị của các điều kiện tại một cặp. */
export type RuleContextValues = { [K in CondKey]?: RuleCond[K] | null };

export const emptyRuleTable = (): RuleTable => ({ rules: [], businesses: [], itemTypes: new Map(), programKinds: new Map() });

/** Nghiệp vụ hệ thống của một loại chứng từ (điều chỉnh kho tách theo chiều). */
export function systemBusinessOf(docType: string, direction?: 'increase' | 'decrease'): string {
  if (docType === 'stock_adjustment') return direction === 'increase' ? 'stock_increase' : 'stock_decrease';
  return docType;
}

/** Các ô điều kiện đã điền của quy tắc. */
export function condKeys(cond: RuleCond): CondKey[] {
  return COND_KEYS.filter((k) => cond[k] !== undefined && cond[k] !== null && cond[k] !== '');
}

export function matches(cond: RuleCond, ctx: RuleContextValues): boolean {
  for (const k of condKeys(cond)) {
    const want = cond[k];
    const have = ctx[k];
    if (typeof want === 'boolean') { if (Boolean(have) !== want) return false; continue; }
    if (have === undefined || have === null || String(have) !== String(want)) return false;
  }
  return true;
}

/** Hai quy tắc có thể cùng khớp một cặp không (mọi ô cả hai cùng điền phải bằng nhau). */
export function overlaps(a: RuleCond, b: RuleCond): boolean {
  for (const k of COND_KEYS) {
    const x = a[k]; const y = b[k];
    if (x === undefined || x === null || x === '' || y === undefined || y === null || y === '') continue;
    if (String(x) !== String(y)) return false;
  }
  return true;
}

const datesOverlap = (a: PostingRule, b: PostingRule) => (a.to === null || b.from < a.to) && (b.to === null || a.from < b.to);
const booksOverlap = (a: RuleBook, b: RuleBook) => a === 'all' || b === 'all' || a === b;
const inEffect = (r: PostingRule, date: string) => r.from <= date && (r.to === null || date < r.to);

export interface RulePick {
  rule: PostingRule | null;
  /** Các quy tắc khớp, đã xếp (quy tắc thắng đứng đầu). */
  candidates: PostingRule[];
  /** Quy tắc ngang hàng với quy tắc thắng (lỗi khai báo). */
  ties: PostingRule[];
}

/** Điểm cụ thể: quy tắc của nghiệp vụ tự tạo +1000, mỗi điều kiện +10, cộng ưu tiên (để xếp). */
function score(r: PostingRule, custom: Set<string>): [number, number] {
  return [(custom.has(r.business) ? 1000 : 0) + condKeys(r.cond).length * 10, r.priority];
}

/** Chọn quy tắc cho một cặp. */
export function pickRule(table: RuleTable, q: { biz: string; reason?: string | null; part: string; book: RuleBook; date: string; ctx: RuleContextValues }): RulePick {
  const custom = new Set(table.businesses.filter((b) => b.baseCode === q.biz && q.reason && b.reasonCode === q.reason).map((b) => b.code));
  const cands = table.rules.filter((r) => (r.business === q.biz || custom.has(r.business)) && r.part === q.part
    && booksOverlap(r.book, q.book) && inEffect(r, q.date) && matches(r.cond, q.ctx));
  if (!cands.length) return { rule: null, candidates: [], ties: [] };
  const scored = cands.map((r) => ({ r, s: score(r, custom) })).sort((a, b) => b.s[0] - a.s[0] || b.s[1] - a.s[1] || Number(a.r.id) - Number(b.r.id));
  const top = scored[0]!;
  const ties = scored.slice(1).filter((x) => x.s[0] === top.s[0] && x.s[1] === top.s[1]).map((x) => x.r);
  return { rule: top.r, candidates: scored.map((x) => x.r), ties };
}

/**
 * Quy tắc mới / đề xuất có đụng quy tắc nào không: cùng nghiệp vụ, khoản tiền, sổ chồng nhau, hiệu lực chồng nhau, điều kiện có thể
 * cùng khớp, cùng số điều kiện và cùng ưu tiên → không biết chọn bên nào. `ignore`: id bỏ qua (chính nó, quy tắc nó thay).
 */
export function findTies(rule: PostingRule, others: PostingRule[], ignore: string[] = []): PostingRule[] {
  const n = condKeys(rule.cond).length;
  return others.filter((o) => !ignore.includes(o.id) && o.id !== rule.id && o.business === rule.business && o.part === rule.part
    && booksOverlap(o.book, rule.book) && datesOverlap(o, rule) && overlaps(o.cond, rule.cond)
    && condKeys(o.cond).length === n && o.priority === rule.priority
    // Cùng số điều kiện nhưng khác ô (vd. một bên theo hình thức, một bên theo loại hàng) vẫn có thể cùng khớp → đụng.
  );
}

/** Giá trị điều kiện của một cặp từ nhãn + dòng sổ. */
export function contextOf(tags: RuleTags, line: Pick<DraftLine, 'productSku' | 'taxCode'>, table: RuleTable): RuleContextValues {
  const sku = line.productSku ?? null;
  return {
    method: tags.method ?? null,
    taxCode: line.taxCode ?? null,
    itemType: sku ? table.itemTypes.get(sku) ?? null : null,
    variant: sku ? table.variants?.get(sku) ?? null : null,
    program: tags.program ?? null,
    programKind: tags.program ? table.programKinds.get(tags.program) ?? null : null,
    gift: Boolean(tags.gift),
    leg: tags.leg,
    sameUnit: tags.sameUnit,
  };
}

export interface RuleHit {
  pairNo: number;
  part: string;
  ruleId: string;
  debitBefore: string;
  creditBefore: string;
  debitAfter: string;
  creditAfter: string;
}

export interface ApplyResult {
  lines: DraftLine[];
  hits: RuleHit[];
  /** Lỗi khai báo (quy tắc ngang hàng) — người gọi chặn định khoản. */
  errors: string[];
}

/**
 * Áp bảng quy tắc lên các dòng của MỘT bút toán (dòng do EntryBuilder dựng: mỗi cặp hai dòng liền nhau, dòng Nợ trước).
 * Không đổi số tiền, chỉ đổi tài khoản. Tài khoản mới không theo dõi đối tượng thì bỏ đối tượng của dòng.
 * Dòng đã đổi mang dims.postingRule = id quy tắc (tra ngược bút toán theo quy tắc nào).
 */
export function applyRuleTable(
  lines: DraftLine[],
  table: RuleTable,
  opts: { date: string; book?: RuleBook; tracksPartner?: (account: string) => boolean },
): ApplyResult {
  const out = lines.map((l) => ({ ...l }));
  const hits: RuleHit[] = [];
  const errors: string[] = [];
  if (!table.rules.length) return { lines: strip(out), hits, errors };
  const byPair = new Map<number, DraftLine[]>();
  for (const l of out) {
    const arr = byPair.get(l.pairNo) ?? [];
    arr.push(l);
    byPair.set(l.pairNo, arr);
  }
  for (const [pairNo, pair] of byPair) {
    if (pair.length !== 2) continue;
    const [first, second] = pair as [DraftLine, DraftLine];
    const tags = first.ruleTags;
    if (!tags) continue;
    const pick = pickRule(table, { biz: tags.biz, reason: tags.reason, part: first.part, book: opts.book ?? 'internal', date: opts.date, ctx: contextOf(tags, first, table) });
    if (!pick.rule) continue;
    if (pick.ties.length) {
      errors.push(`Quy tắc định khoản #${pick.rule.id} và #${pick.ties.map((t) => t.id).join(', #')} cùng khớp ngang nhau (nghiệp vụ ${pick.rule.business}, ${partLabel(first.part)}) — đặt Ưu tiên khác nhau hoặc thêm điều kiện`);
      continue;
    }
    const r = pick.rule;
    // Luật đã đổi bên vì số âm: Nợ của quy tắc nằm ở dòng thứ hai.
    const [debitLine, creditLine] = tags.swapped ? [second, first] : [first, second];
    const hit: RuleHit = { pairNo, part: first.part, ruleId: r.id, debitBefore: debitLine.accountCode, creditBefore: creditLine.accountCode, debitAfter: debitLine.accountCode, creditAfter: creditLine.accountCode };
    let changed = false;
    if (r.debit && !tags.whDebit && r.debit !== debitLine.accountCode) { debitLine.accountCode = r.debit; changed = true; }
    if (r.credit && !tags.whCredit && r.credit !== creditLine.accountCode) { creditLine.accountCode = r.credit; changed = true; }
    hit.debitAfter = debitLine.accountCode;
    hit.creditAfter = creditLine.accountCode;
    hits.push(hit);
    if (!changed) continue;
    for (const l of [first, second]) {
      l.dims = { ...(l.dims ?? {}), postingRule: r.id };
      if (l.partnerId && opts.tracksPartner && !opts.tracksPartner(l.accountCode)) l.partnerId = null;
    }
  }
  return { lines: strip(out), hits, errors };
}

/** Bỏ nhãn trước khi ghi (nhãn chỉ dùng để chọn quy tắc). */
function strip(lines: DraftLine[]): DraftLine[] {
  return lines.map((l) => { if (!l.ruleTags) return l; const { ruleTags: _t, ...rest } = l; return rest; });
}

export const PART_LABEL: Record<RulePart, string> = { goods: 'Tiền hàng', tax: 'Thuế', cogs: 'Giá vốn', payment: 'Tiền thanh toán' };
const partLabel = (p: string) => PART_LABEL[p as RulePart] ?? p;
