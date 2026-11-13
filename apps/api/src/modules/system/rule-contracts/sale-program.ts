// @bizcity-layer P module-sdk
// [2026-11-12 09:10 PM Võ Hoàng] POS-KM — S031-15 phần chương trình bán (chữ chốt PHASE-031 · 00 §17 mục 1): sale.program.gift@1, sale.program.discount@1 — luật của chương trình bán BH12 (đóng góp)
/**
 * CHƯƠNG TRÌNH BÁN (BH12) — hai Rule Contract mà BH12 đã ghi ở sổ đăng ký (`sale.program.<mode>@1`) nhưng trước đây chưa có.
 * Tham số = nội dung bản BH12 (`contentOf` ở sale-programs.service): thừa trường (code, name, programKind…) thì bỏ qua.
 *
 * Số lượng theo ĐƠN VỊ NHỎ NHẤT (như bizcity_ledger_intake@1). Giá: `lines[].price` là đơn giá TRỌN (gồm thuế, trước giảm) trên
 * một đơn vị nhỏ nhất — máy bán có sẵn; tiền giảm làm tròn đồng.
 *
 *   gift:     bought = Σ qty dòng có sku = sku; times = repeat ? floor(bought / buyQty) : (bought ≥ buyQty ? 1 : 0);
 *             quà = min(times × giftQty, maxGiftQty) của giftSku (trống = chính mặt hàng).
 *   discount: mỗi dòng có sku = sku, qty > 0, có price: tiền dòng = round(qty × price);
 *             phần trăm → round(tiền dòng × pct / 100); số tiền → round(qty × discountAmount); giá chương trình → tiền dòng − round(qty × salePrice);
 *             kẹp trong [0, tiền dòng]. Dòng thiếu price → không giảm (nêu ở explain).
 *
 * Giới hạn: nhiều chương trình áp ĐỘC LẬP, cộng dồn (chưa có "áp riêng"); chưa kiểm trần NĐ81 — như sale.promo.buy_x_get_y@1.
 */
import { z } from 'zod';
import type { RuleContract, Treatment } from './types.js';

const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'YYYY-MM-DD');
const sku = z.string().trim().min(1).max(64);
const pos = z.number().finite().positive();

const common = {
  sku,
  validFrom: day.optional(),
  validTo: day.optional(),
};

export const programGiftParams = z.object({
  ...common,
  buyQty: pos.default(1),
  /** Trống / null = tặng chính mặt hàng mua. */
  giftSku: sku.nullish(),
  giftQty: pos,
  /** Mặc định true: đủ điều kiện mấy lần tặng mấy lần. BH12 chưa có cột (đợt sau). */
  repeat: z.boolean().default(true),
  /** Trần số quà trên một chứng từ. BH12 chưa có cột (đợt sau). */
  maxGiftQty: pos.nullish(),
});
export type ProgramGiftParams = z.infer<typeof programGiftParams>;

export const programDiscountParams = z.object({
  ...common,
  discountPct: z.number().finite().positive().max(100).nullish(),
  discountAmount: pos.nullish(),
  salePrice: z.number().finite().min(0).nullish(),
}).refine((p) => [p.discountPct, p.discountAmount, p.salePrice].filter((x) => x !== null && x !== undefined).length === 1, {
  message: 'Chọn đúng một cách giảm: phần trăm, số tiền trên một đơn vị, hoặc giá bán chương trình',
});
export type ProgramDiscountParams = z.infer<typeof programDiscountParams>;

export interface ProgramLine { lineKey: string; sku: string; qty: number; itemId?: string; price?: number }
export interface ProgramInput { lines: ProgramLine[] }
export interface ProgramGiftOutput { bought: number; times: number; gifts: { sku: string; qty: number }[] }
export interface ProgramDiscountOutput { discounts: { lineKey: string; sku: string; qty: number; amount: number }[]; total: number; noPrice: string[] }

const r4 = (n: number) => Math.round(n * 10_000) / 10_000;
const EPS = 1e-9;
const okQty = (q: number) => Number.isFinite(q) && q > 0;

