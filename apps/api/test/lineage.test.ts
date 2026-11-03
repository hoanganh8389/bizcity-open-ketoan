/**
 * Truy vết vòng đời mặt hàng (PHASE-025 W1, ADR-0021, bizcity_lineage@1) — chỉ đọc, dựng từ dữ liệu có sẵn.
 * Kịch bản SUA01 (như costing.test.ts; CN01 và CN02 cùng nhóm tính giá):
 *   09/2026  CN01 nhập 10 × 70.000
 *   10/2026  CN01 nhập 10 × 76.000; chuyển 5 sang CN02; CN02 bán 3; CN01 bán 2; CN02 kiểm kê thiếu 1
 *            đơn giá tháng 10 = (700.000 + 760.000) ÷ (10 + 10) = 73.000
 * Kịch bản GIAY01 (hàng trả): nhập 10 × 50.000, bán 4, khách trả 1 CÓ chứng từ gốc, trả 1 KHÔNG có chứng từ gốc.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { call, setupTenant, type TestCtx } from './helpers.js';

let ctx: TestCtx;
const post = (doc: unknown) => call(ctx, 'POST', '/api/v1/documents', doc);
const line = (sku: string, name: string, qty: number, amount: number) => ({ lineKey: 'l1', sku, name, unit: 'Hộp', qty, amountBeforeTax: amount, taxCode: 'R08', taxAmount: 0 });
const purchase = (key: string, date: string, sku: string, qty: number, amount: number) => ({
  docType: 'purchase', docKey: key, branchCode: 'CN01', docNo: key, docDate: date, partner: { code: 'NCC-01', name: 'Nhà cung cấp 01' },
  lines: [{ ...line(sku, sku, qty, amount), taxCode: 'V08' }], totals: { beforeTax: amount, tax: 0, total: amount },
});
const sale = (key: string, branch: string, sku: string, qty: number, date = '2026-10-04') => ({
  docType: 'sale', docKey: key, branchCode: branch, docNo: key, docDate: date,
  lines: [{ ...line(sku, sku, qty, qty * 100000), taxAmount: qty * 8000 }], payments: [{ methodCode: 'TM', amount: qty * 108000 }],
  totals: { beforeTax: qty * 100000, tax: qty * 8000, total: qty * 108000 },
});
const saleReturn = (key: string, sku: string, original?: string) => ({
  docType: 'sale_return', docKey: key, branchCode: 'CN01', docNo: key, docDate: '2026-10-06', ...(original ? { originalDocKey: original } : {}),
  lines: [{ ...line(sku, sku, 1, 100000), taxAmount: 8000 }], payments: [{ methodCode: 'TM', amount: 108000 }], totals: { beforeTax: 100000, tax: 8000, total: 108000 },
});

beforeAll(async () => {
  ctx = await setupTenant();
  await call(ctx, 'POST', '/api/v1/branches', { code: 'CN02', name: 'Cửa hàng 02' });
  for (const d of [
    purchase('NM-09', '2026-09-05', 'SUA01', 10, 700000),
    purchase('NM-10', '2026-10-02', 'SUA01', 10, 760000),
    { docType: 'transfer', docKey: 'CK-10', branchCode: 'CN01', toBranchCode: 'CN02', docNo: 'CK-10', docDate: '2026-10-03', status: 'received', lines: [{ lineKey: 'l1', sku: 'SUA01', qty: 5, amount: 0 }], totals: { total: 0 } },
    sale('BAN-CN02', 'CN02', 'SUA01', 3),
    sale('BAN-CN01', 'CN01', 'SUA01', 2),
    { docType: 'stock_adjustment', docKey: 'KK-10', branchCode: 'CN02', docNo: 'KK-10', docDate: '2026-10-20', direction: 'decrease', lines: [{ lineKey: 'l1', sku: 'SUA01', qty: 1, amount: 0 }], totals: { total: 0 } },
    purchase('NM-G', '2026-10-02', 'GIAY01', 10, 500000),
    sale('BAN-G', 'CN01', 'GIAY01', 4),
    saleReturn('TL-A', 'GIAY01', 'BAN-G'),
    saleReturn('TL-B', 'GIAY01'),
  ]) {
    const r = await post(d);
    expect(r.body.data.status, JSON.stringify(r.body)).toBe('posted');
  }
  const run = await call(ctx, 'POST', '/api/v1/inventory/costing', { period: '2026-10' });
  expect(run.status, JSON.stringify(run.body)).toBe(200);
});
afterAll(async () => {
  await ctx.app.close();
});

describe('Tìm mặt hàng để truy vết', () => {
  it('theo mã (đầu mã), theo tên, không có thì rỗng; mã đúng xếp đầu', async () => {
    expect((await call(ctx, 'GET', '/api/v1/lineage/search?q=SUA')).body.data.map((i: { sku: string }) => i.sku)).toContain('SUA01');
    expect((await call(ctx, 'GET', '/api/v1/lineage/search?q=suA01')).body.data[0].sku).toBe('SUA01');
    expect((await call(ctx, 'GET', '/api/v1/lineage/search?q=khong-co-ma-nay')).body.data).toEqual([]);
  });
});

describe('Hành trình một mặt hàng', () => {
  it('sự kiện kho đủ loại, chuyển kho cùng nhóm là VẬN HÀNH, còn lại là KẾ TOÁN; mỗi sự kiện nối về chứng từ', async () => {
    const r = await call(ctx, 'GET', '/api/v1/lineage/items/SUA01');
    expect(r.status, JSON.stringify(r.body)).toBe(200);
    const d = r.body.data;
    expect(d.coverage.keyedBy).toBe('sku');
    // Theo ngày chứng từ, cùng ngày theo thứ tự ghi.
    expect(d.events.map((e: { docKey: string; kind: string }) => [e.docKey, e.kind])).toEqual([
      ['NM-09', 'purchase'], ['NM-10', 'purchase'], ['CK-10', 'transfer_out'], ['CK-10', 'transfer_in'], ['BAN-CN02', 'sale'], ['BAN-CN01', 'sale'], ['KK-10', 'adjust_out'],
    ]);
    const byKey = (k: string, kind: string) => d.events.find((e: { docKey: string; kind: string }) => e.docKey === k && e.kind === kind);
    expect(byKey('CK-10', 'transfer_out')).toMatchObject({ effect: 'operational', qty: -5, branch: 'CN01', counterBranch: 'CN02' });
    expect(byKey('CK-10', 'transfer_in')).toMatchObject({ effect: 'operational', qty: 5, branch: 'CN02' });
    expect(byKey('NM-10', 'purchase')).toMatchObject({ effect: 'accounting', qty: 10, amount: 760000, docType: 'purchase', status: 'posted' });
    expect(byKey('BAN-CN01', 'sale')).toMatchObject({ effect: 'accounting', qty: -2 });
    expect(d.summary).toMatchObject({ events: 7, operationalEvents: 2, accountingEvents: 5, inQty: 25, outQty: 11 });
  });

  it('bút toán mang mã hàng: có dòng giá vốn 6321 / 1561 của phiếu giá vốn tháng, nối về chứng từ cogs', async () => {
    const d = (await call(ctx, 'GET', '/api/v1/lineage/items/SUA01')).body.data;
    const cogs = d.entries.filter((l: { docKey: string }) => l.docKey === 'cogs:CN01:2026-10');
    expect(cogs.map((l: { account: string; debit: number; credit: number }) => [l.account, l.debit, l.credit])).toEqual(expect.arrayContaining([['6321', 146000, 0], ['1561', 0, 146000]]));
    expect(cogs.every((l: { status: string }) => l.status === 'posted')).toBe(true);
  });

  it('giá vốn từng tháng: tháng 9 = 70.000, tháng 10 = 73.000', async () => {
    const d = (await call(ctx, 'GET', '/api/v1/lineage/items/SUA01')).body.data;
    expect(d.costPeriods.map((c: { period: string; unitCost: number }) => [c.period, c.unitCost])).toEqual([['2026-09', 70000], ['2026-10', 73000]]);
    expect(d.costPeriods[1]).toMatchObject({ openingQty: 10, openingValue: 700000, inQty: 10, inValue: 760000, outQty: 6, closingQty: 14, closingValue: 1022000, source: 'computed' });
  });

  it('lọc theo khoảng ngày và chi nhánh; mặt hàng không có → 404', async () => {
    const oct = (await call(ctx, 'GET', '/api/v1/lineage/items/SUA01?from=2026-10-01&to=2026-10-31')).body.data;
    expect(oct.events.map((e: { docKey: string }) => e.docKey)).not.toContain('NM-09');
    expect(oct.costPeriods.map((c: { period: string }) => c.period)).toEqual(['2026-10']);
    const cn02 = (await call(ctx, 'GET', '/api/v1/lineage/items/SUA01?branch=CN02')).body.data;
    expect(cn02.events.every((e: { branch: string }) => e.branch === 'CN02')).toBe(true);
    expect((await call(ctx, 'GET', '/api/v1/lineage/items/KHONG-CO')).status).toBe(404);
    expect((await call(ctx, 'GET', '/api/v1/lineage/items/SUA01?from=01/10/2026')).status).toBe(400);
  });

  it('hàng trả: phiếu có chứng từ gốc nối được; phiếu không có chứng từ gốc được nói rõ ở coverage', async () => {
    const d = (await call(ctx, 'GET', '/api/v1/lineage/items/GIAY01')).body.data;
    const ret = d.events.filter((e: { kind: string }) => e.kind === 'sale_return');
    expect(ret.map((e: { docKey: string; originalDocKey: string | null }) => [e.docKey, e.originalDocKey])).toEqual(expect.arrayContaining([['TL-A', 'BAN-G'], ['TL-B', null]]));
    expect(d.coverage.notes.join(' ')).toMatch(/1 phiếu khách trả hàng chưa nối được chứng từ bán gốc/);
    // Tháng 10 đã tính giá vốn → không báo thiếu giá vốn.
    expect(d.coverage.notes.join(' ')).not.toMatch(/chưa tính giá vốn/);
  });
});

describe('Vì sao giá vốn này?', () => {
  it('tháng 10: công thức bằng số thật, so với tháng trước, các phiếu góp vào đúng vai', async () => {
    const r = await call(ctx, 'GET', '/api/v1/lineage/items/SUA01/cost?period=2026-10');
    expect(r.status, JSON.stringify(r.body)).toBe(200);
    const d = r.body.data;
    expect(d).toMatchObject({ computed: true, period: '2026-10', previous: { period: '2026-09', unitCost: 70000 } });
    expect(d.row.unitCost).toBe(73000);
    expect(d.changePct).toBeCloseTo(4.2857, 3);
    const text = d.sentences.join('\n');
    expect(text).toMatch(/700\.000.*760\.000.*73\.000/);
    expect(text).toMatch(/tháng 09\/2026 \(đơn giá 70\.000\): tăng 4,3%/);
    expect(text).toMatch(/Tồn đầu tháng: số lượng 10, giá trị 700\.000 đồng/);
    const role = (key: string) => d.contributions.filter((c: { docKey: string }) => c.docKey === key).map((c: { role: string }) => c.role);
    expect(role('NM-10')).toEqual(['in']);
    expect(role('CK-10')).toEqual(['internal', 'internal']);
    expect(role('BAN-CN01')).toEqual(['out']);
    expect(d.reconcile).toMatchObject({ inQty: 10, inValue: 760000, matchesStored: true });
  });

  it('tháng chưa tính giá vốn: nói rõ, không bịa số; kỳ sai khuôn → 400', async () => {
    expect((await call(ctx, 'GET', '/api/v1/lineage/items/SUA01/cost?period=2026-12')).body.data.sentences[0]).toMatch(/Tháng 12\/2026/);
    const d = (await call(ctx, 'GET', '/api/v1/lineage/items/SUA01/cost?period=2026-12')).body.data;
    expect(d).toMatchObject({ computed: false, row: null });
    expect(d.sentences[0]).toMatch(/chưa có giá vốn/);
    expect((await call(ctx, 'GET', '/api/v1/lineage/items/SUA01/cost?period=10-2026')).status).toBe(400);
  });
});
