// [2026-11-21 09:25 AM Võ Hoàng] PHASE-031 — S031-11 (30-S031-11 §3): Rule Contract purchase.<loại>@1 — khoá tham số, vectors, hồi quy so engine từng đồng, chặn phát hành inline
/**
 * purchase.<loại>@1 bọc bộ máy mua hàng (`@bizcity/mua-hang-domain`), không viết lại công thức:
 *   T031-PC-1  đủ mười ba loại PolicyKind, miền purchase; describe().params khớp khoá zod (cả scope.*, rule.*), bắt buộc / tuỳ chọn đúng;
 *   T031-PC-2  vectors của describe() chạy đúng; publishChecks từ chối nội dung sai;
 *   T031-PC-3  HỒI QUY: trên các phiếu mẫu lấy từ test mua hàng hiện có (kich-ban TH1–TH4, ap-rieng, cộng dồn, mua-tặng theo ĐVT, cha – con,
 *              bỏ tích…), kết quả qua hợp đồng = kết quả engine gốc — so trọn DocCalc (từng đồng, từng dòng, vết), giftPlan, rebateFor,
 *              creditStatus, dueDateFor;
 *   T031-PC-4  GET /api/v1/rule-contracts có purchase.*; phát hành inline purchase.* bị chặn (chính sách mua do module mua hàng làm chủ).
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { ZodTypeAny } from 'zod';
import {
  computeDoc, creditStatus, dueDateFor, giftPlan, rebateFor, termFromRule, POLICY_LABEL,
  type GiftItem, type PDoc, type PLine, type Policy, type PolicyKind, type ProductUnit,
} from '@bizcity/mua-hang-domain';
import { RULE_CONTRACTS, getRuleContract } from '../src/modules/system/rule-contracts/index.js';
import {
  PURCHASE_CONTRACTS, PURCHASE_PARAMS, computeDocViaContracts, docSummary, giftRows, policyFromParams, type PurchaseParams,
} from '../src/modules/system/rule-contracts/purchase.js';
import { call, setupTenant, type TestCtx } from './helpers.js';

const KINDS = Object.keys(POLICY_LABEL) as PolicyKind[];
const contractOf = (kind: PolicyKind) => getRuleContract(`purchase.${kind}@1`)!;
/** Nội dung bản như module mua hàng ghi ở sổ đăng ký (policySnapshot ở phan-he/mua-hang/store.ts). */
const snapshot = (p: Policy) => ({
  code: p.code, kind: p.kind, name: p.name, scope: Object.fromEntries(Object.entries(p.scope).filter(([, x]) => x)),
  rule: p.rule, validFrom: p.validFrom ?? null, validTo: p.validTo ?? null, priority: p.priority ?? 0, isActive: p.isActive,
});
const parse = (p: Policy) => contractOf(p.kind).params.parse(snapshot(p)) as PurchaseParams;

/* ------------------------------------------------------------------ dữ liệu mẫu (chép từ các test mua hàng hiện có) */

const pol = (code: string, kind: PolicyKind, rule: Record<string, unknown>, scope: Policy['scope'] = {}, o: Partial<Policy> = {}): Policy =>
  ({ id: code, code, kind, name: `CT ${code}`, scope, isActive: true, rule, ...o });
