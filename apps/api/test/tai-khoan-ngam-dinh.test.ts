// [2026-11-11 Nguyễn Văn Thủy] PHASE-026 — công tắc lý do / nhóm hạch toán và định khoản ngầm định ACC41 (đóng góp)
/**
 * Tài khoản ngầm định (ACC41) khi công tắc bizcity.posting.use_reasons TẮT (mặc định):
 *   - doanh thu / giá vốn / kho lấy ở khoá ngầm định (revenue, cogs, inventory), KHÔNG theo nhóm hạch toán của mặt hàng;
 *   - định khoản thêm ở ACC41 theo loại hàng thì áp cho đúng loại hàng; sửa / xoá tại chỗ;
 *   - bật công tắc: theo nhóm hạch toán của mặt hàng như cũ.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { sql } from 'kysely';
import { db } from '../src/db/client.js';
import { call, setupTenant, type TestCtx } from './helpers.js';

let ctx: TestCtx;
let tenantId = '';
const ok = (r: { status: number; body: unknown }) => expect([200, 201], JSON.stringify(r.body)).toContain(r.status);
const sale = (key: string, sku: string, date = '2026-10-05') => call(ctx, 'POST', '/api/v1/documents', {
  docType: 'sale', docKey: key, branchCode: 'CN01', docNo: key, docDate: date,
  lines: [{ lineKey: 'l1', sku, name: 'Hàng thử', unit: 'Hộp', qty: 1, amountBeforeTax: 100000, taxCode: 'R08', taxAmount: 8000 }],
  payments: [], totals: { beforeTax: 100000, tax: 8000, total: 108000 },
});
const revenueOf = async (key: string) => (await sql<{ a: string }>`SELECT l.account_code AS a FROM ledger_lines l JOIN ledger_entries e ON e.id = l.entry_id
  JOIN accounting_events v ON v.id = e.event_id WHERE v.tenant_id = ${tenantId} AND v.doc_key = ${key} AND l.account_code LIKE '511%' AND NOT e.is_reversal
    AND NOT EXISTS (SELECT 1 FROM ledger_entries x WHERE x.reverses_entry_id = e.id)`.execute(db)).rows.map((r) => r.a);

beforeAll(async () => {
  ctx = await setupTenant();
  tenantId = (await db.selectFrom('tenants').select('id').where('code', '=', ctx.tenantCode).executeTakeFirstOrThrow()).id;
  // Nhóm hạch toán riêng cho hàng khuyến mại (doanh thu 51113) và hai mặt hàng: thường (nhóm mặc định), khuyến mại (nhóm KM, loại QUA).
  ok(await call(ctx, 'PUT', '/api/v1/posting/groups/NHT-KM', { name: 'Hàng khuyến mại', inventoryAccount: '1561', cogsAccount: '6323', revenueAccount: '51113', salesReturnAccount: '52133', isDefault: false }));
  await sql`INSERT INTO products (tenant_id, sku, name, unit, posting_group_code, type_code) VALUES
    (${tenantId}, 'TK-THUONG', 'Hàng thường', 'Hộp', NULL, NULL), (${tenantId}, 'TK-KM', 'Hàng khuyến mại', 'Hộp', 'NHT-KM', 'QUA') ON CONFLICT DO NOTHING`.execute(db);
});
afterAll(async () => { await ctx.app.close(); });

describe('Tài khoản ngầm định khi tắt lý do / nhóm hạch toán', () => {
  it('công tắc mặc định tắt: doanh thu theo khoá ngầm định, bỏ qua nhóm hạch toán của mặt hàng', async () => {
    const d = (await call<{ data: { key: string; accountCode: string | null }[] }>(ctx, 'GET', '/api/v1/posting/defaults')).body.data;
    expect(d.find((x) => x.key === 'revenue')?.accountCode).toBe('51111');
    ok(await sale('TK-1', 'TK-KM'));
    expect(await revenueOf('TK-1')).toEqual(['51111']);
  });

  it('thêm định khoản ngầm định theo loại hàng QUA → doanh thu 51113; sửa, xoá tại chỗ', async () => {
    const r = await call<{ data: { id: string; debit: string | null; credit: string | null } }>(ctx, 'POST', '/api/v1/posting-rules/defaults',
      { business: 'sale', part: 'goods', name: 'Bán hàng khuyến mại — doanh thu', cond: { itemType: 'QUA' }, credit: '51113' });
    ok(r);
    const id = r.body.data.id;
    ok(await sale('TK-2', 'TK-KM'));
    ok(await sale('TK-3', 'TK-THUONG'));
    expect(await revenueOf('TK-2')).toEqual(['51113']);
    expect(await revenueOf('TK-3')).toEqual(['51111']);
    const list = (await call<{ data: { id: string; note: string }[] }>(ctx, 'GET', '/api/v1/posting-rules/defaults')).body.data;
    expect(list.map((x) => x.note)).toEqual(['Bán hàng khuyến mại — doanh thu']);
    // Trùng điều kiện thì chặn.
    expect((await call(ctx, 'POST', '/api/v1/posting-rules/defaults', { business: 'sale', part: 'goods', name: 'Trùng', cond: { itemType: 'QUA' }, credit: '5118' })).status).toBe(400);
    ok(await call(ctx, 'POST', '/api/v1/posting-rules/defaults', { id, business: 'sale', part: 'goods', name: 'Bán hàng khuyến mại — doanh thu', cond: { itemType: 'QUA' }, credit: '5118' }));
    ok(await sale('TK-4', 'TK-KM'));
    expect(await revenueOf('TK-4')).toEqual(['5118']);
    ok(await call(ctx, 'DELETE', `/api/v1/posting-rules/defaults/${id}`));
    expect((await call<{ data: unknown[] }>(ctx, 'GET', '/api/v1/posting-rules/defaults')).body.data).toEqual([]);
  });

  it('định khoản theo Biến thể: hàng Khuyến mại → doanh thu 51113, hàng thường giữ 51111', async () => {
    await sql`INSERT INTO products (tenant_id, sku, name, unit, variant_code) VALUES (${tenantId}, '110059001M', 'Hàng khuyến mại (biến thể)', 'Hộp', 'promo') ON CONFLICT DO NOTHING`.execute(db);
    const r = await call<{ data: { id: string } }>(ctx, 'POST', '/api/v1/posting-rules/defaults', { business: 'sale', part: 'goods', name: 'Hàng khuyến mại — doanh thu', cond: { variant: 'promo' }, credit: '51113' });
    ok(r);
    ok(await sale('TK-6', '110059001M'));
    ok(await sale('TK-7', 'TK-THUONG'));
    expect(await revenueOf('TK-6')).toEqual(['51113']);
    expect(await revenueOf('TK-7')).toEqual(['51111']);
    const opt = (await call<{ data: { variants: { code: string }[] } }>(ctx, 'GET', '/api/v1/posting-rules/options')).body.data;
    expect(opt.variants.map((v) => v.code)).toContain('promo');
    ok(await call(ctx, 'DELETE', `/api/v1/posting-rules/defaults/${r.body.data.id}`));
  });

  it('bật công tắc: theo nhóm hạch toán của mặt hàng như cũ', async () => {
    ok(await call(ctx, 'PUT', '/api/v1/settings/values/bizcity.posting.use_reasons', { value: 'on', validFrom: '2000-01-01', reason: 'Kiểm chế độ bật' }, { 'idempotency-key': 'tai-khoan-bat-ly-do' }));
    ok(await sale('TK-5', 'TK-KM'));
    expect(await revenueOf('TK-5')).toEqual(['51113']);
  });
});
