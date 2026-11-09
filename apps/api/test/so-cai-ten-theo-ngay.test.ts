// [2026-11-09 11:29 AM Johnny Chu - Chu Hoàng Anh] PHASE-029 — S029-19 đợt 2c: T029-LED-1..3 — sổ chi tiết tài khoản và nhật ký chung hiện tên đối tượng LÚC GHI (chữ chốt: docs/phases/PHASE-029-CHUAN-HOA-CHUNG-TU-GOC-TRUY-VET/36-THUOC-TINH-CO-HIEU-LUC.md §2)
/**
 *   T029-LED-1  sổ chi tiết tài khoản 511 (dòng không gắn đối tượng → tên lúc ghi của đầu bút toán): chứng từ ghi trước và NHẬP MUỘN mang tên cũ; hôm nay mang tên mới
 *   T029-LED-2  sổ chi tiết tài khoản tiền 111 (dòng gắn đối tượng → tên lúc ghi của dòng): cùng quy tắc
 *   T029-LED-3  nhật ký chung: cùng quy tắc ở cả hai kiểu dòng
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { sql } from 'kysely';
import { db } from '../src/db/client.js';
import { call, setupTenant, type TestCtx } from './helpers.js';

let ctx: TestCtx;
let tenantId = '';
let today = '';
const CUST = 'KH-SC';

const saleDoc = (docKey: string, docDate: string, partner: { code: string; name?: string }, amount: number) => ({
  docType: 'sale', docKey, branchCode: 'CN01', docNo: docKey, docDate, partner,
  lines: [{ lineKey: 'l1', sku: 'SCHANG', name: 'Hàng sổ cái', unit: 'Cái', qty: 1, amountBeforeTax: amount, taxCode: 'R08', taxAmount: Math.round(amount * 0.08) }],
  payments: [{ methodCode: 'TM', amount: amount + Math.round(amount * 0.08) }], totals: { beforeTax: amount, tax: Math.round(amount * 0.08), total: amount + Math.round(amount * 0.08) },
});
const post = async (doc: unknown) => { const r = await call(ctx, 'POST', '/api/v1/documents', doc); expect(r.body.data?.status, JSON.stringify(r.body)).toBe('posted'); };

beforeAll(async () => {
  ctx = await setupTenant();
  tenantId = (await db.selectFrom('tenants').select('id').where('code', '=', ctx.tenantCode).executeTakeFirstOrThrow()).id;
  today = (await sql<{ d: string }>`SELECT CURRENT_DATE::text AS d`.execute(db)).rows[0]!.d;
  await post(saleDoc('SC-S1', '2026-10-10', { code: CUST, name: 'Khách SC Tên Cũ' }, 1000000));
  await sql`UPDATE partners SET name = 'Khách SC Tên Mới' WHERE tenant_id = ${tenantId} AND code = ${CUST}`.execute(db);
  await post(saleDoc('SC-S2', '2026-10-20', { code: CUST }, 2000000)); // NHẬP MUỘN: ghi sau khi đổi tên, ngày chứng từ trước đó
  await post(saleDoc('SC-S3', today, { code: CUST }, 3000000));
});
afterAll(async () => {
  await ctx.app.close();
});

type Row = { docNo: string; partnerName: string | null };
const OCT = 'from=2026-10-01&to=2026-10-31';
const nameOf = (rows: Row[], docNo: string) => rows.find((r) => r.docNo === docNo)?.partnerName;
const ledger = async (account: string, range: string) => (await call(ctx, 'GET', `/api/v1/reports/account-ledger?account=${account}&${range}`)).body.data.rows as Row[];

describe('T029-LED — sổ chi tiết và nhật ký chung hiện tên lúc ghi', () => {
  it('T029-LED-1 sổ chi tiết 511 (dòng không gắn đối tượng): tên lúc ghi của đầu bút toán', async () => {
    const n = (await sql<{ n: number }>`SELECT count(*)::int AS n FROM ledger_lines l JOIN ledger_entries e ON e.id = l.entry_id WHERE e.tenant_id = ${tenantId} AND e.doc_no = 'SC-S2' AND l.account_code LIKE '511%' AND l.partner_id IS NOT NULL`.execute(db)).rows[0]!.n;
    expect(n).toBe(0); // đúng là đi đường "đầu bút toán"
    const oct = await ledger('511', OCT);
    expect(nameOf(oct, 'SC-S1')).toBe('Khách SC Tên Cũ');
    expect(nameOf(oct, 'SC-S2')).toBe('Khách SC Tên Cũ');
    expect(nameOf(await ledger('511', `from=${today}&to=${today}`), 'SC-S3')).toBe('Khách SC Tên Mới');
  });

  it('T029-LED-2 sổ chi tiết 111 (dòng gắn đối tượng): tên lúc ghi của dòng', async () => {
    const oct = await ledger('111', OCT);
    expect(nameOf(oct, 'SC-S1')).toBe('Khách SC Tên Cũ');
    expect(nameOf(oct, 'SC-S2')).toBe('Khách SC Tên Cũ');
    expect(nameOf(await ledger('111', `from=${today}&to=${today}`), 'SC-S3')).toBe('Khách SC Tên Mới');
  });

  it('T029-LED-3 nhật ký chung: cùng quy tắc', async () => {
    const j = async (account: string, range: string) => (await call(ctx, 'GET', `/api/v1/reports/journal?${range}&account=${account}&limit=200`)).body.data.rows as Row[];
    for (const acc of ['511', '111']) {
      const oct = await j(acc, OCT);
      expect(nameOf(oct, 'SC-S1'), acc).toBe('Khách SC Tên Cũ');
      expect(nameOf(oct, 'SC-S2'), acc).toBe('Khách SC Tên Cũ');
      expect(nameOf(await j(acc, `from=${today}&to=${today}`), 'SC-S3'), acc).toBe('Khách SC Tên Mới');
    }
  });
});
