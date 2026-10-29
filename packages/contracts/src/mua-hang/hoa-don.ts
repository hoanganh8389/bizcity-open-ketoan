/**
 * HOÁ ĐƠN ĐẦU VÀO CỦA NHÀ CUNG CẤP — phần tính dùng chung (máy chủ + giao diện):
 *   - Khuôn hoá đơn NCC (đầu phiếu + dòng hàng theo cách NCC ghi: mã / tên / ĐVT của họ) — nguồn: gõ tay, Excel, AI đọc ảnh / PDF, API.
 *   - Nhận diện mã: dòng hoá đơn (mã / tên / ĐVT bên NCC) → mã hàng bên mình. Thứ tự tin cậy:
 *       1. bảng nhận diện đã học (người dùng đã chọn mã cho đúng cách ghi này của NCC) — theo mã NCC, rồi theo tên;
 *       2. khai báo mặt hàng của NCC (Mặt hàng & giá mua: mã / tên hàng bên NCC);
 *       3. NCC ghi đúng mã của mình.
 *     Không khớp chắc chắn thì CHỈ GỢI Ý (điểm giống tên, cùng quy cách 400g / 800g…) — người dùng chọn, phần mềm học lại.
 *   - Đối soát hoá đơn ↔ phiếu nhập theo từng mã, quy về ĐVT nhỏ nhất, so giá CHƯA thuế sau chiết khấu, thuế suất, tổng tiền.
 */
import { ratioOf, type ProductUnit } from './gia-mua.js';

export type InvoiceSource = 'manual' | 'excel' | 'ai' | 'api';
export type InvoiceStatus = 'active' | 'cancelled';
/** alias = bảng nhận diện đã học · declared = khai mặt hàng NCC · own_sku = NCC ghi đúng mã mình · manual = người dùng chọn · none = chưa nhận diện. */
export type MatchSource = 'alias' | 'declared' | 'own_sku' | 'manual' | 'none';

export interface InvoiceLine {
  id?: string;
  lineNo: number;
  /** Mã / tên / ĐVT theo cách NCC ghi trên hoá đơn. */
  nccSku: string;
  nccName: string;
  nccUnit: string;
  qty: number;
  /** Đơn giá CHƯA thuế theo ĐVT của NCC. */
  price: number;
  discountAmount: number;
  /** Thành tiền chưa thuế (= SL × đơn giá − chiết khấu). */
  amount: number;
  /** Thuế suất %; null = không chịu thuế (KCT). */
  taxRate: number | null;
  taxAmount: number;
  /** Hàng khuyến mại / tặng kèm (giá 0). */
  isGift: boolean;
  /** Mã hàng + ĐVT bên mình (đã nhận diện / người dùng chọn). Trống = chưa nhận diện. */
  sku: string | null;
  unit: string | null;
  matchSource: MatchSource;
  /** Gợi ý khi chưa nhận diện chắc (điểm 0–1, cao trước). */
  candidates?: MatchCandidate[];
}

export interface SupplierInvoice {
  id?: string;
  partnerCode: string;
  /** Ký hiệu mẫu số (1, 01GTKT…), ký hiệu hoá đơn (C26MHZ…), số hoá đơn. */
  form: string;
  series: string;
  no: string;
  date: string;
  sellerTaxCode: string;
  sellerName: string;
  buyerTaxCode: string;
  /** Tổng theo hoá đơn (NCC ghi). */
  totalBeforeTax: number;
  totalDiscount: number;
  totalTax: number;
  total: number;
  source: InvoiceSource;
  status: InvoiceStatus;
  note: string;
  /** Thông tin thêm (hình thức thanh toán, mã tra cứu, độ tin cậy AI, tên tệp gốc…). */
  data: Record<string, unknown>;
  lines: InvoiceLine[];
  createdBy?: string; updatedBy?: string; createdAt?: string; updatedAt?: string;
  cancelledBy?: string | null; cancelledAt?: string | null; cancelReason?: string | null;
}

