/**
 * [2026-11-13 Nguyễn Văn Thủy] Lớp trung gian "bút toán gộp theo tài khoản" (0134) (đóng góp)
 * Sổ lưu chi tiết từng mã hàng; bảng gộp giữ mỗi bút toán × TK × TK đối ứng × đối tượng × bên một dòng, tự theo khi ghi sổ và khi
 * điền giá vốn tháng. Nhật ký chung / sổ chi tiết chế độ Cộng gộp đọc bảng gộp: số tiền khớp sổ chi tiết, ít dòng hơn.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { sql } from 'kysely';
import { db } from '../src/db/client.js';
import { call, saleDoc, setupTenant, type TestCtx } from './helpers.js';

let ctx: TestCtx;
let tenantId: string;

const line = (k: string, sku: string, qty: number, price: number, tax: string) => ({ lineKey: k, sku, name: sku, unit: 'Hộp', qty, amountBeforeTax: qty * price, taxCode: tax, taxAmount: qty * price * 0.08 });

beforeAll(async () => {
  ctx = await setupTenant();
  tenantId = (await db.selectFrom('tenants').select('id').where('code', '=', ctx.tenantCode).executeTakeFirstOrThrow()).id;
  await call(ctx, 'POST', '/api/v1/branches', { code: '05000', name: 'CN Sơn La' });
  const skus = ['SUA-A', 'SUA-B', 'SUA-C', 'SUA-D', 'SUA-E'];
  const r = await call(ctx, 'POST', '/api/v1/documents', {
    docType: 'purchase', docKey: 'NM-5', branchCode: '05000', docNo: 'NM-5', docDate: '2026-10-02', partner: { code: 'NCC-VNM', name: 'Công ty Sữa ABC' },
    lines: skus.map((s, i) => line(`l${i}`, s, 10, 100000, 'V08')),
    totals: { beforeTax: 5_000_000, tax: 400_000, total: 5_400_000 },
  });
  expect(r.status, JSON.stringify(r.body).slice(0, 300)).toBe(200);
  const b = await call(ctx, 'POST', '/api/v1/documents', saleDoc({
    docKey: 'BAN-5', docNo: 'BAN-5', branchCode: '05000', docDate: '2026-10-05', invoice: undefined,
    lines: skus.map((s, i) => line(`l${i}`, s, 1, 150000, 'R08')),
    payments: [{ methodCode: 'TM', amount: 810000 }], totals: { beforeTax: 750000, tax: 60000, total: 810000 },
  }));
  expect(b.status, JSON.stringify(b.body).slice(0, 300)).toBe(200);
});
afterAll(async () => { await ctx.app.close(); });

/** Lệch giữa bảng gộp và sổ chi tiết theo từng bút toán của đơn vị (phải rỗng). */
async function lech() {
  const r = await sql<{ entry_id: string }>`
    SELECT entry_id FROM (SELECT entry_id, sum(debit) d, sum(credit) c, count(*) n FROM ledger_lines WHERE tenant_id = ${tenantId} GROUP BY 1) a
      FULL JOIN (SELECT entry_id, sum(debit) d, sum(credit) c, sum(line_count) n FROM ledger_entry_accounts WHERE tenant_id = ${tenantId} GROUP BY 1) b USING (entry_id)
     WHERE a.d IS DISTINCT FROM b.d OR a.c IS DISTINCT FROM b.c OR a.n IS DISTINCT FROM b.n`.execute(db);
  return r.rows;
}