// kich-ban.ts (25 tình huống): Trung Hậu, giá gồm VAT
const G = '110154035', V = '110154036';
const kl = (sku: string, qty: number, price: number, extra: Partial<PLine> = {}): PLine => ({ lineKey: `${sku}-${qty}-${extra.lineType ?? 'buy'}`, sku, name: sku, unit: 'Lon', qty, price, taxCode: 'V08', lineType: 'buy', ...extra });
const kd = (lines: PLine[], o: Partial<PDoc> = {}): PDoc => ({ id: 't', kind: 'receipt', status: 'draft', docNo: '', docDate: '2026-10-01', branchCode: 'CN', partnerCode: 'NCC-TRUNGHAU', priceIncludesVat: true, lines, orderDiscount: {}, ...o });
const term10 = pol('payment_term', 'payment_term', { basis: 'invoice_date', days: 10, workingDays: true }, { partnerCode: 'NCC-TRUNGHAU' });
const inv = { invoice: { no: '3181', date: '2026-10-01' } };
// ap-rieng.test.ts: NCC N1, nhãn TH, giá chưa VAT
const al = (k: string, sku: string, qty: number, price: number, o: Partial<PLine> = {}): PLine => ({ lineKey: k, sku, name: sku, unit: 'Lon', qty, price, taxCode: 'V08', lineType: 'buy', brandCode: 'TH', ...o });
const ad = (lines: PLine[], o: Partial<PDoc> = {}): PDoc => ({ id: 'd', kind: 'receipt', status: 'draft', docNo: '', docDate: '2026-10-27', branchCode: 'B', partnerCode: 'N1', priceIncludesVat: false, lines, ...o });
const ap = (code: string, kind: PolicyKind, rule: Record<string, unknown>, scope: Policy['scope'] = {}, priority = 0) => pol(code, kind, rule, { partnerCode: 'N1', ...scope }, { priority });
const A = al('a', 'A', 10, 100_000), B = al('b', 'B', 10, 100_000);
const ck7A = (apply?: string) => ap('CK7A', 'trade_discount', { pct: 7, ...(apply ? { apply } : {}) }, { sku: 'A' });
const ck2 = ap('CK2', 'trade_discount', { pct: 2 });
// mua-tang-dvt.test.ts: Hộp 1, Lốc 4, Thùng 48
const RA = { hộp: 1, lốc: 4, thùng: 48 }, RQ = { cái: 1, hộp: 10 };
const row = (o: Partial<GiftItem>): GiftItem => ({ sku: 'A', buyQty: 1, buyUnit: 'Thùng', giftSku: '', getQty: 2, getUnit: 'Hộp', buyRatios: RA, ...o });
const gp = (items: GiftItem[], o: Partial<Policy> = {}, split = true): Policy => ({ id: 'QT', code: 'QT', kind: 'promo_gift', name: 'Mua tặng', scope: { partnerCode: 'N1' }, isActive: true, rule: { splitIntoCost: split, items }, ...o });
const ul = (k: string, qty: number, unit: string, o: Partial<PLine> = {}): PLine => ({ lineKey: k, sku: 'A', name: 'Sữa A', unit, qty, price: 10_000 * ((RA as Record<string, number>)[unit.toLowerCase()] ?? 1), taxCode: 'V08', lineType: 'buy', ...o });
const ud = (lines: PLine[], o: Partial<PDoc> = {}): PDoc => ({ id: 'd', kind: 'order', status: 'draft', docNo: '', docDate: '2026-10-28', branchCode: 'B', partnerCode: 'N1', priceIncludesVat: false, lines, ...o });
const unitsA: Record<string, ProductUnit[]> = { A: [{ unit: 'Hộp', ratio: 1 }, { unit: 'Lốc', ratio: 4 }, { unit: 'Thùng', ratio: 48 }] };