export function evaluateProgramGift(p: ProgramGiftParams, input: ProgramInput): ProgramGiftOutput {
  const bought = r4(input.lines.filter((l) => l.sku === p.sku && okQty(l.qty)).reduce((s, l) => s + l.qty, 0));
  const times = p.repeat ? Math.floor(bought / p.buyQty + EPS) : bought >= p.buyQty - EPS ? 1 : 0;
  const raw = r4(times * p.giftQty);
  const qty = p.maxGiftQty != null ? Math.min(raw, p.maxGiftQty) : raw;
  return { bought, times, gifts: qty > 0 ? [{ sku: p.giftSku || p.sku, qty }] : [] };
}

export function evaluateProgramDiscount(p: ProgramDiscountParams, input: ProgramInput): ProgramDiscountOutput {
  const discounts: ProgramDiscountOutput['discounts'] = [];
  const noPrice: string[] = [];
  for (const l of input.lines) {
    if (l.sku !== p.sku || !okQty(l.qty)) continue;
    if (l.price === undefined || !Number.isFinite(l.price) || l.price < 0) { noPrice.push(l.lineKey); continue; }
    const gross = Math.round(l.qty * l.price);
    const raw = p.discountPct != null ? Math.round((gross * p.discountPct) / 100)
      : p.discountAmount != null ? Math.round(l.qty * p.discountAmount)
        : gross - Math.round(l.qty * (p.salePrice ?? 0));
    const amount = Math.min(gross, Math.max(0, raw));
    if (amount > 0) discounts.push({ lineKey: l.lineKey, sku: l.sku, qty: l.qty, amount });
  }
  return { discounts, total: discounts.reduce((s, d) => s + d.amount, 0), noPrice };
}

const L = (lineKey: string, s: string, qty: number, price?: number): ProgramLine => ({ lineKey, sku: s, qty, ...(price !== undefined ? { price } : {}) });
const g = (over: Partial<ProgramGiftParams> = {}): ProgramGiftParams => ({ sku: 'SUA330', buyQty: 2, giftSku: 'QUA01', giftQty: 1, repeat: true, ...over });
const gOut = (bought: number, times: number, qty: number, giftSku = 'QUA01'): ProgramGiftOutput => ({ bought, times, gifts: qty > 0 ? [{ sku: giftSku, qty }] : [] });

export const programGiftVectors = [
  { name: 'mua 2 tặng 1', params: g(), input: { lines: [L('1', 'SUA330', 2)] }, output: gOut(2, 1, 1) },
  { name: 'mua 4 tặng 2 (lặp lại)', params: g(), input: { lines: [L('1', 'SUA330', 4)] }, output: gOut(4, 2, 2) },
  { name: 'mua 3: dư 1 không đủ lần hai', params: g(), input: { lines: [L('1', 'SUA330', 3)] }, output: gOut(3, 1, 1) },
  { name: 'không lặp: mua 4 chỉ tặng 1', params: g({ repeat: false }), input: { lines: [L('1', 'SUA330', 4)] }, output: gOut(4, 1, 1) },
  { name: 'trần 3 quà: mua 10 → 3', params: g({ maxGiftQty: 3 }), input: { lines: [L('1', 'SUA330', 10)] }, output: gOut(10, 5, 3) },
  { name: 'tặng chính mặt hàng khi giftSku trống', params: g({ giftSku: null }), input: { lines: [L('1', 'SUA330', 2)] }, output: gOut(2, 1, 1, 'SUA330') },
  { name: 'cộng dồn nhiều dòng; bỏ dòng số lượng âm', params: g(), input: { lines: [L('1', 'SUA330', 1), L('2', 'SUA330', 1), L('3', 'SUA330', -1)] }, output: gOut(2, 1, 1) },
  { name: 'chưa đủ điều kiện', params: g(), input: { lines: [L('1', 'SUA330', 1), L('2', 'KHAC', 9)] }, output: gOut(1, 0, 0) },
] satisfies { name: string; params: ProgramGiftParams; input: ProgramInput; output: ProgramGiftOutput }[];

