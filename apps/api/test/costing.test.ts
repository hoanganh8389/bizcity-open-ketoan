/**
 * Giá vốn bình quân tháng + báo cáo kho. Kịch bản (một nhóm tính giá: CN01 và CN02 cùng chưa gán đơn vị):
 *   09/2026  CN01 nhập 10 hộp × 70.000                         → đơn giá tháng 9 = 70.000
 *   10/2026  CN01 nhập 10 hộp × 76.000; chuyển 5 hộp sang CN02 (chưa có giá);
 *            CN02 bán 3, CN01 bán 2 (chưa có giá vốn); CN02 kiểm kê thiếu 1 (chưa có giá)
 *            đơn giá tháng 10 = (700.000 + 760.000) / (10 + 10) = 73.000; tồn cuối 14 hộp = 1.022.000
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { sql } from 'kysely';
import { db } from '../src/db/client.js';
import { call, setupTenant, type TestCtx } from './helpers.js';

let ctx: TestCtx;
let tenantId: string;

const post = (doc: unknown) => call(ctx, 'POST', '/api/v1/documents', doc);
const purchase = (key: string, date: string, qty: number, amount: number) => ({
  docType: 'purchase', docKey: key, branchCode: 'CN01', docNo: key, docDate: date,
  partner: { code: 'NCC-01', name: 'Nhà cung cấp 01' },
  lines: [{ lineKey: 'l1', sku: 'SUA01', name: 'Sữa bột 900g', unit: 'Hộp', qty, amountBeforeTax: amount, taxCode: 'V08', taxAmount: 0 }],
  totals: { beforeTax: amount, tax: 0, total: amount },
});
const sale = (key: string, branch: string, qty: number) => ({
  docType: 'sale', docKey: key, branchCode: branch, docNo: key, docDate: '2026-10-04',
  lines: [{ lineKey: 'l1', sku: 'SUA01', name: 'Sữa bột 900g', unit: 'Hộp', qty, amountBeforeTax: qty * 100000, taxCode: 'R08', taxAmount: qty * 8000 }],
  payments: [{ methodCode: 'TM', amount: qty * 108000 }],
  totals: { beforeTax: qty * 100000, tax: qty * 8000, total: qty * 108000 },
});

async function balance(account: string, branch?: string) {
  const res = await sql<{ v: string | null }>`
    SELECT SUM(l.debit - l.credit) AS v FROM ledger_lines l JOIN branches br ON br.id = l.branch_id
     WHERE l.tenant_id = ${tenantId} AND l.account_code = ${account} ${branch ? sql`AND br.code = ${branch}` : sql``}`.execute(db);
  return Number(res.rows[0]?.v ?? 0);
}

beforeAll(async () => {
  ctx = await setupTenant();
  tenantId = (await db.selectFrom('tenants').select('id').where('code', '=', ctx.tenantCode).executeTakeFirstOrThrow()).id;
  await call(ctx, 'POST', '/api/v1/branches', { code: 'CN02', name: 'Cửa hàng 02' });
  for (const d of [
    purchase('NM-09', '2026-09-05', 10, 700000),
    purchase('NM-10', '2026-10-02', 10, 760000),
    { docType: 'transfer', docKey: 'CK-10', branchCode: 'CN01', toBranchCode: 'CN02', docNo: 'CK-10', docDate: '2026-10-03', status: 'received', lines: [{ lineKey: 'l1', sku: 'SUA01', qty: 5, amount: 0 }], totals: { total: 0 } },
    sale('BAN-CN02', 'CN02', 3),
    sale('BAN-CN01', 'CN01', 2),
    { docType: 'stock_adjustment', docKey: 'KK-10', branchCode: 'CN02', docNo: 'KK-10', docDate: '2026-10-20', direction: 'decrease', lines: [{ lineKey: 'l1', sku: 'SUA01', qty: 1, amount: 0 }], totals: { total: 0 } },
  ]) {
    const r = await post(d);
    expect(r.body.data.status, JSON.stringify(r.body)).toBe('posted');
  }
});
afterAll(async () => {
  await ctx.app.close();
});

describe('Tính giá vốn bình quân tháng', () => {
  it('tính luôn tháng 9 còn thiếu, đơn giá tháng 10 = 73.000, ghi sổ từng chi nhánh', async () => {
    const res = await call(ctx, 'POST', '/api/v1/inventory/costing', { period: '2026-10' });
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    const r = res.body.data;
    expect(r.monthsComputed).toEqual(['2026-09', '2026-10']);
    // Mỗi chi nhánh MỘT phiếu giá vốn tháng (phiếu bán / chuyển / điều chỉnh không mang giá vốn).
    expect(r.branches).toEqual([
      { branchCode: 'CN01', status: 'posted', docNo: 'GV 10/2026 CN01', total: 146000 + 365000, filled: 0, filledTotal: 0 },
      { branchCode: 'CN02', status: 'posted', docNo: 'GV 10/2026 CN02', total: 365000 + 219000 + 73000, filled: 0, filledTotal: 0 },
    ]);
    // Phiếu giá vốn liệt kê từng mã hàng: CN01 bán 2 (6321 / 1561) + chuyển đi 5 (1579 / 1561), dòng nào cũng mang mã.
    const gv = await sql<{ account: string; debit: string; credit: string; sku: string | null }>`
      SELECT l.account_code AS account, l.debit, l.credit, l.product_sku AS sku
        FROM ledger_lines l JOIN ledger_entries e ON e.id = l.entry_id JOIN accounting_events d ON d.id = e.event_id
       WHERE d.tenant_id = ${tenantId} AND d.doc_key = 'cogs:CN01:2026-10' AND e.status = 'posted' AND NOT e.is_reversal
       ORDER BY l.line_no`.execute(db);
    expect(gv.rows.map((x) => [x.account, Number(x.debit), Number(x.credit), x.sku])).toHaveLength(4);
    expect(gv.rows.map((x) => [x.account, Number(x.debit), Number(x.credit), x.sku])).toEqual(expect.arrayContaining([
      ['6321', 146000, 0, 'SUA01'], ['1561', 0, 146000, 'SUA01'], ['1579', 365000, 0, 'SUA01'], ['1561', 0, 365000, 'SUA01'],
    ]));
    // Phiếu bán không còn dòng giá vốn.
    const sold = await sql<{ n: string }>`
      SELECT COUNT(*) AS n FROM ledger_lines l JOIN ledger_entries e ON e.id = l.entry_id JOIN accounting_events d ON d.id = e.event_id
       WHERE d.tenant_id = ${tenantId} AND d.doc_key = 'BAN-CN01' AND l.part = 'cogs'`.execute(db);
    expect(Number(sold.rows[0]!.n)).toBe(0);

    const costs = await call(ctx, 'GET', '/api/v1/inventory/costs?period=2026-10');
    expect(costs.body.data).toEqual([expect.objectContaining({ sku: 'SUA01', openingQty: 10, openingValue: 700000, inQty: 10, inValue: 760000, unitCost: 73000, outQty: 6, closingQty: 14, closingValue: 1022000 })]);
  });

  it('sổ sau khi tính: giá vốn 6321, hàng đang chuyển về 0, tồn kho khớp bảng giá vốn', async () => {
    expect(await balance('6321', 'CN01')).toBe(146000);
    expect(await balance('6321', 'CN02')).toBe(219000);
    expect(await balance('1381', 'CN02')).toBe(73000);
    expect(await balance('1579')).toBe(0);
    expect(await balance('1561')).toBe(1022000);
  });

  it('tính lại: đảo bút toán phiếu giá vốn cũ, ghi phiếu mới (phiên bản 2), số dư không đổi', async () => {
    const res = await call(ctx, 'POST', '/api/v1/inventory/costing', { period: '2026-10' });
    expect(res.body.data.monthsComputed).toEqual(['2026-10']);
    expect(res.body.data.branches.map((b: any) => b.status)).toEqual(['posted', 'posted']);
    expect(await balance('1561')).toBe(1022000);
    expect(await balance('6321')).toBe(365000);
    const v = await sql<{ version: number }>`SELECT version FROM accounting_events WHERE tenant_id = ${tenantId} AND doc_key = 'cogs:CN01:2026-10'`.execute(db);
    expect(Number(v.rows[0]!.version)).toBe(2);
  });

  it('không còn dòng chờ giá vốn trên phiếu; dòng sổ vẫn không sửa tay được', async () => {
    const slots = await sql<{ n: string }>`SELECT COUNT(*) AS n FROM ledger_lines WHERE tenant_id = ${tenantId} AND cost_fill IS NOT NULL`.execute(db);
    expect(Number(slots.rows[0]!.n)).toBe(0);
    const plain = await sql<{ id: string }>`SELECT id FROM ledger_lines WHERE tenant_id = ${tenantId} AND cost_fill IS NULL LIMIT 1`.execute(db);
    await expect(db.transaction().execute(async (trx) => {
      await sql`SELECT set_config('ketoan.cost_overwrite', 'on', true)`.execute(trx);
      await sql`UPDATE ledger_lines SET debit = debit + 1 WHERE id = ${plain.rows[0]!.id}`.execute(trx);
    })).rejects.toThrow(/chỉ được thêm/);
  });
});

describe('Báo cáo kho', () => {
  it('nhập xuất tồn tháng 10 của CN02', async () => {
    const res = await call(ctx, 'GET', '/api/v1/inventory/stock-movement?from=2026-10-01&to=2026-10-31&branchCodes=CN02');
    expect(res.body.data.rows).toEqual([
      expect.objectContaining({ branchCode: 'CN02', sku: 'SUA01', openingQty: 0, inQty: 5, inValue: 365000, outQty: 4, outValue: 292000, closingQty: 1, closingValue: 73000, uncosted: 0, purchaseQty: 0, cogsQty: 3, cogsValue: 219000 }),
    ]);
  });

  it('gom theo phân loại hàng: nhập xuất tồn, mua hàng, giá vốn; gom theo nhà cung cấp chỉ có mua hàng', async () => {
    await call(ctx, 'PUT', '/api/v1/products', { products: [{ sku: 'SUA01', brandCode: 'ABB', brandName: 'Abbott' }] });
    const brand = (await call(ctx, 'GET', '/api/v1/inventory/stock-summary?from=2026-10-01&to=2026-10-31&groupBy=brand')).body.data;
    expect(brand.purchaseOnly).toBe(false);
    expect(brand.rows).toEqual([expect.objectContaining({
      key: 'ABB', label: 'Abbott', skuCount: 1, openingQty: 10, openingValue: 700000, inQty: 15, inValue: 1125000, outQty: 11, outValue: 803000,
      closingQty: 14, closingValue: 1022000, purchaseQty: 10, purchaseValue: 760000, cogsQty: 5, cogsValue: 365000,
    })]);
    const byBranch = (await call(ctx, 'GET', '/api/v1/inventory/stock-summary?from=2026-10-01&to=2026-10-31&groupBy=branch')).body.data.rows;
    expect(byBranch.map((r: { key: string; closingQty: number }) => [r.key, r.closingQty])).toEqual([['CN01', 13], ['CN02', 1]]);
    const sup = (await call(ctx, 'GET', '/api/v1/inventory/stock-summary?from=2026-10-01&to=2026-10-31&groupBy=supplier')).body.data;
    expect(sup.purchaseOnly).toBe(true);
    expect(sup.rows).toEqual([expect.objectContaining({ key: 'NCC-01', label: 'Nhà cung cấp 01', purchaseQty: 10, purchaseValue: 760000, openingQty: 0 })]);
  });

  it('sổ chi tiết hàng hoá CN01: tồn đầu từ tháng 9, từng lần vào / ra, tồn cuối', async () => {
    const res = await call(ctx, 'GET', '/api/v1/inventory/item-ledger?sku=SUA01&from=2026-10-01&to=2026-10-31&branchCodes=CN01');
    const d = res.body.data;
    expect(d.opening).toEqual({ qty: 10, value: 700000 });
    expect(d.rows.map((r: any) => [r.kindLabel, r.inQty - r.outQty, r.inValue - r.outValue])).toEqual([
      ['Nhập mua', 10, 760000],
      ['Chuyển kho đi', -5, -365000],
      ['Xuất bán', -2, -146000],
    ]);
    expect(d.closing).toEqual({ qty: 13, value: 949000 });
  });

  it('danh sách mặt hàng để chọn: tìm theo mã, mã đã có phát sinh kho', async () => {
    const all = await call(ctx, 'GET', '/api/v1/inventory/items?search=sua');
    expect(all.status).toBe(200);
    expect(all.body.data.map((x: any) => x.sku)).toContain('SUA01');
    const one = await call(ctx, 'GET', '/api/v1/inventory/items?search=SUA01&limit=5');
    expect(one.body.data.every((x: any) => x.sku.includes('SUA01') || x.name.toLowerCase().includes('sua01'))).toBe(true);
  });

  it('nhật ký mua hàng: tiền hàng vào cột hàng hoá', async () => {
    const res = await call(ctx, 'GET', '/api/v1/reports/purchase-journal?from=2026-10-01&to=2026-10-31');
    expect(res.status).toBe(200);
    expect(res.body.data.totals).toEqual({ goods: 760000, materials: 0, tools: 0, other: 0, total: 760000 });
  });
});

describe('Báo cáo hàng hoá: lãi gộp, chuyển kho, kết quả theo cửa hàng', () => {
  it('lãi gộp theo mặt hàng, chi nhánh: giá vốn = số lượng × đơn giá vốn tháng', async () => {
    const byItem = (await call(ctx, 'GET', '/api/v1/reports/gross-profit?from=2026-10-01&to=2026-10-31&groupBy=product')).body.data;
    expect(byItem.rows).toEqual([expect.objectContaining({ key: 'SUA01', qty: 5, revenue: 500000, cost: 365000, gross: 135000, margin: 27, uncosted: 0 })]);
    const byBranch = (await call(ctx, 'GET', '/api/v1/reports/gross-profit?from=2026-10-01&to=2026-10-31&groupBy=branch')).body.data.rows;
    expect(byBranch.map((r: { key: string; revenue: number; cost: number }) => [r.key, r.revenue, r.cost])).toEqual([['CN01', 200000, 146000], ['CN02', 300000, 219000]]);
  });

  it('bảng kê chuyển kho: xuất CN01 → nhận CN02, đã nhận đủ', async () => {
    const d = (await call(ctx, 'GET', '/api/v1/reports/stock-transfers?from=2026-10-01&to=2026-10-31')).body.data;
    expect(d.rows).toEqual([expect.objectContaining({ docNo: 'CK-10', fromBranch: 'CN01', toBranch: 'CN02', sku: 'SUA01', outQty: 5, inQty: 5, pendingQty: 0, outValue: 365000, status: 'received' })]);
    expect((await call(ctx, 'GET', '/api/v1/reports/stock-transfers?from=2026-10-01&to=2026-10-31&status=pending')).body.data.rows).toHaveLength(0);
  });

  it('kết quả kinh doanh theo chi nhánh từ sổ cái: doanh thu, giá vốn, lãi gộp', async () => {
    const d = (await call(ctx, 'GET', '/api/v1/reports/profit-by-department?from=2026-10-01&to=2026-10-31&by=branch')).body.data;
    expect(d.rows.find((r: { key: string }) => r.key === 'CN02')).toMatchObject({ revenue: 300000, cogs: 219000, gross: 81000 });
    expect(d.totals).toMatchObject({ revenue: 500000, netRevenue: 500000 });
    const byDep = (await call(ctx, 'GET', '/api/v1/reports/profit-by-department?from=2026-10-01&to=2026-10-31')).body.data;
    expect(byDep.rows.map((r: { key: string; name: string }) => [r.key, r.name])).toEqual([['', '(chưa gắn bộ phận)']]);
  });
});

// Chạy cuối cùng: thêm phiếu nhập làm đổi đơn giá tháng 10 (các báo cáo bên trên dựa trên số liệu gốc).
describe('Tính lại khi đơn giá đổi', () => {
  it('đơn giá đổi (thêm phiếu nhập cùng tháng) rồi tính lại: phiếu giá vốn ghi số mới, số dư ngày khớp dòng sổ', async () => {
    const r = await post(purchase('NM-10B', '2026-10-02', 10, 820000));
    expect(r.body.data.status, JSON.stringify(r.body)).toBe('posted');
    await call(ctx, 'POST', '/api/v1/inventory/costing', { period: '2026-10' });
    // Đơn giá mới = (700.000 + 760.000 + 820.000) / 30 = 76.000 → CN01 bán 2 = 152.000.
    expect(await balance('6321', 'CN01')).toBe(152000);
    expect(await balance('1579')).toBe(0);
    const daily = await sql<{ v: string | null }>`
      SELECT SUM(debit - credit) AS v FROM ledger_balances_daily WHERE tenant_id = ${tenantId} AND account_code = '6321'`.execute(db);
    expect(Number(daily.rows[0]!.v)).toBe(await balance('6321'));
  });
});

describe('Giá vốn tháng nhập từ Excel (chạy song song với phần mềm đang dùng)', () => {
  const run = (body: object) => call(ctx, 'POST', '/api/v1/inventory/costing', { period: '2026-10', ...body });
  it('mã có trong tệp dùng đúng giá đó cho mọi chi nhánh (phiếu giá vốn tháng); mã trùng lấy giá khác 0', async () => {
    const res = await run({ imported: [{ sku: 'SUA01', unitCost: 0, name: 'Sữa bột 900g' }, { sku: 'SUA01', unitCost: 80000.5 }, { sku: 'KHAC01', unitCost: 1000 }] });
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(res.body.data.imported).toEqual({ count: 2, missing: [], missingCount: 0 });
    expect(await balance('6321', 'CN01')).toBe(160001); // 2 × 80.000,5
    expect(await balance('6321', 'CN02')).toBe(240002); // 3 × 80.000,5 (làm tròn theo từng phiếu)
    const costs = (await call(ctx, 'GET', '/api/v1/inventory/costs?period=2026-10')).body.data;
    expect(costs.find((c: any) => c.sku === 'SUA01')).toMatchObject({ unitCost: 80000.5, costSource: 'import' });
    expect(costs.find((c: any) => c.sku === 'KHAC01')).toMatchObject({ unitCost: 1000, costSource: 'import', outQty: 0 });
  });

  it('tính lại không kèm tệp: giữ giá đã nhập', async () => {
    await run({});
    expect(await balance('6321', 'CN01')).toBe(160001);
  });

  it('tệp thiếu mã có xuất trong tháng: báo danh sách, mã đó tính bình quân', async () => {
    const res = await run({ imported: [{ sku: 'KHAC01', unitCost: 1000 }] });
    expect(res.body.data.imported).toEqual({ count: 1, missing: ['SUA01'], missingCount: 1 });
    expect(await balance('6321', 'CN01')).toBe(152000);
  });

  it('bỏ giá đã nhập: quay về tính bình quân cho mọi mã', async () => {
    const res = await run({ clearImport: true });
    expect(res.body.data.imported).toBeNull();
    const costs = (await call(ctx, 'GET', '/api/v1/inventory/costs?period=2026-10')).body.data;
    expect(costs.every((c: any) => c.costSource === 'computed')).toBe(true);
    expect(await balance('6321', 'CN01')).toBe(152000);
  });
  it('tệp xuất từ thẻ kho (mã lặp nhiều dòng, giá khác nhau): lấy giá khác 0 xuất hiện nhiều nhất', async () => {
    const rows = [0, 625000, 434442.8361, 434442.8361, 434442.8361, 625000].map((unitCost) => ({ sku: 'SUA01', unitCost }));
    await run({ imported: rows });
    const costs = (await call(ctx, 'GET', '/api/v1/inventory/costs?period=2026-10')).body.data;
    expect(costs.find((c: any) => c.sku === 'SUA01')).toMatchObject({ unitCost: 434442.8361, costSource: 'import' });
    expect(await balance('6321', 'CN01')).toBe(868886); // 2 × 434.442,8361
    await run({ clearImport: true });
  });
  it('phiếu giá vốn luôn tính cả tháng (khoảng ngày trong tháng vẫn nhận nhưng không chia phiếu); khoảng ngoài tháng báo lỗi', async () => {
    const res = await run({ imported: [{ sku: 'SUA01', unitCost: 90000 }], from: '2026-10-10', to: '2026-10-31' });
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(await balance('6321', 'CN01')).toBe(180000); // 2 × 90.000 — cả tháng
    expect(await balance('1381', 'CN02')).toBe(90000);
    expect((await run({ from: '2026-09-25', to: '2026-10-31' })).status).toBe(400);
    await run({ clearImport: true });
    expect(await balance('1381', 'CN02')).toBe(76000);
  });
});
