/**
 * Kiểm thử: khấu hao / phân bổ (công thức và ghi sổ), tách ngắn hạn / dài hạn trên B01,
 * tờ khai thuế GTGT 01/GTGT, thuyết minh B09.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { call, saleDoc, setupTenant, type TestCtx } from './helpers.js';
import { chargeFor, splitByDays, splitByPercent, type DepreciableAsset } from '../src/modules/assets/depreciation.js';
import { computeForm } from '../src/phan-he/thue/statements/vat-return.service.js';

const asset = (over: Partial<DepreciableAsset> = {}): DepreciableAsset => ({
  startDate: '2026-01-01', originalCost: 12_000_000_00, usefulLifeMonths: 12, monthlyAmount: null,
  openingAccumulated: 0, openingAsOf: null, status: 'in_use', disposedDate: null, ...over,
});
/** Trích lần lượt từ tháng 1/2026, trả về số từng tháng (đồng). */
const run = (a: DepreciableAsset, months: number) => {
  const out: number[] = [];
  let acc = 0;
  for (let i = 0; i < months; i++) {
    const c = chargeFor(a, { year: 2026 + Math.floor(i / 12), month: (i % 12) + 1 }, acc);
    acc += c;
    out.push(c / 100);
  }
  return out;
};

describe('Công thức khấu hao đường thẳng', () => {
  it('tháng đầu theo số ngày dùng, tháng cuối trích nốt phần còn lại, tổng đúng bằng nguyên giá', () => {
    const m = run(asset({ startDate: '2026-01-15' }), 14);
    expect(m[0]).toBe(548387); // 1.000.000 × 17/31, làm tròn đồng
    expect(m.slice(1, 12)).toEqual(Array(11).fill(1000000));
    expect(m[12]).toBe(12000000 - 548387 - 11000000);
    expect(m[13]).toBe(0);
    expect(m.reduce((s, x) => s + x, 0)).toBeCloseTo(12000000, 2);
  });

  it('nguyên giá không chia hết: tháng cuối gánh phần lẻ', () => {
    expect(run(asset({ originalCost: 10_000_000_00, usefulLifeMonths: 3 }), 4)).toEqual([3333333, 3333333, 3333334, 0]);
  });

  it('ghi giảm giữa tháng: trích tới hết ngày trước ngày ghi giảm, sau đó không trích', () => {
    const m = run(asset({ disposedDate: '2026-03-16' }), 4);
    expect(m).toEqual([1000000, 1000000, 483871, 0]);
  });

  it('có luỹ kế đầu: chỉ trích từ tháng sau mốc, không vượt phần còn lại; tạm ngừng thì không trích', () => {
    const a = asset({ openingAccumulated: 11_500_000_00, openingAsOf: '2026-03-31' });
    expect(run(a, 6)).toEqual([0, 0, 0, 500000, 0, 0]);
    expect(run(asset({ status: 'stopped' }), 2)).toEqual([0, 0]);
  });

  it('chuyển sổ: luỹ kế đầu + số tháng còn lại, mức tháng lẻ đồng; tháng cuối trích nốt', () => {
    // Còn 1.100.000 trích trong 3 tháng (4–6), mức tháng 366.666,67 → tròn đồng 366.667, tháng 6 trích nốt.
    const a = asset({ openingAccumulated: 10_900_000_00, openingAsOf: '2026-03-31', openingRemainingMonths: 3, monthlyAmount: 36_666_667 });
    expect(run(a, 7)).toEqual([0, 0, 0, 366667, 366667, 366666, 0]);
  });

  it('đánh giá lại: tăng nguyên giá và kéo dài thời gian, mức tháng mới từ tháng đánh giá lại', () => {
    const a = asset({ revaluations: [{ date: '2026-04-10', costDelta: 3_000_000_00, depreciableDelta: 3_000_000_00, accumulatedDelta: 0, monthlyAmount: 1_500_000_00, remainingMonths: 8 }] });
    const m = run(a, 12);
    expect(m.slice(0, 3)).toEqual([1000000, 1000000, 1000000]);
    expect(m.slice(3, 10)).toEqual(Array(7).fill(1500000));
    expect(m[10]).toBe(12000000 + 3000000 - 3000000 - 7 * 1500000);
    expect(m.reduce((s, x) => s + x, 0)).toBe(15000000);
  });

  it('chia theo số ngày khi điều chuyển giữa tháng và chia theo tỷ lệ phần trăm', () => {
    expect(splitByDays(3_100_000_00, { year: 2026, month: 3 }, '2026-03-01', '2026-03-31', [{ from: '0001-01-01', branchId: 'A' }, { from: '2026-03-11', branchId: 'B' }]))
      .toEqual([['A', 1_000_000_00], ['B', 2_100_000_00]]);
    expect(splitByPercent(1_000_000_00, [33.3333, 33.3333, 33.3334])).toEqual([333_333_00, 333_333_00, 333_334_00]);
  });
});

