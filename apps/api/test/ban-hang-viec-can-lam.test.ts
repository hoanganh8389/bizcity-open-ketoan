// [2026-11-13 03:40 PM Võ Hoàng] UX-14 — việc cần làm của phân hệ Bán hàng (phiếu NT-BH-013 §5 dòng 4) (đóng góp)
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { sql } from 'kysely';
import { db } from '../src/db/client.js';
import { call, saleDoc, setupTenant, type TestCtx } from './helpers.js';

let ctx: TestCtx;
let tenantId = '';
const today = new Date().toISOString().slice(0, 10);
const addDays = (d: string, n: number) => new Date(new Date(`${d}T00:00:00Z`).getTime() + n * 86400000).toISOString().slice(0, 10);
const todo = async () => {
  const r = await call<{ data: { byKind: Record<string, { pending: number; error: number }>; items: { key: string; count: number; amount?: number; path: string }[] } }>(ctx, 'GET', '/api/v1/ban-hang/viec-can-lam');
  expect(r.status, JSON.stringify(r.body)).toBe(200);
  return r.body.data;
};

beforeAll(async () => {
  ctx = await setupTenant();
  tenantId = (await db.selectFrom('tenants').select('id').where('code', '=', ctx.tenantCode).executeTakeFirstOrThrow()).id;
});
afterAll(async () => { await ctx.app.close(); });

describe('Việc cần làm — Bán hàng (NT-BH-013 §5 dòng 4)', () => {
  it('đơn vị mới: không có việc; byKind sale / sale_return = 0', async () => {
    const t = await todo();
    expect(t.items).toEqual([]);
    expect(t.byKind).toEqual({ sale: { pending: 0, error: 0 }, sale_return: { pending: 0, error: 0 } });
  });

  it('chứng từ bán chờ định khoản; chương trình ≥ 90 % hạn mức; khách nợ quá hạn → mỗi việc một dòng, mở đúng màn', async () => {
    // Chế độ chờ duyệt cho sale → phiếu nạp vào ở trạng thái chờ.
    expect((await call(ctx, 'PUT', '/api/v1/settings/posting-modes', { sale: 'approve' })).status).toBeLessThan(300);
    const pend = await call(ctx, 'POST', '/api/v1/documents', saleDoc({ docKey: 'pos:CN01:VC1', docNo: 'VC1', docDate: today, invoice: undefined }));
    expect(pend.body.data?.status, JSON.stringify(pend.body)).toBe('pending');

    await sql`INSERT INTO products (tenant_id, sku, name, unit) VALUES (${tenantId}, 'SUA01', 'Sữa', 'Hộp'), (${tenantId}, 'QUA01', 'Quà', 'Hộp') ON CONFLICT (tenant_id, sku) DO NOTHING`.execute(db);
    const prog = await call<{ data: { id: string } }>(ctx, 'POST', '/api/v1/sale-programs', {
      code: 'VC-CT', name: 'Thử', programKind: 'KM-CTY', mode: 'gift', sku: 'SUA01', buyQty: 1, giftSku: 'QUA01', giftQty: 1,
      validFrom: addDays(today, -1), validTo: addDays(today, 10), quotas: [{ branchCode: 'CN01', quotaQty: 10 }],
    });
    expect(prog.status, JSON.stringify(prog.body)).toBe(200);
    await sql`UPDATE sale_program_quotas SET used_qty = 9 WHERE tenant_id = ${tenantId}`.execute(db);

    // Khách nợ: phiếu bán ghi sổ có hạn thu đã qua (ngày bán lùi 40 ngày, không thu tiền).
    expect((await call(ctx, 'PUT', '/api/v1/settings/posting-modes', { sale: 'auto' })).status).toBeLessThan(300);
    const debt = await call(ctx, 'POST', '/api/v1/documents', saleDoc({ docKey: 'pos:CN01:VC2', docNo: 'VC2', docDate: addDays(today, -40), invoice: undefined, payments: [], dueDate: addDays(today, -10) }));
    expect(debt.body.data?.status, JSON.stringify(debt.body)).toBe('posted');

    const t = await todo();
    expect(t.byKind.sale).toEqual({ pending: 1, error: 0 });
    const by = Object.fromEntries(t.items.map((i) => [i.key, i]));
    expect(by.doc_pending).toMatchObject({ count: 1, path: '/chung-tu?status=pending' });
    expect(by.program_quota).toMatchObject({ count: 1, path: '/ban-hang/chuong-trinh' });
    expect(by.receivable_overdue).toMatchObject({ count: 1, amount: 200_000, path: '/bao-cao/tuoi-no-qua-han' });
  });
});
