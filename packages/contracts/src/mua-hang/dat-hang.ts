/**
 * ĐẶT HÀNG TỰ ĐỘNG — mọi việc đi từ ĐƠN ĐẶT MUA của nhà cung cấp:
 *   orderProgress     đơn đã nhận bao nhiêu / còn bao nhiêu từng mã (cộng mọi phiếu nhập giao theo đơn, trừ phiếu huỷ) — so
 *                     theo ĐVT NHỎ NHẤT (đặt 10 Thùng 48, nhận 240 Hộp = nhận 5 Thùng), hiển thị theo ĐVT của dòng đơn
 *   receiptFromOrder  lập phiếu nhập kho từ đơn: chép phần CÒN LẠI (mã, ĐVT, SL, đơn giá, CK, thuế suất), hàng tặng theo tỷ lệ
 *   codeSwaps         phiếu nhập dùng mã khác mã đã đặt nhưng cùng mã hàng thường (đổi mã K/M/Q/T) — phải được duyệt
 *   importRows        đọc bảng Excel (đơn đặt / phiếu nhập) theo TÊN CỘT, gom theo NCC + chi nhánh + số hoá đơn thành phiếu
 */
import { TAX_RATE, type LineType, type PDoc, type PLine, type Policy } from './engine.js';
import { ratioOf, baseUnitOf, type ProductUnit, type SupplierProduct } from './gia-mua.js';
import { autoLineType, skuInfo } from './ma-hang.js';

const n = (v: unknown) => { const x = typeof v === 'number' ? v : Number(String(v ?? '').replace(/\s/g, '').replace(/\.(?=\d{3}(\D|$))/g, '').replace(',', '.')); return Number.isFinite(x) ? x : 0; };

/* ------------------------------------------------------------------ tiến độ đơn đặt */

/** ordered / received / remaining theo ĐVT của dòng đơn (unit); *Base theo ĐVT nhỏ nhất (baseUnit) — số dùng để so, trừ tồn. */
export interface OrderLineProgress { sku: string; name: string; unit: string; ordered: number; received: number; remaining: number; price: number; baseUnit: string; orderedBase: number; receivedBase: number; remainingBase: number }
export type UnitMap = Record<string, ProductUnit[]>;
/** Tỉ lệ ĐVT về ĐVT nhỏ nhất (mã đổi K/M/Q/T chưa khai ĐVT thì lấy ĐVT của mã đã đặt; không biết thì 1). */
export const ratioIn = (units: UnitMap | undefined, sku: string, unit: string, alt?: string) => ratioOf(units?.[sku]?.length ? units[sku]! : alt ? units?.[alt] ?? [] : [], unit);
const r4 = (x: number) => Math.round(x * 10000) / 10000;
/** ordered / received / remaining của cả đơn: theo ĐVT nhỏ nhất. */
/**
 * Tiến độ đơn: lines / ordered / received / remaining = HÀNG MUA (phân tích đặt hàng, hạn mức dùng); gifts = hàng tặng trên đơn (theo mã,
 * ĐVT dòng đơn). done = đủ hàng mua VÀ đủ quà (quà là một phần thoả thuận khi đặt — thiếu quà thì đơn chưa xong).
 */
export interface OrderProgress { lines: OrderLineProgress[]; gifts: OrderLineProgress[]; ordered: number; received: number; remaining: number; buyDone: boolean; giftShort: number; done: boolean; receipts: string[] }

/* ------------------------------------------------------------------ đối chiếu đơn đặt ↔ phiếu nhập (theo vết) */

/** Tình trạng một dòng đối chiếu: đủ · thiếu (còn phải giao) · thừa · ngoài đơn (mã không có trong đơn) · đổi mã (cùng mã gốc). */
export type ReconState = 'du' | 'thieu' | 'thua' | 'ngoai_don' | 'doi_ma';
export interface ReconReceipt { id: string; docNo: string; docDate: string; status: string; sku: string; qty: number; unit: string; price: number }
export interface ReconLine {
  sku: string; name: string; unit: string;
  /** SL theo ĐVT của dòng đơn (mã ngoài đơn: ĐVT của phiếu nhập). received = phiếu ĐÃ DUYỆT; pending = phiếu nháp / chờ duyệt. */
  ordered: number; received: number; pending: number; diff: number; state: ReconState;
  /** Đơn giá đặt / đơn giá nhập bình quân (phiếu đã duyệt), cùng ĐVT của dòng + cùng loại giá (gồm / chưa thuế) của đơn. */
  orderPrice: number | null; receivedPrice: number | null; priceDiffPct: number | null;
  /** Mã thực nhận khác mã đặt (đổi mã K/M/Q/T). */
  swappedTo: string[];
  receipts: ReconReceipt[];
}

