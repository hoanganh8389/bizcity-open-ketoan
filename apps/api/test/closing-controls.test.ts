/**
 * Kiểm thử: kiểm soát kết chuyển — kiểm tra bộ quy tắc, phiên bản quy tắc, lưu vết nguồn và kết chuyển lỗi thời,
 * số dư còn lại sau kết chuyển, kết chuyển tuần tự và dây chuyền, chặn số dư đầu kỳ loại 5–8.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { closeDb } from '../src/db/client.js';
import { call, setupTenant, type TestCtx } from './helpers.js';

let ctx: TestCtx;
const voucher = (docDate: string, debitAccount: string, creditAccount: string, amount: number, description = 'Kiểm thử kết chuyển') =>
  call(ctx, 'POST', '/api/v1/vouchers', { docType: 'manual', branchCode: 'CN01', docDate, description, lines: [{ debitAccount, creditAccount, amount }] });
const runClosing = (period: string, extra: Record<string, unknown> = {}) => call(ctx, 'POST', '/api/v1/closing/run', { period, branchCodes: ['CN01'], ...extra });
const preview = (period: string) => call(ctx, 'POST', '/api/v1/closing/preview', { period, branchCodes: ['CN01'] });
const runsOf = async (period: string) => (await call(ctx, 'GET', '/api/v1/closing/runs?year=2026')).body.data.filter((r: any) => r.period === period && r.status === 'posted');
const getRules = async () => (await call(ctx, 'GET', '/api/v1/closing/rules')).body.data;
const saveRules = (rules: unknown[], note = '') => call(ctx, 'PUT', '/api/v1/closing/rules', { rules, note });

beforeAll(async () => {
  ctx = await setupTenant();
});
afterAll(async () => {
  await ctx.app.close();
  await closeDb();
});

describe('Kiểm tra bộ bút toán kết chuyển mẫu', () => {
  it('bộ mặc định hợp lệ, có cảnh báo tài khoản chưa có bước kết chuyển', async () => {
    const r = await getRules();
    expect(r.isDefault).toBe(true);
    expect(r.errors).toEqual([]);
    expect(r.warnings.join('\n')).toMatch(/chưa có bước kết chuyển.*6231/);
  });

  it('không kết chuyển tài khoản tiền, công nợ, hàng tồn kho sang 911', async () => {
    const { rules } = await getRules();
    for (const from of ['131', '1111', '1561']) {
      const res = await saveRules([{ seq: 1, fromAccount: from, toAccount: '911', mode: 'debit' }, ...rules]);
      expect(res.status, from).toBe(400);
      expect(JSON.stringify(res.body)).toContain(`không kết chuyển ${from}`);
    }
  });

  it('bước đổ số vào nguồn đã kết chuyển phải chạy trước', async () => {
    const { rules } = await getRules();
    // 511 → 911 chạy trước giảm trừ 5211 → 51111: giảm trừ sẽ treo lại trên 51111.
    const bad = rules.map((r: any) => (r.fromAccount === '511' ? { ...r, seq: 70 } : r));
    const res = await saveRules(bad);
    expect(res.status).toBe(400);
    expect(JSON.stringify(res.body)).toMatch(/5211 → 51111.*đã kết chuyển/);
  });

  it('bước 911 → 421x: bắt buộc, chạy sau cùng, kiểu số dư, lấy số dư đầu', async () => {
    const { rules } = await getRules();
    const without = await saveRules(rules.filter((r: any) => r.fromAccount !== '911'));
    expect(JSON.stringify(without.body)).toContain('Chưa có bước kết chuyển lãi lỗ');
    const notLast = await saveRules(rules.map((r: any) => (r.fromAccount === '911' ? { ...r, seq: 50 } : r)));
    expect(JSON.stringify(notLast.body)).toContain('phải chạy sau cùng');
    const noOpening = await saveRules(rules.map((r: any) => (r.fromAccount === '911' ? { ...r, includeOpening: false } : r)));
    expect(JSON.stringify(noOpening.body)).toContain('Lấy số dư đầu');
  });
});

describe('Phiên bản bộ quy tắc', () => {
  it('lưu bộ mới thì thêm phiên bản; lưu lại y nguyên thì không', async () => {
    const { rules } = await getRules();
    const first = await saveRules(rules, 'Dùng bộ mặc định');
    expect(first.status, JSON.stringify(first.body)).toBe(200);
    expect(first.body.data).toMatchObject({ isDefault: false, version: 1 });
    expect((await saveRules(rules)).body.data.version).toBe(1);
    const versions = await call(ctx, 'GET', '/api/v1/closing/rules/versions');
    expect(versions.body.data).toHaveLength(1);
    expect(versions.body.data[0]).toMatchObject({ version: 1, note: 'Dùng bộ mặc định' });
    expect(versions.body.data[0].rules).toHaveLength(rules.length);
  });
});

describe('Kết chuyển tuần tự, lưu vết nguồn, lỗi thời, dây chuyền', () => {
  it('tháng trước còn số chưa kết chuyển thì không kết chuyển tháng sau', async () => {
    expect((await voucher('2026-03-10', '1111', '51111', 1000000, 'Doanh thu tháng 3')).status).toBe(201);
    expect((await voucher('2026-04-10', '64211', '1111', 200000, 'Chi phí tháng 4')).status).toBe(201);
    const pre = await preview('2026-04');
    expect(pre.body.data[0].blockers).toEqual(['2026-03']);
    const blocked = await runClosing('2026-04');
    expect(blocked.status).toBe(200);
    expect(blocked.body.data[0]).toMatchObject({ status: 'blocked', blockers: ['2026-03'] });
    expect(blocked.body.data[0].message).toContain('03/2026');
    expect(await runsOf('2026-04')).toHaveLength(0);
  });

  it('chạy nhiều chi nhánh: chi nhánh bị chặn không làm hỏng chi nhánh khác', async () => {
    expect((await call(ctx, 'POST', '/api/v1/branches', { code: 'CN02', name: 'Cửa hàng 02' })).status).toBeLessThan(300);
    expect((await call(ctx, 'POST', '/api/v1/vouchers', { docType: 'manual', branchCode: 'CN02', docDate: '2026-04-11', description: 'CN02 tháng 4', lines: [{ debitAccount: '1111', creditAccount: '51111', amount: 300000 }] })).status).toBe(201);
    const res = await call(ctx, 'POST', '/api/v1/closing/run', { period: '2026-04', branchCodes: ['CN01', 'CN02'] });
    expect(res.status).toBe(200);
    expect(res.body.data.map((r: any) => [r.branchCode, r.status])).toEqual([['CN01', 'blocked'], ['CN02', 'posted']]);
  });

  it('kết chuyển lần lượt; chứng từ ghi phiên bản quy tắc và dấu vân tay nguồn', async () => {
    expect((await runClosing('2026-03')).body.data[0]).toMatchObject({ status: 'posted', profit: 1000000, residuals: [] });
    expect((await runClosing('2026-04')).body.data[0]).toMatchObject({ status: 'posted', profit: -200000 });
    const [mar] = await runsOf('2026-03');
    expect(mar).toMatchObject({ rulesVersion: 1, staleReasons: [] });
    expect(mar.sources).toMatchObject({ entryCount: 1, byAccount: [{ account: '51111', debit: 0, credit: 1000000 }] });
    expect(new Date(mar.sources.asOf).toString()).not.toBe('Invalid Date');
    expect(mar.sources.asOf).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{6}Z$/);
    const src = await call(ctx, 'GET', `/api/v1/closing/runs/${mar.id}/sources?account=511`);
    expect(src.body.data.total).toBe(1);
    expect(src.body.data.rows[0]).toMatchObject({ credit: 1000000, description: 'Doanh thu tháng 3' });
  });

  it('phiếu muộn sau khi kết chuyển: kết chuyển lỗi thời; kết chuyển lại thì hết', async () => {
    expect((await voucher('2026-04-20', '64211', '1111', 50000, 'Phiếu muộn')).status).toBe(201);
    expect((await runsOf('2026-04'))[0].staleReasons).toEqual(['data']);
    expect((await preview('2026-04')).body.data[0].staleReasons).toEqual(['data']);
    const check = await call(ctx, 'GET', '/api/v1/periods/check?year=2026&month=4');
    expect(check.body.data.find((c: any) => c.key === 'closingStale')).toMatchObject({ count: 1, detail: 'CN01' });
    expect((await runClosing('2026-04')).body.data[0].profit).toBe(-250000);
    expect((await runsOf('2026-04'))[0].staleReasons).toEqual([]);
  });

  it('sửa quy tắc: các kỳ đã kết chuyển lỗi thời; kết chuyển lại dây chuyền từ tháng đầu', async () => {
    const { rules } = await getRules();
    const saved = await saveRules(rules.map((r: any) => (r.fromAccount === '642' ? { ...r, description: 'Kết chuyển chi phí quản lý' } : r)), 'Đổi diễn giải');
    expect(saved.body.data.version).toBe(2);
    expect((await runsOf('2026-03'))[0].staleReasons).toEqual(['rules']);
    expect((await runsOf('2026-04'))[0].staleReasons).toEqual(['rules']);
    const res = await runClosing('2026-03', { cascade: true });
    expect(res.body.data.map((r: any) => [r.period, r.status, Boolean(r.cascaded)])).toEqual([['2026-03', 'posted', false], ['2026-04', 'posted', true]]);
    for (const p of ['2026-03', '2026-04']) expect((await runsOf(p))[0]).toMatchObject({ rulesVersion: 2, staleReasons: [] });
  });

  it('kết chuyển lại tháng trước cùng số: tháng sau không bị coi là lỗi thời', async () => {
    await runClosing('2026-03');
    expect((await runsOf('2026-04'))[0].staleReasons).toEqual([]);
  });

  it('tài khoản chi phí chưa có bước kết chuyển: còn số dư, được báo', async () => {
    expect((await voucher('2026-05-05', '6231', '1111', 30000, 'Chi phí máy thi công')).status).toBe(201);
    const pre = await preview('2026-05');
    expect(pre.body.data[0].residuals).toEqual([{ account: '6231', balance: 30000, reason: 'no-rule' }]);
    const res = await runClosing('2026-05');
    expect(res.body.data[0]).toMatchObject({ status: 'empty', residuals: [{ account: '6231', balance: 30000, reason: 'no-rule' }] });
    expect((await voucher('2026-05-06', '1111', '51111', 100000)).status).toBe(201);
    const posted = await runClosing('2026-05');
    expect(posted.body.data[0]).toMatchObject({ status: 'posted', residuals: [{ account: '6231', balance: 30000, reason: 'no-rule' }] });
    const check = await call(ctx, 'GET', '/api/v1/periods/check?year=2026&month=5');
    expect(check.body.data.find((c: any) => c.key === 'closingResidual')).toMatchObject({ count: 1, detail: 'CN01: 6231' });
  });
});

describe('Tính lại giá vốn (ghi đè dòng chờ giá vốn) sau khi kết chuyển', () => {
  const doc = (d: unknown) => call(ctx, 'POST', '/api/v1/documents', d);
  const purchase = (key: string, qty: number, amount: number) => ({
    docType: 'purchase', docKey: key, branchCode: 'CN01', docNo: key, docDate: '2026-06-02', partner: { code: 'NCC-01', name: 'Nhà cung cấp 01' },
    lines: [{ lineKey: 'l1', sku: 'SUA01', name: 'Sữa bột 900g', unit: 'Hộp', qty, amountBeforeTax: amount, taxCode: 'V08', taxAmount: 0 }],
    totals: { beforeTax: amount, tax: 0, total: amount },
  });

  it('giá vốn ghi đè không tạo bút toán mới nhưng kết chuyển vẫn bị đánh dấu lỗi thời', async () => {
    expect((await doc(purchase('NM-06A', 10, 700000))).body.data.status).toBe('posted');
    const sale = await doc({
      docType: 'sale', docKey: 'BAN-06', branchCode: 'CN01', docNo: 'BAN-06', docDate: '2026-06-05',
      lines: [{ lineKey: 'l1', sku: 'SUA01', name: 'Sữa bột 900g', unit: 'Hộp', qty: 2, amountBeforeTax: 200000, taxCode: 'R08', taxAmount: 16000 }],
      payments: [{ methodCode: 'TM', amount: 216000 }], totals: { beforeTax: 200000, tax: 16000, total: 216000 },
    });
    expect(sale.body.data.status).toBe('posted');
    expect((await call(ctx, 'POST', '/api/v1/inventory/costing', { period: '2026-06' })).status).toBe(200);
    const first = await runClosing('2026-06');
    expect(first.body.data[0]).toMatchObject({ status: 'posted', profit: 200000 - 140000 });
    expect((await runsOf('2026-06'))[0].staleReasons).toEqual([]);

    // Nhập thêm hàng giá cao hơn rồi tính lại: đơn giá 85.000, giá vốn ghi đè lên dòng của phiếu bán (không bút toán mới vào 632).
    expect((await doc(purchase('NM-06B', 10, 1000000))).body.data.status).toBe('posted');
    expect((await runsOf('2026-06'))[0].staleReasons).toEqual([]); // phiếu nhập không đụng tài khoản doanh thu, chi phí
    expect((await call(ctx, 'POST', '/api/v1/inventory/costing', { period: '2026-06' })).status).toBe(200);
    expect((await runsOf('2026-06'))[0].staleReasons).toEqual(['data']);
    expect((await preview('2026-06')).body.data[0].staleReasons).toEqual(['data']);
    const check = await call(ctx, 'GET', '/api/v1/periods/check?year=2026&month=6');
    expect(check.body.data.find((c: any) => c.key === 'closingStale')).toMatchObject({ count: 1, detail: 'CN01' });

    const again = await runClosing('2026-06');
    expect(again.body.data[0]).toMatchObject({ status: 'posted', profit: 200000 - 170000 });
    expect((await runsOf('2026-06'))[0].staleReasons).toEqual([]);
    // Tính lại mà đơn giá không đổi: không có dòng nào đổi số → không lỗi thời.
    expect((await call(ctx, 'POST', '/api/v1/inventory/costing', { period: '2026-06' })).status).toBe(200);
    expect((await runsOf('2026-06'))[0].staleReasons).toEqual([]);
  });
});

describe('Số dư đầu kỳ', () => {
  it('không nhập số dư đầu cho doanh thu, chi phí, 911', async () => {
    const res = await call(ctx, 'POST', '/api/v1/opening-balances', { branchCode: 'CN01', docDate: '2025-12-31', lines: [{ accountCode: '1111', debit: 100 }, { accountCode: '51111', credit: 100 }] });
    expect(res.status).toBe(400);
    expect(res.body.error.message).toContain('51111');
    const viaBalancing = await call(ctx, 'POST', '/api/v1/opening-balances', { branchCode: 'CN01', docDate: '2025-12-31', balancingAccount: '911', lines: [{ accountCode: '1111', debit: 100 }] });
    expect(viaBalancing.status).toBe(400);
  });
});
