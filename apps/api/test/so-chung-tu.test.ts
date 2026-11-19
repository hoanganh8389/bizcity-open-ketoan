// [2026-11-18 Nguyễn Văn Thủy] Sổ chứng từ chung business_documents (0156): đồng bộ đầu phiếu, phiên bản, liên kết từ bảng nguồn (đóng góp)
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { runModuleMigrations } from '@bizcity/platform/db/module-db';
import { sql } from 'kysely';
import { db } from '../src/db/client.js';
import { call, setupTenant, type TestCtx } from './helpers.js';

let ctx: TestCtx;
const POS_DIR = fileURLToPath(new URL('../../../modules/pos/', import.meta.url));
const POS_READS = ['bizcity_read.branches', 'bizcity_read.products', 'bizcity_read.tax_codes', 'bizcity_read.payment_methods', 'bizcity_read.partners',
  'bizcity_read.branch_prices', 'bizcity_read.stock_on_hand', 'bizcity_read.warehouses'];
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
    const list = await call<{ data: { items: { docRef: string; status: string }[]; counts: Record<string, number> } }>(ctx, 'GET', '/api/v1/business-documents?status=draft&q=SCT-4');
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
    expect(await doc(ref)).toMatchObject({ status: 'done', approved_by: 'Kế toán A' }); // 0166: phiếu nhập đã duyệt = hoàn tất
    const links = await db.selectFrom('document_links').select(['to_ref', 'role']).where('tenant_id', '=', t).where('from_ref', '=', ref).orderBy('role').execute();
    expect(links).toEqual([{ to_ref: `mua-hang.policy:${pol}`, role: 'applies' }, { to_ref: `kho.lot:${lot}`, role: 'uses' }]);
    const det = await call<{ data: { document: { approvedBy: string }; links: { role: string; label: string; openable: boolean }[] } }>(ctx, 'GET', `/api/v1/business-documents/detail?docRef=${ref}`);
    expect(det.body.data.document.approvedBy).toBe('Kế toán A');
    expect(det.body.data.links.map((l) => [l.role, l.label, l.openable]).sort()).toEqual([
      ['applies', 'Chính sách CS-SCT — Thưởng doanh số thử', true], // 0166: chính sách đã vào sổ chứng từ, mở được
      ['uses', 'Lô L001 · SKU-SCT · HSD 2027-05-01', false],
    ]);
  });
});

// [2026-11-19 Nguyễn Văn Thủy] 0166: tên loại theo chứng từ là gì, vòng đời Thực hiện / Hoàn tất, chính sách giá vào sổ (đóng góp)
describe('Loại chứng từ và vòng đời (0166)', () => {
  const lines = (x: [string, number][]) => JSON.stringify({ lines: x.map(([sku, qty]) => ({ sku, qty })) });
  it('tên loại: nhập / nhận tặng = inventory.receipt, trả NCC / xuất tặng = inventory.issue, trả tiền = finance.payment; đã duyệt = hoàn tất', async () => {
    const got: Record<string, unknown> = {};
    for (const k of ['receipt', 'gift_in', 'return', 'gift_out', 'payment', 'cost']) {
      const id = await purchase(k, 'approved', `LT-${k}`);
      const d = await doc(`mua-hang.document:${id}`);
      got[k] = [d.doc_type, d.status, (d.meta as { kind?: string }).kind];
    }
    expect(got).toEqual({
      receipt: ['inventory.receipt', 'done', 'receipt'], gift_in: ['inventory.receipt', 'done', 'gift_in'],
      return: ['inventory.issue', 'done', 'return'], gift_out: ['inventory.issue', 'done', 'gift_out'],
      payment: ['finance.payment', 'done', 'payment'], cost: ['purchase.cost', 'done', 'cost'],
    });
  });

  it('đơn đặt: chưa nhập = đã duyệt; nhập một phần = đang thực hiện; nhập đủ = hoàn tất; huỷ phiếu nhập thì lùi lại', async () => {
    const order = await purchase('order', 'approved', 'DDH-VD-1');
    await sql`UPDATE purchase_documents SET data = ${lines([['A', 10], ['B', 5]])}::jsonb WHERE id = ${order}`.execute(db);
    const ref = `mua-hang.document:${order}`;
    expect((await doc(ref)).status).toBe('approved');
    const v0 = (await doc(ref)).version;
    const r1 = await purchase('receipt', 'draft', 'PN-VD-1', [order]);
    await sql`UPDATE purchase_documents SET data = ${lines([['A', 10]])}::jsonb WHERE id = ${r1}`.execute(db);
    expect((await doc(ref)).status).toBe('approved'); // phiếu nhập nháp chưa tính
    await sql`UPDATE purchase_documents SET status = 'approved' WHERE id = ${r1}`.execute(db);
    expect((await doc(ref)).status).toBe('in_progress');
    const r2 = await purchase('receipt', 'draft', 'PN-VD-2', [order]);
    await sql`UPDATE purchase_documents SET data = ${lines([['B', 5]])}::jsonb, status = 'approved' WHERE id = ${r2}`.execute(db);
    expect((await doc(ref)).status).toBe('done');
    await sql`UPDATE purchase_documents SET status = 'cancelled' WHERE id = ${r2}`.execute(db);
    expect((await doc(ref)).status).toBe('in_progress');
    expect((await doc(ref)).version).toBe(v0); // tiến độ không phải đổi nội dung
  });

  it('chính sách giá vào sổ: pricing.policy đang áp = đang thực hiện; ngừng = huỷ; xoá = huỷ, giữ dòng', async () => {
    const id = (await sql<{ id: string }>`INSERT INTO purchase_policies (tenant_id, code, kind, name, scope) VALUES (${t}, 'CS-VD', 'target_rebate', 'Thưởng thử', ${JSON.stringify({ partnerCode: 'NCC-A' })}::jsonb) RETURNING id`.execute(db)).rows[0]!.id;
    const ref = `mua-hang.policy:${id}`;
    expect(await doc(ref)).toMatchObject({ module: 'mua-hang', doc_type: 'pricing.policy', doc_no: 'CS-VD', partner_ref: 'NCC-A', status: 'in_progress', status_raw: 'published' });
    await sql`UPDATE purchase_policies SET is_active = false WHERE id = ${id}`.execute(db);
    expect(await doc(ref)).toMatchObject({ status: 'cancelled', status_raw: 'inactive' });
    await sql`DELETE FROM purchase_policies WHERE id = ${id}`.execute(db);
    expect(await doc(ref)).toMatchObject({ status: 'cancelled', status_raw: 'retired' });
  });
});

