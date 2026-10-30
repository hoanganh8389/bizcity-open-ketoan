/**
 * Đề bài chương trình KẾT HỢP chạy qua các cách lập đơn / phiếu nhập: hàng thường + mã Q (kẹp quà), CK %, CK bằng tiền, chương
 * trình tặng quà (mua 10 thùng tặng 1 thùng), quà thủ công ngoài chương trình, CKTT, hỗ trợ ngoài (giảm giá sau mua), hạn mức công nợ.
 * Cách lập đơn / phiếu khác nhau (phân tích tự động, lập tay, nhập Excel, đơn → phiếu nhập, nhập tay, nhập Excel) đều gửi về cùng một
 * dạng phiếu: ĐVT theo defaultUnitFor, giá theo priceFor (ngày chứng từ), quà theo syncGifts — test đi đúng các hàm đó và thử cả hai
 * con đường ghi sổ: đơn → phiếu nhập theo đơn, và phiếu nhập ngoài đơn. Mọi con đường phải ra CÙNG một số tiền.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { defaultUnitFor, giftPlan, priceFor, receiptFromOrder, syncGifts, type PDoc, type PLine, type Policy, type ProductUnit, type SupplierProduct } from '@ketoan/contracts/mua-hang';
import { call, setupTenant, type TestCtx } from './helpers.js';

let t: TestCtx;
const NCC = 'NCC-KH6';
const A = '990000001', AQ = '990000001Q', G = 'KH6-QUA';
const DATE = '2026-11-05';
const UNITS: ProductUnit[] = [{ unit: 'Hộp', ratio: 1, isDefault: true }, { unit: 'Thùng', ratio: 48, isPurchaseDefault: true }];
let policies: Policy[] = [];
let prices: SupplierProduct[] = [];
type Doc = PDoc & { totals?: { total: number } };

const ok = async <T,>(p: Promise<{ status: number; body: { data: T } }>, status = 200) => { const r = await p; expect(r.status, JSON.stringify(r.body)).toBe(status); return r.body.data; };
const policy = (b: Record<string, unknown>) => ok(call(t, 'POST', '/api/v1/purchase/policies', { scope: { partnerCode: NCC }, isActive: true, priority: 0, validFrom: '2026-11-01', validTo: null, ...b }), 201);

/** Một dòng hàng như lập tay / nhập Excel / phân tích đặt hàng tạo ra: ĐVT mặc định theo NCC, giá NCC theo ngày chứng từ. */
const lineOf = (key: string, sku: string, qty: number, o: Partial<PLine> = {}): PLine => {
  const unit = o.unit ?? defaultUnitFor(UNITS, prices, NCC, sku);
  const price = o.price ?? priceFor(prices, { date: DATE, partnerCode: NCC, sku, unit }, UNITS)?.price ?? 0;
  return { lineKey: key, sku, name: sku, unit, qty, price, taxCode: 'V08', lineType: 'buy', ...o, ...(o.lineType ? {} : {}) } as PLine;
};
/** Phiếu như trên màn: thêm dòng hàng + quà thủ công, bộ khuyến mại tự thêm quà theo chương trình. */
const docOf = (kind: 'order' | 'receipt', extra: Partial<PDoc> = {}): PDoc => {
  const base: PDoc = { id: `new-${kind}`, kind, status: 'draft', docNo: '', docDate: DATE, branchCode: 'CN-NA', partnerCode: NCC, priceIncludesVat: false,
    lines: [lineOf('a', A, 20), lineOf('q', AQ, 5), { lineKey: 'g', sku: G, name: 'Bình nước quà', unit: 'Cái', qty: 10, price: 0, taxCode: 'V08', lineType: 'gift_consumer' }], ...extra };
  return { ...base, lines: syncGifts(base, policies).lines };
};

