// [2026-11-03 07:17 PM Johnny Chu - Chu Hoàng Anh] ADR-0020 — trụ cột 7: kèm tự chẩn đoán INVENTORY_LEDGER_MISMATCH (F22-STK-11): 0 khi khớp, đúng mẫu khi lệch
// [2026-11-03 06:40 PM Johnny Chu - Chu Hoàng Anh] PHASE-024 — đối chiếu sổ chi tiết kho với số dư tài khoản hàng tồn kho: chưa định giá → khớp → bút toán kho không gắn mặt hàng
/**
 * GET /api/v1/inventory/reconcile. Kịch bản một chi nhánh, một mặt hàng, tháng 10/2026:
 *   CN01 nhập 10 hộp × 70.000, bán 2 hộp (chưa tính giá vốn)   → dòng "uncosted", chưa kết luận
 *   tính giá vốn tháng 10                                       → sổ kho 560.000 = sổ cái 560.000, "ok"
 *   phiếu kế toán ghi Nợ TK kho / Có tiền mặt 500.000, không mã → dòng "no_product", tổng theo tài khoản lệch 500.000
 * Tự chẩn đoán INVENTORY_LEDGER_MISMATCH (F22-STK-11) đọc cùng dữ liệu: bỏ qua cặp chưa định giá, 0 khi khớp, mẫu "CN01:" khi lệch.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { db } from '../src/db/client.js';
import { runDiagnostics } from '../src/modules/system/diagnostics.js';
import { call, setupTenant, type TestCtx } from './helpers.js';

let ctx: TestCtx;
let tenantId = '';
let inventoryAccount = '';

const reconcile = () => call(ctx, 'GET', '/api/v1/inventory/reconcile?period=2026-10');
const mismatch = async () => (await runDiagnostics({ tenantId, from: '2026-10-01', to: '2026-10-31' }, { layer: 'L3', codes: ['INVENTORY_LEDGER_MISMATCH'] })).checks[0]!;

beforeAll(async () => {
  ctx = await setupTenant();
  tenantId = (await db.selectFrom('tenants').select('id').where('code', '=', ctx.tenantCode).executeTakeFirstOrThrow()).id;
  for (const d of [
    {
      docType: 'purchase', docKey: 'NM-01', branchCode: 'CN01', docNo: 'NM-01', docDate: '2026-10-02',
      partner: { code: 'NCC-01', name: 'Nhà cung cấp 01' },
      lines: [{ lineKey: 'l1', sku: 'SUA01', name: 'Sữa bột 900g', unit: 'Hộp', qty: 10, amountBeforeTax: 700000, taxCode: 'V08', taxAmount: 0 }],
      totals: { beforeTax: 700000, tax: 0, total: 700000 },
    },
    {
      docType: 'sale', docKey: 'BAN-01', branchCode: 'CN01', docNo: 'BAN-01', docDate: '2026-10-04',
      lines: [{ lineKey: 'l1', sku: 'SUA01', name: 'Sữa bột 900g', unit: 'Hộp', qty: 2, amountBeforeTax: 200000, taxCode: 'R08', taxAmount: 16000 }],
      payments: [{ methodCode: 'TM', amount: 216000 }],
      totals: { beforeTax: 200000, tax: 16000, total: 216000 },
    },
  ]) {
    const r = await call(ctx, 'POST', '/api/v1/documents', d);
    expect(r.body.data.status, JSON.stringify(r.body)).toBe('posted');
  }
});
afterAll(async () => {
  await ctx.app.close();
});

describe('Đối chiếu sổ chi tiết kho với sổ cái', () => {
  it('kỳ sai dạng: 400', async () => {
    expect((await call(ctx, 'GET', '/api/v1/inventory/reconcile?period=2026-13')).status).toBe(400);
  });

  it('chưa tính giá vốn: dòng bán chưa định giá → "uncosted", không kết luận lệch', async () => {
    const res = await reconcile();
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    const d = res.body.data;
    expect(d.to).toBe('2026-10-31');
    expect(d.accounts.length).toBeGreaterThan(0);
    inventoryAccount = d.defaultAccount;
    expect(d.accounts).toContain(inventoryAccount);
    expect(d.rows).toEqual([expect.objectContaining({ branchCode: 'CN01', sku: 'SUA01', qty: 8, subledgerValue: 700000, ledgerValue: 700000, uncosted: 1, status: 'uncosted' })]);
    expect(await mismatch()).toMatchObject({ code: 'INVENTORY_LEDGER_MISMATCH', level: 'empty', examined: 0, count: 0, sample: [] });
  });

  it('sau khi tính giá vốn: sổ kho = sổ cái theo mặt hàng và theo tài khoản', async () => {
    expect((await call(ctx, 'POST', '/api/v1/inventory/costing', { period: '2026-10' })).status).toBe(200);
    const d = (await reconcile()).body.data;
    expect(d.rows).toEqual([expect.objectContaining({
      branchCode: 'CN01', sku: 'SUA01', qty: 8, subledgerValue: 560000, ledgerValue: 560000, diff: 0, uncosted: 0, expectedAccount: inventoryAccount, status: 'ok',
    })]);
    expect(d.totals.find((t: { account: string }) => t.account === inventoryAccount)).toEqual({ account: inventoryAccount, ledgerValue: 560000, subledgerValue: 560000, diff: 0 });
    expect(d.summary).toMatchObject({ ok: 1, diff: 0, uncosted: 0, wrong_account: 0, no_product: 0 });
    expect(await mismatch()).toMatchObject({ examined: 1, count: 0, sample: [] });
  });

  it('phiếu kế toán ghi vào tài khoản kho không gắn mặt hàng → "no_product", tổng tài khoản lệch đúng số đó', async () => {
    const v = await call(ctx, 'POST', '/api/v1/vouchers', {
      docType: 'manual', branchCode: 'CN01', docDate: '2026-10-15', description: 'Ghi tăng kho không có phiếu nhập',
      lines: [{ debitAccount: inventoryAccount, creditAccount: '1111', amount: 500000 }],
    });
    expect(v.status, JSON.stringify(v.body)).toBe(201);
    const d = (await reconcile()).body.data;
    expect(d.rows[0]).toMatchObject({ branchCode: 'CN01', sku: '', ledgerValue: 500000, subledgerValue: 0, status: 'no_product' });
    expect(d.rows.find((r: { sku: string }) => r.sku === 'SUA01')).toMatchObject({ status: 'ok' });
    expect(d.totals.find((t: { account: string }) => t.account === inventoryAccount)).toEqual({ account: inventoryAccount, ledgerValue: 1060000, subledgerValue: 560000, diff: 500000 });
    expect(d.summary).toMatchObject({ ok: 1, no_product: 1 });
    const m = await mismatch();
    expect(m).toMatchObject({ level: 'warn', examined: 2, count: 1, sample: ['CN01:'] });
    expect(m.remedy?.verify).toEqual({ code: 'INVENTORY_LEDGER_MISMATCH' });
  });
});