/** Một cách ghi đã học: NCC × (mã | tên) × ĐVT bên NCC → mã + ĐVT bên mình. */
export interface ItemAlias {
  id?: string;
  partnerCode: string;
  nccSku: string;
  nccName: string;
  nccUnit: string;
  sku: string;
  unit: string;
  hits: number;
  source: 'manual' | 'auto' | 'ai';
  lastSeenAt?: string;
  createdBy?: string; updatedBy?: string; createdAt?: string; updatedAt?: string;
}

export interface MatchCandidate { sku: string; name: string; unit?: string; score: number; why: string }

/** Khuôn JSON dịch vụ đọc hoá đơn (AI, cổng ngoài) trả về — một tệp có thể có nhiều hoá đơn. */
export interface ParsedInvoice {
  form?: string; series?: string; no: string; date?: string;
  sellerTaxCode?: string; sellerName?: string; buyerTaxCode?: string;
  /** Đơn giá trên hoá đơn đã gồm thuế (một số mẫu ghi giá thanh toán) — mặc định chưa thuế. */
  priceIncludesVat?: boolean;
  totalBeforeTax?: number; totalDiscount?: number; totalTax?: number; total?: number;
  lines: { nccSku?: string; nccName: string; nccUnit?: string; qty: number; price?: number; discountAmount?: number; amount?: number; taxRate?: number | null; taxAmount?: number; isGift?: boolean }[];
  data?: Record<string, unknown>;
}

/* ------------------------------------------------------------------ chuẩn hoá chữ */

/** Bỏ dấu, chữ thường, gom khoảng trắng; "400 g" → "400g". */
export const normText = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/gi, 'd').toLowerCase()
  .replace(/(\d)[.,](\d{3})(?!\d)/g, '$1$2').replace(/(\d)\s+(g|gr|kg|ml|l|lit|lon|hop|goi|chai|tui|vien)\b/g, '$1$2')
  .replace(/[^a-z0-9%]+/g, ' ').replace(/\s+/g, ' ').trim();
/** Khoá tên để học / tra (bỏ dấu, bỏ ký tự lạ). */
export const nameKey = (s: string) => normText(s);
export const unitKey = (s: string) => normText(s).replace(/\s/g, '');
const tokens = (s: string) => normText(s).split(' ').filter((t) => t.length > 1 || /\d/.test(t));
/** Quy cách trong tên (400g, 1.7kg, 180ml, 48 hộp…) — khác quy cách thì không phải cùng hàng dù tên gần giống. */
const specs = (s: string) => new Set(normText(s).match(/\d+(?:\.\d+)?(?:g|gr|kg|ml|l|lit|lon|hop|goi|chai|tui|vien|%)?/g) ?? []);

/** Điểm giống nhau 0–1 giữa hai tên hàng: trùng từ (Dice) + trùng cụm 2 ký tự; lệch quy cách thì giảm mạnh. */
export function nameScore(a: string, b: string): number {
  const ta = tokens(a), tb = tokens(b);
  if (!ta.length || !tb.length) return 0;
  const sb = new Set(tb);
  const common = ta.filter((t) => sb.has(t)).length;
  const dice = (2 * common) / (ta.length + tb.length);
  const big = (s: string) => { const x = normText(s).replace(/\s/g, ''); const o: string[] = []; for (let i = 0; i < x.length - 1; i++) o.push(x.slice(i, i + 2)); return o; };
  const ba = big(a), bb = big(b);
  const pool = new Map<string, number>(); for (const g of bb) pool.set(g, (pool.get(g) ?? 0) + 1);
  let hit = 0; for (const g of ba) { const n = pool.get(g) ?? 0; if (n > 0) { hit++; pool.set(g, n - 1); } }
  const bigram = ba.length + bb.length ? (2 * hit) / (ba.length + bb.length) : 0;
  let score = 0.55 * dice + 0.45 * bigram;
  const sa = specs(a), sp = specs(b);
  if (sa.size && sp.size) {
    const same = [...sa].some((x) => sp.has(x));
    score *= same ? 1 : 0.55;
  }
  return Math.round(Math.min(1, score) * 1000) / 1000;
}

