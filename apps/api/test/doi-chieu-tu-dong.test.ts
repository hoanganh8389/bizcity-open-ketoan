/**
 * PHASE-029 E6 đợt 1 (S029-13, 30 §6): sổ đăng ký đối chiếu — bốn mục chạy tay của scripts/doi-chieu-ke-toan.sql thành chẩn đoán L3
 * chạy trên mọi bản cài: VAT_INPUT_INVOICE_MATCH, LEDGER_ROUNDING, ITEM_CODE_CASE_DUP, UNIT_BASE_INVALID. Mỗi mã sạch khi dữ liệu đúng,
 * báo đúng mẫu khi cài lệch. Dữ liệu là dữ liệu giả.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { sql } from 'kysely';
import { closeDb, db } from '../src/db/client.js';
import { registerDiagnostics, runDiagnostics } from '../src/modules/system/diagnostics.js';
import { LEDGER_DIAGNOSTICS } from '@bizcity/kernel/modules/ledger/ledger.diagnostics';
import { INVENTORY_DIAGNOSTICS } from '@bizcity/kernel/modules/inventory/inventory.diagnostics';
import { call, saleDoc, setupTenant, type TestCtx } from './helpers.js';

let ctx: TestCtx;
let tenantId = '';

const purchase = (docKey: string, extra: Record<string, unknown> = {}) => ({
  docType: 'purchase', docKey, version: 1, branchCode: 'CN01', docNo: docKey, docDate: '2026-10-03',
  partner: { code: 'NCC-DC', name: 'Nhà cung cấp đối chiếu' },
  lines: [{ lineKey: 'l1', sku: 'SUA01', name: 'Sữa bột', unit: 'Hộp', qty: 10, amountBeforeTax: 1000000, taxCode: 'V08', taxAmount: 80000 }],
  payments: [],
  totals: { beforeTax: 1000000, tax: 80000, total: 1080000 },
  invoice: { no: '0000777', serial: 'C26TDC', date: '2026-10-03', buyerName: 'Nhà cung cấp đối chiếu', buyerTaxCode: '0101234567' },
  ...extra,
});

async function check(code: string) {
  const r = await runDiagnostics({ tenantId }, { layer: 'L3', db });
  const c = r.checks.find((x) => x.code === code);
  expect(c, `thiếu kiểm ${code}`).toBeTruthy();
  return c!;
}

beforeAll(async () => {
  ctx = await setupTenant();
  tenantId = String((await db.selectFrom('tenants').select('id').where('code', '=', ctx.tenantCode).executeTakeFirstOrThrow()).id);
  registerDiagnostics(LEDGER_DIAGNOSTICS);
  registerDiagnostics(INVENTORY_DIAGNOSTICS);
});
afterAll(async () => {
  await ctx.app.close();
  await closeDb();
});

describe('VAT_INPUT_INVOICE_MATCH — thuế đầu vào trên sổ ↔ sổ hoá đơn', () => {
  it('chứng từ mua có hoá đơn, thuế khớp: không báo', async () => {
    const r = await call(ctx, 'POST', '/api/v1/documents', purchase('DC-NM-01'));
    expect(r.body.data?.status, JSON.stringify(r.body)).toBe('posted');
    const inv = await sql<{ n: number }>`SELECT count(*)::int AS n FROM tax_invoices WHERE tenant_id = ${tenantId} AND direction = 'input'`.execute(db);
    expect(inv.rows[0]!.n).toBeGreaterThan(0);
    const c = await check('VAT_INPUT_INVOICE_MATCH');
    expect(c.level).toBe('pass');
    expect(c.examined).toBeGreaterThan(0);
    expect(c.sample).not.toContain('DC-NM-01');
  });

  it('sổ hoá đơn ghi thuế khác sổ: báo đúng chứng từ', async () => {
    await sql`UPDATE tax_invoices SET total_tax = total_tax + 1000 WHERE tenant_id = ${tenantId} AND direction = 'input'
                AND event_id = (SELECT id FROM accounting_events WHERE tenant_id = ${tenantId} AND doc_key = 'DC-NM-01')`.execute(db);
    const c = await check('VAT_INPUT_INVOICE_MATCH');
    expect(c.level).toBe('warn');
    expect(c.sample).toContain('DC-NM-01');
  });
});

describe('LEDGER_ROUNDING — dòng sổ tròn đồng', () => {
  it('chứng từ tròn đồng không báo; số lẻ xu từ nguồn bị báo', async () => {
    expect((await check('LEDGER_ROUNDING')).count).toBe(0);
    const doc = saleDoc({ docKey: 'DC-BL-01', docNo: 'DC-BL-01', version: 1,
      lines: [{ lineKey: 'l1', sku: 'SUA01', name: 'Sữa bột 900g', unit: 'Hộp', qty: 1, amountBeforeTax: 92592.5, taxCode: 'R08', taxAmount: 7407.5 }],
      payments: [{ methodCode: 'TM', amount: 100000 }], totals: { beforeTax: 92592.5, tax: 7407.5, total: 100000 } });
    // Cửa nạp nhận số lẻ xu (tiền numeric(18,2)) — đối chiếu sau ghi sổ phải bắt được.
    const r = await call(ctx, 'POST', '/api/v1/documents', doc);
    expect(r.body.data?.status, JSON.stringify(r.body)).toBe('posted');
    const entry = await sql<{ entry_no: string }>`SELECT e.entry_no FROM ledger_entries e JOIN accounting_events a ON a.id = e.event_id
      WHERE a.tenant_id = ${tenantId} AND a.doc_key = 'DC-BL-01' LIMIT 1`.execute(db);
    const c = await check('LEDGER_ROUNDING');
    expect(c.level).toBe('warn');
    expect(c.sample).toContain(entry.rows[0]!.entry_no);
  });
});

describe('Dữ liệu gốc mặt hàng', () => {
  it('ITEM_CODE_CASE_DUP: hai mã chỉ khác hoa / thường và khoảng trắng bị báo', async () => {
    expect((await check('ITEM_CODE_CASE_DUP')).sample).not.toContain('DCTRUNG01');
    await db.insertInto('products').values({ tenant_id: tenantId, sku: 'dctrung01', name: 'Hàng trùng mã thường', unit: 'Cái' }).execute();
    await db.insertInto('products').values({ tenant_id: tenantId, sku: 'DCTRUNG01 ', name: 'Hàng trùng mã hoa', unit: 'Cái' }).execute();
    expect((await check('ITEM_CODE_CASE_DUP')).sample).toContain('DCTRUNG01');
  });

  it('UNIT_BASE_INVALID: hai ĐVT gốc tỉ lệ 1 bị báo; một ĐVT gốc thì không', async () => {
    await db.insertInto('products').values({ tenant_id: tenantId, sku: 'DCDVT01', name: 'Hàng hai ĐVT gốc', unit: 'Cái' }).execute();
    await sql`INSERT INTO product_units (tenant_id, sku, unit, ratio) VALUES (${tenantId}, 'DCDVT01', 'Cái', 1)`.execute(db);
    expect((await check('UNIT_BASE_INVALID')).sample).not.toContain('DCDVT01');
    await sql`INSERT INTO product_units (tenant_id, sku, unit, ratio) VALUES (${tenantId}, 'DCDVT01', 'Chiếc', 1)`.execute(db);
    expect((await check('UNIT_BASE_INVALID')).sample).toContain('DCDVT01');
  });
});
