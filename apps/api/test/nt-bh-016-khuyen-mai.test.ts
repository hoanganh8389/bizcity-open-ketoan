/**
 * NT-BH-016 — màn Khuyến mại BH18 (chữ chốt docs/nghiep-vu/22): form 6 loại của màn (modules/pos/web/screens/khuyen-mai/model.ts) dựng
 * params → phát hành qua POST /api/v1/policies như màn gửi → Core tính ra đúng §5; sửa = bản mới từ ngày chọn; ngừng = hôm sau không áp.
 */
// [2026-11-14 01:30 AM Võ Hoàng] NGHIEM-THU — test tích hợp phiếu NT-BH-016 (đóng góp)
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { call, setupTenant, type TestCtx } from './helpers.js';

// Hàm thuần của màn (modules/pos/web/screens/khuyen-mai/model.ts) — nạp động theo đường dẫn vì tệp nằm ngoài rootDir của apps/api.
type PromoKind = 'tiered' | 'order_discount' | 'order_gift' | 'combo' | 'cheapest_free' | 'buy_x_get_y';
type Form = Record<string, any> & { kind: PromoKind; key: string; effectiveFrom: string; reason: string };
type Model = {
  emptyForm(kind: PromoKind, today: string): Form; toParams(f: Form): { params: Record<string, unknown>; problems: string[] };
  fromParams(contract: string, p: Record<string, unknown>, meta: { key: string; today: string }): Form | null;
  stopParams(p: Record<string, unknown>, from: string): Record<string, unknown>; KIND_INFO: Record<PromoKind, { contract: string }>; STOP_REASON: string;
};
const MODEL = new URL('../../../modules/pos/web/screens/khuyen-mai/model.ts', import.meta.url).href;
let M: Model;

let ctx: TestCtx;
const D0 = '2026-06-19';
const CART = [
  { lineKey: 'a', sku: 'A', qty: 5, price: 100_000 },
  { lineKey: 'b', sku: 'B', qty: 1, price: 200_000 },
  { lineKey: 'c', sku: 'C', qty: 2, price: 50_000 },
  { lineKey: 'd', sku: 'D', qty: 1, price: 30_000 },
];
type Out = { applied: { policyRef: { key: string; version: number } }[]; skipped: { key: string; reason: string }[]; discounts: { lineKey: string; amount: number; policyRef: { key: string } }[]; gifts: { sku: string; qty: number }[] };
const evaluate = async (key: string, lines: unknown[] = CART, extra: Record<string, unknown> = {}, docDate = D0) => {
  const r = await call(ctx, 'POST', '/api/v1/policies/evaluate', { docDate, lines, policies: [{ key }], ...extra });
  expect(r.status, JSON.stringify(r.body)).toBe(200);
  return r.body.data as Out;
};
const by = (ds: Out['discounts'], key: string) => Object.fromEntries(ds.filter((d) => d.policyRef.key === key).map((d) => [d.lineKey, d.amount]));
/** Phát hành như màn: form → toParams (không lỗi) → POST /api/v1/policies. */
const publish = async (f: Form) => {
  const { params, problems } = M.toParams(f);
  expect(problems).toEqual([]);
  const r = await call(ctx, 'POST', '/api/v1/policies', { key: f.key, ruleContract: M.KIND_INFO[f.kind].contract, params, effectiveFrom: f.effectiveFrom, reason: f.reason || 'NT-BH-016' });
  expect(r.status, `${f.key}: ${JSON.stringify(r.body)}`).toBe(201);
  return params;
};
const form = (kind: PromoKind, key: string, p: Partial<Form>): Form => ({ ...M.emptyForm(kind, '2026-01-01'), key, validFrom: '', ...p });

beforeAll(async () => { M = (await import(MODEL)) as Model; ctx = await setupTenant(); });
afterAll(async () => { await ctx.app.close(); });

