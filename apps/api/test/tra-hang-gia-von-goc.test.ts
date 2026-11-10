// [2026-11-11 12:05 AM Johnny Chu - Chu Hoàng Anh] PHASE-032 — B3 (S032-17, T032-G1 trên bình quân tháng): khách trả hàng lấy đúng giá vốn lúc bán
/**
 * G1 (PHASE-032 · 35) làm tạm trên bình quân tháng (00 §6a bước B3):
 *   tháng trước: nhập 100 × 100.000, bán 30 (BH-108) → đơn giá tháng trước 100.000;
 *   tháng này:  nhập 25 × 120.000, khách trả 5 của BH-108.
 *   - Hoàn Nợ 156 / Có 632 = 5 × 100.000 = 500.000 (đơn giá tháng bán gốc), KHÔNG theo đơn giá tháng trả;
 *   - hàng trả vào công thức đơn giá tháng này như một dòng nhập: (7.000.000 + 3.000.000 + 500.000) ÷ 100 = 105.000;
 *   - giá trị tồn cuối theo đơn giá tháng = số dư TK 156 của mặt hàng (10.500.000) — sổ kho khớp sổ cái.
 * Nhánh không có gốc (Q032-5 mặc định tạm): hoàn theo đơn giá bình quân tồn đầu kỳ trả.
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
const prevYm = (() => { const [y, m] = ym.split('-').map(Number) as [number, number]; return m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, '0')}`; })();
const post = (doc: unknown) => call(ctx, 'POST', '/api/v1/documents', doc);
const line = (sku: string, qty: number, amount: number, tax = 0) => ({ lineKey: 'l1', sku, name: sku, unit: 'Cái', qty, amountBeforeTax: amount, taxCode: 'R08', taxAmount: tax });
const buy = (key: string, date: string, sku: string, qty: number, amount: number) =>
  post({ docType: 'purchase', docKey: key, branchCode: 'CN01', docNo: key, docDate: date, partner: { code: 'NCC-01', name: 'Nhà cung cấp 01' },
    lines: [{ ...line(sku, qty, amount), taxCode: 'V08' }], totals: { beforeTax: amount, tax: 0, total: amount } });
const sell = (key: string, date: string, sku: string, qty: number, amount: number) =>
  post({ docType: 'sale', docKey: key, branchCode: 'CN01', docNo: key, docDate: date, lines: [line(sku, qty, amount, amount * 0.08)],
    payments: [{ methodCode: 'TM', amount: amount * 1.08 }], totals: { beforeTax: amount, tax: amount * 0.08, total: amount * 1.08 } });
const giveBack = (key: string, date: string, sku: string, qty: number, amount: number, originalDocKey?: string) =>
  post({ docType: 'sale_return', docKey: key, branchCode: 'CN01', docNo: key, docDate: date, ...(originalDocKey ? { originalDocKey } : {}), lines: [line(sku, qty, amount, amount * 0.08)],
    payments: [{ methodCode: 'TM', amount: amount * 1.08 }], totals: { beforeTax: amount, tax: amount * 0.08, total: amount * 1.08 } });

async function itemId(sku: string) {
  return (await db.selectFrom('item_codes').select('item_id').where('tenant_id', '=', tenantId).where('kind', '=', 'sku').where('code', '=', sku).executeTakeFirstOrThrow()).item_id;
}
/** Dòng giá vốn 632 của phiếu khách trả (Có 632) trong phiếu giá vốn tháng này. */
async function returnCredit632(item: string) {
  const r = await sql<{ credit: string }>`
    SELECT COALESCE(SUM(l.credit), 0) AS credit FROM ledger_lines l JOIN ledger_entries e ON e.id = l.entry_id JOIN accounting_events ev ON ev.id = e.event_id
     WHERE ev.tenant_id = ${tenantId} AND ev.doc_type = 'cogs' AND e.status = 'posted' AND NOT e.is_reversal AND l.account_code LIKE '632%' AND l.item_id = ${item}
       AND e.posting_date >= ${`${ym}-01`}::date`.execute(db);
  return Number(r.rows[0]!.credit);
}
async function ledger156(item: string) {
  const r = await sql<{ bal: string }>`
    SELECT COALESCE(SUM(l.debit - l.credit), 0) AS bal FROM ledger_lines l JOIN ledger_entries e ON e.id = l.entry_id
     WHERE l.tenant_id = ${tenantId} AND e.status = 'posted' AND l.account_code LIKE '156%' AND l.item_id = ${item}`.execute(db);
  return Number(r.rows[0]!.bal);
}
async function monthCost(item: string, period: string) {
  const [y, m] = period.split('-').map(Number);
  return db.selectFrom('inventory_costs').select(['unit_cost', 'closing_qty', 'closing_value']).where('tenant_id', '=', tenantId).where('item_id', '=', item).where('year', '=', y!).where('month', '=', m!).executeTakeFirstOrThrow();
}

