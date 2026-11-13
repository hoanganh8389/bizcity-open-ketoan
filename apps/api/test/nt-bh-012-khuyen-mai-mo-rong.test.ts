// [2026-11-13 11:10 AM Võ Hoàng] POS-KM2 — phiếu NT-BH-012 (PHASE-031 · 00 §18): khuyến mại mở rộng trọn vòng — điều kiện, ưu tiên / áp riêng, trần NĐ81, cửa nạp, trả hàng trả hạn mức (đóng góp)
/**
 * Số liệu theo phiếu §4: A 100.000, B 200.000, C 50.000, D 30.000; giỏ 5 A + 1 B + 2 C + 1 D (830.000). Ngày chứng từ 19/06/2026 (thứ Sáu).
 * Dòng §5 / §6 của phiếu ghi ở tên từng ca.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { sql } from 'kysely';
import { db } from '../src/db/client.js';
import { dispatchOnce } from '../src/core/events.js';
import { call, saleDoc, setupTenant, type TestCtx } from './helpers.js';

let ctx: TestCtx;
let tenantId = '';
const DAY = '2026-06-19';
const FRI = { time: '19:00', weekday: 5 };
const CART = [
  { lineKey: 'a', sku: 'A', qty: 5, price: 100_000 },
  { lineKey: 'b', sku: 'B', qty: 1, price: 200_000 },
  { lineKey: 'c', sku: 'C', qty: 2, price: 50_000 },
  { lineKey: 'd', sku: 'D', qty: 1, price: 30_000 },
];
const pub = async (key: string, ruleContract: string, params: unknown) => {
  const r = await call(ctx, 'POST', '/api/v1/policies', { key, ruleContract, params, effectiveFrom: '2026-01-01', reason: 'NT-BH-012' });
  expect(r.status, `${key}: ${JSON.stringify(r.body)}`).toBe(201);
  return r.body.data as { contentHash: string };
};
const evaluate = (policies: string[], extra: Record<string, unknown> = {}, lines: unknown[] = CART) =>
  call(ctx, 'POST', '/api/v1/policies/evaluate', { docDate: DAY, lines, policies: policies.map((key) => ({ key })), at: FRI, coupons: ['KM50K'], ...extra }).then((r) => {
    expect(r.status, JSON.stringify(r.body)).toBe(200);
    return r.body.data as { applied: { policyRef: { key: string } }[]; skipped: { key: string; reason: string }[]; discounts: { lineKey: string; amount: number; policyRef: { key: string } }[]; gifts: { sku: string; qty: number }[]; capped?: { lineKey: string; key: string; before: number; after: number }[]; policyRefs: { key: string; version: number; hash: string }[] };
  });
const by = (ds: { lineKey: string; amount: number; policyRef: { key: string } }[], key: string) => Object.fromEntries(ds.filter((d) => d.policyRef.key === key).map((d) => [d.lineKey, d.amount]));
const ALL = ['KM-BAC', 'KM-TONG', 'KM-QUA', 'KM-COMBO', 'KM-RE'];

beforeAll(async () => {
  ctx = await setupTenant();
  tenantId = (await db.selectFrom('tenants').select('id').where('code', '=', ctx.tenantCode).executeTakeFirstOrThrow()).id;
  await pub('KM-BAC', 'sale.promo.tiered@1', { skus: ['A'], basis: 'qty', tiers: [{ min: 3, pct: 10 }, { min: 5, pct: 20 }] });
  await pub('KM-TONG', 'sale.promo.order_discount@1', { conditions: { couponCodes: ['KM50K'] }, tiers: [{ minOrder: 500_000, pct: 5, maxDiscount: 50_000 }] });
  await pub('KM-QUA', 'sale.promo.order_gift@1', { tiers: [{ minOrder: 1_000_000, gifts: [{ sku: 'QUA01', qty: 1 }] }] });
  await pub('KM-COMBO', 'sale.promo.combo@1', { items: [{ sku: 'B', qty: 1 }, { sku: 'C', qty: 2 }], comboPrice: 260_000 });
  await pub('KM-RE', 'sale.promo.cheapest_free@1', { skus: ['C', 'D'], buyQty: 3 });
});
afterAll(async () => { await ctx.app.close(); });

describe('NT-BH-012 — khuyến mại mở rộng tính ở Core', () => {
  it('§5 dòng 1–5: giỏ §4 — bậc 20 % A, combo B + 2 C, D 0đ, giảm tổng đơn có mã chia theo dòng; quà tổng đơn chưa đủ', async () => {
    const r = await evaluate(ALL);
    expect(by(r.discounts, 'KM-BAC')).toEqual({ a: 100_000 });
    expect(by(r.discounts, 'KM-COMBO')).toEqual({ b: 26_667, c: 13_333 });
    expect(by(r.discounts, 'KM-RE')).toEqual({ d: 30_000 });
    expect(by(r.discounts, 'KM-TONG')).toEqual({ a: 25_000, b: 10_000, c: 5_000, d: 1_500 });
    expect(r.skipped.find((s) => s.key === 'KM-QUA')?.reason).toContain('tổng đơn 830.000 chưa đủ 1.000.000');
    expect(r.capped).toBeUndefined();
    // Đủ 1.000.000 → quà.
    const big = await evaluate(['KM-QUA'], {}, [...CART, { lineKey: 'b2', sku: 'B', qty: 1, price: 200_000 }]);
    expect(big.gifts.map((g) => [g.sku, g.qty])).toEqual([['QUA01', 1]]);
  });

  it('§5 dòng 4, 6: thiếu mã → bỏ qua; ngoài thứ / giờ; tháng sinh nhật; hạng thành viên', async () => {
    expect((await evaluate(['KM-TONG'], { coupons: [] })).skipped[0]?.reason).toContain('cần mã giảm giá');
    await pub('KM-CUOI-TUAN', 'sale.promo.tiered@1', { skus: ['A'], tiers: [{ min: 1, pct: 5 }], conditions: { weekdays: [6, 7], timeFrom: '08:00', timeTo: '12:00' } });
    expect((await evaluate(['KM-CUOI-TUAN'])).skipped[0]?.reason).toContain('chỉ áp thứ 7, Chủ nhật');
    expect((await evaluate(['KM-CUOI-TUAN'], { at: { weekday: 6, time: '19:00' } })).skipped[0]?.reason).toContain('chỉ áp 08:00–12:00');
    expect((await evaluate(['KM-CUOI-TUAN'], { at: { weekday: 6, time: '09:30' } })).applied.length).toBe(1);
    await pub('KM-SN', 'sale.promo.order_discount@1', { conditions: { birthdayMonth: true, memberLevels: ['VANG'] }, tiers: [{ minOrder: 0, amount: 20_000 }] });
    expect((await evaluate(['KM-SN'])).skipped[0]?.reason).toContain('cần ngày sinh');
    expect((await evaluate(['KM-SN'], { customer: { birthday: '1990-03-02', memberLevel: 'VANG' } })).skipped[0]?.reason).toContain('không phải tháng sinh nhật');
    expect((await evaluate(['KM-SN'], { customer: { birthday: '1990-06-02', memberLevel: 'BAC' } })).skipped[0]?.reason).toContain('chỉ áp hạng VANG');
    expect((await evaluate(['KM-SN'], { customer: { birthday: '1990-06-02', memberLevel: 'VANG' } })).applied.length).toBe(1);
  });

  it('§5 dòng 7: chương trình áp riêng ưu tiên cao giữ dòng A — bậc A không áp thêm', async () => {
    await pub('KM-RIENG', 'sale.promo.tiered@1', { skus: ['A'], tiers: [{ min: 1, pct: 15 }], priority: 10, exclusive: true });
    const r = await evaluate(['KM-RIENG', 'KM-BAC', 'KM-TONG']);
    expect(by(r.discounts, 'KM-RIENG')).toEqual({ a: 75_000 });
    expect(by(r.discounts, 'KM-BAC')).toEqual({});
    expect(r.skipped.find((s) => s.key === 'KM-BAC')?.reason).toContain('áp riêng KM-RIENG');
    // Giảm tổng đơn tính trên các dòng còn lại (B, C, D = 330.000 → chưa đủ 500.000).
    expect(r.skipped.find((s) => s.key === 'KM-TONG')?.reason).toContain('tổng đơn 330.000 chưa đủ 500.000');
  });

  it('§5 dòng 8: trần NĐ81 — B giảm 150.000 / 200.000 (75 %) bị kẹp còn 100.000; chương trình miễn trần thì không kẹp', async () => {
    await pub('KM-SAU', 'sale.promo.tiered@1', { skus: ['B'], tiers: [{ min: 1, unitPrice: 50_000 }] });
    const r = await evaluate(['KM-SAU']);
    expect(by(r.discounts, 'KM-SAU')).toEqual({ b: 100_000 });
    expect(r.capped).toEqual([{ lineKey: 'b', key: 'KM-SAU', before: 150_000, after: 100_000, capPct: 50 }]);
    await pub('KM-MIEN', 'sale.promo.tiered@1', { skus: ['B'], tiers: [{ min: 1, unitPrice: 50_000 }], legalCapPct: null });
    expect(by((await evaluate(['KM-MIEN'])).discounts, 'KM-MIEN')).toEqual({ b: 150_000 });
  });

  it('§5 dòng 9: kiểm phát hành — bậc không tăng dần bị từ chối, nêu ô sai', async () => {
    const r = await call(ctx, 'POST', '/api/v1/policies', { key: 'KM-SAI', ruleContract: 'sale.promo.tiered@1', params: { skus: ['A'], tiers: [{ min: 5, pct: 10 }, { min: 3, pct: 20 }] }, effectiveFrom: '2026-01-01', reason: 'thử' });
    expect(r.status).toBe(400);
    expect(JSON.stringify(r.body)).toContain('tiers');
  });

  it('§5 dòng 11: phiếu bán có quà tổng đơn + giảm bậc → cửa nạp không báo lệch (không có giá → không xác định, không đoán)', async () => {
    const r = await evaluate(['KM-QUA', 'KM-BAC'], {}, [...CART, { lineKey: 'b2', sku: 'B', qty: 1, price: 200_000 }]);
    const doc = saleDoc({
      docKey: 'pos:CN01:KM2-1', docNo: 'KM2-1', docDate: DAY, invoice: undefined, policyRefs: r.policyRefs.map(({ key, version, hash }) => ({ key, version, hash })),
      lines: [
        { lineKey: 'a', sku: 'A', name: 'A', unit: 'Hộp', qty: 5, amountBeforeTax: 370_370, discount: 92_593, taxCode: 'R08', taxAmount: 29_630, policyRef: { key: 'KM-BAC', version: 1, line: 'discount' } },
        { lineKey: 'q', sku: 'QUA01', name: 'Quà', unit: 'Cái', qty: 1, amountBeforeTax: 0, taxCode: 'R08', taxAmount: 0, isGift: true, policyRef: { key: 'KM-QUA', version: 1, line: 'gift' } },
      ],
      payments: [{ methodCode: 'TM', amount: 400_000 }], totals: { beforeTax: 370_370, tax: 29_630, total: 400_000 },
    });
    const p = await call(ctx, 'POST', '/api/v1/documents', doc);
    expect(p.body.data?.status, JSON.stringify(p.body)).toBe('posted');
    const check = (await sql<{ policy_check: { refs: { ok: boolean; codes: string[] }[] } | null }>`SELECT policy_check FROM accounting_events WHERE tenant_id = ${tenantId} AND doc_key = 'pos:CN01:KM2-1'`.execute(db)).rows[0]!.policy_check;
    expect(check?.refs.every((x) => x.ok), JSON.stringify(check)).toBe(true);
  });
});

describe('NT-BH-012 §5 dòng 10 — khách trả hàng trả hạn mức chương trình bán BH12', () => {
  const deliver = () => dispatchOnce({ consumers: ['ban-hang.sale-program-usage'], limit: 100 });
  const used = async () => {
    const list = (await call<{ data: { code: string; quotas: { branchCode: string; usedQty: number }[] }[] }>(ctx, 'GET', '/api/v1/sale-programs?search=CT-TRA')).body.data;
    return list.find((x) => x.code === 'CT-TRA')!.quotas.find((q) => q.branchCode === 'CN01')!.usedQty;
  };
  const returnDoc = (docKey: string) => ({
    docType: 'sale_return', docKey, version: 1, branchCode: 'CN01', docNo: docKey.split(':').pop(), docDate: DAY, originalDocKey: 'pos:CN01:TRA-1',
    partner: { code: '0912345678', name: 'Nguyễn Văn A' },
    lines: [
      { lineKey: 'l1', sku: 'SUA330', name: 'Sữa 330', unit: 'Hộp', qty: 1, amountBeforeTax: 305_556, taxCode: 'R08', taxAmount: 24_444 },
      { lineKey: 'g1', sku: 'QUA01', name: 'Quà', unit: 'Hộp', qty: 1, amountBeforeTax: 0, taxCode: 'R08', taxAmount: 0 },
    ],
    payments: [{ methodCode: 'TM', amount: 330_000 }], totals: { beforeTax: 305_556, tax: 24_444, total: 330_000 },
  });

  it('bán 4 tặng 2 → dùng 2; trả 1 hộp + 1 quà → dùng 1; huỷ phiếu trả → dùng lại 2', async () => {
    for (const [sku, name] of [['SUA330', 'Sữa 330'], ['QUA01', 'Quà tặng']]) {
      await sql`INSERT INTO products (tenant_id, sku, name, unit) VALUES (${tenantId}, ${sku}, ${name}, 'Hộp') ON CONFLICT (tenant_id, sku) DO NOTHING`.execute(db);
    }
    const prog = await call<{ data: { id: string } }>(ctx, 'POST', '/api/v1/sale-programs', {
      code: 'CT-TRA', name: 'Mua 2 tặng 1', programKind: 'KM-CTY', mode: 'gift', sku: 'SUA330', buyQty: 2, giftSku: 'QUA01', giftQty: 1,
      validFrom: '2026-06-01', validTo: '2026-06-30', quotas: [{ branchCode: 'CN01', quotaQty: 10 }],
    });
    expect(prog.status, JSON.stringify(prog.body)).toBe(200);
    const ev = await call(ctx, 'POST', '/api/v1/policies/evaluate', { docDate: DAY, branchCode: 'CN01', lines: [{ lineKey: 'l1', sku: 'SUA330', qty: 4 }], policies: [{ key: 'CT-TRA' }] });
    const ref = ev.body.data.policyRefs[0];
    const sale = saleDoc({
      docKey: 'pos:CN01:TRA-1', docNo: 'TRA-1', docDate: DAY, invoice: undefined, policyRefs: [{ key: ref.key, version: ref.version, hash: ref.hash }],
      lines: [
        { lineKey: 'l1', sku: 'SUA330', name: 'Sữa 330', unit: 'Hộp', qty: 4, amountBeforeTax: 1_222_222, taxCode: 'R08', taxAmount: 97_778 },
        { lineKey: 'g1', sku: 'QUA01', name: 'Quà', unit: 'Hộp', qty: 2, amountBeforeTax: 0, taxCode: 'R08', taxAmount: 0, isGift: true, policyRef: { key: 'CT-TRA', version: ref.version, line: 'gift' } },
      ],
      payments: [{ methodCode: 'TM', amount: 1_320_000 }], totals: { beforeTax: 1_222_222, tax: 97_778, total: 1_320_000 },
    });
    expect((await call(ctx, 'POST', '/api/v1/documents', sale)).body.data?.status).toBe('posted');
    await deliver();
    expect(await used()).toBe(2);

    const ret = await call(ctx, 'POST', '/api/v1/documents', returnDoc('pos:CN01:TRA-R1'));
    expect(ret.body.data?.status, JSON.stringify(ret.body)).toBe('posted');
    await deliver();
    expect(await used()).toBe(1);

    const cancel = await call(ctx, 'POST', '/api/v1/documents/cancel', { docKey: 'pos:CN01:TRA-R1', reason: 'Thu ngân lập nhầm phiếu trả (thử NT-BH-012)' });
    expect(cancel.status, JSON.stringify(cancel.body)).toBe(200);
    await deliver();
    expect(await used()).toBe(2);
  });
});