/* ------------------------------------------------------------------ nhận diện mã */

export interface MatchSources {
  /** Bảng nhận diện đã học của NCC. */
  aliases: Pick<ItemAlias, 'nccSku' | 'nccName' | 'nccUnit' | 'sku' | 'unit'>[];
  /** Khai mặt hàng của NCC (mã / tên bên NCC). */
  declared: { sku: string; unit: string; nccSku?: string; nccName?: string }[];
  /** Danh mục mặt hàng (để NCC ghi đúng mã mình + gợi ý theo tên). */
  products: { sku: string; name: string; unit?: string }[];
  /** ĐVT của từng mã (đoán ĐVT bên mình theo ĐVT NCC ghi). */
  units: Record<string, ProductUnit[]>;
}

/**
 * ĐVT bên mình cho ĐVT NCC ghi: trùng tên ĐVT đã khai của mã → dùng; có ĐVT đã học / đã khai (fallback) → dùng.
 * NCC có ghi ĐVT mà mã KHÔNG có ĐVT đó → '' (chưa biết): KHÔNG đoán, vì 10 Thùng ghi thành 10 Hộp là sai số lượng —
 * người dùng chọn ĐVT tương ứng (phần mềm học cặp này). NCC không ghi ĐVT → ĐVT mua mặc định → ĐVT nhỏ nhất.
 */
export function unitFor(units: ProductUnit[] | undefined, nccUnit: string, fallback?: string): string {
  const us = units ?? [];
  const k = unitKey(nccUnit);
  const same = k ? us.find((u) => unitKey(u.unit) === k) : undefined;
  if (same) return same.unit;
  if (fallback && us.some((u) => u.unit === fallback)) return fallback;
  if (k) return '';
  return (us.find((u) => u.isPurchaseDefault) ?? us.find((u) => u.ratio === 1) ?? us[0])?.unit ?? '';
}

