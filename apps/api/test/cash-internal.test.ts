/**
 * Chuyển tiền giữa chi nhánh, thu hộ / trả hộ, bán nội bộ theo giá bán (XCN), định giá hàng trả NCC theo tồn đầu.
 * CN01, CN02 cùng nhóm (chưa gán đơn vị hạch toán); KHO-MB thuộc đơn vị DV-MB.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { sql } from 'kysely';
import { db } from '../src/db/client.js';
import { returnValue } from '../src/modules/inventory/costing.service.js';
import { call, setupTenant, type TestCtx } from './helpers.js';

let ctx: TestCtx;
let tenantId: string;

beforeAll(async () => {
  ctx = await setupTenant();
  tenantId = (await db.selectFrom('tenants').select('id').where('code', '=', ctx.tenantCode).executeTakeFirstOrThrow()).id;
  await call(ctx, 'POST', '/api/v1/branches', { code: 'CN02', name: 'Cửa hàng 02' });
  await call(ctx, 'POST', '/api/v1/branches', { code: 'KHO-MB', name: 'Kho miền Bắc', accountingUnitCode: 'DV-MB' });
  // Lý do chuyển tiền chép từ HTsoft (CPCT / TPCT không ghi sổ) và tài khoản ngân hàng cho phiếu chuyển tiền.
  for (const [code, r] of Object.entries({
    CPCT: { name: 'Phiếu Chi chuyển tiền', kind: 'payment', counterAccount: '1111', flags: { postToLedger: false } },
    TPCT: { name: 'Phiếu Thu chuyển tiền', kind: 'receipt', counterAccount: '1111', flags: { postToLedger: false } },
    TBNH: { name: 'Thu tiền BH các CN khác', kind: 'receipt', counterAccount: '13681', flags: { postToLedger: true } },
    TKH3: { name: 'Thu P.Trả khác', kind: 'receipt', counterAccount: '13881', flags: { postToLedger: true } },
  })) expect((await call(ctx, 'PUT', `/api/v1/posting/reasons/${code}`, r)).status, code).toBe(200);
  for (const [code, accountCode] of [['NH-A', '11210006'], ['NH-B', '11210007']]) {
    const r = await call(ctx, 'PUT', `/api/v1/bank-accounts/${code}`, { bankName: code, bankBranch: '', accountNo: code, holder: 'TGS', accountCode });
    expect(r.status, JSON.stringify(r.body)).toBe(200);
  }
});
afterAll(async () => {
  await ctx.app.close();
});

const post = async (doc: unknown) => {
  const r = await call(ctx, 'POST', '/api/v1/documents', doc);
  expect(r.body.data?.status, JSON.stringify(r.body)).toBe('posted');
  return r.body.data;
};

/** Dòng sổ còn hiệu lực của chứng từ: "chi nhánh tài khoản[đối tượng] Nợ/Có số tiền". */
async function lines(key: string) {
  const res = await sql<{ branch: string; account: string; partner: string | null; debit: string; credit: string }>`
    SELECT br.code AS branch, l.account_code AS account, p.code AS partner, l.debit, l.credit
      FROM accounting_events d JOIN ledger_entries e ON e.event_id = d.id
      JOIN ledger_lines l ON l.entry_id = e.id
      JOIN branches br ON br.id = e.branch_id LEFT JOIN partners p ON p.id = l.partner_id
     WHERE d.tenant_id = ${tenantId} AND d.doc_key = ${key} AND e.status = 'posted' AND NOT e.is_reversal
     ORDER BY br.code, l.line_no`.execute(db);
  return res.rows.map((r) => `${r.branch} ${r.account}${r.partner ? `[${r.partner}]` : ''} ${Number(r.debit) ? `Nợ ${Number(r.debit)}` : `Có ${Number(r.credit)}`}`);
}

async function balance(account: string) {
  const r = await sql<{ v: string | null }>`
    SELECT SUM(l.debit - l.credit) AS v FROM ledger_lines l
     WHERE l.tenant_id = ${tenantId} AND l.account_code = ${account}`.execute(db);
  return Number(r.rows[0]?.v ?? 0);
}

