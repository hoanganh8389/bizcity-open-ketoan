/**
 * Khai bổ sung thuế GTGT (01/KHBS, tiền chậm nộp) và quyết toán thuế TNDN (03/TNDN).
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { call, setupTenant, type TestCtx } from './helpers.js';
import { buildSupplement, filingDeadline, lateDays } from '../src/phan-he/thue/statements/vat-return.service.js';
import { computeCit, suggestedRate } from '../src/phan-he/thue/statements/cit-return.service.js';

let ctx: TestCtx;
const sale = (key: string, date: string, amount: number) => ({
  docType: 'sale', docKey: key, branchCode: 'CN01', docNo: key, docDate: date,
  partner: { code: 'KH-CTY', name: 'Công ty B', taxCode: '0109999999' },
  invoice: { no: key.replace(/\D/g, ''), serial: 'C26TBB', date },
  lines: [{ lineKey: 'l1', sku: 'A', name: 'Hàng A', qty: 1, amountBeforeTax: amount, taxCode: 'R10', taxAmount: amount / 10 }],
  payments: [{ methodCode: 'TM', amount: amount * 1.1 }],
  totals: { beforeTax: amount, tax: amount / 10, total: amount * 1.1 },
});
const period = { periodKind: 'month', year: 2026, period: 9 };

beforeAll(async () => {
  ctx = await setupTenant();
  const r = await call(ctx, 'POST', '/api/v1/documents', sale('KB-HD-1001', '2026-09-10', 1000000));
  expect(r.body.data?.status, JSON.stringify(r.body)).toBe('posted');
});
afterAll(async () => {
  await ctx.app.close();
});

describe('Hạn nộp, tiền chậm nộp', () => {
  it('hạn nộp tháng = ngày 20 tháng sau (lùi qua thứ bảy, chủ nhật); quý = cuối tháng đầu quý sau', () => {
    expect(filingDeadline('month', 2026, 9)).toBe('2026-10-20');
    expect(filingDeadline('month', 2026, 5)).toBe('2026-06-22'); // 20/06/2026 là thứ bảy
    expect(filingDeadline('quarter', 2026, 3)).toBe('2026-11-02'); // 31/10/2026 là thứ bảy
    expect(filingDeadline('quarter', 2026, 4)).toBe('2027-02-01'); // 31/01/2027 là chủ nhật
  });
  it('số ngày chậm nộp: từ ngày kế tiếp hạn đến ngày liền trước ngày nộp', () => {
    expect(lateDays('2026-10-20', '2026-10-25')).toBe(4);
    expect(lateDays('2026-10-20', '2026-10-21')).toBe(0);
    expect(lateDays('2026-10-20', '2026-10-10')).toBe(0);
  });
  it('giải trình chỉ gồm chỉ tiêu thay đổi; tiền chậm nộp = tăng thêm × 0,03% × số ngày', () => {
    const k = buildSupplement({ kind: 'month', year: 2026, period: 9, declared: { '33': 100000, '40': 100000 }, adjusted: { '33': 150000, '40': 150000 }, payDate: '2026-11-30' });
    expect(k.rows.map((r) => [r.code, r.declared, r.adjusted, r.diff])).toEqual([['33', 100000, 150000, 50000], ['40', 100000, 150000, 50000]]);
    expect(k.lateDays).toBe(40);
    expect(k.lateInterest).toBe(600);
  });
});

describe('Khai bổ sung tờ khai GTGT', () => {
  it('chưa có tờ khai chính thức thì không lập bổ sung', async () => {
    const r = await call(ctx, 'PUT', '/api/v1/vat-returns/supplement', { ...period, manual: {}, payDate: '2026-11-30', dryRun: true });
    expect(r.status).toBe(409);
  });

  it('nộp lần đầu → hoá đơn về sau → lập bổ sung lần 1, lần đầu vẫn giữ', async () => {
    expect((await call(ctx, 'PUT', '/api/v1/vat-returns', { ...period, status: 'final', manual: {} })).status).toBe(200);
    // Hoá đơn tháng 9 gửi sang muộn sau khi đã nộp tờ khai.
    const late = await call(ctx, 'POST', '/api/v1/documents', sale('KB-HD-1002', '2026-09-25', 500000));
    expect(late.body.data?.status).toBe('posted');

    const preview = await call(ctx, 'PUT', '/api/v1/vat-returns/supplement', { ...period, manual: {}, payDate: '2026-10-25', dryRun: true });
    expect(preview.status, JSON.stringify(preview.body)).toBe(200);
    expect(preview.body.data).toMatchObject({ revision: 1, saved: false });
    expect(preview.body.data.supplement).toMatchObject({ payableIncrease: 50000, deadline: '2026-10-20', lateDays: 4, lateInterest: 60 });

    const saved = await call(ctx, 'PUT', '/api/v1/vat-returns/supplement', { ...period, manual: {}, payDate: '2026-10-25' });
    expect(saved.body.data.saved).toBe(true);

    const built = (await call(ctx, 'GET', '/api/v1/vat-returns/build?periodKind=month&year=2026&period=9')).body.data;
    expect(built.saved).toMatchObject({ revision: 1, status: 'final' });
    expect(built.revisions.map((r: { revision: number; values: Record<string, number> }) => [r.revision, r.values['40']])).toEqual([[1, 150000], [0, 100000]]);
    const list = (await call(ctx, 'GET', '/api/v1/vat-returns')).body.data;
    expect(list.map((r: { revision: number; lateInterest: number }) => [r.revision, r.lateInterest])).toEqual([[1, 60], [0, 0]]);
  });

  it('kỳ sau lấy [43] của lần bổ sung mới nhất; không khác gì thì không lưu bổ sung', async () => {
    const r = await call(ctx, 'PUT', '/api/v1/vat-returns/supplement', { ...period, manual: {}, payDate: '2026-10-25' });
    expect(r.status).toBe(409);
  });
});

describe('Quyết toán thuế TNDN', () => {
  it('thuế suất gợi ý theo doanh thu', () => {
    expect(suggestedRate(2_000_000_000)).toBe(15);
    expect(suggestedRate(30_000_000_000)).toBe(17);
    expect(suggestedRate(80_000_000_000)).toBe(20);
  });

  it('công thức: điều chỉnh, lỗ chuyển, thuế suất, tạm nộp', () => {
    const v = computeCit({ A1: 1_000_000_000, rate: 20, E: 150_000_000 }, { B4: 50_000_000, B11: 10_000_000, C3a: 40_000_000 });
    expect(v).toMatchObject({ B1: 50_000_000, B8: 10_000_000, B12: 1_040_000_000, C4: 1_000_000_000, C10: 200_000_000, D: 200_000_000, G: 50_000_000 });
    expect(computeCit({ A1: -5_000_000, rate: 20, E: 0 }, {})).toMatchObject({ C4: 0, D: 0, G: 0 });
  });

  it('lập từ sổ cái và sổ hoá đơn, lưu, đọc lại', async () => {
    const b = await call(ctx, 'GET', '/api/v1/cit-returns/build?year=2026');
    expect(b.status, JSON.stringify(b.body)).toBe(200);
    expect(b.body.data.values.A1).toBe(1500000); // doanh thu 1.000.000 + 500.000, chưa có giá vốn, chi phí
    expect(b.body.data.auto.rate).toBe(15);
    const s = await call(ctx, 'PUT', '/api/v1/cit-returns', { year: 2026, status: 'final', manual: { B4: 500000, rate: 20 } });
    expect(s.body.data.values).toMatchObject({ B12: 2000000, C10: 400000, G: 400000 });
    const again = await call(ctx, 'GET', '/api/v1/cit-returns/build?year=2026');
    expect(again.body.data.saved).toMatchObject({ status: 'final' });
    expect(again.body.data.prepaidCheck).toMatchObject({ minPrepaid: 320000, shortfall: 320000 });
  });

  it('thông tin người nộp thuế: kiểm tra mã số thuế, lưu, đọc lại', async () => {
    expect((await call(ctx, 'PUT', '/api/v1/taxpayer', { name: 'Công ty Cổ phần Đầu tư Thế Giới Sữa', taxCode: '123' })).status).toBe(400);
    expect((await call(ctx, 'PUT', '/api/v1/taxpayer', { name: 'Công ty Cổ phần Đầu tư Thế Giới Sữa', taxCode: '0101234567', taxOffice: 'Thuế cơ sở 1' })).status).toBe(200);
    const g = await call(ctx, 'GET', '/api/v1/taxpayer');
    expect(g.body.data).toMatchObject({ name: 'Công ty Cổ phần Đầu tư Thế Giới Sữa', taxCode: '0101234567', taxOffice: 'Thuế cơ sở 1' });
  });
});