/**
 * ĐỐI CHIẾU ĐƠN ĐẶT ↔ PHIẾU NHẬP theo từng mã: đặt / đã nhận (phiếu đã duyệt) / đang chờ (nháp, chờ duyệt) / chênh, lệch giá, mã
 * giao ngoài đơn, đổi mã — kèm danh sách phiếu nhập của từng mã để theo vết. So theo ĐVT NHỎ NHẤT, hiển thị theo ĐVT dòng đơn.
 */
export function orderReconcile(order: PDoc, docs: PDoc[], units?: UnitMap): ReconLine[] {
  const recs = receiptsOfOrder(order, docs);
  const out = new Map<string, ReconLine & { ob: number; rb: number; pb: number; pv: number; pq: number }>();
  const toOrderBasis = (price: number, inc: boolean, taxCode: string) => (inc === order.priceIncludesVat ? price : inc ? price / (1 + (TAX_RATE[taxCode] ?? 0) / 100) : price * (1 + (TAX_RATE[taxCode] ?? 0) / 100));
  for (const l of order.lines.filter((x) => x.lineType === 'buy' && x.sku)) {
    const cur = out.get(l.sku) ?? { sku: l.sku, name: l.name, unit: l.unit, ordered: 0, received: 0, pending: 0, diff: 0, state: 'du' as ReconState, orderPrice: l.price, receivedPrice: null, priceDiffPct: null, swappedTo: [], receipts: [], ob: 0, rb: 0, pb: 0, pv: 0, pq: 0 };
    cur.ob += l.qty * ratioIn(units, l.sku, l.unit);
    out.set(l.sku, cur);
  }
  for (const r of recs) for (const l of r.lines.filter((x) => x.lineType === 'buy' && x.sku)) {
    const key = out.has(l.sku) ? l.sku : [...out.keys()].find((k) => out.get(k)!.state !== 'ngoai_don' && skuInfo(k).base === skuInfo(l.sku).base);
    let row = key ? out.get(key)! : undefined;
    if (!row) {
      row = { sku: l.sku, name: l.name, unit: l.unit, ordered: 0, received: 0, pending: 0, diff: 0, state: 'ngoai_don', orderPrice: null, receivedPrice: null, priceDiffPct: null, swappedTo: [], receipts: [], ob: 0, rb: 0, pb: 0, pv: 0, pq: 0 };
      out.set(l.sku, row);
    } else if (l.sku !== row.sku && !row.swappedTo.includes(l.sku)) row.swappedTo.push(l.sku);
    const base = l.qty * ratioIn(units, l.sku, l.unit, row.sku);
    if (r.status === 'approved') {
      row.rb += base;
      // Giá nhập quy về ĐVT của dòng đơn + loại giá của đơn, bình quân theo số lượng.
      const perBase = toOrderBasis(l.price, r.priceIncludesVat, l.taxCode) / (ratioIn(units, l.sku, l.unit, row.sku) || 1);
      row.pv += perBase * base; row.pq += base;
    } else row.pb += base;
    row.receipts.push({ id: r.id, docNo: r.docNo, docDate: r.docDate, status: r.status, sku: l.sku, qty: l.qty, unit: l.unit, price: l.price });
  }
  return [...out.values()].map(({ ob, rb, pb, pv, pq, ...x }) => {
    const ratio = ratioIn(units, x.sku, x.unit) || 1;
    const receivedPrice = pq ? r4((pv / pq) * ratio) : null;
    const state: ReconState = x.state === 'ngoai_don' ? 'ngoai_don' : x.swappedTo.length ? 'doi_ma' : rb > ob + 1e-6 ? 'thua' : rb < ob - 1e-6 ? 'thieu' : 'du';
    return { ...x, ordered: r4(ob / ratio), received: r4(rb / ratio), pending: r4(pb / ratio), diff: r4((rb - ob) / ratio), state, receivedPrice,
      priceDiffPct: receivedPrice !== null && x.orderPrice ? Math.round(((receivedPrice - x.orderPrice) / x.orderPrice) * 10000) / 100 : null };
  });
}

