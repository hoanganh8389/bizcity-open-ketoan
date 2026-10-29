/**
 * Tài sản (KT-19 … KT-21): kế hoạch khấu hao, hạch toán ghi tăng, ghi giảm / thanh lý.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { call, setupTenant, type TestCtx } from './helpers.js';

let ctx: TestCtx;
beforeAll(async () => {
  ctx = await setupTenant();
  await call(ctx, 'PUT', '/api/v1/partners/NCC-MAY', { name: 'Công ty máy', kind: 'supplier' });
  await call(ctx, 'PUT', '/api/v1/partners/KH-MUA', { name: 'Người mua máy cũ', kind: 'customer' });
  const add = await call(ctx, 'POST', '/api/v1/assets', {
    code: 'MAY01', name: 'Máy tính tiền', kind: 'fixed_asset', categoryCode: 'TS-MAY', branchCode: 'CN01', startDate: '2026-07-01',
    originalCost: 36000000, usefulLifeMonths: 36, assetAccount: '2112', depreciationAccount: '2141', expenseAccount: '6424',
  });
  expect(add.status, JSON.stringify(add.body)).toBe(201);
});
afterAll(async () => {
  await ctx.app.close();
});

const balance = async (account: string) => {
  const tb = (await call(ctx, 'GET', '/api/v1/reports/trial-balance?from=2026-01-01&to=2026-12-31')).body.data;
  const row = (tb.rows ?? tb).find((r: { code: string }) => r.code === account);
  return row ? (row.closingDebit ?? 0) - (row.closingCredit ?? 0) : 0;
};

describe('Kế hoạch khấu hao', () => {
  it('lịch cả vòng đời; tháng đã ghi sổ lấy số đã trích; bảng kế hoạch nhiều tháng', async () => {
    for (const period of ['2026-07', '2026-08']) expect((await call(ctx, 'POST', '/api/v1/assets/depreciation', { period })).status).toBe(200);
    const plan = (await call(ctx, 'GET', '/api/v1/assets/MAY01/plan?')).body.data;
    expect(plan.months).toHaveLength(36);
    expect(plan.months[0]).toMatchObject({ period: '2026-07', amount: 1000000, status: 'posted', accumulated: 1000000 });
    expect(plan.months[2]).toMatchObject({ period: '2026-09', amount: 1000000 });
    expect(plan.months.at(-1)).toMatchObject({ period: '2029-06', remaining: 0, accumulated: 36000000 });

    const grid = (await call(ctx, 'GET', '/api/v1/assets/plan?from=2026-08&months=3')).body.data;
    expect(grid.periods).toEqual(['2026-08', '2026-09', '2026-10']);
    expect(grid.rows[0]).toMatchObject({ code: 'MAY01', accumulatedBefore: 1000000, amounts: [1000000, 1000000, 1000000], total: 3000000 });
    expect(grid.rows[0].statuses[0]).toBe('posted');
    expect(grid.totals).toEqual([1000000, 1000000, 1000000]);
  });
});

describe('Kế hoạch khấu hao: tháng được dồn', () => {
  it('các tháng đã dồn vào lần trích bổ sung không bị tính là chưa trích', async () => {
    expect((await call(ctx, 'POST', '/api/v1/assets', {
      code: 'TU01', name: 'Tủ', kind: 'fixed_asset', categoryCode: 'TS-MAY', branchCode: 'CN01', startDate: '2026-01-01',
      originalCost: 1200000, usefulLifeMonths: 12, assetAccount: '2135', depreciationAccount: '2143', expenseAccount: '6424',
    })).status).toBe(201);
    expect((await call(ctx, 'POST', '/api/v1/assets/depreciation', { period: '2026-04', catchUp: true })).status).toBe(200);
    const plan = (await call(ctx, 'GET', '/api/v1/assets/TU01/plan?')).body.data;
    // Tháng 1–3 đã nằm trong lần trích tháng 4; tháng 5 trở đi chưa trích hoặc kế hoạch.
    expect(plan.months.filter((m: { period: string }) => m.period < '2026-04')).toEqual([]);
    expect(plan.months[0]).toMatchObject({ period: '2026-04', amount: 400000, status: 'posted', accumulated: 400000 });
    expect(plan.months).toHaveLength(9);
  });
});

describe('Hạch toán ghi tăng, ghi giảm / thanh lý', () => {
  it('ghi tăng: Nợ 2112 / Có 33111 bằng phiếu kế toán', async () => {
    const sug = (await call(ctx, 'GET', '/api/v1/assets/MAY01/posting-suggestion?kind=increase&date=2026-07-01')).body.data;
    expect(sug.lines).toEqual([expect.objectContaining({ debitAccount: '2112', amount: 36000000 })]);
    const r = await call(ctx, 'POST', '/api/v1/assets/MAY01/postings', {
      kind: 'increase', docDate: '2026-07-01', description: 'Mua máy tính tiền', partnerCode: 'NCC-MAY',
      lines: [{ ...sug.lines[0], creditAccount: '33111' }],
    });
    expect(r.status, JSON.stringify(r.body)).toBe(201);
    expect(await balance('2112')).toBe(36000000);
    const again = (await call(ctx, 'GET', '/api/v1/assets/MAY01/posting-suggestion?kind=increase&date=2026-07-01')).body.data;
    expect(again.warnings).toEqual([expect.stringContaining(`Đã hạch toán ghi tăng ở phiếu ${r.body.data.docNo}`)]);
  });

  it('ghi giảm có thanh lý: xoá nguyên giá, luỹ kế; giá trị còn lại vào 8111; giá bán vào 7111 kèm thuế; thẻ thôi trích', async () => {
    const sug = (await call(ctx, 'GET', '/api/v1/assets/MAY01/posting-suggestion?kind=decrease&date=2026-09-15')).body.data;
    expect(sug.lines).toEqual([
      expect.objectContaining({ debitAccount: '2141', creditAccount: '2112', amount: 2000000 }),
      expect.objectContaining({ debitAccount: '8111', creditAccount: '2112', amount: 34000000 }),
    ]);
    expect(sug.warnings).toEqual([]);
    const r = await call(ctx, 'POST', '/api/v1/assets/MAY01/postings', {
      kind: 'decrease', docDate: '2026-09-15', description: 'Thanh lý máy tính tiền', salePrice: 5000000,
      lines: [...sug.lines, { debitAccount: '1311', creditAccount: '7111', amount: 5000000, partnerCode: 'KH-MUA', description: 'Giá bán thanh lý', taxCode: 'R10', taxAmount: 500000 }],
    });
    expect(r.status, JSON.stringify(r.body)).toBe(201);
    expect(await balance('2112')).toBe(0);
    expect(await balance('2141')).toBe(0);
    expect(await balance('8111')).toBe(34000000);
    expect(await balance('7111')).toBe(-5000000);
    expect(await balance('33311')).toBe(-500000);
    const card = (await call(ctx, 'GET', '/api/v1/assets?kind=fixed_asset')).body.data.find((a: { code: string }) => a.code === 'MAY01');
    expect(card).toMatchObject({ status: 'disposed', disposedDate: '2026-09-15' });
    const events = (await call(ctx, 'GET', '/api/v1/asset-events?assetCode=MAY01')).body.data;
    expect(events.map((e: { kind: string }) => e.kind).sort()).toEqual(['decrease', 'increase']);
  });
});

describe('Thông số, ảnh tài sản', () => {
  it('ghi thông số; sửa thẻ không gửi thông số thì giữ nguyên; ảnh ghi / bỏ riêng', async () => {
    const card = { code: 'TL01', name: 'Tủ lạnh trưng bày', kind: 'fixed_asset', categoryCode: 'TS-MAY', branchCode: 'CN01', startDate: '2026-10-01', originalCost: 24000000, usefulLifeMonths: 36, assetAccount: '2112', depreciationAccount: '2141', expenseAccount: '6424' };
    expect((await call(ctx, 'POST', '/api/v1/assets', { ...card, specs: [{ name: 'Kích thước', value: '60 x 70 x 180 cm' }, { name: 'Điện năng tiêu thụ', value: '350 W' }] })).status).toBe(201);
    expect((await call(ctx, 'PUT', '/api/v1/assets/TL01', { ...card, name: 'Tủ lạnh trưng bày 2 cánh' })).status).toBe(200);
    const row = (await call(ctx, 'GET', '/api/v1/assets?kind=fixed_asset')).body.data.find((a: { code: string }) => a.code === 'TL01');
    expect(row).toMatchObject({ name: 'Tủ lạnh trưng bày 2 cánh', hasPhoto: false, specs: [{ name: 'Kích thước', value: '60 x 70 x 180 cm' }, { name: 'Điện năng tiêu thụ', value: '350 W' }] });
    const png = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PzWvWQAAAABJRU5ErkJggg==';
    expect((await call(ctx, 'PUT', '/api/v1/assets/TL01/photo', { photo: png })).status).toBe(200);
    expect((await call(ctx, 'GET', '/api/v1/assets/TL01/photo')).body.data.photo).toBe(png);
    expect((await call(ctx, 'PUT', '/api/v1/assets/TL01/photo', { photo: 'data:text/html;base64,PGI+' })).status).toBe(400);
    expect((await call(ctx, 'GET', '/api/v1/assets?kind=fixed_asset')).body.data.find((a: { code: string }) => a.code === 'TL01').hasPhoto).toBe(true);
  });
});

describe('Điều chuyển giữa hai đơn vị hạch toán (FA-004)', () => {
  it('khác đơn vị: hai phiếu qua phải thu / phải trả nội bộ; không hạch toán hai lần; đã hạch toán thì không xoá được lần điều chuyển', async () => {
    expect((await call(ctx, 'POST', '/api/v1/branches', { code: 'CN03', name: 'Cửa hàng 03', accountingUnitCode: 'DV03' })).status).toBe(201);
    const add = await call(ctx, 'POST', '/api/v1/assets', {
      code: 'MAY02', name: 'Tủ mát', kind: 'fixed_asset', categoryCode: 'TS-MAY', branchCode: 'CN01', startDate: '2026-07-01',
      originalCost: 24000000, usefulLifeMonths: 24, assetAccount: '2112', depreciationAccount: '2141', expenseAccount: '6424',
    });
    expect(add.status, JSON.stringify(add.body)).toBe(201);
    expect((await call(ctx, 'POST', '/api/v1/assets/MAY02/events', { kind: 'transfer', date: '2026-10-10', docNo: 'DC-02', toBranchCode: 'CN03' })).status).toBe(201);
    const ev = (await call(ctx, 'GET', '/api/v1/asset-events?assetCode=MAY02&kind=transfer')).body.data[0];
    const sug = (await call(ctx, 'GET', `/api/v1/asset-events/${ev.id}/transfer-posting`)).body.data;
    expect(sug).toMatchObject({ sameUnit: false, accumulated: 3000000, remaining: 21000000 });
    expect(sug.warnings.join(' ')).toContain('nên tính khấu hao');
    expect(sug.parts[0]).toMatchObject({ branchCode: 'CN01', lines: [{ debitAccount: '2141', creditAccount: '2112', amount: 3000000 }, { debitAccount: '13681', creditAccount: '2112', amount: 21000000, partnerCode: 'CN-CN03' }] });
    expect(sug.parts[1]).toMatchObject({ branchCode: 'CN03', lines: [{ debitAccount: '2112', creditAccount: '2141', amount: 3000000 }, { debitAccount: '2112', creditAccount: '33681', amount: 21000000, partnerCode: 'CN-CN01' }] });

    const r = await call(ctx, 'POST', `/api/v1/asset-events/${ev.id}/transfer-posting`, {});
    expect(r.status, JSON.stringify(r.body)).toBe(201);
    expect(r.body.data.postings.map((p: { branchCode: string }) => p.branchCode)).toEqual(['CN01', 'CN03']);
    expect((await call(ctx, 'POST', `/api/v1/asset-events/${ev.id}/transfer-posting`, {})).status).toBe(409);
    expect((await call(ctx, 'GET', '/api/v1/asset-events?assetCode=MAY02&kind=transfer')).body.data[0].postings).toHaveLength(2);
    expect((await call(ctx, 'DELETE', `/api/v1/asset-events/${ev.id}`)).status).toBe(409);
  });

  it('cùng đơn vị hạch toán: không ghi sổ', async () => {
    expect((await call(ctx, 'POST', '/api/v1/branches', { code: 'CN04', name: 'Cửa hàng 04' })).status).toBe(201);
    await call(ctx, 'POST', '/api/v1/assets', {
      code: 'MAY03', name: 'Kệ', kind: 'fixed_asset', categoryCode: 'TS-MAY', branchCode: 'CN01', startDate: '2026-07-01',
      originalCost: 12000000, usefulLifeMonths: 24, assetAccount: '2112', depreciationAccount: '2141', expenseAccount: '6424',
    });
    await call(ctx, 'POST', '/api/v1/assets/MAY03/events', { kind: 'transfer', date: '2026-10-10', toBranchCode: 'CN04' });
    const ev = (await call(ctx, 'GET', '/api/v1/asset-events?assetCode=MAY03&kind=transfer')).body.data[0];
    expect((await call(ctx, 'GET', `/api/v1/asset-events/${ev.id}/transfer-posting`)).body.data.sameUnit).toBe(true);
    expect((await call(ctx, 'POST', `/api/v1/asset-events/${ev.id}/transfer-posting`, {})).status).toBe(400);
  });
});
