// [2026-10-29 10:24 PM Johnny Chu - Chu Hoàng Anh] INIT — khởi tạo Bizcity Core Framework: sổ cái chỉ thêm, cửa nạp sự việc, CANON, hợp đồng, bộ kiểm chuẩn.
// [2026-10-30 06:18 PM Nguyễn Văn Thủy] R-REV — công thức đặt hàng: thêm "Kho lấy min" (minWarehouses, tuỳ chọn) (commit 6c085e9, đóng góp).
// [2026-10-31 04:53 PM Johnny Chu - Chu Hoàng Anh] R-REV — duyệt thay đổi của Nguyễn Văn Thủy (commit 6c085e9), biên bản docs/audits/REVIEW-2026-10-31-THUY.md §7.
// [2026-11-13 10:00 AM kiennt] NT-MH-004 — chuyển hàng xuống shop: tuỳ chọn làm tròn chung (theo mã / nguyên thùng / không làm tròn), phân bổ khi kho thiếu (thiếu nhiều nhất / theo thứ tự shop / chia đều / chỉnh tay).
/**
 * TỒN MAX → CHUYỂN HÀNG SHOP → ĐẶT MUA (docs/nghiep-vu/09-ton-max-dat-hang.md). Hàm thuần, dùng chung máy chủ + giao diện.
 *
 *   suggestMax        gợi ý max shop = bán / ngày × số ngày cần đủ hàng, làm tròn theo quy cách
 *   roundTransfer     số cần chuyển xuống shop → làm tròn theo thùng (tự động / nguyên thùng / lẻ)
 *   allocateTransfers chia tồn kho cho các shop thiếu (kho không đủ thì ưu tiên shop thiếu nhiều nhất so với max)
 *   orderNeed         SL cần nhập theo công thức của chi nhánh cha (các thành phần bật / tắt, dấu, hệ số, số ngày)
 *   buyOptions        SL mua gợi ý làm tròn xuống / lên theo quy cách thùng ("30 / 36")
 *   formulaText       công thức viết bằng chữ cho trang cấu hình
 *
 * Mọi số lượng theo ĐVT NHỎ NHẤT (tỉ lệ 1 của mặt hàng); quy cách (pack) = số ĐVT nhỏ nhất trong một thùng.
 */

/* ------------------------------------------------------------------ công thức đặt hàng */

/** Các thành phần dùng được trong công thức. */
export type FormulaVar =
  | 'maxKho' | 'minKho' | 'tonKho' | 'diDuongKho' | 'diDuongShop'
  | 'maxShop' | 'tonShop' | 'banShop' | 'banThangTruoc' | 'dangDat';

export interface FormulaTerm {
  key: FormulaVar;
  /** +1 cộng, −1 trừ. */
  sign: 1 | -1;
  on: boolean;
  /** Hệ số nhân (mặc định 1), vd doanh số 1 tuần × 1,5. */
  factor?: number;
  /** Riêng banShop: số ngày bán dự phòng (mặc định 7). */
  days?: number;
}

export interface FormulaConfig {
  /** Kho của chi nhánh cha cộng vào "Tồn kho" (trống = mọi kho đang dùng). */
  stockWarehouses: string[];
  /** Kho lấy "Tồn max kho" (trống = kho mặc định). */
  maxWarehouses: string[];
  /** Kho lấy "Tồn min kho" (trống = như kho lấy max). Dùng khi công thức bật "Tồn min kho" thay cho max. */
  minWarehouses?: string[];
  /** Kho của từng shop dùng làm chuẩn (trống = kho mặc định của shop). shopCode → mã kho. */
  shopWarehouses: Record<string, string>;
  /** Shop con KHÔNG tính vào công thức (shop đã nghỉ / tạm dừng…) — vẫn ở cây phân cấp; bỏ tích ở MH18 là tính lại. */
  excludeShops: string[];
  terms: FormulaTerm[];
  /** sum = cộng gộp mọi shop (shop dư bù shop thiếu); positive = chỉ cộng phần thiếu từng shop. */
  shopGapMode: 'sum' | 'positive';
  /** Làm tròn SL gợi ý mua: none / up (lên thùng) / nearest (gần nhất). */
  roundBuy: 'none' | 'up' | 'nearest';
  /** Mã có đuôi này thì bỏ qua (vd Z, M). */
  skipSuffixes: string[];
  /** Số ngày đo tốc độ bán mặc định (mã chưa cài riêng). */
  windowDays: number;
  /** Số ngày cần đủ hàng ở shop (gợi ý max = bán / ngày × số này). */
  coverDays: number;
  /** Max kho gợi ý = tổng max shop × (1 + % này). */
  warehouseBufferPct: number;
  /** Chuyển xuống shop, chế độ tự động: thiếu từ tỉ lệ này của thùng trở lên thì làm tròn lên thùng (0,5 = nửa thùng). */
  packThreshold: number;
  /** Duyệt tự động phiếu đăng ký max khi max mới lệch max cũ không quá % này (0 = luôn duyệt tay). */
  autoApprovePct: number;
}

