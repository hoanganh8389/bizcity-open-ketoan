// [2026-11-04 05:30 AM Johnny Chu - Chu Hoàng Anh] PHASE-026 — S026-2: Golden Test T026-G5 — chuyển kho giữa hai nhóm tính giá, mã đổi ở giữa
/**
 * T026-G5 (PHASE-026 · 00 §6): CN01 (nhóm tính giá A) mua 10 × 100.000, chuyển 5 sang CN02 (nhóm B) bằng mã CŨ; đổi mã; CN02 bán 2 bằng mã MỚI.
 *   - một định danh xuyên hai nhóm: mọi dòng sổ của mã cũ và mã mới cùng item_id;
 *   - nhóm nhận định giá theo nhóm GỬI (5 × 100.000) — đơn giá hai nhóm bằng nhau, không tách vì đổi mã;
 *   - tài khoản hàng đang chuyển / phải thu nội bộ về 0 (bên gửi Nợ, bên nhận Có triệt tiêu nhau);
 *   - giá vốn bán của CN02 = 2 × 100.000.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { sql } from 'kysely';
import { db } from '../src/db/client.js';
import { todayVN } from '../src/core/date-rules.js';
import { call, setupTenant, type TestCtx } from './helpers.js';

let ctx: TestCtx;
let tenantId = '';
const D = todayVN();
const ym = D.slice(0, 7);
const first = `${ym}-01`;
const post = (doc: unknown) => call(ctx, 'POST', '/api/v1/documents', doc);
const line = (sku: string, qty: number, amount: number, tax = 0) => ({ lineKey: 'l1', sku, name: sku, unit: 'Hộp', qty, amountBeforeTax: amount, taxCode: 'R08', taxAmount: tax });
const balance = async (like: string, itemId: string) => Number((await sql<{ v: string | null }>`
  SELECT COALESCE(SUM(l.debit - l.credit), 0) AS v FROM ledger_lines l JOIN ledger_entries e ON e.id = l.entry_id
   WHERE l.tenant_id = ${tenantId} AND e.status = 'posted' AND l.account_code LIKE ${like} AND l.item_id = ${itemId}`.execute(db)).rows[0]!.v);

beforeAll(async () => {
  ctx = await setupTenant();
  tenantId = (await db.selectFrom('tenants').select('id').where('code', '=', ctx.tenantCode).executeTakeFirstOrThrow()).id;
  expect((await call(ctx, 'POST', '/api/v1/branches', { code: 'CN02', name: 'Cửa hàng 02' })).status).toBe(201);
  // Hai nhóm tính giá (đơn vị hạch toán) khác nhau: CN01 → A, CN02 → B.
  const a = (await sql<{ id: string }>`INSERT INTO accounting_units (tenant_id, code, name) VALUES (${tenantId}, 'DV-A', 'Đơn vị A') RETURNING id::text`.execute(db)).rows[0]!.id;
  const b = (await sql<{ id: string }>`INSERT INTO accounting_units (tenant_id, code, name) VALUES (${tenantId}, 'DV-B', 'Đơn vị B') RETURNING id::text`.execute(db)).rows[0]!.id;
  await sql`UPDATE branches SET accounting_unit_id = ${a}::bigint WHERE tenant_id = ${tenantId} AND code = 'CN01'`.execute(db);
  await sql`UPDATE branches SET accounting_unit_id = ${b}::bigint WHERE tenant_id = ${tenantId} AND code = 'CN02'`.execute(db);
});
afterAll(async () => {
  await ctx.app.close();
});

describe('T026-G5 — chuyển kho hai nhóm tính giá qua đổi mã', () => {
  it('một định danh xuyên hai nhóm; nhóm nhận theo giá nhóm gửi; hàng đang chuyển / phải thu nội bộ về 0', async () => {
    const buy = await post({ docType: 'purchase', docKey: 'G5-NM', branchCode: 'CN01', docNo: 'G5-NM', docDate: first, partner: { code: 'NCC-01', name: 'Nhà cung cấp 01' },
      lines: [{ ...line('G5-OLD', 10, 1000000), taxCode: 'V08' }], totals: { beforeTax: 1000000, tax: 0, total: 1000000 } });
    expect(buy.body.data.status, JSON.stringify(buy.body)).toBe('posted');
    const ck = await post({ docType: 'transfer', docKey: 'G5-CK', branchCode: 'CN01', toBranchCode: 'CN02', docNo: 'G5-CK', docDate: first, status: 'received',
      lines: [{ lineKey: 'l1', sku: 'G5-OLD', qty: 5, amount: 0 }], totals: { total: 0 } });
    expect(ck.body.data.status, JSON.stringify(ck.body)).toBe('posted');

    await sql`UPDATE products SET sku = 'G5-NEW' WHERE tenant_id = ${tenantId} AND sku = 'G5-OLD'`.execute(db);            // đổi mã từ hôm nay

    const sell = await post({ docType: 'sale', docKey: 'G5-BAN', branchCode: 'CN02', docNo: 'G5-BAN', docDate: D, lines: [line('G5-NEW', 2, 300000, 24000)],
      payments: [{ methodCode: 'TM', amount: 324000 }], totals: { beforeTax: 300000, tax: 24000, total: 324000 } });
    expect(sell.body.data.status, JSON.stringify(sell.body)).toBe('posted');
    const run = await call(ctx, 'POST', '/api/v1/inventory/costing', { period: ym });
    expect(run.status, JSON.stringify(run.body)).toBe(200);

    const itemId = (await call(ctx, 'GET', '/api/v1/lineage/items/G5-OLD')).body.data.item.itemId as string;
    // Một định danh: mọi dòng sổ mang mã cũ hoặc mới đều cùng item_id.
    const ids = (await sql<{ item_id: string | null }>`
      SELECT DISTINCT item_id FROM ledger_lines WHERE tenant_id = ${tenantId} AND product_sku IN ('G5-OLD', 'G5-NEW')`.execute(db)).rows.map((r) => r.item_id);
    expect(ids).toEqual([itemId]);

    // Hai dòng giá vốn (mỗi nhóm một dòng), đều mã hiện hành, đơn giá bằng nhau; nhóm nhận định giá 5 × 100.000 theo nhóm gửi.
    const rows = (await sql<{ g: string; sku: string; in_qty: string; in_value: string; unit_cost: string; out_qty: string; closing_qty: string }>`
      SELECT cost_group::text AS g, sku, in_qty, in_value, unit_cost, out_qty, closing_qty FROM inventory_costs WHERE tenant_id = ${tenantId} AND item_id = ${itemId} ORDER BY cost_group`.execute(db)).rows;
    expect(rows).toHaveLength(2);
    expect(rows.every((r) => r.sku === 'G5-NEW')).toBe(true);
    const [gA, gB] = rows;
    expect([Number(gA!.in_qty), Number(gA!.in_value), Number(gA!.unit_cost), Number(gA!.out_qty), Number(gA!.closing_qty)]).toEqual([10, 1000000, 100000, 5, 5]);   // nhóm gửi
    expect([Number(gB!.in_qty), Number(gB!.in_value), Number(gB!.unit_cost), Number(gB!.out_qty), Number(gB!.closing_qty)]).toEqual([5, 500000, 100000, 2, 3]);       // nhóm nhận

    // Hàng đang chuyển giữa hai nhóm: phải thu nội bộ hàng (13681) và hàng đang chuyển (1579) triệt tiêu — không để lại số dư vì đổi mã.
    expect(await balance('13681%', itemId)).toBe(0);
    expect(await balance('1579%', itemId)).toBe(0);
    // Giá vốn bán của CN02 = 2 × 100.000. Tồn kho (1561) toàn đơn vị = 10 mua − 2 bán = 8 × 100.000 (5 chuyển chỉ đổi chi nhánh: CN01 còn 5, CN02 còn 3).
    expect(await balance('632%', itemId)).toBe(200000);
    expect(await balance('1561%', itemId)).toBe(800000);
  });
});
