// [2026-11-08 02:30 PM Johnny Chu - Chu Hoàng Anh] PHASE-031 — W3a (S031-13): Rule Contract sale.promo.buy_x_get_y@1 — bảng số (T031-RC-1), kiểm phát hành và mô tả (T031-RC-2)
/**
 * Rule Contract thuần (không CSDL, không HTTP):
 *   T031-RC-1  bảng số mua X tặng Y: 2A→1B · 3A→1B · 4A→2B · không repeat · maxGiftQty · cộng dồn nhiều dòng · số lẻ (dung sai nhị phân);
 *   T031-RC-2  zod + publishChecks từ chối nội dung sai; describe().params khớp khoá của zod (không lệch giữa mô tả và mã);
 *   itemId: so theo định danh khi chính sách có, không theo sku.
 * Chạy cùng các vectors qua endpoint evaluate ở policy-api.test.ts (T031-RC-3).
 */
import { describe, expect, it } from 'vitest';
import { RULE_CONTRACTS, getRuleContract } from '../src/modules/system/rule-contracts/index.js';
import { buyXGetYParams, buyXGetYVectors, evaluateBuyXGetY, saleBuyXGetY, type BuyXGetYParams } from '../src/modules/system/rule-contracts/sale-promo-buy-x-get-y.js';

const ID_A = '01HZZZZZZZZZZZZZZZZZZZZZZA';
const ID_B = '01HZZZZZZZZZZZZZZZZZZZZZZB';
const base: BuyXGetYParams = { buy: { sku: 'A', qty: 2 }, get: { sku: 'B', qty: 1 }, repeat: true };
const lines = (...qs: [string, number][]) => ({ lines: qs.map(([sku, qty], i) => ({ lineKey: String(i + 1), sku, qty })) });

describe('Danh sách Rule Contract', () => {
  it('có sale.promo.buy_x_get_y@1; tra theo mã; mã lạ không có', () => {
    expect(RULE_CONTRACTS.map((c) => c.id)).toContain('sale.promo.buy_x_get_y@1');
    expect(getRuleContract('sale.promo.buy_x_get_y@1')).toBe(saleBuyXGetY);
    expect(getRuleContract('sale.khong_co@1')).toBeUndefined();
  });
});

describe('T031-RC-1: bảng số mua X tặng Y', () => {
  const cases: [string, BuyXGetYParams, ReturnType<typeof lines>, number, number][] = [
    ['2 A → 1 B', base, lines(['A', 2]), 1, 1],
    ['3 A → 1 B (dư 1 chưa đủ lần hai)', base, lines(['A', 3]), 1, 1],
    ['4 A → 2 B (repeat)', base, lines(['A', 4]), 2, 2],
    ['4 A không repeat → 1 B', { ...base, repeat: false }, lines(['A', 4]), 1, 1],
    ['1 A → 0', base, lines(['A', 1]), 0, 0],
    ['không có A → 0', base, lines(['C', 9]), 0, 0],
    ['nhiều dòng cùng A cộng dồn: 1 + 1 → 1 B', base, lines(['A', 1], ['A', 1], ['C', 9]), 1, 1],
    ['maxGiftQty chặn: 10 A → 5 lần, trần 2 → 2 B', { ...base, maxGiftQty: 2 }, lines(['A', 10]), 5, 2],
    ['mua 3 tặng 2: 7 A → 2 lần → 4 B', { buy: { sku: 'A', qty: 3 }, get: { sku: 'B', qty: 2 }, repeat: true }, lines(['A', 7]), 2, 4],
  ];
  it.each(cases)('%s', (_name, params, input, times, giftQty) => {
    const o = evaluateBuyXGetY(params, input);
    expect(o.times).toBe(times);
    expect(o.gifts.reduce((s, g) => s + g.qty, 0)).toBe(giftQty);
    expect(o.gifts.every((g) => g.sku === 'B')).toBe(true);
  });

  it('số lẻ: 3 × 0,2 = 0,6 đủ 3 lần của 0,2 — không có dung sai thì 0,6 / 0,2 = 2,9999999999999996 → chỉ 2', () => {
    expect(0.6 / 0.2).toBeLessThan(3); // chứng minh bẫy có thật
    const o = evaluateBuyXGetY({ buy: { sku: 'A', qty: 0.2 }, get: { sku: 'B', qty: 1 }, repeat: true }, lines(['A', 0.2], ['A', 0.2], ['A', 0.2]));
    expect(o).toMatchObject({ bought: 0.6, times: 3, gifts: [{ sku: 'B', qty: 3 }] });
  });

  it('dòng qty ≤ 0 hoặc không phải số không tính; tính lại cho cùng kết quả (tất định)', () => {
    const input = { lines: [{ lineKey: '1', sku: 'A', qty: 2 }, { lineKey: '2', sku: 'A', qty: -5 }, { lineKey: '3', sku: 'A', qty: Number.NaN }] };
    const a = evaluateBuyXGetY(base, input);
    expect(a).toEqual({ bought: 2, times: 1, gifts: [{ sku: 'B', qty: 1 }] });
    expect(evaluateBuyXGetY(base, input)).toEqual(a);
  });

  it('itemId: chính sách có itemId thì so theo itemId, không theo sku; quà mang itemId của hàng tặng', () => {
    const p: BuyXGetYParams = { buy: { sku: 'A', itemId: ID_A, qty: 2 }, get: { sku: 'B', itemId: ID_B, qty: 1 }, repeat: true };
    // cùng sku nhưng khác itemId → không khớp; khác sku nhưng đúng itemId → khớp (đổi mã không đứt chính sách)
    expect(evaluateBuyXGetY(p, { lines: [{ lineKey: '1', sku: 'A', qty: 2, itemId: '01HZZZZZZZZZZZZZZZZZZZZZZX' }] }).gifts).toEqual([]);
    expect(evaluateBuyXGetY(p, { lines: [{ lineKey: '1', sku: 'A-CU', qty: 2, itemId: ID_A }] }).gifts).toEqual([{ sku: 'B', itemId: ID_B, qty: 1 }]);
  });

  it('mọi vectors của describe() ra đúng đầu ra chuẩn', () => {
    const { vectors } = saleBuyXGetY.describe();
    expect(vectors).toBe(buyXGetYVectors);
    expect(vectors.length).toBeGreaterThanOrEqual(9);
    for (const v of vectors) expect(evaluateBuyXGetY(v.params, v.input), v.name).toEqual(v.output);
  });
});