interface Sample { name: string; doc: PDoc; policies: Policy[]; units?: Record<string, ProductUnit[]>; holidays?: string[] }
const SAMPLES: Sample[] = [
  { name: 'TH1 — CK 7% ghi trên phiếu, hạn 10 ngày làm việc', doc: kd([kl(G, 60, 528_000), kl(V, 24, 431_000)], { orderDiscount: { pct: 7 }, ...inv }), policies: [term10] },
  { name: 'TH1 — CK 7% theo chính sách CKTM + hạn + CKTT 2%', doc: kd([kl(G, 60, 528_000), kl(V, 24, 431_000)], { orderDiscount: undefined, ...inv }), policies: [pol('CK7', 'trade_discount', { pct: 7 }, { partnerCode: 'NCC-TRUNGHAU' }), term10, pol('CKTT2', 'payment_discount', { pct: 2 })] },
  { name: 'TH2 — CK 2.000.000 ghi trên phiếu', doc: kd([kl(G, 80, 528_000), kl(V, 20, 431_000)], { orderDiscount: { amount: 2_000_000 } }), policies: [term10] },
  { name: 'TH3 — nhập 100 G + 150 V, hạn mức (không vào computeDoc)', doc: kd([kl(G, 100, 528_000), kl(V, 150, 431_000)]), policies: [pol('HM', 'credit_limit', { limit: 600_000_000, warnPct: 90 })] },
  { name: 'Áp đồng thời: CK 7% riêng mã A + 2% chung', doc: ad([A, B]), policies: [ck7A(), ck2] },
  { name: 'Áp riêng: CK 7% riêng mã A áp riêng', doc: ad([A, B]), policies: [ck7A('exclusive'), ck2] },
  { name: 'CK trên đơn áp riêng chặn bậc SL', doc: ad([A, B]), policies: [ap('CK2X', 'trade_discount', { pct: 2, apply: 'exclusive' }), ap('BAC', 'qty_tier', { tiers: [{ from: 5, pct: 5 }] }, { sku: 'A' })] },
  { name: 'Hai áp riêng cùng mã: ưu tiên thắng', doc: ad([A]), policies: [ap('BAC5', 'qty_tier', { tiers: [{ from: 1, pct: 5 }], apply: 'exclusive' }, { sku: 'A' }), ap('MA3', 'item_discount', { items: [{ sku: 'A', pct: 3 }], apply: 'exclusive' }, {}, 1)] },
  { name: 'Bỏ tích chương trình áp riêng trên phiếu', doc: ad([A, B], { skipPolicies: ['CK7A'] }), policies: [ck7A('exclusive'), ck2] },
  { name: 'Quà mua 10 tặng 1 áp riêng + bậc SL', doc: ad([A, B]), policies: [ap('QUA', 'promo_gift', { buy: 10, get: 1, splitIntoCost: true, apply: 'exclusive' }, { sku: 'A' }), ap('BAC', 'qty_tier', { tiers: [{ from: 5, pct: 5 }] })] },
  { name: 'CK tiền 2 triệu từ 50 triệu, cộng dồn, + áp riêng mã A', doc: ad([al('a', 'A', 1, 60e6), al('b', 'B', 1, 60e6)]), policies: [ap('CK7A', 'trade_discount', { pct: 7, apply: 'exclusive' }, { sku: 'A' }), ap('CK2TR', 'trade_discount', { amount: 2_000_000, minOrder: 50_000_000, repeat: true })] },
  { name: 'Mua – tặng theo ĐVT: 1 Thùng + 6 Lốc + 24 Hộp, quà khác mã', doc: ud([ul('a', 1, 'Thùng'), ul('b', 6, 'Lốc'), ul('c', 24, 'Hộp'), ul('g', 4, 'Hộp', { lineType: 'gift_seller', price: 0 })]), policies: [gp([row({}), row({ buyQty: 5, giftSku: 'Q', getQty: 1, getUnit: 'Hộp', giftRatios: RQ })])], units: unitsA },
  { name: 'Bảng CK theo mã giảm theo Thùng, phiếu theo Hộp (quy đổi units)', doc: ud([ul('a', 96, 'Hộp'), ul('b', 2, 'Thùng')]), policies: [ap('CKT', 'item_discount', { items: [{ sku: 'A', amount: 48_000, unit: 'Thùng' }, { sku: 'A', pct: 2, unit: 'Hộp', minQty: 200 }] })], units: unitsA },
  { name: 'Cha – con: chính sách khai ở NCC mẹ, phiếu của đơn vị con', doc: ad([A, B], { partnerCode: 'N1-CON' }), policies: [pol('CKME', 'trade_discount', { pct: 3 }, { partnerCode: 'N1', withChildren: true }, { familyCodes: ['N1-CON'] })] },
  { name: 'Hiệu lực + chi nhánh: một chính sách hết hạn, một ngoài chi nhánh', doc: ad([A, B]), policies: [ap('HET', 'trade_discount', { pct: 5 }, {}, 0), ap('CNKHAC', 'qty_tier', { tiers: [{ from: 1, pct: 4 }] }, { branchCodes: ['X'] })].map((p, i) => (i === 0 ? { ...p, validTo: '2026-10-01' } : p)) },
  { name: 'Đổi hàng: chính sách không áp', doc: ad([al('o', 'A', 10, 500_000, { dir: 'out' }), al('i', 'B', 12, 500_000, { dir: 'in' })], { kind: 'exchange' }), policies: [ck2, ap('BAC', 'qty_tier', { tiers: [{ from: 1, pct: 5 }] })] },
  { name: 'Hạn theo ngày nhận hàng, ngày lễ, payDays', doc: ad([A], { receivedDate: '2026-10-28', orderDiscount: {} }), policies: [ap('HAN', 'payment_term', { basis: 'receipt_date', days: 5, dayType: 'working', payDays: [5, 15, 25] }), ap('TT1', 'payment_discount', { pct: 1 })], holidays: ['2026-11-02'] },
];