describe('NT-BH-016 — khai báo khuyến mại ở màn BH18', () => {
  it('§5 dòng 1–6: 6 loại khai ở form, Core tính đúng', async () => {
    await publish(form('tiered', 'KM-BAC', { skus: 'A', tiers: [{ min: '3', mode: 'pct', value: '10' }, { min: '5', mode: 'pct', value: '20' }] }));
    expect(by((await evaluate('KM-BAC')).discounts, 'KM-BAC')).toEqual({ a: 100_000 });

    await publish(form('order_discount', 'KM-TONG', { couponCodes: 'KM50K', orderTiers: [{ minOrder: '500.000', mode: 'pct', value: '5', maxDiscount: '50.000' }] }));
    expect(by((await evaluate('KM-TONG', CART, { coupons: ['km50k'] })).discounts, 'KM-TONG')).toEqual({ a: 25_000, b: 10_000, c: 5_000, d: 1_500 });
    expect((await evaluate('KM-TONG')).skipped[0]?.reason).toContain('cần mã giảm giá');

    await publish(form('order_gift', 'KM-QUA', { giftTiers: [{ minOrder: '1.000.000', gifts: 'QUA01:1' }] }));
    expect((await evaluate('KM-QUA', [...CART, { lineKey: 'b2', sku: 'B', qty: 1, price: 200_000 }])).gifts.map((g) => [g.sku, g.qty])).toEqual([['QUA01', 1]]);

    await publish(form('combo', 'KM-COMBO', { items: [{ sku: 'B', qty: '1' }, { sku: 'C', qty: '2' }], comboMode: 'comboPrice', comboValue: '260.000' }));
    expect(by((await evaluate('KM-COMBO')).discounts, 'KM-COMBO')).toEqual({ b: 26_667, c: 13_333 });

    await publish(form('cheapest_free', 'KM-RE', { skus: 'C, D', buyQty: '3', freeQty: '1', repeat: true }));
    expect(by((await evaluate('KM-RE')).discounts, 'KM-RE')).toEqual({ d: 30_000 });

    await publish(form('buy_x_get_y', 'KM-XY', { buy: { sku: 'A', qty: '2' }, get: { sku: 'C', qty: '1' }, repeat: true }));
    expect((await evaluate('KM-XY', [{ lineKey: 'a', sku: 'A', qty: 4, price: 100_000 }])).gifts.map((g) => [g.sku, g.qty])).toEqual([['C', 2]]);
  });

  it('§5 dòng 7, §6 dòng 1: điều kiện chung đi vào params; form sai bị chặn ở màn trước khi gửi', async () => {
    const f = form('tiered', 'KM-CUOI-TUAN', { skus: 'A', tiers: [{ min: '1', mode: 'pct', value: '5' }], weekdays: [6, 7], timeFrom: '08:00', timeTo: '12:00', priority: 5, exclusive: true, legalCapPct: '30' });
    const p = await publish(f);
    expect(p).toMatchObject({ priority: 5, exclusive: true, legalCapPct: 30, conditions: { weekdays: [6, 7], timeFrom: '08:00', timeTo: '12:00' } });
    expect((await evaluate('KM-CUOI-TUAN', CART, { at: { weekday: 5, time: '09:00' } })).skipped[0]?.reason).toContain('chỉ áp thứ 7, Chủ nhật');
    expect((await evaluate('KM-CUOI-TUAN', CART, { at: { weekday: 6, time: '09:00' } })).applied.length).toBe(1);
    // Khứ hồi: params → form → params giống hệt (Sửa không làm mất điều kiện).
    expect(M.toParams(M.fromParams('sale.promo.tiered@1', p, { key: 'KM-CUOI-TUAN', today: D0 })!).params).toEqual(p);
    expect(M.toParams(form('tiered', 'KM SAI', { skus: '', tiers: [{ min: '5', mode: 'pct', value: '10' }, { min: '3', mode: 'pct', value: '20' }] })).problems)
      .toEqual(['Chưa nhập nhóm mã hàng', 'Các bậc phải tăng dần', 'Mã khuyến mại: 2–64 ký tự chữ, số, dấu chấm, gạch (vd KM-TET-2026)']);
  });

  it('§5 dòng 9–10: sửa = bản mới từ ngày chọn (chứng từ trước giữ bản cũ); ngừng từ ngày → không áp từ ngày đó', async () => {
    const p1 = await publish(form('tiered', 'KM-SUA', { skus: 'A', tiers: [{ min: '1', mode: 'pct', value: '10' }] }));
    const f2 = M.fromParams('sale.promo.tiered@1', p1, { key: 'KM-SUA', today: D0 })!;
    await publish({ ...f2, effectiveFrom: '2026-07-01', tiers: [{ min: '1', mode: 'pct', value: '20' }] });
    expect(by((await evaluate('KM-SUA', [CART[0]!], {}, '2026-06-30')).discounts, 'KM-SUA')).toEqual({ a: 50_000 });
    expect(by((await evaluate('KM-SUA', [CART[0]!], {}, '2026-07-01')).discounts, 'KM-SUA')).toEqual({ a: 100_000 });

    const p3 = (await call(ctx, 'GET', '/api/v1/policies?domain=sale&at=2026-07-01')).body.data.items.find((x: { policyKey: string }) => x.policyKey === 'KM-SUA').params;
    const r = await call(ctx, 'POST', '/api/v1/policies', { key: 'KM-SUA', ruleContract: 'sale.promo.tiered@1', params: M.stopParams(p3, '2026-07-10'), effectiveFrom: '2026-07-10', reason: `${M.STOP_REASON} từ 2026-07-10` });
    expect(r.status, JSON.stringify(r.body)).toBe(201);
    expect(by((await evaluate('KM-SUA', [CART[0]!], {}, '2026-07-09')).discounts, 'KM-SUA')).toEqual({ a: 100_000 });
    expect((await evaluate('KM-SUA', [CART[0]!], {}, '2026-07-10')).applied).toEqual([]);
    const reg = (await call(ctx, 'GET', '/api/v1/policy-registry')).body.data.items.find((x: { policyKey: string }) => x.policyKey === 'KM-SUA');
    expect(reg.versions.map((v: { version: number; reason: string }) => [v.version, v.reason])).toEqual([[1, 'NT-BH-016'], [2, 'NT-BH-016'], [3, `${M.STOP_REASON} từ 2026-07-10`]]);
  });
});
