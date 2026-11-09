// [2026-11-09 09:33 AM Johnny Chu - Chu Hoàng Anh] PHASE-029 — S029-19 đợt 2a: T029-RPT-1..4 — báo cáo công nợ hiện tên đối tượng hiệu lực tại NGÀY KẾT THÚC KỲ (chữ chốt: docs/phases/PHASE-029-CHUAN-HOA-CHUNG-TU-GOC-TRUY-VET/36-THUOC-TINH-CO-HIEU-LUC.md §2)
/**
 *   T029-RPT-1  công nợ theo nhân viên: kỳ kết thúc TRƯỚC ngày đổi tên ra tên cũ; kỳ kết thúc từ ngày đổi tên trở đi ra tên mới; số liệu không đổi
 *   T029-RPT-2  công nợ theo mặt hàng: cùng quy tắc
 *   T029-RPT-3  đối tượng chưa đổi tên: tên không đổi ở mọi kỳ; mã luôn là mã hiện hành
 *   T029-RPT-4  partnerNamesAt: ngày cũ ra bản cũ, hôm nay ra bản mới, đối tượng của đơn vị khác không lộ ra
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { sql } from 'kysely';
import { db } from '../src/db/client.js';
import { partnerNamesAt } from '../src/phan-he/ke-toan/reports/ten-doi-tuong.js';
import { call, setupTenant, type TestCtx } from './helpers.js';

let ctx: TestCtx;
let other: TestCtx;
let tenantId = '';
let otherTenantId = '';
let today = '';
let renamedId = '';
let steadyId = '';

const sale = (docKey: string, partner: { code: string; name: string }, docDate: string, amount: number) => ({
  docType: 'sale', docKey, branchCode: 'CN01', docNo: docKey, docDate, partner,
  lines: [{ lineKey: 'l1', sku: 'HANG1', name: 'Hàng 1', unit: 'Cái', qty: 1, amountBeforeTax: amount, taxCode: 'R08', taxAmount: Math.round(amount * 0.08) }],
  payments: [], totals: { beforeTax: amount, tax: Math.round(amount * 0.08), total: amount + Math.round(amount * 0.08) },
});

beforeAll(async () => {
  ctx = await setupTenant();
  other = await setupTenant();
  const tid = async (c: TestCtx) => (await db.selectFrom('tenants').select('id').where('code', '=', c.tenantCode).executeTakeFirstOrThrow()).id;
  tenantId = await tid(ctx);
  otherTenantId = await tid(other);
  today = (await sql<{ d: string }>`SELECT CURRENT_DATE::text AS d`.execute(db)).rows[0]!.d;
  for (const d of [sale('RPT-A', { code: 'KH-DOI', name: 'Công ty Tên Cũ' }, '2026-09-10', 1000000), sale('RPT-B', { code: 'KH-YEN', name: 'Công ty Giữ Tên' }, '2026-09-12', 500000)]) {
    const r = await call(ctx, 'POST', '/api/v1/documents', d);
    expect(r.body.data?.status, JSON.stringify(r.body)).toBe('posted');
  }
  const ids = await sql<{ code: string; id: string }>`SELECT code, id::text AS id FROM partners WHERE tenant_id = ${tenantId} AND code IN ('KH-DOI', 'KH-YEN')`.execute(db);
  renamedId = ids.rows.find((r) => r.code === 'KH-DOI')!.id;
  steadyId = ids.rows.find((r) => r.code === 'KH-YEN')!.id;
  // đổi tên qua cột: có hiệu lực từ HÔM NAY
  await sql`UPDATE partners SET name = 'Công ty Tên Mới' WHERE id = ${renamedId}::bigint`.execute(db);
});
afterAll(async () => {
  await ctx.app.close();
});

type EmpRow = { partnerCode: string; partnerName: string; closingDebit: number };
const byEmployee = async (to: string) => ((await call(ctx, 'GET', `/api/v1/reports/debt-by-employee?from=2026-09-01&to=${to}&account=131`)).body.data.rows as EmpRow[]);
type ItemRow = { partnerCode: string; partnerName: string };
const byItem = async (to: string) => ((await call(ctx, 'GET', `/api/v1/reports/debt-by-item?from=2026-09-01&to=${to}&account=131`)).body.data.rows as ItemRow[]);
const nameOf = <T extends { partnerCode: string; partnerName: string }>(rows: T[], code: string) => [...new Set(rows.filter((r) => r.partnerCode === code).map((r) => r.partnerName))];

describe('T029-RPT — báo cáo công nợ hiện tên đối tượng tại ngày kết thúc kỳ', () => {
  it('T029-RPT-1 công nợ theo nhân viên: tên theo ngày kết thúc kỳ, số liệu không đổi', async () => {
    const before = await byEmployee('2026-10-31'); // kỳ kết thúc TRƯỚC ngày đổi tên
    const after = await byEmployee(today); // kỳ kết thúc ngày đổi tên
    expect(nameOf(before, 'KH-DOI')).toEqual(['Công ty Tên Cũ']);
    expect(nameOf(after, 'KH-DOI')).toEqual(['Công ty Tên Mới']);
    // đổi tên không làm đổi một đồng nào
    const money = (rows: EmpRow[], code: string) => rows.filter((r) => r.partnerCode === code).map((r) => r.closingDebit);
    expect(money(before, 'KH-DOI')).toEqual(money(after, 'KH-DOI'));
    expect(money(before, 'KH-DOI')[0]).toBeGreaterThan(0);
  });

  it('T029-RPT-2 công nợ theo mặt hàng: cùng quy tắc', async () => {
    expect(nameOf(await byItem('2026-10-31'), 'KH-DOI')).toEqual(['Công ty Tên Cũ']);
    expect(nameOf(await byItem(today), 'KH-DOI')).toEqual(['Công ty Tên Mới']);
  });

  it('T029-RPT-3 đối tượng chưa đổi tên: tên không đổi ở mọi kỳ', async () => {
    for (const to of ['2026-10-31', today]) {
      expect(nameOf(await byEmployee(to), 'KH-YEN')).toEqual(['Công ty Giữ Tên']);
      expect(nameOf(await byItem(to), 'KH-YEN')).toEqual(['Công ty Giữ Tên']);
    }
  });

  it('T029-RPT-4 partnerNamesAt: theo ngày; không lộ đối tượng của đơn vị khác; danh sách rỗng', async () => {
    const old = await partnerNamesAt(tenantId, [renamedId, steadyId], '2026-10-31');
    expect(old.get(renamedId)).toMatchObject({ code: 'KH-DOI', name: 'Công ty Tên Cũ' });
    expect(old.get(steadyId)).toMatchObject({ code: 'KH-YEN', name: 'Công ty Giữ Tên' });
    const now = await partnerNamesAt(tenantId, [renamedId], today);
    expect(now.get(renamedId)).toMatchObject({ name: 'Công ty Tên Mới' });
    // đơn vị khác không tra được đối tượng của đơn vị này
    expect((await partnerNamesAt(otherTenantId, [renamedId], today)).size).toBe(0);
    expect((await partnerNamesAt(tenantId, [], today)).size).toBe(0);
  });
});
