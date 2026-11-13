// [2026-11-13 11:00 AM Võ Hoàng] POS-KM2 — S031-15 đợt 2 (PHASE-031 · 00 §18): vectors năm khuôn khuyến mại mở rộng qua hàm thuần và qua endpoint; kiểm phát hành (đóng góp)
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  cheapestFreeVectors, comboVectors, orderDiscountVectors, orderGiftVectors, saleCheapestFree, saleCombo, saleOrderDiscount, saleOrderGift, saleTiered, tieredVectors,
} from '../src/modules/system/rule-contracts/sale-promo.js';
import type { AnyRuleContract } from '../src/modules/system/rule-contracts/index.js';
import { call, setupTenant, type TestCtx } from './helpers.js';

let ctx: TestCtx;
beforeAll(async () => { ctx = await setupTenant(); });
afterAll(async () => { await ctx.app.close(); });

const SETS: [AnyRuleContract, { name: string; params: unknown; input: { lines: unknown[]; context?: Record<string, unknown> }; output: Record<string, unknown> }[]][] = [
  [saleTiered, tieredVectors], [saleOrderDiscount, orderDiscountVectors], [saleOrderGift, orderGiftVectors], [saleCombo, comboVectors], [saleCheapestFree, cheapestFreeVectors],
];

describe('Hàm thuần — bộ ca chuẩn (NT-BH-012 §4, §5)', () => {
  it('mọi vector ra đúng đầu ra chuẩn; tham số qua khuôn zod', () => {
    for (const [c, vs] of SETS) for (const v of vs) expect(c.evaluate(c.params.parse(v.params), v.input), `${c.id}: ${v.name}`).toEqual(v.output);
  });

  it('kiểm phát hành: bậc không tăng dần, bậc nhiều cách giảm, combo trùng mã / nhiều cách giá, món tặng ≥ món mua, giờ ngược', () => {
    const issues = (c: AnyRuleContract, p: unknown) => c.publishChecks(c.params.parse(p)).map((x) => x.path);
    expect(issues(saleTiered, { skus: ['A'], tiers: [{ min: 5, pct: 10 }, { min: 3, pct: 20 }] })).toContain('tiers');
    expect(issues(saleTiered, { skus: ['A'], tiers: [{ min: 3, pct: 10, unitPrice: 5 }] })).toContain('tiers.0');
    expect(issues(saleOrderDiscount, { tiers: [{ minOrder: 100, pct: 5, amount: 10 }] })).toContain('tiers.0');
    expect(issues(saleCombo, { items: [{ sku: 'A', qty: 1 }, { sku: 'A', qty: 2 }], comboPrice: 10 })).toContain('items');
    expect(issues(saleCombo, { items: [{ sku: 'A', qty: 1 }], comboPrice: 10, discountPct: 5 })).toContain('comboPrice');
    expect(issues(saleCheapestFree, { skus: ['A'], buyQty: 2, freeQty: 2 })).toContain('freeQty');
    expect(issues(saleOrderGift, { conditions: { timeFrom: '20:00', timeTo: '08:00' }, tiers: [{ minOrder: 1, gifts: [{ sku: 'Q', qty: 1 }] }] })).toContain('conditions.timeTo');
    expect(saleTiered.params.safeParse({ skus: ['A'], tiers: [{ min: 3, pct: 120 }] }).success).toBe(false);
  });
});

describe('Qua endpoint (phát hành nội tuyến → evaluate)', () => {
  it('cùng bộ ca: discounts / gifts kèm policyRef; bỏ qua có lý do', async () => {
    let n = 0;
    for (const [c, vs] of SETS) {
      for (const v of vs) {
        if (v.input.context?.lenient) continue; // ca cửa nạp — không đi qua evaluate
        const key = `SP2-${++n}`;
        const pub = await call(ctx, 'POST', '/api/v1/policies', { key, ruleContract: c.id, params: v.params, effectiveFrom: '2026-01-01', reason: 'Bộ ca chuẩn khuyến mại mở rộng' });
        expect(pub.status, `${c.id} ${v.name}: ${JSON.stringify(pub.body)}`).toBe(201);
        const ctxIn = v.input.context ?? {};
        const ev = await call(ctx, 'POST', '/api/v1/policies/evaluate', { docDate: '2026-06-15', lines: v.input.lines, policies: [{ key }], ...ctxIn });
        expect(ev.status, `${v.name}: ${JSON.stringify(ev.body)}`).toBe(200);
        const d = ev.body.data;
        const out = v.output as { discounts: { lineKey: string; amount: number }[]; gifts: { sku: string; qty: number }[]; blocked?: string };
        expect(d.discounts.map((x: { lineKey: string; amount: number }) => [x.lineKey, x.amount]), `${c.id} ${v.name}`).toEqual(out.discounts.map((x) => [x.lineKey, x.amount]));
        expect(d.gifts.map((x: { sku: string; qty: number }) => [x.sku, x.qty]), `${c.id} ${v.name}`).toEqual(out.gifts.map((x) => [x.sku, x.qty]));
        if (out.blocked) expect(d.skipped[0].reason, v.name).toContain(out.blocked);
        else expect(d.applied[0].policyRef.key, v.name).toBe(key);
      }
    }
  });

  it('GET /rule-contracts/:id mô tả năm khuôn', async () => {
    for (const [c] of SETS) {
      const r = await call(ctx, 'GET', `/api/v1/rule-contracts/${c.id}`);
      expect(r.status, c.id).toBe(200);
      expect(r.body.data.vectors.length, c.id).toBeGreaterThan(1);
    }
  });
});