/** Phiếu nhập (chưa huỷ) giao theo đơn — phiếu nháp cũng tính để không lập trùng. */
export const receiptsOfOrder = (order: Pick<PDoc, 'id'>, docs: PDoc[]) => docs.filter((d) => d.kind === 'receipt' && d.status !== 'cancelled' && (d.refIds ?? []).includes(order.id));

export function orderProgress(order: PDoc, docs: PDoc[], excludeId?: string, units?: UnitMap): OrderProgress {
  const recs = receiptsOfOrder(order, docs).filter((d) => d.id !== excludeId);
  const map = new Map<string, OrderLineProgress>();
  for (const l of order.lines.filter((x) => x.lineType === 'buy' && x.sku)) {
    const cur = map.get(l.sku) ?? { sku: l.sku, name: l.name, unit: l.unit, ordered: 0, received: 0, remaining: 0, price: l.price, baseUnit: baseUnitOf(units?.[l.sku] ?? []) || l.unit, orderedBase: 0, receivedBase: 0, remainingBase: 0 };
    cur.orderedBase += l.qty * ratioIn(units, l.sku, l.unit);
    map.set(l.sku, cur);
  }
  for (const r of recs) for (const l of r.lines.filter((x) => x.lineType === 'buy')) {
    // Nhận bằng mã khác (đổi mã K/M/Q/T) vẫn trừ vào mã hàng thường đã đặt; nhận ĐVT khác thì quy về ĐVT nhỏ nhất.
    const key = map.has(l.sku) ? l.sku : [...map.keys()].find((k) => skuInfo(k).base === skuInfo(l.sku).base);
    if (key) map.get(key)!.receivedBase += l.qty * ratioIn(units, l.sku, l.unit, key);
  }
  const lines = [...map.values()].map((x) => {
    const r = ratioIn(units, x.sku, x.unit) || 1;
    const remainingBase = Math.max(0, x.orderedBase - x.receivedBase);
    return { ...x, ordered: r4(x.orderedBase / r), received: r4(x.receivedBase / r), remaining: r4(remainingBase / r), orderedBase: r4(x.orderedBase), receivedBase: r4(x.receivedBase), remainingBase: r4(remainingBase) };
  });
  // Hàng tặng: đặt theo mã trên đơn, nhận = dòng tặng (không phải hàng mua) cùng mã trên các phiếu nhập theo đơn.
  const gm = new Map<string, OrderLineProgress>();
  for (const l of order.lines.filter((x) => x.lineType !== 'buy' && x.sku)) {
    const cur = gm.get(l.sku) ?? { sku: l.sku, name: l.name, unit: l.unit, ordered: 0, received: 0, remaining: 0, price: 0, baseUnit: baseUnitOf(units?.[l.sku] ?? []) || l.unit, orderedBase: 0, receivedBase: 0, remainingBase: 0 };
    cur.orderedBase += l.qty * ratioIn(units, l.sku, l.unit);
    gm.set(l.sku, cur);
  }
  for (const r of recs) for (const l of r.lines.filter((x) => x.lineType !== 'buy' && x.sku)) {
    const key = gm.has(l.sku) ? l.sku : [...gm.keys()].find((k) => skuInfo(k).base === skuInfo(l.sku).base);
    if (key) gm.get(key)!.receivedBase += l.qty * ratioIn(units, l.sku, l.unit, key);
  }
  const fin = (x: OrderLineProgress) => {
    const r = ratioIn(units, x.sku, x.unit) || 1;
    const remainingBase = Math.max(0, x.orderedBase - x.receivedBase);
    return { ...x, ordered: r4(x.orderedBase / r), received: r4(x.receivedBase / r), remaining: r4(remainingBase / r), orderedBase: r4(x.orderedBase), receivedBase: r4(x.receivedBase), remainingBase: r4(remainingBase) };
  };
  const gifts = [...gm.values()].map(fin);
  // Tổng cả đơn tính theo ĐVT nhỏ nhất (cộng được giữa các mã / ĐVT khác nhau) — chỉ hàng mua.
  const ordered = r4(lines.reduce((s, x) => s + x.orderedBase, 0)), received = r4(lines.reduce((s, x) => s + Math.min(x.receivedBase, x.orderedBase), 0));
  const buyDone = lines.length > 0 && lines.every((x) => x.remainingBase <= 0);
  const giftShort = r4(gifts.reduce((s, x) => s + x.remainingBase, 0));
  return { lines, gifts, ordered, received, remaining: r4(ordered - received), buyDone, giftShort, done: buyDone && giftShort <= 0, receipts: recs.map((r) => r.docNo || r.id) };
}