/** Nhận diện một dòng hoá đơn. Có mã chắc chắn → sku + unit; không → chỉ gợi ý (candidates), sku = null. */
export function matchLine(line: Pick<InvoiceLine, 'nccSku' | 'nccName' | 'nccUnit'>, src: MatchSources, maxCandidates = 5): Pick<InvoiceLine, 'sku' | 'unit' | 'matchSource' | 'candidates'> {
  const ns = line.nccSku.trim().toLowerCase(), nk = nameKey(line.nccName), uk = unitKey(line.nccUnit);
  const pick = (sku: string, unit: string | undefined, source: MatchSource) => ({ sku, unit: unit || unitFor(src.units[sku], line.nccUnit), matchSource: source, candidates: [] as MatchCandidate[] });
  // 1. Đã học: mã NCC (cùng ĐVT trước), rồi tên (cùng ĐVT trước).
  const byAlias = (f: (a: MatchSources['aliases'][number]) => boolean) => {
    const list = src.aliases.filter(f);
    return list.find((a) => unitKey(a.nccUnit) === uk) ?? list.find((a) => !a.nccUnit);
  };
  const a1 = ns ? byAlias((a) => a.nccSku.trim().toLowerCase() === ns) : undefined;
  if (a1) return pick(a1.sku, a1.unit, 'alias');
  const a2 = nk ? byAlias((a) => !!a.nccName && nameKey(a.nccName) === nk) : undefined;
  if (a2) return pick(a2.sku, a2.unit, 'alias');
  // 2. Khai mặt hàng của NCC.
  const d1 = ns ? src.declared.filter((d) => (d.nccSku ?? '').trim().toLowerCase() === ns) : [];
  const d2 = !d1.length && nk ? src.declared.filter((d) => d.nccName && nameKey(d.nccName) === nk) : [];
  const dl = d1.length ? d1 : d2;
  if (dl.length && new Set(dl.map((d) => d.sku)).size === 1) {
    const sku = dl[0]!.sku;
    const sameUnit = dl.find((d) => unitKey(d.unit) === uk);
    return pick(sku, sameUnit?.unit ?? unitFor(src.units[sku], line.nccUnit, dl[0]!.unit), 'declared');
  }
  // 3. NCC ghi đúng mã của mình.
  const own = ns ? src.products.find((p) => p.sku.toLowerCase() === ns) : undefined;
  if (own) return pick(own.sku, undefined, 'own_sku');
  // Gợi ý: so tên NCC ghi với tên hàng của mình + tên NCC đã khai / đã học (mặt hàng của NCC này được cộng điểm).
  const nccSkus = new Set([...src.declared.map((d) => d.sku), ...src.aliases.map((a) => a.sku)]);
  const nameOf = new Map(src.products.map((p) => [p.sku, p.name]));
  const best = new Map<string, MatchCandidate>();
  const consider = (sku: string, text: string, why: string, bonus: number) => {
    if (!text || !nameOf.has(sku)) return;
    const s = Math.min(1, nameScore(line.nccName, text) + bonus);
    if (s < 0.3) return;
    const cur = best.get(sku);
    if (!cur || s > cur.score) best.set(sku, { sku, name: nameOf.get(sku)!, unit: unitFor(src.units[sku], line.nccUnit), score: Math.round(s * 100) / 100, why });
  };
  for (const d of src.declared) consider(d.sku, d.nccName ?? '', 'giống tên hàng NCC đã khai', 0.05);
  for (const a of src.aliases) consider(a.sku, a.nccName, 'giống cách ghi đã học', 0.05);
  for (const p of src.products) consider(p.sku, p.name, nccSkus.has(p.sku) ? 'giống tên — mặt hàng NCC này có bán' : 'giống tên hàng', nccSkus.has(p.sku) ? 0.08 : 0);
  const candidates = [...best.values()].sort((x, y) => y.score - x.score || x.sku.localeCompare(y.sku)).slice(0, maxCandidates);
  return { sku: null, unit: null, matchSource: 'none', candidates };
}

/* ------------------------------------------------------------------ từ dữ liệu đọc được → hoá đơn */

const r2 = (x: number) => Math.round(x * 100) / 100;
const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : Number(v) || 0);

/** Chuẩn hoá hoá đơn đọc được (Excel / AI): đơn giá về CHƯA thuế, thành tiền, tiền thuế, cờ hàng tặng, tổng cộng nếu thiếu. */
export function normalizeParsed(p: ParsedInvoice): Omit<SupplierInvoice, 'partnerCode' | 'source' | 'status' | 'note'> {
  const lines: InvoiceLine[] = p.lines.filter((l) => (l.nccName || l.nccSku) && num(l.qty) !== 0).map((l, i) => {
    // Trống / null = không chịu thuế (KCT).
    const rate = l.taxRate === null || l.taxRate === undefined || (l.taxRate as unknown) === '' ? null : num(l.taxRate);
    const qty = num(l.qty);
    let price = num(l.price);
    if (p.priceIncludesVat && rate) price = price / (1 + rate / 100);
    const disc = num(l.discountAmount);
    const amount = l.amount !== undefined && !p.priceIncludesVat ? num(l.amount) : r2(qty * price - disc);
    if (!price && amount && qty) price = (amount + disc) / qty;
    const isGift = Boolean(l.isGift) || (!price && !amount);
    return {
      lineNo: i + 1, nccSku: String(l.nccSku ?? '').trim(), nccName: String(l.nccName ?? '').trim(), nccUnit: String(l.nccUnit ?? '').trim(), qty,
      price: Math.round(price * 10000) / 10000, discountAmount: disc, amount: isGift ? 0 : amount, taxRate: rate,
      taxAmount: l.taxAmount !== undefined ? num(l.taxAmount) : rate ? Math.round((amount * rate) / 100) : 0, isGift, sku: null, unit: null, matchSource: 'none',
    };
  });
  const before = lines.reduce((s, l) => s + l.amount, 0), tax = lines.reduce((s, l) => s + l.taxAmount, 0);
  return {
    form: String(p.form ?? '').trim(), series: String(p.series ?? '').trim(), no: String(p.no ?? '').trim(), date: p.date ?? '',
    sellerTaxCode: String(p.sellerTaxCode ?? '').trim(), sellerName: String(p.sellerName ?? '').trim(), buyerTaxCode: String(p.buyerTaxCode ?? '').trim(),
    totalBeforeTax: p.totalBeforeTax !== undefined ? num(p.totalBeforeTax) : r2(before), totalDiscount: num(p.totalDiscount),
    totalTax: p.totalTax !== undefined ? num(p.totalTax) : r2(tax), total: p.total !== undefined ? num(p.total) : r2(before + tax),
    data: p.data ?? {}, lines,
  };
}

