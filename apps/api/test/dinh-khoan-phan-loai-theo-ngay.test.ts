// [2026-11-04 02:10 AM Johnny Chu - Chu Hoàng Anh] PHASE-024 — S024-8 / PHASE-026 T026-G2: định khoản theo phân loại TẠI NGÀY chứng từ (R-ITEM-7)
/**
 * Golden Test T026-G2 (PHASE-026 · 20 §1b): đổi nhóm hạch toán của mặt hàng từ ngày D.
 *   - chứng từ trước D định khoản theo nhóm CŨ; chứng từ từ D theo nhóm MỚI;
 *   - định khoản LẠI chứng từ trước D (repost) vẫn theo nhóm cũ — trước 0068 ra theo nhóm mới vì định khoản đọc products (giá trị hiện tại);
 *   - mặt hàng chưa từng đổi nhóm không đổi hành vi; mã CŨ (đã đổi mã) tra ra đúng phân loại của định danh.
 * Quan sát bằng TÀI KHOẢN DOANH THU của dòng bán hàng (nhóm cũ 51111, nhóm mới 51112).
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { sql } from 'kysely';
import { db } from '../src/db/client.js';
import { todayVN } from '../src/core/date-rules.js';
import { call, setupTenant, type TestCtx } from './helpers.js';

let ctx: TestCtx;
let tenantId = '';
const addDays = (d: string, n: number) => new Date(Date.parse(`${d}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);
const D = addDays(todayVN(), -5);                                   // ngày đổi nhóm
const put = (sku: string, body: Record<string, unknown> = {}) => call(ctx, 'PUT', `/api/v1/products/${sku}`, { name: sku, unit: 'Hộp', postingGroupCode: 'HH-BANLE', warnAck: { reason: 'thử định khoản theo ngày', codes: ['ITEM-HINT-001'] }, ...body });
const sale = (key: string, date: string, sku: string) => ({
  docType: 'sale', docKey: key, branchCode: 'CN01', docNo: key, docDate: date,
  lines: [{ lineKey: 'l1', sku, name: sku, unit: 'Hộp', qty: 2, amountBeforeTax: 200000, taxCode: 'R08', taxAmount: 16000 }],
  payments: [{ methodCode: 'TM', amount: 216000 }], totals: { beforeTax: 200000, tax: 16000, total: 216000 },
});
/** Tài khoản doanh thu (511*) của bút toán đang hiệu lực của chứng từ. */
const revenueOf = async (docKey: string) => (await sql<{ account_code: string }>`
  SELECT DISTINCT l.account_code FROM ledger_lines l JOIN ledger_entries e ON e.id = l.entry_id JOIN accounting_events ev ON ev.id = e.event_id
   WHERE ev.tenant_id = ${tenantId} AND ev.doc_key = ${docKey} AND l.account_code LIKE '511%' AND e.status = 'posted' AND NOT e.is_reversal`.execute(db)).rows.map((r) => r.account_code);
const eventId = async (docKey: string) => (await sql<{ id: string }>`SELECT id::text FROM accounting_events WHERE tenant_id = ${tenantId} AND doc_key = ${docKey}`.execute(db)).rows[0]!.id;
const itemOf = async (sku: string) => (await sql<{ item_id: string }>`SELECT item_id FROM item_codes WHERE tenant_id = ${tenantId} AND kind = 'sku' AND code = ${sku} AND valid_to IS NULL`.execute(db)).rows[0]!.item_id;

/** Mô phỏng "đổi nhóm từ ngày D" của dữ liệu cũ: nhóm cũ tới trước D, nhóm mới từ D (cần bỏ trigger như item-master.test). */
async function changeGroupFrom(sku: string, day: string, newGroup: string) {
  const id = await itemOf(sku);
  await db.transaction().execute(async (trx) => {
    await sql`SET LOCAL session_replication_role = replica`.execute(trx);
    await sql`UPDATE item_classification SET valid_to = ${day}::date, created_at = now() - interval '9 days' WHERE item_id = ${id} AND valid_to IS NULL`.execute(trx);
    await sql`INSERT INTO item_classification (tenant_id, item_id, valid_from, posting_group_code, tax_out_code, tax_in_code, excise_rate, track, created_by)
              SELECT tenant_id, item_id, ${day}::date, ${newGroup}, tax_out_code, tax_in_code, excise_rate, track, 'test' FROM item_classification WHERE item_id = ${id} AND valid_to = ${day}::date`.execute(trx);
    await sql`UPDATE products SET posting_group_code = ${newGroup} WHERE tenant_id = ${tenantId} AND sku = ${sku}`.execute(trx);
  });
}