describe('Bút toán gộp theo tài khoản', () => {
  it('phiếu nhiều mã hàng: sổ lưu từng mã, bảng gộp mỗi TK một dòng; tổng khớp từng bút toán', async () => {
    const detail = await sql<{ n: number }>`SELECT count(*)::int AS n FROM ledger_lines l JOIN ledger_entries e ON e.id = l.entry_id WHERE e.tenant_id = ${tenantId} AND e.doc_no = 'BAN-5'`.execute(db);
    const gop = await sql<{ account_code: string; line_count: number }>`
      SELECT g.account_code, g.line_count FROM ledger_entry_accounts g JOIN ledger_entries e ON e.id = g.entry_id
       WHERE e.tenant_id = ${tenantId} AND e.doc_no = 'BAN-5' AND (g.debit <> 0 OR g.credit <> 0)`.execute(db);
    expect(detail.rows[0]!.n).toBeGreaterThanOrEqual(10); // 5 mã × (doanh thu + thuế) …
    expect(gop.rows.length).toBeLessThan(detail.rows[0]!.n);
    expect(gop.rows.find((x) => x.account_code.startsWith('511'))?.line_count).toBe(5);
    expect(await lech()).toEqual([]);
  });

  it('điền giá vốn tháng: bảng gộp theo số tiền mới', async () => {
    const run = await call(ctx, 'POST', '/api/v1/inventory/costing', { period: '2026-10' });
    expect(run.status, JSON.stringify(run.body).slice(0, 300)).toBe(200);
    expect(await lech()).toEqual([]);
    const cogs = await sql<{ d: string }>`SELECT COALESCE(sum(debit), 0) AS d FROM ledger_entry_accounts WHERE tenant_id = ${tenantId} AND account_code LIKE '632%'`.execute(db);
    expect(Number(cogs.rows[0]!.d)).toBe(500000); // 5 hộp × 100.000
  });

  it('Nhật ký chung và Sổ chi tiết TK chế độ Cộng gộp đọc bảng gộp: số tiền bằng chế độ chi tiết, ít dòng hơn, có Số dòng', async () => {
    const q = (mode: number) => call(ctx, 'GET', `/api/v1/reports/journal?from=2026-10-01&to=2026-10-31&groupMode=${mode}&pageSize=100000`);
    const [ct, gp] = [(await q(1)).body.data, (await q(2)).body.data];
    expect(gp.totals.debit).toBe(ct.totals.debit);
    expect(gp.totals.credit).toBe(ct.totals.credit);
    expect(gp.rows.length).toBeLessThan(ct.rows.length);
    const sum = (rows: { debit: number }[]) => Math.round(rows.reduce((s, r) => s + r.debit, 0));
    expect(sum(gp.rows)).toBe(sum(ct.rows));
    expect(gp.rows.find((r: { accountCode: string; docNo: string }) => r.docNo === 'BAN-5' && r.accountCode.startsWith('511'))?.lineCount).toBe(5);
    // mã hàng ở chế độ gộp: nhiều mã → không có mã, đếm số mã; một mã → có mã
    expect(gp.rows.find((r: { accountCode: string; docNo: string }) => r.docNo === 'BAN-5' && r.accountCode.startsWith('511'))).toMatchObject({ productSku: null, skuCount: 5 });
    const one = gp.rows.find((r: { lineCount: number; productSku: string | null }) => r.lineCount === 1 && r.productSku);
    if (one) expect(one.skuCount).toBe(1);
    // trang 2 của chế độ gộp: phân trang trong CSDL
    const p2 = (await call(ctx, 'GET', '/api/v1/reports/journal?from=2026-10-01&to=2026-10-31&groupMode=2&pageSize=3&page=2')).body.data;
    expect(p2.rows.length).toBeLessThanOrEqual(3);

    const led = (mode: number) => call(ctx, 'GET', `/api/v1/reports/account-ledger?account=511&from=2026-10-01&to=2026-10-31&kind=detail&groupMode=${mode}`);
    const [l1, l2] = [(await led(1)).body.data, (await led(2)).body.data];
    const credit = (rows: { credit: number }[]) => Math.round(rows.reduce((s, r) => s + r.credit, 0));
    expect(credit(l2.rows)).toBe(credit(l1.rows));
    expect(l2.rows.length).toBeLessThan(l1.rows.length);
    expect(l2.rows[0].lineCount).toBe(5);
  });
});