export const FORMULA_VARS: { key: FormulaVar; label: string; short: string; hint: string }[] = [
  { key: 'maxKho', label: 'Tồn max kho', short: 'Max kho', hint: 'Tổng tồn max của các kho chọn ở mục "Kho lấy max"' },
  { key: 'minKho', label: 'Tồn min kho', short: 'Min kho', hint: 'Tổng tồn min của các kho chọn ở mục "Lấy min" (không chọn = như kho lấy max) — dùng thay Tồn max kho khi đặt theo min' },
  { key: 'tonKho', label: 'Tồn kho', short: 'Tồn kho', hint: 'Tổng tồn hiện tại của các kho chọn ở mục "Kho tính tồn"' },
  { key: 'diDuongKho', label: 'Hàng đi đường về kho', short: 'Đi đường về kho', hint: 'Đã xuất từ nơi khác về kho chi nhánh cha nhưng kho chưa xác nhận nhận' },
  { key: 'diDuongShop', label: 'Hàng đi đường xuống shop', short: 'Đi đường xuống shop', hint: 'Kho đã xuất xuống shop (đã trừ tồn kho) nhưng shop chưa xác nhận nhận' },
  { key: 'maxShop', label: 'Tổng tồn max shop', short: 'Max shop', hint: 'Tổng max của mọi shop con (kho chuẩn của từng shop)' },
  { key: 'tonShop', label: 'Tổng tồn shop', short: 'Tồn shop', hint: 'Tổng tồn của mọi shop con' },
  { key: 'banShop', label: 'Doanh số bán của toàn bộ shop', short: 'Bán N ngày', hint: 'Số bán của mọi shop con trong N ngày gần nhất — phần dự phòng' },
  { key: 'banThangTruoc', label: 'Bán tháng liền kề', short: 'BH tháng trước', hint: 'Số bán tháng trước của mọi shop — thường chỉ để tham khảo' },
  { key: 'dangDat', label: 'SL mua chưa nhập kho', short: 'Chưa nhập kho', hint: 'Phần còn lại chưa về của mọi đơn đặt đang mở (mọi NCC) — trừ để không đặt trùng' },
];
export const varLabel = (k: FormulaVar) => FORMULA_VARS.find((v) => v.key === k)?.label ?? k;

/** Công thức chuẩn (cách đang dùng ở chi nhánh): (max kho − tồn kho − đi đường) + (max shop − tồn shop) + bán 7 ngày − chưa nhập. */
export const DEFAULT_FORMULA: FormulaConfig = {
  stockWarehouses: [], maxWarehouses: [], minWarehouses: [], shopWarehouses: {}, excludeShops: [],
  terms: [
    { key: 'maxKho', sign: 1, on: true },
    { key: 'tonKho', sign: -1, on: true },
    { key: 'diDuongKho', sign: -1, on: true },
    { key: 'diDuongShop', sign: -1, on: true },
    { key: 'maxShop', sign: 1, on: true },
    { key: 'tonShop', sign: -1, on: true },
    { key: 'banShop', sign: 1, on: true, days: 7, factor: 1 },
    { key: 'dangDat', sign: -1, on: true },
    { key: 'minKho', sign: 1, on: false },
    { key: 'banThangTruoc', sign: 1, on: false },
  ],
  shopGapMode: 'sum', roundBuy: 'up', skipSuffixes: ['Z', 'M'],
  windowDays: 7, coverDays: 7, warehouseBufferPct: 10, packThreshold: 0.5, autoApprovePct: 0,
};