beforeAll(async () => {
  ctx = await setupTenant();
  tenantId = (await db.selectFrom('tenants').select('id').where('code', '=', ctx.tenantCode).executeTakeFirstOrThrow()).id;
  // Nhóm thứ hai: giống HH-BANLE nhưng doanh thu bán buôn 51112.
  await sql`INSERT INTO product_posting_groups (tenant_id, code, name, inventory_account, cogs_account, revenue_account, discount_account, sales_return_account, is_default)
            SELECT tenant_id, 'GRP-BUON', 'Hàng bán buôn', inventory_account, cogs_account, '51112', discount_account, sales_return_account, false
              FROM product_posting_groups WHERE tenant_id = ${tenantId} AND code = 'HH-BANLE'`.execute(db);
});
afterAll(async () => {
  await ctx.app.close();
});

describe('T026-G2 — đổi nhóm hạch toán từ ngày D', () => {
  it('trước D theo nhóm cũ, từ D theo nhóm mới; định khoản LẠI chứng từ trước D vẫn theo nhóm cũ', async () => {
    expect((await put('GD-A')).status).toBe(200);
    await changeGroupFrom('GD-A', D, 'GRP-BUON');

    const before = await call(ctx, 'POST', '/api/v1/documents', sale('GD-TRUOC', addDays(D, -2), 'GD-A'));
    const after = await call(ctx, 'POST', '/api/v1/documents', sale('GD-SAU', addDays(D, 1), 'GD-A'));
    expect(before.body.data.status, JSON.stringify(before.body)).toBe('posted');
    expect(after.body.data.status, JSON.stringify(after.body)).toBe('posted');
    expect(await revenueOf('GD-TRUOC')).toEqual(['51111']);          // nhóm cũ (bán lẻ)
    expect(await revenueOf('GD-SAU')).toEqual(['51112']);            // nhóm mới (bán buôn)

    const entryIds = async () => (await sql<{ id: string }>`SELECT e.id::text FROM ledger_entries e JOIN accounting_events ev ON ev.id = e.event_id WHERE ev.tenant_id = ${tenantId} AND ev.doc_key = 'GD-TRUOC' ORDER BY e.id`.execute(db)).rows.map((r) => r.id);
    const original = await entryIds();
    const re = await call(ctx, 'POST', '/api/v1/documents/post', { ids: [await eventId('GD-TRUOC')], repost: true });
    expect(re.status, JSON.stringify(re.body)).toBe(200);
    expect(await revenueOf('GD-TRUOC')).toEqual(['51111']);          // định khoản lại: vẫn nhóm cũ
    // Kết quả định khoản lại GIỐNG HỆT bản đã ghi (cùng nhóm tại ngày chứng từ) → không sinh bút toán đảo / bút toán mới nào.
    // Trước S024-8 định khoản đọc nhóm hiện tại (mới) nên lần này ra 51112, tạo bút toán đảo + bút toán mới sai nhóm.
    expect(await entryIds()).toEqual(original);
  });

  it('mặt hàng chưa từng đổi nhóm: hành vi như cũ (một bản phân loại từ đầu)', async () => {
    expect((await put('GD-B')).status).toBe(200);
    expect((await call(ctx, 'POST', '/api/v1/documents', sale('GD-B1', addDays(todayVN(), -30), 'GD-B'))).body.data.status).toBe('posted');
    expect(await revenueOf('GD-B1')).toEqual(['51111']);
  });

  it('mã CŨ đã đổi: chứng từ trước ngày đổi mã vẫn tra ra phân loại của định danh', async () => {
    expect((await put('GD-C')).status).toBe(200);
    await changeGroupFrom('GD-C', D, 'GRP-BUON');
    await sql`UPDATE products SET sku = 'GD-C2' WHERE tenant_id = ${tenantId} AND sku = 'GD-C'`.execute(db);   // đổi mã từ hôm nay
    // chứng từ ghi ngày D-1 mang MÃ CŨ GD-C (không còn dòng products mang mã này)
    const r = await call(ctx, 'POST', '/api/v1/documents', sale('GD-C-CU', addDays(D, -1), 'GD-C'));
    expect(r.body.data.status, JSON.stringify(r.body)).toBe('posted');
    expect(await revenueOf('GD-C-CU')).toEqual(['51111']);
    const r2 = await call(ctx, 'POST', '/api/v1/documents', sale('GD-C-MOI', addDays(D, 2), 'GD-C2'));
    expect(r2.body.data.status, JSON.stringify(r2.body)).toBe('posted');
    expect(await revenueOf('GD-C-MOI')).toEqual(['51112']);
  });
});
