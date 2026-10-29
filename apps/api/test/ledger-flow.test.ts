/**
 * Kiểm thử luồng chính: nhận chứng từ → định khoản → sổ cái → báo cáo.
 * Chạy: npm test (cần PostgreSQL ở DATABASE_URL).
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { closeDb } from '../src/db/client.js';
import { call, saleDoc, setupTenant, type TestCtx } from './helpers.js';

let ctx: TestCtx;

beforeAll(async () => {
  ctx = await setupTenant();
});
afterAll(async () => {
  await ctx.app.close();
  await closeDb();
});

/** Lấy các dòng bút toán của một chứng từ theo bộ sổ, bỏ qua bút toán đã đảo. */
async function activeLines(docId: string) {
  const { body } = await call(ctx, 'GET', `/api/v1/documents/${docId}`);
  return body.data.entries
    .filter((e: any) => e.status === 'posted' && !e.isReversal)
    .flatMap((e: any) => e.lines.map((l: any) => ({ account: l.accountCode, debit: l.debit, credit: l.credit, part: l.part })));
}

async function docIdByKey(key: string) {
  const { body } = await call(ctx, 'GET', `/api/v1/documents?search=${encodeURIComponent(key)}`);
  return body.data.find((d: any) => d.docKey === key).id as string;
}

describe('Xác thực', () => {
  it('từ chối khi không có token', async () => {
    const res = await ctx.app.inject({ method: 'GET', url: '/api/v1/accounts' });
    expect(res.statusCode).toBe(401);
    expect(res.json().ok).toBe(false);
  });

  it('sai mật khẩu báo lỗi chung', async () => {
    const res = await ctx.app.inject({ method: 'POST', url: '/api/v1/auth/login', payload: { tenantCode: ctx.tenantCode, email: 'tester@ketoan.local', password: 'sai' } });
    expect(res.statusCode).toBe(401);
  });

  it('khoá API gửi được chứng từ', async () => {
    const res = await ctx.app.inject({ method: 'GET', url: '/api/v1/documents', headers: { 'x-api-key': ctx.apiKey } });
    expect(res.statusCode).toBe(200);
  });
});