/** Ghép cấu hình đã lưu với mặc định (thiếu thành phần nào thì thêm, tắt). */
export function normalizeFormula(c?: Partial<FormulaConfig> | null): FormulaConfig {
  const base = { ...DEFAULT_FORMULA, ...(c ?? {}) } as FormulaConfig;
  const terms = [...(c?.terms ?? DEFAULT_FORMULA.terms)];
  for (const v of FORMULA_VARS) if (!terms.some((t) => t.key === v.key)) terms.push({ key: v.key, sign: 1, on: false });
  return { ...base, terms, shopWarehouses: base.shopWarehouses ?? {}, excludeShops: base.excludeShops ?? [], stockWarehouses: base.stockWarehouses ?? [], maxWarehouses: base.maxWarehouses ?? [], skipSuffixes: base.skipSuffixes ?? [] };
}

/** Số liệu một mã ở một chi nhánh cha (đầu vào công thức). shops: từng shop con. */
export interface NeedInput {
  maxKho: number; minKho: number; tonKho: number; diDuongKho: number; diDuongShop: number;
  /** Số bán của mọi shop theo ngày (trong cửa sổ đã lấy): banTheoNgay[i] = ngày thứ i tính lùi từ hôm nay (0 = hôm nay). */
  banShopNgay: number[];
  banThangTruoc: number;
  dangDat: number;
  shops: { code: string; max: number; ton: number }[];
}

export interface NeedPart { key: FormulaVar; label: string; sign: 1 | -1; value: number; signed: number }
export interface NeedResult { need: number; parts: NeedPart[] }

const r3 = (x: number) => Math.round(x * 1000) / 1000;

/** SL cần nhập theo công thức. Trả cả từng thành phần (để hiện "vì sao ra số này"). */
export function orderNeed(input: NeedInput, cfg: FormulaConfig): NeedResult {
  const parts: NeedPart[] = [];
  const shopMax = input.shops.reduce((s, x) => s + x.max, 0);
  const shopTon = input.shops.reduce((s, x) => s + x.ton, 0);
  const gapPositive = input.shops.reduce((s, x) => s + Math.max(0, x.max - x.ton), 0);
  for (const t of cfg.terms) {
    if (!t.on) continue;
    let v = 0;
    switch (t.key) {
      case 'maxKho': v = input.maxKho; break;
      case 'minKho': v = input.minKho; break;
      case 'tonKho': v = input.tonKho; break;
      case 'diDuongKho': v = input.diDuongKho; break;
      case 'diDuongShop': v = input.diDuongShop; break;
      case 'maxShop': v = cfg.shopGapMode === 'positive' ? gapPositive : shopMax; break;
      // Chế độ "chỉ phần thiếu": phần thiếu của từng shop đã tính ở maxShop, tồn shop không trừ thêm.
      case 'tonShop': v = cfg.shopGapMode === 'positive' ? 0 : shopTon; break;
      case 'banShop': { const d = Math.max(1, t.days ?? 7); v = input.banShopNgay.slice(0, d).reduce((s, x) => s + x, 0); break; }
      case 'banThangTruoc': v = input.banThangTruoc; break;
      case 'dangDat': v = input.dangDat; break;
    }
    v = r3(v * (t.factor ?? 1));
    parts.push({ key: t.key, label: t.key === 'banShop' ? `Bán ${t.days ?? 7} ngày (mọi shop)` : t.key === 'maxShop' && cfg.shopGapMode === 'positive' ? 'Phần thiếu của từng shop' : varLabel(t.key), sign: t.sign, value: v, signed: t.sign * v });
  }
  return { need: r3(parts.reduce((s, p) => s + p.signed, 0)), parts };
}

/** Công thức bằng chữ. */
export function formulaText(cfg: FormulaConfig): string {
  const on = cfg.terms.filter((t) => t.on);
  if (!on.length) return 'SL cần nhập = 0 (chưa bật thành phần nào)';
  return 'SL cần nhập = ' + on.map((t, i) => {
    const name = t.key === 'banShop' ? `Bán ${t.days ?? 7} ngày của mọi shop` : t.key === 'maxShop' && cfg.shopGapMode === 'positive' ? 'Phần thiếu của từng shop (max − tồn, chỉ cộng số dương)' : varLabel(t.key);
    const f = t.factor && t.factor !== 1 ? ` × ${String(t.factor).replace('.', ',')}` : '';
    return `${i === 0 ? (t.sign < 0 ? '− ' : '') : t.sign < 0 ? ' − ' : ' + '}${name}${f}`;
  }).join('');
}