describe('Tờ khai thuế GTGT — công thức chỉ tiêu', () => {
  it('[27], [28], [34], [36], [40a], [43]', () => {
    const v = computeForm({ '23': 1000, '24': 100, '26': 50, '29': 0, '30': 200, '31': 10, '32': 1000, '33': 90, '32a': 0 }, { '22': 30 });
    expect([v['25'], v['27'], v['28'], v['34'], v['36'], v['40a'], v['40'], v['41'], v['43']]).toEqual([100, 1200, 100, 1250, 0, 0, 0, 30, 30]);
    const pay = computeForm({ '24': 100, '33': 500 }, { '22': 30, '25': 80 });
    expect([pay['36'], pay['40a'], pay['43']]).toEqual([420, 390, 0]);
  });
});

let ctx: TestCtx;
const RANGE = 'from=2026-10-01&to=2026-10-31';
const bs = async () => {
  const res = await call(ctx, 'GET', `/api/v1/reports/balance-sheet?${RANGE}`);
  return { d: res.body.data, v: (code: string) => res.body.data.rows.find((r: any) => r.code === code)?.closing ?? 0 };
};

beforeAll(async () => {
  ctx = await setupTenant();
});
afterAll(async () => {
  await ctx.app.close();
});

describe('Thẻ tài sản và tính khấu hao, phân bổ', () => {
  it('loại tài sản ngầm định có sẵn', async () => {
    const res = await call(ctx, 'GET', '/api/v1/asset-categories');
    expect(res.body.data.map((c: any) => c.code)).toEqual(expect.arrayContaining(['TS-MAY', 'CCDC', 'TRUOC']));
  });

  it('tài sản cố định: Nợ 6424 / Có 2141; tính lại thì bút toán cũ ghi số âm, số dư không đổi', async () => {
    const add = await call(ctx, 'POST', '/api/v1/assets', {
      code: 'MAY01', name: 'Máy tính tiền', kind: 'fixed_asset', categoryCode: 'TS-MAY', branchCode: 'CN01', startDate: '2026-10-01',
      originalCost: 36000000, usefulLifeMonths: 36, assetAccount: '2112', depreciationAccount: '2141', expenseAccount: '6424',
    });
    expect(add.status).toBe(201);
    let r = await call(ctx, 'POST', '/api/v1/assets/depreciation', { period: '2026-10' });
    expect(r.status).toBe(200);
    expect(r.body.data.total).toBe(1000000);
    expect(r.body.data.branches[0]).toMatchObject({ branchCode: 'CN01', status: 'posted', docNo: 'KH 10/2026 CN01' });
    r = await call(ctx, 'POST', '/api/v1/assets/depreciation', { period: '2026-10' });
    expect(r.body.data.total).toBe(1000000);
    const tb = await call(ctx, 'GET', `/api/v1/reports/trial-balance?${RANGE}&postingOnly=true`);
    const row = (c: string) => tb.body.data.rows.find((x: any) => x.code === c);
    expect(row('6424').closingDebit).toBe(1000000);
    expect(row('2141').closingCredit).toBe(1000000);
    const list = await call(ctx, 'GET', '/api/v1/assets?kind=fixed_asset');
    expect(list.body.data[0]).toMatchObject({ code: 'MAY01', accumulated: 1000000, remaining: 35000000, lastPeriod: '2026-10' });
  });

  it('không xoá được thẻ đã trích; sổ tài sản có số trích trong kỳ', async () => {
    expect((await call(ctx, 'DELETE', '/api/v1/assets/MAY01')).status).toBe(409);
    const reg = await call(ctx, 'GET', `/api/v1/assets/register?${RANGE}`);
    expect(reg.body.data.rows[0]).toMatchObject({ code: 'MAY01', opening: 0, charge: 1000000, closing: 1000000, remaining: 35000000, increased: true });
  });

  it('công cụ dụng cụ 24 tháng trên 24218: B01 tách phần phân bổ sau 12 tháng sang chỉ tiêu 271', async () => {
    const v = await call(ctx, 'POST', '/api/v1/vouchers', { docType: 'manual', branchCode: 'CN01', docDate: '2026-10-01', description: 'Xuất dùng tủ mát', lines: [{ debitAccount: '24218', creditAccount: '1111', amount: 2400000 }] });
    expect(v.status).toBe(201);
    await call(ctx, 'POST', '/api/v1/assets', {
      code: 'TU01', name: 'Tủ mát', kind: 'tool', categoryCode: 'CCDC-DH', branchCode: 'CN01', startDate: '2026-10-01',
      originalCost: 2400000, usefulLifeMonths: 24, depreciationAccount: '24218', expenseAccount: '64231',
    });
    const r = await call(ctx, 'POST', '/api/v1/assets/depreciation', { period: '2026-10' });
    expect(r.body.data.total).toBe(1100000);
    const { d, v: val } = await bs();
    expect(val('161')).toBe(1200000); // 12 tháng tới × 100.000
    expect(val('271')).toBe(1100000);
    expect(d.totals.difference).toBe(0);
    expect(d.longTerm.closing).toEqual([expect.objectContaining({ account: '24218', from: '161', to: '271', amount: 1100000, source: 'schedule' })]);
  });
});