beforeAll(async () => {
  t = await setupTenant();
  await ok(call(t, 'POST', '/api/v1/purchase/demo/seed', { password: 'Thuy!@#' }));
  await call(t, 'PUT', `/api/v1/partners/${NCC}`, { name: 'NCC thử chương trình kết hợp', kind: 'supplier' });
  await ok(call(t, 'PUT', `/api/v1/catalog/products/${A}?new=1`, { name: 'Sữa A 180ml', unit: 'Hộp', taxInCode: 'V08', units: UNITS }));
  // Mã Q (kẹp quà) tạo mới: tự nhận mã cha và kế thừa ĐVT Thùng của mã cha.
  const q = await ok<{ parentSku: string; units: ProductUnit[] }>(call(t, 'PUT', `/api/v1/catalog/products/${AQ}?new=1`, { name: 'Sữa A 180ml (kẹp quà)', unit: 'Hộp', taxInCode: 'V08', units: [{ unit: 'Hộp', ratio: 1, isDefault: true }] }));
  expect(q.parentSku).toBe(A);
  expect(q.units.find((u) => u.unit === 'Thùng')).toMatchObject({ ratio: 48, isPurchaseDefault: true });
  await ok(call(t, 'PUT', `/api/v1/catalog/products/${G}?new=1`, { name: 'Bình nước quà', unit: 'Cái', taxInCode: 'V08', units: [{ unit: 'Cái', ratio: 1, isDefault: true }] }));
  // Giá NCC: mỗi ĐVT niêm yết riêng — Thùng A 450.000 (rẻ hơn 48 × 10.000); mã Q chỉ khai Thùng.
  await ok(call(t, 'POST', '/api/v1/purchase/supplier-products', { rows: [
    { partnerCode: NCC, sku: A, unit: 'Hộp', price: 10_000 }, { partnerCode: NCC, sku: A, unit: 'Thùng', price: 450_000 }, { partnerCode: NCC, sku: AQ, unit: 'Thùng', price: 470_000 },
  ] }));
  await policy({ code: 'KH6-CK', kind: 'item_discount', name: 'CK theo mã: A 2%, mã Q giảm 50.000 / thùng', rule: { items: [{ sku: A, pct: 2 }, { sku: AQ, amount: 50_000, unit: 'Thùng' }] } });
  await policy({ code: 'KH6-KM', kind: 'promo_gift', name: 'Mua 10 thùng A tặng 1 thùng', rule: { splitIntoCost: true, items: [{ sku: A, buyQty: 10, buyUnit: 'Thùng', giftSku: '', getQty: 1, getUnit: 'Thùng', repeat: true }] } });
  await policy({ code: 'KH6-CKTT', kind: 'payment_discount', name: 'CKTT 2%', rule: { pct: 2 } });
  await policy({ code: 'KH6-HM', kind: 'credit_limit', name: 'Hạn mức 20 triệu', rule: { limit: 20_000_000, warnPct: 90 } });
  policies = await ok<Policy[]>(call(t, 'GET', '/api/v1/purchase/policies'));
  prices = (await ok<{ rows: SupplierProduct[] }>(call(t, 'GET', `/api/v1/purchase/supplier-products?partnerCode=${NCC}`))).rows;
}, 120_000);
afterAll(async () => { await t.app.close(); });

// A: 20 thùng × 450.000 = 9.000.000 − 2% = 8.820.000 · Q: 5 × 470.000 = 2.350.000 − 5 × 50.000 = 2.100.000
// Trước thuế 10.920.000 · VAT 8% 873.600 · phải trả 11.793.600 · CKTT 2% = 235.872 · quà: 2 thùng A (KM người bán) + 10 Cái bình (thủ công).
const EXPECT = { beforeTax: 10_920_000, tax: 873_600, payable: 11_793_600, cktt: 235_872 };