let seq = 0;
const key = () => `L${Date.now().toString(36)}${(seq++).toString(36)}`;

/** Phiếu nhập kho lập từ đơn đặt: phần còn lại của từng mã; hàng tặng trên đơn chia theo tỷ lệ phần còn lại. */
export function receiptFromOrder(order: PDoc, docs: PDoc[], date: string, units?: UnitMap): PDoc {
  const prog = orderProgress(order, docs, undefined, units);
  const rate = (sku: string) => { const p = prog.lines.find((x) => x.sku === sku); return p && p.ordered ? p.remaining / p.ordered : 0; };
  // Quà còn thiếu theo mã (ĐVT nhỏ nhất) — không chép quá phần còn thiếu, kể cả khi chia theo tỷ lệ.
  const giftLeft = new Map(prog.gifts.map((g) => [g.sku, g.remainingBase]));
  const lines: PLine[] = [];
  for (const l of order.lines) {
    if (l.lineType === 'buy' && !l.sku) {
      // Hàng mới chưa có mã: chép nguyên dòng (chưa phiếu nhập nào nhận) — người nhập gắn mã, máy chủ ghi ngược mã vào đơn.
      const got = docs.some((d) => d.kind === 'receipt' && d.status !== 'cancelled' && (d.refIds ?? []).includes(order.id) && d.lines.some((x) => x.refLineKey === l.lineKey));
      if (!got && l.qty > 0) lines.push({ ...l, lineKey: key(), refLineKey: l.lineKey, stockInfo: undefined, lotNo: undefined, expDate: undefined, mfgDate: undefined });
    } else if (l.lineType === 'buy') {
      const p = prog.lines.find((x) => x.sku === l.sku);
      if (p && p.remaining > 0 && !lines.some((x) => x.sku === l.sku && x.lineType === 'buy')) lines.push({ ...l, lineKey: key(), refLineKey: l.lineKey, qty: p.remaining, stockInfo: undefined, lotNo: undefined, expDate: undefined, mfgDate: undefined });
    } else {
      // Hàng tặng: theo tỷ lệ phần còn lại của mã mua cùng chương trình (cùng mã, không có thì giữ nguyên nếu chưa nhận lần nào).
      // Hàng mua đã đủ mà quà còn thiếu: chép phần quà còn thiếu (NCC giao bù quà). Không bao giờ quá phần quà còn thiếu.
      const ratio = ratioIn(units, l.sku, l.unit) || 1;
      const left = (giftLeft.get(l.sku) ?? 0) / ratio;
      const r = prog.lines.some((x) => x.sku === l.sku) ? rate(l.sku) : prog.received === 0 ? 1 : 0;
      const want = prog.buyDone ? left : Math.round(l.qty * r);
      const qty = Math.min(want, Math.max(0, left));
      if (qty > 0) {
        giftLeft.set(l.sku, (giftLeft.get(l.sku) ?? 0) - qty * ratio);
        lines.push({ ...l, lineKey: key(), qty: r4(qty), lotNo: undefined, expDate: undefined, mfgDate: undefined });
      }
    }
  }
  return {
    id: `new-${Date.now()}`, kind: 'receipt', status: 'draft', docNo: '', docDate: date, receivedDate: date, branchCode: order.branchCode, partnerCode: order.partnerCode, ...(order.deliveryWarehouse ? { warehouseCode: order.deliveryWarehouse } : {}),
    brandCode: order.brandCode, priceIncludesVat: order.priceIncludesVat, orderDiscount: order.orderDiscount, term: order.term, cktt: order.cktt,
    refIds: [order.id], lines, note: `Nhận hàng theo đơn ${order.docNo}${prog.received ? ` (giao tiếp, đã nhận ${prog.received}/${prog.ordered})` : ''}`,
  };
}