/* ------------------------------------------------------------------ T031-PC-1 */

describe('T031-PC-1: danh sách và khuôn tham số', () => {
  it('đủ mười ba loại chính sách mua hàng, miền purchase, có trong RULE_CONTRACTS', () => {
    expect(PURCHASE_CONTRACTS.map((c) => c.id).sort()).toEqual(KINDS.map((k) => `purchase.${k}@1`).sort());
    for (const c of PURCHASE_CONTRACTS) {
      expect(c.domain).toBe('purchase');
      expect(RULE_CONTRACTS).toContain(c);
      expect(getRuleContract(c.id)).toBe(c);
    }
    // Các hợp đồng bán giữ nguyên miền.
    expect(RULE_CONTRACTS.filter((c) => c.id.startsWith('sale.')).every((c) => c.domain === 'sale')).toBe(true);
  });

  const unwrap = (s: ZodTypeAny): ZodTypeAny => {
    let x = s as ZodTypeAny & { _def: { innerType?: ZodTypeAny } };
    while (x._def.innerType) x = x._def.innerType as typeof x;
    return x;
  };
  it.each(KINDS)('purchase.%s@1: describe().params khớp khoá zod; bắt buộc / tuỳ chọn đúng', (kind) => {
    const shape = PURCHASE_PARAMS[kind].shape as Record<string, ZodTypeAny>;
    const code = new Map<string, boolean>();
    for (const [k, v] of Object.entries(shape)) {
      const inner = (unwrap(v) as { shape?: Record<string, ZodTypeAny> }).shape;
      if (inner && (k === 'scope' || k === 'rule')) for (const [n, s] of Object.entries(inner)) code.set(`${k}.${n}`, !s.isOptional());
      else code.set(k, !v.isOptional());
    }
    const docs = contractOf(kind).describe().params;
    expect(docs.map((d) => d.name).sort()).toEqual([...code.keys()].sort());
    for (const d of docs) expect(d.required, d.name).toBe(code.get(d.name));
  });

  it('nội dung thật của module mua hàng (ảnh chụp policySnapshot) qua được khuôn, giữ nguyên rule (kể cả khoá lạ)', () => {
    for (const s of SAMPLES) for (const p of s.policies) {
      const parsed = parse(p);
      expect(parsed.rule, p.code).toEqual(p.rule);
      expect(contractOf(p.kind).publishChecks(parsed), p.code).toEqual([]);
    }
    const odd = parse(pol('X', 'trade_discount', { pct: 7, someFutureKey: 'giữ' }));
    expect((odd.rule as Record<string, unknown>).someFutureKey).toBe('giữ');
  });
});

