// [2026-11-10 08:30 PM Nguyễn Văn Thủy] PHASE-026 — phiếu chuyển kho lập trên phần mềm kế toán (KHO01) (đóng góp)
/**
 * Phiếu chuyển kho KHO01 (0099) — lưu là xuất, thủ kho nhập xác nhận mới nhập:
 *   - lập phiếu khác chi nhánh → tồn bên chuyển giảm ngay, bên nhận chưa tăng (hàng đang chuyển); xác nhận nhận → bên nhận tăng
 *     đúng phân kho nhập, vào đúng lô bên xuất đã lấy;
 *   - nhận thiếu → bên nhận tăng theo số thực nhận, phần chênh còn trên đường;
 *   - sửa phiếu đã nhận (đổi số lượng) → hai đầu ghi lại; bỏ xác nhận nhận; từ chối → trả tồn bên chuyển; huỷ → trả hết;
 *   - cùng chi nhánh hai kho → nhận luôn khi lưu; trùng kho thì chặn;
 *   - tồn ở màn (stock) không tính chính phiếu đang sửa.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { sql } from 'kysely';
import { db } from '../src/db/client.js';
import { call, setupTenant, type TestCtx } from './helpers.js';

let ctx: TestCtx;
let tenantId = '';
const D = (n: number) => new Date(Date.UTC(2026, 9, n)).toISOString().slice(0, 10); // tháng 10/2026
const ok = (r: { status: number; body: unknown }) => expect([200, 201], JSON.stringify(r.body)).toContain(r.status);

/** Tồn theo thẻ kho của lõi: chi nhánh + phân kho. */
const stock = async (branch: string, wh: string, sku = 'CK-SUA') => Number((await sql<{ q: string | null }>`
  SELECT sum(im.qty)::text AS q FROM inventory_movements im JOIN branches b ON b.id = im.branch_id
   WHERE im.tenant_id = ${tenantId} AND b.code = ${branch} AND im.warehouse_code = ${wh} AND im.sku = ${sku}`.execute(db)).rows[0]?.q ?? 0);
const lotStock = async (branch: string, wh: string) => Object.fromEntries((await sql<{ lot_no: string; q: string }>`
  SELECT l.lot_no, sum(m.qty)::text AS q FROM inventory_lot_moves m JOIN item_lots l ON l.id = m.lot_id JOIN branches b ON b.id = m.branch_id
   WHERE m.tenant_id = ${tenantId} AND b.code = ${branch} AND m.warehouse_code = ${wh} AND m.sku = 'CK-SUA' GROUP BY l.lot_no HAVING sum(m.qty) <> 0`.execute(db)).rows.map((r) => [r.lot_no, Number(r.q)]));

type T = { id: string; docNo: string; status: string; totalQty: number; totalReceived: number; short: boolean; lines: { lineKey: string; qty: number; receivedQty?: number }[]; ledger: { out: { status: string } | null; in: { status: string } | null } };
const create = (body: Record<string, unknown>) => call<{ data: T }>(ctx, 'POST', '/api/v1/kho/transfers', body);

beforeAll(async () => {
  ctx = await setupTenant();
  tenantId = (await db.selectFrom('tenants').select('id').where('code', '=', ctx.tenantCode).executeTakeFirstOrThrow()).id;
  for (const b of [{ code: 'KHO', name: 'Kho tổng' }, { code: 'SHOP1', name: 'Cửa hàng 1' }]) await call(ctx, 'POST', '/api/v1/branches', b);
  for (const w of [{ code: 'KT-HH', branchCode: 'KHO', name: 'Kho hàng', isDefault: true }, { code: 'KT-KM', branchCode: 'KHO', name: 'Kho khuyến mại' }, { code: 'S1', branchCode: 'SHOP1', name: 'Kho cửa hàng', isDefault: true }]) {
    ok(await call(ctx, 'POST', '/api/v1/warehouses', w));
  }
  ok(await call(ctx, 'POST', '/api/v1/documents', {
    docType: 'purchase', docKey: 'NM-CK1', branchCode: 'KHO', docNo: 'NM-CK1', docDate: D(1), partner: { code: 'NCC-CK', name: 'NCC' },
    lines: [
      { lineKey: 'l1', sku: 'CK-SUA', name: 'Sữa chuyển kho', unit: 'Lon', qty: 6, lotNo: 'L1', expDate: '2026-12-31', amountBeforeTax: 600000, taxCode: 'V08', taxAmount: 0 },
      { lineKey: 'l2', sku: 'CK-SUA', name: 'Sữa chuyển kho', unit: 'Lon', qty: 10, lotNo: 'L2', expDate: '2027-06-30', amountBeforeTax: 1000000, taxCode: 'V08', taxAmount: 0 },
    ],
    totals: { beforeTax: 1600000, tax: 0, total: 1600000 },
  }));
});
afterAll(async () => { await ctx.app.close(); });