/** Dòng phiếu nhập dùng mã khác mã đã đặt nhưng cùng mã hàng thường (ví dụ đặt 110154029, nhập 110154029Q). */
export function codeSwaps(order: PDoc, receipt: PDoc): { from: string; to: string }[] {
  const ordered = new Set(order.lines.map((l) => l.sku));
  const out: { from: string; to: string }[] = [];
  for (const l of receipt.lines.filter((x) => x.sku && !ordered.has(x.sku))) {
    const from = [...ordered].find((o) => skuInfo(o).base === skuInfo(l.sku).base);
    if (from && !out.some((x) => x.to === l.sku)) out.push({ from, to: l.sku });
  }
  return out;
}

/* ------------------------------------------------------------------ nhập Excel */

/** Tên cột chấp nhận (không phân biệt hoa thường, dấu) → trường. Đúng dạng file xuất phiếu nhập / bảng kê của NCC. */
const COLS: [keyof ImportRow, string[]][] = [
  ['partnerCode', ['ma ncc', 'ma nha cung cap', 'ncc']],
  ['sku', ['ma hang', 'ma sp', 'ma san pham', 'sku', 'ma vt']],
  ['name', ['ten hang', 'ten san pham', 'ten sp']],
  ['unit', ['dvt', 'don vi tinh', 'dvcb']],
  ['qty', ['so luong', 'sl', 'so luong cua dvcb']],
  ['price', ['don gia', 'gia', 'don gia chua thue']],
  ['discountPct', ['ck(%)', 'ck (%)', 'ck %', 'chiet khau (%)', 'ck']],
  ['invoiceNo', ['so hd', 'so hoa don', 'hd']],
  ['lotNo', ['lotno', 'so lo', 'lo']],
  ['expDate', ['expdate', 'han dung', 'han su dung', 'hsd']],
  ['branchCode', ['chi nhanh', 'ma chi nhanh']],
  ['warehouseCode', ['ma kho', 'phan kho', 'kho', 'kho nhan', 'giao tai kho']],
  ['date', ['ngay', 'ngay hd', 'ngay chung tu']],
  ['note', ['ghi chu', 'dien giai']],
];
export interface ImportRow { partnerCode?: string; sku: string; name?: string; unit?: string; qty: number; price: number; discountPct?: number; invoiceNo?: string; lotNo?: string; expDate?: string; branchCode?: string; /** Phân kho (không bắt buộc): trống = kho mặc định của chi nhánh. */ warehouseCode?: string; date?: string; note?: string }
export interface ImportResult { rows: (ImportRow & { row: number; error?: string })[]; columns: Record<string, string>; missing: string[] }