/* ------------------------------------------------------------------ T031-PC-2 */

describe('T031-PC-2: vectors và kiểm phát hành', () => {
  it.each(KINDS)('purchase.%s@1: mọi vectors chạy đúng đầu ra chuẩn; tham số vector qua khuôn và kiểm phát hành', (kind) => {
    const c = contractOf(kind);
    const { vectors, spec } = c.describe();
    expect(vectors.length).toBeGreaterThanOrEqual(1);
    expect(['compute', 'check', 'describe']).toContain((spec as { mode: string }).mode);
    for (const v of vectors) {
      const p = c.params.parse(v.params);
      expect(c.publishChecks(p), v.name).toEqual([]);
      expect(v.output, `${v.name}: thiếu đầu ra chuẩn`).toBeDefined();
      expect(JSON.parse(JSON.stringify(c.evaluate(p, v.input))), v.name).toEqual(v.output);
      expect(typeof c.explain(p, c.evaluate(p, v.input))).toBe('string');
      expect(c.treatment(c.evaluate(p, v.input))).toEqual([]);
    }
  });

  it('vectors mang đúng số của tài liệu yêu cầu mua hàng (TH1, TH3, TH4)', () => {
    const out = (kind: PolicyKind, n: number) => contractOf(kind).describe().vectors[n]!.output as Record<string, unknown>;
    expect(out('trade_discount', 0)).toMatchObject({ applied: true, payable: 39_082_320 });
    expect(out('payment_discount', 0)).toMatchObject({ ckttExpected: 781_646 });
    expect(out('credit_limit', 0)).toMatchObject({ after: 567_450_000, remaining: 32_550_000 });
    expect(out('credit_limit', 1)).toMatchObject({ exceeded: 7_450_000 });
    expect(out('payment_term', 0)).toMatchObject({ dueDate: '2026-10-15' });
  });

  it('khuôn và publishChecks từ chối nội dung sai', () => {
    const base = { code: 'X', name: 'X', scope: {}, isActive: true, validFrom: null, validTo: null, priority: 0 };
    const bad = (kind: PolicyKind, rule: unknown, o: Record<string, unknown> = {}) => contractOf(kind).params.safeParse({ ...base, kind, rule, ...o }).success;
    expect(bad('trade_discount', { pct: 120 })).toBe(false);
    expect(bad('qty_tier', { tiers: [] })).toBe(false);
    expect(bad('payment_term', { basis: 'khac' })).toBe(false);
    expect(bad('supply_target', { period: '2026/10', branches: {} })).toBe(false);
    expect(bad('trade_discount', { pct: 7 }, { kind: 'qty_tier' })).toBe(false); // sai loại
    expect(bad('trade_discount', { pct: 7 }, { validFrom: '01/10/2026' })).toBe(false);
    const checks = (kind: PolicyKind, rule: Record<string, unknown>, o: Record<string, unknown> = {}) => {
      const c = contractOf(kind);
      return c.publishChecks(c.params.parse({ ...base, kind, rule, ...o })).map((i) => i.path);
    };
    expect(checks('trade_discount', { pct: 7, amount: 1000 })).toEqual(['rule']);
    expect(checks('trade_discount', {})).toEqual(['rule']);
    expect(checks('item_discount', { items: [{ sku: 'A', pct: 3 }, { sku: 'A', pct: 4 }, { sku: 'B' }] })).toEqual(['rule.items.1', 'rule.items.2']);
    expect(checks('qty_tier', { tiers: [{ from: 5, pct: 1 }, { from: 5, pct: 2 }] })).toEqual(['rule.tiers']);
    expect(checks('promo_gift', { splitIntoCost: true })).toEqual(['rule']);
    expect(checks('stage_rebate', { mode: 'stage', stages: [{ from: 10, to: 1, min: 0, pct: 1 }, { from: 11, to: 20, min: 0 }] })).toEqual(['rule.stages.0', 'rule.stages.1']);
    expect(checks('credit_limit', { limit: 100, branches: { A: 80, B: 30 } })).toEqual(['rule.branches']);
    expect(checks('lot_tracking', { required: true }, { validFrom: '2026-11-10', validTo: '2026-11-01' })).toEqual(['validTo']);
  });
});

