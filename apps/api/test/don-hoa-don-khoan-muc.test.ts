// [2026-11-20 khanhtd] MUA-HANG — test: đơn đặt theo dõi hoá đơn (gom phiếu nhập của đơn) + khoản mục chi phí của phiếu chi phí mua (đóng góp)
/**
 * 1. Hoá đơn của đơn đặt = gom các phiếu nhập theo đơn: chưa nhập hàng · chưa có HĐ · có HĐ một phần · đủ HĐ (phiếu huỷ không tính).
 *    Màn Đối chiếu đơn (MH21) trả thêm tình trạng hoá đơn từng dòng + đếm theo đơn.
 * 2. Phiếu chi phí mua chọn khoản mục ở Danh mục khoản mục: lưu / đọc lại; mã không có trong danh mục hoặc đã ngừng theo dõi → lỗi chặn.
 *    Không ghi khoản mục thì như cũ.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { orderInvoice, type PDoc } from '@bizcity/mua-hang-domain';
import { call, setupTenant, type TestCtx } from './helpers.js';

const doc = (id: string, kind: PDoc['kind'], o: Partial<PDoc> = {}): PDoc => ({ id, kind, status: 'approved', docNo: id, docDate: '2026-11-20', branchCode: 'B', partnerCode: 'N', priceIncludesVat: false, lines: [], ...o });
const inv = (no: string) => ({ no, serial: 'C26TAA', date: '2026-11-20' });

describe('Hoá đơn của đơn đặt — hàm thuần', () => {
  const o = doc('o1', 'order');
  it('chưa nhập · chưa có · một phần · đủ; phiếu huỷ không tính; không phải đơn → null', () => {
    expect(orderInvoice(o, [o])!.state).toBe('chua_nhap');
    const r1 = doc('r1', 'receipt', { refIds: ['o1'] }), r2 = doc('r2', 'receipt', { refIds: ['o1'], invoice: inv('123') });
    expect(orderInvoice(o, [o, r1])).toMatchObject({ state: 'chua_co', receipts: 1, invoiced: 0, missing: ['r1'] });
    expect(orderInvoice(o, [o, r1, r2])).toMatchObject({ state: 'mot_phan', receipts: 2, invoiced: 1, invoices: ['C26TAA-123'], text: 'Có HĐ một phần (1/2 phiếu nhập)' });
    expect(orderInvoice(o, [o, { ...r1, status: 'cancelled' }, r2])).toMatchObject({ state: 'du', receipts: 1, invoiced: 1 });
    expect(orderInvoice(doc('x', 'receipt'), [])).toBeNull();
  });
});

describe('Qua API — MH21 và khoản mục chi phí', () => {
  let t: TestCtx;
  type Check = { code: string; blocking?: boolean };
  const save = async (body: Record<string, unknown>) => { const r = await call(t, 'POST', '/api/v1/purchase/documents', body); expect(r.status, JSON.stringify(r.body).slice(0, 400)).toBe(201); return r.body.data as { id: string; docNo: string; checks?: Check[] }; };
  const approve = async (id: string) => { const r = await call(t, 'POST', `/api/v1/purchase/documents/${id}/approve`); expect(r.status, JSON.stringify(r.body).slice(0, 400)).toBe(200); };
  const analyze = async (body: Record<string, unknown>) => (await call(t, 'POST', '/api/v1/purchase/analyze', body)).body.data.checks as Check[];
  const SKU = 'HDKM01', NCC = 'NCC-HDKM';
  const line = (qty: number) => ({ lineKey: `l${Math.random().toString(36).slice(2, 8)}`, sku: SKU, name: 'Hàng thử HĐ / KM', unit: 'Lon', qty, price: 100_000, taxCode: 'V08', lineType: 'buy' });
  const base = { branchCode: 'CN-NA', partnerCode: NCC, priceIncludesVat: false, orderDiscount: {} };

  beforeAll(async () => {
    t = await setupTenant();
    expect((await call(t, 'POST', '/api/v1/purchase/demo/seed', { password: 'Thuy!@#' })).status).toBe(200);
    expect((await call(t, 'PUT', `/api/v1/catalog/products/${SKU}?new=1`, { name: 'Hàng thử HĐ / KM', unit: 'Lon', taxInCode: 'V08', units: [{ unit: 'Lon', ratio: 1, isDefault: true, isPurchaseDefault: true }] })).status).toBe(200);
    await call(t, 'PUT', `/api/v1/partners/${NCC}`, { name: 'NCC thử hoá đơn / khoản mục', kind: 'supplier' });
    expect((await call(t, 'PUT', '/api/v1/dimensions/cost_item/KM-VC', { name: 'Vận chuyển hàng mua' })).status).toBe(200);
    expect((await call(t, 'PUT', '/api/v1/dimensions/cost_item/KM-CU', { name: 'Khoản mục ngừng', isActive: false })).status).toBe(200);
  }, 90_000);
  afterAll(async () => { await t.app.close(); });

  it('MH21: dòng mang tình trạng hoá đơn của đơn, đếm theo đơn', async () => {
    const o = await save({ ...base, kind: 'order', docDate: '2026-11-05', lines: [line(20)] });
    await approve(o.id);
    await approve((await save({ ...base, kind: 'receipt', docDate: '2026-11-06', refIds: [o.id], lines: [line(10)], invoice: inv('5001') })).id);
    await approve((await save({ ...base, kind: 'receipt', docDate: '2026-11-07', refIds: [o.id], lines: [line(10)] })).id);
    const rep = (await call(t, 'GET', `/api/v1/purchase/order-reconcile?from=2026-11-01&to=2026-11-30&partnerCode=${NCC}`)).body.data;
    expect(rep.rows.find((r: { orderId: string }) => r.orderId === o.id).invoice).toEqual({ state: 'mot_phan', text: 'Có HĐ một phần (1/2 phiếu nhập)' });
    expect(rep.invoiceSummary).toMatchObject({ mot_phan: 1, du: 0 });
  });

  it('phiếu chi phí: khoản mục lưu / đọc lại; mã lạ hoặc đã ngừng → lỗi chặn; không ghi → như cũ', async () => {
    const r = await save({ ...base, kind: 'receipt', docDate: '2026-11-08', outsideOrder: { reason: 'Phép thử' }, lines: [line(5)] });
    await approve(r.id);
    const cost = (o: Record<string, unknown>) => ({ ...base, kind: 'cost', docDate: '2026-11-09', refIds: [r.id], amount: 300_000, costType: 'van_chuyen', basis: 'value', lines: [], ...o });
    const c = await save(cost({ costItem: 'KM-VC' }));
    const got = (await call(t, 'GET', `/api/v1/purchase/documents/${c.id}`)).body.data.doc;
    expect(got.costItem).toBe('KM-VC');
    await approve(c.id);
    expect((await analyze(cost({ costItem: 'KHONG-CO' }))).find((x) => x.code === 'cost_item_unknown')?.blocking).toBe(true);
    expect((await analyze(cost({ costItem: 'KM-CU' }))).find((x) => x.code === 'cost_item_inactive')?.blocking).toBe(true);
    expect((await analyze(cost({}))).some((x) => x.code.startsWith('cost_item'))).toBe(false);
  });
});