describe('Phân loại dài hạn trên B01', () => {
  it('khoản vay: phần dài hạn kế toán khai chuyển từ 321 sang 339; không vượt số dư', async () => {
    await call(ctx, 'PUT', '/api/v1/partners/NH-ABC', { name: 'Ngân hàng ABC', kind: 'other' });
    const v = await call(ctx, 'POST', '/api/v1/vouchers', { docType: 'manual', branchCode: 'CN01', docDate: '2026-10-10', description: 'Nhận tiền vay', partnerCode: 'NH-ABC', lines: [{ debitAccount: '1111', creditAccount: '34111', amount: 500000000 }] });
    expect(v.status).toBe(201);
    const save = await call(ctx, 'PUT', '/api/v1/long-term-balances', { asOf: '2026-10-31', lines: [{ accountCode: '34111', partnerCode: 'NH-ABC', amount: 300000000, note: 'trả gốc từ 2028' }] });
    expect(save.status).toBe(200);
    let { d, v: val } = await bs();
    expect(val('321')).toBe(200000000);
    expect(val('339')).toBe(300000000);
    expect(d.totals.difference).toBe(0);
    const list = await call(ctx, 'GET', '/api/v1/long-term-balances?asOf=2026-10-31');
    expect(list.body.data.rows[0]).toMatchObject({ accountCode: '34111', partnerCode: 'NH-ABC', amount: 300000000, balance: 500000000, balanceSide: 'Có' });

    await call(ctx, 'PUT', '/api/v1/long-term-balances', { asOf: '2026-10-31', lines: [{ accountCode: '34111', partnerCode: 'NH-ABC', amount: 900000000 }] });
    ({ d, v: val } = await bs());
    expect(val('321')).toBe(0);
    expect(val('339')).toBe(500000000);
    expect(d.longTerm.closing.find((m: any) => m.account === '34111')).toMatchObject({ amount: 500000000, requested: 900000000 });
  });

  it('từ chối tài khoản không có phần dài hạn trên mẫu', async () => {
    const r = await call(ctx, 'PUT', '/api/v1/long-term-balances', { asOf: '2026-10-31', lines: [{ accountCode: '1111', amount: 1 }] });
    expect(r.status).toBe(400);
  });
});

describe('Tờ khai thuế GTGT và thuyết minh', () => {
  it('bán hàng 8% vào dòng 10% ([32] [33]) và phụ lục giảm thuế; lưu tờ khai, kỳ sau lấy [43] làm [22]', async () => {
    const s = await call(ctx, 'POST', '/api/v1/documents', saleDoc());
    expect(s.status).toBeLessThan(300);
    const b = await call(ctx, 'GET', '/api/v1/vat-returns/build?periodKind=month&year=2026&period=10');
    expect(b.status).toBe(200);
    const v = b.body.data.values;
    expect([v['32'], v['33'], v['35']]).toEqual([185185, 14815, 14815]);
    expect(b.body.data.reduced.rows[0]).toMatchObject({ name: 'Sữa bột 900g', amount: 185185, reducedTax: 3704 });
    expect(b.body.data.form.length).toBeGreaterThan(20);

    const saved = await call(ctx, 'PUT', '/api/v1/vat-returns', { periodKind: 'month', year: 2026, period: 10, status: 'final', manual: { '22': 20000 } });
    expect(saved.body.data.values['43']).toBe(5185);
    const next = await call(ctx, 'GET', '/api/v1/vat-returns/build?periodKind=month&year=2026&period=11');
    expect(next.body.data.values['22']).toBe(5185);
    const list = await call(ctx, 'GET', '/api/v1/vat-returns');
    expect(list.body.data[0]).toMatchObject({ year: 2026, period: 10, status: 'final', carried: 5185 });
  });

  it('thuyết minh B09: chính sách kế toán và bảng tài sản cố định từ thẻ tài sản', async () => {
    const r = await call(ctx, 'GET', `/api/v1/reports/notes?${RANGE}`);
    expect(r.status).toBe(200);
    expect(r.body.data.general.length).toBe(4);
    const tscd = r.body.data.tables.find((t: any) => t.key === 'tscd');
    expect(tscd.rows.at(-1).values).toMatchObject({ costInc: 36000000, costClose: 36000000, depCharge: 1000000, nbvClose: 35000000 });
    const vay = r.body.data.tables.find((t: any) => t.key === 'vay');
    expect(vay.rows.at(-1).values).toMatchObject({ increase: 500000000, closing: 500000000 });
  });
});

