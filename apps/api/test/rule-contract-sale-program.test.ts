// [2026-11-12 10:00 PM Võ Hoàng] POS-KM — S031-15 phần chương trình bán (PHASE-031 · 00 §17 mục 1): vectors của sale.program.gift@1 / sale.program.discount@1 qua hàm thuần và qua endpoint (đóng góp)
/**
 * Như T031-RC-3 của buy_x_get_y: mỗi vector ra cùng kết quả qua hàm thuần và qua `POST /policies/evaluate` (phát hành inline để có
 * bản đọc được — luật giống hệt bản BH12). Kiểm thêm: khuôn tham số (đúng một cách giảm), kiểm phát hành (trần quà < quà một lần).
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  evaluateProgramDiscount, evaluateProgramGift, programDiscountParams, programDiscountVectors, programGiftParams, programGiftVectors, saleProgramGift,
} from '../src/modules/system/rule-contracts/sale-program.js';
import { call, setupTenant, type TestCtx } from './helpers.js';

let ctx: TestCtx;
beforeAll(async () => { ctx = await setupTenant(); });
afterAll(async () => { await ctx.app.close(); });

const pub = (key: string, ruleContract: string, params: unknown) =>
  call(ctx, 'POST', '/api/v1/policies', { key, ruleContract, params, effectiveFrom: '2026-01-01', reason: 'Bộ ca chuẩn chương trình bán' });

describe('Hàm thuần', () => {
  it('mọi vector tặng hàng / giảm giá ra đúng đầu ra chuẩn', () => {
    for (const v of programGiftVectors) expect(evaluateProgramGift(programGiftParams.parse(v.params), v.input), v.name).toEqual(v.output);
    for (const v of programDiscountVectors) expect(evaluateProgramDiscount(programDiscountParams.parse(v.params), v.input), v.name).toEqual(v.output);
  });

  it('nội dung bản BH12 (thừa trường code, name…) đọc được; giảm giá phải đúng một cách; trần quà nhỏ hơn quà một lần bị chặn', () => {
    const bh12 = { code: 'CT1', name: 'x', programKind: 'KM-CTY', mode: 'gift', sku: 'A', buyQty: 2, giftSku: null, giftQty: 1, discountPct: null, discountAmount: null, salePrice: null, validFrom: '2026-01-01', validTo: '2026-12-31' };
    expect(programGiftParams.parse(bh12)).toMatchObject({ sku: 'A', buyQty: 2, giftQty: 1, repeat: true });
    expect(programDiscountParams.safeParse({ sku: 'A', discountPct: 10, salePrice: 5 }).success).toBe(false);
    expect(programDiscountParams.safeParse({ sku: 'A' }).success).toBe(false);
    expect(saleProgramGift.publishChecks(programGiftParams.parse({ sku: 'A', giftQty: 2, maxGiftQty: 1 }))[0]?.path).toBe('maxGiftQty');
  });
});

describe('Qua endpoint evaluate (cùng bộ ca)', () => {
  it('tặng hàng', async () => {
    for (const [n, v] of programGiftVectors.entries()) {
      const key = `PG-${n + 1}`;
      expect((await pub(key, 'sale.program.gift@1', v.params)).status, v.name).toBe(201);
      const ev = await call(ctx, 'POST', '/api/v1/policies/evaluate', { docDate: '2026-06-15', lines: v.input.lines, policies: [{ key }] });
      expect(ev.status, `${v.name}: ${JSON.stringify(ev.body)}`).toBe(200);
      const d = ev.body.data;
      if (v.output.gifts.length) {
        expect(d.applied[0].result, v.name).toEqual(v.output);
        expect(d.gifts, v.name).toEqual(v.output.gifts.map((g) => ({ ...g, isGift: true, policyRef: { key, version: 1, line: 'gift' } })));
        expect(d.applied[0].treatment, v.name).toEqual([{ on: 'gift', reasonCode: 'XTA1.4', confirmed: false }]);
      } else {
        expect(d.applied, v.name).toEqual([]);
        expect(d.skipped.map((s: { key: string }) => s.key), v.name).toEqual([key]);
      }
    }
  });

  it('giảm giá: discounts kèm policyRef line discount', async () => {
    for (const [n, v] of programDiscountVectors.entries()) {
      const key = `PD-${n + 1}`;
      expect((await pub(key, 'sale.program.discount@1', v.params)).status, v.name).toBe(201);
      const ev = await call(ctx, 'POST', '/api/v1/policies/evaluate', { docDate: '2026-06-15', lines: v.input.lines, policies: [{ key }] });
      expect(ev.status, `${v.name}: ${JSON.stringify(ev.body)}`).toBe(200);
      const d = ev.body.data;
      if (v.output.discounts.length) {
        expect(d.applied[0].result, v.name).toEqual(v.output);
        expect(d.discounts, v.name).toEqual(v.output.discounts.map((x) => ({ ...x, policyRef: { key, version: 1, line: 'discount' } })));
        expect(d.applied[0].treatment, v.name).toEqual([{ on: 'discount', reasonCode: 'GGHB', confirmed: false }]);
        expect(d.gifts, v.name).toEqual([]);
      } else {
        expect(d.discounts, v.name).toEqual([]);
        expect(d.skipped[0].key, v.name).toBe(key);
      }
    }
  });

  it('GET /rule-contracts/:id mô tả cả hai khuôn', async () => {
    for (const id of ['sale.program.gift@1', 'sale.program.discount@1']) {
      const r = await call(ctx, 'GET', `/api/v1/rule-contracts/${id}`);
      expect(r.status, id).toBe(200);
      expect(r.body.data.vectors.length, id).toBeGreaterThan(5);
      expect(r.body.data.spec.steps.length, id).toBeGreaterThanOrEqual(4);
    }
  });
});