describe('Phiếu chuyển kho KHO01', () => {
  let id = '';
  it('lập phiếu = xuất: tồn bên chuyển giảm ngay, bên nhận chưa tăng; số phiếu tự cấp CK', async () => {
    const r = await create({ docDate: D(5), fromBranchCode: 'KHO', toBranchCode: 'SHOP1', note: 'Bổ sung hàng', lines: [{ lineKey: 'a', sku: 'CK-SUA', name: 'Sữa chuyển kho', unit: 'Lon', qty: 8 }] });
    ok(r);
    id = r.body.data.id;
    expect(r.body.data.docNo).toMatch(/^CK26\d{5}$/);
    expect(r.body.data).toMatchObject({ status: 'shipped', ledger: { out: { status: 'posted' }, in: null } });
    expect(await stock('KHO', 'KT-HH')).toBe(8);
    expect(await stock('SHOP1', 'S1')).toBe(0);
    // Không ghi lô → xuất hạn sớm trước: hết L1 (6), lấy 2 ở L2.
    expect(await lotStock('KHO', 'KT-HH')).toEqual({ L2: 8 });
  });

  it('tồn ở màn không tính chính phiếu đang sửa', async () => {
    const s = await call<{ data: { warehouse: string; stock: Record<string, number> } }>(ctx, 'GET', `/api/v1/kho/transfers/stock?branchCode=KHO&skus=CK-SUA&date=${D(5)}&exceptId=${id}`);
    expect(s.body.data).toEqual({ warehouse: 'KT-HH', stock: { 'CK-SUA': 16 } });
  });

  it('nhận thiếu: bên nhận tăng theo số thực nhận, đúng lô bên xuất; phần chênh còn trên đường', async () => {
    const r = await call<{ data: T }>(ctx, 'POST', `/api/v1/kho/transfers/${id}/receive`, { receivedDate: D(6), lines: [{ lineKey: 'a', receivedQty: 7 }], note: 'Thiếu 1 lon' });
    ok(r);
    expect(r.body.data).toMatchObject({ status: 'received', totalQty: 8, totalReceived: 7, short: true });
    expect(await stock('SHOP1', 'S1')).toBe(7);
    expect(await lotStock('SHOP1', 'S1')).toEqual({ L1: 6, L2: 1 });
  });

  it('sửa phiếu đã nhận: số xuất 8 → 5, số nhận giữ 5 (không vượt số xuất); hai đầu ghi lại', async () => {
    const r = await call<{ data: T }>(ctx, 'PUT', `/api/v1/kho/transfers/${id}`, { docDate: D(5), fromBranchCode: 'KHO', toBranchCode: 'SHOP1', note: 'Bổ sung hàng', lines: [{ lineKey: 'a', sku: 'CK-SUA', name: 'Sữa chuyển kho', unit: 'Lon', qty: 5 }] });
    ok(r);
    expect(r.body.data).toMatchObject({ status: 'received', totalQty: 5, totalReceived: 5 });
    expect(await stock('KHO', 'KT-HH')).toBe(11);
    expect(await stock('SHOP1', 'S1')).toBe(5);
  });

  it('bỏ xác nhận nhận → bên nhận trả lại; từ chối → bên chuyển được trả lại tồn', async () => {
    ok(await call(ctx, 'POST', `/api/v1/kho/transfers/${id}/unreceive`, {}));
    expect(await stock('SHOP1', 'S1')).toBe(0);
    expect(await stock('KHO', 'KT-HH')).toBe(11);
    const r = await call<{ data: T }>(ctx, 'POST', `/api/v1/kho/transfers/${id}/reject`, { reason: 'Sai hàng' });
    ok(r);
    expect(r.body.data).toMatchObject({ status: 'rejected', ledger: { out: { status: 'cancelled' } } });
    expect(await stock('KHO', 'KT-HH')).toBe(16);
    expect((await call(ctx, 'PUT', `/api/v1/kho/transfers/${id}`, { docDate: D(5), fromBranchCode: 'KHO', toBranchCode: 'SHOP1', lines: [{ lineKey: 'a', sku: 'CK-SUA', qty: 1 }] })).status).toBe(409);
  });

  it('dòng ghi lô thì xuất đúng lô đó; nhận đủ; huỷ phiếu trả cả hai đầu', async () => {
    const r = await create({ docDate: D(7), fromBranchCode: 'KHO', fromWarehouse: 'KT-HH', toBranchCode: 'SHOP1', lines: [{ lineKey: 'a', sku: 'CK-SUA', qty: 3, lotNo: 'L2', expDate: '2027-06-30' }] });
    ok(r);
    expect(await lotStock('KHO', 'KT-HH')).toEqual({ L1: 6, L2: 7 });
    ok(await call(ctx, 'POST', `/api/v1/kho/transfers/${r.body.data.id}/receive`, {}));
    expect(await lotStock('SHOP1', 'S1')).toEqual({ L2: 3 });
    const c = await call<{ data: T }>(ctx, 'POST', `/api/v1/kho/transfers/${r.body.data.id}/cancel`, { reason: 'Lập nhầm' });
    ok(c);
    expect(c.body.data).toMatchObject({ status: 'cancelled', ledger: { out: { status: 'cancelled' }, in: { status: 'cancelled' } } });
    expect(await stock('KHO', 'KT-HH')).toBe(16);
    expect(await stock('SHOP1', 'S1')).toBe(0);
  });

  it('cùng chi nhánh hai kho: nhận luôn khi lưu; trùng kho thì chặn', async () => {
    const same = await create({ docDate: D(8), fromBranchCode: 'KHO', toBranchCode: 'KHO', lines: [{ lineKey: 'a', sku: 'CK-SUA', qty: 2 }] });
    expect(same.status).toBe(400);
    const r = await create({ docDate: D(8), fromBranchCode: 'KHO', fromWarehouse: 'KT-HH', toBranchCode: 'KHO', toWarehouse: 'KT-KM', lines: [{ lineKey: 'a', sku: 'CK-SUA', qty: 2 }] });
    ok(r);
    expect(r.body.data.status).toBe('received');
    expect(await stock('KHO', 'KT-HH')).toBe(14);
    expect(await stock('KHO', 'KT-KM')).toBe(2);
    expect(await lotStock('KHO', 'KT-KM')).toEqual({ L1: 2 });
  });

  it('danh sách lọc theo chi nhánh, trạng thái chờ nhận, tìm mã hàng', async () => {
    ok(await create({ docDate: D(9), fromBranchCode: 'KHO', toBranchCode: 'SHOP1', lines: [{ lineKey: 'a', sku: 'CK-SUA', qty: 1 }] }));
    const all = (await call<{ data: T[] }>(ctx, 'GET', `/api/v1/kho/transfers?from=${D(1)}&to=${D(31)}&branchCodes=SHOP1`)).body.data;
    expect(all.map((x) => x.status)).toEqual(['shipped', 'cancelled', 'rejected']);
    const pending = (await call<{ data: T[] }>(ctx, 'GET', `/api/v1/kho/transfers?status=pending&search=ck-sua`)).body.data;
    expect(pending).toHaveLength(1);
  });
});
