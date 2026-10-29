/**
 * CÁCH ÁP CỦA CHƯƠNG TRÌNH (rule.apply): áp đồng thời (mặc định) / áp riêng — mã hàng nhận chương trình áp riêng thì không nhận
 * chương trình chiết khấu / khuyến mại nào khác; mã khác không ảnh hưởng. Thử cả các trường hợp lệch chuẩn: hai chương trình áp
 * riêng cùng khớp (ưu tiên, rồi lợi hơn), bỏ tích chương trình áp riêng thì các cái khác áp lại, quà, bảng khuyến mại, qua API.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { computeDoc, giftPlan, promoBoard, syncGifts, type PDoc, type PLine, type Policy } from '@ketoan/contracts/mua-hang';
import { call, setupTenant, type TestCtx } from './helpers.js';

const pol = (code: string, kind: Policy['kind'], rule: Record<string, unknown>, scope: Policy['scope'] = {}, priority = 0): Policy => ({ id: code, code, kind, name: `CT ${code}`, scope: { partnerCode: 'N1', ...scope }, isActive: true, rule, priority });
const line = (k: string, sku: string, qty: number, price: number, o: Partial<PLine> = {}): PLine => ({ lineKey: k, sku, name: sku, unit: 'Lon', qty, price, taxCode: 'V08', lineType: 'buy', brandCode: 'TH', ...o });
const doc = (lines: PLine[], o: Partial<PDoc> = {}): PDoc => ({ id: 'd', kind: 'receipt', status: 'draft', docNo: '', docDate: '2026-10-27', branchCode: 'B', partnerCode: 'N1', priceIncludesVat: false, lines, ...o });
const byKey = (d: PDoc, ps: Policy[]) => Object.fromEntries(computeDoc(d, ps).lines.map((l) => [l.lineKey, l]));

describe('Áp riêng / áp đồng thời', () => {
  const A = line('a', 'A', 10, 100_000), B = line('b', 'B', 10, 100_000);
  const ck7A = (apply?: string) => pol('CK7A', 'trade_discount', { pct: 7, ...(apply ? { apply } : {}) }, { sku: 'A' });
  const ck2 = pol('CK2', 'trade_discount', { pct: 2 });

  it('mặc định áp đồng thời (không đổi số cũ): mã A nhận cả CK 7% riêng mã lẫn 2% chung', () => {
    const l = byKey(doc([A, B]), [ck7A(), ck2]);
    expect(l.a!.lineDiscount).toBe(70_000);
    expect(l.a!.orderDiscount).toBe(18_600); // 2% × 930.000
    expect(l.b!.orderDiscount).toBe(20_000);
  });

  it('CK 7% riêng mã A ÁP RIÊNG: mã A chỉ 7%, mã B vẫn 2%; bảng KM ghi rõ 2% không áp cho A', () => {
    const ps = [ck7A('exclusive'), ck2];
    const d = doc([A, B]);
    const l = byKey(d, ps);
    expect(l.a!.lineDiscount).toBe(70_000);
    expect(l.a!.orderDiscount).toBe(0);
    expect(l.b!.orderDiscount).toBe(20_000);
    expect(computeDoc(d, ps).payable).toBe(2_062_800);
    const rows = promoBoard(d, ps, computeDoc(d, ps));
    expect(rows.find((r) => r.status === 'blocked')).toMatchObject({ policy: 'CK2', sku: 'A' });
    expect(rows.some((r) => r.status === 'applied' && r.policy === 'CK7A' && r.text.includes('áp riêng'))).toBe(true);
  });

  it('CK trên đơn 2% ÁP RIÊNG, bậc SL của mã A áp đồng thời: mã A chỉ nhận 2% (bậc bị chặn)', () => {
    const ps = [pol('CK2X', 'trade_discount', { pct: 2, apply: 'exclusive' }), pol('BAC', 'qty_tier', { tiers: [{ from: 5, pct: 5 }] }, { sku: 'A' })];
    const l = byKey(doc([A, B]), ps);
    expect(l.a!.lineDiscount).toBe(0);
    expect(l.a!.orderDiscount).toBe(20_000);
  });

  it('hai chương trình áp riêng cùng khớp một mã: ưu tiên cao hơn thắng; ưu tiên bằng nhau thì lấy cái lợi hơn', () => {
    const tier5 = (p = 0) => pol('BAC5', 'qty_tier', { tiers: [{ from: 1, pct: 5 }], apply: 'exclusive' }, { sku: 'A' }, p);
    const item3 = (p = 0) => pol('MA3', 'item_discount', { items: [{ sku: 'A', pct: 3 }], apply: 'exclusive' }, {}, p);
    expect(byKey(doc([A]), [tier5(), item3()]).a!.lineDiscount).toBe(50_000); // lợi hơn: 5%
    expect(byKey(doc([A]), [tier5(), item3(1)]).a!.lineDiscount).toBe(30_000); // ưu tiên 1 thắng dù ít hơn
  });

  it('bỏ tích chương trình áp riêng trên phiếu: các chương trình khác áp lại', () => {
    const ps = [ck7A('exclusive'), ck2];
    const l = byKey(doc([A, B], { skipPolicies: ['CK7A'] }), ps);
    expect(l.a!.lineDiscount).toBe(0);
    expect(l.a!.orderDiscount).toBe(20_000);
  });

  it('quà mua 10 tặng 1 ÁP RIÊNG: mã A được quà, không nhận bậc SL; mã B (không có quà) vẫn nhận bậc', () => {
    const ps = [pol('QUA', 'promo_gift', { buy: 10, get: 1, splitIntoCost: true, apply: 'exclusive' }, { sku: 'A' }), pol('BAC', 'qty_tier', { tiers: [{ from: 5, pct: 5 }] })];
    const d = doc([A, B]);
    const l = byKey(d, ps);
    expect(l.a!.lineDiscount).toBe(0);
    expect(l.b!.lineDiscount).toBe(50_000);
    expect(giftPlan(d, ps).map((g) => [g.sku, g.expected])).toEqual([['A', 1]]);
    // Chưa đủ 10 lon thì quà không khớp → không chặn gì, A nhận bậc bình thường.
    expect(byKey(doc([{ ...A, qty: 6 }]), ps).a!.lineDiscount).toBe(30_000);
  });

  it('quà áp đồng thời bị chặn khi mã đang áp riêng CK: không tự thêm dòng quà', () => {
    const ps = [ck7A('exclusive'), pol('QUA', 'promo_gift', { buy: 5, get: 1, splitIntoCost: true }, { sku: 'A' })];
    expect(giftPlan(doc([A]), ps)).toEqual([]);
  });
});

describe('Cộng dồn', () => {
  const qua = (repeat?: boolean, o: Record<string, unknown> = {}) => pol('QUA21', 'promo_gift', { buy: 2, get: 1, splitIntoCost: true, ...(repeat === undefined ? {} : { repeat }), ...o }, { sku: 'A' });
  const exp = (qty: number, ps: Policy[]) => giftPlan(doc([line('a', 'A', qty, 100_000)]), ps)[0]?.expected ?? 0;

  it('mua 2 tặng 1 — mặc định cộng dồn: mua 1 → 0, 2 → 1, 4 → 2, 5 → 2', () => {
    expect([1, 2, 4, 5].map((q) => exp(q, [qua()]))).toEqual([0, 1, 2, 2]);
  });
  it('mua 2 tặng 1 — bỏ cộng dồn: mua 4 hay 100 vẫn chỉ tặng 1; bảng KM ghi "chỉ tặng một lần", không gợi ý tặng thêm', () => {
    expect([1, 2, 4, 100].map((q) => exp(q, [qua(false)]))).toEqual([0, 1, 1, 1]);
    const d = doc([line('a', 'A', 5, 100_000), line('g', 'A', 1, 0, { lineType: 'gift_seller', program: 'QUA21', autoGift: true })]);
    const rows = promoBoard(d, [qua(false)], computeDoc(d, [qua(false)]));
    expect(rows.find((r) => r.status === 'applied' && r.kind === 'promo_gift')?.text).toContain('chỉ tặng một lần');
    expect(rows.some((r) => r.status === 'hint' && r.kind === 'promo_gift')).toBe(false);
  });
  it('cộng dồn: mua 3 → gợi ý mua thêm 1 để được tặng thêm', () => {
    const d = doc([line('a', 'A', 3, 100_000), line('g', 'A', 1, 0, { lineType: 'gift_seller', program: 'QUA21', autoGift: true })]);
    expect(promoBoard(d, [qua()], computeDoc(d, [qua()])).find((r) => r.status === 'hint')?.text).toContain('mua thêm 1');
  });

  const ck2tr = (repeat?: boolean) => pol('CK2TR', 'trade_discount', { amount: 2_000_000, minOrder: 50_000_000, ...(repeat === undefined ? {} : { repeat }) });
  const big = (v: number) => [line('a', 'A', 1, v)];
  it('CK 2 triệu khi đơn từ 50 triệu — mặc định một lần: đơn 49tr → 0, 50tr → 2tr, 120tr → 2tr', () => {
    expect([49e6, 50e6, 120e6].map((v) => computeDoc(doc(big(v)), [ck2tr()]).orderDiscount)).toEqual([0, 2e6, 2e6]);
  });
  it('bật cộng dồn: 50tr → 2tr, 99,99tr → 2tr, 100tr → 4tr, 160tr → 6tr; gợi ý mua thêm để được thêm một lần', () => {
    expect([50e6, 99_990_000, 100e6, 160e6].map((v) => computeDoc(doc(big(v)), [ck2tr(true)]).orderDiscount)).toEqual([2e6, 2e6, 4e6, 6e6]);
    const d = doc(big(120e6));
    expect(promoBoard(d, [ck2tr(true)], computeDoc(d, [ck2tr(true)])).find((r) => r.status === 'hint')?.text).toContain('mua thêm 30.000.000');
  });
  it('CK % không có cộng dồn (repeat bị bỏ qua); CK số tiền không khai mức tổng đơn cũng không cộng dồn', () => {
    expect(computeDoc(doc(big(100e6)), [pol('P', 'trade_discount', { pct: 2, repeat: true })]).orderDiscount).toBe(2e6);
    expect(computeDoc(doc(big(100e6)), [pol('P', 'trade_discount', { amount: 2e6, repeat: true })]).orderDiscount).toBe(2e6);
  });
  it('cộng dồn + áp riêng: mã A áp riêng CK 7% → CK tiền cộng dồn chỉ tính trên phần mã B (60tr → 1 lần)', () => {
    const ps = [pol('CK7A', 'trade_discount', { pct: 7, apply: 'exclusive' }, { sku: 'A' }), ck2tr(true)];
    const c = computeDoc(doc([line('a', 'A', 1, 60e6), line('b', 'B', 1, 60e6)]), ps);
    expect(c.lines.map((l) => l.orderDiscount)).toEqual([0, 2e6]);
  });
  it('quà áp riêng cộng dồn thắng bậc SL (lợi hơn); quà một lần thua bậc SL khi mua nhiều', () => {
    const tier = pol('BAC', 'qty_tier', { tiers: [{ from: 10, pct: 10 }], apply: 'exclusive' }, { sku: 'A' });
    const g = (repeat: boolean) => qua(repeat, { apply: 'exclusive' });
    // 20 lon × 100.000: quà cộng dồn = 10 lon (1 triệu) > bậc 10% (200.000) → quà thắng; quà một lần = 1 lon (100.000) < 200.000 → bậc thắng.
    expect(computeDoc(doc([line('a', 'A', 20, 100_000)]), [g(true), tier]).lines[0]!.lineDiscount).toBe(0);
    expect(computeDoc(doc([line('a', 'A', 20, 100_000)]), [g(false), tier]).lines[0]!.lineDiscount).toBe(200_000);
  });
});

describe('Trên phiếu: hàng chính trong bảng quyết định khuyến mại', () => {
  const qua = pol('QUA21', 'promo_gift', { buy: 2, get: 1, splitIntoCost: true }, { sku: 'A' });
  const sync = (d: PDoc, ps: Policy[]) => { const r = syncGifts(d, ps); return { d: { ...d, lines: r.lines }, changes: r.changes }; };
  const gifts = (d: PDoc) => d.lines.filter((l) => l.lineType !== 'buy').map((l) => [l.sku, l.qty]);
  const setQty = (d: PDoc, qty: number) => ({ ...d, lines: d.lines.map((l) => (l.lineKey === 'a' ? { ...l, qty } : l)) });

  it('tự thêm quà theo hàng chính → đổi SL → bỏ tích → đổi SL lúc đã bỏ → tích lại → xoá hàng chính', () => {
    let d = doc([line('a', 'A', 4, 100_000)], { kind: 'order' });
    ({ d } = sync(d, [qua]));
    expect(gifts(d)).toEqual([['A', 2]]);
    // Dòng quà cùng mã KHÔNG tính là hàng mua: chạy lại không đổi (không tặng chồng lên quà).
    expect(sync(d, [qua]).changes).toEqual([]);
    ({ d } = sync(setQty(d, 6), [qua]));
    expect(gifts(d)).toEqual([['A', 3]]);
    // Bỏ tích chương trình: dòng quà tự gỡ, câu báo nói rõ lý do.
    let r = sync({ ...d, skipPolicies: ['QUA21'] }, [qua]);
    d = { ...r.d, skipPolicies: ['QUA21'] };
    expect(gifts(d)).toEqual([]);
    expect(r.changes.join()).toContain('đã bỏ tích');
    // Đang bỏ tích mà tăng SL: vẫn không tặng (giữ lựa chọn của người dùng).
    ({ d } = sync(setQty(d, 10), [qua]));
    expect(gifts(d)).toEqual([]);
    // Tích lại: quà theo đúng SL hàng chính hiện tại (10 → 5).
    ({ d } = sync({ ...d, skipPolicies: [] }, [qua]));
    expect(gifts(d)).toEqual([['A', 5]]);
    // Xoá hàng chính: quà tự gỡ.
    r = sync({ ...d, lines: d.lines.filter((l) => l.lineKey !== 'a') }, [qua]);
    expect(gifts(r.d)).toEqual([]);
    expect(r.changes.join()).toContain('không còn đủ điều kiện');
  });

  it('quà áp đồng thời bị chặn vì mã đang áp riêng CK: không thêm quà; bỏ tích CK áp riêng → quà tự thêm, CK gỡ', () => {
    const ps = [pol('CK7A', 'trade_discount', { pct: 7, apply: 'exclusive' }, { sku: 'A' }), qua];
    let d = doc([line('a', 'A', 4, 100_000)], { kind: 'order' });
    ({ d } = sync(d, ps));
    expect(gifts(d)).toEqual([]);
    expect(computeDoc(d, ps).lines[0]!.lineDiscount).toBe(28_000);
    ({ d } = sync({ ...d, skipPolicies: ['CK7A'] }, ps));
    d = { ...d, skipPolicies: ['CK7A'] };
    expect(gifts(d)).toEqual([['A', 2]]);
    expect(computeDoc(d, ps).lines.find((l) => l.lineKey === 'a')!.lineDiscount).toBe(0);
  });

  it('quà người dùng tự sửa SL (NCC giao thiếu) giữ nguyên, bảng KM báo thiếu để bấm sửa', () => {
    let d = doc([line('a', 'A', 4, 100_000)], { kind: 'order' });
    ({ d } = sync(d, [qua]));
    d = { ...d, lines: d.lines.map((l) => (l.lineType !== 'buy' ? { ...l, qty: 1, autoGift: false } : l)) };
    ({ d } = sync(d, [qua]));
    expect(gifts(d)).toEqual([['A', 1]]);
    expect(promoBoard(d, [qua], computeDoc(d, [qua])).find((r) => r.status === 'fix')?.text).toContain('thiếu 1');
  });
});

describe('Áp riêng qua API', () => {
  let t: TestCtx;
  beforeAll(async () => {
    t = await setupTenant();
    expect((await call(t, 'POST', '/api/v1/purchase/demo/seed', { password: 'Thuy!@#' })).status).toBe(200);
  }, 60_000);
  afterAll(async () => { await t.app.close(); });

  it('lưu chính sách "áp riêng", đọc lại giữ nguyên; phiếu duyệt chốt đúng số (mã riêng 7%, mã khác 2%)', async () => {
    await call(t, 'PUT', '/api/v1/partners/NCC-APRIENG', { name: 'NCC áp riêng', kind: 'supplier' });
    const P = (body: Record<string, unknown>) => call(t, 'POST', '/api/v1/purchase/policies', body);
    expect((await P({ code: 'AR-7A', kind: 'trade_discount', name: 'CK 7% riêng mã', scope: { partnerCode: 'NCC-APRIENG', sku: '110154035' }, rule: { pct: 7, apply: 'exclusive' } })).status).toBeLessThan(300);
    expect((await P({ code: 'AR-2', kind: 'trade_discount', name: 'CK 2% chung', scope: { partnerCode: 'NCC-APRIENG' }, rule: { pct: 2 } })).status).toBeLessThan(300);
    const list = (await call(t, 'GET', '/api/v1/purchase/policies')).body.data as Policy[];
    expect(list.find((p) => p.code === 'AR-7A')?.rule.apply).toBe('exclusive');
    const mk = (sku: string, name: string) => ({ lineKey: sku, sku, name, unit: 'Lon', qty: 10, price: 100000, taxCode: 'V08', lineType: 'buy', lotNo: 'L', expDate: '2028-01-01' });
    const r = await call(t, 'POST', '/api/v1/purchase/documents', { kind: 'receipt', outsideOrder: { reason: 'Phép thử' }, docDate: '2026-10-27', branchCode: 'CN-NA', partnerCode: 'NCC-APRIENG', priceIncludesVat: false,
      lines: [mk('110154035', 'Anlene Gold'), mk('110154036', 'Anlene vani')] });
    expect(r.status, JSON.stringify(r.body)).toBe(201);
    const ok = await call(t, 'POST', `/api/v1/purchase/documents/${r.body.data.id}/approve`);
    expect(ok.status, JSON.stringify(ok.body)).toBe(200);
    expect(ok.body.data.totals.beforeTax).toBe(930_000 + 980_000);
    // Đổi chương trình sang áp đồng thời sau khi duyệt: phiếu đã duyệt giữ số.
    await call(t, 'PUT', `/api/v1/purchase/policies/${list.find((p) => p.code === 'AR-7A')!.id}`, { code: 'AR-7A', kind: 'trade_discount', name: 'CK 7% riêng mã', scope: { partnerCode: 'NCC-APRIENG', sku: '110154035' }, rule: { pct: 7 } });
    const again = (await call(t, 'GET', `/api/v1/purchase/documents/${r.body.data.id}`)).body.data;
    expect(again.doc.totals.beforeTax).toBe(930_000 + 980_000);
    expect(again.analysis.calc.beforeTax).toBe(930_000 + 980_000);
  });

  it('CK số tiền cộng dồn: duyệt chốt đúng tổng đã giảm (100tr → 2 lần = 4tr); tắt cộng dồn sau đó phiếu đã duyệt không đổi', async () => {
    await call(t, 'PUT', '/api/v1/partners/NCC-CONGDON', { name: 'NCC cộng dồn', kind: 'supplier' });
    const body = (repeat: boolean) => ({ code: 'CD-2TR', kind: 'trade_discount', name: 'Giảm 2 triệu mỗi 50 triệu', scope: { partnerCode: 'NCC-CONGDON' }, rule: { amount: 2_000_000, minOrder: 50_000_000, repeat } });
    expect((await call(t, 'POST', '/api/v1/purchase/policies', body(true))).status).toBeLessThan(300);
    const r = await call(t, 'POST', '/api/v1/purchase/documents', { kind: 'receipt', outsideOrder: { reason: 'Phép thử' }, docDate: '2026-10-27', branchCode: 'CN-NA', partnerCode: 'NCC-CONGDON', priceIncludesVat: false,
      lines: [{ lineKey: 'a', sku: '110154035', name: 'Anlene Gold', unit: 'Lon', qty: 200, price: 500000, taxCode: 'V08', lineType: 'buy', lotNo: 'L', expDate: '2028-01-01' }] });
    expect(r.status, JSON.stringify(r.body)).toBe(201);
    const ok = await call(t, 'POST', `/api/v1/purchase/documents/${r.body.data.id}/approve`);
    expect(ok.status, JSON.stringify(ok.body)).toBe(200);
    expect(ok.body.data.totals.beforeTax).toBe(96_000_000);
    const id = ((await call(t, 'GET', '/api/v1/purchase/policies')).body.data as Policy[]).find((p) => p.code === 'CD-2TR')!.id;
    await call(t, 'PUT', `/api/v1/purchase/policies/${id}`, body(false));
    expect((await call(t, 'GET', `/api/v1/purchase/documents/${r.body.data.id}`)).body.data.doc.totals.beforeTax).toBe(96_000_000);
  });
});
