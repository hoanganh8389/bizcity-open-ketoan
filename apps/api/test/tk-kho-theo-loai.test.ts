/**
 * [2026-11-13 Nguyễn Văn Thủy] TK kho theo loại kho (đóng góp)
 * Dòng nhập / xuất ở kho thuộc loại có khai TK kho chi tiết → ghi vào TK đó, ưu tiên hơn Tài khoản ngầm định.
 * Loại khai TK tổng hợp (156) hoặc trống → như cũ (TK ngầm định). Khai mới / đổi TK kho phải là TK chi tiết.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { sql } from 'kysely';
import { db } from '../src/db/client.js';
import { call, saleDoc, setupTenant, type TestCtx } from './helpers.js';

let ctx: TestCtx;
let tenantId: string;

beforeAll(async () => {
  ctx = await setupTenant();
  tenantId = (await db.selectFrom('tenants').select('id').where('code', '=', ctx.tenantCode).executeTakeFirstOrThrow()).id;
  await call(ctx, 'POST', '/api/v1/branches', { code: '07000', name: 'CN Yên Bái' });
  await call(ctx, 'POST', '/api/v1/warehouses', { code: '07-HH', branchCode: '07000', name: 'Kho hàng', isDefault: true });
  await call(ctx, 'POST', '/api/v1/warehouses', { code: '07-KM', branchCode: '07000', name: 'Kho khuyến mại', isPromo: true });
});
afterAll(async () => { await ctx.app.close(); });

const doc = (docType: string, key: string, qty: number, warehouseCode?: string) => call(ctx, 'POST', '/api/v1/documents', {
  docType, docKey: key, branchCode: '07000', docNo: key, docDate: '2026-10-03',
  partner: { code: 'NCC-VNM', name: 'Công ty Sữa ABC' },
  lines: [{ lineKey: 'l1', sku: 'SUA01', name: 'Sữa bột', unit: 'Hộp', qty, amountBeforeTax: qty * 100000, taxCode: 'V08', taxAmount: qty * 8000, ...(warehouseCode ? { warehouseCode } : {}) }],
  totals: { beforeTax: qty * 100000, tax: qty * 8000, total: qty * 108000 },
});

/** TK kho (đầu 15) của bút toán chứng từ số `docNo`, kèm chiều. */
async function invLines(docNo: string) {
  const r = await sql<{ account_code: string; debit: string; credit: string }>`
    SELECT l.account_code, l.debit, l.credit FROM ledger_lines l JOIN ledger_entries e ON e.id = l.entry_id
     WHERE l.tenant_id = ${tenantId} AND e.doc_no = ${docNo} AND l.account_code LIKE '15%' ORDER BY l.account_code`.execute(db);
  return r.rows.map((x) => ({ acc: x.account_code, debit: Number(x.debit), credit: Number(x.credit) }));
}