/** Mã thuế đầu vào theo thuế suất trên hoá đơn: 8 → V08; null (không chịu thuế) → V13K. */
export const taxCodeOfRate = (rate: number | null) => (rate === null ? 'V13K' : `V${String(Math.round(rate)).padStart(2, '0')}`);

/** Số hoá đơn hiển thị: ký hiệu + số. */
export const invoiceLabel = (x: Pick<SupplierInvoice, 'series' | 'no'>) => (x.series ? `${x.series}-${x.no}` : x.no);

/** Cùng một hoá đơn: số giống nhau (bỏ số 0 đầu), ký hiệu giống nhau khi cả hai có ký hiệu. */
export const sameInvoice = (a: { no: string; series?: string }, b: { no: string; series?: string }) => {
  const n = (x: string) => x.trim().replace(/^0+/, '').toLowerCase();
  if (!a.no || !b.no || n(a.no) !== n(b.no)) return false;
  return !a.series || !b.series || a.series.trim().toLowerCase() === b.series.trim().toLowerCase();
};

/* ------------------------------------------------------------------ đối soát hoá đơn ↔ phiếu nhập */

export type ReconcileState = 'khop' | 'lech_sl' | 'lech_gia' | 'lech_thue' | 'thieu_tren_phieu' | 'thieu_tren_hd' | 'chua_nhan_dien';
export const RECONCILE_LABEL: Record<ReconcileState, string> = {
  khop: 'Khớp', lech_sl: 'Lệch số lượng', lech_gia: 'Lệch đơn giá', lech_thue: 'Lệch thuế suất',
  thieu_tren_phieu: 'Có trên HĐ, thiếu trên phiếu', thieu_tren_hd: 'Có trên phiếu, không có trên HĐ', chua_nhan_dien: 'Dòng HĐ chưa nhận diện mã',
};
export interface ReceiptLineLite { sku: string; unit: string; qty: number; beforeTax: number; taxRate: number | null; gift: boolean; name?: string }
export interface ReconcileRow {
  sku: string; name: string; baseUnit: string;
  invQty: number; rcptQty: number;
  /** Đơn giá chưa thuế sau CK theo ĐVT nhỏ nhất. */
  invPrice: number | null; rcptPrice: number | null;
  invAmount: number; rcptAmount: number;
  invTax: (number | null)[]; rcptTax: (number | null)[];
  states: ReconcileState[];
  nccNames: string[];
}
export interface ReconcileResult {
  rows: ReconcileRow[];
  unmatchedLines: Pick<InvoiceLine, 'lineNo' | 'nccSku' | 'nccName' | 'nccUnit' | 'qty' | 'amount'>[];
  invTotal: { beforeTax: number; tax: number; total: number };
  rcptTotal: { beforeTax: number; tax: number; total: number };
  ok: boolean;
  /** Câu tóm tắt các chỗ lệch (để hiện ở khung kiểm tra của phiếu nhập). */
  issues: string[];
}

