/**
 * Kiểm thử: phiếu báo có / báo nợ, số dư đầu kỳ, kết chuyển lãi lỗ, báo cáo kết quả kinh doanh.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { closeDb } from '../src/db/client.js';
import { yearBefore } from '../src/phan-he/ke-toan/reports/income-statement.js';
import { call, saleDoc, setupTenant, type TestCtx } from './helpers.js';

let ctx: TestCtx;
const OCT = 'from=2026-10-01&to=2026-10-31';
const tb = async (range = OCT) => {
  const res = await call(ctx, 'GET', `/api/v1/reports/trial-balance?${range}`);
  return (code: string) => res.body.data.rows.find((r: any) => r.code === code) ?? { debit: 0, credit: 0, openingDebit: 0, openingCredit: 0, closingDebit: 0, closingCredit: 0 };
};

beforeAll(async () => {
  ctx = await setupTenant();
});
afterAll(async () => {
  await ctx.app.close();
  await closeDb();
});

describe('Phiếu báo có, báo nợ', () => {
  const base = { branchCode: 'CN01', docDate: '2026-10-09', description: 'Giao dịch ngân hàng' };
  it('báo có phải vào tài khoản tiền gửi; phiếu thu không được dùng tài khoản ngân hàng', async () => {
    const okRes = await call(ctx, 'POST', '/api/v1/vouchers', { ...base, docType: 'bank_receipt', lines: [{ debitAccount: '11210005', creditAccount: '5158', amount: 70000 }] });
    expect(okRes.status).toBe(201);
    expect(okRes.body.data.docNo).toMatch(/^BC26-/);
    const wrong = await call(ctx, 'POST', '/api/v1/vouchers', { ...base, docType: 'bank_receipt', lines: [{ debitAccount: '1111', creditAccount: '5158', amount: 1 }] });
    expect(wrong.status).toBe(400);
    const cashOnBank = await call(ctx, 'POST', '/api/v1/vouchers', { ...base, docType: 'receipt', lines: [{ debitAccount: '11210005', creditAccount: '5158', amount: 1 }] });
    expect(cashOnBank.status).toBe(400);
  });
  it('báo nợ: phí ngân hàng', async () => {
    const res = await call(ctx, 'POST', '/api/v1/vouchers', { ...base, docType: 'bank_payment', lines: [{ debitAccount: '6358', creditAccount: '11210005', amount: 20000 }] });
    expect(res.status).toBe(201);
    expect(res.body.data.docNo).toMatch(/^BN26-/);
  });
});

describe('Số dư tài khoản đầu kỳ', () => {
  const opening = (over: Record<string, unknown> = {}) => ({
    branchCode: 'CN01',
    docDate: '2026-09-30',
    lines: [
      { accountCode: '1111', debit: 5000000 },
      { accountCode: '4211', credit: 5000000 },
    ],
    ...over,
  });
  let id = '';

  it('lệch Nợ – Có mà không có tài khoản cân đối thì từ chối', async () => {
    const res = await call(ctx, 'POST', '/api/v1/opening-balances', opening({ lines: [{ accountCode: '1111', debit: 5000000 }] }));
    expect(res.status).toBe(400);
  });

  it('một dòng không được nhập cả hai bên', async () => {
    const res = await call(ctx, 'POST', '/api/v1/opening-balances', opening({ lines: [{ accountCode: '1111', debit: 1, credit: 1 }] }));
    expect(res.status).toBe(400);
  });

  it('nhập số dư: lên thành dư đầu kỳ của tháng sau', async () => {
    const res = await call(ctx, 'POST', '/api/v1/opening-balances', opening());
    expect(res.status).toBe(201);
    expect(res.body.data.docNo).toMatch(/^SD26-/);
    id = res.body.data.id;
    expect((await tb())('1111').openingDebit).toBe(5000000);
    expect((await tb())('4211').openingCredit).toBe(5000000);
  });

  it('sửa số dư, có tài khoản cân đối nhận phần chênh', async () => {
    const res = await call(ctx, 'PUT', `/api/v1/opening-balances/${id}`, opening({ balancingAccount: '999', lines: [{ accountCode: '1111', debit: 6000000 }, { accountCode: '4211', credit: 5000000 }] }));
    expect(res.status).toBe(200);
    expect((await tb())('1111').openingDebit).toBe(6000000);
    expect((await tb())('999').openingCredit).toBe(1000000);
  });
});

describe('Kết chuyển lãi lỗ và kết quả kinh doanh', () => {
  const run = { period: '2026-10', branchCodes: ['CN01'] };

  it('trước kết chuyển: báo cáo KQKD lấy đúng doanh thu, chi phí', async () => {
    // Bán 185.185 (hoá đơn mẫu), trả lại 50.000; cộng báo có 70.000 (5158) và phí ngân hàng 20.000 (6358) ở trên.
    expect((await call(ctx, 'POST', '/api/v1/documents', saleDoc())).body.data.status).toBe('posted');
    const ret = await call(ctx, 'POST', '/api/v1/documents', {
      docType: 'sale_return', docKey: 'pos:CN01:TL01', version: 1, branchCode: 'CN01', docNo: 'TL01', docDate: '2026-10-07',
      lines: [{ lineKey: 'l1', sku: 'SUA01', name: 'Sữa', qty: 1, amountBeforeTax: 50000, taxCode: 'R08', taxAmount: 4000 }],
      payments: [{ methodCode: 'TM', amount: 54000 }], totals: { beforeTax: 50000, tax: 4000, total: 54000 },
    });
    expect(ret.body.data.status).toBe('posted');

    const is = await call(ctx, 'GET', `/api/v1/reports/income-statement?${OCT}`);
    expect(is.status).toBe(200);
    const v = (code: string) => is.body.data.rows.find((r: any) => r.code === code).current;
    expect(v('01')).toBe(185185);
    expect(v('02')).toBe(50000);
    expect(v('10')).toBe(135185);
    expect(v('22')).toBe(70000); // doanh thu tài chính (mã 22 theo Thông tư 99)
    expect(v('23')).toBe(20000); // chi phí tài chính
    expect(v('60')).toBe(135185 + 70000 - 20000);
    expect(is.body.data.previous).toEqual({ from: '2025-10-01', to: '2025-10-31' });
  });

  it('xem trước không ghi gì; lãi khớp báo cáo KQKD', async () => {
    const pre = await call(ctx, 'POST', '/api/v1/closing/preview', run);
    expect(pre.status).toBe(200);
    expect(pre.body.data[0]).toMatchObject({ branchCode: 'CN01', profit: 185185, alreadyClosed: false });
    expect((await tb())('911').debit ?? 0).toBe(0);
  });

  it('kết chuyển: tài khoản doanh thu, chi phí hết số dư; lãi về 4212', async () => {
    const res = await call(ctx, 'POST', '/api/v1/closing/run', run);
    expect(res.status).toBe(200);
    expect(res.body.data[0]).toMatchObject({ status: 'posted', profit: 185185 });
    const t = await tb();
    for (const code of ['511', '521', '515', '635', '911']) {
      expect(t(code).closingDebit, `dư Nợ ${code}`).toBe(0);
      expect(t(code).closingCredit, `dư Có ${code}`).toBe(0);
    }
    expect(t('4212').credit).toBe(185185);
  });

  it('báo cáo KQKD và báo cáo bán hàng không đổi sau kết chuyển', async () => {
    const is = await call(ctx, 'GET', `/api/v1/reports/income-statement?${OCT}`);
    expect(is.body.data.rows.find((r: any) => r.code === '60').current).toBe(185185);
    const dash = await call(ctx, 'GET', `/api/v1/reports/dashboard?${OCT}`);
    expect(dash.status).toBe(200);
  });

  it('kết chuyển lại sau khi có thêm chứng từ: số mới, không cộng dồn', async () => {
    await call(ctx, 'POST', '/api/v1/vouchers', { docType: 'bank_payment', branchCode: 'CN01', docDate: '2026-10-20', description: 'Phí', lines: [{ debitAccount: '6358', creditAccount: '11210005', amount: 5185 }] });
    const res = await call(ctx, 'POST', '/api/v1/closing/run', run);
    expect(res.body.data[0].profit).toBe(180000);
    const t = await tb();
    expect(t('4212').credit).toBe(180000);
    expect(t('911').closingDebit + t('911').closingCredit).toBe(0);
    const runs = await call(ctx, 'GET', '/api/v1/closing/runs?year=2026');
    expect(runs.body.data).toHaveLength(1);
    expect(runs.body.data[0]).toMatchObject({ period: '2026-10', version: 2, status: 'posted' });
  });

  it('danh sách phiếu kết chuyển theo Từ ngày / Đến ngày, có người lập (cột User như HTsoft)', async () => {
    const inRange = (await call(ctx, 'GET', '/api/v1/closing/runs?from=2026-10-01&to=2026-10-31')).body.data;
    expect(inRange).toHaveLength(1);
    expect(inRange[0]).toMatchObject({ period: '2026-10', createdBy: expect.any(String), description: expect.stringContaining('Kết chuyển lãi lỗ') });
    expect(inRange[0].createdBy).not.toMatch(/^user:/);
    expect((await call(ctx, 'GET', '/api/v1/closing/runs?from=2026-11-01&to=2026-12-31')).body.data).toHaveLength(0);
  });

  it('huỷ kết chuyển: số dư doanh thu trở lại', async () => {
    const runs = await call(ctx, 'GET', '/api/v1/closing/runs?year=2026');
    await call(ctx, 'POST', '/api/v1/documents/cancel', { docKey: runs.body.data[0].docKey, reason: 'Kiểm thử' });
    expect((await tb())('4212').credit).toBe(0);
    expect((await tb())('511').closingCredit).toBeGreaterThan(0);
  });

  it('bút toán kết chuyển mẫu: mặc định có sẵn, sửa được, tài khoản đích sai bị từ chối', async () => {
    const rules = await call(ctx, 'GET', '/api/v1/closing/rules');
    expect(rules.body.data.isDefault).toBe(true);
    expect(rules.body.data.rules.at(-1)).toMatchObject({ fromAccount: '911', toAccount: '4212', mode: 'balance' });
    const bad = await call(ctx, 'PUT', '/api/v1/closing/rules', { rules: [{ seq: 1, fromAccount: '511', toAccount: '421', mode: 'credit' }] });
    expect(bad.status).toBe(400);
    const saved = await call(ctx, 'PUT', '/api/v1/closing/rules', { rules: rules.body.data.rules });
    expect(saved.body.data.isDefault).toBe(false);
  });
});

describe('Kỳ trước của báo cáo', () => {
  it('lùi đúng 12 tháng, 29/02 về 28/02', () => {
    expect(yearBefore('2026-10-31')).toBe('2025-10-31');
    expect(yearBefore('2028-02-29')).toBe('2027-02-28');
  });
});