/** Mã bị bỏ qua theo đuôi (Z, M…): đuôi chữ sau phần số. */
export function skippedBySuffix(sku: string, suffixes: string[]): boolean {
  const m = sku.trim().toUpperCase().match(/^\d+([A-Z]{1,3})$/);
  return !!m && suffixes.map((x) => x.trim().toUpperCase()).filter(Boolean).includes(m[1]!);
}

/* ------------------------------------------------------------------ gợi ý max, làm tròn */

/** Làm tròn số theo quy cách: up = lên thùng, down = xuống, nearest = gần nhất. pack ≤ 1 thì giữ nguyên (làm tròn lên số nguyên). */
export function roundPack(x: number, pack: number | undefined, how: 'up' | 'down' | 'nearest' = 'up'): number {
  const p = pack && pack > 1 ? pack : 1;
  const k = x / p;
  const r = how === 'up' ? Math.ceil(k - 1e-9) : how === 'down' ? Math.floor(k + 1e-9) : Math.round(k);
  return Math.max(0, r * p);
}

/** Gợi ý max shop = bán / ngày × số ngày cần đủ hàng; làm tròn lên số nguyên (và lên thùng nếu bật packRound). Không bán thì 0. */
export function suggestMax(avgPerDay: number, coverDays: number, pack?: number, packRound = false): number {
  if (!(avgPerDay > 0)) return 0;
  const raw = Math.ceil(avgPerDay * coverDays - 1e-9);
  return packRound ? roundPack(raw, pack, 'up') : Math.max(1, raw);
}

/** Gợi ý max kho = tổng max shop × (1 + dự phòng %). */
export const suggestWarehouseMax = (shopMaxSum: number, bufferPct: number) => Math.ceil(shopMaxSum * (1 + bufferPct / 100) - 1e-9);

/** Bán trung bình / ngày trong window ngày (soldByDay[i] = ngày thứ i tính lùi, 0 = hôm nay). */
export const avgPerDay = (soldByDay: number[], window: number) => { const w = Math.max(1, window); return r3(soldByDay.slice(0, w).reduce((s, x) => s + x, 0) / w); };

export type TransferMode = 'auto' | 'pack' | 'unit';
export const TRANSFER_MODES: { key: TransferMode; label: string; hint: string }[] = [
  { key: 'auto', label: 'Tự động', hint: 'Thiếu từ nửa thùng trở lên thì làm tròn lên nguyên thùng; ít hơn thì chuyển lẻ' },
  { key: 'pack', label: 'Nguyên thùng', hint: 'Chỉ chuyển nguyên thùng (thiếu chưa đủ ngưỡng thì chờ lần sau)' },
  { key: 'unit', label: 'Chuyển lẻ', hint: 'Chuyển đúng số thiếu theo ĐVT nhỏ nhất' },
];

/** Số chuyển xuống shop từ số thiếu (đã trừ đi đường). Trả 0 nếu không cần chuyển. */
export function roundTransfer(gap: number, pack: number | undefined, mode: TransferMode, threshold = 0.5): number {
  if (!(gap > 0)) return 0;
  const p = pack && pack > 1 ? pack : 1;
  if (p === 1 || mode === 'unit') return Math.ceil(gap - 1e-9);
  const whole = Math.floor(gap / p + 1e-9), rest = gap - whole * p;
  if (mode === 'pack') return (rest >= p * threshold ? whole + 1 : whole) * p;
  // Tự động: phần dư từ ngưỡng trở lên → lên thùng; dưới ngưỡng → chuyển lẻ phần dư.
  return rest >= p * threshold ? (whole + 1) * p : whole * p + Math.ceil(rest - 1e-9);
}

export interface TransferNeed { shopCode: string; sku: string; max: number; ton: number; diDuong: number; pack?: number; mode: TransferMode }
export interface TransferLine extends TransferNeed { gap: number; want: number; qty: number; short: number }