// [2026-11-19 10:43 AM Võ Hoàng] NT-BH-033 — 0167: vai trò module (mod_pos_rw) ghi sổ chứng từ qua bizcity_doc_put / bizcity_doc_link; tenant khác phiên bị chặn; không có quyền bảng lõi
describe.skipIf(!existsSync(POS_DIR))('Ghi sổ chứng từ từ vai trò module (0167)', () => {
  /** Chạy fn trong giao dịch đã gắn đơn vị (như API) bằng vai trò mod_pos_rw (như ctx.data.module); luôn ROLLBACK. */
  const asPosRw = async (tenant: string, fn: (tx: typeof db) => Promise<unknown>) => {
    let out: unknown;
    let err: unknown;
    await db.transaction().execute(async (trx) => {
      await sql`SELECT set_config('bizcity.tenant_id', ${tenant}, true)`.execute(trx);
      await sql`SET LOCAL ROLE mod_pos_rw`.execute(trx);
      try { out = await fn(trx as unknown as typeof db); } catch (e) { err = e; }
      throw new Error('rollback');
    }).catch((e: Error) => { if (e.message !== 'rollback') throw e; });
    if (err) throw err;
    return out;
  };
  const put = (tx: typeof db, tenant: string, ref: string) => sql`SELECT public.bizcity_doc_put(${tenant}::bigint, ${ref}, 'pos', 'sales.order', 'HD-0167',
    current_date, 'CN01', '', 'Đơn bán máy POS', 0, 'completed', 'done', '{"a":1}'::jsonb, '{}'::jsonb, 'user:1', NULL, NULL, '', NULL)`.execute(tx);

  beforeAll(async () => {
    await runModuleMigrations('pos', path.join(POS_DIR, 'migrations'), { reads: POS_READS });
  });

  it('mod_pos_rw, đúng đơn vị của phiên → ghi được đầu phiếu, phiên bản, liên kết', async () => {
    const got = await asPosRw(t, async (tx) => {
      await put(tx, t, 'pos.order:probe-0167');
      await sql`SELECT public.bizcity_doc_link(${t}::bigint, 'pos.order:probe-0167', 'ledger.event:pos:CN01:sale:probe-0167', 'ledger', 'user:1')`.execute(tx);
      await sql`RESET ROLE`.execute(tx);
      const d = (await sql<{ doc_type: string; version: number }>`SELECT doc_type, version FROM business_documents WHERE tenant_id = ${t} AND doc_ref = 'pos.order:probe-0167'`.execute(tx)).rows;
      const l = (await sql<{ role: string }>`SELECT role FROM document_links WHERE tenant_id = ${t} AND from_ref = 'pos.order:probe-0167'`.execute(tx)).rows;
      return { d, l };
    });
    expect(got).toEqual({ d: [{ doc_type: 'sales.order', version: 1 }], l: [{ role: 'ledger' }] });
  });

  it('mod_pos_rw ghi chứng từ của đơn vị khác phiên → lỗi 42501 (hàm và liên kết)', async () => {
    const other = String((await sql<{ id: string }>`SELECT id FROM tenants WHERE id <> ${t} ORDER BY id LIMIT 1`.execute(db)).rows[0]!.id);
    await expect(asPosRw(t, (tx) => put(tx, other, 'pos.order:probe-0167-x'))).rejects.toMatchObject({ code: '42501', message: expect.stringContaining('không ghi chứng từ của đơn vị') });
    await expect(asPosRw(t, (tx) => sql`SELECT public.bizcity_doc_link(${other}::bigint, 'pos.order:a', 'pos.order:b', 'source', 'x')`.execute(tx)))
      .rejects.toMatchObject({ code: '42501' });
  });

  it('vai trò module vẫn không có quyền ghi thẳng bảng lõi (chỉ qua hàm)', async () => {
    await expect(asPosRw(t, (tx) => sql`INSERT INTO business_documents (tenant_id, doc_ref, module, doc_type, status_raw, status) VALUES (${t}, 'pos.order:direct', 'pos', 'sales.order', 'x', 'done')`.execute(tx)))
      .rejects.toMatchObject({ code: '42501', message: expect.stringContaining('permission denied') });
  });
});
