// @bizcity-layer P module-sdk
// [2026-11-08 01:45 PM Johnny Chu - Chu Hoàng Anh] PHASE-031 — W3a (S031-13, chữ chốt PHASE-031 · 00 §9.5): sale.promo.buy_x_get_y@1 — mua X tặng Y
/**
 * MUA X TẶNG Y (sale.promo.buy_x_get_y@1). Ví dụ "mua 2 sản phẩm A tặng 1 sản phẩm B" (SALE-PROMO-001).
 *
 *   bought   = Σ qty của các dòng khớp hàng mua (itemId nếu chính sách có, không thì sku)  — qty theo ĐƠN VỊ NHỎ NHẤT
 *   times    = repeat ? floor(bought / buy.qty) : (bought ≥ buy.qty ? 1 : 0)
 *   giftQty  = min(times × get.qty, maxGiftQty nếu có), làm tròn 4 chữ số thập phân
 *
 * Giới hạn có chủ đích: nhiều chính sách áp ĐỘC LẬP, cộng dồn; chưa có "áp riêng" (exclusive) như engine mua hàng (S031-15).
 * Trần pháp lý của hàng khuyến mại (NĐ81: giá trị quà ≤ 50 % giá) chưa kiểm — cần tham số pháp lý (S030-35) và giá.
 */
import { z } from 'zod';
import type { RuleContract, Treatment } from './types.js';

const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'YYYY-MM-DD');
const itemId = z.string().regex(/^[0-9A-HJKMNP-TV-Z]{26}$/, 'itemId không đúng khuôn');
const target = z.object({
  sku: z.string().trim().min(1).max(64),
  /** Định danh mặt hàng (bất biến khi đổi mã). Có thì so theo itemId, không thì so theo sku. */
  itemId: itemId.optional(),
  qty: z.number().finite().positive(),
}).strict();

export const buyXGetYParams = z.object({
  buy: target,
  get: target,
  /** true: đủ điều kiện mấy lần thì tặng mấy lần (4 mua 2 tặng 1 → 2). false: tặng một lần. */
  repeat: z.boolean().default(true),
  /** Trần số lượng quà trên một chứng từ. */
  maxGiftQty: z.number().finite().positive().optional(),
  /** Cửa sổ chiến dịch: chứng từ ngoài khoảng này không áp. */
  validFrom: day.optional(),
  validTo: day.optional(),
}).strict();
export type BuyXGetYParams = z.infer<typeof buyXGetYParams>;

export interface BuyXGetYLine { lineKey: string; sku: string; qty: number; itemId?: string }
export interface BuyXGetYInput { lines: BuyXGetYLine[] }
export interface BuyXGetYOutput { bought: number; times: number; gifts: { sku: string; itemId?: string; qty: number }[] }

/** Làm tròn số lượng 4 chữ số thập phân (như mua hàng); chặn sai số nhị phân khi chia. */
const r4 = (n: number) => Math.round(n * 10_000) / 10_000;
const EPS = 1e-9;

const matches = (t: { sku: string; itemId?: string }, l: BuyXGetYLine) => (t.itemId ? l.itemId === t.itemId : l.sku === t.sku);

export function evaluateBuyXGetY(p: BuyXGetYParams, input: BuyXGetYInput): BuyXGetYOutput {
  const bought = r4(input.lines.filter((l) => matches(p.buy, l)).reduce((s, l) => s + (Number.isFinite(l.qty) && l.qty > 0 ? l.qty : 0), 0));
  const times = p.repeat ? Math.floor(bought / p.buy.qty + EPS) : bought >= p.buy.qty - EPS ? 1 : 0;
  const raw = r4(times * p.get.qty);
  const giftQty = p.maxGiftQty !== undefined ? Math.min(raw, p.maxGiftQty) : raw;
  return { bought, times, gifts: giftQty > 0 ? [{ sku: p.get.sku, ...(p.get.itemId ? { itemId: p.get.itemId } : {}), qty: giftQty }] : [] };
}

const base: BuyXGetYParams = { buy: { sku: 'A', qty: 2 }, get: { sku: 'B', qty: 1 }, repeat: true };
const L = (lineKey: string, sku: string, qty: number): BuyXGetYLine => ({ lineKey, sku, qty });
const out = (bought: number, times: number, qty: number): BuyXGetYOutput => ({ bought, times, gifts: qty > 0 ? [{ sku: 'B', qty }] : [] });

