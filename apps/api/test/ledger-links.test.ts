/**
 * Bảng liên kết bút toán (ledger_links):
 *   - sửa chứng từ → bút toán đảo có liên kết "reversal" về bút toán gốc;
 *   - phiếu trả hàng → liên kết "return" về bút toán bán gốc, đúng từng bộ sổ;
 *   - bảng chỉ thêm: không sửa, không xoá; mỗi bút toán chỉ bị đảo một lần.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { sql } from 'kysely';
import { db } from '../src/db/client.js';
import { call, setupTenant, type TestCtx } from './helpers.js';

let ctx: TestCtx;
let tenantId: string;
const sale = (version: number, amount: number) => ({
  docType: 'sale', docKey: 'LK-BAN-1', version, branchCode: 'CN01', docNo: 'LK-BAN-1', docDate: '2026-10-05',
  partner: { code: 'KH-LK', name: 'Khách LK' },
  invoice: { no: '7001', serial: 'C26TLK', date: '2026-10-05' },
  lines: [{ lineKey: 'l1', sku: 'A', name: 'Hàng A', qty: 1, amountBeforeTax: amount, taxCode: 'R10', taxAmount: amount / 10 }],
  payments: [],
  totals: { beforeTax: amount, tax: amount / 10, total: amount * 1.1 },
});
const links = (type: string) =>
  sql<{ entry_id: string; target_entry_id: string; target_status: string; entry_is_reversal: boolean }>`
    SELECT k.entry_id, k.target_entry_id, t.status AS target_status, e.is_reversal AS entry_is_reversal
      FROM ledger_links k JOIN ledger_entries e ON e.id = k.entry_id JOIN ledger_entries t ON t.id = k.target_entry_id
     WHERE k.tenant_id = ${tenantId} AND k.link_type = ${type} ORDER BY k.entry_id`.execute(db).then((r) => r.rows);

beforeAll(async () => {
  ctx = await setupTenant();
  tenantId = (await db.selectFrom('tenants').select('id').where('code', '=', ctx.tenantCode).executeTakeFirstOrThrow()).id;
  for (const d of [sale(1, 1000000), sale(2, 800000)]) {
    const r = await call(ctx, 'POST', '/api/v1/documents', d);
    expect(r.body.data?.status, JSON.stringify(r.body)).toBe('posted');
  }
});
afterAll(async () => {
  await ctx.app.close();
});

describe('Liên kết bút toán', () => {
  it('sửa chứng từ: bút toán gốc có một bút toán đảo trỏ về', async () => {
    const r = await links('reversal');
    expect(r.map((x) => [x.entry_is_reversal, x.target_status])).toEqual([[true, 'reversed']]);
  });

  it('chi tiết bút toán trả về liên kết hai chiều', async () => {
    const [first] = await links('reversal');
    const orig = await call(ctx, 'GET', `/api/v1/ledger/entries/${first!.target_entry_id}`);
    expect(orig.body.data.linkedBy).toEqual([expect.objectContaining({ type: 'reversal', entryId: first!.entry_id })]);
    const rev = await call(ctx, 'GET', `/api/v1/ledger/entries/${first!.entry_id}`);
    expect(rev.body.data.links).toEqual([expect.objectContaining({ type: 'reversal', entryId: first!.target_entry_id })]);
  });

  it('phiếu trả hàng liên kết về bút toán bán đang có hiệu lực', async () => {
    const r = await call(ctx, 'POST', '/api/v1/documents', {
      docType: 'sale_return', docKey: 'LK-TRA-1', originalDocKey: 'LK-BAN-1', branchCode: 'CN01', docNo: 'LK-TRA-1', docDate: '2026-10-08',
      partner: { code: 'KH-LK', name: 'Khách LK' },
      invoice: { no: '7002', serial: 'C26TLK', date: '2026-10-08', relation: 'adjusts' },
      lines: [{ lineKey: 'l1', sku: 'A', name: 'Hàng A', qty: 1, amountBeforeTax: 200000, taxCode: 'R10', taxAmount: 20000 }],
      payments: [],
      totals: { beforeTax: 200000, tax: 20000, total: 220000 },
    });
    expect(r.body.data?.status, JSON.stringify(r.body)).toBe('posted');
    const ret = await links('return');
    expect(ret.map((x) => x.target_status)).toEqual(['posted']);
    // Mở phiếu trả: kèm số chứng từ của phiếu gốc (ô "Số phiếu xuất").
    const found = await call(ctx, 'GET', '/api/v1/documents?search=LK-TRA-1');
    const doc = await call(ctx, 'GET', `/api/v1/documents/${found.body.data[0].id}`);
    expect(doc.body.data.payload.originalDocNo).toBeTruthy();
  });

  it('bảng chỉ thêm: không sửa, không xoá; một bút toán không bị đảo hai lần', async () => {
    await expect(sql`UPDATE ledger_links SET reason = 'x' WHERE tenant_id = ${tenantId}`.execute(db)).rejects.toThrow(/chỉ được thêm/);
    await expect(sql`DELETE FROM ledger_links WHERE tenant_id = ${tenantId}`.execute(db)).rejects.toThrow(/chỉ được thêm/);
    const [first] = await links('reversal');
    const other = await db.selectFrom('ledger_entries').select('id').where('tenant_id', '=', tenantId).where('id', '<>', first!.entry_id).where('id', '<>', first!.target_entry_id).executeTakeFirstOrThrow();
    await expect(sql`INSERT INTO ledger_links (tenant_id, entry_id, target_entry_id, link_type) VALUES (${tenantId}, ${other.id}, ${first!.target_entry_id}, 'reversal')`.execute(db)).rejects.toThrow();
  });
});