describe('Hoá đơn bán hàng', () => {
  it('ghi sổ nhật ký chung, định khoản đúng', async () => {
    const { status, body } = await call(ctx, 'POST', '/api/v1/documents', saleDoc());
    expect(status).toBe(200);
    expect(body.data.status).toBe('posted');
    // Một bút toán hàng + một bút toán thu tiền riêng (như phiếu thu tiền khách).
    expect(body.data.entryIds).toHaveLength(2);
    const detail = (await call(ctx, 'GET', `/api/v1/documents/${await docIdByKey('pos:CN01:HD0001')}`)).body.data;
    const entryIds = detail.entries.map((e: any) => e.id);
    const heads = await Promise.all(entryIds.map(async (id: string) => (await call(ctx, 'GET', `/api/v1/ledger/entries/${id}`)).body.data));
    const pay = heads.find((e: any) => e.lines.some((l: any) => l.part === 'payment'));
    const goods = heads.find((e: any) => e.lines.some((l: any) => l.part === 'goods'));
    expect(goods.reasonCode).toBe('XBA');
    // Phiếu bán và phiếu thu tách bạch trên sổ: bút toán thu tiền là chứng từ "thanh toán khách hàng".
    expect(goods.docType).toBe('sale');
    expect(pay.docType).toBe('customer_payment');
    expect(pay.reasonCode).toBe('TTBHK'); // lý do thu
    expect(pay.lines.every((l: any) => l.part === 'payment')).toBe(true);

    const lines = await activeLines(await docIdByKey('pos:CN01:HD0001'));
    expect(lines).toEqual(
      expect.arrayContaining([
        { account: '1311', debit: 185185, credit: 0, part: 'goods' },
        { account: '51111', debit: 0, credit: 185185, part: 'goods' },
        { account: '1311', debit: 14815, credit: 0, part: 'tax' },
        { account: '33311', debit: 0, credit: 14815, part: 'tax' },
        { account: '1111', debit: 200000, credit: 0, part: 'payment' },
        { account: '1311', debit: 0, credit: 200000, part: 'payment' },
      ]),
    );
    // Dòng quà tặng 0đ vẫn ghi đủ cặp tiền hàng 0 + thuế 0 theo mặt hàng (sổ có dấu vết mọi dòng hàng).
    expect(lines.filter((l: any) => l.part !== 'cogs')).toHaveLength(10);
    expect(lines).toEqual(expect.arrayContaining([
      { account: '1311', debit: 0, credit: 0, part: 'goods' },
      { account: '51111', debit: 0, credit: 0, part: 'goods' },
      { account: '33311', debit: 0, credit: 0, part: 'tax' },
    ]));
    // Giá vốn KHÔNG ghi trên phiếu bán (22/10/2026): tính giá vốn tháng sinh phiếu giá vốn riêng theo từng mã hàng.
    expect(lines.filter((l: any) => l.part === 'cogs')).toHaveLength(0);
  });

  it('gửi lại cùng phiên bản không ghi trùng', async () => {
    const { body } = await call(ctx, 'POST', '/api/v1/documents', saleDoc());
    expect(body.data.status).toBe('unchanged');
  });

  it('phiên bản mới: đảo bút toán cũ, ghi bút toán mới', async () => {
    const v2 = saleDoc({
      version: 2,
      lines: [{ lineKey: 'l1', sku: 'SUA01', name: 'Sữa bột 900g', unit: 'Hộp', qty: 2, amountBeforeTax: 370370, taxCode: 'R08', taxAmount: 29630 }],
      payments: [{ methodCode: 'QR', amount: 400000 }],
      totals: { beforeTax: 370370, tax: 29630, total: 400000 },
    });
    const { body } = await call(ctx, 'POST', '/api/v1/documents', v2);
    expect(body.data.status).toBe('posted');

    const detail = (await call(ctx, 'GET', `/api/v1/documents/${await docIdByKey('pos:CN01:HD0001')}`)).body.data;
    const internal = detail.entries;
    // Mỗi phiên bản 2 bút toán (hàng + thu tiền): gốc (đã đảo) 2 + bút toán đảo 2 + bút toán mới 2.
    expect(internal).toHaveLength(6);
    expect(internal.filter((e: any) => e.status === 'reversed')).toHaveLength(2);
    expect(internal.filter((e: any) => e.isReversal)).toHaveLength(2);

    const lines = await activeLines(detail.id);
    expect(lines).toEqual(expect.arrayContaining([{ account: '11210007', debit: 400000, credit: 0, part: 'payment' }]));
  });

  it('phiên bản cũ hơn bị từ chối', async () => {
    const { status, body } = await call(ctx, 'POST', '/api/v1/documents', saleDoc({ version: 1 }));
    expect(status).toBe(409);
    expect(body.error.code).toBe('CONFLICT');
  });

  it('phiếu nội bộ: ghi sổ, không lên sổ hoá đơn', async () => {
    const z = saleDoc({ docKey: 'pos:CN01:HD0001Z', docNo: 'HD0001Z', internalOnly: true, invoice: undefined });
    const { body } = await call(ctx, 'POST', '/api/v1/documents', z);
    expect(body.data.status).toBe('posted');
    expect(body.data.entryIds).toHaveLength(2); // bút toán hàng + bút toán thu tiền
  });

  it('tổng tiền không khớp các dòng bị từ chối', async () => {
    const bad = saleDoc({ docKey: 'pos:bad', totals: { beforeTax: 1, tax: 14815, total: 14816 } });
    const { status, body } = await call(ctx, 'POST', '/api/v1/documents', bad);
    expect(status).toBe(400);
    expect(body.error.code).toBe('VALIDATION_ERROR');
  });
});

describe('Hàng bán trả lại', () => {
  it('giảm doanh thu qua tài khoản hàng bán trả lại và giảm thuế', async () => {
    const ret = {
      docType: 'sale_return',
      docKey: 'pos:CN01:TH0001',
      branchCode: 'CN01',
      docNo: 'TH0001',
      docDate: '2026-10-06',
      originalDocKey: 'pos:CN01:HD0001',
      partner: { code: '0912345678', name: 'Nguyễn Văn A' },
      invoice: { no: '0000200', serial: 'C26TAA', form: '1', date: '2026-10-06', relation: 'adjusts', relatedInvoiceNo: '0000123' },
      lines: [{ lineKey: 'r1', sku: 'SUA01', name: 'Sữa bột 900g', qty: 1, amountBeforeTax: 185185, taxCode: 'R08', taxAmount: 14815 }],
      payments: [{ methodCode: 'TM', amount: 200000 }],
      totals: { beforeTax: 185185, tax: 14815, total: 200000 },
    };
    const { body } = await call(ctx, 'POST', '/api/v1/documents', ret);
    expect(body.data.status).toBe('posted');
    const lines = await activeLines(await docIdByKey('pos:CN01:TH0001'));
    expect(lines).toEqual(
      expect.arrayContaining([
        { account: '52131', debit: 185185, credit: 0, part: 'goods' },
        { account: '33311', debit: 14815, credit: 0, part: 'tax' },
        { account: '1311', debit: 200000, credit: 0, part: 'payment' },
        { account: '1111', debit: 0, credit: 200000, part: 'payment' },
      ]),
    );
  });
});