/** Bộ ca chuẩn cho plugin viết lại. Test chạy mỗi ca qua hàm thuần VÀ qua endpoint evaluate (T031-RC-3). */
export const buyXGetYVectors = [
  { name: 'mua 2 A tặng 1 B', params: base, input: { lines: [L('1', 'A', 2)] }, output: out(2, 1, 1) },
  { name: 'mua 3 A: dư 1 không đủ lần thứ hai', params: base, input: { lines: [L('1', 'A', 3)] }, output: out(3, 1, 1) },
  { name: 'mua 4 A tặng 2 B (repeat)', params: base, input: { lines: [L('1', 'A', 4)] }, output: out(4, 2, 2) },
  { name: 'mua 4 A, không repeat: chỉ tặng 1 B', params: { ...base, repeat: false }, input: { lines: [L('1', 'A', 4)] }, output: out(4, 1, 1) },
  { name: 'mua 1 A: chưa đủ điều kiện', params: base, input: { lines: [L('1', 'A', 1)] }, output: out(1, 0, 0) },
  { name: 'không có A trên đơn', params: base, input: { lines: [L('1', 'C', 5)] }, output: out(0, 0, 0) },
  { name: 'cộng dồn nhiều dòng cùng A', params: base, input: { lines: [L('1', 'A', 1), L('2', 'A', 1), L('3', 'C', 9)] }, output: out(2, 1, 1) },
  { name: 'maxGiftQty chặn số quà', params: { ...base, maxGiftQty: 2 }, input: { lines: [L('1', 'A', 10)] }, output: out(10, 5, 2) },
  { name: 'số lượng lẻ: 3 × 0,2 = 0,6 đủ 3 lần của 0,2 (0,6 / 0,2 = 2,9999999999999996 trong nhị phân — cần dung sai)', params: { buy: { sku: 'A', qty: 0.2 }, get: { sku: 'B', qty: 1 }, repeat: true }, input: { lines: [L('1', 'A', 0.2), L('2', 'A', 0.2), L('3', 'A', 0.2)] }, output: out(0.6, 3, 3) },
] satisfies { name: string; params: BuyXGetYParams; input: BuyXGetYInput; output: BuyXGetYOutput }[];

export const saleBuyXGetY: RuleContract<BuyXGetYParams, BuyXGetYInput, BuyXGetYOutput> = {
  id: 'sale.promo.buy_x_get_y@1',
  domain: 'sale',
  title: 'Mua X tặng Y',
  params: buyXGetYParams,
  publishChecks(p) {
    const issues: { path: string; message: string }[] = [];
    if (p.validFrom && p.validTo && p.validTo < p.validFrom) issues.push({ path: 'validTo', message: 'Ngày kết thúc chiến dịch trước ngày bắt đầu' });
    if (p.maxGiftQty !== undefined && p.maxGiftQty < p.get.qty) issues.push({ path: 'maxGiftQty', message: `Trần quà ${p.maxGiftQty} nhỏ hơn số quà một lần (${p.get.qty}) — chính sách không bao giờ tặng được` });
    return issues;
  },
  window: (p) => ({ from: p.validFrom, to: p.validTo }),
  evaluate: evaluateBuyXGetY,
  explain: (p, o) => (o.gifts.length
    ? `Mua ${p.buy.qty} ${p.buy.sku} tặng ${p.get.qty} ${p.get.sku}${p.repeat ? '' : ' (một lần)'}: mua ${o.bought} → ${o.times} lần → tặng ${o.gifts[0]!.qty} ${p.get.sku}`
    : `Mua ${p.buy.qty} ${p.buy.sku} tặng ${p.get.qty} ${p.get.sku}: mới mua ${o.bought} ${p.buy.sku}, chưa đủ điều kiện`),
  treatment: (o): Treatment[] => (o.gifts.length ? [{ on: 'gift', reasonCode: 'XTA1.4', confirmed: false }] : []),
  describe: () => ({
    params: [
      { name: 'buy.sku', type: 'string', required: true, doc: 'Mã hàng phải mua' },
      { name: 'buy.itemId', type: 'string (ULID 26 ký tự)', required: false, doc: 'Định danh mặt hàng; có thì so theo itemId thay cho sku' },
      { name: 'buy.qty', type: 'number > 0', required: true, doc: 'Số lượng mua cho một lần được tặng (đơn vị nhỏ nhất)' },
      { name: 'get.sku', type: 'string', required: true, doc: 'Mã hàng được tặng' },
      { name: 'get.itemId', type: 'string (ULID 26 ký tự)', required: false, doc: 'Định danh mặt hàng được tặng' },
      { name: 'get.qty', type: 'number > 0', required: true, doc: 'Số lượng tặng cho một lần' },
      { name: 'repeat', type: 'boolean', required: false, doc: 'Mặc định true: đủ điều kiện mấy lần tặng mấy lần' },
      { name: 'maxGiftQty', type: 'number > 0', required: false, doc: 'Trần số lượng quà trên một chứng từ' },
      { name: 'validFrom', type: 'YYYY-MM-DD', required: false, doc: 'Chiến dịch bắt đầu' },
      { name: 'validTo', type: 'YYYY-MM-DD', required: false, doc: 'Chiến dịch kết thúc (gồm ngày này)' },
    ],
    spec: {
      input: 'lines[]: { lineKey, sku, qty, itemId? } — qty theo đơn vị nhỏ nhất, như bizcity_ledger_intake@1',
      steps: [
        'bought = tổng qty của các dòng có (buy.itemId ? itemId = buy.itemId : sku = buy.sku); bỏ dòng qty ≤ 0; làm tròn 4 chữ số thập phân',
        'times = repeat ? floor(bought / buy.qty + 1e-9) : (bought >= buy.qty - 1e-9 ? 1 : 0)   — 1e-9 chặn sai số nhị phân khi chia số lẻ',
        'giftQty = round4(times × get.qty); nếu có maxGiftQty thì giftQty = min(giftQty, maxGiftQty)',
        'giftQty > 0 → gifts = [{ sku: get.sku, itemId: get.itemId nếu có, qty: giftQty }]; ngược lại gifts = []',
      ],
      output: '{ bought, times, gifts[] }',
      note: 'Nhiều chính sách áp độc lập, cộng dồn. Chưa kiểm trần pháp lý của hàng khuyến mại.',
    },
    vectors: buyXGetYVectors,
  }),
};