const transfer = (over: Record<string, unknown>) => ({
  docType: 'cash_transfer', docKey: 'CT-1', branchCode: 'CN01', toBranchCode: 'CN02', docNo: 'CT-1', docDate: '2026-11-02',
  fromMethodCode: 'TM', toMethodCode: 'CK', status: 'sent', totals: { total: 5000000 }, ...over,
});

describe('Chuyển tiền', () => {
  it('đã chuyển: nơi chuyển Nợ 11319 / Có 1111', async () => {
    await post(transfer({}));
    expect(await lines('CT-1')).toEqual(['CN01 11319[CN-CN02] Nợ 5000000', 'CN01 1111 Có 5000000']);
    expect(await balance('11319')).toBe(5000000);
  });

  it('nơi nhận xác nhận (phiên bản 2): Nợ tiền gửi / Có 11319, tiền đang chuyển về 0', async () => {
    await post(transfer({ version: 2, status: 'received' }));
    expect(await lines('CT-1')).toEqual(['CN01 11319[CN-CN02] Nợ 5000000', 'CN01 1111 Có 5000000', 'CN02 11210005 Nợ 5000000', 'CN02 11319[CN-CN01] Có 5000000']);
    expect(await balance('11319')).toBe(0);
  });

  it('cùng chi nhánh, nộp tiền quỹ vào ngân hàng: một bút toán Nợ 112 / Có 1111', async () => {
    await post(transfer({ docKey: 'CT-2', docNo: 'CT-2', toBranchCode: 'CN01' }));
    expect(await lines('CT-2')).toEqual(['CN01 11210005 Nợ 5000000', 'CN01 1111 Có 5000000']);
  });

  it('khác đơn vị hạch toán (cấp tiền): nơi chuyển Nợ 13681, nơi nhận Có 33681, đối tượng là chi nhánh bên kia', async () => {
    await post(transfer({ docKey: 'CT-3', docNo: 'CT-3', toBranchCode: 'KHO-MB', status: 'received', totals: { total: 1000000 } }));
    expect(await lines('CT-3')).toEqual(['CN01 13681[CN-KHO-MB] Nợ 1000000', 'CN01 1111 Có 1000000', 'KHO-MB 11210005 Nợ 1000000', 'KHO-MB 33681[CN-CN01] Có 1000000']);
  });

  it('lý do thu TBNH (đối ứng 13681, trả nợ nội bộ): nơi chuyển Nợ 33681, nơi nhận Có 13681', async () => {
    await post(transfer({ docKey: 'CT-4', docNo: 'CT-4', toBranchCode: 'KHO-MB', toReasonCode: 'TBNH', status: 'received', totals: { total: 700000 } }));
    expect(await lines('CT-4')).toEqual(['CN01 33681[CN-KHO-MB] Nợ 700000', 'CN01 1111 Có 700000', 'KHO-MB 11210005 Nợ 700000', 'KHO-MB 13681[CN-CN01] Có 700000']);
  });

  it('lý do chi CPCT, lý do thu TPCT (không ghi sổ, chép từ HTsoft): vẫn qua 11319 như mặc định', async () => {
    await post(transfer({ docKey: 'CT-5', docNo: 'CT-5', reasonCode: 'CPCT', toReasonCode: 'TPCT', status: 'received', totals: { total: 300000 } }));
    expect(await lines('CT-5')).toEqual(['CN01 11319[CN-CN02] Nợ 300000', 'CN01 1111 Có 300000', 'CN02 11210005 Nợ 300000', 'CN02 11319[CN-CN01] Có 300000']);
  });

  it('có mã tài khoản ngân hàng: tiền lấy theo tài khoản của ngân hàng (rút NH nơi chuyển, nộp NH nơi nhận)', async () => {
    await post(transfer({ docKey: 'CT-6', docNo: 'CT-6', fromBankCode: 'NH-A', toBankCode: 'NH-B', status: 'received', totals: { total: 200000 } }));
    expect(await lines('CT-6')).toEqual(['CN01 11319[CN-CN02] Nợ 200000', 'CN01 11210006 Có 200000', 'CN02 11210007 Nợ 200000', 'CN02 11319[CN-CN01] Có 200000']);
  });

  it('kế toán xác nhận đã nhận tiền (phiếu sent): thêm bút toán nơi nhận; khoá API không xác nhận được', async () => {
    const doc = await post(transfer({ docKey: 'CT-9', docNo: 'CT-9', totals: { total: 400000 } }));
    expect(await lines('CT-9')).toEqual(['CN01 11319[CN-CN02] Nợ 400000', 'CN01 1111 Có 400000']);
    const id = (await db.selectFrom('accounting_events').select('id').where('tenant_id', '=', tenantId).where('doc_key', '=', 'CT-9').executeTakeFirstOrThrow()).id;
    const byKey = await ctx.app.inject({ method: 'POST', url: `/api/v1/documents/${id}/confirm-receipt`, payload: {}, headers: { 'x-api-key': ctx.apiKey } });
    expect(byKey.statusCode).toBe(403);
    const r = await call(ctx, 'POST', `/api/v1/documents/${id}/confirm-receipt`, { note: 'Đã đối chiếu sao kê' });
    expect(r.status, JSON.stringify(r.body)).toBe(200);
    expect(await lines('CT-9')).toEqual(['CN01 11319[CN-CN02] Nợ 400000', 'CN01 1111 Có 400000', 'CN02 11210005 Nợ 400000', 'CN02 11319[CN-CN01] Có 400000']);
    expect((await call(ctx, 'POST', `/api/v1/documents/${id}/confirm-receipt`, {})).status).toBe(409);
    const list = await call(ctx, 'GET', '/api/v1/documents/receipt-confirmations?docKeys=CT-9,CT-1');
    expect(list.body.data).toEqual([expect.objectContaining({ docKey: 'CT-9', amount: 400000, valid: true })]);
    expect(doc.status).toBe('posted');
  });

  it('nguồn gửi bản mới đổi số tiền sau khi xác nhận: xác nhận hết hiệu lực, bút toán nơi nhận bị đảo; bỏ xác nhận', async () => {
    await post(transfer({ docKey: 'CT-9', docNo: 'CT-9', version: 2, totals: { total: 450000 } }));
    expect(await lines('CT-9')).toEqual(['CN01 11319[CN-CN02] Nợ 450000', 'CN01 1111 Có 450000']);
    const list = await call(ctx, 'GET', '/api/v1/documents/receipt-confirmations?docKeys=CT-9');
    expect(list.body.data[0].valid).toBe(false);
    const id = (await db.selectFrom('accounting_events').select('id').where('tenant_id', '=', tenantId).where('doc_key', '=', 'CT-9').executeTakeFirstOrThrow()).id;
    // Xác nhận lại theo nội dung mới, rồi bỏ xác nhận: bút toán nơi nhận ghi rồi bị đảo.
    expect((await call(ctx, 'POST', `/api/v1/documents/${id}/confirm-receipt`, {})).status).toBe(200);
    expect(await lines('CT-9')).toContain('CN02 11319[CN-CN01] Có 450000');
    expect((await call(ctx, 'DELETE', `/api/v1/documents/${id}/confirm-receipt`)).status).toBe(200);
    expect(await lines('CT-9')).toEqual(['CN01 11319[CN-CN02] Nợ 450000', 'CN01 1111 Có 450000']);
  });

  it('màn Q2: danh sách phiếu chuyển tiền theo trạng thái nhận tiền, xác nhận nhiều phiếu một lần', async () => {
    await post(transfer({ docKey: 'CT-10', docNo: 'CT-10', totals: { total: 100000 } }));
    await post(transfer({ docKey: 'CT-11', docNo: 'CT-11', toBankCode: 'NH-B', totals: { total: 200000 } }));
    const waiting = await call(ctx, 'GET', '/api/v1/documents/cash-transfers?from=2026-11-01&to=2026-11-30&receipt=waiting');
    expect(waiting.status, JSON.stringify(waiting.body)).toBe(200);
    const mine = (waiting.body.data as { docNo: string }[]).filter((r) => ['CT-10', 'CT-11'].includes(r.docNo));
    expect(mine.map((r) => r.docNo).sort()).toEqual(['CT-10', 'CT-11']);
    expect(mine.find((r) => r.docNo === 'CT-11')).toEqual(expect.objectContaining({ fromBranchCode: 'CN01', toBranchCode: 'CN02', toBankCode: 'NH-B', total: 200000, receipt: 'waiting' }));
    // Lọc theo chi nhánh nhận cũng ra phiếu.
    const byTo = await call(ctx, 'GET', '/api/v1/documents/cash-transfers?from=2026-11-01&to=2026-11-30&branchCodes=CN02');
    expect((byTo.body.data as { docNo: string }[]).some((r) => r.docNo === 'CT-10')).toBe(true);

    const ids = (await db.selectFrom('accounting_events').select('id').where('tenant_id', '=', tenantId).where('doc_key', 'in', ['CT-10', 'CT-11']).execute()).map((r) => String(r.id));
    const res = await call(ctx, 'POST', '/api/v1/documents/confirm-receipts', { ids, note: 'Đối chiếu sao kê' });
    expect(res.body.data, JSON.stringify(res.body)).toEqual({ confirmed: 2, errors: [] });
    expect(await lines('CT-11')).toContain('CN02 11210007 Nợ 200000');
    const confirmed = await call(ctx, 'GET', '/api/v1/documents/cash-transfers?from=2026-11-01&to=2026-11-30&receipt=confirmed');
    expect((confirmed.body.data as { docNo: string; receipt: string; confirmedBy: string | null }[]).filter((r) => ['CT-10', 'CT-11'].includes(r.docNo)).every((r) => r.receipt === 'confirmed' && r.confirmedBy)).toBe(true);
  });

  it('mã tài khoản ngân hàng chưa khai báo / lý do thu chưa hỗ trợ: lỗi định khoản, không ghi sổ', async () => {
    const r1 = await call(ctx, 'POST', '/api/v1/documents', transfer({ docKey: 'CT-7', docNo: 'CT-7', fromBankCode: 'KHONG-CO', status: 'received' }));
    expect(r1.body.data?.status, JSON.stringify(r1.body)).toBe('error');
    expect(JSON.stringify(r1.body)).toContain('KHONG-CO');
    const r2 = await call(ctx, 'POST', '/api/v1/documents', transfer({ docKey: 'CT-8', docNo: 'CT-8', toReasonCode: 'TKH3', status: 'received' }));
    expect(r2.body.data?.status, JSON.stringify(r2.body)).toBe('error');
    expect(JSON.stringify(r2.body)).toContain('TKH3');
  });
});

