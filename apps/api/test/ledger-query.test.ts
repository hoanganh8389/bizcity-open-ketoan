/**
 * ledger.query (PHASES 3.7): đọc sổ theo mã qua Kernel, khung nhìn chỉ đọc bizcity_read.*, ctx.ledger.query trong action.
 * Kịch bản khách KH-LQ (131; bộ khởi tạo ghi vào tài khoản con 1311):
 *   10/09  bán S1 (NV01) 100.000 + thuế 8.000 = 108.000, chưa trả  → đầu tháng 10 nợ 108.000
 *   08/10  bán S2 (NV02)  50.000 + thuế 4.000 =  54.000, chưa trả
 *   20/10  thu P1 30.000                                              → cuối tháng 10 nợ 132.000
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { sql } from 'kysely';
import { z } from 'zod';
import { db } from '../src/db/client.js';
import { defineAction, runAction } from '../src/core/actions.js';
import type { AuthContext, Permission } from '../src/core/auth.js';
import { ledgerQuery } from '../src/kernel/public.js';
import { call, setupTenant, type TestCtx } from './helpers.js';

let ctx: TestCtx;
let tenantId: string;
const partner = { code: 'KH-LQ', name: 'Khách đọc sổ' };
const line = (sku: string, amount: number, tax: number) => ({ lineKey: 'l1', sku, name: `Hàng ${sku}`, unit: 'Cái', qty: 1, amountBeforeTax: amount, taxCode: 'R08', taxAmount: tax });

beforeAll(async () => {
  ctx = await setupTenant();
  tenantId = String((await db.selectFrom('tenants').select('id').where('code', '=', ctx.tenantCode).executeTakeFirstOrThrow()).id);
  const docs = [
    { docType: 'sale', docKey: 'LQ-S1', branchCode: 'CN01', docNo: 'S1', docDate: '2026-09-10', partner, employee: { code: 'NV01', name: '' }, lines: [line('LQA', 100000, 8000)], payments: [], totals: { beforeTax: 100000, tax: 8000, total: 108000 } },
    { docType: 'sale', docKey: 'LQ-S2', branchCode: 'CN01', docNo: 'S2', docDate: '2026-10-08', partner, employee: { code: 'NV02', name: '' }, lines: [line('LQB', 50000, 4000)], payments: [], totals: { beforeTax: 50000, tax: 4000, total: 54000 } },
    { docType: 'customer_payment', docKey: 'LQ-P1', branchCode: 'CN01', docNo: 'P1', docDate: '2026-10-20', partner, methodCode: 'TM', totals: { total: 30000 } },
  ];
  for (const d of docs) {
    const r = await call(ctx, 'POST', '/api/v1/documents', d);
    expect(r.body.data?.status, JSON.stringify(r.body)).toBe('posted');
  }
});
afterAll(async () => {
  await ctx.app.close();
});

describe('ledgerQuery.query — số dư theo mã', () => {
  it('tách đầu kỳ / phát sinh / cuối kỳ theo đối tượng', async () => {
    const rows = await ledgerQuery.query(db, tenantId, { from: '2026-10-01', to: '2026-10-31', accounts: ['131'], groupBy: ['partner'] });
    expect(rows).toEqual([{ partnerCode: 'KH-LQ', opening: 108000, debit: 54000, credit: 30000, closing: 132000 }]);
  });

  it('không có from → luỹ kế tới ngày to; gộp theo tài khoản + chi nhánh', async () => {
    const rows = await ledgerQuery.query(db, tenantId, { to: '2026-09-30', accounts: ['131', '3331'], groupBy: ['account', 'branch'] });
    expect(rows).toEqual([
      { accountCode: '1311', branchCode: 'CN01', opening: 0, debit: 108000, credit: 0, closing: 108000 },
      expect.objectContaining({ accountCode: expect.stringMatching(/^3331/), branchCode: 'CN01', debit: 0, credit: 8000, closing: -8000 }),
    ]);
  });

  it('lọc theo chiều phân tích đọc dòng sổ (nhân viên NV01 chỉ có S1)', async () => {
    const rows = await ledgerQuery.query(db, tenantId, { to: '2026-10-31', accounts: ['131'], partnerCode: 'KH-LQ', dimension: { employee: 'NV01' } });
    expect(rows).toEqual([{ accountCode: '1311', opening: 0, debit: 108000, credit: 0, closing: 108000 }]);
  });

  it('lọc theo mã hàng', async () => {
    const rows = await ledgerQuery.query(db, tenantId, { to: '2026-10-31', sku: 'LQB', accounts: ['511'] });
    expect(rows.map((r) => [r.debit, r.credit])).toEqual([[0, 50000]]);
  });

  it('mã không tồn tại → lỗi, không trả 0 ngầm (R-REV-13)', async () => {
    await expect(ledgerQuery.query(db, tenantId, { to: '2026-10-31', partnerCode: 'KHONG-CO' })).rejects.toMatchObject({ code: 'NOT_FOUND' });
    await expect(ledgerQuery.query(db, tenantId, { to: '2026-10-31', branchCodes: ['CN01', 'CN-KHONG-CO'] })).rejects.toMatchObject({ code: 'NOT_FOUND' });
    await expect(ledgerQuery.query(db, tenantId, { to: '31/10/2026' })).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
    await expect(ledgerQuery.query(db, tenantId, { from: '2026-11-01', to: '2026-10-31' })).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
  });
});

describe('bizcity_read.* — khung nhìn chỉ đọc', () => {
  it('đọc được, khớp bảng gốc', async () => {
    const view = await sql<{ n: string }>`SELECT COUNT(*) AS n FROM bizcity_read.ledger_lines WHERE tenant_id = ${tenantId}`.execute(db);
    expect(Number(view.rows[0]!.n)).toBeGreaterThan(0);
  });

  it('chặn ghi qua khung nhìn', async () => {
    await expect(sql`UPDATE bizcity_read.ledger_entries SET description = 'sửa' WHERE tenant_id = ${tenantId}`.execute(db)).rejects.toThrow(/chỉ đọc/);
    await expect(sql`DELETE FROM bizcity_read.ledger_lines WHERE tenant_id = ${tenantId}`.execute(db)).rejects.toThrow(/chỉ đọc/);
  });
});

describe('ctx.ledger.query trong action', () => {
  it('module đọc số dư theo mã qua ctx, trong giao dịch của action', async () => {
    const def = defineAction({
      id: 'ke-toan.so-du-lq.xem', title: 'Số dư theo đối tượng (test)', permission: 'ledger:read', effect: 'read', idempotency: 'none',
      input: z.object({ partnerCode: z.string() }), output: z.array(z.any()), expose: {},
      handler: (ctx, input) => ctx.ledger.query({ to: '2026-10-31', accounts: ['131'], partnerCode: input.partnerCode }),
    });
    const auth: AuthContext = { tenantId, actor: 'user:test', actorName: 'Test', kind: 'user', role: null, permissions: new Set<Permission>(['ledger:read']) };
    const res = await runAction(def, { partnerCode: 'KH-LQ' }, { auth, requestId: 'lq-1' });
    expect(res.data).toEqual([{ accountCode: '1311', opening: 0, debit: 162000, credit: 30000, closing: 132000 }]);
  });
});