const plain = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/gi, 'd').toLowerCase().replace(/\s+/g, ' ').trim();
/** Ngày Excel (số sê-ri, dd/mm/yyyy, m/d/yyyy h:mm, yyyy-mm-dd) → yyyy-mm-dd. */
export function excelDate(v: unknown): string | undefined {
  if (v === null || v === undefined || v === '') return undefined;
  if (typeof v === 'number' && v > 20000 && v < 80000) return new Date(Date.UTC(1899, 11, 30) + Math.floor(v) * 86_400_000).toISOString().slice(0, 10);
  const s = String(v).trim();
  let m = /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(s);
  if (m) return `${m[1]}-${m[2]!.padStart(2, '0')}-${m[3]!.padStart(2, '0')}`;
  m = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})/.exec(s);
  if (m) {
    // Phần nào > 12 là ngày; không phân biệt được thì theo kiểu Việt Nam dd/mm.
    const [a, b] = [Number(m[1]), Number(m[2])];
    const [d, mo] = b > 12 && a <= 12 ? [b, a] : [a, b];
    return `${m[3]}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
  }
  return undefined;
}

/** Đọc bảng (mảng các dòng, dòng tiêu đề là dòng đầu có cột "Mã hàng"). */
export function importRows(table: unknown[][]): ImportResult {
  const headerAt = table.findIndex((r) => r.some((c) => ['ma hang', 'ma sp', 'sku'].includes(plain(String(c ?? '')))));
  if (headerAt < 0) return { rows: [], columns: {}, missing: ['Mã hàng'] };
  const header = table[headerAt]!.map((c) => plain(String(c ?? '')));
  const idx: Partial<Record<keyof ImportRow, number>> = {};
  const columns: Record<string, string> = {};
  for (const [field, names] of COLS) {
    const i = header.findIndex((h) => names.includes(h));
    if (i >= 0) { idx[field] = i; columns[field] = String(table[headerAt]![i]); }
  }
  const missing = (['sku', 'qty'] as const).filter((f) => idx[f] === undefined).map((f) => (f === 'sku' ? 'Mã hàng' : 'Số lượng'));
  const rows: ImportResult['rows'] = [];
  table.slice(headerAt + 1).forEach((r, i) => {
    const get = (f: keyof ImportRow) => (idx[f] === undefined ? undefined : r[idx[f]!]);
    const sku = String(get('sku') ?? '').trim();
    if (!sku) return;
    const row = {
      row: headerAt + i + 2, sku, partnerCode: String(get('partnerCode') ?? '').trim() || undefined, name: String(get('name') ?? '').trim() || undefined,
      unit: String(get('unit') ?? '').trim() || undefined, qty: n(get('qty')), price: n(get('price')), discountPct: get('discountPct') === undefined || get('discountPct') === '' ? undefined : n(get('discountPct')),
      invoiceNo: String(get('invoiceNo') ?? '').trim() || undefined, lotNo: String(get('lotNo') ?? '').trim() || undefined, expDate: excelDate(get('expDate')),
      branchCode: String(get('branchCode') ?? '').trim() || undefined, warehouseCode: String(get('warehouseCode') ?? '').trim() || undefined, date: excelDate(get('date')), note: String(get('note') ?? '').trim() || undefined,
    };
    rows.push({ ...row, error: !(row.qty > 0) ? 'Số lượng phải > 0' : row.price < 0 ? 'Đơn giá âm' : undefined });
  });
  return { rows, columns, missing };
}

/** Gom dòng đã đọc thành phiếu nháp: theo NCC + chi nhánh + phân kho + số hoá đơn (phân kho trống = kho mặc định; đơn đặt: kho giao). Dòng giá 0 = hàng tặng (loại tự suy theo mã / chính sách). */
export function docsFromImport(rows: ImportRow[], opts: { kind: 'order' | 'receipt'; date: string; partnerCode?: string; branchCode?: string; priceIncludesVat: boolean; policies: Policy[]; taxOf: (sku: string) => string; nameOf: (sku: string) => { name: string; unit: string } | undefined }): PDoc[] {
  const groups = new Map<string, ImportRow[]>();
  for (const r of rows) {
    const k = [r.partnerCode || opts.partnerCode || '', r.branchCode || opts.branchCode || '', opts.kind === 'receipt' ? r.invoiceNo ?? '' : '', r.warehouseCode ?? ''].join('|');
    groups.set(k, [...(groups.get(k) ?? []), r]);
  }
  return [...groups.entries()].map(([k, rs]) => {
    const [partnerCode, branchCode, invoiceNo, kho] = k.split('|') as [string, string, string, string];
    const date = rs.find((r) => r.date)?.date ?? opts.date;
    const ctx = { policies: opts.policies, date, partnerCode, branchCode };
    const lines: PLine[] = rs.map((r) => {
      const cat = opts.nameOf(r.sku);
      const lineType: LineType = autoLineType(r.sku, r.price, ctx);
      return { lineKey: key(), sku: r.sku, name: cat?.name ?? r.name ?? r.sku, unit: cat?.unit ?? r.unit ?? '', qty: r.qty, price: lineType === 'buy' ? r.price : 0, taxCode: opts.taxOf(r.sku), lineType, discountPct: lineType === 'buy' ? r.discountPct : undefined, lotNo: r.lotNo, expDate: r.expDate };
    });
    return {
      id: `new-${Date.now()}-${k}`, kind: opts.kind, status: 'draft', docNo: '', docDate: date, receivedDate: opts.kind === 'receipt' ? date : undefined, branchCode, partnerCode, priceIncludesVat: opts.priceIncludesVat,
      ...(kho ? (opts.kind === 'order' ? { deliveryWarehouse: kho } : { warehouseCode: kho }) : {}),
      ...(invoiceNo ? { invoice: { no: invoiceNo, date } } : {}), lines, note: `Nhập từ Excel (${rs.length} dòng)`,
    } as PDoc;
  });
}

/* ------------------------------------------------------------------ mặt hàng NCC cung cấp */

export interface SupplierItem { sku: string; name?: string; unit?: string; nccSku?: string; price?: number | null; priceIncludesVat?: boolean; declared: boolean; lastDate?: string; lastQty?: number; lastPrice?: number; lastIncludesVat?: boolean; lastDocNo?: string; lastUnit?: string; rowId?: string }

/**
 * Mặt hàng của một NCC: dòng đã khai ở "Mặt hàng & giá mua" (supplier_products của NCC) + mã đã từng mua của NCC (đơn đặt /
 * phiếu nhập), kèm lần mua gần nhất (ngày, ĐVT, SL, đơn giá) — dùng để điền sẵn dòng hàng khi lập đơn / phiếu cho NCC.
 */
export function supplierItemsOf(partnerCode: string, rows: SupplierProduct[], docs: PDoc[]): SupplierItem[] {
  const map = new Map<string, SupplierItem>();
  for (const r of rows.filter((x) => x.isActive && x.partnerCode === partnerCode).sort((a, b) => (b.validFrom ?? '').localeCompare(a.validFrom ?? ''))) {
    if (!map.has(r.sku)) map.set(r.sku, { sku: r.sku, unit: r.unit, nccSku: r.nccSku || undefined, price: r.price, priceIncludesVat: r.priceIncludesVat, declared: true, rowId: r.id });
  }
  const hist = docs.filter((d) => d.partnerCode === partnerCode && (d.kind === 'receipt' || d.kind === 'order') && d.status !== 'cancelled').sort((a, b) => b.docDate.localeCompare(a.docDate));
  for (const d of hist) for (const l of d.lines.filter((x) => x.lineType === 'buy' && x.sku)) {
    const cur = map.get(l.sku) ?? { sku: l.sku, declared: false };
    if (!cur.lastDate) Object.assign(cur, { name: cur.name ?? l.name, unit: cur.unit ?? l.unit, lastDate: d.docDate, lastQty: l.qty, lastPrice: l.price, lastIncludesVat: d.priceIncludesVat, lastDocNo: d.docNo, lastUnit: l.unit });
    map.set(l.sku, cur);
  }
  return [...map.values()].sort((a, b) => Number(b.declared) - Number(a.declared) || (b.lastDate ?? '').localeCompare(a.lastDate ?? '') || a.sku.localeCompare(b.sku));
}

/**
 * Đọc bảng Excel tổng quát theo tên cột (không phân biệt hoa thường, dấu): spec = [trường, các tên cột chấp nhận].
 * keepBlankKey: giữ cả dòng có dữ liệu mà trống cột khoá (để báo đỏ "thiếu mã"), mặc định bỏ.
 */
export function readTable<K extends string>(table: unknown[][], spec: [K, string[]][], keyField: K, opts: { keepBlankKey?: boolean } = {}): { rows: (Record<K, string> & { row: number })[]; columns: Partial<Record<K, string>>; missing: K[] } {
  const keyNames = spec.find((s) => s[0] === keyField)?.[1] ?? [];
  const headerAt = table.findIndex((r) => r.some((c) => keyNames.includes(plain(String(c ?? '')))));
  if (headerAt < 0) return { rows: [], columns: {}, missing: [keyField] };
  const header = table[headerAt]!.map((c) => plain(String(c ?? '')));
  const idx: Partial<Record<K, number>> = {}, columns: Partial<Record<K, string>> = {};
  for (const [f, names] of spec) { const i = header.findIndex((h) => names.includes(h)); if (i >= 0) { idx[f] = i; columns[f] = String(table[headerAt]![i]); } }
  const rows = table.slice(headerAt + 1).map((r, i) => {
    const o = { row: headerAt + i + 2 } as Record<K, string> & { row: number };
    for (const [f] of spec) (o as Record<string, unknown>)[f] = idx[f] === undefined ? '' : String(r[idx[f]!] ?? '').trim();
    return o;
  }).filter((o) => o[keyField] || (opts.keepBlankKey && spec.some(([f]) => o[f])));
  return { rows, columns, missing: idx[keyField] === undefined ? [keyField] : [] };
}