/* ------------------------------------------------------------------ T031-PC-3 hồi quy */

describe('T031-PC-3: hồi quy — qua hợp đồng = engine gốc, từng đồng', () => {
  const DOC_KINDS: PolicyKind[] = ['trade_discount', 'item_discount', 'qty_tier', 'payment_discount'];
  const familyOf = (ps: Policy[]) => Object.fromEntries(ps.filter((p) => p.familyCodes?.length).map((p) => [p.code, p.familyCodes!]));
  const opts = (s: Sample) => ({ ...(s.units ? { units: s.units } : {}), ...(s.holidays ? { holidays: s.holidays } : {}) });

  it(`có ${SAMPLES.length} phiếu mẫu, đủ các loại tính trên phiếu`, () => {
    expect(SAMPLES.length).toBeGreaterThanOrEqual(15);
    const kinds = new Set(SAMPLES.flatMap((s) => s.policies.map((p) => p.kind)));
    for (const k of [...DOC_KINDS, 'promo_gift', 'payment_term'] as PolicyKind[]) expect(kinds.has(k), k).toBe(true);
  });

  it.each(SAMPLES.map((s) => [s.name, s] as const))('%s: cả tập chính sách qua hợp đồng → computeDoc trùng trọn DocCalc', (_n, s) => {
    const want = computeDoc(s.doc, s.policies, opts(s));
    const got = computeDocViaContracts(s.doc, s.policies.map(snapshot), { ...opts(s), familyCodes: familyOf(s.policies) });
    expect(got).toEqual(want);
    expect(got.payable).toBe(want.payable);
    expect(got.lines.map((l) => [l.lineDiscount, l.orderDiscount, l.beforeTax, l.tax, l.realUnitCost])).toEqual(want.lines.map((l) => [l.lineDiscount, l.orderDiscount, l.beforeTax, l.tax, l.realUnitCost]));
  });

  it.each(SAMPLES.map((s) => [s.name, s] as const))('%s: từng chính sách qua evaluate của hợp đồng = engine với đúng chính sách đó', (_n, s) => {
    for (const p of s.policies) {
      const c = contractOf(p.kind);
      const params = parse(p);
      if (DOC_KINDS.includes(p.kind)) {
        const got = c.evaluate(params, { doc: s.doc, ...opts(s), ...(p.familyCodes ? { familyCodes: p.familyCodes } : {}) });
        expect(got, p.code).toEqual(docSummary(computeDoc(s.doc, [p], opts(s)), p.code));
      } else if (p.kind === 'promo_gift') {
        const got = c.evaluate(params, { doc: s.doc, ...(p.familyCodes ? { familyCodes: p.familyCodes } : {}) });
        expect(got, p.code).toEqual({ gifts: giftRows(giftPlan(s.doc, [p])) });
      } else if (p.kind === 'payment_term') {
        const term = termFromRule(p.rule);
        expect(c.evaluate(params, { doc: s.doc, holidays: s.holidays })).toMatchObject({ term, ...(dueDateFor(term, s.doc, s.holidays) ? { dueDate: dueDateFor(term, s.doc, s.holidays) } : {}) });
      } else if (p.kind === 'credit_limit') {
        const thisDoc = computeDoc(s.doc, s.policies).payable;
        for (const [cur, open] of [[450_000_000, 0], [450_000_000, thisDoc], [0, 0]] as const) {
          expect(c.evaluate(params, { current: cur, openOrders: open, thisDoc })).toEqual(creditStatus(p, cur, open, thisDoc));
        }
      }
    }
  });

  it('mua – tặng: kết quả gợi ý quà qua hợp đồng = giftPlan trên các phiếu có quà', () => {
    const cases: [PDoc, Policy][] = [
      [ud([ul('a', 1, 'Thùng')]), gp([row({})])],
      [ud([ul('a', 12, 'Lốc')]), gp([row({})])],
      [ud([ul('a', 47, 'Hộp')]), gp([row({})])],
      [ud([ul('a', 3, 'Thùng')]), gp([row({ repeat: false })])],
      [ud([ul('a', 1, 'Thùng')]), gp([row({ buyQty: 2, buyUnit: 'Lốc', giftSku: 'Q', getQty: 1, getUnit: 'Cái', giftRatios: RQ })])],
      [ud([ul('a', 5, 'Thùng')]), gp([row({}), row({ buyQty: 5, giftSku: 'Q', getQty: 1, getUnit: 'Hộp', giftRatios: RQ })], {}, false)],
      [ad([al('a', 'A', 5, 100_000), al('g', 'A', 1, 0, { lineType: 'gift_seller', program: 'QUA21', autoGift: true })]), ap('QUA21', 'promo_gift', { buy: 2, get: 1, splitIntoCost: true, repeat: false }, { sku: 'A' })],
    ];
    for (const [d, p] of cases) {
      const want = giftRows(giftPlan(d, [p]));
      expect(contractOf('promo_gift').evaluate(parse(p), { doc: d })).toEqual({ gifts: want });
    }
    expect(cases.length).toBe(7);
  });

  it('thưởng cuối kỳ: rebateFor qua hợp đồng = engine trên nhiều mức doanh số', () => {
    const ps = [
      pol('KY', 'period_rebate', { period: 'month', tiers: [{ from: 200_000_000, pct: 2 }, { from: 300_000_000, pct: 3 }] }),
      pol('CT', 'target_rebate', { period: 'month', target: 500_000_000, tiers: [{ fromPct: 100, pct: 2 }, { fromPct: 110, pct: 3 }] }),
      pol('GD', 'stage_rebate', { mode: 'stage', stages: [{ from: 1, to: 10, min: 100_000_000, pct: 1 }, { from: 11, to: 20, min: 150_000_000, pct: 2 }, { from: 21, to: 31, min: 200_000_000, pct: 3 }] }),
      pol('LK', 'stage_rebate', { mode: 'cumulative', stages: [{ from: 1, to: 15, min: 200_000_000, pct: 1 }, { from: 16, to: 31, min: 500_000_000, amount: 5_000_000 }] }),
    ];
    const sales = [
      { total: 0 }, { total: 199_999_999 }, { total: 320_000_000 }, { total: 549_999_999 }, { total: 550_000_000 },
      { total: 550_000_000, byDay: { 3: 40e6, 6: 45e6, 9: 35e6, 12: 60e6, 15: 50e6, 19: 70e6, 22: 80e6, 26: 90e6, 29: 80e6 } },
    ];
    let n = 0;
    for (const p of ps) for (const s of sales) { expect(contractOf(p.kind).evaluate(parse(p), { sales: s }), `${p.code} ${s.total}`).toEqual(rebateFor(p, s)); n++; }
    expect(n).toBe(24);
  });

  it('hạn mức chi nhánh và điều khoản thanh toán: = creditStatus / dueDateFor', () => {
    const hm = pol('HM', 'credit_limit', { limit: 600_000_000, warnPct: 80, branches: { 'CN-ND': 100_000_000 } }, { brandCode: 'ANLENE' });
    for (const b of [undefined, 'CN-ND', 'CN-PT']) expect(contractOf('credit_limit').evaluate(parse(hm), { current: 90e6, openOrders: 5e6, thisDoc: 10e6, branchCode: b })).toEqual(creditStatus(hm, 90e6, 5e6, 10e6, b));
    const terms = [
      { basis: 'invoice_date', days: 10, workingDays: true }, { basis: 'receipt_date', days: 30, dayType: 'calendar' }, { basis: 'order_date', days: 7, dayType: 'working6' },
      { basis: 'invoice_date', monthDay: 25 }, { basis: 'receipt_date', days: 15, payDays: [10, 20] }, { basis: 'immediate' }, { basis: 'prepay' }, { basis: 'fixed' },
    ];
    const d = { docDate: '2026-10-01', invoice: { no: '1', date: '2026-10-03' }, receivedDate: '2026-10-05', invoiceFix: { from: '2026-10-06', to: '2026-10-09' } };
    for (const r of terms) {
      const p = pol('T', 'payment_term', r);
      const t = termFromRule(p.rule);
      const due = dueDateFor(t, d, ['2026-10-20']);
      expect(contractOf('payment_term').evaluate(parse(p), { doc: d, holidays: ['2026-10-20'] }), JSON.stringify(r)).toEqual({ term: t, text: expect.any(String), ...(due !== undefined ? { dueDate: due } : {}) });
    }
  });

  it('policyFromParams dựng lại đúng Policy mà engine dùng (không thừa / thiếu trường ảnh hưởng tính)', () => {
    const p = { ...ck7A('exclusive'), validFrom: '2026-01-01', priority: 3 };
    expect(policyFromParams(parse(p))).toEqual({ ...p });
  });
});