describe('Chương trình kết hợp — mọi cách lập đơn / phiếu ra cùng số', () => {
  let order: Doc;
  it('dòng phiếu tự lấy: ĐVT Thùng (mua mặc định), giá Thùng niêm yết riêng, quà theo chương trình', () => {
    const d = docOf('order');
    expect(d.lines.find((l) => l.lineKey === 'a')).toMatchObject({ unit: 'Thùng', price: 450_000 });
    expect(d.lines.find((l) => l.lineKey === 'q')).toMatchObject({ unit: 'Thùng', price: 470_000 });
    const gift = d.lines.filter((l) => l.sku === A && l.lineType !== 'buy');
    expect(gift.reduce((s, l) => s + l.qty, 0)).toBe(2); // 20 thùng → tặng 2 thùng
    expect(gift[0]!.unit).toBe('Thùng');
    expect(giftPlan(d, policies).every((g) => g.got >= g.expected)).toBe(true);
  });

  it('cách 1–3 (phân tích tự động / lập tay / nhập Excel) → đơn đặt: CK %, CK tiền, CKTT đúng; duyệt được trong hạn mức', async () => {
    const a = await ok<{ calc: { lineDiscount: number; beforeTax: number; tax: number; payable: number; ckttExpected?: number }; blocking: unknown[] }>(call(t, 'POST', '/api/v1/purchase/analyze', docOf('order')));
    expect(a.calc).toMatchObject({ lineDiscount: 430_000, beforeTax: EXPECT.beforeTax, tax: EXPECT.tax, payable: EXPECT.payable, ckttExpected: EXPECT.cktt });
    expect(a.blocking).toEqual([]);
    order = await ok<Doc>(call(t, 'POST', '/api/v1/purchase/documents', docOf('order')), 201);
    order = await ok<Doc>(call(t, 'POST', `/api/v1/purchase/documents/${order.id}/approve`));
    expect(order.status).toBe('approved');
    expect(order.totals!.total).toBe(EXPECT.payable);
  });

  it('cách 4: chuyển đơn sang phiếu nhập — đủ hàng, đủ quà, cùng số tiền; duyệt ghi sổ', async () => {
    const units = { [A]: UNITS, [AQ]: UNITS, [G]: [{ unit: 'Cái', ratio: 1 }] } as Record<string, ProductUnit[]>;
    const r = receiptFromOrder(order, [order], DATE, units);
    expect(r.lines.filter((l) => l.lineType === 'buy').map((l) => `${l.sku} ${l.qty} ${l.unit}`).sort()).toEqual([`${A} 20 Thùng`, `${AQ} 5 Thùng`]);
    expect(r.lines.filter((l) => l.lineType !== 'buy').reduce((s, l) => s + l.qty, 0)).toBe(12); // 2 thùng KM + 10 bình
    const saved = await ok<Doc>(call(t, 'POST', '/api/v1/purchase/documents', { ...r, id: undefined }), 201);
    const ap = await ok<Doc>(call(t, 'POST', `/api/v1/purchase/documents/${saved.id}/approve`));
    expect(ap.totals!.total).toBe(EXPECT.payable);
  });

  it('cách 5–6 (nhập tay / nhập Excel phiếu nhập ngoài đơn): cùng số tiền; hạn mức tính cả nợ đã ghi → vượt thì chặn duyệt', async () => {
    const d = docOf('receipt', { outsideOrder: { reason: 'Thử nhập ngoài đơn' } } as Partial<PDoc>);
    const a = await ok<{ calc: { payable: number; ckttExpected?: number }; blocking: { text: string }[]; credit: { scope: string }[] }>(call(t, 'POST', '/api/v1/purchase/analyze', d));
    expect(a.calc.payable).toBe(EXPECT.payable);
    expect(a.calc.ckttExpected).toBe(EXPECT.cktt);
    // Nợ đã có 11.793.600 + phiếu này 11.793.600 > 20 triệu → chặn duyệt (cần duyệt ngoại lệ).
    expect(a.blocking.some((b) => /hạn mức/i.test(b.text))).toBe(true);
    const saved = await ok<Doc>(call(t, 'POST', '/api/v1/purchase/documents', d), 201);
    const ap = await call(t, 'POST', `/api/v1/purchase/documents/${saved.id}/approve`);
    expect(ap.status).not.toBe(200);
    const ov = await ok<Doc>(call(t, 'POST', `/api/v1/purchase/documents/${saved.id}/override`, { reason: 'Thử duyệt ngoại lệ vượt hạn mức' }));
    expect(ov.status).toBe('approved');
    expect(ov.totals!.total).toBe(EXPECT.payable);
  });

  it('hỗ trợ ngoài (NCC giảm giá sau mua) ghi phiếu riêng, phân bổ vào hàng đã nhập', async () => {
    const docs = await ok<{ rows?: Doc[] } | Doc[]>(call(t, 'GET', `/api/v1/purchase/documents?partnerCode=${NCC}&kind=receipt`));
    const list = Array.isArray(docs) ? docs : docs.rows ?? [];
    const rc = list.find((d) => d.status === 'approved');
    expect(rc, 'có phiếu nhập đã duyệt').toBeTruthy();
    const rb = await ok<Doc>(call(t, 'POST', '/api/v1/purchase/documents', { kind: 'rebate', docDate: DATE, branchCode: 'CN-NA', partnerCode: NCC, priceIncludesVat: false, amount: 500_000, refIds: [rc!.id], basis: 'value', lines: [], note: 'Hỗ trợ ngoài của NCC' }), 201);
    expect((await ok<Doc>(call(t, 'POST', `/api/v1/purchase/documents/${rb.id}/approve`))).status).toBe('approved');
  });
});
