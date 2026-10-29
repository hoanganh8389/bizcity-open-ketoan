/**
 * Kiểm thử chứng từ nhập tay (phiếu thu, phiếu chi, phiếu kế toán) và sổ nhật ký chung.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { closeDb } from '../src/db/client.js';
import { call, setupTenant, type TestCtx } from './helpers.js';

let ctx: TestCtx;
const RANGE = 'from=2026-10-01&to=2026-10-31';
const voucher = (over: Record<string, unknown> = {}) => ({
  docType: 'receipt',
  branchCode: 'CN01',
  docDate: '2026-10-08',
  description: 'Thu tiền khác',
  counterparty: 'Nguyễn Văn B',
  lines: [{ debitAccount: '1111', creditAccount: '5158', amount: 500000, description: 'Thu thanh lý vỏ thùng' }],
  ...over,
});
const tb = async () => {
  const res = await call(ctx, 'GET', `/api/v1/reports/trial-balance?${RANGE}&postingOnly=true`);
  return (code: string) => res.body.data.rows.find((r: any) => r.code === code) ?? { debit: 0, credit: 0, closingDebit: 0, closingCredit: 0 };
};

beforeAll(async () => {
  ctx = await setupTenant();
});
afterAll(async () => {
  await ctx.app.close();
  await closeDb();
});

describe('Phiếu thu', () => {
  let id = '';
  let docKey = '';

  it('lập phiếu: tự cấp số PT, ghi sổ nhật ký chung', async () => {
    const res = await call(ctx, 'POST', '/api/v1/vouchers', voucher());
    expect(res.status).toBe(201);
    expect(res.body.data.docNo).toMatch(/^PT26-\d{6}$/);
    expect(res.body.data.entryIds).toHaveLength(1);
    id = res.body.data.id;
    docKey = res.body.data.docKey;
    expect((await tb())('1111').debit).toBe(500000);
  });

  it('số phiếu kế tiếp tăng 1', async () => {
    const first = (await call(ctx, 'GET', `/api/v1/documents/${id}`)).body.data.docNo as string;
    const res = await call(ctx, 'POST', '/api/v1/vouchers', voucher({ lines: [{ debitAccount: '1111', creditAccount: '5158', amount: 1000 }] }));
    expect(Number(res.body.data.docNo.slice(-6))).toBe(Number(first.slice(-6)) + 1);
    expect(res.body.data.entryIds).toHaveLength(1);
  });

  it('lý do ghi lên bút toán, đầu phiếu giữ tên KH / điện thoại / địa chỉ; lý do không có thì bị chặn', async () => {
    const bad = await call(ctx, 'POST', '/api/v1/vouchers', voucher({ docDate: '2026-09-20', reasonCode: 'KHONG-CO-LD' }));
    expect(bad.status).toBe(400);
    expect(JSON.stringify(bad.body)).toMatch(/KHONG-CO-LD/);
    const res = await call(ctx, 'POST', '/api/v1/vouchers', voucher({ docDate: '2026-09-20', reasonCode: 'TTBHK', partnerName: 'Khách A', phone: '0912345678', address: 'Lào Cai' }));
    expect(res.status, JSON.stringify(res.body)).toBe(201);
    const entry = await call(ctx, 'GET', `/api/v1/ledger/entries/${res.body.data.entryIds[0]}`);
    expect(entry.body.data.reasonCode).toBe('TTBHK');
    const doc = await call(ctx, 'GET', `/api/v1/documents/${res.body.data.id}`);
    expect(doc.body.data.payload).toMatchObject({ reasonCode: 'TTBHK', partnerName: 'Khách A', phone: '0912345678', address: 'Lào Cai' });
    // Danh sách phiếu thu: kèm lý do, điện thoại, tài khoản tiền, người tạo; lọc nhiều chi nhánh.
    const list = await call(ctx, 'GET', '/api/v1/documents?docType=receipt&from=2026-09-20&to=2026-09-20&branchCodes=CN01,CN99&voucherInfo=true');
    expect(list.status, JSON.stringify(list.body)).toBe(200);
    const row = list.body.data.find((r: any) => r.id === res.body.data.id);
    expect(row).toMatchObject({ reasonCode: 'TTBHK', phone: '0912345678', address: 'Lào Cai', moneyAccount: '1111' });
    expect(row.createdAt).toBeTruthy();
    expect(row.createdByName).toBeTruthy();
    const none = await call(ctx, 'GET', '/api/v1/documents?docType=receipt&from=2026-09-20&to=2026-09-20&branchCodes=CN99');
    expect(none.body.data).toHaveLength(0);
  });

  it('từ chối phiếu thu mà tài khoản Nợ không phải tài khoản tiền', async () => {
    const res = await call(ctx, 'POST', '/api/v1/vouchers', voucher({ lines: [{ debitAccount: '5158', creditAccount: '1111', amount: 1000 }] }));
    expect(res.status).toBe(400);
  });

  it('sửa phiếu: số phát sinh là số mới (bút toán cũ ghi số âm)', async () => {
    const res = await call(ctx, 'PUT', `/api/v1/vouchers/${id}`, voucher({ lines: [{ debitAccount: '1111', creditAccount: '5158', amount: 300000 }] }));
    expect(res.status).toBe(200);
    expect(res.body.data.version).toBe(2);
    expect((await tb())('1111').debit).toBe(300000 + 1000);
  });

  it('huỷ phiếu: số phát sinh về như chưa lập', async () => {
    const res = await call(ctx, 'POST', '/api/v1/documents/cancel', { docKey, reason: 'Lập nhầm' });
    expect(res.status).toBe(200);
    expect((await tb())('1111').debit).toBe(1000);
    expect((await call(ctx, 'PUT', `/api/v1/vouchers/${id}`, voucher())).status).toBe(409);
  });
});

describe('Phiếu chi và phiếu kế toán', () => {
  it('phiếu chi trả công nợ cần đối tượng có trong danh mục', async () => {
    const line = { debitAccount: '33111', creditAccount: '1111', amount: 200000 };
    const noPartner = await call(ctx, 'POST', '/api/v1/vouchers', voucher({ docType: 'payment', description: 'Trả tiền hàng', lines: [line] }));
    expect(noPartner.status).toBe(422); // tài khoản 331 bắt buộc đối tượng
    const unknown = await call(ctx, 'POST', '/api/v1/vouchers', voucher({ docType: 'payment', description: 'Trả tiền hàng', partnerCode: 'NCC-KHONG-CO', lines: [line] }));
    expect(unknown.status).toBe(400);

    await call(ctx, 'PUT', '/api/v1/partners/NCC01', { name: 'Nhà cung cấp 01', kind: 'supplier' });
    const okRes = await call(ctx, 'POST', '/api/v1/vouchers', voucher({ docType: 'payment', description: 'Trả tiền hàng', partnerCode: 'NCC01', lines: [line] }));
    expect(okRes.status).toBe(201);
    expect(okRes.body.data.docNo).toMatch(/^PC26-/);
    const bal = await call(ctx, 'GET', `/api/v1/reports/partner-balances?account=331&${RANGE}`);
    expect(bal.body.data.rows).toEqual([expect.objectContaining({ partnerCode: 'NCC01', debit: 200000, closingDebit: 200000 })]);
  });

  it('phiếu kế toán nhiều dòng, số tự nhập không được trùng', async () => {
    const body = voucher({
      docType: 'manual',
      docNo: 'PK-TEST-01',
      description: 'Trích trước chi phí',
      partnerCode: 'NCC01', // tài khoản 335 theo dõi đối tượng
      lines: [
        { debitAccount: '64211', creditAccount: '335', amount: 100000 },
        { debitAccount: '64212', creditAccount: '335', amount: 50000 },
      ],
    });
    const res = await call(ctx, 'POST', '/api/v1/vouchers', body);
    expect(res.status).toBe(201);
    expect(res.body.data.docNo).toBe('PK-TEST-01');
    expect((await tb())('335').credit).toBe(150000);
    expect((await call(ctx, 'POST', '/api/v1/vouchers', body)).status).toBe(409);
  });

  it('phiếu kế toán dòng chính + tài khoản đối ứng: lưu lại group / mainSide để mở lại đúng như lúc nhập', async () => {
    // Dòng chính 335 ghi Có 150.000, đối ứng 64211 (100.000) và 64212 (50.000) ghi Nợ.
    const res = await call(ctx, 'POST', '/api/v1/vouchers', voucher({
      docType: 'manual', docNo: 'PK-TEST-03', docDate: '2026-09-21', description: 'Trích trước chi phí', partnerCode: 'NCC01',
      lines: [
        { debitAccount: '64211', creditAccount: '335', amount: 100000, group: 0, mainSide: 'credit' },
        { debitAccount: '64212', creditAccount: '335', amount: 50000, group: 0, mainSide: 'credit' },
      ],
    }));
    expect(res.status, JSON.stringify(res.body)).toBe(201);
    const doc = await call(ctx, 'GET', `/api/v1/documents/${res.body.data.id}`);
    expect(doc.body.data.payload.lines.map((l: any) => [l.group, l.mainSide])).toEqual([[0, 'credit'], [0, 'credit']]);
  });

  it('tài khoản tổng hợp bị từ chối, không ghi sổ dở dang', async () => {
    const res = await call(ctx, 'POST', '/api/v1/vouchers', voucher({ docType: 'manual', docNo: 'PK-TEST-02', lines: [{ debitAccount: '6421', creditAccount: '1111', amount: 1000 }] }));
    expect(res.status).toBe(422);
    const list = await call(ctx, 'GET', '/api/v1/documents?docType=manual&search=PK-TEST-02');
    expect(list.body.data).toHaveLength(0);
  });
});

describe('Sổ nhật ký chung', () => {
  it('tổng Nợ = tổng Có, lọc được theo loại chứng từ', async () => {
    const all = await call(ctx, 'GET', `/api/v1/reports/journal?${RANGE}`);
    expect(all.status).toBe(200);
    expect(all.body.data.totals.debit).toBe(all.body.data.totals.credit);
    expect(all.body.data.rows.every((r: any) => !r.isReversal)).toBe(true);
    const pay = await call(ctx, 'GET', `/api/v1/reports/journal?${RANGE}&docType=payment`);
    expect(pay.body.data.totals).toMatchObject({ entries: 1, debit: 200000, credit: 200000 });
    expect(pay.body.data.rows.find((r: any) => r.accountCode === '33111').counterAccounts).toBe('1111');
    const withFix = await call(ctx, 'GET', `/api/v1/reports/journal?${RANGE}&showCorrections=true`);
    expect(withFix.body.data.totals.lines).toBeGreaterThan(all.body.data.totals.lines);
    expect(withFix.body.data.totals.debit).toBe(all.body.data.totals.debit); // dòng sửa triệt tiêu nhau
    // corrections=only: chỉ bút toán đã đảo và bút toán ghi số âm — cộng lại triệt tiêu, cùng số dòng chênh lệch.
    const only = await call(ctx, 'GET', `/api/v1/reports/journal?${RANGE}&corrections=only`);
    expect(only.body.data.totals.lines).toBe(withFix.body.data.totals.lines - all.body.data.totals.lines);
    expect(only.body.data.rows.every((r: any) => r.isReversal || r.entryStatus !== 'posted')).toBe(true);
    expect((await call(ctx, 'GET', `/api/v1/reports/journal?${RANGE}&corrections=all`)).body.data.totals.lines).toBe(withFix.body.data.totals.lines);
  });

  it('lọc số tài khoản, TK đối ứng; kiểu báo cáo 2, 3 gom theo chứng từ mà không đổi tổng', async () => {
    const acc = await call(ctx, 'GET', `/api/v1/reports/journal?${RANGE}&account=1111`);
    expect(acc.body.data.rows.length).toBeGreaterThan(0);
    expect(acc.body.data.rows.every((r: any) => r.accountCode.startsWith('1111'))).toBe(true);
    const cu = await call(ctx, 'GET', `/api/v1/reports/journal?${RANGE}&account=1111&counterAccount=33111`);
    expect(cu.body.data.rows.every((r: any) => r.counterAccounts.includes('33111'))).toBe(true);
    const all = await call(ctx, 'GET', `/api/v1/reports/journal?${RANGE}&pageSize=100000`);
    const sum = (rows: any[], k: string) => rows.reduce((s, r) => s + r[k], 0);
    for (const mode of [2, 3]) {
      const g = await call(ctx, 'GET', `/api/v1/reports/journal?${RANGE}&groupMode=${mode}&pageSize=100000`);
      expect(g.status).toBe(200);
      expect(g.body.data.rows.length).toBeLessThanOrEqual(all.body.data.rows.length);
      expect(Math.round(sum(g.body.data.rows, 'debit'))).toBe(Math.round(sum(all.body.data.rows, 'debit')));
      expect(g.body.data.rows[0]).toHaveProperty('docDate');
    }
  });
});