/* ------------------------------------------------------------------ T031-PC-4 qua API */

describe('T031-PC-4: API — liệt kê purchase.*, chặn phát hành inline', () => {
  let ctx: TestCtx;
  beforeAll(async () => { ctx = await setupTenant(); }, 60_000);
  afterAll(async () => { await ctx.app.close(); });

  it('GET /api/v1/rule-contracts có đủ purchase.* (miền purchase); GET /:id trả tham số, spec, vectors', async () => {
    const r = await call(ctx, 'GET', '/api/v1/rule-contracts');
    expect(r.status).toBe(200);
    const items = r.body.data.items as { id: string; domain: string; title: string }[];
    expect(items.filter((i) => i.domain === 'purchase').map((i) => i.id).sort()).toEqual(KINDS.map((k) => `purchase.${k}@1`).sort());
    expect(items.some((i) => i.domain === 'sale')).toBe(true);
    const one = await call(ctx, 'GET', '/api/v1/rule-contracts/purchase.trade_discount@1');
    expect(one.status).toBe(200);
    expect(one.body.data).toMatchObject({ id: 'purchase.trade_discount@1', domain: 'purchase', spec: { mode: 'compute' } });
    expect(one.body.data.vectors[0].output.payable).toBe(39_082_320);
  });

  it('POST /api/v1/policies với purchase.* → 400, không ghi sổ đăng ký', async () => {
    const params = { code: 'CK7', kind: 'trade_discount', name: 'CK 7%', scope: {}, rule: { pct: 7 }, isActive: true, validFrom: null, validTo: null, priority: 0 };
    const r = await call(ctx, 'POST', '/api/v1/policies', { key: 'MH-CK7', ruleContract: 'purchase.trade_discount@1', params, effectiveFrom: '2030-01-01' });
    expect(r.status, JSON.stringify(r.body)).toBe(400);
    expect(JSON.stringify(r.body)).toContain('module mua hàng làm chủ');
    const list = await call(ctx, 'GET', '/api/v1/policies?at=2030-01-02&domain=purchase');
    expect(list.status).toBe(200);
    expect((list.body.data.items as { policyKey: string }[]).some((i) => i.policyKey === 'MH-CK7')).toBe(false);
  });
});