describe('Tài sản đầy đủ nghiệp vụ: phân bổ, điều chuyển, sửa tay, nhập hàng loạt', () => {
  const run = () => call(ctx, 'POST', '/api/v1/assets/depreciation', { period: '2026-12' });
  const branchTotal = (r: any, code: string) => r.body.data.branches.find((b: any) => b.branchCode === code)?.total ?? 0;

  it('phân bổ 60/40 cho hai chi nhánh, điều chuyển giữa tháng chia theo ngày', async () => {
    expect((await call(ctx, 'POST', '/api/v1/branches', { code: 'CN02', name: 'Chi nhánh 02' })).status).toBe(201);
    const a1 = await call(ctx, 'POST', '/api/v1/assets', {
      code: 'PB01', name: 'Biển hiệu dùng chung', kind: 'fixed_asset', branchCode: 'CN01', startDate: '2026-12-01', originalCost: 6200000, usefulLifeMonths: 2,
      assetAccount: '2118', depreciationAccount: '2141', expenseAccount: '6424',
      allocations: [{ percent: 60, branchCode: 'CN01', expenseAccount: '6424' }, { percent: 40, branchCode: 'CN02', expenseAccount: '6414' }],
    });
    expect(a1.status).toBe(201);
    await call(ctx, 'POST', '/api/v1/assets', { code: 'DC01', name: 'Kệ trưng bày', kind: 'fixed_asset', branchCode: 'CN01', startDate: '2026-12-01', originalCost: 3100000, usefulLifeMonths: 1, assetAccount: '2118', depreciationAccount: '2141', expenseAccount: '6414' });
    const tr = await call(ctx, 'POST', '/api/v1/assets/DC01/events', { kind: 'transfer', date: '2026-12-11', docNo: 'DC-01', toBranchCode: 'CN02' });
    expect(tr.status).toBe(201);
    const r = await run();
    expect(r.status).toBe(200);
    // CN01 còn MAY01 (1.000.000) và TU01 (100.000) của các bài trước.
    expect(branchTotal(r, 'CN01')).toBe(1860000 + 1000000 + 1100000);
    expect(branchTotal(r, 'CN02')).toBe(1240000 + 2100000);
    const list = await call(ctx, 'GET', '/api/v1/assets?code=DC01');
    expect(list.body.data[0].branchCode).toBe('CN02');
  });

  it('sửa tay số trích một tháng (bắt buộc lý do)', async () => {
    expect((await call(ctx, 'PUT', '/api/v1/assets/PB01/override', { period: '2026-12', amount: 500000 })).status).toBe(400);
    expect((await call(ctx, 'PUT', '/api/v1/assets/PB01/override', { period: '2026-12', amount: 500000, reason: 'Biển hiệu tháo xuống sửa' })).status).toBe(200);
    const r = await run();
    expect(r.body.data.items.find((i: any) => i.code === 'PB01')).toMatchObject({ amount: 500000, overridden: true });
    expect(r.body.data.total).toBe(500000 + 3100000 + 1100000);
  });

  it('đánh giá lại, kiểm kê; xoá điều chuyển gần nhất trả tài sản về chi nhánh cũ', async () => {
    expect((await call(ctx, 'POST', '/api/v1/assets/PB01/events', { kind: 'revaluation', date: '2026-12-20', costDelta: 1000000, remainingMonths: 3 })).status).toBe(201);
    expect((await call(ctx, 'POST', '/api/v1/assets/PB01/events', { kind: 'audit', date: '2026-12-31', result: 'damaged', actualQuantity: 1 })).status).toBe(201);
    const ev = await call(ctx, 'GET', '/api/v1/asset-events');
    expect(ev.body.data.map((e: any) => e.kind).sort()).toEqual(['audit', 'revaluation', 'transfer']);
    const transfer = ev.body.data.find((e: any) => e.kind === 'transfer');
    expect((await call(ctx, 'DELETE', `/api/v1/asset-events/${transfer.id}`)).status).toBe(200);
    expect((await call(ctx, 'GET', '/api/v1/assets?code=DC01')).body.data[0].branchCode).toBe('CN01');
    const reg = await call(ctx, 'GET', '/api/v1/assets/register?from=2026-12-01&to=2026-12-31');
    expect(reg.body.data.rows.find((r: any) => r.code === 'PB01')).toMatchObject({ originalCost: 7200000, costAdjust: 1000000 });
  });

  it('nhập hàng loạt: có dòng sai thì không ghi dòng nào; đúng hết thì tạo, tự tạo chi nhánh khi được phép', async () => {
    const good = { code: 'NK01', name: 'Máy lạnh', kind: 'fixed_asset', branchCode: 'CN09', startDate: '2024-01-01', originalCost: 24000000, usefulLifeMonths: 48, openingAccumulated: 12000000, openingAsOf: '2025-12-31', openingRemainingMonths: 24, assetAccount: '2112', depreciationAccount: '2141', expenseAccount: '6424' };
    const bad = { ...good, code: 'NK02', expenseAccount: '9999' };
    const r1 = await call(ctx, 'POST', '/api/v1/assets/import', { assets: [good, bad], createBranches: true });
    expect(r1.body.data).toMatchObject({ created: 0, updated: 0 });
    expect(r1.body.data.errors).toEqual([expect.objectContaining({ row: 2, code: 'NK02' })]);
    const r2 = await call(ctx, 'POST', '/api/v1/assets/import', { assets: [good, { ...bad, expenseAccount: '6424' }], createBranches: true });
    expect(r2.body.data).toMatchObject({ created: 2, updated: 0, errors: [] });
    const one = (await call(ctx, 'GET', '/api/v1/assets?code=NK01')).body.data[0];
    expect(one).toMatchObject({ branchCode: 'CN09', accumulated: 12000000, remaining: 12000000, openingRemainingMonths: 24 });
  });
});

