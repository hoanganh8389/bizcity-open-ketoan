/**
 * Kiểm thử: dòng kết chuyển giữ khoản mục, bộ phận (phòng ban), hợp đồng của tài khoản nguồn và ghi kiểu kết chuyển, cờ
 * "kết chuyển số dư cuối" của bước sinh ra nó — các cột Khoản mục, Phòng ban, Hợp đồng, Kiểu, Số dư cuối kỳ ở form Xem (như HTsoft).
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { closeDb } from '../src/db/client.js';
import { call, setupTenant, type TestCtx } from './helpers.js';

let ctx: TestCtx;
beforeAll(async () => {
  ctx = await setupTenant();
  await call(ctx, 'PUT', '/api/v1/dimensions/cost_item/KM-DIEN', { name: 'Tiền điện' });
  await call(ctx, 'PUT', '/api/v1/dimensions/department/BH26001', { name: 'Bộ phận bán hàng' });
  const base = { docType: 'manual', branchCode: 'CN01', docDate: '2026-10-05', description: 'Chi phí' };
  const v1 = await call(ctx, 'POST', '/api/v1/vouchers', { ...base, lines: [{ debitAccount: '64231', creditAccount: '1111', amount: 100000, costItem: 'KM-DIEN', department: 'BH26001' }] });
  expect(v1.status, JSON.stringify(v1.body)).toBe(201);
  const v2 = await call(ctx, 'POST', '/api/v1/vouchers', { ...base, lines: [{ debitAccount: '1111', creditAccount: '51111', amount: 300000, department: 'BH26001' }] });
  expect(v2.status, JSON.stringify(v2.body)).toBe(201);
});
afterAll(async () => {
  await ctx.app.close();
  await closeDb();
});

describe('Dòng kết chuyển giữ chiều phân tích', () => {
  it('khoản mục, bộ phận theo tài khoản nguồn; kiểu và số dư cuối kỳ theo bước', async () => {
    const res = await call(ctx, 'POST', '/api/v1/closing/run', { period: '2026-10', branchCodes: ['CN01'] });
    expect(res.body.data[0]).toMatchObject({ status: 'posted', profit: 200000 });
    const run = (await call(ctx, 'GET', '/api/v1/closing/runs?year=2026')).body.data[0];
    const lines = (await call(ctx, 'GET', `/api/v1/documents/${run.id}`)).body.data.payload.lines;
    expect(lines.find((l: any) => l.creditAccount === '64231')).toMatchObject({ debitAccount: '911', amount: 100000, costItem: 'KM-DIEN', department: 'BH26001', contract: '', mode: 'debit', includeOpening: false });
    expect(lines.find((l: any) => l.creditAccount === '4212')).toMatchObject({ mode: 'balance', includeOpening: true });
  });
});
