// [2026-11-20 kiennt] NT-KHO-004 — hàng nhận giữ hộ (KNB) chỉ ghi số lượng, không ghi giá trị (đóng góp)
/**
 * CN01: kho hàng K4 (KHH, mặc định) và kho giữ hộ K4NB (KNB — không thuộc sở hữu).
 *   - nhập kho khác có tiền vào K4NB → ghi được, thành tiền 0, không bút toán; xuất khỏi K4NB → không bút toán;
 *   - chuyển K4NB ↔ K4 (hai chiều) → chặn; bán có tiền từ K4NB → chặn;
 *   - giá vốn tháng: tồn giữ hộ không kéo đơn giá kho hàng (loại KNB luôn tính riêng).
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { sql } from 'kysely';
import { db } from '../src/db/client.js';
import { call, setupTenant, type TestCtx } from './helpers.js';

let ctx: TestCtx;
let tenantId: string;
const SKU = 'SUA04';
const stock = (key: string, direction: 'increase' | 'decrease', qty: number, amount: number, wh: string) => ({
  docType: 'stock_adjustment', docKey: key, branchCode: 'CN01', docNo: key, docDate: '2026-09-05', direction,
  lines: [{ lineKey: 'l1', sku: SKU, name: 'Sữa thử giữ hộ', unit: 'Hộp', qty: direction === 'increase' ? qty : -qty, amount, warehouseCode: wh }], totals: { total: amount },
});
const transfer = (key: string, from: string, to: string) => ({
  docType: 'transfer', docKey: key, branchCode: 'CN01', toBranchCode: 'CN01', docNo: key, docDate: '2026-09-06', status: 'received',
  lines: [{ lineKey: 'l1', sku: SKU, qty: 1, amount: 0, warehouseCode: from, toWarehouseCode: to }], totals: { total: 0 },
});
const ledgerOf = async (docKey: string) => Number((await sql<{ n: string }>`
  SELECT COUNT(*) AS n FROM ledger_lines l JOIN ledger_entries e ON e.id = l.entry_id JOIN accounting_events a ON a.id = e.event_id
   WHERE a.tenant_id = ${tenantId} AND a.doc_key = ${docKey}`.execute(db)).rows[0]?.n ?? 0);
const movementOf = async (docKey: string) => (await sql<{ qty: string; amount: string }>`
  SELECT m.qty, m.amount FROM inventory_movements m JOIN accounting_events a ON a.id = m.event_id WHERE a.tenant_id = ${tenantId} AND a.doc_key = ${docKey}`.execute(db)).rows;

beforeAll(async () => {
  ctx = await setupTenant();
  tenantId = (await db.selectFrom('tenants').select('id').where('code', '=', ctx.tenantCode).executeTakeFirstOrThrow()).id;
  for (const w of [{ code: 'K4', branchCode: 'CN01', name: 'Kho hàng', isDefault: true }, { code: 'K4NB', branchCode: 'CN01', name: 'Kho giữ hộ', typeCode: 'KNB' }]) {
    const r = await call(ctx, 'POST', '/api/v1/warehouses', w);
    expect(r.status, JSON.stringify(r.body)).toBeLessThan(300);
  }
});
afterAll(async () => { await ctx.app.close(); });

describe('NT-KHO-004 — hàng giữ hộ chỉ số lượng', () => {
  it('nhập kho khác 10 hộp 1.000.000đ vào kho giữ hộ → ghi được, thành tiền 0, không bút toán', async () => {
    const r = await call(ctx, 'POST', '/api/v1/documents', stock('GH-N1', 'increase', 10, 1000000, 'K4NB'));
    expect(r.body.data?.status, JSON.stringify(r.body).slice(0, 300)).toBe('posted');
    const mv = await movementOf('GH-N1');
    expect(mv.map((m) => [Number(m.qty), Number(m.amount ?? 0)])).toEqual([[10, 0]]);
    expect(await ledgerOf('GH-N1')).toBe(0);
  });

  it('xuất kho khác 4 hộp khỏi kho giữ hộ → không bút toán', async () => {
    const r = await call(ctx, 'POST', '/api/v1/documents', stock('GH-X1', 'decrease', 4, 300000, 'K4NB'));
    expect(r.body.data?.status, JSON.stringify(r.body).slice(0, 300)).toBe('posted');
    expect(await ledgerOf('GH-X1')).toBe(0);
  });

  it('chuyển kho giữ hộ ↔ kho của đơn vị → chặn cả hai chiều; giữ hộ → giữ hộ cùng loại không chặn ở luật này', async () => {
    for (const [k, from, to] of [['GH-C1', 'K4NB', 'K4'], ['GH-C2', 'K4', 'K4NB']] as const) {
      const r = await call(ctx, 'POST', '/api/v1/documents', transfer(k, from, to));
      expect(JSON.stringify(r.body)).toContain('Không chuyển giữa kho giữ hộ và kho của đơn vị');
    }
  });

  it('bán có tiền từ kho giữ hộ → chặn', async () => {
    const r = await call(ctx, 'POST', '/api/v1/documents', {
      docType: 'sale', docKey: 'GH-B1', branchCode: 'CN01', docNo: 'GH-B1', docDate: '2026-09-07',
      lines: [{ lineKey: 'l1', sku: SKU, name: 'Sữa thử giữ hộ', unit: 'Hộp', qty: 1, amountBeforeTax: 100000, taxCode: '8', taxAmount: 8000, warehouseCode: 'K4NB' }],
      payments: [{ methodCode: 'TM', amount: 108000 }], totals: { beforeTax: 100000, tax: 8000, total: 108000 },
    });
    expect(JSON.stringify(r.body)).toContain('kho hàng nhận giữ hộ — không bán có giá trị');
  });

  it('giá vốn tháng: tồn giữ hộ không kéo đơn giá kho hàng', async () => {
    const nhap = await call(ctx, 'POST', '/api/v1/documents', {
      docType: 'purchase', docKey: 'GH-M1', branchCode: 'CN01', docNo: 'GH-M1', docDate: '2026-09-02', partner: { code: 'NCC-GH', name: 'Nhà cung cấp thử' },
      lines: [{ lineKey: 'l1', sku: SKU, name: 'Sữa thử giữ hộ', unit: 'Hộp', qty: 10, amountBeforeTax: 500000, taxCode: '8', taxAmount: 0, warehouseCode: 'K4' }],
      totals: { beforeTax: 500000, tax: 0, total: 500000 },
    });
    expect(nhap.body.data?.status, JSON.stringify(nhap.body).slice(0, 300)).toBe('posted');
    const r = await call(ctx, 'POST', '/api/v1/inventory/costing', { period: '2026-09' });
    expect(r.status, JSON.stringify(r.body).slice(0, 300)).toBe(200);
    const c = (await call(ctx, 'GET', `/api/v1/inventory/costs?period=2026-09&search=${SKU}`)).body.data as { whType: string; unitCost: number; closingQty: number }[];
    const hang = c.find((x) => x.whType === '')!;
    expect(hang.unitCost).toBeCloseTo(50000, 3);
    expect(hang.closingQty).toBe(10);
    expect(c.find((x) => x.whType === 'KNB')).toMatchObject({ closingQty: 6, unitCost: 0 });
  });
});