describe('Thu hộ, trả hộ', () => {
  it('thu tiền khách tại CN01 cho công nợ CN01 và CN02 (thu hộ), thu thừa ghi vào công nợ', async () => {
    await post({
      docType: 'customer_payment', docKey: 'PT-1', branchCode: 'CN01', docNo: 'PT-1', docDate: '2026-11-05',
      partner: { code: 'KH01', name: 'Khách 01' }, methodCode: 'TM',
      lines: [{ lineKey: '1', amount: 300000 }, { lineKey: '2', amount: 150000, branchCode: 'CN02', invoiceDocKey: 'HD-CN02-9' }],
      totals: { total: 500000 },
    });
    // Dòng tiền ghi kèm khách để tra cứu (tài khoản tiền không theo dõi đối tượng nên không ảnh hưởng số dư).
    expect(await lines('PT-1')).toEqual([
      'CN01 1111[KH01] Nợ 350000', 'CN01 1311[KH01] Có 350000',
      'CN01 1111[KH01] Nợ 150000', 'CN01 33681[CN-CN02] Có 150000',
      'CN02 13681[CN-CN01] Nợ 150000', 'CN02 1311[KH01] Có 150000',
    ]);
  });

  it('trả tiền NCC tại CN02 cho công nợ của CN01 (trả hộ)', async () => {
    await post({
      docType: 'supplier_payment', docKey: 'PC-1', branchCode: 'CN02', docNo: 'PC-1', docDate: '2026-11-06',
      partner: { code: 'NCC01', name: 'Nhà cung cấp 01' }, methodCode: 'CK',
      lines: [{ lineKey: '1', amount: 200000, branchCode: 'CN01' }],
      totals: { total: 200000 },
    });
    expect(await lines('PC-1')).toEqual(['CN01 3312[NCC01] Nợ 200000', 'CN01 33681[CN-CN02] Có 200000', 'CN02 13681[CN-CN01] Nợ 200000', 'CN02 11210005[NCC01] Có 200000']);
  });

  it('tổng phân bổ lớn hơn tổng phiếu bị từ chối', async () => {
    const r = await call(ctx, 'POST', '/api/v1/documents', {
      docType: 'customer_payment', docKey: 'PT-X', branchCode: 'CN01', docNo: 'PT-X', docDate: '2026-11-05',
      partner: { code: 'KH01' }, methodCode: 'TM', lines: [{ lineKey: '1', amount: 600000 }], totals: { total: 500000 },
    });
    expect(r.status).toBe(400);
  });

  it('sổ vẫn cân', async () => {
    const r = await sql<{ d: string; c: string }>`SELECT SUM(debit) AS d, SUM(credit) AS c FROM ledger_lines WHERE tenant_id = ${tenantId}`.execute(db);
    expect(r.rows[0]!.d).toBe(r.rows[0]!.c);
  });
});

