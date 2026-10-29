/**
 * Phiếu thanh toán là chứng từ riêng (như phiếu thanh toán khách hàng / nhà cung cấp tách khỏi hoá đơn):
 *   - phiếu bán không kèm tiền → khách nợ; mỗi phiếu thu một chứng từ, ghi sổ theo NGÀY THU, trỏ về hoá đơn
 *     (lines[].invoiceDocKey) → công nợ tự đối trừ đúng hoá đơn;
 *   - phiếu thu về trước khi hoá đơn định khoản → hoá đơn định khoản thì tự ghép;
 *   - phiếu chi trả tiền khách khi hoàn hàng: customer_payment, direction = out.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { sql } from 'kysely';
import { db } from '../src/db/client.js';
import { call, saleDoc, setupTenant, type TestCtx } from './helpers.js';

let ctx: TestCtx;
let tenantId: string;

beforeAll(async () => {
  ctx = await setupTenant();
  tenantId = (await db.selectFrom('tenants').select('id').where('code', '=', ctx.tenantCode).executeTakeFirstOrThrow()).id;
  await call(ctx, 'PUT', '/api/v1/products', { products: [{ sku: 'SUA01', name: 'Sữa bột 900g', unit: 'Hộp' }] });
});
afterAll(async () => {
  await ctx.app.close();
});

const sale = (key: string, no: string, date: string) => saleDoc({ docKey: key, docNo: no, docDate: date, invoice: undefined, payments: [] });
const receipt = (key: string, no: string, date: string, invoiceDocKey: string, amount: number, methodCode = 'TM', extra: Record<string, unknown> = {}) => ({
  docType: 'customer_payment', docKey: key, docNo: no, docDate: date, branchCode: 'CN01', methodCode,
  partner: { code: '0912345678' }, lines: [{ lineKey: 'l1', amount, invoiceDocKey }], totals: { total: amount }, ...extra,
});
const eventId = async (key: string) => String((await db.selectFrom('accounting_events').select('id').where('tenant_id', '=', tenantId).where('doc_key', '=', key).executeTakeFirstOrThrow()).id);
async function debt(key: string) {
  const r = await sql<{ side: string; amount: string; settled: string }>`
    SELECT side, amount, settled_amount AS settled FROM debt_items WHERE event_id = ${await eventId(key)}`.execute(db);
  return r.rows.map((x) => ({ side: x.side, amount: Number(x.amount), settled: Number(x.settled) }));
}
async function entries(key: string) {
  const r = await sql<{ doc_type: string; doc_no: string; posting_date: string }>`
    SELECT doc_type, doc_no, posting_date::text FROM ledger_entries WHERE event_id = ${await eventId(key)} AND status = 'posted' AND NOT is_reversal ORDER BY id`.execute(db);
  return r.rows.map((x) => `${x.doc_type}:${x.doc_no}@${x.posting_date}`);
}

describe('Phiếu thanh toán riêng, trỏ về hoá đơn', () => {
  it('phiếu bán không kèm tiền: chỉ bút toán bán hàng, khách nợ 200.000', async () => {
    const r = await call(ctx, 'POST', '/api/v1/documents', sale('wp:1:sale:1', 'BL001', '2026-10-01'));
    expect(r.body.data.status, JSON.stringify(r.body)).toBe('posted');
    expect(await entries('wp:1:sale:1')).toEqual(['sale:BL001@2026-10-01']);
    expect(await debt('wp:1:sale:1')).toEqual([{ side: 'debit', amount: 200000, settled: 0 }]);
  });

  it('hai phiếu thu ngày khác nhau: mỗi phiếu một chứng từ, ghi theo ngày thu, đối trừ đúng hoá đơn', async () => {
    let r = await call(ctx, 'POST', '/api/v1/documents', receipt('wp:1:receipt:11', 'PT011', '2026-10-01', 'wp:1:sale:1', 50000));
    expect(r.body.data.status, JSON.stringify(r.body)).toBe('posted');
    r = await call(ctx, 'POST', '/api/v1/documents', receipt('wp:1:receipt:12', 'PT012', '2026-10-15', 'wp:1:sale:1', 150000, 'CK'));
    expect(r.body.data.status, JSON.stringify(r.body)).toBe('posted');
    expect(await entries('wp:1:receipt:12')).toEqual(['customer_payment:PT012@2026-10-15']);
    expect(await debt('wp:1:sale:1')).toEqual([{ side: 'debit', amount: 200000, settled: 200000 }]);
    expect(await debt('wp:1:receipt:12')).toEqual([{ side: 'credit', amount: 150000, settled: 150000 }]);
  });

  it('đổi hình thức thanh toán của một phiếu thu: chỉ chứng từ đó lên phiên bản mới, hoá đơn vẫn đã thu đủ', async () => {
    const r = await call(ctx, 'POST', '/api/v1/documents', receipt('wp:1:receipt:12', 'PT012', '2026-10-15', 'wp:1:sale:1', 150000, 'TM', { version: 2 }));
    expect(r.body.data.status).toBe('posted');
    expect(await entries('wp:1:sale:1')).toEqual(['sale:BL001@2026-10-01']); // hoá đơn không bị đụng
    expect(await debt('wp:1:sale:1')).toEqual([{ side: 'debit', amount: 200000, settled: 200000 }]);
  });

  it('phiếu thu về trước khi hoá đơn định khoản: hoá đơn định khoản thì tự ghép', async () => {
    await call(ctx, 'POST', '/api/v1/documents', receipt('wp:1:receipt:21', 'PT021', '2026-10-02', 'wp:1:sale:2', 200000));
    expect(await debt('wp:1:receipt:21')).toEqual([{ side: 'credit', amount: 200000, settled: 0 }]);
    await call(ctx, 'POST', '/api/v1/documents', sale('wp:1:sale:2', 'BL002', '2026-10-02'));
    expect(await debt('wp:1:sale:2')).toEqual([{ side: 'debit', amount: 200000, settled: 200000 }]);
  });

  it('phiếu chi trả tiền khách khi hoàn hàng: thanh toán khách hàng chiều chi, Nợ 131 / Có 111, đối trừ phiếu hoàn', async () => {
    const ret = await call(ctx, 'POST', '/api/v1/documents', {
      docType: 'sale_return', docKey: 'wp:1:return:31', originalDocKey: 'wp:1:sale:2', branchCode: 'CN01', docNo: 'HT031', docDate: '2026-10-03',
      partner: { code: '0912345678' }, payments: [],
      lines: [{ lineKey: 'l1', sku: 'SUA01', qty: 1, amountBeforeTax: 185185, taxCode: 'R08', taxAmount: 14815 }],
      totals: { beforeTax: 185185, tax: 14815, total: 200000 },
    });
    expect(ret.body.data.status, JSON.stringify(ret.body)).toBe('posted');
    const r = await call(ctx, 'POST', '/api/v1/documents', receipt('wp:1:payment:32', 'PC032', '2026-10-03', 'wp:1:return:31', 200000, 'TM', { direction: 'out' }));
    expect(r.body.data.status, JSON.stringify(r.body)).toBe('posted');
    const lines = await sql<{ account_code: string; debit: string; credit: string }>`
      SELECT l.account_code, l.debit, l.credit FROM ledger_lines l JOIN ledger_entries e ON e.id = l.entry_id WHERE e.event_id = ${await eventId('wp:1:payment:32')} ORDER BY l.line_no`.execute(db);
    expect(lines.rows.map((x) => `${x.account_code.slice(0, 3)}:${Number(x.debit)}/${Number(x.credit)}`)).toEqual(['131:200000/0', '111:0/200000']);
    expect(await debt('wp:1:return:31')).toEqual([{ side: 'credit', amount: 200000, settled: 200000 }]);
  });

  it('đổi trả: trả hàng 200.000 rồi mua đơn 500.000 đối trừ, khách trả thêm 300.000 — đối trừ không sinh tiền, công nợ về 0', async () => {
    const ret = await call(ctx, 'POST', '/api/v1/documents', {
      docType: 'sale_return', docKey: 'wp:1:return:41', originalDocKey: 'wp:1:sale:1', branchCode: 'CN01', docNo: 'HT041', docDate: '2026-10-20',
      partner: { code: '0912345678' }, payments: [],
      lines: [{ lineKey: 'l1', sku: 'SUA01', qty: 1, amountBeforeTax: 185185, taxCode: 'R08', taxAmount: 14815 }],
      totals: { beforeTax: 185185, tax: 14815, total: 200000 },
    });
    expect(ret.body.data.status, JSON.stringify(ret.body)).toBe('posted');
    const sale5 = saleDoc({ docKey: 'wp:1:sale:42', docNo: 'BL042', docDate: '2026-10-20', invoice: undefined, payments: [], offsets: [{ docKey: 'wp:1:return:41', amount: 200000 }],
      lines: [{ lineKey: 'l1', sku: 'SUA01', qty: 2, amountBeforeTax: 462963, taxCode: 'R08', taxAmount: 37037 }], totals: { beforeTax: 462963, tax: 37037, total: 500000 } });
    expect((await call(ctx, 'POST', '/api/v1/documents', sale5)).body.data.status).toBe('posted');
    // Đối trừ: phiếu hoàn hết số khách được hoàn, đơn mới còn 300.000.
    expect(await debt('wp:1:return:41')).toEqual([{ side: 'credit', amount: 200000, settled: 200000 }]);
    expect(await debt('wp:1:sale:42')).toEqual([{ side: 'debit', amount: 500000, settled: 200000 }]);
    // Đơn mới không có bút toán tiền nào cho phần đối trừ.
    expect(await entries('wp:1:sale:42')).toEqual(['sale:BL042@2026-10-20']);
    await call(ctx, 'POST', '/api/v1/documents', receipt('wp:1:receipt:43', 'PT043', '2026-10-20', 'wp:1:sale:42', 300000));
    expect(await debt('wp:1:sale:42')).toEqual([{ side: 'debit', amount: 500000, settled: 500000 }]);
    // Báo cáo bán hàng: đơn đổi trả đã thu đủ (đối trừ 200.000 + phiếu thu 300.000); thu tiền theo hình thức tách DOITRU.
    const heads = await call(ctx, 'GET', '/api/v1/reports/sales-summary?from=2026-10-20&to=2026-10-20&groupBy=document');
    expect(heads.body.data.rows.find((r: { docNo: string }) => r.docNo === 'BL042')).toMatchObject({ total: 500000, paid: 500000, onCredit: 0, remaining: 0 });
    const pays = await call(ctx, 'GET', '/api/v1/reports/sales-payments?from=2026-10-20&to=2026-10-20&groupBy=day');
    expect(pays.body.data.totals.cells).toMatchObject({ TM: 300000, DOITRU: 200000 });
    expect(pays.body.data.methods.find((m: { code: string }) => m.code === 'DOITRU')).toMatchObject({ name: 'Đối trừ hàng bán trả lại', isReceivable: true });
    // Báo cáo thu tiền bán hàng: một dòng phiếu thu PT043 trả cho BL042 (đối trừ không phải phiếu thu).
    const rec = await call(ctx, 'GET', '/api/v1/reports/sales-receipts?from=2026-10-20&to=2026-10-20');
    expect(rec.body.data.rows.filter((x: { invNo: string }) => x.invNo === 'BL042')).toEqual([expect.objectContaining({ payNo: 'PT043', invTotal: 500000, paid: 300000, kind: 'Phiếu thu tiền khách hàng' })]);
    // Chi tiết phiếu: các phiếu thanh toán trỏ về và phần đối trừ (thẻ "Đối trừ phiếu nhập", "Đã thanh toán").
    const detail = (await call(ctx, 'GET', `/api/v1/documents/${await eventId('wp:1:sale:42')}`)).body.data;
    expect(detail.linkedPayments.map((x: { docNo: string; amount: number }) => `${x.docNo}:${x.amount}`)).toEqual(['PT043:300000']);
    expect(detail.offsets).toEqual([expect.objectContaining({ docKey: 'wp:1:return:41', docNo: 'HT041', amount: 200000, id: String(await eventId('wp:1:return:41')), status: 'posted' })]);
    // Liên kết ngược: phiếu thu biết nó trả cho hoá đơn nào; phiếu hoàn biết nó đã đối trừ vào phiếu bán nào.
    const pay = (await call(ctx, 'GET', `/api/v1/documents/${await eventId('wp:1:receipt:43')}`)).body.data;
    expect(pay.linkedInvoices).toEqual([expect.objectContaining({ id: String(await eventId('wp:1:sale:42')), docNo: 'BL042', docType: 'sale', total: 500000, amount: 300000, status: 'posted' })]);
    const retDoc = (await call(ctx, 'GET', `/api/v1/documents/${await eventId('wp:1:return:41')}`)).body.data;
    expect(retDoc.offsetBy).toEqual([expect.objectContaining({ docNo: 'BL042', amount: 200000 })]);
    // Định khoản lại đơn mới: đối trừ và phiếu thu vẫn giữ.
    const again = await call(ctx, 'POST', '/api/v1/documents/post', { ids: [await eventId('wp:1:sale:42')], repost: true });
    expect(again.body.data.posted + again.body.data.unchanged).toBe(1);
    expect(await debt('wp:1:sale:42')).toEqual([{ side: 'debit', amount: 500000, settled: 500000 }]);
  });

  it('đổi trả khác chi nhánh: báo lỗi, không ghi', async () => {
    await call(ctx, 'POST', '/api/v1/branches', { code: 'CN02', name: 'Cửa hàng 02' });
    const bad = saleDoc({ docKey: 'wp:2:sale:51', docNo: 'BL051', docDate: '2026-10-21', branchCode: 'CN02', invoice: undefined, payments: [], offsets: [{ docKey: 'wp:1:return:41', amount: 100000 }] });
    const r = await call(ctx, 'POST', '/api/v1/documents', bad);
    expect(r.body.data?.status ?? r.status, JSON.stringify(r.body)).not.toBe('posted');
    expect(JSON.stringify(r.body)).toContain('cùng chi nhánh');
  });
});
