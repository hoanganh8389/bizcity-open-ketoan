/**
 * Đối tượng mở rộng (kế hoạch Đợt 1, hạng mục 1.5): nhóm đối tượng, khoá, hạn thanh toán riêng, hạn mức nợ,
 * đồng bộ danh mục qua API; chứng từ gửi sang không ghi đè thông tin kế toán đã bổ sung; tuổi nợ dùng hạn riêng.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { call, setupTenant, type TestCtx } from './helpers.js';

let ctx: TestCtx;
const sale = (key: string, date: string, partner: string, amount: number) => ({
  docType: 'sale', docKey: key, branchCode: 'CN01', docNo: key, docDate: date, partner: { code: partner, name: '' },
  lines: [{ lineKey: 'l1', sku: 'A', name: 'Hàng A', qty: 1, amountBeforeTax: amount, taxCode: 'KCT', taxAmount: 0 }],
  payments: [], totals: { beforeTax: amount, tax: 0, total: amount },
});

beforeAll(async () => {
  ctx = await setupTenant();
});
afterAll(async () => {
  await ctx.app.close();
});

describe('Nhóm đối tượng', () => {
  it('có sẵn nhóm mặc định; thêm nhóm con', async () => {
    const g = await call(ctx, 'GET', '/api/v1/partner-groups');
    expect(g.body.data.map((x: { code: string }) => x.code)).toEqual(expect.arrayContaining(['KH-LE', 'KH-BUON', 'NCC-HH', 'NCC-TSDV', 'CHU-NHA']));
    expect((await call(ctx, 'PUT', '/api/v1/partner-groups/KH-BUON-HN', { name: 'Khách buôn Hà Nội', parentCode: 'KH-BUON', kind: 'customer' })).status).toBe(200);
    expect((await call(ctx, 'PUT', '/api/v1/partner-groups/X', { name: 'Sai', parentCode: 'KHONG-CO' })).status).toBe(400);
  });
});

describe('Đối tượng: nhóm, khoá, hạn thanh toán, hạn mức nợ', () => {
  it('lưu thông tin kế toán; nhóm không có trong danh mục bị từ chối', async () => {
    const r = await call(ctx, 'PUT', '/api/v1/partners/KH-B1', { name: 'Đại lý B1', kind: 'customer', groupCode: 'KH-BUON-HN', paymentTermDays: 45, creditLimit: 1000000 });
    expect(r.status, JSON.stringify(r.body)).toBe(200);
    expect(r.body.data).toMatchObject({ groupCode: 'KH-BUON-HN', paymentTermDays: 45, creditLimit: 1000000, isActive: true });
    expect((await call(ctx, 'PUT', '/api/v1/partners/KH-B2', { name: 'B2', groupCode: 'KHONG-CO' })).status).toBe(400);
  });

  it('đồng bộ danh mục hàng loạt', async () => {
    const r = await call(ctx, 'PUT', '/api/v1/partners', { partners: [
      { code: 'NCC-01', name: 'Công ty Sữa A', kind: 'supplier', groupCode: 'NCC-HH', taxCode: '0101234567' },
      { code: 'KH-L1', name: 'Khách lẻ 1', kind: 'customer', groupCode: 'KH-LE' },
    ] });
    expect(r.status, JSON.stringify(r.body)).toBe(200);
    const list = await call(ctx, 'GET', '/api/v1/partners?groupCode=NCC-HH');
    expect(list.body.data.map((p: { code: string }) => p.code)).toEqual(['NCC-01']);
  });

  it('chứng từ gửi sang không ghi đè nhóm, hạn, hạn mức', async () => {
    const r = await call(ctx, 'POST', '/api/v1/documents', sale('PG-1', '2026-09-01', 'KH-B1', 800000));
    expect(r.body.data?.status, JSON.stringify(r.body)).toBe('posted');
    const p = await call(ctx, 'GET', '/api/v1/partners?search=KH-B1');
    expect(p.body.data[0]).toMatchObject({ code: 'KH-B1', name: 'Đại lý B1', groupCode: 'KH-BUON-HN', paymentTermDays: 45, creditLimit: 1000000 });
  });

  it('khoá đối tượng; lọc theo trạng thái', async () => {
    expect((await call(ctx, 'PUT', '/api/v1/partners/KH-L1', { name: '', kind: 'customer', isActive: false })).status).toBe(200);
    const inactive = await call(ctx, 'GET', '/api/v1/partners?status=inactive');
    expect(inactive.body.data.map((p: { code: string }) => p.code)).toEqual(['KH-L1']);
    const active = await call(ctx, 'GET', '/api/v1/partners?status=active&groupCode=KH-LE');
    expect(active.body.data).toEqual([]);
    const v = await call(ctx, 'POST', '/api/v1/vouchers', { docType: 'receipt', branchCode: 'CN01', docDate: '2026-10-10', description: 'Thu', partnerCode: 'KH-L1', lines: [{ debitAccount: '1111', creditAccount: '1311', amount: 1000 }] });
    expect(v.status).toBe(400);
    expect(JSON.stringify(v.body)).toMatch(/đã khoá/);
  });
});

describe('Tuổi nợ dùng hạn thanh toán riêng và hạn mức nợ', () => {
  it('KH-B1 hạn 45 ngày: nợ 40 ngày vẫn trong hạn; khách khác hạn chung 30 ngày thì quá hạn; vượt hạn mức thì cảnh báo', async () => {
    expect((await call(ctx, 'POST', '/api/v1/documents', sale('PG-2', '2026-09-01', 'KH-L2', 500000))).body.data?.status).toBe('posted');
    expect((await call(ctx, 'POST', '/api/v1/documents', sale('PG-3', '2026-10-05', 'KH-B1', 300000))).body.data?.status).toBe('posted');
    const r = await call(ctx, 'GET', '/api/v1/reports/aging?asOf=2026-10-11&account=131&step=30');
    expect(r.status, JSON.stringify(r.body)).toBe(200);
    const b1 = r.body.data.rows.find((x: { partnerCode: string }) => x.partnerCode === 'KH-B1');
    const l2 = r.body.data.rows.find((x: { partnerCode: string }) => x.partnerCode === 'KH-L2');
    expect(b1).toMatchObject({ termDays: 45, ownTerm: true, balance: 1100000, inTerm: 1100000, overdue: 0, creditLimit: 1000000, overLimit: true, groupCode: 'KH-BUON-HN' });
    expect(l2).toMatchObject({ termDays: 30, ownTerm: false, inTerm: 0, overdue: 500000, overLimit: false });
    expect(r.body.data.totals).toMatchObject({ inTerm: 1100000, overdue: 500000 });
  });

  it('tuổi nợ theo hạn thanh toán từng khoản: trước hạn chia theo số ngày còn tới hạn; hạn trùng ngày chứng từ là không có hạn nợ', async () => {
    const r = await call(ctx, 'GET', '/api/v1/reports/aging-due?asOf=2026-10-11&account=131&step=30');
    expect(r.status, JSON.stringify(r.body)).toBe(200);
    expect(r.body.data.ranges).toEqual(['1 - 30', '31 - 60', '61 - 90', '91 - 120', 'Trên 120']);
    const b1 = r.body.data.rows.find((x: { partnerCode: string }) => x.partnerCode === 'KH-B1');
    const l2 = r.body.data.rows.find((x: { partnerCode: string }) => x.partnerCode === 'KH-L2');
    // KH-B1 hạn 45 ngày: PG-1 (01/09) tới hạn 16/10 còn 5 ngày; PG-3 (05/10) tới hạn 19/11 còn 39 ngày.
    expect(b1).toMatchObject({ total: 1100000, noTerm: 0, before: [800000, 300000, 0, 0, 0], beforeTotal: 1100000, overTotal: 0 });
    // KH-L2 không khai hạn: hạn = ngày chứng từ.
    expect(l2).toMatchObject({ total: 500000, noTerm: 500000, beforeTotal: 0, overTotal: 0 });
    // Quá hạn: xem tại 30/11 thì PG-1 quá 45 ngày, PG-3 quá 11 ngày.
    const later = await call(ctx, 'GET', '/api/v1/reports/aging-due?asOf=2026-11-30&account=131&step=30&partnerCode=KH-B1');
    expect(later.body.data.rows[0]).toMatchObject({ over: [300000, 800000, 0, 0, 0], overTotal: 1100000 });
  });

  it('sổ công nợ theo hạn thanh toán: dòng đối tượng (dư đầu, phát sinh, dư cuối) và từng chứng từ nợ kèm hạn, ngày phải trả', async () => {
    const r = await call(ctx, 'GET', '/api/v1/reports/debt-by-term?from=2026-10-01&to=2026-10-31&account=131&partnerCode=KH-B1');
    expect(r.status, JSON.stringify(r.body)).toBe(200);
    const [head, doc] = r.body.data.rows;
    expect(head).toMatchObject({ kind: 'partner', partnerCode: 'KH-B1', opening: 800000, debit: 300000, credit: 0, closing: 1100000 });
    expect(doc).toMatchObject({ kind: 'doc', docNo: 'PG-3', docDate: '2026-10-05', termDays: 45, dueDate: '2026-11-19', debit: 300000 });
  });
});
