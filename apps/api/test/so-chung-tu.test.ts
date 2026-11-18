// [2026-11-18 Nguyễn Văn Thủy] Sổ chứng từ chung business_documents (0156): đồng bộ đầu phiếu, phiên bản, liên kết từ bảng nguồn (đóng góp)
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { sql } from 'kysely';
import { db } from '../src/db/client.js';
import { call, setupTenant, type TestCtx } from './helpers.js';

let ctx: TestCtx;
let t: string;

const doc = (ref: string) => db.selectFrom('business_documents').selectAll().where('tenant_id', '=', t).where('doc_ref', '=', ref).executeTakeFirstOrThrow();
const versions = async (ref: string) => Number((await db.selectFrom('document_versions').select(sql<string>`count(*)`.as('n')).where('tenant_id', '=', t).where('doc_ref', '=', ref).executeTakeFirstOrThrow()).n);
async function purchase(kind: string, status: string, no: string, refIds: string[] = []): Promise<string> {
  const r = await sql<{ id: string }>`INSERT INTO purchase_documents (tenant_id, kind, status, doc_no, doc_date, branch_code, partner_code, total, ref_ids, created_by)
    VALUES (${t}, ${kind}, ${status}, ${no}, '2026-11-10', 'CN01', 'NCC-A', 1000000, ${sql.raw(`ARRAY[${refIds.join(',')}]::bigint[]`)}, 'user:1') RETURNING id`.execute(db);
  return String(r.rows[0]!.id);
}

beforeAll(async () => {
  ctx = await setupTenant();
  t = String((await db.selectFrom('tenants').select('id').where('code', '=', ctx.tenantCode).executeTakeFirstOrThrow()).id);
});
afterAll(async () => { await ctx.app.close(); });

