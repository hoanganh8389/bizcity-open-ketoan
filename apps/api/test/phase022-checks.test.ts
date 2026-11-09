/**
 * PHASE-022 W2 — kiểm mới cho khoảng trống của danh mục giả định lỗi; mỗi ca: gây lỗi → phát hiện → chạy phương án → kiểm lại (R-FIX-5):
 *   CASH_NEGATIVE, ACCOUNT_WRONG_SIDE (F22-CASH-01, F22-LEDGER-08) · TRANSIT_NONZERO (F22-CASH-02) · DEBT_MATCH_LEDGER (F22-DEBT-01)
 *   COGS_STALE (F22-STK-04) · STOCK_ADJUST_NO_REASON (F22-STK-09) · DEPRECIATION_OPEN (F22-CLOSE-08) · CONFORMANCE_STALE (F22-ENV-12)
 *   Mọi kiểm có remedy (bước, màn, kiểm lại).
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { sql } from 'kysely';
import { db } from '../src/db/client.js';
import { runDiagnostics, type DiagLayer } from '../src/modules/system/diagnostics.js';
import { call, setupTenant, type TestCtx } from './helpers.js';

let ctx: TestCtx;
let tenantId = '';
const diag = async (code: string, scope: { from?: string; to?: string } = {}, layer: DiagLayer = 'L3') =>
  (await runDiagnostics({ tenantId, ...scope }, { layer, codes: [code] })).checks[0]!;
const post = async (doc: unknown) => {
  const r = await call(ctx, 'POST', '/api/v1/documents', doc);
  expect(r.body.data?.status, JSON.stringify(r.body)).toBe('posted');
};
const voucher = async (docType: string, docDate: string, debitAccount: string, creditAccount: string, amount: number) => {
  const r = await call(ctx, 'POST', '/api/v1/vouchers', { docType, branchCode: 'CN01', docDate, description: 'PHASE-022 test', lines: [{ debitAccount, creditAccount, amount }] });
  expect(r.status, JSON.stringify(r.body)).toBeLessThan(300);
};
const purchase = (key: string, date: string, qty: number) => ({
  docType: 'purchase', docKey: key, branchCode: 'CN01', docNo: key, docDate: date, partner: { code: 'NCC-01', name: 'Nhà cung cấp 01' },
  lines: [{ lineKey: 'l1', sku: 'SUA01', name: 'Sữa bột 900g', unit: 'Hộp', qty, amountBeforeTax: qty * 60000, taxCode: 'V08', taxAmount: 0 }],
  totals: { beforeTax: qty * 60000, tax: 0, total: qty * 60000 },
});
const sale = (key: string, date: string, qty: number) => ({
  docType: 'sale', docKey: key, branchCode: 'CN01', docNo: key, docDate: date,
  lines: [{ lineKey: 'l1', sku: 'SUA01', name: 'Sữa bột 900g', unit: 'Hộp', qty, amountBeforeTax: qty * 100000, taxCode: 'R08', taxAmount: qty * 8000 }],
  payments: [{ methodCode: 'TM', amount: qty * 108000 }], totals: { beforeTax: qty * 100000, tax: qty * 8000, total: qty * 108000 },
});

beforeAll(async () => {
  ctx = await setupTenant();
  tenantId = (await db.selectFrom('tenants').select('id').where('code', '=', ctx.tenantCode).executeTakeFirstOrThrow()).id;
});
afterAll(async () => {
  await ctx.app.close();
});

describe('Số dư', () => {
  it('CASH_NEGATIVE + ACCOUNT_WRONG_SIDE: chi trước khi có thu ⇒ quỹ âm từ ngày chi, tiền mặt dư Có; thu đúng ngày ⇒ hết', async () => {
    await voucher('payment', '2026-03-10', '64211', '1111', 500000);
    const neg = await diag('CASH_NEGATIVE');
    expect(neg).toMatchObject({ level: 'warn', count: 1, sample: ['CN01:1111@2026-03-10'] });
    expect(neg.remedy?.steps[0]?.screen?.code).toBe('ACC55');
    expect((await diag('ACCOUNT_WRONG_SIDE')).sample).toContain('1111:dư Có');
    await voucher('receipt', '2026-03-09', '1111', '5158', 2000000);
    expect(await diag('CASH_NEGATIVE')).toMatchObject({ level: 'pass', count: 0 });
    expect((await diag('ACCOUNT_WRONG_SIDE')).sample).not.toContain('1111:dư Có');
  });

  // [2026-11-09 11:20 PM Johnny Chu - Chu Hoàng Anh] PHASE-032 — B2b: hàng / tiền đi đường trong 30 ngày là hợp lệ (không báo); chỉ báo khi còn treo quá 30 ngày
  it('TRANSIT_NONZERO: tiền chuyển chi nhánh khác chưa nhận — trong 30 ngày là hợp lệ; quá 30 ngày ⇒ còn treo', async () => {
    expect((await call(ctx, 'POST', '/api/v1/branches', { code: 'CN02', name: 'Cửa hàng 02' })).status).toBeLessThan(300);
    await post({ docType: 'cash_transfer', docKey: 'CT-0305', branchCode: 'CN01', toBranchCode: 'CN02', docNo: 'CT-0305', docDate: '2026-03-05',
      fromMethodCode: 'TM', toMethodCode: 'CK', status: 'sent', totals: { total: 300000 } });
    // Ngày xét 20/03: phiếu mới đi 15 ngày — đang trên đường, không phải lỗi (trước đây phép kiểm báo sai ca này).
    expect(await diag('TRANSIT_NONZERO', { to: '2026-03-20' })).toMatchObject({ level: 'pass', count: 0 });
    // Ngày xét 30/04: đã quá 30 ngày mà nơi nhận chưa ghi ⇒ còn treo.
    const d = await diag('TRANSIT_NONZERO', { to: '2026-04-30' });
    expect(d).toMatchObject({ level: 'warn', count: 1 });
    expect(d.sample[0]).toMatch(/^11319:còn treo quá 30 ngày$/);
    expect(d.remedy?.verify.code).toBe('TRANSIT_NONZERO');
  });

  it('DEBT_MATCH_LEDGER: sổ công nợ khớp sổ cái; khoản công nợ bị lệch (giả lập hỏng dữ liệu) ⇒ báo đối tượng:tài khoản', async () => {
    await post(purchase('NHAP-NO', '2026-03-02', 10));
    expect(await diag('DEBT_MATCH_LEDGER')).toMatchObject({ level: 'pass', count: 0 });
    await sql`UPDATE debt_items SET settled_amount = amount WHERE tenant_id = ${tenantId} AND doc_no = 'NHAP-NO'`.execute(db);
    const d = await diag('DEBT_MATCH_LEDGER');
    expect(d).toMatchObject({ level: 'warn', count: 1 });
    expect(d.sample[0]).toMatch(/^NCC-01:/);
    await sql`UPDATE debt_items SET settled_amount = 0 WHERE tenant_id = ${tenantId} AND doc_no = 'NHAP-NO'`.execute(db);
    expect(await diag('DEBT_MATCH_LEDGER')).toMatchObject({ count: 0 });
  });
});

describe('Kho', () => {
  it('COGS_STALE: phiếu nhập tháng 3 về sau khi đã tính giá vốn tháng 3 ⇒ lỗi thời; tính lại ⇒ hết', async () => {
    await post(sale('BAN-0304', '2026-03-04', 2));
    expect((await call(ctx, 'POST', '/api/v1/inventory/costing', { period: '2026-03' })).status).toBe(200);
    expect(await diag('COGS_STALE')).toMatchObject({ count: 0 });
    await post(purchase('NHAP-TRE', '2026-03-20', 3));
    const d = await diag('COGS_STALE');
    expect(d).toMatchObject({ level: 'warn', count: 1, sample: ['CN01:2026-03'] });
    expect((await call(ctx, 'POST', '/api/v1/inventory/costing', { period: '2026-03' })).status).toBe(200);
    expect(await diag('COGS_STALE')).toMatchObject({ count: 0 });
  });

  it('STOCK_ADJUST_NO_REASON: phiếu điều chỉnh kho không lý do ⇒ cảnh báo (hoặc bị cửa nạp chặn)', async () => {
    expect(await diag('STOCK_ADJUST_NO_REASON', { from: '2026-04-01', to: '2026-04-30' })).toMatchObject({ count: 0 });
    const r = await call(ctx, 'POST', '/api/v1/documents', { docType: 'stock_adjustment', docKey: 'DC-KLD', branchCode: 'CN01', docNo: 'DC-KLD', docDate: '2026-04-05', direction: 'increase',
      lines: [{ lineKey: 'l1', sku: 'SUA01', qty: 1, amount: 60000 }], totals: { total: 60000 } });
    if (r.status < 300 && r.body.data?.status === 'posted') {
      expect(await diag('STOCK_ADJUST_NO_REASON', { from: '2026-04-01', to: '2026-04-30' })).toMatchObject({ level: 'warn', count: 1, sample: [expect.stringContaining('DC-KLD')] });
    } else {
      expect(r.status).toBeGreaterThanOrEqual(400); // cửa nạp đã chặn phiếu thiếu lý do: ca này là "chặn đúng"
    }
  });
});

describe('Khấu hao, lịch kiểm chuẩn', () => {
  it('DEPRECIATION_OPEN: tài sản dùng từ tháng 7 chưa trích ⇒ báo các tháng đến hạn; trích bù tới tháng đến hạn cuối ⇒ hết', async () => {
    const add = await call(ctx, 'POST', '/api/v1/assets', { code: 'MAYP22', name: 'Máy in', kind: 'fixed_asset', categoryCode: 'TS-MAY', branchCode: 'CN01', startDate: '2026-07-01',
      originalCost: 12000000, usefulLifeMonths: 24, assetAccount: '2112', depreciationAccount: '2141', expenseAccount: '6424' });
    expect(add.status, JSON.stringify(add.body)).toBe(201);
    const d = await diag('DEPRECIATION_OPEN');
    expect(d.level).toBe('warn');
    expect(d.sample[0]).toBe('CN01:2026-07');
    // tháng đến hạn cuối = tháng trước tháng của (hôm nay − 30 ngày), như kiểm
    const t = new Date(Date.now() - 30 * 86_400_000);
    const last = new Date(Date.UTC(t.getUTCFullYear(), t.getUTCMonth() - 1, 1)).toISOString().slice(0, 7);
    expect((await call(ctx, 'POST', '/api/v1/assets/depreciation', { period: last, catchUp: true })).status).toBe(200);
    const after = await diag('DEPRECIATION_OPEN');
    expect(after.count, JSON.stringify(after.sample)).toBe(0);
  });

  it('CONFORMANCE_STALE: lượt gần nhất quá 2 ngày ⇒ cảnh báo; chạy kiểm chuẩn ⇒ hết; đơn vị mới chưa có lượt thì không báo', async () => {
    expect(await diag('CONFORMANCE_STALE', {}, 'L3')).toMatchObject({ level: 'pass', count: 0 });
    await sql`INSERT INTO conformance_runs (tenant_id, as_of, layers, kit_hash, result, counts, report, actor, created_at)
              VALUES (${tenantId}, current_date - 3, ARRAY['module'], 'sha256:test', 'REVIEW_REQUIRED', '{}'::jsonb, '{}'::jsonb, 'system:nightly', now() - interval '3 days')`.execute(db);
    expect(await diag('CONFORMANCE_STALE', {}, 'L3')).toMatchObject({ level: 'warn', count: 1 });
    expect((await call(ctx, 'POST', '/api/v1/conformance/runs', {})).status).toBe(201);
    expect(await diag('CONFORMANCE_STALE', {}, 'L3')).toMatchObject({ count: 0 });
  });
});