describe('T031-RC-2: kiểm nội dung và mô tả', () => {
  const bad = (over: Record<string, unknown>) => buyXGetYParams.safeParse({ ...base, ...over });

  it('zod từ chối: qty ≤ 0, sku rỗng, khoá lạ, ngày sai khuôn, itemId sai khuôn', () => {
    expect(bad({ buy: { sku: 'A', qty: 0 } }).success).toBe(false);
    expect(bad({ get: { sku: 'B', qty: -1 } }).success).toBe(false);
    expect(bad({ buy: { sku: '  ', qty: 2 } }).success).toBe(false);
    expect(bad({ extra: 1 }).success).toBe(false);
    expect(bad({ buy: { sku: 'A', qty: 2, boom: 1 } }).success).toBe(false);
    expect(bad({ validFrom: '01/11/2026' }).success).toBe(false);
    expect(bad({ buy: { sku: 'A', qty: 2, itemId: 'abc' } }).success).toBe(false);
    expect(bad({ maxGiftQty: 0 }).success).toBe(false);
  });

  it('repeat mặc định true', () => {
    const p = buyXGetYParams.parse({ buy: { sku: 'A', qty: 2 }, get: { sku: 'B', qty: 1 } });
    expect(p.repeat).toBe(true);
  });

  it('publishChecks: validTo trước validFrom; maxGiftQty nhỏ hơn số quà một lần; nội dung đúng thì rỗng', () => {
    expect(saleBuyXGetY.publishChecks({ ...base, validFrom: '2026-11-10', validTo: '2026-11-09' })).toEqual([{ path: 'validTo', message: expect.stringContaining('trước ngày bắt đầu') }]);
    expect(saleBuyXGetY.publishChecks({ ...base, get: { sku: 'B', qty: 3 }, maxGiftQty: 2 })).toEqual([{ path: 'maxGiftQty', message: expect.stringContaining('không bao giờ tặng được') }]);
    expect(saleBuyXGetY.publishChecks({ ...base, validFrom: '2026-11-10', validTo: '2026-11-10', maxGiftQty: 1 })).toEqual([]);
  });

  it('window lấy cửa sổ chiến dịch từ nội dung', () => {
    expect(saleBuyXGetY.window({ ...base, validFrom: '2026-11-10', validTo: '2026-11-30' })).toEqual({ from: '2026-11-10', to: '2026-11-30' });
    expect(saleBuyXGetY.window(base)).toEqual({ from: undefined, to: undefined });
  });

  it('describe().params khớp khoá của zod (mô tả viết tay không được lệch mã)', () => {
    const doc = new Set(saleBuyXGetY.describe().params.map((f) => f.name));
    const shape = buyXGetYParams.shape;
    const code = new Set<string>();
    for (const [k, v] of Object.entries(shape)) {
      const inner = (v as { shape?: Record<string, unknown> }).shape;
      if (inner) for (const n of Object.keys(inner)) code.add(`${k}.${n}`);
      else code.add(k);
    }
    expect([...doc].sort()).toEqual([...code].sort());
    // bắt buộc / tuỳ chọn trong mô tả đúng với zod
    for (const f of saleBuyXGetY.describe().params) {
      const optional = f.name === 'repeat' || /^(maxGiftQty|validFrom|validTo)$/.test(f.name) || /\.itemId$/.test(f.name);
      expect(f.required, f.name).toBe(!optional);
    }
  });

  it('explain nêu số liệu; treatment chỉ có khi có quà và chưa xác nhận (Q031-5)', () => {
    const o = evaluateBuyXGetY(base, lines(['A', 4]));
    expect(saleBuyXGetY.explain(base, o)).toContain('mua 4 → 2 lần → tặng 2 B');
    expect(saleBuyXGetY.treatment(o)).toEqual([{ on: 'gift', reasonCode: 'XTA1.4', confirmed: false }]);
    const none = evaluateBuyXGetY(base, lines(['A', 1]));
    expect(saleBuyXGetY.treatment(none)).toEqual([]);
    expect(saleBuyXGetY.explain(base, none)).toContain('chưa đủ điều kiện');
  });
});