describe('Sổ chứng từ chung (0156)', () => {
  it('phiếu mua tự vào sổ: loại chuẩn, trạng thái nhóm, phiên bản 1', async () => {
    const id = await purchase('order', 'draft', 'DDH-SCT-1');
    const d = await doc(`mua-hang.document:${id}`);
    expect(d).toMatchObject({ module: 'mua-hang', doc_type: 'purchase.order', doc_no: 'DDH-SCT-1', status: 'draft', status_raw: 'draft', version: 1, title: 'Đơn đặt hàng', partner_ref: 'NCC-A' });
    expect(await versions(`mua-hang.document:${id}`)).toBe(1);
  });

  it('đổi trạng thái không thêm phiên bản; đổi nội dung thì thêm', async () => {
    const id = await purchase('order', 'draft', 'DDH-SCT-2');
    const ref = `mua-hang.document:${id}`;
    await sql`UPDATE purchase_documents SET status = 'pending_approval' WHERE id = ${id}`.execute(db);
    expect(await doc(ref)).toMatchObject({ status: 'pending', status_raw: 'pending_approval', version: 1 });
    await sql`UPDATE purchase_documents SET status = 'approved', approved_by = 'user:2', approved_at = now() WHERE id = ${id}`.execute(db);
    expect(await versions(ref)).toBe(1);
    await sql`UPDATE purchase_documents SET total = 2000000 WHERE id = ${id}`.execute(db);
    expect(await doc(ref)).toMatchObject({ status: 'approved', version: 2 });
    expect(Number((await doc(ref)).total)).toBe(2000000);
    expect(await versions(ref)).toBe(2);
  });

  it('phiếu nhập lập từ đơn đặt: liên kết source; liên kết sổ khi có sự việc kế toán', async () => {
    const order = await purchase('order', 'approved', 'DDH-SCT-3');
    const rec = await purchase('receipt', 'approved', 'PN-SCT-3', [order]);
    await sql`UPDATE purchase_documents SET links = ${JSON.stringify([{ docKey: `mua-hang.document:${rec}`, docNo: 'PN-SCT-3', eventId: '1', role: 'receipt' }])}::jsonb WHERE id = ${rec}`.execute(db);
    const links = await db.selectFrom('document_links').select(['from_ref', 'to_ref', 'role']).where('tenant_id', '=', t).where('from_ref', '=', `mua-hang.document:${rec}`).orderBy('role').execute();
    expect(links).toEqual([
      { from_ref: `mua-hang.document:${rec}`, to_ref: `ledger.event:mua-hang.document:${rec}`, role: 'ledger' },
      { from_ref: `mua-hang.document:${rec}`, to_ref: `mua-hang.document:${order}`, role: 'source' },
    ]);
    expect((await doc(`mua-hang.document:${rec}`)).version).toBe(1); // links (sự việc sinh ra) không tính là đổi nội dung
  });

  it('API: lọc theo trạng thái, đếm theo nhóm; chi tiết kèm phiên bản + liên kết', async () => {
    const order = await purchase('order', 'approved', 'DDH-SCT-4');
    const rec = await purchase('receipt', 'draft', 'PN-SCT-4', [order]);
    const list = await call<{ data: { items: { docRef: string; status: string }[]; counts: Record<string, number> } }>(ctx, 'GET', '/api/v1/business-documents?status=draft&docType=purchase.&q=SCT-4');
    expect(list.status).toBe(200);
    expect(list.body.data.items.map((i) => i.docRef)).toEqual([`mua-hang.document:${rec}`]);
    expect(list.body.data.counts).toMatchObject({ draft: 1, approved: 1 });
    const det = await call<{ data: { document: { title: string }; versions: unknown[]; links: { role: string; to: string }[] } }>(ctx, 'GET', `/api/v1/business-documents/detail?docRef=mua-hang.document:${order}`);
    expect(det.status).toBe(200);
    expect(det.body.data.document.title).toBe('Đơn đặt hàng');
    expect(det.body.data.versions).toHaveLength(1);
    expect(det.body.data.links).toEqual([expect.objectContaining({ role: 'source', to: `mua-hang.document:${order}` })]);
  });

  // [2026-11-18 Nguyễn Văn Thủy] 0162: người duyệt, liên kết áp chính sách / dùng lô, tên dễ đọc (đóng góp)
  it('người duyệt; phiếu áp chính sách (vết tính, chương trình trên dòng) và dùng lô → liên kết applies / uses, có tên dễ đọc', async () => {
    const pol = (await sql<{ id: string }>`INSERT INTO purchase_policies (tenant_id, code, kind, name) VALUES (${t}, 'CS-SCT', 'target_rebate', 'Thưởng doanh số thử') RETURNING id`.execute(db)).rows[0]!.id;
    const lot = (await sql<{ id: string }>`INSERT INTO item_lots (tenant_id, sku, item_key, lot_no, exp_date) VALUES (${t}, 'SKU-SCT', 'SKU-SCT', 'L001', '2027-05-01') RETURNING id`.execute(db)).rows[0]!.id;
    const id = await purchase('receipt', 'draft', 'PN-SCT-5');
    const ref = `mua-hang.document:${id}`;
    expect(await doc(ref)).toMatchObject({ approved_by: '', approved_at: null });
    await sql`UPDATE purchase_documents SET status = 'approved', approved_by = 'Kế toán A', approved_at = now(),
      data = ${JSON.stringify({ policyTrace: [{ policy: 'Trên phiếu' }], lines: [{ sku: 'SKU-SCT', qty: 1, lotNo: 'L001', expDate: '2027-05-01', program: 'CS-SCT' }] })}::jsonb
      WHERE id = ${id}`.execute(db);
    expect(await doc(ref)).toMatchObject({ status: 'approved', approved_by: 'Kế toán A' });
    const links = await db.selectFrom('document_links').select(['to_ref', 'role']).where('tenant_id', '=', t).where('from_ref', '=', ref).orderBy('role').execute();
    expect(links).toEqual([{ to_ref: `mua-hang.policy:${pol}`, role: 'applies' }, { to_ref: `kho.lot:${lot}`, role: 'uses' }]);
    const det = await call<{ data: { document: { approvedBy: string }; links: { role: string; label: string; openable: boolean }[] } }>(ctx, 'GET', `/api/v1/business-documents/detail?docRef=${ref}`);
    expect(det.body.data.document.approvedBy).toBe('Kế toán A');
    expect(det.body.data.links.map((l) => [l.role, l.label, l.openable]).sort()).toEqual([
      ['applies', 'Chính sách CS-SCT — Thưởng doanh số thử', false],
      ['uses', 'Lô L001 · SKU-SCT · HSD 2027-05-01', false],
    ]);
  });
});
