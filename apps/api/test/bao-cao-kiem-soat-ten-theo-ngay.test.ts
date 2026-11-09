// [2026-11-09 07:31 PM Johnny Chu - Chu Hoàng Anh] PHASE-029 — S029-19 đợt 2e: T029-CTL-1..5 — báo cáo kiểm soát và bảng cân đối hiện tên đối tượng theo D029-19-4 (chữ chốt: docs/phases/PHASE-029-CHUAN-HOA-CHUNG-TU-GOC-TRUY-VET/36-THUOC-TINH-CO-HIEU-LUC.md §4)
/**
 *   T029-CTL-1  tuổi nợ (aging): dòng gom theo đối tượng → tên tại NGÀY XEM
 *   T029-CTL-2  tuổi nợ theo hạn (aging-due): dòng gom → tên tại ngày xem
 *   T029-CTL-3  sổ công nợ theo hạn (debt-by-term): dòng đối tượng → tên cuối kỳ; dòng TỪNG CHỨNG TỪ (kể cả nhập muộn) → tên tại ngày chứng từ
 *   T029-CTL-4  lãi lỗ theo hợp đồng: tên đối tượng của hợp đồng → tên cuối kỳ
 *   T029-CTL-5  bảng cân đối, ghi chú chuyển dài hạn khai thủ công (termMoves) → tên tại ngày lập bảng
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { sql } from 'kysely';
import { db } from '../src/db/client.js';
import { termMoves } from '../src/phan-he/ke-toan/reports/balance-sheet.js';
import { call, setupTenant, type TestCtx } from './helpers.js';

let ctx: TestCtx;
let tenantId = '';
let today = '';
let bankId = '';
const CUST = 'KH-KS';
const BANK = 'NH-KS';

const sale = (docKey: string, docDate: string, partner: { code: string; name?: string }, amount: number) => ({
  docType: 'sale', docKey, branchCode: 'CN01', docNo: docKey, docDate, partner,
  lines: [{ lineKey: 'l1', sku: 'KSHANG', name: 'Hàng kiểm soát', unit: 'Cái', qty: 1, amountBeforeTax: amount, taxCode: 'R08', taxAmount: Math.round(amount * 0.08) }],
  payments: [], totals: { beforeTax: amount, tax: Math.round(amount * 0.08), total: amount + Math.round(amount * 0.08) },
});
const post = async (doc: unknown) => { const r = await call(ctx, 'POST', '/api/v1/documents', doc); expect(r.body.data?.status, JSON.stringify(r.body)).toBe('posted'); };

beforeAll(async () => {
  ctx = await setupTenant();
  tenantId = (await db.selectFrom('tenants').select('id').where('code', '=', ctx.tenantCode).executeTakeFirstOrThrow()).id;
  today = (await sql<{ d: string }>`SELECT CURRENT_DATE::text AS d`.execute(db)).rows[0]!.d;
  await call(ctx, 'PUT', `/api/v1/partners/${BANK}`, { name: 'Ngân hàng KS Tên Cũ', kind: 'other' });
  await call(ctx, 'PUT', `/api/v1/long-term-balances`, { asOf: '2026-10-31', lines: [{ accountCode: '34111', partnerCode: BANK, amount: 300000000, note: 'trả gốc từ 2028' }] });
  await post(sale('KS-S1', '2026-09-10', { code: CUST, name: 'Khách KS Tên Cũ' }, 1000000));
  await call(ctx, 'PUT', '/api/v1/dimensions/contract/HD-KS', { name: 'Hợp đồng KS', extra: { partnerCode: CUST, type: 'sale', value: 5000000 } });
  const v1 = await call(ctx, 'POST', '/api/v1/vouchers', { docType: 'manual', branchCode: 'CN01', docDate: '2026-10-05', description: 'Doanh thu HD-KS', lines: [{ debitAccount: '1111', creditAccount: '51111', amount: 700000, contract: 'HD-KS' }] });
  expect(v1.status, JSON.stringify(v1.body)).toBe(201);
  // đổi tên qua cột: có hiệu lực từ HÔM NAY
  await sql`UPDATE partners SET name = 'Khách KS Tên Mới' WHERE tenant_id = ${tenantId} AND code = ${CUST}`.execute(db);
  await sql`UPDATE partners SET name = 'Ngân hàng KS Tên Mới' WHERE tenant_id = ${tenantId} AND code = ${BANK}`.execute(db);
  bankId = (await sql<{ id: string }>`SELECT id::text AS id FROM partners WHERE tenant_id = ${tenantId} AND code = ${BANK}`.execute(db)).rows[0]!.id;
  await call(ctx, 'PUT', `/api/v1/long-term-balances`, { asOf: today, lines: [{ accountCode: '34111', partnerCode: BANK, amount: 300000000, note: 'trả gốc từ 2028' }] });
  await post(sale('KS-S2', '2026-10-20', { code: CUST }, 2000000)); // NHẬP MUỘN: ghi sau khi đổi tên, ngày chứng từ trước đó
  await post(sale('KS-S3', today, { code: CUST }, 3000000));
});
afterAll(async () => {
  await ctx.app.close();
});

const names = (rows: { partnerCode: string; partnerName: string }[], code: string) => [...new Set(rows.filter((r) => r.partnerCode === code).map((r) => r.partnerName))];

describe('T029-CTL — báo cáo kiểm soát và bảng cân đối hiện tên theo D029-19-4', () => {
  it('T029-CTL-1 tuổi nợ: tên tại ngày xem', async () => {
    const q = async (asOf: string) => (await call(ctx, 'GET', `/api/v1/reports/aging?asOf=${asOf}&account=131&step=30`)).body.data.rows as { partnerCode: string; partnerName: string }[];
    expect(names(await q('2026-10-31'), CUST)).toEqual(['Khách KS Tên Cũ']);
    expect(names(await q(today), CUST)).toEqual(['Khách KS Tên Mới']);
  });

  it('T029-CTL-2 tuổi nợ theo hạn: tên tại ngày xem', async () => {
    const q = async (asOf: string) => (await call(ctx, 'GET', `/api/v1/reports/aging-due?asOf=${asOf}&account=131&step=30`)).body.data.rows as { partnerCode: string; partnerName: string }[];
    expect(names(await q('2026-10-31'), CUST)).toEqual(['Khách KS Tên Cũ']);
    expect(names(await q(today), CUST)).toEqual(['Khách KS Tên Mới']);
  });

  it('T029-CTL-3 sổ công nợ theo hạn: dòng đối tượng = tên cuối kỳ, dòng chứng từ = tên tại ngày chứng từ (kể cả nhập muộn)', async () => {
    type R = { kind: string; partnerCode: string; partnerName: string; docNo: string };
    const q = async (to: string) => (await call(ctx, 'GET', `/api/v1/reports/debt-by-term?from=2026-09-01&to=${to}&account=131`)).body.data.rows as R[];
    const oct = await q('2026-10-31');
    expect(oct.find((r) => r.kind === 'partner' && r.partnerCode === CUST)?.partnerName).toBe('Khách KS Tên Cũ'); // cuối kỳ trước ngày đổi tên
    const now = await q(today);
    expect(now.find((r) => r.kind === 'partner' && r.partnerCode === CUST)?.partnerName).toBe('Khách KS Tên Mới'); // cuối kỳ từ ngày đổi tên
    const doc = (rows: R[], no: string) => rows.find((r) => r.kind === 'doc' && r.docNo === no)?.partnerName;
    // cùng một báo cáo, tên TỪNG CHỨNG TỪ theo ngày chứng từ, không theo cuối kỳ
    expect(doc(now, 'KS-S1')).toBe('Khách KS Tên Cũ');
    expect(doc(now, 'KS-S2')).toBe('Khách KS Tên Cũ'); // NHẬP MUỘN
    expect(doc(now, 'KS-S3')).toBe('Khách KS Tên Mới');
  });

  it('T029-CTL-4 lãi lỗ theo hợp đồng: tên đối tượng của hợp đồng = tên cuối kỳ', async () => {
    const q = async (to: string) => (await call(ctx, 'GET', `/api/v1/reports/profit-by-contract?from=2026-10-01&to=${to}`)).body.data.rows as { contractCode: string; partnerName: string }[];
    expect((await q('2026-10-31')).find((r) => r.contractCode === 'HD-KS')?.partnerName).toBe('Khách KS Tên Cũ');
    expect((await q(today)).find((r) => r.contractCode === 'HD-KS')?.partnerName).toBe('Khách KS Tên Mới');
  });

  it('T029-CTL-5 ghi chú chuyển dài hạn: tên tại ngày lập bảng', async () => {
    const bals = [{ account: '34111', partnerId: bankId, net: -50_000_000_000 }];
    const note = async (date: string) => (await termMoves(db, { tenantId, date, bals })).find((m) => m.account === '34111')?.note ?? '';
    expect(await note('2026-10-31')).toContain('Ngân hàng KS Tên Cũ');
    expect(await note(today)).toContain('Ngân hàng KS Tên Mới');
  });
});