const d = (over: Partial<ProgramDiscountParams>): ProgramDiscountParams => ({ sku: 'SUA900', ...over });
export const programDiscountVectors = [
  { name: 'giảm 10 %: 1 × 900.000 → 90.000', params: d({ discountPct: 10 }), input: { lines: [L('1', 'SUA900', 1, 900_000)] }, output: { discounts: [{ lineKey: '1', sku: 'SUA900', qty: 1, amount: 90_000 }], total: 90_000, noPrice: [] } },
  { name: 'giảm 15.000 / đơn vị: 3 hộp → 45.000', params: d({ discountAmount: 15_000 }), input: { lines: [L('1', 'SUA900', 3, 900_000)] }, output: { discounts: [{ lineKey: '1', sku: 'SUA900', qty: 3, amount: 45_000 }], total: 45_000, noPrice: [] } },
  { name: 'giá chương trình 850.000: 2 hộp → giảm 100.000', params: d({ salePrice: 850_000 }), input: { lines: [L('1', 'SUA900', 2, 900_000)] }, output: { discounts: [{ lineKey: '1', sku: 'SUA900', qty: 2, amount: 100_000 }], total: 100_000, noPrice: [] } },
  { name: 'giá chương trình cao hơn giá bán → không giảm', params: d({ salePrice: 950_000 }), input: { lines: [L('1', 'SUA900', 1, 900_000)] }, output: { discounts: [], total: 0, noPrice: [] } },
  { name: 'giảm tiền lớn hơn tiền dòng → kẹp bằng tiền dòng', params: d({ discountAmount: 1_000_000 }), input: { lines: [L('1', 'SUA900', 1, 900_000)] }, output: { discounts: [{ lineKey: '1', sku: 'SUA900', qty: 1, amount: 900_000 }], total: 900_000, noPrice: [] } },
  { name: 'phần trăm làm tròn đồng: 3 × 333.333 × 10 % = 100.000', params: d({ discountPct: 10 }), input: { lines: [L('1', 'SUA900', 3, 333_333)] }, output: { discounts: [{ lineKey: '1', sku: 'SUA900', qty: 3, amount: 100_000 }], total: 100_000, noPrice: [] } },
  { name: 'dòng thiếu giá → không giảm, nêu lineKey', params: d({ discountPct: 10 }), input: { lines: [L('1', 'SUA900', 1), L('2', 'KHAC', 1, 5_000)] }, output: { discounts: [], total: 0, noPrice: ['1'] } },
] satisfies { name: string; params: ProgramDiscountParams; input: ProgramInput; output: ProgramDiscountOutput }[];

const vnd = (n: number) => n.toLocaleString('vi-VN');
const commonDocs = [
  { name: 'sku', type: 'string', required: true, doc: 'Mã hàng của chương trình' },
  { name: 'validFrom', type: 'YYYY-MM-DD', required: false, doc: 'Chương trình bắt đầu' },
  { name: 'validTo', type: 'YYYY-MM-DD', required: false, doc: 'Chương trình kết thúc (gồm ngày này)' },
];
const windowOf = (p: { validFrom?: string; validTo?: string }) => ({ from: p.validFrom, to: p.validTo });
const dateCheck = (p: { validFrom?: string; validTo?: string }) => (p.validFrom && p.validTo && p.validTo < p.validFrom ? [{ path: 'validTo', message: 'Ngày kết thúc trước ngày bắt đầu' }] : []);