describe('Báo cáo', () => {
  it('cân đối phát sinh: tổng Nợ = tổng Có', async () => {
    const { body } = await call(ctx, 'GET', '/api/v1/reports/trial-balance?from=2026-10-01&to=2026-10-31');
    const t = body.data.totals;
    expect(t.debit).toBe(t.credit);
    expect(t.closingDebit).toBe(t.closingCredit);
    const r51111 = body.data.rows.find((r: any) => r.code === '51111');
    expect(r51111.credit).toBe(370370 + 185185); // hoá đơn v2 + phiếu nội bộ
  });

  it('cân đối phát sinh cuộn lên tài khoản mẹ; postingOnly=false không bị hiểu thành true', async () => {
    const { body } = await call(ctx, 'GET', '/api/v1/reports/trial-balance?from=2026-10-01&to=2026-10-31&postingOnly=false');
    const codes = body.data.rows.map((r: any) => r.code);
    expect(codes).toEqual(expect.arrayContaining(['511', '5111', '51111', '131', '1311']));
    const r511 = body.data.rows.find((r: any) => r.code === '511');
    const r51111 = body.data.rows.find((r: any) => r.code === '51111');
    expect(r511.credit).toBe(r51111.credit);
    const only = await call(ctx, 'GET', '/api/v1/reports/trial-balance?from=2026-10-01&to=2026-10-31&postingOnly=true');
    expect(only.body.data.rows.some((r: any) => r.code === '511')).toBe(false);
  });

  it('sổ chi tiết 1311: khách đã trả đủ thì dư cuối bằng 0', async () => {
    const { body } = await call(ctx, 'GET', '/api/v1/reports/account-ledger?account=1311&from=2026-10-01&to=2026-10-31');
    expect(body.data.closing).toEqual({ debit: 0, credit: 0 });
    expect(body.data.rows.every((r: any) => r.counterAccounts.length > 0)).toBe(true);
  });

  it('bảng kê bán ra: thuế suất 8% nằm trong nhóm 10%, hàng trả lại ghi âm', async () => {
    const { body } = await call(ctx, 'GET', '/api/v1/reports/sales-invoices?from=2026-10-01&to=2026-10-31');
    const g8 = body.data.groups.find((g: any) => g.group === 'R10');
    expect(g8.label).toBe('4. Thuế suất 10%');
    expect(g8.rows.every((r: any) => r.taxRate === 8)).toBe(true);
    expect(g8.amount).toBe(370370 - 185185);
    expect(g8.tax).toBe(29630 - 14815);
    expect(body.data.totals.invoices).toBe(2); // phiếu nội bộ không lên bảng kê
  });

  it('xuất CSV qua add-in', async () => {
    const res = await ctx.app.inject({ method: 'GET', url: '/api/v1/addins/excel-export/trial-balance.csv?from=2026-10-01&to=2026-10-31', headers: { authorization: `Bearer ${ctx.token}` } });
    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toContain('text/csv');
    expect(res.body).toContain('51111');
  });
});

describe('Lỗi cấu hình và ghi sổ lại', () => {
  it('loại thuế chưa khai báo → chứng từ lỗi; khai báo xong ghi sổ lại được', async () => {
    const doc = saleDoc({
      docKey: 'pos:CN01:HD0009',
      docNo: 'HD0009',
      lines: [{ lineKey: 'l1', sku: 'X', name: 'Hàng X', qty: 1, amountBeforeTax: 100000, taxCode: 'R07', taxAmount: 7000 }],
      payments: [],
      totals: { beforeTax: 100000, tax: 7000, total: 107000 },
    });
    const first = await call(ctx, 'POST', '/api/v1/documents', doc);
    expect(first.body.data.status).toBe('error');
    expect(first.body.data.error.message).toContain('R07');

    const id = await docIdByKey('pos:CN01:HD0009');
    await call(ctx, 'POST', '/api/v1/tax-codes', { code: 'R07', name: 'Thuế 7%', rate: 7, direction: 'output', accountCode: '33311', reportGroup: '8' });
    const again = await call(ctx, 'POST', '/api/v1/documents/post', { ids: [id] });
    expect(again.body.data.posted, JSON.stringify(again.body)).toBe(1);
  });
});

describe('Khoá sổ', () => {
  it('không ghi được chứng từ vào kỳ đã khoá', async () => {
    const lock = await call(ctx, 'POST', '/api/v1/periods/locks', { year: 2026, month: 9 });
    expect(lock.status).toBe(200);
    const { body } = await call(ctx, 'POST', '/api/v1/documents', saleDoc({ docKey: 'pos:CN01:HD0900', docNo: 'HD0900', docDate: '2026-09-20' }));
    expect(body.data.status).toBe('error');
    expect(body.data.error.code).toBe('PERIOD_LOCKED');
  });
});

describe('Sổ cái chỉ thêm', () => {
  it('database chặn sửa dòng sổ cái', async () => {
    const { db } = await import('../src/db/client.js');
    await expect(db.updateTable('ledger_lines').set({ description: 'sửa' }).where('id', '>', '0').execute()).rejects.toThrow(/chỉ được thêm/);
  });
});