/** Làm tròn chung khi phân tích (NT-MH-004): theo cài từng mã (như cũ) · mọi mã nguyên thùng · không làm tròn (đúng số thiếu). */
export type TransferRounding = 'sku' | 'pack' | 'none';
export const TRANSFER_ROUNDINGS: { key: TransferRounding; label: string; hint: string }[] = [
  { key: 'sku', label: 'Theo cài từng mã', hint: 'Mỗi mã làm tròn theo cài đặt ở Tồn max (Tự động / Nguyên thùng / Chuyển lẻ)' },
  { key: 'pack', label: 'Nguyên thùng', hint: 'Mọi mã làm tròn theo đơn vị mua (thùng); thiếu chưa đủ ngưỡng thì chờ lần sau' },
  { key: 'none', label: 'Không làm tròn', hint: 'Chuyển đúng số thiếu theo ĐVT nhỏ nhất' },
];
/** Cách làm tròn của một mã khi phân tích: tuỳ chọn chung ghi đè cài từng mã (trừ "theo cài từng mã"). */
export const modeFor = (rounding: TransferRounding, skuMode: TransferMode): TransferMode => (rounding === 'pack' ? 'pack' : rounding === 'none' ? 'unit' : skuMode);

/** Cách chia khi kho không đủ (NT-MH-004). */
export type TransferAllocation = 'shortage' | 'selected' | 'equal' | 'manual';
export const TRANSFER_ALLOCATIONS: { key: TransferAllocation; label: string; hint: string }[] = [
  { key: 'shortage', label: 'Thiếu nhiều nhất trước', hint: 'Shop thiếu nhiều nhất so với max (tỉ lệ) được chia trước' },
  { key: 'selected', label: 'Theo thứ tự shop đã chọn', hint: 'Chia đủ cho shop chọn trước, còn lại mới tới shop sau' },
  { key: 'equal', label: 'Chia đều', hint: 'Mỗi shop bằng nhau (từng hộp, hoặc từng thùng nếu nguyên thùng), không vượt số cần; phần lẻ cho shop chọn trước' },
  { key: 'manual', label: 'Chỉnh tay', hint: 'Mã thiếu hàng để trống số chuyển — tự nhập; tổng một mã không vượt tồn kho chuyển' },
];

/**
 * Chia tồn kho cho các shop của một mã. want = số muốn chuyển (đã làm tròn). Kho đủ thì mọi shop nhận đủ want. Kho không đủ thì theo
 * `allocation`: shortage = ưu tiên shop thiếu nhiều nhất so với max (tỉ lệ thiếu cao trước), cấp theo bước thùng nếu chế độ thùng;
 * selected = theo thứ tự `order` (mã shop; shop không có trong order đi sau, theo mã); equal = chia bằng nhau theo bước (thùng nếu
 * nguyên thùng, không thì từng ĐVT nhỏ nhất), không vượt want, phần dư cho shop đứng trước trong `order`; manual = để 0, người dùng tự nhập.
 */