export const saleProgramGift: RuleContract<ProgramGiftParams, ProgramInput, ProgramGiftOutput> = {
  id: 'sale.program.gift@1',
  domain: 'sale',
  title: 'Chương trình bán — tặng hàng (BH12)',
  params: programGiftParams,
  publishChecks: (p) => [
    ...dateCheck(p),
    ...(p.maxGiftQty != null && p.maxGiftQty < p.giftQty ? [{ path: 'maxGiftQty', message: `Trần quà ${p.maxGiftQty} nhỏ hơn số quà một lần (${p.giftQty})` }] : []),
  ],
  window: windowOf,
  evaluate: evaluateProgramGift,
  explain: (p, o) => {
    const gift = p.giftSku || p.sku;
    return o.gifts.length
      ? `Mua ${p.buyQty} ${p.sku} tặng ${p.giftQty} ${gift}${p.repeat ? '' : ' (một lần)'}: mua ${o.bought} → ${o.times} lần → tặng ${o.gifts[0]!.qty} ${gift}`
      : `Mua ${p.buyQty} ${p.sku} tặng ${p.giftQty} ${gift}: mới mua ${o.bought} ${p.sku}, chưa đủ điều kiện`;
  },
  treatment: (o): Treatment[] => (o.gifts.length ? [{ on: 'gift', reasonCode: 'XTA1.4', confirmed: false }] : []),
  describe: () => ({
    params: [
      ...commonDocs,
      { name: 'buyQty', type: 'number > 0', required: false, doc: 'Số lượng mua cho một lần được tặng (đơn vị nhỏ nhất), mặc định 1' },
      { name: 'giftSku', type: 'string | null', required: false, doc: 'Mã hàng tặng; trống = tặng chính mặt hàng' },
      { name: 'giftQty', type: 'number > 0', required: true, doc: 'Số lượng tặng cho một lần' },
      { name: 'repeat', type: 'boolean', required: false, doc: 'Mặc định true: đủ mấy lần tặng mấy lần' },
      { name: 'maxGiftQty', type: 'number > 0 | null', required: false, doc: 'Trần số quà trên một chứng từ' },
    ],
    spec: {
      input: 'lines[]: { lineKey, sku, qty } — qty theo đơn vị nhỏ nhất',
      steps: [
        'bought = round4(tổng qty các dòng có sku = sku và qty > 0)',
        'times = repeat ? floor(bought / buyQty + 1e-9) : (bought >= buyQty - 1e-9 ? 1 : 0)',
        'qty = round4(times × giftQty); có maxGiftQty thì qty = min(qty, maxGiftQty)',
        'qty > 0 → gifts = [{ sku: giftSku || sku, qty }]; ngược lại []',
      ],
      output: '{ bought, times, gifts[] }',
      note: 'Nhiều chương trình áp độc lập, cộng dồn. Chưa kiểm trần NĐ81. Hạn mức cửa hàng do Core lọc trước khi tính (không thuộc luật).',
    },
    vectors: programGiftVectors,
  }),
};

export const saleProgramDiscount: RuleContract<ProgramDiscountParams, ProgramInput, ProgramDiscountOutput> = {
  id: 'sale.program.discount@1',
  domain: 'sale',
  title: 'Chương trình bán — giảm giá (BH12)',
  params: programDiscountParams,
  publishChecks: (p) => dateCheck(p),
  window: windowOf,
  evaluate: evaluateProgramDiscount,
  explain: (p, o) => {
    const how = p.discountPct != null ? `giảm ${p.discountPct} %` : p.discountAmount != null ? `giảm ${vnd(p.discountAmount)} / đơn vị` : `giá chương trình ${vnd(p.salePrice ?? 0)} / đơn vị`;
    if (o.total > 0) return `${p.sku} ${how}: giảm ${vnd(o.total)} trên ${o.discounts.length} dòng`;
    if (o.noPrice.length) return `${p.sku} ${how}: dòng ${o.noPrice.join(', ')} thiếu đơn giá — không tính được tiền giảm`;
    return `${p.sku} ${how}: không có dòng được giảm`;
  },
  treatment: (o): Treatment[] => (o.total > 0 ? [{ on: 'discount', reasonCode: 'GGHB', confirmed: false }] : []),
  describe: () => ({
    params: [
      ...commonDocs,
      { name: 'discountPct', type: 'number (0, 100]', required: false, doc: 'Giảm phần trăm (chọn đúng một trong ba cách)' },
      { name: 'discountAmount', type: 'number > 0', required: false, doc: 'Giảm số tiền trên một đơn vị nhỏ nhất' },
      { name: 'salePrice', type: 'number ≥ 0', required: false, doc: 'Giá bán chương trình (trọn, gồm thuế) trên một đơn vị nhỏ nhất' },
    ],
    spec: {
      input: 'lines[]: { lineKey, sku, qty, price? } — qty theo đơn vị nhỏ nhất; price = đơn giá trọn (gồm thuế, trước giảm) trên một đơn vị nhỏ nhất',
      steps: [
        'mỗi dòng có sku = sku và qty > 0: thiếu price → noPrice; có thì gross = round(qty × price)',
        'raw = discountPct ? round(gross × discountPct / 100) : discountAmount ? round(qty × discountAmount) : gross − round(qty × salePrice)',
        'amount = min(gross, max(0, raw)); amount > 0 → thêm { lineKey, sku, qty, amount }',
        'total = tổng amount',
      ],
      output: '{ discounts[], total, noPrice[] }',
      note: 'Tiền giảm làm tròn đồng (VND). Nhiều chương trình áp độc lập, cộng dồn.',
    },
    vectors: programDiscountVectors,
  }),
};
