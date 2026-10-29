/**
 * Phân kho: mọi hàng ra / vào thuộc một phân kho của chi nhánh.
 *   - Phiếu mua hàng (nhập, trả, quà…) chọn MỘT phân kho ở đầu phiếu; trống → kho mặc định; kho của chi nhánh khác → lỗi.
 *   - Sổ kho: dòng không ghi kho (phiếu bán từ hệ thống bán hàng…) → kho mặc định của chi nhánh.
 *   - Chuyển giữa chi nhánh: phía nhận vào toWarehouseCode, trống = kho mặc định của chi nhánh nhận (không mang mã kho phía gửi).
 *   - Chuyển giữa hai kho trong CÙNG chi nhánh: bắt buộc kho xuất ≠ kho nhận; tồn chuyển kho, giá vốn không đổi.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { db } from '../src/db/client.js';
import { call, saleDoc, setupTenant, type TestCtx } from './helpers.js';

let t: TestCtx;
const movesOf = async (eventIds: string[]) => (eventIds.length ? db.selectFrom('inventory_movements as m').innerJoin('branches as b', 'b.id', 'm.branch_id')
  .select(['b.code as branch', 'm.kind', 'm.sku', 'm.warehouse_code']).where('m.event_id', 'in', eventIds).execute() : []);
const docEvents = async (key: string) => ((await call(t, 'GET', `/api/v1/documents?search=${encodeURIComponent(key)}`)).body.data as { id: string; docKey: string }[]).filter((d) => d.docKey === key).map((d) => d.id);
const receipt = (over: Record<string, unknown> = {}) => ({
  kind: 'receipt', outsideOrder: { reason: 'Phép thử phân kho' }, docDate: '2026-10-05', branchCode: 'CN01', partnerCode: 'NCC-KHO', priceIncludesVat: false,
  lines: [{ lineKey: 'a', sku: 'KHO-SUA', name: 'Sữa kho', unit: 'Hộp', qty: 5, price: 100_000, taxCode: 'V08', lineType: 'buy' }], ...over,
});
const approve = async (body: Record<string, unknown>) => {
  const s = await call(t, 'POST', '/api/v1/purchase/documents', body);
  expect(s.status, JSON.stringify(s.body)).toBe(201);
  const a = await call(t, 'POST', `/api/v1/purchase/documents/${s.body.data.id}/approve`);
  expect(a.status, JSON.stringify(a.body)).toBe(200);
  return a.body.data as { warehouseCode?: string; links: { eventId: string }[] };
};

beforeAll(async () => {
  t = await setupTenant();
  await call(t, 'POST', '/api/v1/branches', { code: 'CN02', name: 'Cửa hàng 02' });
  for (const w of [{ code: 'K1-HH', branchCode: 'CN01', name: 'Kho hàng', isDefault: true }, { code: 'K1-QUA', branchCode: 'CN01', name: 'Kho quà', isPromo: true }, { code: 'K2-HH', branchCode: 'CN02', name: 'Kho hàng 02', isDefault: true }]) {
    const r = await call(t, 'POST', '/api/v1/warehouses', w);
    expect(r.status, JSON.stringify(r.body)).toBe(201);
  }
  await call(t, 'PUT', '/api/v1/partners/NCC-KHO', { name: 'NCC phân kho', kind: 'supplier' });
  await call(t, 'PUT', '/api/v1/catalog/products/KHO-SUA?new=true', { name: 'Sữa kho', unit: 'Hộp', taxInCode: 'V08', units: [{ unit: 'Hộp', ratio: 1, isDefault: true }] });
}, 60_000);
afterAll(async () => { await t.app.close(); });

describe('Phân kho', () => {
  it('phiếu nhập không chọn kho → kho mặc định của chi nhánh, sổ kho ghi đúng kho', async () => {
    const d = await approve(receipt());
    expect(d.warehouseCode).toBe('K1-HH');
    const m = await movesOf(d.links.map((l) => l.eventId));
    expect(m.length).toBeGreaterThan(0);
    expect(m.every((x) => x.warehouse_code === 'K1-HH')).toBe(true);
  });

  it('phiếu nhập chọn kho khác cùng chi nhánh (kho quà) → mọi dòng vào kho đó', async () => {
    const d = await approve(receipt({ warehouseCode: 'K1-QUA', docDate: '2026-10-06' }));
    expect(d.warehouseCode).toBe('K1-QUA');
    expect((await movesOf(d.links.map((l) => l.eventId))).map((x) => x.warehouse_code)).toEqual(['K1-QUA']);
  });

  it('kho của chi nhánh khác / mã kho lạ → báo lỗi, không lưu', async () => {
    const r = await call(t, 'POST', '/api/v1/purchase/documents', receipt({ warehouseCode: 'K2-HH' }));
    expect(r.status).toBe(400);
    expect(JSON.stringify(r.body)).toContain('không thuộc chi nhánh CN01');
  });

  it('phiếu bán (nguồn ngoài) không ghi kho → sổ kho ghi kho mặc định của chi nhánh', async () => {
    const r = await call(t, 'POST', '/api/v1/documents', saleDoc({ docKey: 'pos:CN01:KHO1', docNo: 'KHO1' }));
    expect(r.status, JSON.stringify(r.body)).toBeLessThan(300);
    const m = await movesOf(await docEvents('pos:CN01:KHO1'));
    expect(m.length).toBeGreaterThan(0);
    expect(m.every((x) => x.warehouse_code === 'K1-HH')).toBe(true);
  });

  it('chuyển CN01 → CN02 (dòng ghi kho K1-QUA): phía xuất K1-QUA, phía nhận kho mặc định K2-HH', async () => {
    const r = await call(t, 'POST', '/api/v1/documents', {
      docType: 'transfer', docKey: 'kho:CK1', version: 1, branchCode: 'CN01', toBranchCode: 'CN02', docNo: 'CK1', docDate: '2026-10-07', status: 'received',
      lines: [{ lineKey: 'a', sku: 'KHO-SUA', name: 'Sữa kho', unit: 'Hộp', qty: 1, amount: 0, warehouseCode: 'K1-QUA' }], totals: { total: 0 },
    });
    expect(r.status, JSON.stringify(r.body)).toBeLessThan(300);
    const m = await movesOf(await docEvents('kho:CK1'));
    expect(m.find((x) => x.kind === 'transfer_out')?.warehouse_code).toBe('K1-QUA');
    expect(m.find((x) => x.kind === 'transfer_in')).toMatchObject({ branch: 'CN02', warehouse_code: 'K2-HH' });
  });

  it('chuyển trong cùng chi nhánh CN01: không ghi kho vẫn nhận (kho mặc định); K1-HH → K1-QUA ghi hai dòng cùng chi nhánh khác kho, giá vốn không đổi', async () => {
    const body = (key: string, line: Record<string, unknown>) => ({
      docType: 'transfer', docKey: `kho:${key}`, version: 1, branchCode: 'CN01', toBranchCode: 'CN01', docNo: key, docDate: '2026-10-08', status: 'received',
      lines: [{ lineKey: 'a', sku: 'KHO-SUA', name: 'Sữa kho', unit: 'Hộp', qty: 2, amount: 0, ...line }], totals: { total: 0 },
    });
    // Hệ thống bán hàng có gửi phiếu cùng chi nhánh không ghi kho: vẫn nhận (xuất / nhận cùng kho mặc định, tồn không đổi).
    const legacy = await call(t, 'POST', '/api/v1/documents', body('CK-CU', {}));
    expect(legacy.status, JSON.stringify(legacy.body)).toBeLessThan(300);
    expect(new Set((await movesOf(await docEvents('kho:CK-CU'))).map((x) => x.warehouse_code))).toEqual(new Set(['K1-HH']));
    const r = await call(t, 'POST', '/api/v1/documents', body('CK2', { warehouseCode: 'K1-HH', toWarehouseCode: 'K1-QUA' }));
    expect(r.status, JSON.stringify(r.body)).toBeLessThan(300);
    const m = await movesOf(await docEvents('kho:CK2'));
    expect(m.find((x) => x.kind === 'transfer_out')).toMatchObject({ branch: 'CN01', warehouse_code: 'K1-HH' });
    expect(m.find((x) => x.kind === 'transfer_in')).toMatchObject({ branch: 'CN01', warehouse_code: 'K1-QUA' });
    const c = await call(t, 'POST', '/api/v1/inventory/costing', { period: '2026-10' });
    expect(c.status, JSON.stringify(c.body)).toBe(200);
    const costs = (await call(t, 'GET', '/api/v1/inventory/costs?period=2026-10&search=KHO-SUA')).body.data as { unitCost: number; closingQty: number }[];
    expect(costs.length).toBeGreaterThan(0);
    // Nhập 2 phiếu × 5 hộp giá 100.000 (chưa thuế); chuyển nội bộ chi nhánh không đổi đơn giá bình quân.
    expect(costs.every((x) => x.unitCost === 100000), JSON.stringify(costs)).toBe(true);
  });

  it('MH24 sổ kho theo mặt hàng: đủ luồng, tồn cuối = công thức; MH25 tồn kho theo kho', async () => {
    type L = Record<string, number | string>;
    const r = await call(t, 'GET', '/api/v1/purchase/stock-ledger?from=2026-10-01&to=2026-10-31&branchCodes=CN01');
    expect(r.status, JSON.stringify(r.body)).toBe(200);
    const x = (r.body.data.rows as L[]).find((y) => y.sku === 'KHO-SUA')!;
    // Nhập 2 phiếu × 5; chuyển CN01 → CN02 1 (xuất nội bộ); chuyển nội bộ chi nhánh 2 + phiếu cũ 2 (xuất rồi nhận lại cùng chi nhánh).
    expect(x).toMatchObject({ inQty: 10, outTransferQty: 5, inTransferQty: 4 });
    const n = (k: string) => Number(x[k]);
    expect(n('closeQty')).toBe(n('openQty') + n('inQty') + n('inReturnQty') + n('inTransferQty') - n('outTransferQty') - n('saleQty') - n('returnQty') - n('outAdjustQty') + n('adjustQty') + n('otherQty'));
    const h = await call(t, 'GET', '/api/v1/purchase/stock-on-hand?to=2026-10-31&branchCodes=CN01');
    expect(h.status, JSON.stringify(h.body)).toBe(200);
    const byWh = Object.fromEntries((h.body.data.rows as L[]).filter((y) => y.sku === 'KHO-SUA').map((y) => [y.warehouseCode, y.qty]));
    // K1-HH: 5 − 2 (chuyển sang K1-QUA) = 3; K1-QUA: 5 − 1 (chuyển CN02) + 2 = 6.
    expect(byWh).toEqual({ 'K1-HH': 3, 'K1-QUA': 6 });
  });
});
