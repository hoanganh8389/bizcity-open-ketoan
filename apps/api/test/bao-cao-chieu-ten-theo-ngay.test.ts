// [2026-11-09 11:55 AM Johnny Chu - Chu Hoàng Anh] PHASE-029 — S029-19 đợt 2d: T029-DIM-1..2 — nhật ký chi tiền theo khoản mục hiện tên đối tượng LÚC GHI (chữ chốt: docs/phases/PHASE-029-CHUAN-HOA-CHUNG-TU-GOC-TRUY-VET/36-THUOC-TINH-CO-HIEU-LUC.md §2)
/**
 *   T029-DIM-1  dòng Nợ có đối tượng → tên lúc ghi của DÒNG: chứng từ ghi trước và NHẬP MUỘN (ngày chứng từ trước ngày đổi tên) mang tên cũ; hôm nay mang tên mới
 *   T029-DIM-2  dòng Nợ không có đối tượng, đầu bút toán có → tên lúc ghi của ĐẦU bút toán (cùng quy tắc)
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { sql } from 'kysely';
import { db } from '../src/db/client.js';
import { call, setupTenant, type TestCtx } from './helpers.js';

let ctx: TestCtx;
let tenantId = '';
let today = '';
const LINE_P = 'NCC-DL';
const HEAD_P = 'NCC-DH';

const pay = async (description: string, docDate: string, partner: { partnerCode: string }, where: 'line' | 'head') => {
  // đường dòng: trả nợ nhà cung cấp (Nợ 331 mang đối tượng); đường đầu: chi phí (Nợ 64231 không mang đối tượng)
  const line = where === 'line' ? { debitAccount: '33111', creditAccount: '1111', amount: 100000, ...partner } : { debitAccount: '64231', creditAccount: '1111', amount: 100000, costItem: 'KM-VPP' };
  const r = await call(ctx, 'POST', '/api/v1/vouchers', { docType: 'payment', branchCode: 'CN01', docDate, description, ...(where === 'head' ? partner : {}), lines: [line] });
  expect(r.status, JSON.stringify(r.body)).toBe(201);
};

beforeAll(async () => {
  ctx = await setupTenant();
  tenantId = (await db.selectFrom('tenants').select('id').where('code', '=', ctx.tenantCode).executeTakeFirstOrThrow()).id;
  today = (await sql<{ d: string }>`SELECT CURRENT_DATE::text AS d`.execute(db)).rows[0]!.d;
  await call(ctx, 'PUT', '/api/v1/dimensions/cost_item/KM-VPP', { name: 'Văn phòng phẩm' });
  await call(ctx, 'PUT', `/api/v1/partners/${LINE_P}`, { name: 'NCC Dòng Tên Cũ', kind: 'supplier' });
  await call(ctx, 'PUT', `/api/v1/partners/${HEAD_P}`, { name: 'NCC Đầu Tên Cũ', kind: 'supplier' });
  await pay('DIM-L1', '2026-10-10', { partnerCode: LINE_P }, 'line');
  await pay('DIM-H1', '2026-10-10', { partnerCode: HEAD_P }, 'head');
  await sql`UPDATE partners SET name = 'NCC Dòng Tên Mới' WHERE tenant_id = ${tenantId} AND code = ${LINE_P}`.execute(db);
  await sql`UPDATE partners SET name = 'NCC Đầu Tên Mới' WHERE tenant_id = ${tenantId} AND code = ${HEAD_P}`.execute(db);
  await pay('DIM-L2', '2026-10-20', { partnerCode: LINE_P }, 'line'); // NHẬP MUỘN: ghi sau khi đổi tên, ngày chứng từ trước đó
  await pay('DIM-H2', '2026-10-20', { partnerCode: HEAD_P }, 'head');
  await pay('DIM-L3', today, { partnerCode: LINE_P }, 'line');
  await pay('DIM-H3', today, { partnerCode: HEAD_P }, 'head');
});
afterAll(async () => {
  await ctx.app.close();
});

type Row = { description: string; partnerName: string };
const rows = async (range: string) => (await call(ctx, 'GET', `/api/v1/reports/cash-payments-by-item?${range}`)).body.data.rows as Row[];
const nameOf = (rs: Row[], desc: string) => rs.find((r) => r.description === desc)?.partnerName;
const OCT = 'from=2026-10-01&to=2026-10-31';

describe('T029-DIM — nhật ký chi tiền theo khoản mục hiện tên lúc ghi', () => {
  it('T029-DIM-1 đối tượng ở dòng Nợ: tên lúc ghi của dòng', async () => {
    const oct = await rows(OCT);
    const lineHas = (await sql<{ n: number }>`SELECT count(*)::int AS n FROM ledger_lines l JOIN ledger_entries e ON e.id = l.entry_id WHERE e.tenant_id = ${tenantId} AND e.description = 'DIM-L2' AND l.account_code LIKE '33111%' AND l.debit > 0 AND l.partner_id IS NOT NULL`.execute(db)).rows[0]!.n;
    expect(lineHas).toBe(1); // đúng là đi đường "dòng"
    expect(nameOf(oct, 'DIM-L1')).toBe('NCC Dòng Tên Cũ');
    expect(nameOf(oct, 'DIM-L2')).toBe('NCC Dòng Tên Cũ'); // NHẬP MUỘN
    expect(nameOf(await rows(`from=${today}&to=${today}`), 'DIM-L3')).toBe('NCC Dòng Tên Mới');
  });

  it('T029-DIM-2 đối tượng chỉ ở đầu bút toán: tên lúc ghi của đầu', async () => {
    const n = (await sql<{ n: number }>`SELECT count(*)::int AS n FROM ledger_lines l JOIN ledger_entries e ON e.id = l.entry_id WHERE e.tenant_id = ${tenantId} AND e.description = 'DIM-H2' AND l.partner_id IS NOT NULL`.execute(db)).rows[0]!.n;
    expect(n).toBe(0); // đúng là đi đường "đầu bút toán"
    const oct = await rows(OCT);
    expect(nameOf(oct, 'DIM-H1')).toBe('NCC Đầu Tên Cũ');
    expect(nameOf(oct, 'DIM-H2')).toBe('NCC Đầu Tên Cũ'); // NHẬP MUỘN
    expect(nameOf(await rows(`from=${today}&to=${today}`), 'DIM-H3')).toBe('NCC Đầu Tên Mới');
  });
});
