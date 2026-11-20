// [2026-11-20 khanhtd] TRA-CUU — test áp riêng + ưu tiên theo TỪNG DÒNG của bảng chiết khấu theo mã (đóng góp)
/**
 * Bảng CK theo mã (item_discount): mỗi dòng có thể tích Áp riêng và có Ưu tiên riêng, như ô Áp riêng theo dòng của mua X tặng Y.
 *   - dòng áp riêng: mã nhận đúng dòng đó thì không nhận chương trình nào khác; dòng khác của cùng bảng vẫn áp đồng thời;
 *   - ưu tiên dòng chỉ dùng khi TRANH ÁP RIÊNG; chọn giữa các bảng CK thường giữ nguyên (phạm vi hẹp → ưu tiên chính sách);
 *   - không ghi hai trường mới → số y như cũ.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { apRiengChong, computeDoc, promoBoard, uuTienDeThang, type PDoc, type PLine, type Policy } from '@bizcity/mua-hang-domain';
import { traChinhSach } from '../src/phan-he/mua-hang/tra-chinh-sach.js';
import { call, setupTenant, type TestCtx } from './helpers.js';

const pol = (code: string, kind: Policy['kind'], rule: Record<string, unknown>, scope: Policy['scope'] = {}, priority = 0): Policy => ({ id: code, code, kind, name: `CT ${code}`, scope: { partnerCode: 'N1', ...scope }, isActive: true, rule, priority });
const line = (k: string, sku: string, qty: number, price: number, o: Partial<PLine> = {}): PLine => ({ lineKey: k, sku, name: sku, unit: 'Lon', qty, price, taxCode: 'V08', lineType: 'buy', brandCode: 'TH', ...o });
const doc = (lines: PLine[]): PDoc => ({ id: 'd', kind: 'receipt', status: 'draft', docNo: '', docDate: '2026-11-20', branchCode: 'B', partnerCode: 'N1', priceIncludesVat: false, lines });
const byKey = (d: PDoc, ps: Policy[]) => Object.fromEntries(computeDoc(d, ps).lines.map((l) => [l.lineKey, l]));
const A = line('a', 'A', 10, 100_000), B = line('b', 'B', 10, 100_000);
const ck2 = pol('CK2', 'trade_discount', { pct: 2 });

describe('Áp riêng theo dòng — bảng CK theo mã', () => {
  it('không ghi apply / priority ở dòng: số như cũ (A, B nhận cả 3% dòng và 2% đơn)', () => {
    const l = byKey(doc([A, B]), [pol('MA', 'item_discount', { items: [{ sku: 'A', pct: 3 }, { sku: 'B', pct: 3 }] }), ck2]);
    expect([l.a!.lineDiscount, l.a!.orderDiscount, l.b!.lineDiscount, l.b!.orderDiscount]).toEqual([30_000, 19_400, 30_000, 19_400]);
  });

  it('chỉ dòng A tích áp riêng: A chỉ 3% (2% đơn bị chặn), B vẫn 3% + 2%', () => {
    const ps = [pol('MA', 'item_discount', { items: [{ sku: 'A', pct: 3, apply: 'exclusive' }, { sku: 'B', pct: 3 }] }), ck2];
    const d = doc([A, B]);
    const l = byKey(d, ps);
    expect([l.a!.lineDiscount, l.a!.orderDiscount]).toEqual([30_000, 0]);
    expect([l.b!.lineDiscount, l.b!.orderDiscount]).toEqual([30_000, 19_400]);
    expect(promoBoard(d, ps, computeDoc(d, ps)).find((r) => r.status === 'blocked')).toMatchObject({ policy: 'CK2', sku: 'A' });
  });

  it('dòng áp riêng chưa đạt SL tối thiểu: không chặn ai (dòng thường của mã vẫn áp cùng CK đơn)', () => {
    const ps = [pol('MA', 'item_discount', { items: [{ sku: 'A', pct: 1 }, { sku: 'A', pct: 5, minQty: 48, apply: 'exclusive' }] }), ck2];
    const l = byKey(doc([A]), ps);
    expect([l.a!.lineDiscount, l.a!.orderDiscount]).toEqual([10_000, 19_800]);
    const l48 = byKey(doc([line('a', 'A', 48, 100_000)]), ps);
    expect([l48.a!.lineDiscount, l48.a!.orderDiscount]).toEqual([240_000, 0]);
  });

  it('ưu tiên dòng thắng ưu tiên chính sách khi tranh áp riêng; bỏ ưu tiên dòng thì chính sách kia thắng', () => {
    const tier = pol('BAC5', 'qty_tier', { tiers: [{ from: 1, pct: 5 }], apply: 'exclusive' }, { sku: 'A' }, 2);
    const ma = (priority?: number) => pol('MA3', 'item_discount', { items: [{ sku: 'A', pct: 3, apply: 'exclusive', ...(priority !== undefined ? { priority } : {}) }] });
    expect(byKey(doc([A]), [tier, ma(5)]).a!.lineDiscount).toBe(30_000);
    expect(byKey(doc([A]), [tier, ma()]).a!.lineDiscount).toBe(50_000);
  });

  it('ưu tiên dòng KHÔNG đổi cách chọn giữa hai bảng CK thường: vẫn theo ưu tiên chính sách', () => {
    const p1 = pol('P1', 'item_discount', { items: [{ sku: 'A', pct: 3, priority: 9 }] }, {}, 0);
    const p2 = pol('P2', 'item_discount', { items: [{ sku: 'A', pct: 5 }] }, {}, 1);
    expect(byKey(doc([A]), [p1, p2]).a!.lineDiscount).toBe(50_000);
  });

  it('Tra cứu TC01: cờ áp riêng và ưu tiên lấy theo dòng của mã đang tra', () => {
    const ps = [pol('MA', 'item_discount', { items: [{ sku: 'A', pct: 3, apply: 'exclusive', priority: 7 }, { sku: 'B', pct: 3 }] }), ck2];
    const r = traChinhSach({ sku: 'A', name: 'A', brandCode: 'TH', unit: 'Lon', qty: 10, price: 100_000, priceIncludesVat: false, date: '2026-11-20', branchCode: 'B', partnerCode: 'N1', policies: ps, units: [{ unit: 'Lon', ratio: 1 }] });
    expect(r.rows.find((x) => x.code === 'MA')).toMatchObject({ status: 'ap', exclusive: true, priority: 7, winner: true });
    expect(r.rows.find((x) => x.code === 'CK2')!.status).toBe('bi-chan');
    const rb = traChinhSach({ sku: 'B', name: 'B', brandCode: 'TH', unit: 'Lon', qty: 10, price: 100_000, priceIncludesVat: false, date: '2026-11-20', branchCode: 'B', partnerCode: 'N1', policies: ps, units: [{ unit: 'Lon', ratio: 1 }] });
    expect(rb.rows.find((x) => x.code === 'MA')).toMatchObject({ status: 'ap', exclusive: false });
  });

  it('cảnh báo chồng áp riêng: so ưu tiên theo mã; nút ưu tiên chính sách bỏ qua mã đã có ưu tiên ở dòng', () => {
    const p = pol('P', 'item_discount', { items: [{ sku: 'A', pct: 3, apply: 'exclusive', priority: 5 }, { sku: 'B', pct: 3, apply: 'exclusive' }, { sku: 'C', pct: 3 }] });
    const q = pol('Q', 'item_discount', { items: ['A', 'B', 'C'].map((sku) => ({ sku, pct: 2 })), apply: 'exclusive' }, {}, 3);
    const chong = apRiengChong(p, [q]);
    expect(chong.map((c) => `${c.result}:${c.skus?.join('+')}:${c.myPriority}>${c.otherPriority}:${c.myRowPriority}`))
      .toEqual(['thua:B:0>3:false', 'bi-chan:C:0>3:false', 'thang:A:5>3:true']);
    expect(uuTienDeThang(p, chong)).toBe(4);
  });
});

describe('Áp riêng theo dòng — lưu qua API', () => {
  let t: TestCtx;
  beforeAll(async () => { t = await setupTenant(); }, 60_000);
  afterAll(async () => { await t.app.close(); });

  it('ghi / đọc lại giữ apply + priority của từng dòng; priority sai kiểu → 400', async () => {
    await call(t, 'PUT', '/api/v1/partners/NCC-DONG', { name: 'NCC áp riêng theo dòng', kind: 'supplier' });
    const body = (items: unknown[]) => ({ code: `DONG-${items.length}`, kind: 'item_discount', name: 'CK theo mã — áp riêng theo dòng', scope: { partnerCode: 'NCC-DONG' }, rule: { items } });
    const r = await call(t, 'POST', '/api/v1/purchase/policies', body([{ sku: 'X1', pct: 3, apply: 'exclusive', priority: 5 }, { sku: 'X2', pct: 2 }]));
    expect(r.status, JSON.stringify(r.body).slice(0, 300)).toBeLessThan(300);
    const saved = ((await call(t, 'GET', '/api/v1/purchase/policies')).body.data as Policy[]).find((p) => p.code === 'DONG-2')!;
    expect((saved.rule.items as unknown[])[0]).toMatchObject({ sku: 'X1', apply: 'exclusive', priority: 5 });
    expect((await call(t, 'POST', '/api/v1/purchase/policies', body([{ sku: 'X1', pct: 3, priority: 'cao' }]))).status).toBe(400);
  });
});
