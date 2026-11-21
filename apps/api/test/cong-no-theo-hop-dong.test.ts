// [2026-11-21 Nguyễn Văn Thủy] Hạn mức công nợ + điều khoản thanh toán theo hợp đồng (docs/nghiep-vu/28) (đóng góp)
/**
 * NCC có hạn mức chung 10 triệu + điều khoản 30 ngày; hợp đồng HD-CN có hạn mức riêng 3 triệu + điều khoản 7 ngày.
 * 1. Đơn thuộc hợp đồng: kiểm cả hạn mức hợp đồng (tính trên phiếu thuộc hợp đồng) và hạn mức chung; hạn thanh toán 7 ngày.
 * 2. Đơn ngoài hợp đồng: chỉ hạn mức chung; hạn thanh toán 30 ngày (bản của hợp đồng không áp).
 * 3. Phiếu nhập thuộc hợp đồng đã duyệt chiếm hạn mức hợp đồng; MH05 (/credit) trả hạn mức theo hợp đồng có contractCode.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { call, setupTenant, type TestCtx } from './helpers.js';

let t: TestCtx;
const NCC = 'NCC-CNHD';
const SKU = 'CNHD-A';
const HD = 'HD-CN';
type Credit = { scope: string; limit: number; current: number; openOrders: number; remaining: number };
const doc = (kind: string, qty: number, contract?: string) => ({
  kind, docDate: '2026-11-10', branchCode: 'CN01', partnerCode: NCC, priceIncludesVat: false, ...(contract ? { contractCode: contract } : {}),
  ...(kind === 'receipt' && !contract ? { outsideOrder: { reason: 'Thử' } } : kind === 'receipt' ? { outsideOrder: { reason: 'Thử' } } : {}),
  lines: [{ lineKey: 'a', sku: SKU, name: 'Hàng A', unit: 'Hộp', qty, price: 100_000, taxCode: 'V08', lineType: 'buy' }],
});
const pol = (code: string, kind: string, rule: Record<string, unknown>, contract?: string) => ({
  code, kind, name: code, scope: { partnerCode: NCC, ...(contract ? { contractCode: contract } : {}) }, validFrom: '2026-11-01', isActive: true, priority: 0, rule,
});

beforeAll(async () => {
  t = await setupTenant();
  await call(t, 'PUT', `/api/v1/partners/${NCC}`, { name: 'NCC công nợ theo hợp đồng', kind: 'supplier' });
  await call(t, 'PUT', `/api/v1/catalog/products/${SKU}?new=true`, { name: 'Hàng A', unit: 'Hộp', taxInCode: 'V08', units: [{ unit: 'Hộp', ratio: 1, isDefault: true }] });
  const hd = await call(t, 'PUT', '/api/v1/purchase/contracts', { code: HD, isNew: true, contract: { partnerCode: NCC, signedDate: '2026-11-01', startDate: '2026-11-01', endDate: '2027-10-31', skus: [SKU] } });
  expect(hd.status, JSON.stringify(hd.body)).toBe(200);
  for (const p of [
    pol('CN-HM-CHUNG', 'credit_limit', { limit: 10_000_000, warnPct: 90 }),
    pol('CN-TT-CHUNG', 'payment_term', { basis: 'receipt_date', days: 30 }),
    pol('CN-HM-HD', 'credit_limit', { limit: 3_000_000, warnPct: 90 }, HD),
    pol('CN-TT-HD', 'payment_term', { basis: 'receipt_date', days: 7 }, HD),
  ]) { const r = await call(t, 'POST', '/api/v1/purchase/policies', p); expect(r.status, JSON.stringify(r.body)).toBe(201); }
}, 90_000);
afterAll(async () => { await t.app.close(); });

const analyze = async (body: Record<string, unknown>) => {
  const r = await call<{ data: { credit: Credit[]; calc: { dueDate?: string } } }>(t, 'POST', '/api/v1/purchase/analyze', body);
  expect(r.status, JSON.stringify(r.body).slice(0, 400)).toBe(200);
  return r.body.data;
};

describe('Công nợ & điều khoản thanh toán theo hợp đồng', () => {
  it('đơn thuộc hợp đồng: hạn mức hợp đồng + hạn mức chung, hạn 7 ngày; đơn ngoài hợp đồng: chỉ hạn mức chung, hạn 30 ngày', async () => {
    const trong = await analyze(doc('receipt', 5, HD));
    expect(trong.credit.map((c) => [c.scope.split(' ')[0], c.limit])).toEqual([['Hợp', 3_000_000], ['NCC', 10_000_000]]);
    expect(trong.calc.dueDate).toBe('2026-11-17');
    const ngoai = await analyze(doc('receipt', 5));
    expect(ngoai.credit.map((c) => c.limit)).toEqual([10_000_000]);
    expect(ngoai.calc.dueDate).toBe('2026-12-10');
  });

  it('phiếu nhập thuộc hợp đồng đã duyệt chiếm hạn mức hợp đồng; MH05 trả hạn mức theo hợp đồng', async () => {
    const r = await call(t, 'POST', '/api/v1/purchase/documents', doc('receipt', 10, HD));
    expect(r.status, JSON.stringify(r.body).slice(0, 400)).toBe(201);
    expect((await call(t, 'POST', `/api/v1/purchase/documents/${r.body.data.id}/approve`, {})).status).toBe(200);
    const sau = await analyze(doc('order', 1, HD));
    const hd = sau.credit.find((c) => c.scope.startsWith('Hợp đồng'))!;
    expect(hd.current).toBe(1_080_000);
    const ngoai = await analyze(doc('order', 1));
    expect(ngoai.credit.find((c) => c.scope.startsWith('Hợp đồng'))).toBeUndefined();
    const ov = await call<{ data: { partners: { partnerCode: string; contractCode: string; limit: number; current: number }[] } }>(t, 'GET', '/api/v1/purchase/credit?asOf=2026-11-30');
    const rows = ov.body.data.partners.filter((p) => p.partnerCode === NCC).map((p) => [p.contractCode, p.limit, p.current]).sort();
    expect(rows).toEqual([['', 10_000_000, 1_080_000], [HD, 3_000_000, 1_080_000]]);
  });
});