describe('Bán nội bộ theo giá bán (XCN) và giá vốn', () => {
  it('Nợ 13681 / Có 51116; giá vốn nội bộ 6326 = giá bán, ghi ngay', async () => {
    await post({ docType: 'purchase', docKey: 'NM-11', branchCode: 'CN01', docNo: 'NM-11', docDate: '2026-11-01', partner: { code: 'NCC01' },
      lines: [{ lineKey: '1', sku: 'SUA02', qty: 10, amountBeforeTax: 700000, taxCode: 'V08', taxAmount: 0 }], totals: { beforeTax: 700000, tax: 0, total: 700000 } });
    await post({ docType: 'sale', docKey: 'XCN-1', branchCode: 'CN01', docNo: 'XCN-1', docDate: '2026-11-03', reasonCode: 'XCN', partner: { code: 'CN-CN02' },
      lines: [{ lineKey: '1', sku: 'SUA02', qty: 2, amountBeforeTax: 200000, taxCode: 'R08', taxAmount: 16000 }], totals: { beforeTax: 200000, tax: 16000, total: 216000 } });
    expect(await lines('XCN-1')).toEqual(['CN01 13681[CN-CN02] Nợ 200000', 'CN01 51116 Có 200000', 'CN01 13681[CN-CN02] Nợ 16000', 'CN01 33311 Có 16000', 'CN01 6326 Nợ 200000', 'CN01 1561 Có 200000']);
  });

  it('trả NCC định giá theo tồn đầu; hàng bán theo giá bán bị trừ khỏi công thức đơn giá', async () => {
    // Tháng 11: nhập 10 × 70.000, bán nội bộ 2 theo giá 100.000 → đơn giá = (700.000 − 200.000) / (10 − 2) = 62.500
    let r = await call(ctx, 'POST', '/api/v1/inventory/costing', { period: '2026-11' });
    expect(r.status, JSON.stringify(r.body)).toBe(200);
    let costs = await call(ctx, 'GET', '/api/v1/inventory/costs?period=2026-11&search=SUA02');
    expect(costs.body.data[0]).toMatchObject({ unitCost: 62500, closingQty: 8, closingValue: 500000 });
    expect(r.body.data.branches).toEqual([]); // không có hàng xuất chưa định giá

    // Tháng 12: tồn đầu 8 = 500.000 (62.500). Trả NCC 2 hộp với tiền 120.000 (60.000 ≤ 62.500) → định giá 2 × 62.500 = 125.000
    await post({ docType: 'purchase_return', docKey: 'TN-12', branchCode: 'CN01', docNo: 'TN-12', docDate: '2026-12-02', partner: { code: 'NCC01' },
      lines: [{ lineKey: '1', sku: 'SUA02', qty: 2, amountBeforeTax: 120000, taxCode: 'V08', taxAmount: 0 }], totals: { beforeTax: 120000, tax: 0, total: 120000 } });
    r = await call(ctx, 'POST', '/api/v1/inventory/costing', { period: '2026-12' });
    costs = await call(ctx, 'GET', '/api/v1/inventory/costs?period=2026-12&search=SUA02');
    expect(costs.body.data[0]).toMatchObject({ openingQty: 8, openingValue: 500000, inQty: -2, inValue: -125000, unitCost: 62500, closingQty: 6 });
  });

  it('lý do trả khác lấy thành tiền − thuế trên phiếu; nhập điều chỉnh có cờ loại trừ không vào đơn giá', async () => {
    expect((await call(ctx, 'PUT', '/api/v1/posting/reasons/XTR3', { name: 'Xuất trả hàng chiến lược', kind: 'out', counterAccount: '3312' })).status).toBe(200);
    expect((await call(ctx, 'PUT', '/api/v1/posting/reasons/DGTTK', { name: 'Điều chỉnh giá trị tồn kho', kind: 'in', counterAccount: '3381', flags: { excludeFromCost: true } })).status).toBe(200);
    const reasons = (await call(ctx, 'GET', '/api/v1/posting/reasons')).body.data;
    expect(reasons.find((x: { code: string }) => x.code === 'XTR1').flags).toMatchObject({ returnAtOpeningCost: true });
    // Tháng 12 thêm: trả 1 hộp lý do XTR3 với tiền 50.000 (lấy đúng 50.000, không định giá theo tồn đầu);
    // nhập điều chỉnh 5 hộp lý do DGTTK 1.000.000 (không vào công thức, chỉ tăng số lượng tồn).
    await post({ docType: 'purchase_return', docKey: 'TN-12B', branchCode: 'CN01', docNo: 'TN-12B', docDate: '2026-12-03', reasonCode: 'XTR3', partner: { code: 'NCC01' },
      lines: [{ lineKey: '1', sku: 'SUA02', qty: 1, amountBeforeTax: 50000, taxCode: 'V08', taxAmount: 0 }], totals: { beforeTax: 50000, tax: 0, total: 50000 } });
    await post({ docType: 'stock_adjustment', docKey: 'DC-12', branchCode: 'CN01', docNo: 'DC-12', docDate: '2026-12-04', reasonCode: 'DGTTK', direction: 'increase',
      lines: [{ lineKey: 'l1', sku: 'SUA02', qty: 5, amount: 1000000 }], totals: { total: 1000000 } });
    const r = await call(ctx, 'POST', '/api/v1/inventory/costing', { period: '2026-12' });
    expect(r.status, JSON.stringify(r.body)).toBe(200);
    const costs = await call(ctx, 'GET', '/api/v1/inventory/costs?period=2026-12&search=SUA02');
    // (500.000 − 125.000 − 50.000) / (8 − 2 − 1) = 65.000
    expect(costs.body.data[0]).toMatchObject({ inQty: -3, inValue: -175000, unitCost: 65000, closingQty: 10 });
  });

  it('năm trường hợp định giá hàng trả nhà cung cấp', () => {
    expect(returnValue(2, 0, 10, 700000)).toBe(0); // tiền trả 0
    expect(returnValue(2, 130000, 10, 700000)).toBe(140000); // đơn giá trả 65.000 ≤ 70.000 → theo đơn giá tồn đầu
    expect(returnValue(2, 160000, 10, 700000)).toBe(160000); // tiền trả ≤ GT tồn đầu
    expect(returnValue(2, 200000, 3, 150000)).toBe(150000); // SL trả ≤ SL tồn đầu → GT tồn đầu
    expect(returnValue(2, 160000, 1, 70000)).toBe(150000); // còn lại: 70.000 + (2 − 1) × 80.000
  });
});
