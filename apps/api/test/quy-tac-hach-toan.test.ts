/**
 * [2026-11-15 Nguyễn Văn Thủy] Quy tắc hạch toán (ACC41) — khung Nợ / Có cố định, tài khoản trong phạm vi, mục đích xuất, xem thử (đóng góp)
 *   - GET /posting/scheme: đủ nghiệp vụ, khoá tài khoản kèm phạm vi, nguồn (hình thức thanh toán, loại kho, loại thuế, mục đích xuất).
 *   - Đổi tài khoản của quy tắc: ngoài phạm vi / TK tổng hợp / khoá lạ → 400; hợp lệ → bút toán mới ghi đúng tài khoản mới.
 *   - Lý do trên chứng từ KHÔNG đổi tài khoản (không còn công tắc lý do).
 *   - Phiếu xuất kho có mục đích → Nợ TK của mục đích; không mục đích → thiếu chờ xử lý; mục đích sai chiều / không có → lỗi định khoản.
 *   - Xem thử: trả bút toán, không lưu chứng từ, không ghi sổ.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { sql } from 'kysely';
import { db } from '../src/db/client.js';
import { call, setupTenant, type TestCtx } from './helpers.js';

let ctx: TestCtx;
let tenantId: string;

beforeAll(async () => {
  ctx = await setupTenant();
  tenantId = (await db.selectFrom('tenants').select('id').where('code', '=', ctx.tenantCode).executeTakeFirstOrThrow()).id;
  await call(ctx, 'POST', '/api/v1/branches', { code: '08000', name: 'CN Lào Cai' });
});
afterAll(async () => { await ctx.app.close(); });

const sale = (key: string, extra: Record<string, unknown> = {}) => call(ctx, 'POST', '/api/v1/documents', {
  docType: 'sale', docKey: key, branchCode: '08000', docNo: key, docDate: '2026-10-05',
  lines: [{ lineKey: 'l1', sku: 'SUA01', name: 'Sữa bột', unit: 'Hộp', qty: 1, amountBeforeTax: 100000, taxCode: 'R08', taxAmount: 8000 }],
  totals: { beforeTax: 100000, tax: 8000, total: 108000 }, ...extra,
});
const stockOut = (key: string, purposeCode?: string, direction = 'decrease') => call(ctx, 'POST', '/api/v1/documents', {
  docType: 'stock_adjustment', docKey: key, branchCode: '08000', docNo: key, docDate: '2026-10-05', direction, ...(purposeCode ? { purposeCode } : {}),
  lines: [{ lineKey: 'l1', sku: 'SUA01', name: 'Sữa bột', unit: 'Hộp', qty: direction === 'decrease' ? -1 : 1, amount: 70000 }],
  totals: { total: 70000 },
});
async function lines(docNo: string) {
  const r = await sql<{ account_code: string; debit: string; credit: string }>`
    SELECT l.account_code, l.debit, l.credit FROM ledger_lines l JOIN ledger_entries e ON e.id = l.entry_id
     WHERE l.tenant_id = ${tenantId} AND e.doc_no = ${docNo} AND e.status = 'posted' AND NOT e.is_reversal ORDER BY l.line_no`.execute(db);
  return r.rows.map((x) => ({ acc: x.account_code, debit: Number(x.debit), credit: Number(x.credit) }));
}
const scheme = async () => (await call(ctx, 'GET', '/api/v1/posting/scheme')).body.data as {
  businesses: { code: string; docType: string; groups: { lines: { source: string; key?: string }[] }[] }[];
  keys: { key: string; range: string[]; accountCode: string | null; status: string }[];
  sources: { purposes: { code: string; accountCode: string; direction: string }[]; paymentMethods: unknown[]; warehouseTypes: unknown[]; taxCodes: unknown[] };
};

describe('Quy tắc hạch toán', () => {
  it('đọc khung: đủ nghiệp vụ, mọi khoá có phạm vi, khoá trong khung đều khai ở danh sách khoá', async () => {
    const s = await scheme();
    expect(s.businesses.map((b) => b.code)).toEqual(expect.arrayContaining(['sale', 'sale_return', 'purchase', 'purchase_return', 'transfer', 'stock_out', 'stock_in', 'customer_payment', 'supplier_payment', 'cash_transfer']));
    const keys = new Set(s.keys.map((k) => k.key));
    for (const b of s.businesses) for (const g of b.groups) for (const l of g.lines) if (l.key) expect(keys, `${b.code} dùng khoá ${l.key}`).toContain(l.key);
    for (const k of s.keys) expect(k.range.length, k.key).toBeGreaterThan(0);
    expect(s.sources.purposes.length).toBeGreaterThan(0); // nạp mục đích gốc khi mở màn lần đầu
    expect(s.keys.find((k) => k.key === 'payment_discount_income')?.range).toEqual(['515']); // CKTT khai ở đây, không ở cài đặt mua hàng
    expect(s.sources.purposes.map((p) => p.code)).toEqual(expect.arrayContaining(['NQUA', 'XQUA'])); // quà không hoá đơn cài được trước khi có phiếu quà
  });

  it('đổi tài khoản: khoá lạ, ngoài phạm vi, TK tổng hợp bị chặn; hợp lệ thì phiếu bán mới ghi doanh thu vào TK mới', async () => {
    expect((await call(ctx, 'PUT', '/api/v1/posting/scheme/accounts/khong-co', { accountCode: '51111' })).status).toBe(400);
    expect((await call(ctx, 'PUT', '/api/v1/posting/scheme/accounts/revenue', { accountCode: '1111' })).status).toBe(400);
    expect((await call(ctx, 'PUT', '/api/v1/posting/scheme/accounts/revenue', { accountCode: '511' })).status).toBe(400);
    const posting = await db.selectFrom('accounts').select('code').where('tenant_id', '=', tenantId).where('is_posting', '=', true).where('code', 'like', '511%').orderBy('code').execute();
    const target = posting.find((a) => a.code !== (posting[0]?.code))?.code ?? posting[0]!.code;
    const r = await call(ctx, 'PUT', '/api/v1/posting/scheme/accounts/revenue', { accountCode: target });
    expect(r.status, JSON.stringify(r.body)).toBe(200);
    expect((await sale('BH-QT1')).status).toBe(200);
    expect((await lines('BH-QT1')).find((l) => l.credit === 100000)?.acc).toBe(target);
  });

  it('PUT /posting/defaults cũng chặn tài khoản ngoài phạm vi', async () => {
    expect((await call(ctx, 'PUT', '/api/v1/posting/defaults', { receivable: '3312' })).status).toBe(400);
  });

  it('lý do trên chứng từ không đổi tài khoản', async () => {
    await call(ctx, 'PUT', '/api/v1/posting/reasons/XLD', { name: 'Lý do thử', kind: 'out', counterAccount: '1388', revenueAccount: '7111' });
    expect((await sale('BH-QT2', { reasonCode: 'XLD' })).status).toBe(200);
    const accs = (await lines('BH-QT2')).map((l) => l.acc);
    expect(accs).not.toContain('1388');
    expect(accs).not.toContain('7111');
  });

  it('nhóm hạch toán của mặt hàng không đổi tài khoản: mọi mặt hàng theo tài khoản của quy tắc', async () => {
    await call(ctx, 'PUT', '/api/v1/posting/groups/NHT-KM', { name: 'Hàng khuyến mại', inventoryAccount: '1561', cogsAccount: '6323', revenueAccount: '51113', salesReturnAccount: '52133', isDefault: false });
    await sql`INSERT INTO products (tenant_id, sku, name, unit, posting_group_code) VALUES (${tenantId}, 'QT-KM', 'Hàng khuyến mại', 'Hộp', 'NHT-KM') ON CONFLICT DO NOTHING`.execute(db);
    const revenue = (await scheme()).keys.find((k) => k.key === 'revenue')!.accountCode;
    const r = await call(ctx, 'POST', '/api/v1/documents', {
      docType: 'sale', docKey: 'BH-QT3', branchCode: '08000', docNo: 'BH-QT3', docDate: '2026-10-05',
      lines: [{ lineKey: 'l1', sku: 'QT-KM', name: 'Hàng khuyến mại', unit: 'Hộp', qty: 1, amountBeforeTax: 100000, taxCode: 'R08', taxAmount: 8000 }],
      totals: { beforeTax: 100000, tax: 8000, total: 108000 },
    });
    expect(r.status).toBe(200);
    expect((await lines('BH-QT3')).find((l) => l.credit === 100000)?.acc).toBe(revenue);
  });

  it('phiếu xuất kho: có mục đích → Nợ TK của mục đích; không mục đích → thiếu chờ xử lý', async () => {
    const s = await scheme();
    const p = s.sources.purposes.find((x) => x.direction === 'decrease')!;
    expect((await stockOut('XK-QT1', p.code)).status).toBe(200);
    expect((await lines('XK-QT1')).find((l) => l.debit === 70000)?.acc).toBe(p.accountCode);
    expect((await stockOut('XK-QT2')).status).toBe(200);
    const shortage = s.keys.find((k) => k.key === 'stock_shortage')!.accountCode;
    expect((await lines('XK-QT2')).find((l) => l.debit === 70000)?.acc).toBe(shortage);
  });

  it('mục đích không có / sai chiều → không ghi sổ, báo lỗi định khoản', async () => {
    const s = await scheme();
    const dec = s.sources.purposes.find((x) => x.direction === 'decrease')!;
    const r1 = await stockOut('XK-QT3', 'KHONG-CO');
    const r2 = await stockOut('NK-QT4', dec.code, 'increase');
    for (const [r, k] of [[r1, 'XK-QT3'], [r2, 'NK-QT4']] as const) {
      expect([200, 400]).toContain(r.status);
      expect(await lines(k)).toEqual([]);
    }
  });

  it('thêm mục đích: TK ngoài phạm vi bị chặn; hợp lệ dùng được ngay', async () => {
    expect((await call(ctx, 'PUT', '/api/v1/posting/purposes/THU-NGHIEM', { name: 'Thử', direction: 'decrease', accountCode: '1111' })).status).toBe(400);
    const acc = (await db.selectFrom('accounts').select('code').where('tenant_id', '=', tenantId).where('is_posting', '=', true).where('code', 'like', '642%').orderBy('code').executeTakeFirstOrThrow()).code;
    expect((await call(ctx, 'PUT', '/api/v1/posting/purposes/THU-NGHIEM', { name: 'Thử', direction: 'decrease', accountCode: acc })).status).toBe(200);
    expect((await stockOut('XK-QT5', 'THU-NGHIEM')).status).toBe(200);
    expect((await lines('XK-QT5')).find((l) => l.debit === 70000)?.acc).toBe(acc);
  });

  it('xem thử: trả bút toán cân, không lưu chứng từ, không ghi sổ', async () => {
    const before = Number((await sql<{ n: string }>`SELECT count(*) AS n FROM ledger_entries WHERE tenant_id = ${tenantId}`.execute(db)).rows[0]!.n);
    const r = await call(ctx, 'POST', '/api/v1/posting/scheme/preview', { document: {
      docType: 'sale', docKey: 'xem-thu', branchCode: '08000', docNo: 'XEM-THU', docDate: '2026-10-05',
      lines: [{ lineKey: 'l1', sku: 'SUA01', name: 'Sữa bột', unit: 'Hộp', qty: 1, amountBeforeTax: 100000, taxCode: 'R08', taxAmount: 8000, cost: 70000 }],
      payments: [{ methodCode: 'TM', amount: 108000 }], totals: { beforeTax: 100000, tax: 8000, total: 108000 },
    } });
    expect(r.status, JSON.stringify(r.body)).toBe(200);
    const d = r.body.data as { ok: boolean; entries: { lines: { debit: number; credit: number }[] }[] };
    expect(d.ok).toBe(true);
    expect(d.entries.length).toBeGreaterThanOrEqual(2); // bút toán hàng + phiếu thu
    for (const e of d.entries) expect(e.lines.reduce((s, l) => s + l.debit, 0)).toBe(e.lines.reduce((s, l) => s + l.credit, 0));
    const after = Number((await sql<{ n: string }>`SELECT count(*) AS n FROM ledger_entries WHERE tenant_id = ${tenantId}`.execute(db)).rows[0]!.n);
    expect(after).toBe(before);
    expect(await db.selectFrom('accounting_events').select('id').where('tenant_id', '=', tenantId).where('doc_key', 'like', 'xem-thu%').executeTakeFirst()).toBeUndefined();
  });
});
