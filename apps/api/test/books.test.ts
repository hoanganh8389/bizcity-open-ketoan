/**
 * Kiểm thử các sổ: sổ cái / sổ chi tiết (kiểu báo cáo, lọc tài khoản đối ứng), sổ quỹ (thu trước chi sau,
 * cột thu chi), nhật ký thu tiền / chi tiền, nhật ký bán hàng, bảng kê chi tiết chứng từ, lưu chuyển tiền tệ,
 * khai kỳ kế toán và chặn chứng từ ngày tương lai.
 *
 * Dữ liệu (tháng 10/2026, chi nhánh CN01):
 *   05/10  HD0001 bán hàng 185.185 + thuế 14.815, thu tiền mặt 200.000
 *   10/10  phiếu chi 100.000 chi phí 64211 (lập trước)
 *   10/10  báo nợ rút tiền gửi về quỹ 50.000 (lập sau)
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { closeDb } from '../src/db/client.js';
import { call, saleDoc, setupTenant, type TestCtx } from './helpers.js';

let ctx: TestCtx;
const OCT = 'from=2026-10-01&to=2026-10-31';

beforeAll(async () => {
  ctx = await setupTenant();
  expect((await call(ctx, 'POST', '/api/v1/documents', saleDoc())).body.data.status).toBe('posted');
  const pay = await call(ctx, 'POST', '/api/v1/vouchers', { docType: 'payment', branchCode: 'CN01', docDate: '2026-10-10', description: 'Chi tiền điện', lines: [{ debitAccount: '64211', creditAccount: '1111', amount: 100000 }] });
  expect(pay.status, JSON.stringify(pay.body)).toBe(201);
  const bank = await call(ctx, 'POST', '/api/v1/vouchers', { docType: 'bank_payment', branchCode: 'CN01', docDate: '2026-10-10', description: 'Rút tiền gửi về quỹ', lines: [{ debitAccount: '1111', creditAccount: '11210005', amount: 50000 }] });
  expect(bank.status, JSON.stringify(bank.body)).toBe(201);
});
afterAll(async () => {
  await ctx.app.close();
  await closeDb();
});

const ledger = (q: string) => call(ctx, 'GET', `/api/v1/reports/account-ledger?${OCT}&${q}`);

describe('Sổ cái, sổ chi tiết: kiểu báo cáo', () => {
  it('kiểu 1 từng dòng; kiểu 2 gom theo chứng từ + tài khoản đối ứng; kiểu 3 gom theo chứng từ', async () => {
    const k1 = await ledger('account=1311&kind=ledger&groupMode=1');
    expect(k1.status).toBe(200);
    expect(k1.body.data.rows).toHaveLength(3);
    const k2 = await ledger('account=1311&kind=ledger&groupMode=2');
    expect(k2.body.data.rows.map((r: any) => r.counterAccounts).sort()).toEqual(['1111', '33311', '51111']);
    const k3 = await ledger('account=1311&kind=ledger&groupMode=3');
    // Hoá đơn và khoản thu là hai bút toán (như hoá đơn + phiếu thu tiền khách): mỗi bút toán một dòng.
    expect(k3.body.data.rows).toHaveLength(2);
    const inv = k3.body.data.rows.find((r: any) => r.debit > 0);
    const pay = k3.body.data.rows.find((r: any) => r.credit > 0);
    expect(inv).toMatchObject({ docNo: 'HD0001', debit: 200000, credit: 0 });
    expect(inv.counterAccounts.split(', ').sort()).toEqual(['33311', '51111']);
    expect(pay).toMatchObject({ credit: 200000, counterAccounts: '1111' });
    // Kiểu gom không đổi tổng phát sinh và số dư.
    for (const r of [k2, k3]) expect(r.body.data.totals).toEqual(k1.body.data.totals);
  });

  it('lọc theo tài khoản đối ứng', async () => {
    const res = await ledger('account=1311&kind=ledger&counterAccount=511');
    expect(res.body.data.rows).toHaveLength(1);
    expect(res.body.data.rows[0]).toMatchObject({ counterAccounts: '51111', debit: 185185 });
  });
});

describe('Sổ quỹ tiền mặt', () => {
  it('trong ngày dòng thu trước, dòng chi sau; xếp cột theo tài khoản đối ứng; dư luỹ kế', async () => {
    const res = await ledger('account=111&kind=cash');
    const rows = res.body.data.rows;
    expect(rows.map((r: any) => [r.postingDate, r.debit, r.credit, r.cashColumn])).toEqual([
      ['2026-10-05', 200000, 0, 'in_debt'],
      ['2026-10-10', 50000, 0, 'in_bank'],
      ['2026-10-10', 0, 100000, 'out_other'],
    ]);
    expect(rows.map((r: any) => r.balanceDebit)).toEqual([200000, 250000, 150000]);
    expect(res.body.data.closing).toEqual({ debit: 150000, credit: 0 });
  });

  it('lọc theo loại chứng từ', async () => {
    const res = await ledger('account=111&kind=cash&docType=payment');
    expect(res.body.data.rows).toHaveLength(1);
    expect(res.body.data.rows[0].credit).toBe(100000);
  });
});

describe('Sổ nhật ký thu tiền / chi tiền', () => {
  it('sổ thu: chia tiền vào cột tài khoản đối ứng đã chọn', async () => {
    const res = await call(ctx, 'GET', `/api/v1/reports/cash-journal?${OCT}&account=111&direction=in&columns=131,112`);
    expect(res.status).toBe(200);
    expect(res.body.data.columns).toEqual(['131', '112']);
    expect(res.body.data.totals).toEqual({ amount: 250000, cells: [200000, 50000], other: 0 });
  });
  it('sổ chi: tài khoản không có cột thì vào cột "tài khoản khác"', async () => {
    const res = await call(ctx, 'GET', `/api/v1/reports/cash-journal?${OCT}&account=111&direction=out&columns=331`);
    expect(res.body.data.rows).toEqual([expect.objectContaining({ amount: 100000, cells: [0], other: 100000, otherAccount: '64211' })]);
  });
});

describe('Sổ nhật ký bán hàng', () => {
  it('mỗi hoá đơn một dòng, doanh thu hàng hoá vào cột 5111', async () => {
    const res = await call(ctx, 'GET', `/api/v1/reports/sales-journal?${OCT}`);
    expect(res.status).toBe(200);
    expect(res.body.data.documents).toBe(1);
    expect(res.body.data.totals).toEqual({ goods: 185185, finished: 0, service: 0, other: 0, total: 185185 });
    expect(res.body.data.branches[0].branchCode).toBe('CN01');
    const row = res.body.data.branches[0].rows[0];
    expect(row).toMatchObject({ docDate: expect.stringMatching(/^2026-10-/), createdDate: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/), otherAccount: '', account: expect.stringMatching(/^511/), contraAccount: expect.stringMatching(/^13/) });
    expect(row.invoiceDate).toMatch(/^2026-10-/);
  });

  it('lọc theo tài khoản doanh thu và mặt hàng (như HTsoft)', async () => {
    const q = (extra: string) => call(ctx, 'GET', `/api/v1/reports/sales-journal?${OCT}${extra}`).then((r) => r.body.data.documents);
    expect(await q('&account=511')).toBe(1);
    expect(await q('&account=5113')).toBe(0);
    expect(await q('&account=13')).toBe(1); // TK ghi Nợ (phải thu)
    expect(await q('&account=5_')).toBe(0); // không thành mẫu LIKE
    expect(await q('&productSkus=KHONG-CO')).toBe(0);
  });

  it('xuất Excel đủ cột như HTsoft', async () => {
    const res = await ctx.app.inject({ method: 'GET', url: `/api/v1/addins/excel-export/sales-journal.csv?${OCT}`, headers: { authorization: `Bearer ${ctx.token}` } });
    expect(res.statusCode).toBe(200);
    const header = res.body.replace(/^\uFEFF/, '').split(/\r?\n/)[0];
    for (const col of ['Ngày lập chứng từ', 'Ngày chứng từ', 'Ngày hoá đơn', 'Tài khoản', 'TK đối ứng', 'Lý do', 'Số tiền TK khác', 'Tài khoản khác']) expect(header).toContain(col);
  });
});

describe('Bảng kê chi tiết chứng từ', () => {
  it('mỗi cặp Nợ / Có một dòng; lọc theo tài khoản', async () => {
    const res = await call(ctx, 'GET', `/api/v1/reports/voucher-listing?${OCT}&account=111`);
    expect(res.status).toBe(200);
    expect(res.body.data.rows.map((r: any) => `${r.debitAccount}/${r.creditAccount}/${r.amount}`).sort()).toEqual(['1111/11210005/50000', '1111/1311/200000', '64211/1111/100000']);
    expect(res.body.meta.total).toBe(3);
  });
  it('xem được khoảng ngày dài, không phân trang', async () => {
    const res = await call(ctx, 'GET', '/api/v1/reports/voucher-listing?from=2026-09-01&to=2026-10-31&pageSize=1000000');
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(res.body.data.rows.length).toBe(res.body.data.total);
  });
});

describe('Báo cáo lưu chuyển tiền tệ', () => {
  it('thu bán hàng vào 01, chi khác vào 07, chuyển giữa tài khoản tiền không tính; cuối kỳ khớp số dư tiền', async () => {
    const res = await call(ctx, 'GET', `/api/v1/reports/cash-flow?${OCT}`);
    expect(res.status).toBe(200);
    const v = (code: string) => res.body.data.rows.find((r: any) => r.code === code)?.value;
    expect(v('01')).toBe(200000);
    expect(v('07')).toBe(-100000);
    expect(v('20')).toBe(100000);
    expect(v('50')).toBe(100000);
    expect(v('60')).toBe(0);
    expect(v('70')).toBe(100000);
    expect(res.body.data.check.difference).toBe(0);
  });
  it('mã chỉ tiêu ghi trên dòng phiếu được ưu tiên', async () => {
    const r = await call(ctx, 'POST', '/api/v1/vouchers', { docType: 'receipt', branchCode: 'CN01', docDate: '2026-10-20', description: 'Vay cá nhân', lines: [{ debitAccount: '1111', creditAccount: '5158', amount: 30000, cashflowCode: '33' }] });
    expect(r.status, JSON.stringify(r.body)).toBe(201);
    const res = await call(ctx, 'GET', `/api/v1/reports/cash-flow?${OCT}`);
    expect(res.body.data.rows.find((x: any) => x.code === '33').value).toBe(30000);
    expect(res.body.data.check.difference).toBe(0);
  });
});

describe('Kỳ kế toán và ngày chứng từ', () => {
  const future = () => {
    const d = new Date();
    const y = d.getMonth() >= 10 ? d.getFullYear() + 1 : d.getFullYear();
    const m = ((d.getMonth() + 2) % 12) + 1;
    return { y, m, date: `${y}-${String(m).padStart(2, '0')}-15` };
  };
  it('không lập được chứng từ sau cuối tháng hiện tại khi kỳ chưa khai; khai kỳ rồi thì lập được', async () => {
    const f = future();
    const body = { docType: 'receipt', branchCode: 'CN01', docDate: f.date, description: 'Thu trước', lines: [{ debitAccount: '1111', creditAccount: '5158', amount: 1000 }] };
    const denied = await call(ctx, 'POST', '/api/v1/vouchers', body);
    expect(denied.status).toBe(400);
    const p = await call(ctx, 'POST', '/api/v1/periods', { year: f.y, month: f.m });
    expect(p.status).toBe(200);
    const okRes = await call(ctx, 'POST', '/api/v1/vouchers', body);
    expect(okRes.status, JSON.stringify(okRes.body)).toBe(201);
  });
  it('khai cả năm: đủ 12 kỳ', async () => {
    const res = await call(ctx, 'POST', '/api/v1/periods', { year: 2030 });
    expect(res.body.data.created).toBe(12);
    const list = await call(ctx, 'GET', '/api/v1/periods?year=2030');
    expect(list.body.data).toHaveLength(12);
  });
});

describe('Báo cáo thuế', () => {
  it('bảng tổng hợp thuế: mỗi chi nhánh, mỗi tháng một dòng', async () => {
    const res = await call(ctx, 'GET', '/api/v1/reports/tax-summary?from=2026-10-01&to=2026-11-30');
    expect(res.body.data.rows).toEqual([expect.objectContaining({ branchCode: 'CN01', month: '10/2026', revenue: 185185, outputTax: 14815 })]);
  });
});

describe('Sổ tổng hợp công nợ phát sinh', () => {
  it('mọi tài khoản theo dõi đối tượng: mỗi tài khoản có dòng cộng; tổng khớp từng tài khoản', async () => {
    const all = await call(ctx, 'GET', `/api/v1/reports/partner-balances?${OCT}&account=*`);
    expect(all.status).toBe(200);
    const one = await call(ctx, 'GET', `/api/v1/reports/partner-balances?${OCT}&account=1311`);
    const sub = all.body.data.accounts.find((a: any) => a.accountCode === '1311');
    expect(sub).toMatchObject({ debit: one.body.data.totals.debit, credit: one.body.data.totals.credit });
    expect(all.body.data.rows.every((r: any) => r.accountCode)).toBe(true);
  });
  it('tách theo chi nhánh', async () => {
    const res = await call(ctx, 'GET', `/api/v1/reports/partner-balances?${OCT}&account=1311&byBranch=true`);
    expect(res.body.data.rows.every((r: any) => r.branchCode === 'CN01')).toBe(true);
  });
});
