/**
 * Hình thức thanh toán có đối tượng nhận hộ: tiền QR, quẹt thẻ vào tài khoản của công ty,
 * cửa hàng ghi Nợ 13681 chi tiết đối tượng công ty / Có 1311 chi tiết khách.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { sql } from 'kysely';
import { closeDb, db } from '../src/db/client.js';
import { call, saleDoc, setupTenant, type TestCtx } from './helpers.js';

let ctx: TestCtx;
let tenantId: string;

beforeAll(async () => {
  ctx = await setupTenant();
  tenantId = (await db.selectFrom('tenants').select('id').where('code', '=', ctx.tenantCode).executeTakeFirstOrThrow()).id;
  await call(ctx, 'PUT', '/api/v1/partners/CTY-ME', { name: 'Công ty nhận hộ', kind: 'internal' });
});
afterAll(async () => {
  await ctx.app.close();
  await closeDb();
});

async function paymentLines(docNo: string) {
  const { rows } = await sql<{ account_code: string; debit: string; credit: string; partner_code: string | null }>`
    SELECT l.account_code, l.debit, l.credit, p.code AS partner_code
    FROM ledger_lines l
    JOIN ledger_entries e ON e.id = l.entry_id
    LEFT JOIN partners p ON p.id = l.partner_id
    WHERE l.tenant_id = ${tenantId} AND e.doc_no = ${docNo} AND e.status = 'posted' AND NOT e.is_reversal AND l.part = 'payment'
    ORDER BY l.line_no`.execute(db);
  return rows.map((r) => ({ account: r.account_code, debit: Number(r.debit), credit: Number(r.credit), partner: r.partner_code }));
}

describe('Hình thức thanh toán có đối tượng nhận hộ', () => {
  it('khai báo đối tượng chưa có trong danh mục bị từ chối', async () => {
    const res = await call(ctx, 'PUT', '/api/v1/posting/payment-methods/QR', { name: 'Quét mã QR', accountCode: '13681', partnerCode: 'KHONG-CO' });
    expect(res.status).toBe(400);
  });

  it('bán QR: Nợ 13681 chi tiết công ty / Có 1311 chi tiết khách', async () => {
    const put = await call(ctx, 'PUT', '/api/v1/posting/payment-methods/QR', { name: 'Quét mã QR', accountCode: '13681', partnerCode: 'CTY-ME' });
    expect(put.status).toBe(200);
    const list = await call(ctx, 'GET', '/api/v1/posting/payment-methods');
    expect(list.body.data.find((m: any) => m.code === 'QR')).toMatchObject({ accountCode: '13681', partnerCode: 'CTY-ME' });

    const doc = saleDoc({ docKey: 'pos:CN01:HDQR1', docNo: 'HDQR1', invoice: undefined, payments: [{ methodCode: 'QR', amount: 200000 }] });
    const { body } = await call(ctx, 'POST', '/api/v1/documents', doc);
    expect(body.data.status).toBe('posted');
    expect(await paymentLines('HDQR1')).toEqual(expect.arrayContaining([
      { account: '13681', debit: 200000, credit: 0, partner: 'CTY-ME' },
      { account: '1311', debit: 0, credit: 200000, partner: '0912345678' },
    ]));
  });

  it('QR vào tài khoản chi nhánh ghi qua tiền đang chuyển 11319, không bị đổi theo tài khoản ngân hàng', async () => {
    const bank = await call(ctx, 'PUT', '/api/v1/bank-accounts/NHCN', { bankName: 'Vietinbank', bankBranch: 'Lào Cai', accountNo: '1234567', holder: 'Chi nhánh', accountCode: '11210005' });
    expect(bank.status, JSON.stringify(bank.body)).toBe(200);
    const put = await call(ctx, 'PUT', '/api/v1/posting/payment-methods/QR-CN', { name: 'QR chi nhánh', accountCode: '11319', bankAccountCode: 'NHCN' });
    expect(put.status, JSON.stringify(put.body)).toBe(200);
    const list = await call(ctx, 'GET', '/api/v1/posting/payment-methods');
    expect(list.body.data.find((m: any) => m.code === 'QR-CN')).toMatchObject({ accountCode: '11319', bankAccountCode: 'NHCN' });
    // Sửa tài khoản ngân hàng không kéo hình thức ghi qua 11319 về 112.
    await call(ctx, 'PUT', '/api/v1/bank-accounts/NHCN', { bankName: 'Vietinbank', bankBranch: 'Lào Cai', accountNo: '1234567', holder: 'Chi nhánh', accountCode: '11210005', note: 'sửa' });
    expect((await call(ctx, 'GET', '/api/v1/posting/payment-methods')).body.data.find((m: any) => m.code === 'QR-CN').accountCode).toBe('11319');

    const { body } = await call(ctx, 'POST', '/api/v1/documents', saleDoc({ docKey: 'pos:CN01:HDQRCN', docNo: 'HDQRCN', invoice: undefined, payments: [{ methodCode: 'QR-CN', amount: 200000 }] }));
    expect(body.data.status).toBe('posted');
    expect(await paymentLines('HDQRCN')).toEqual(expect.arrayContaining([
      { account: '11319', debit: 200000, credit: 0, partner: '0912345678' },
      { account: '1311', debit: 0, credit: 200000, partner: '0912345678' },
    ]));
  });

  it('tiền mặt vẫn gắn khách như cũ', async () => {
    const { body } = await call(ctx, 'POST', '/api/v1/documents', saleDoc({ docKey: 'pos:CN01:HDTM1', docNo: 'HDTM1', invoice: undefined }));
    expect(body.data.status).toBe('posted');
    expect(await paymentLines('HDTM1')).toEqual(expect.arrayContaining([
      { account: '1111', debit: 200000, credit: 0, partner: '0912345678' },
      { account: '1311', debit: 0, credit: 200000, partner: '0912345678' },
    ]));
  });
});