describe('Chuyển sổ: chi nhánh chưa trích tới tháng chốt', () => {
  const item = (r: any, code: string) => r.body.data.items.find((i: any) => i.code === code);
  it('báo tháng thiếu; đánh dấu dồn thì tháng này trích cả phần thiếu, tính lại vẫn giữ đúng', async () => {
    const add = await call(ctx, 'POST', '/api/v1/assets', {
      code: 'CHAM01', name: 'Tủ cấp đông shop chậm trích', kind: 'fixed_asset', branchCode: 'CN01', startDate: '2025-07-01', originalCost: 24000000, usefulLifeMonths: 24,
      openingAccumulated: 12000000, openingAsOf: '2026-06-30', openingRemainingMonths: 12, monthlyAmount: 1000000, assetAccount: '2112', depreciationAccount: '2141', expenseAccount: '6424',
    });
    expect(add.status).toBe(201);
    let r = await call(ctx, 'POST', '/api/v1/assets/depreciation', { period: '2026-12' });
    expect(item(r, 'CHAM01').amount).toBe(1000000);
    expect(r.body.data.missing.find((m: any) => m.assetCode === 'CHAM01')).toMatchObject({ firstMissing: '2026-07', months: 5 });
    r = await call(ctx, 'POST', '/api/v1/assets/depreciation', { period: '2026-12', catchUp: true });
    expect(item(r, 'CHAM01')).toMatchObject({ amount: 6000000, catchUp: 5000000 });
    expect(r.body.data.missing.find((m: any) => m.assetCode === 'CHAM01')).toBeUndefined();
    r = await call(ctx, 'POST', '/api/v1/assets/depreciation', { period: '2026-12', catchUp: true });
    expect(item(r, 'CHAM01')).toMatchObject({ amount: 6000000, catchUp: 5000000 });
    const list = (await call(ctx, 'GET', '/api/v1/assets?code=CHAM01')).body.data[0];
    expect(list).toMatchObject({ accumulated: 18000000, remaining: 6000000 });
    // Tháng sau: các tháng đã dồn không còn tính là thiếu.
    r = await call(ctx, 'POST', '/api/v1/assets/depreciation', { period: '2027-01' });
    expect(item(r, 'CHAM01').amount).toBe(1000000);
    expect(r.body.data.missing.find((m: any) => m.assetCode === 'CHAM01')).toBeUndefined();
  });
});
