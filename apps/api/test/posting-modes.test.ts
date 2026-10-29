/**
 * Trạm định khoản (ACC14): chứng từ tới (qua API hay kéo từ hệ thống kết nối) được lưu và chờ định khoản; kế toán định khoản theo lô.
 * Phiên bản mới của chứng từ đã định khoản: chờ định khoản lại, bút toán phiên bản cũ giữ nguyên tới khi định khoản lại
 * (đảo bằng ghi số âm, có liên kết). Mỗi bước có nhật ký định khoản.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { sql } from 'kysely';
import { APPROVABLE_DOC_TYPES } from '@ketoan/contracts';
import { db } from '../src/db/client.js';
import { call, saleDoc, setupTenant, type TestCtx } from './helpers.js';

let ctx: TestCtx;
let tenantId: string;

beforeAll(async () => {
  ctx = await setupTenant();
  tenantId = (await db.selectFrom('tenants').select('id').where('code', '=', ctx.tenantCode).executeTakeFirstOrThrow()).id;
  await call(ctx, 'POST', '/api/v1/branches', { code: 'CN02', name: 'Cửa hàng 02' });
  await call(ctx, 'PUT', '/api/v1/products', { products: [{ sku: 'SUA01', name: 'Sữa bột 900g', unit: 'Hộp' }] });
});
afterAll(async () => {
  await ctx.app.close();
});

async function counts(id: string) {
  const r = await sql<{ entries: string; moves: string; sales: string }>`
    SELECT (SELECT COUNT(*) FROM ledger_entries WHERE event_id = ${id} AND status = 'posted' AND NOT is_reversal) AS entries,
           (SELECT COUNT(*) FROM inventory_movements WHERE event_id = ${id}) AS moves,
           (SELECT COUNT(*) FROM sales_lines WHERE event_id = ${id}) AS sales`.execute(db);
  return { entries: Number(r.rows[0]!.entries), moves: Number(r.rows[0]!.moves), sales: Number(r.rows[0]!.sales) };
}
const docOf = (key: string) => db.selectFrom('accounting_events').select(['id', 'status', 'version', 'posted_version']).where('tenant_id', '=', tenantId).where('doc_key', '=', key).executeTakeFirstOrThrow();
async function revenue(id: string) {
  const r = await sql<{ v: string | null }>`SELECT SUM(l.credit - l.debit) AS v FROM ledger_lines l JOIN ledger_entries e ON e.id = l.entry_id WHERE e.event_id = ${id} AND l.account_code LIKE '511%'`.execute(db);
  return Number(r.rows[0]?.v ?? 0);
}

describe('Chế độ định khoản', () => {
  it('đặt hoá đơn bán và chuyển kho chờ định khoản (các loại khác định khoản ngay)', async () => {
    const modes = { ...Object.fromEntries(APPROVABLE_DOC_TYPES.map((t) => [t, 'auto'])), sale: 'approve', transfer: 'approve' };
    expect((await call(ctx, 'PUT', '/api/v1/settings/posting-modes', modes)).status).toBe(200);
    expect((await call(ctx, 'GET', '/api/v1/settings/posting-modes')).body.data).toMatchObject({ sale: 'approve', transfer: 'approve', sale_return: 'auto' });
  });

  it('hoá đơn bán qua API: chờ định khoản — chưa vào sổ, bán hàng, kho; gửi lại cùng phiên bản thì không đổi; có nhật ký nhận', async () => {
    const r = await call(ctx, 'POST', '/api/v1/documents', saleDoc());
    expect(r.body.data.status, JSON.stringify(r.body)).toBe('pending');
    const doc = await docOf('pos:CN01:HD0001');
    expect(doc).toMatchObject({ status: 'pending', posted_version: null });
    expect(await counts(doc.id)).toEqual({ entries: 0, moves: 0, sales: 0 });
    expect((await call(ctx, 'POST', '/api/v1/documents', saleDoc())).body.data.status).toBe('unchanged');
    const list = await call(ctx, 'GET', '/api/v1/documents?status=pending&from=2026-10-01&to=2026-10-31');
    expect(list.body.data.map((x: { docNo: string }) => x.docNo)).toEqual(['HD0001']);
    const log = await call(ctx, 'GET', `/api/v1/documents/${doc.id}/posting-log`);
    expect(log.body.data.map((x: { action: string }) => x.action)).toEqual(['receive']);
  });

  it('phiếu chuyển kho gửi sang cũng chờ; phiếu điều chỉnh (định khoản ngay) thì vào sổ luôn', async () => {
    const t = await call(ctx, 'POST', '/api/v1/documents', { docType: 'transfer', docKey: 'kho:CK01', branchCode: 'CN01', toBranchCode: 'CN02', docNo: 'CK01', docDate: '2026-10-02', status: 'received',
      lines: [{ lineKey: 'l1', sku: 'SUA01', qty: 1, amount: 1000 }], totals: { total: 1000 } });
    expect(t.body.data.status, JSON.stringify(t.body)).toBe('pending');
    const a = await call(ctx, 'POST', '/api/v1/documents', { docType: 'stock_adjustment', docKey: 'kho:DC01', branchCode: 'CN01', docNo: 'DC01', docDate: '2026-10-01', direction: 'increase',
      lines: [{ lineKey: 'l1', sku: 'SUA01', qty: 5, amount: 5000 }], totals: { total: 5000 } });
    expect(a.body.data.status, JSON.stringify(a.body)).toBe('posted');
  });

  it('định khoản theo lô: vào sổ, bán hàng; chứng từ đã định khoản đúng phiên bản thì bỏ qua', async () => {
    const doc = await docOf('pos:CN01:HD0001');
    const posted = await docOf('kho:DC01');
    const r = await call(ctx, 'POST', '/api/v1/documents/post', { ids: [doc.id, posted.id] });
    expect(r.status, JSON.stringify(r.body)).toBe(200);
    expect(r.body.data.posted).toBe(1);
    expect(r.body.data.skipped.map((x: { docNo: string }) => x.docNo)).toEqual(['DC01']);
    expect(await docOf('pos:CN01:HD0001')).toMatchObject({ status: 'posted', posted_version: 1 });
    const c = await counts(doc.id);
    expect(c.entries).toBeGreaterThan(0);
    expect(c.sales).toBe(2);
    expect(await revenue(doc.id)).toBe(185185);
  });

  it('phiên bản mới của chứng từ đã định khoản: chờ định khoản lại, sổ vẫn theo phiên bản cũ; định khoản lại thì đảo bút toán cũ (ghi số âm), ghi theo phiên bản mới', async () => {
    const v2 = saleDoc({ version: 2, lines: [{ lineKey: 'l1', sku: 'SUA01', name: 'Sữa bột 900g', unit: 'Hộp', qty: 2, amountBeforeTax: 370370, taxCode: 'R08', taxAmount: 29630 }], payments: [{ methodCode: 'TM', amount: 400000 }], totals: { beforeTax: 370370, tax: 29630, total: 400000 } });
    expect((await call(ctx, 'POST', '/api/v1/documents', v2)).body.data.status).toBe('pending');
    const doc = await docOf('pos:CN01:HD0001');
    expect(doc).toMatchObject({ status: 'pending', version: 2, posted_version: 1 });
    expect(await revenue(doc.id)).toBe(185185); // sổ vẫn theo phiên bản 1
    const r = await call(ctx, 'POST', '/api/v1/documents/post', { ids: [doc.id] });
    expect(r.body.data.posted).toBe(1);
    expect(await docOf('pos:CN01:HD0001')).toMatchObject({ status: 'posted', posted_version: 2 });
    expect(await revenue(doc.id)).toBe(370370);
    const reversals = await db.selectFrom('ledger_entries').select('id').where('event_id', '=', doc.id).where('is_reversal', '=', true).execute();
    expect(reversals.length).toBeGreaterThan(0);
    const log = await call(ctx, 'GET', `/api/v1/documents/${doc.id}/posting-log`);
    expect(log.body.data.map((x: { action: string; version: number }) => `${x.action}:${x.version}`)).toEqual(['repost:2', 'receive:2', 'post:1', 'receive:1']);
  });

  it('định khoản lại (repost) chứng từ đã định khoản; nhật ký định khoản lọc theo hành động', async () => {
    const doc = await docOf('pos:CN01:HD0001');
    const r = await call(ctx, 'POST', '/api/v1/documents/post', { ids: [doc.id], repost: true });
    // Không có gì đổi: giữ nguyên bút toán, báo "không có thay đổi" (vẫn ghi nhật ký repost).
    expect(r.body.data).toMatchObject({ posted: 0, unchanged: 1 });
    expect(await revenue(doc.id)).toBe(370370);
    const today = new Date(Date.now() + 7 * 3_600_000).toISOString().slice(0, 10); // ngày theo giờ Việt Nam (nhật ký lọc theo +07)
    const all = await call(ctx, 'GET', `/api/v1/posting-log?from=2026-01-01&to=${today}&action=repost`);
    expect(all.status, JSON.stringify(all.body)).toBe(200);
    expect(all.body.data.filter((x: { docNo: string }) => x.docNo === 'HD0001').length).toBe(2);
  });

  it('đổi hình thức thanh toán (cùng hàng, cùng tiền): chỉ đảo bút toán thu tiền, bút toán bán hàng giữ nguyên', async () => {
    const doc = await docOf('pos:CN01:HD0001');
    const before = await db.selectFrom('ledger_entries').select(['id', 'description']).where('event_id', '=', doc.id).where('status', '=', 'posted').where('is_reversal', '=', false).execute();
    const v3 = saleDoc({ version: 3, lines: [{ lineKey: 'l1', sku: 'SUA01', name: 'Sữa bột 900g', unit: 'Hộp', qty: 2, amountBeforeTax: 370370, taxCode: 'R08', taxAmount: 29630 }], payments: [{ methodCode: 'CK', amount: 400000 }], totals: { beforeTax: 370370, tax: 29630, total: 400000 } });
    expect((await call(ctx, 'POST', '/api/v1/documents', v3)).body.data.status).toBe('pending');
    const p = await call(ctx, 'GET', `/api/v1/documents/${doc.id}/preview`);
    expect(p.body.data, JSON.stringify(p.body)).toMatchObject({ ok: true, willKeep: 1, willReverse: 1 });
    expect((await call(ctx, 'POST', '/api/v1/documents/post', { ids: [doc.id] })).body.data.posted).toBe(1);
    const after = await db.selectFrom('ledger_entries').select(['id']).where('event_id', '=', doc.id).where('status', '=', 'posted').where('is_reversal', '=', false).execute();
    const kept = before.filter((b) => after.some((a) => a.id === b.id));
    expect(kept).toHaveLength(1); // bút toán bán hàng
    expect(after).toHaveLength(2);
    expect(await revenue(doc.id)).toBe(370370);
    const log = await call(ctx, 'GET', `/api/v1/documents/${doc.id}/posting-log`);
    expect(log.body.data[0]).toMatchObject({ action: 'repost', version: 3, reversed: 1 });
    expect(log.body.data[0].message).toContain('Giữ 1 bút toán không đổi');
    // Định khoản lại khi không đổi gì: không đảo, không ghi thêm.
    const again = await call(ctx, 'POST', '/api/v1/documents/post', { ids: [doc.id], repost: true });
    expect(again.body.data).toMatchObject({ posted: 0, unchanged: 1 });
    const log2 = await call(ctx, 'GET', `/api/v1/documents/${doc.id}/posting-log`);
    expect(log2.body.data[0]).toMatchObject({ action: 'repost', reversed: 0 });
    expect(log2.body.data[0].message).toContain('không có gì thay đổi');
  });
});
