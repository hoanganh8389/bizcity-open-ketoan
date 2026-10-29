/**
 * MUA – TẶNG NHIỀU DÒNG THEO ĐVT (chính sách promo_gift dạng bảng rule.items):
 *   - mỗi dòng "mua <SL> <ĐVT> mã A → tặng <SL> <ĐVT> mã B", so theo ĐVT nhỏ nhất (phiếu ghi Thùng / Lốc / Hộp đều quy đổi đúng);
 *   - cộng dồn / áp riêng theo TỪNG dòng; nhiều dòng cùng mã; quà khác mã, khác ĐVT; tự thêm dòng quà đúng ĐVT;
 *   - chính sách cũ một dòng vẫn tính như trước; qua API: máy chủ kiểm mã + ĐVT, ghi tỉ lệ quy đổi, phiếu duyệt đúng số quà.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { computeDoc, giftPlan, promoBoard, syncGifts, type GiftItem, type PDoc, type PLine, type Policy } from '@ketoan/contracts/mua-hang';
import { call, setupTenant, type TestCtx } from './helpers.js';

// Mã A: Hộp 1, Lốc 4, Thùng 48. Mã Q (quà): Cái 1, Hộp 10.
const RA = { hộp: 1, lốc: 4, thùng: 48 }, RQ = { cái: 1, hộp: 10 };
const row = (o: Partial<GiftItem>): GiftItem => ({ sku: 'A', buyQty: 1, buyUnit: 'Thùng', giftSku: '', getQty: 2, getUnit: 'Hộp', buyRatios: RA, ...o });
const pol = (items: GiftItem[], o: Partial<Policy> = {}, split = true): Policy => ({ id: 'QT', code: 'QT', kind: 'promo_gift', name: 'Mua tặng', scope: { partnerCode: 'N1' }, isActive: true, rule: { splitIntoCost: split, items }, ...o });
const line = (k: string, qty: number, unit: string, o: Partial<PLine> = {}): PLine => ({ lineKey: k, sku: 'A', name: 'Sữa A', unit, qty, price: 10_000 * ((RA as Record<string, number>)[unit.toLowerCase()] ?? 1), taxCode: 'V08', lineType: 'buy', ...o });
const doc = (lines: PLine[], o: Partial<PDoc> = {}): PDoc => ({ id: 'd', kind: 'order', status: 'draft', docNo: '', docDate: '2026-10-28', branchCode: 'B', partnerCode: 'N1', priceIncludesVat: false, lines, ...o });
const plan = (d: PDoc, ps: Policy[]) => giftPlan(d, ps).map((g) => [g.giftSku, g.expected, g.giftUnit]);

describe('Mua – tặng theo ĐVT', () => {
  it('mua 1 Thùng tặng 2 Hộp: phiếu ghi 1 Thùng / 12 Lốc / 48 Hộp đều đủ; 47 Hộp chưa đủ', () => {
    const ps = [pol([row({})])];
    expect(plan(doc([line('a', 1, 'Thùng')]), ps)).toEqual([['A', 2, 'Hộp']]);
    expect(plan(doc([line('a', 12, 'Lốc')]), ps)).toEqual([['A', 2, 'Hộp']]);
    expect(plan(doc([line('a', 48, 'Hộp')]), ps)).toEqual([['A', 2, 'Hộp']]);
    expect(plan(doc([line('a', 47, 'Hộp')]), ps)).toEqual([['A', 0, 'Hộp']]);
  });
  it('nhiều dòng phiếu cùng mã khác ĐVT cộng lại: 1 Thùng + 6 Lốc + 24 Hộp = 96 Hộp = 2 Thùng → tặng 4 Hộp (cộng dồn)', () => {
    expect(plan(doc([line('a', 1, 'Thùng'), line('b', 6, 'Lốc'), line('c', 24, 'Hộp')]), [pol([row({})])])).toEqual([['A', 4, 'Hộp']]);
  });
  it('bỏ cộng dồn ở dòng: 3 Thùng vẫn chỉ tặng 2 Hộp', () => {
    expect(plan(doc([line('a', 3, 'Thùng')]), [pol([row({ repeat: false })])])).toEqual([['A', 2, 'Hộp']]);
  });
  it('quà khác mã, khác ĐVT: mua 2 Lốc A tặng 1 Cái Q', () => {
    const ps = [pol([row({ buyQty: 2, buyUnit: 'Lốc', giftSku: 'Q', getQty: 1, getUnit: 'Cái', giftRatios: RQ })])];
    expect(plan(doc([line('a', 1, 'Thùng')]), ps)).toEqual([['Q', 6, 'Cái']]); // 48 Hộp = 12 Lốc → 6 lần
  });
  it('một mã nhiều dòng (1 Thùng tặng 2 Hộp; 5 Thùng tặng 1 Hộp Q) — áp đồng thời: 5 Thùng nhận cả hai', () => {
    const ps = [pol([row({}), row({ buyQty: 5, giftSku: 'Q', getQty: 1, getUnit: 'Hộp', giftRatios: RQ })])];
    expect(plan(doc([line('a', 5, 'Thùng')]), ps)).toEqual([['A', 10, 'Hộp'], ['Q', 1, 'Hộp']]);
  });
  it('dòng áp riêng: 5 Thùng chỉ nhận dòng áp riêng (lợi hơn), CK theo mã của NCC bị chặn cho mã A', () => {
    const ck = { id: 'CK', code: 'CK', kind: 'item_discount', name: 'CK mã', scope: { partnerCode: 'N1' }, isActive: true, rule: { items: [{ sku: 'A', pct: 3 }] } } as Policy;
    const ps = [pol([row({}), row({ buyQty: 5, getQty: 20, apply: 'exclusive' })]), ck];
    const d = doc([line('a', 5, 'Thùng')]);
    expect(plan(d, ps)).toEqual([['A', 20, 'Hộp']]);
    expect(computeDoc(d, ps).lines[0]!.lineDiscount).toBe(0);
    // Chưa đủ 5 Thùng: dòng áp riêng chưa khớp → dòng thường + CK 3% áp đồng thời.
    const d4 = doc([line('a', 4, 'Thùng')]);
    expect(plan(d4, ps)).toEqual([['A', 8, 'Hộp'], ['A', 0, 'Hộp']]); // dòng 5 Thùng chưa đủ: còn để gợi ý "mua đủ 5 Thùng"
    expect(promoBoard(d4, ps, computeDoc(d4, ps)).some((r) => r.status === 'hint' && r.text.includes('mua đủ 5 Thùng'))).toBe(true);
    expect(computeDoc(d4, ps).lines[0]!.lineDiscount).toBe(Math.round(4 * 480_000 * 0.03));
  });
  it('tự thêm dòng quà đúng ĐVT tặng, dòng quà không tính là hàng mua; đổi SL → quà đổi; bỏ tích → gỡ', () => {
    const ps = [pol([row({})])];
    let d = doc([line('a', 2, 'Thùng')]);
    d = { ...d, lines: syncGifts(d, ps).lines };
    const g = d.lines.find((l) => l.lineType !== 'buy')!;
    expect([g.sku, g.qty, g.unit, g.autoGift]).toEqual(['A', 4, 'Hộp', true]);
    expect(syncGifts(d, ps).changes).toEqual([]);
    d = { ...d, lines: d.lines.map((l) => (l.lineKey === 'a' ? { ...l, qty: 3 } : l)) };
    d = { ...d, lines: syncGifts(d, ps).lines };
    expect(d.lines.find((l) => l.lineType !== 'buy')!.qty).toBe(6);
    const off = { ...d, skipPolicies: ['QT'] };
    expect(syncGifts(off, ps).lines.filter((l) => l.lineType !== 'buy')).toEqual([]);
  });
  it('quà NCC giao ghi ĐVT khác (1 Thùng quà thay vì 48 Hộp) vẫn quy đổi để so thiếu / thừa', () => {
    const ps = [pol([row({ buyQty: 1, getQty: 48 })])];
    const d = doc([line('a', 1, 'Thùng'), line('g', 1, 'Thùng', { lineType: 'gift_seller', price: 0 })]);
    expect(giftPlan(d, ps)[0]).toMatchObject({ expected: 48, got: 48 });
    expect(promoBoard(d, ps, computeDoc(d, ps)).find((r) => r.kind === 'promo_gift')?.status).toBe('applied');
  });
  it('bảng khuyến mại ghi rõ ĐVT; gợi ý mua thêm theo ĐVT của chính sách (nút sửa SL chỉ khi dòng phiếu cùng ĐVT)', () => {
    const ps = [pol([row({ buyQty: 2 })])];
    const dT = doc([line('a', 1, 'Thùng')]);
    const hT = promoBoard(dT, ps, computeDoc(dT, ps)).find((r) => r.status === 'hint')!;
    expect(hT.text).toContain('mua đủ 2 Thùng');
    expect(hT.action?.qty).toBe(2);
    const dH = doc([line('a', 50, 'Hộp')]);
    const hH = promoBoard(dH, ps, computeDoc(dH, ps)).find((r) => r.status === 'hint')!;
    expect(hH.text).toContain('Thùng');
    expect(hH.action).toBeUndefined();
  });
  it('chính sách cũ một dòng (buy / get, mã ở phạm vi) vẫn tính như trước', () => {
    const old = { id: 'OLD', code: 'OLD', kind: 'promo_gift', name: 'cũ', scope: { partnerCode: 'N1', sku: 'A' }, isActive: true, rule: { buy: 10, get: 1, splitIntoCost: true } } as Policy;
    expect(plan(doc([line('a', 25, 'Hộp')]), [old])).toEqual([['A', 2, 'Hộp']]);
  });
});

describe('Mua – tặng qua API', () => {
  let t: TestCtx;
  beforeAll(async () => {
    t = await setupTenant();
    expect((await call(t, 'POST', '/api/v1/purchase/demo/seed', { password: 'Thuy!@#' })).status).toBe(200);
  }, 60_000);
  afterAll(async () => { await t.app.close(); });
  const P = (rule: Record<string, unknown>, code = 'QT-API') => call(t, 'POST', '/api/v1/purchase/policies', { code, kind: 'promo_gift', name: 'Mua tặng theo ĐVT', scope: { partnerCode: 'NCC-QTAPI' }, rule });

  it('máy chủ chặn mã / ĐVT chưa khai; lưu thì ghi kèm tỉ lệ quy đổi; phiếu ghi Lốc vẫn được tặng đúng Hộp, duyệt được', async () => {
    await call(t, 'PUT', '/api/v1/partners/NCC-QTAPI', { name: 'NCC mua tặng', kind: 'supplier' });
    const bad = await P({ splitIntoCost: true, items: [{ sku: '140181006', buyQty: 1, buyUnit: 'Bao', getQty: 2, getUnit: 'Hộp' }] });
    expect(bad.status).toBe(400);
    expect(JSON.stringify(bad.body)).toContain('Bao');
    const ok = await P({ splitIntoCost: true, items: [{ sku: '140181006', buyQty: 1, buyUnit: 'Thùng', getQty: 2, getUnit: 'Hộp', repeat: true }] });
    expect(ok.status, JSON.stringify(ok.body)).toBeLessThan(300);
    const saved = ((await call(t, 'GET', '/api/v1/purchase/policies')).body.data as Policy[]).find((p) => p.code === 'QT-API')!;
    expect((saved.rule.items as GiftItem[])[0]!.buyRatios).toMatchObject({ 'hộp': 1, 'lốc': 4, 'thùng': 48 });
    // 24 Lốc = 2 Thùng → tặng 4 Hộp (cộng dồn).
    const body = { kind: 'receipt', outsideOrder: { reason: 'Phép thử' }, docDate: '2026-10-28', branchCode: 'CN-NA', partnerCode: 'NCC-QTAPI', priceIncludesVat: false,
      lines: [{ lineKey: 'a', sku: '140181006', name: 'Sữa', unit: 'Lốc', qty: 24, price: 40_000, taxCode: 'V08', lineType: 'buy', lotNo: 'L', expDate: '2028-01-01' },
        { lineKey: 'g', sku: '140181006', name: 'Sữa', unit: 'Hộp', qty: 4, price: 0, taxCode: 'V08', lineType: 'gift_seller', program: 'QT-API', autoGift: true, lotNo: 'L', expDate: '2028-01-01' }] };
    const r = await call(t, 'POST', '/api/v1/purchase/documents', body);
    expect(r.status, JSON.stringify(r.body)).toBe(201);
    expect((r.body.data.checks ?? []).filter((c: { code: string }) => c.code === 'gift_qty')).toEqual([]);
    const ap = await call(t, 'POST', `/api/v1/purchase/documents/${r.body.data.id}/approve`);
    expect(ap.status, JSON.stringify(ap.body)).toBe(200);
  });
});
