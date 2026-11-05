// [2026-11-04 05:30 AM Johnny Chu - Chu Hoàng Anh] PHASE-026 — S026-2: Golden Test T026-G4 — trả hàng SAU khi đổi mã
/**
 * T026-G4 (PHASE-026 · 00 §6): mua và bán bằng mã CŨ; đổi mã; khách trả hàng bằng mã MỚI, có chứng từ bán gốc.
 *   - Hành trình: mua / bán mang mã cũ, trả hàng mang mã mới — MỘT định danh; sự kiện trả nối về chứng từ bán gốc;
 *   - MỘT dòng giá vốn (mã hiện hành), đơn giá 100.000, tồn cuối đúng;
 *   - phiếu giá vốn: bán 4 ghi 400.000; hàng khách trả nhập lại kho 1 × 100.000 = đúng đơn giá của lần bán gốc (không lệch vì đổi mã);
 *   - giá vốn thuần của mặt hàng = 300.000 (3 hàng thực bán).
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

beforeAll(async () => {
  ctx = await setupTenant();
  tenantId = (await db.selectFrom('tenants').select('id').where('code', '=', ctx.tenantCode).executeTakeFirstOrThrow()).id;
});
afterAll(async () => {
  await ctx.app.close();
});

describe('T026-G4 — trả hàng sau khi đổi mã', () => {
  it('trả hàng bằng mã mới hoàn đúng giá vốn lần bán gốc; một định danh, một dòng giá vốn', async () => {
    const buy = await post({ docType: 'purchase', docKey: 'G4-NM', branchCode: 'CN01', docNo: 'G4-NM', docDate: first, partner: { code: 'NCC-01', name: 'Nhà cung cấp 01' },
      lines: [{ ...line('G4-OLD', 10, 1000000), taxCode: 'V08' }], totals: { beforeTax: 1000000, tax: 0, total: 1000000 } });
    expect(buy.body.data.status, JSON.stringify(buy.body)).toBe('posted');
    const sell = await post({ docType: 'sale', docKey: 'G4-BAN', branchCode: 'CN01', docNo: 'G4-BAN', docDate: first, lines: [line('G4-OLD', 4, 600000, 48000)],
      payments: [{ methodCode: 'TM', amount: 648000 }], totals: { beforeTax: 600000, tax: 48000, total: 648000 } });
    expect(sell.body.data.status, JSON.stringify(sell.body)).toBe('posted');

    await sql`UPDATE products SET sku = 'G4-NEW' WHERE tenant_id = ${tenantId} AND sku = 'G4-OLD'`.execute(db);            // đổi mã từ hôm nay

    const ret = await post({ docType: 'sale_return', docKey: 'G4-TRA', branchCode: 'CN01', docNo: 'G4-TRA', docDate: D, originalDocKey: 'G4-BAN', lines: [line('G4-NEW', 1, 150000, 12000)],
      payments: [{ methodCode: 'TM', amount: 162000 }], totals: { beforeTax: 150000, tax: 12000, total: 162000 } });
    expect(ret.body.data.status, JSON.stringify(ret.body)).toBe('posted');
    expect((await call(ctx, 'POST', '/api/v1/inventory/costing', { period: ym })).status).toBe(200);

    // Hành trình (tra bằng mã CŨ): một định danh, mã tại ngày, trả hàng nối về chứng từ bán gốc.
    const l = (await call(ctx, 'GET', '/api/v1/lineage/items/G4-OLD')).body.data;
    expect(l.item.sku).toBe('G4-NEW');
    expect(l.events.map((e: { kind: string; code: string }) => [e.kind, e.code])).toEqual([['purchase', 'G4-OLD'], ['sale', 'G4-OLD'], ['sale_return', 'G4-NEW']]);
    expect(l.events.find((e: { kind: string }) => e.kind === 'sale_return').originalDocKey).toBe('G4-BAN');
    expect(l.costPeriods).toHaveLength(1);

    // MỘT dòng giá vốn, mã hiện hành, đơn giá 100.000, tồn cuối 10 − 4 + 1 = 7.
    const costs = (await sql<{ sku: string; unit_cost: string; closing_qty: string }>`
      SELECT sku, unit_cost, closing_qty FROM inventory_costs WHERE tenant_id = ${tenantId} AND item_id = ${l.item.itemId}`.execute(db)).rows;
    expect(costs).toHaveLength(1);
    expect(costs[0]).toMatchObject({ sku: 'G4-NEW' });
    expect(Number(costs[0]!.unit_cost)).toBe(100000);
    expect(Number(costs[0]!.closing_qty)).toBe(7);

    // Phiếu giá vốn: bán 4 → Nợ 632 400.000; khách trả 1 → Có 632 100.000 (đúng đơn giá lần bán gốc), mã tại ngày chứng từ.
    const cogs = (await sql<{ product_sku: string; debit: string; credit: string }>`
      SELECT l.product_sku, l.debit, l.credit FROM ledger_lines l JOIN ledger_entries e ON e.id = l.entry_id JOIN accounting_events ev ON ev.id = e.event_id
       WHERE ev.tenant_id = ${tenantId} AND ev.doc_type = 'cogs' AND e.status = 'posted' AND NOT e.is_reversal AND l.account_code LIKE '632%' AND l.item_id = ${l.item.itemId}
       ORDER BY l.debit DESC, l.credit DESC`.execute(db)).rows.map((r) => [r.product_sku, Number(r.debit), Number(r.credit)]);
    expect(cogs).toEqual([['G4-OLD', 400000, 0], ['G4-NEW', 0, 100000]]);
    expect(cogs.reduce((s, [, d, c]) => s + (d as number) - (c as number), 0)).toBe(300000);   // giá vốn thuần = 3 hàng thực bán
  });
});