export function allocateTransfers(needs: TransferNeed[], available: number, threshold = 0.5, opts: { allocation?: TransferAllocation; order?: string[] } = {}): TransferLine[] {
  const lines: TransferLine[] = needs.map((n) => {
    const gap = Math.max(0, n.max - n.ton - n.diDuong);
    return { ...n, gap, want: roundTransfer(gap, n.pack, n.mode, threshold), qty: 0, short: 0 };
  });
  let left = Math.max(0, available);
  const wanting = lines.filter((l) => l.want > 0);
  const allocation = opts.allocation ?? 'shortage';
  const pos = (code: string) => { const i = opts.order?.indexOf(code) ?? -1; return i < 0 ? Number.MAX_SAFE_INTEGER : i; };
  const byOrder = (a: TransferLine, b: TransferLine) => pos(a.shopCode) - pos(b.shopCode) || a.shopCode.localeCompare(b.shopCode);
  const stepOf = (l: TransferLine) => (l.mode !== 'unit' && l.pack && l.pack > 1 ? l.pack : 1);
  /** Cấp phần còn lại cho một dòng: chế độ nguyên thùng chỉ cấp bội số thùng, còn lại cấp lẻ. */
  const give = (l: TransferLine) => {
    if (l.want <= left) { l.qty = l.want; left -= l.want; return; }
    const step = stepOf(l);
    const g = l.mode === 'pack' ? Math.floor(left / step) * step : left;
    l.qty = g; left -= g;
  };
  if (wanting.reduce((s, l) => s + l.want, 0) <= left) {
    for (const l of wanting) { l.qty = l.want; left -= l.want; }
  } else if (allocation === 'manual') {
    // Để trống: người dùng tự nhập số chuyển, tổng theo mã kiểm khi chốt đề nghị.
  } else if (allocation === 'selected') {
    for (const l of [...wanting].sort(byOrder)) { if (left <= 0) break; give(l); }
  } else if (allocation === 'equal') {
    // Chia bằng nhau theo bước (cùng một mã nên cùng thùng, cùng cách làm tròn): mỗi vòng mỗi shop còn thiếu nhận như nhau,
    // vòng cuối không đủ chia đều thì lần lượt mỗi shop một bước theo thứ tự đã chọn.
    const step = wanting.length ? (wanting[0]!.mode === 'pack' ? stepOf(wanting[0]!) : 1) : 1;
    let steps = Math.floor(left / step + 1e-9);
    const cap = new Map(wanting.map((l) => [l, Math.floor(l.want / step + 1e-9)]));
    const got = new Map(wanting.map((l) => [l, 0]));
    let active = [...wanting].sort(byOrder).filter((l) => cap.get(l)! > 0);
    while (steps > 0 && active.length) {
      const share = Math.floor(steps / active.length);
      if (share === 0) { for (const l of active.slice(0, steps)) got.set(l, got.get(l)! + 1); steps = 0; break; }
      for (const l of active) { const g = Math.min(share, cap.get(l)! - got.get(l)!); got.set(l, got.get(l)! + g); steps -= g; }
      active = active.filter((l) => got.get(l)! < cap.get(l)!);
    }
    for (const l of wanting) { l.qty = got.get(l)! * step; left -= l.qty; }
  } else {
    const order = [...wanting].sort((a, b) => (b.gap / Math.max(1, b.max)) - (a.gap / Math.max(1, a.max)) || b.gap - a.gap);
    for (const l of order) { if (left <= 0) break; give(l); }
  }
  for (const l of lines) l.short = Math.max(0, l.want - l.qty);
  return lines;
}

/** SL mua gợi ý: làm tròn xuống / lên theo quy cách (2 lựa chọn, bỏ trùng và số 0). */
export function buyOptions(need: number, pack?: number): number[] {
  if (!(need > 0)) return [];
  if (!pack || pack <= 1) return [Math.ceil(need - 1e-9)];
  return [...new Set([roundPack(need, pack, 'down'), roundPack(need, pack, 'up')])].filter((x) => x > 0);
}

/* ------------------------------------------------------------------ phiếu đăng ký tồn max */

export type MaxRequestKind = 'existing' | 'new_item';
export type MaxRequestStatus = 'draft' | 'submitted' | 'approved' | 'cancelled';
export const MAX_REQUEST_STATUS: Record<MaxRequestStatus, string> = { draft: 'Nháp', submitted: 'Chờ duyệt', approved: 'Đã duyệt', cancelled: 'Đã huỷ' };

/** Dòng phiếu đăng ký. Mã có sẵn: sku + max đề nghị cho shop của phiếu. Hàng mới: sku có thể trống; maxByShop theo từng shop. */
export interface MaxRequestItem {
  key: string;
  sku: string;
  name: string;
  unit?: string;
  pack?: number;
  nccSku?: string;
  partnerCode?: string;
  currentMax?: number;
  suggestedMax?: number;
  avgPerDay?: number;
  windowDays?: number;
  proposedMax?: number;
  /** Hàng mới: max theo từng shop (mã shop → max). */
  maxByShop?: Record<string, number>;
  note?: string;
}

/** Phiếu có thể duyệt tự động: mọi dòng có mã, max mới lệch max cũ không quá pct% (max cũ 0 thì không tự duyệt). */
export function canAutoApprove(items: MaxRequestItem[], pct: number): boolean {
  if (!(pct > 0) || !items.length) return false;
  return items.every((i) => i.sku && (i.currentMax ?? 0) > 0 && Math.abs((i.proposedMax ?? 0) - (i.currentMax ?? 0)) / (i.currentMax ?? 1) * 100 <= pct + 1e-9);
}