beforeAll(async () => {
  ctx = await setupTenant();
  tenantId = (await db.selectFrom('tenants').select('id').where('code', '=', ctx.tenantCode).executeTakeFirstOrThrow()).id;
  const ok = (r: { body: { data?: { status?: string } } }) => expect(r.body.data?.status, JSON.stringify(r.body)).toBe('posted');
  // Tháng trước
  ok(await buy('B3-NM-A', `${prevYm}-05`, 'B3-A', 100, 10000000));
  ok(await sell('BH-108', `${prevYm}-10`, 'B3-A', 30, 4500000));
  ok(await buy('B3-NM-B', `${prevYm}-05`, 'B3-B', 10, 1000000));
  ok(await sell('B3-BAN-B', `${prevYm}-12`, 'B3-B', 4, 600000));
  expect((await call(ctx, 'POST', '/api/v1/inventory/costing', { period: prevYm })).status).toBe(200);
  // Tháng này
  ok(await buy('B3-NM-A2', `${ym}-01`, 'B3-A', 25, 3000000));
  ok(await giveBack('NTH-012', D, 'B3-A', 5, 750000, 'BH-108'));
  ok(await buy('B3-NM-B2', `${ym}-01`, 'B3-B', 4, 700000));
  ok(await giveBack('NTH-013', D, 'B3-B', 2, 300000));                      // không có chứng từ bán gốc
  expect((await call(ctx, 'POST', '/api/v1/inventory/costing', { period: ym })).status).toBe(200);
});
afterAll(async () => {
  await ctx?.app.close();
});

describe('Khách trả hàng lấy đúng giá vốn lúc bán (PHASE-032 B3)', () => {
  it('G1: trả 5 của lần bán tháng trước ⇒ hoàn 500.000 (đơn giá tháng bán gốc), không theo đơn giá tháng trả', async () => {
    const a = await itemId('B3-A');
    expect(Number((await monthCost(a, prevYm)).unit_cost)).toBe(100000);
    expect(await returnCredit632(a)).toBe(500000);
  });

  it('hàng trả vào đơn giá tháng trả như một dòng nhập; giá trị tồn theo thẻ kho = số dư TK 156 của mặt hàng', async () => {
    const a = await itemId('B3-A');
    const c = await monthCost(a, ym);
    expect(Number(c.unit_cost)).toBe(105000);                                // (7.000.000 + 3.000.000 + 500.000) ÷ 100
    expect(Number(c.closing_qty)).toBe(100);
    expect(Number(c.closing_value)).toBe(10500000);
    expect(await ledger156(a)).toBe(10500000);
  });

  it('không có chứng từ bán gốc ⇒ hoàn theo đơn giá bình quân tồn đầu kỳ trả (Q032-5 mặc định tạm)', async () => {
    const b = await itemId('B3-B');
    expect(await returnCredit632(b)).toBe(200000);                           // 2 × (600.000 ÷ 6)
    const c = await monthCost(b, ym);
    expect(Number(c.unit_cost)).toBe(125000);                                // (600.000 + 700.000 + 200.000) ÷ 12
    expect(Number(c.closing_value)).toBe(await ledger156(b));
  });
});