describe('TK kho theo loại kho', () => {
  it('khai TK kho: TK tổng hợp bị chặn, TK chi tiết được; danh sách báo TK tổng hợp cũ', async () => {
    // giữ nguyên giá trị cũ (156) thì lưu được; đổi sang TK không có / TK tổng hợp thì chặn
    expect((await call(ctx, 'PUT', '/api/v1/warehouse-types/KKM', { name: 'Kho khuyến mại', accountPrefix: '9999' })).status).toBe(400);
    expect((await call(ctx, 'PUT', '/api/v1/warehouse-types/KKM', { name: 'Kho khuyến mại', accountPrefix: '1562' })).status).toBe(200);
    expect((await call(ctx, 'PUT', '/api/v1/warehouse-types/KKM', { name: 'Kho khuyến mại', accountPrefix: '156' })).status).toBe(400);
    const types = (await call(ctx, 'GET', '/api/v1/warehouse-types')).body.data.types as { code: string; accountPrefix: string; accountPosting: boolean }[];
    expect(types.find((t) => t.code === 'KKM')).toMatchObject({ accountPrefix: '1562', accountPosting: true });
    const khh = types.find((t) => t.code === 'KHH')!;
    if (khh.accountPrefix === '156') expect(khh.accountPosting).toBe(false); // giá trị gốc cũ: TK tổng hợp → báo, bút toán theo ngầm định
  });

  it('nhập mua vào kho khuyến mại ghi Nợ 1562; kho hàng (TK tổng hợp / trống) theo ngầm định', async () => {
    expect((await doc('purchase', 'NM-KM', 2, '07-KM')).status).toBe(200);
    expect((await doc('purchase', 'NM-HH', 3)).status).toBe(200);
    expect(await invLines('NM-KM')).toEqual([{ acc: '1562', debit: 200000, credit: 0 }]);
    const hh = await invLines('NM-HH');
    expect(hh).toHaveLength(1);
    expect(hh[0]!.acc).not.toBe('1562');
    expect(hh[0]!.debit).toBe(300000);
  });

  it('trả hàng NCC từ kho khuyến mại ghi Có 1562', async () => {
    expect((await doc('purchase_return', 'TL-KM', 1, '07-KM')).status).toBe(200);
    expect(await invLines('TL-KM')).toEqual([{ acc: '1562', debit: 0, credit: 100000 }]);
  });

  it('giá vốn tháng: bán từ kho khuyến mại ghi Có 1562, bán ở kho hàng theo ngầm định', async () => {
    const sale = (key: string, warehouseCode: string) => call(ctx, 'POST', '/api/v1/documents', saleDoc({
      docKey: key, docNo: key, branchCode: '07000', docDate: '2026-10-10', invoice: undefined,
      lines: [{ lineKey: 'l1', sku: 'SUA01', name: 'Sữa bột', unit: 'Hộp', qty: 1, amountBeforeTax: 185185, taxCode: 'R08', taxAmount: 14815, warehouseCode }],
    }));
    expect((await sale('BAN-KM', '07-KM')).status).toBe(200);
    expect((await sale('BAN-HH', '07-HH')).status).toBe(200);
    const run = await call(ctx, 'POST', '/api/v1/inventory/costing', { period: '2026-10' });
    expect(run.status, JSON.stringify(run.body).slice(0, 400)).toBe(200);
    const gv = await sql<{ account_code: string; debit: string; credit: string }>`
      SELECT l.account_code, l.debit, l.credit FROM ledger_lines l JOIN ledger_entries e ON e.id = l.entry_id JOIN accounting_events d ON d.id = e.event_id
       WHERE d.tenant_id = ${tenantId} AND d.doc_key = 'cogs:07000:2026-10' AND e.status = 'posted' AND NOT e.is_reversal AND l.account_code LIKE '15%'`.execute(db);
    const credits = gv.rows.filter((x) => Number(x.credit) > 0).map((x) => x.account_code).sort();
    expect(credits).toHaveLength(2);
    expect(credits).toContain('1562');
    expect(credits.filter((c) => c !== '1562')).toHaveLength(1);
  });

  it('kho mặc định thuộc loại có TK kho: dòng không ghi mã kho cũng theo TK của loại', async () => {
    await call(ctx, 'POST', '/api/v1/branches', { code: '06000', name: 'CN Lai Châu' });
    expect((await call(ctx, 'POST', '/api/v1/warehouses', { code: '06-CL', branchCode: '06000', name: 'Kho chờ lắp', isDefault: true, typeCode: 'KCL' })).status).toBe(201);
    expect((await call(ctx, 'PUT', '/api/v1/warehouse-types/KCL', { name: 'Kho chờ', accountPrefix: '1562' })).status).toBe(200);
    const r = await call(ctx, 'POST', '/api/v1/documents', {
      docType: 'purchase', docKey: 'NM-MD', branchCode: '06000', docNo: 'NM-MD', docDate: '2026-10-03', partner: { code: 'NCC-VNM', name: 'Công ty Sữa ABC' },
      lines: [{ lineKey: 'l1', sku: 'SUA01', name: 'Sữa bột', unit: 'Hộp', qty: 1, amountBeforeTax: 100000, taxCode: 'V08', taxAmount: 8000 }],
      totals: { beforeTax: 100000, tax: 8000, total: 108000 },
    });
    expect(r.status, JSON.stringify(r.body).slice(0, 300)).toBe(200);
    expect(await invLines('NM-MD')).toEqual([{ acc: '1562', debit: 100000, credit: 0 }]);
  });
});
