// [2026-11-17 Nguyễn Văn Thủy] Giá vốn tách theo loại kho (0155): mặc định tính chung; bỏ chọn loại kho thì loại đó tính giá riêng (đóng góp)
/**
 * CN01 có kho hàng K1 (KHH) và kho khuyến mãi K1KM (KKM).
 *   09/2026  nhập 10 hộp × 50.000 vào K1; nhập 5 hộp quà 0 đồng vào K1KM; bán 4 từ K1, 2 từ K1KM
 *            tính chung: (500.000 + 0) / 15 = 33.333,33 · tách KKM: K1 = 50.000, K1KM = 0
 *   10/2026  chuyển 2 hộp K1 → K1KM (cùng chi nhánh): K1KM nhận theo giá bên gửi 50.000 → (3 × 0 + 100.000) / 5 = 20.000
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { sql } from 'kysely';
import { db } from '../src/db/client.js';
import { call, setupTenant, type TestCtx } from './helpers.js';

let ctx: TestCtx;
let tenantId: string;
const post = async (doc: unknown) => {
  const r = await call(ctx, 'POST', '/api/v1/documents', doc);
  expect(r.body.data?.status, JSON.stringify(r.body)).toBe('posted');
};
const line = (qty: number, amount: number, wh: string, extra: Record<string, unknown> = {}) =>
  ({ lineKey: 'l1', sku: 'SUA09', name: 'Sữa thử loại kho', unit: 'Hộp', qty, amountBeforeTax: amount, taxCode: 'V08', taxAmount: 0, warehouseCode: wh, ...extra });
const costs = async (period: string) => (await call(ctx, 'GET', `/api/v1/inventory/costs?period=${period}&search=SUA09`)).body.data as { whType: string; unitCost: number; closingQty: number }[];
async function balance(account: string, period: string) {
  const r = await sql<{ v: string | null }>`SELECT SUM(debit - credit) AS v FROM ledger_lines WHERE tenant_id = ${tenantId} AND account_code = ${account}
    AND to_char(posting_date, 'YYYY-MM') = ${period}`.execute(db);
  return Number(r.rows[0]?.v ?? 0);
}

beforeAll(async () => {
  ctx = await setupTenant();
  tenantId = (await db.selectFrom('tenants').select('id').where('code', '=', ctx.tenantCode).executeTakeFirstOrThrow()).id;
  for (const w of [{ code: 'K1', branchCode: 'CN01', name: 'Kho hàng', isDefault: true }, { code: 'K1KM', branchCode: 'CN01', name: 'Kho khuyến mãi', typeCode: 'KKM' }]) {
    const r = await call(ctx, 'POST', '/api/v1/warehouses', w);
    expect(r.status, JSON.stringify(r.body)).toBeLessThan(300);
  }
  const partner = { code: 'NCC-LK', name: 'Nhà cung cấp' };
  await post({ docType: 'purchase', docKey: 'LK-NM1', branchCode: 'CN01', docNo: 'LK-NM1', docDate: '2026-09-02', partner, lines: [line(10, 500000, 'K1')], totals: { beforeTax: 500000, tax: 0, total: 500000 } });
  await post({ docType: 'purchase', docKey: 'LK-NM2', branchCode: 'CN01', docNo: 'LK-NM2', docDate: '2026-09-02', partner, lines: [line(5, 0, 'K1KM')], totals: { beforeTax: 0, tax: 0, total: 0 } });
  for (const [k, q, wh] of [['LK-B1', 4, 'K1'], ['LK-B2', 2, 'K1KM']] as const) {
    await post({ docType: 'sale', docKey: k, branchCode: 'CN01', docNo: k, docDate: '2026-09-10', lines: [{ ...line(q, q * 80000, wh), taxCode: 'R08' }],
      payments: [{ methodCode: 'TM', amount: q * 80000 }], totals: { beforeTax: q * 80000, tax: 0, total: q * 80000 } });
  }
  await post({ docType: 'transfer', docKey: 'LK-CK', branchCode: 'CN01', toBranchCode: 'CN01', docNo: 'LK-CK', docDate: '2026-10-05', status: 'received',
    lines: [{ lineKey: 'l1', sku: 'SUA09', qty: 2, amount: 0, warehouseCode: 'K1', toWarehouseCode: 'K1KM' }], totals: { total: 0 } });
});
afterAll(async () => { await ctx.app.close(); });

describe('Giá vốn theo loại kho', () => {
  it('mặc định: mọi loại kho tính chung một giá', async () => {
    const r = await call(ctx, 'POST', '/api/v1/inventory/costing', { period: '2026-09' });
    expect(r.status, JSON.stringify(r.body)).toBe(200);
    const c = await costs('2026-09');
    expect(c).toHaveLength(1);
    expect(c[0]).toMatchObject({ whType: '', closingQty: 9 });
    expect(c[0]!.unitCost).toBeCloseTo(33333.3333, 3);
  });

  it('bỏ chọn KKM: kho khuyến mãi tính giá riêng (0 đồng), kho hàng giữ giá mua; lịch sử ghi loại kho tính riêng', async () => {
    const r = await call(ctx, 'POST', '/api/v1/inventory/costing', { period: '2026-09', separateTypes: ['KKM'] });
    expect(r.status, JSON.stringify(r.body)).toBe(200);
    const c = await costs('2026-09');
    expect(c.find((x) => x.whType === '')).toMatchObject({ unitCost: 50000, closingQty: 6 });
    expect(c.find((x) => x.whType === 'KKM')).toMatchObject({ unitCost: 0, closingQty: 3 });
    expect(await balance('6321', '2026-09')).toBe(200000); // 4 × 50.000 + 2 × 0
    const runs = (await call(ctx, 'GET', '/api/v1/inventory/costing-runs')).body.data;
    expect(runs[0].separateTypes).toEqual(['KKM']);
    const lines = (await call(ctx, 'GET', `/api/v1/inventory/costing-runs/${runs[0].id}/lines`)).body.data;
    expect(lines.map((x: { whType: string }) => x.whType).sort()).toEqual(['', 'KKM']);
  });

  it('chuyển kho hàng → kho khuyến mãi cùng chi nhánh: mang giá vốn bên gửi, hàng đang chuyển về 0', async () => {
    const r = await call(ctx, 'POST', '/api/v1/inventory/costing', { period: '2026-10', separateTypes: ['KKM'] });
    expect(r.status, JSON.stringify(r.body)).toBe(200);
    const c = await costs('2026-10');
    expect(c.find((x) => x.whType === '')).toMatchObject({ unitCost: 50000, closingQty: 4 });
    expect(c.find((x) => x.whType === 'KKM')).toMatchObject({ unitCost: 20000, closingQty: 5 });
    expect(await balance('1579', '2026-10')).toBe(0);
    expect(await balance('13681', '2026-10')).toBe(0);
  });
});