/**
 * Đối soát theo từng mã (cả hàng tặng): SL quy ĐVT nhỏ nhất, đơn giá chưa thuế sau CK / ĐVT nhỏ nhất (lệch quá priceTol đồng),
 * thuế suất, tổng tiền (lệch quá totalTol đồng). Dòng HĐ chưa nhận diện mã → báo riêng.
 */
export function reconcileInvoice(inv: Pick<SupplierInvoice, 'lines' | 'totalBeforeTax' | 'totalTax' | 'total'>, rcpt: ReceiptLineLite[], units: Record<string, ProductUnit[]>, rcptTotal: { beforeTax: number; tax: number; total: number }, opts: { priceTol?: number; totalTol?: number; names?: Record<string, string> } = {}): ReconcileResult {
  const priceTol = opts.priceTol ?? 1, totalTol = opts.totalTol ?? 10;
  const base = (sku: string, unit: string) => ratioOf(units[sku] ?? [], unit) || 1;
  const baseUnit = (sku: string) => (units[sku] ?? []).find((u) => u.ratio === 1)?.unit ?? '';
  const map = new Map<string, ReconcileRow>();
  const row = (sku: string) => {
    let r = map.get(sku);
    if (!r) { r = { sku, name: opts.names?.[sku] ?? '', baseUnit: baseUnit(sku), invQty: 0, rcptQty: 0, invPrice: null, rcptPrice: null, invAmount: 0, rcptAmount: 0, invTax: [], rcptTax: [], states: [], nccNames: [] }; map.set(sku, r); }
    return r;
  };
  const unmatchedLines: ReconcileResult['unmatchedLines'] = [];
  for (const l of inv.lines) {
    if (!l.sku) { unmatchedLines.push({ lineNo: l.lineNo, nccSku: l.nccSku, nccName: l.nccName, nccUnit: l.nccUnit, qty: l.qty, amount: l.amount }); continue; }
    const r = row(l.sku);
    r.invQty += l.qty * base(l.sku, l.unit ?? '');
    r.invAmount += l.amount;
    if (!l.isGift && !r.invTax.includes(l.taxRate)) r.invTax.push(l.taxRate);
    if (l.nccName && !r.nccNames.includes(l.nccName)) r.nccNames.push(l.nccName);
  }
  for (const l of rcpt) {
    if (!l.sku) continue;
    const r = row(l.sku);
    if (!r.name && l.name) r.name = l.name;
    r.rcptQty += l.qty * base(l.sku, l.unit);
    r.rcptAmount += l.beforeTax;
    if (!l.gift && !r.rcptTax.includes(l.taxRate)) r.rcptTax.push(l.taxRate);
  }
  const issues: string[] = [];
  const q = (x: number) => x.toLocaleString('vi-VN', { maximumFractionDigits: 2 });
  for (const r of map.values()) {
    r.invQty = r2(r.invQty); r.rcptQty = r2(r.rcptQty); r.invAmount = r2(r.invAmount); r.rcptAmount = r2(r.rcptAmount);
    r.invPrice = r.invQty ? r2(r.invAmount / r.invQty) : null;
    r.rcptPrice = r.rcptQty ? r2(r.rcptAmount / r.rcptQty) : null;
    if (!r.rcptQty && r.invQty) r.states.push('thieu_tren_phieu');
    else if (!r.invQty && r.rcptQty) r.states.push('thieu_tren_hd');
    else {
      if (Math.abs(r.invQty - r.rcptQty) > 1e-6) r.states.push('lech_sl');
      if (r.invPrice !== null && r.rcptPrice !== null && Math.abs(r.invPrice - r.rcptPrice) > priceTol && Math.abs(r.invAmount - r.rcptAmount) > totalTol) r.states.push('lech_gia');
      const t = (x: (number | null)[]) => x.map((v) => (v === null ? 'KCT' : String(v))).sort().join(',');
      if (r.invTax.length && r.rcptTax.length && t(r.invTax) !== t(r.rcptTax)) r.states.push('lech_thue');
    }
    if (!r.states.length) r.states.push('khop');
    const u = r.baseUnit ? ` ${r.baseUnit}` : '';
    if (r.states.includes('thieu_tren_phieu')) issues.push(`${r.sku}: HĐ có ${q(r.invQty)}${u}, phiếu không có`);
    if (r.states.includes('thieu_tren_hd')) issues.push(`${r.sku}: phiếu có ${q(r.rcptQty)}${u}, HĐ không có`);
    if (r.states.includes('lech_sl')) issues.push(`${r.sku}: SL HĐ ${q(r.invQty)}${u} / phiếu ${q(r.rcptQty)}${u}`);
    if (r.states.includes('lech_gia')) issues.push(`${r.sku}: giá chưa thuế HĐ ${q(r.invPrice!)} / phiếu ${q(r.rcptPrice!)} mỗi${u || ' ĐVT'}`);
    if (r.states.includes('lech_thue')) issues.push(`${r.sku}: thuế suất HĐ ${r.invTax.map((v) => (v === null ? 'KCT' : `${v}%`)).join(', ')} / phiếu ${r.rcptTax.map((v) => (v === null ? 'KCT' : `${v}%`)).join(', ')}`);
  }
  if (unmatchedLines.length) issues.push(`${unmatchedLines.length} dòng HĐ chưa nhận diện mã: ${unmatchedLines.slice(0, 3).map((l) => l.nccName || l.nccSku).join('; ')}${unmatchedLines.length > 3 ? '…' : ''}`);
  const invTotal = { beforeTax: r2(inv.totalBeforeTax), tax: r2(inv.totalTax), total: r2(inv.total) };
  if (Math.abs(invTotal.total - rcptTotal.total) > totalTol) issues.push(`Tổng thanh toán HĐ ${q(invTotal.total)} / phiếu ${q(rcptTotal.total)} (lệch ${q(r2(invTotal.total - rcptTotal.total))})`);
  else if (Math.abs(invTotal.tax - rcptTotal.tax) > totalTol) issues.push(`Tiền thuế HĐ ${q(invTotal.tax)} / phiếu ${q(rcptTotal.tax)}`);
  const rows = [...map.values()].sort((a, b) => Number(a.states.includes('khop')) - Number(b.states.includes('khop')) || a.sku.localeCompare(b.sku));
  return { rows, unmatchedLines, invTotal, rcptTotal, ok: !issues.length, issues };
}

/** Dòng phiếu nhập lập từ hoá đơn NCC (mọi dòng đã nhận diện mã): giá chưa thuế, thuế theo hoá đơn, hàng tặng → dòng quà. */
export function linesFromInvoice(inv: Pick<SupplierInvoice, 'lines'>, names: Record<string, string> = {}): { sku: string; name: string; unit: string; qty: number; price: number; discountAmt?: number; taxCode: string; gift: boolean; nccSku: string; nccName: string }[] {
  return inv.lines.filter((l) => l.sku).map((l) => ({
    sku: l.sku!, name: names[l.sku!] ?? l.nccName, unit: l.unit ?? l.nccUnit, qty: l.qty, price: l.isGift ? 0 : l.price,
    ...(l.discountAmount && !l.isGift ? { discountAmt: l.discountAmount } : {}), taxCode: taxCodeOfRate(l.taxRate), gift: l.isGift, nccSku: l.nccSku, nccName: l.nccName,
  }));
}
