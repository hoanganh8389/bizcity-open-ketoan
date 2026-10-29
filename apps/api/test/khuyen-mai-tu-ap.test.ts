/**
 * KHUYẾN MẠI TỰ ÁP — mọi loại chính sách tự áp trên đơn đặt / phiếu nhập, kể cả các trường hợp lệch chuẩn:
 *   - CK trên đơn bằng số tiền cố định: chỉ tự áp khi tiền hàng lớn hơn số CK (hoặc ≥ "Áp khi tổng đơn từ"); chưa đủ → gợi ý,
 *     không bao giờ làm số phải trả âm; CK % có / không mức tối thiểu; CK ghi tay đè chính sách; ghi "không CK";
 *   - mỗi khoản CK chỉ một dòng trên bảng khuyến mại (không lặp "tự áp chính sách" + "CK bằng tiền");
 *   - bỏ tích từng chương trình trên phiếu (skipPolicies): CK đơn, bậc SL, CK theo mã, CKTT, quà mua X tặng Y đều gỡ, tích lại
 *     thì áp lại; chỉ ảnh hưởng phiếu đó; chốt lúc duyệt theo đúng lựa chọn;
 *   - qua API: lưu / đọc lại lựa chọn, phân tích máy chủ khớp, duyệt được.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { computeDoc, promoBoard, syncGifts, type PDoc, type PLine, type Policy } from '@ketoan/contracts/mua-hang';
import { freezeOf } from '../src/phan-he/mua-hang/store.js';
import { call, setupTenant, type TestCtx } from './helpers.js';

const pol = (code: string, kind: Policy['kind'], rule: Record<string, unknown>, scope: Policy['scope'] = { partnerCode: 'N1' }): Policy => ({ id: code, code, kind, name: `Chính sách ${code}`, scope, isActive: true, rule });
const line = (k: string, qty: number, price: number, o: Partial<PLine> = {}): PLine => ({ lineKey: k, sku: 'A', name: 'Sữa A', unit: 'Lon', qty, price, taxCode: 'V08', lineType: 'buy', brandCode: 'TH', ...o });
const doc = (lines: PLine[], o: Partial<PDoc> = {}): PDoc => ({ id: 'd', kind: 'order', status: 'draft', docNo: '', docDate: '2026-10-27', branchCode: 'B', partnerCode: 'N1', priceIncludesVat: true, lines, ...o });
const tradeRows = (d: PDoc, ps: Policy[]) => promoBoard(d, ps, computeDoc(d, ps)).filter((r) => r.kind === 'trade_discount');

describe('CK trên đơn bằng số tiền cố định', () => {
  const ps = [pol('CK2TR', 'trade_discount', { amount: 2_000_000 })];

  it('đơn nhỏ hơn số CK (1 lon 528.000, CK 2 triệu): KHÔNG tự áp, số phải trả giữ nguyên, bảng KM chỉ gợi ý mua thêm', () => {
    const d = doc([line('a', 1, 528_000)]);
    const c = computeDoc(d, ps);
    expect(c.orderDiscount).toBe(0);
    expect(c.payable).toBe(528_000);
    const rows = tradeRows(d, ps);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ status: 'hint', policy: 'CK2TR' });
    expect(rows[0]!.text).toMatch(/mua thêm/);
  });

  it('tiền hàng đúng bằng số CK: vẫn không áp (số phải trả không được về 0 / âm)', () => {
    expect(computeDoc(doc([line('a', 1, 2_000_000)]), ps).orderDiscount).toBe(0);
  });

  it('đơn lớn hơn số CK: tự áp đúng 2.000.000, chia vào các dòng; bảng KM đúng MỘT dòng (mã chính sách + số tiền)', () => {
    const d = doc([line('a', 80, 528_000), line('b', 20, 431_000, { sku: 'B' })]);
    const c = computeDoc(d, ps);
    expect(c.orderDiscount).toBe(2_000_000);
    expect(c.payable).toBe(50_860_000 - 2_000_000);
    expect(c.lines.reduce((s, l) => s + l.orderDiscount, 0)).toBe(2_000_000);
    expect(c.trace.filter((t) => t.kind === 'trade_discount')).toHaveLength(1);
    const rows = tradeRows(d, ps);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ status: 'applied', policy: 'CK2TR' });
    expect(rows[0]!.text).toMatch(/2\.000\.000/);
  });

  it('"Áp khi tổng đơn từ" 10 triệu: 5 triệu → không áp (gợi ý thiếu 5 triệu); đủ 10 triệu → áp', () => {
    const ps2 = [pol('CK2TR10', 'trade_discount', { amount: 2_000_000, minOrder: 10_000_000 })];
    const small = doc([line('a', 10, 500_000)]);
    expect(computeDoc(small, ps2).orderDiscount).toBe(0);
    expect(tradeRows(small, ps2)[0]!.text).toMatch(/mua thêm 5\.000\.000/);
    expect(computeDoc(doc([line('a', 20, 500_000)]), ps2).orderDiscount).toBe(2_000_000);
  });
});

describe('CK trên đơn theo %', () => {
  it('không khai mức tối thiểu: mọi đơn đều áp (TH1: 42.024.000 × 7% = 2.941.680 → 39.082.320)', () => {
    const ps = [pol('CK7', 'trade_discount', { pct: 7 })];
    const c = computeDoc(doc([line('a', 60, 528_000), line('b', 24, 431_000, { sku: 'B' })]), ps);
    expect(c).toMatchObject({ orderDiscount: 2_941_680, payable: 39_082_320 });
    expect(computeDoc(doc([line('a', 1, 528_000)]), ps).orderDiscount).toBe(36_960);
  });

  it('có mức tối thiểu 30 triệu: đơn 5,28 triệu không áp; đơn 42 triệu áp', () => {
    const ps = [pol('CK7M', 'trade_discount', { pct: 7, minOrder: 30_000_000 })];
    expect(computeDoc(doc([line('a', 10, 528_000)]), ps).orderDiscount).toBe(0);
    expect(computeDoc(doc([line('a', 60, 528_000), line('b', 24, 431_000, { sku: 'B' })]), ps).orderDiscount).toBe(2_941_680);
  });
});

describe('CK ghi trên phiếu đè chính sách', () => {
  const ps = [pol('CK2TR', 'trade_discount', { amount: 2_000_000 })];
  const big = [line('a', 80, 528_000)];

  it('ghi tay 500.000: dùng số ghi tay, chính sách không áp; bảng KM một dòng "ghi trên phiếu"', () => {
    const d = doc(big, { orderDiscount: { amount: 500_000 } });
    expect(computeDoc(d, ps).orderDiscount).toBe(500_000);
    const rows = tradeRows(d, ps);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ status: 'applied', policy: 'Trên phiếu' });
  });

  it('ghi "không chiết khấu" ({}): không CK, không gợi ý', () => {
    const d = doc(big, { orderDiscount: {} });
    expect(computeDoc(d, ps).orderDiscount).toBe(0);
    expect(tradeRows(d, ps)).toEqual([]);
  });
});

describe('Bỏ tích chương trình trên phiếu (skipPolicies) — tự động nhưng linh hoạt', () => {
  const ps = [
    pol('CK2TR', 'trade_discount', { amount: 2_000_000 }),
    pol('BAC', 'qty_tier', { tiers: [{ from: 0, pct: 0 }, { from: 50, pct: 3 }] }, { partnerCode: 'N1', sku: 'A' }),
    pol('CKMA', 'item_discount', { items: [{ sku: 'B', pct: 4 }] }),
    pol('CKTT', 'payment_discount', { pct: 2 }),
    pol('KM10T1', 'promo_gift', { buy: 10, get: 1, splitIntoCost: false }, { partnerCode: 'N1', brandCode: 'TH' }),
  ];
  const lines = [line('a', 80, 528_000), line('b', 20, 431_000, { sku: 'B' })];

  it('mặc định: CK đơn 2 triệu, bậc 3% mã A, CK theo mã 4% mã B, CKTT 2%, quà mua 10 tặng 1 đều tự áp', () => {
    const d = doc(lines);
    const c = computeDoc(d, ps);
    expect(c.orderDiscount).toBe(2_000_000);
    expect(c.lines.find((l) => l.sku === 'A')!.lineDiscount).toBe(Math.round(80 * 528_000 * 0.03));
    expect(c.lines.find((l) => l.sku === 'B')!.lineDiscount).toBe(Math.round(20 * 431_000 * 0.04));
    expect(c.ckttExpected).toBeGreaterThan(0);
    const g = syncGifts(d, ps).lines.filter((l) => l.autoGift);
    expect(g.map((l) => [l.sku, l.qty])).toEqual(expect.arrayContaining([['A', 8], ['B', 2]]));
  });

  it('bỏ tích CK trên đơn: không CK đơn; bảng KM hiện dòng "đã bỏ trên phiếu" (để tích lại), không gợi ý', () => {
    const d = doc(lines, { skipPolicies: ['CK2TR'] });
    expect(computeDoc(d, ps).orderDiscount).toBe(0);
    const rows = tradeRows(d, ps);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ status: 'off', policy: 'CK2TR' });
  });

  it('bỏ tích bậc số lượng / CK theo mã / CKTT: từng khoản về 0, các khoản khác giữ nguyên', () => {
    const c1 = computeDoc(doc(lines, { skipPolicies: ['BAC'] }), ps);
    expect(c1.lines.find((l) => l.sku === 'A')!.lineDiscount).toBe(0);
    expect(c1.lines.find((l) => l.sku === 'B')!.lineDiscount).toBeGreaterThan(0);
    expect(c1.orderDiscount).toBe(2_000_000);
    expect(computeDoc(doc(lines, { skipPolicies: ['CKMA'] }), ps).lines.find((l) => l.sku === 'B')!.lineDiscount).toBe(0);
    expect(computeDoc(doc(lines, { skipPolicies: ['CKTT'] }), ps).ckttExpected ?? 0).toBe(0);
  });

  it('bỏ tích quà (NCC hết quà): dòng quà tự thêm tự gỡ; tích lại → quà tự thêm lại', () => {
    const withGift = syncGifts(doc(lines), ps).lines;
    const off = syncGifts(doc(withGift, { skipPolicies: ['KM10T1'] }), ps);
    expect(off.lines.filter((l) => l.autoGift)).toEqual([]);
    expect(off.changes.join(' ')).toMatch(/bỏ quà/);
    const back = syncGifts(doc(off.lines), ps);
    expect(back.lines.filter((l) => l.autoGift)).toHaveLength(2);
  });

  it('bỏ tích chỉ ảnh hưởng phiếu đó: phiếu khác cùng NCC vẫn tự áp', () => {
    computeDoc(doc(lines, { skipPolicies: ['CK2TR', 'BAC'] }), ps);
    const other = computeDoc(doc(lines), ps);
    expect(other.orderDiscount).toBe(2_000_000);
    expect(other.lines.find((l) => l.sku === 'A')!.lineDiscount).toBeGreaterThan(0);
  });

  it('chốt lúc duyệt theo đúng lựa chọn: bỏ CK đơn → chốt "không CK"; để áp → chốt 2 triệu; đơn chưa đủ điều kiện → chốt "không CK"', () => {
    const fz = (d: PDoc) => freezeOf({ ...d, kind: 'receipt' }, computeDoc({ ...d, kind: 'receipt' }, ps), ps);
    expect(fz(doc(lines, { skipPolicies: ['CK2TR'] })).orderDiscount).toEqual({});
    expect(fz(doc(lines)).orderDiscount).toMatchObject({ amount: 2_000_000 });
    expect(fz(doc([line('a', 1, 528_000)])).orderDiscount).toEqual({});
  });
});

describe('Qua API: chính sách thật, lưu lựa chọn bỏ tích, máy chủ tính khớp, duyệt được', () => {
  let t: TestCtx;
  beforeAll(async () => {
    t = await setupTenant();
    expect((await call(t, 'PUT', '/api/v1/partners/NCC-KM', { name: 'NCC khuyến mại', kind: 'supplier' })).status).toBeLessThan(300);
    expect((await call(t, 'PUT', '/api/v1/catalog/products/A1?new=true', { name: 'Sữa A1', unit: 'Lon', taxInCode: 'V08', units: [{ unit: 'Lon', ratio: 1, isDefault: true }] })).status).toBeLessThan(300);
    for (const p of [
      { code: 'KM-CK2TR', kind: 'trade_discount', name: 'CK 2 triệu trên đơn', scope: { partnerCode: 'NCC-KM' }, rule: { amount: 2_000_000 } },
      { code: 'KM-BAC', kind: 'qty_tier', name: 'Bậc SL', scope: { partnerCode: 'NCC-KM', sku: 'A1' }, rule: { tiers: [{ from: 0, pct: 0 }, { from: 50, pct: 3 }] } },
    ]) expect((await call(t, 'POST', '/api/v1/purchase/policies', p)).status).toBe(201);
  }, 60_000);
  afterAll(async () => { await t.app.close(); });
  const body = (qty: number, extra: Record<string, unknown> = {}) => ({ kind: 'order', docDate: '2026-10-27', branchCode: 'CN', partnerCode: 'NCC-KM', priceIncludesVat: true, lines: [{ lineKey: 'a', sku: 'A1', name: 'Sữa A1', unit: 'Lon', qty, price: 528_000, taxCode: 'V08', lineType: 'buy' }], ...extra });
  const analysis = async (id: string) => (await call(t, 'GET', `/api/v1/purchase/documents/${id}`)).body.data.analysis as { calc: { orderDiscount: number; lineDiscount: number; payable: number }; checks: { code: string }[] };

  it('đơn 1 lon: không bị chặn "chiết khấu lớn hơn tiền hàng", không tự áp CK 2 triệu', async () => {
    const d = (await call(t, 'POST', '/api/v1/purchase/documents', body(1))).body.data as { id: string };
    const a = await analysis(d.id);
    expect(a.calc.orderDiscount).toBe(0);
    expect(a.checks.map((c) => c.code)).not.toContain('discount_over');
    expect((await call(t, 'POST', `/api/v1/purchase/documents/${d.id}/approve`)).status).toBe(200);
  });

  it('đơn 80 lon: tự áp CK 2 triệu + bậc 3%; bỏ tích cả hai → lưu lại được, máy chủ tính không CK, duyệt chốt đúng', async () => {
    const d = (await call(t, 'POST', '/api/v1/purchase/documents', body(80))).body.data as { id: string };
    let a = await analysis(d.id);
    expect(a.calc.orderDiscount).toBe(2_000_000);
    expect(a.calc.lineDiscount).toBe(Math.round(80 * 528_000 * 0.03));
    const put = await call(t, 'PUT', `/api/v1/purchase/documents/${d.id}`, body(80, { skipPolicies: ['KM-CK2TR', 'KM-BAC'] }));
    expect(put.status, JSON.stringify(put.body)).toBe(200);
    expect(put.body.data.skipPolicies).toEqual(['KM-CK2TR', 'KM-BAC']);
    a = await analysis(d.id);
    expect(a.calc).toMatchObject({ orderDiscount: 0, lineDiscount: 0, payable: 80 * 528_000 });
    const ok = await call(t, 'POST', `/api/v1/purchase/documents/${d.id}/approve`);
    expect(ok.status, JSON.stringify(ok.body)).toBe(200);
    expect(ok.body.data.totals.total).toBe(80 * 528_000);
    // Tích lại trên phiếu khác: tự áp lại bình thường.
    const d2 = (await call(t, 'POST', '/api/v1/purchase/documents', body(80, { skipPolicies: [] }))).body.data as { id: string };
    expect((await analysis(d2.id)).calc.orderDiscount).toBe(2_000_000);
  });
});
