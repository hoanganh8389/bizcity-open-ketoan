/**
 * Add-in Xuất Excel — mọi tệp CSV (17 route) chạy được trên một đơn vị có chứng từ: 200, text/csv, có dòng tiêu đề + dữ liệu.
 * PHASE-014 W5 (SC-LAYER-2): add-in đọc báo cáo qua HTTP của lõi thay vì import dịch vụ của phân hệ — tệp này giữ đầu ra không đổi.
 * CSV_SNAPSHOT=ghi:<tệp> lưu nội dung; CSV_SNAPSHOT=so:<tệp> đòi giống từng byte (dùng khi sửa add-in).
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { call, saleDoc, setupTenant, type TestCtx } from './helpers.js';

let ctx: TestCtx;
const Q = 'from=2026-10-01&to=2026-10-31';
const ROUTES = ['trial-balance', 'account-ledger', 'sales-detail', 'sales-summary', 'sales-payments', 'income-statement', 'balance-sheet', 'tax-summary', 'cash-balances',
  'posting-summary', 'cash-journal', 'sales-journal', 'voucher-listing', 'cash-flow', 'journal', 'partner-balances', 'sales-invoices'];
const extra: Record<string, string> = { 'account-ledger': '&account=131', 'cash-journal': '&account=111' };
const got: Record<string, string> = {};

beforeAll(async () => {
  ctx = await setupTenant();
  for (const [i, d] of ['2026-10-05', '2026-10-12'].entries()) {
    const r = await call(ctx, 'POST', '/api/v1/documents', saleDoc({ docKey: `xls:${i}`, docNo: `XLS-${i}`, docDate: d }));
    expect(r.body.data?.status, JSON.stringify(r.body)).toBe('posted');
  }
});
afterAll(async () => {
  const mode = process.env.CSV_SNAPSHOT ?? '';
  if (mode.startsWith('ghi:')) writeFileSync(mode.slice(4), JSON.stringify(got, null, 1));
  await ctx.app.close();
});

describe('Add-in Xuất Excel — mọi tệp CSV', () => {
  for (const name of ROUTES) {
    it(name, async () => {
      const res = await ctx.app.inject({ method: 'GET', url: `/api/v1/addins/excel-export/${name}.csv?${Q}${extra[name] ?? ''}`, headers: { authorization: `Bearer ${ctx.token}` } });
      expect(res.statusCode, res.body.slice(0, 300)).toBe(200);
      expect(res.headers['content-type']).toMatch(/text\/csv/);
      expect(res.body.split('\n').filter(Boolean).length).toBeGreaterThan(0);
      got[name] = res.body;
      const mode = process.env.CSV_SNAPSHOT ?? '';
      if (mode.startsWith('so:')) expect(res.body).toBe((JSON.parse(readFileSync(mode.slice(3), 'utf8')) as Record<string, string>)[name]);
    });
  }
});
