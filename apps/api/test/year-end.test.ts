/**
 * Kết chuyển lợi nhuận năm trước 4212 → 4211 khi sang năm mới (kế hoạch Đợt 2, hạng mục 2.5).
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { call, setupTenant, type TestCtx } from './helpers.js';

let ctx: TestCtx;
const run = (extra: Record<string, unknown> = {}) => call(ctx, 'POST', '/api/v1/closing/year-end', { year: 2026, branchCodes: ['CN01'], ...extra });
const balance = async (account: string, to: string) => {
  const r = await call(ctx, 'GET', `/api/v1/reports/trial-balance?from=2025-01-01&to=${to}`);
  const row = r.body.data.rows.find((x: { code: string }) => x.code === account);
  return row ? row.closingCredit - row.closingDebit : 0;
};

beforeAll(async () => {
  ctx = await setupTenant();
  // Năm 2025 lãi 7 triệu: doanh thu 10 triệu, chi phí 3 triệu, kết chuyển tháng 12.
  for (const [description, debitAccount, creditAccount, amount] of [['Doanh thu', '1111', '51111', 10000000], ['Chi phí', '64211', '1111', 3000000]] as const) {
    const v = await call(ctx, 'POST', '/api/v1/vouchers', { docType: 'manual', branchCode: 'CN01', docDate: '2025-12-20', description, lines: [{ debitAccount, creditAccount, amount }] });
    expect(v.status, JSON.stringify(v.body)).toBe(201);
  }
  const c = await call(ctx, 'POST', '/api/v1/closing/run', { period: '2025-12', branchCodes: ['CN01'] });
  expect(c.status, JSON.stringify(c.body)).toBe(200);
});
afterAll(async () => {
  await ctx.app.close();
});

describe('Kết chuyển lợi nhuận năm trước', () => {
  it('xem trước không ghi gì', async () => {
    const p = await run({ dryRun: true });
    expect(p.status, JSON.stringify(p.body)).toBe(200);
    expect(p.body.data[0]).toMatchObject({ status: 'preview', total: 7000000, lines: [{ account: '4212', balance: 7000000 }] });
    expect(await balance('4211', '2026-01-31')).toBe(0);
  });

  it('ghi ngày 01/01: 4212 về 0, 4211 nhận lãi; chạy lại không cộng đôi', async () => {
    const r = await run();
    expect(r.body.data[0]).toMatchObject({ status: 'posted', docNo: 'KC LN 2025 CN01', total: 7000000 });
    expect(await balance('4212', '2025-12-31')).toBe(7000000);
    expect(await balance('4212', '2026-01-31')).toBe(0);
    expect(await balance('4211', '2026-01-31')).toBe(7000000);
    expect((await run()).body.data[0].status).toBe('posted');
    expect(await balance('4211', '2026-01-31')).toBe(7000000);
  });

  it('tài khoản đích sai bị từ chối', async () => {
    expect((await run({ toAccount: '9999' })).status).toBe(400);
  });
});
