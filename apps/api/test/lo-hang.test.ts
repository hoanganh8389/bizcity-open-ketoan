// [2026-11-10 06:30 PM Nguyễn Văn Thủy] PHASE-026 — lô hàng: lô theo số lô + hạn dùng NCC, tên lúc mua, hạn sớm xuất trước, trả về đúng lô, chuyển kho theo lô (đóng góp)
/**
 * Lô hàng (0098) trên chứng từ thật:
 *   - nhập 2 lô (số lô + hạn dùng của NCC) → 2 lô, giữ tên lúc mua; nhập thêm cùng lô với tên khác → ghi names_seen, tên lô giữ nguyên;
 *   - bán không ghi lô → tự lấy lô hạn sớm trước, thiếu thì lấn sang lô kế; quá tồn thì phần thiếu vào lô không số;
 *   - khách trả hàng (có phiếu gốc) → về đúng lô đã bán;
 *   - chuyển kho → bên nhận nhận đúng lô bên xuất;
 *   - đổi tên danh mục → lô vẫn giữ tên lúc mua; một dòng lấy từ 2 lô vẫn là MỘT dòng (hoá đơn theo bill), tra được 2 tên lô;
 *   - sửa phiếu (phiên bản mới) → phân lô ghi lại; phân lô lại theo thứ tự ngày.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { sql } from 'kysely';
import { db } from '../src/db/client.js';
import { call, setupTenant, type TestCtx } from './helpers.js';

let ctx: TestCtx;
let tenantId = '';
const D = (n: number) => new Date(Date.UTC(2026, 9, n)).toISOString().slice(0, 10); // tháng 10/2026
const ok = (r: { status: number; body: unknown }) => expect([200, 201], JSON.stringify(r.body)).toContain(r.status);

const purchase = (docKey: string, date: string, lines: Record<string, unknown>[]) => call(ctx, 'POST', '/api/v1/documents', {
  docType: 'purchase', docKey, branchCode: 'CN01', docNo: docKey, docDate: date, partner: { code: 'NCC-LO', name: 'NCC lô' },
  lines: lines.map((l, i) => ({ lineKey: `l${i + 1}`, unit: 'Hộp', taxCode: 'V08', taxAmount: 0, amountBeforeTax: Number(l.qty) * 100000, ...l })),
  totals: { beforeTax: lines.reduce((a, l) => a + Number(l.qty) * 100000, 0), tax: 0, total: lines.reduce((a, l) => a + Number(l.qty) * 100000, 0) },
});
const sale = (docKey: string, date: string, lines: Record<string, unknown>[], extra: Record<string, unknown> = {}) => call(ctx, 'POST', '/api/v1/documents', {
  docType: 'sale', docKey, branchCode: 'CN01', docNo: docKey, docDate: date,
  lines: lines.map((l, i) => ({ lineKey: `l${i + 1}`, name: 'Sữa lô', unit: 'Hộp', taxCode: 'R08', taxAmount: 0, amountBeforeTax: Number(l.qty) * 150000, ...l })),
  payments: [], totals: { beforeTax: lines.reduce((a, l) => a + Number(l.qty) * 150000, 0), tax: 0, total: lines.reduce((a, l) => a + Number(l.qty) * 150000, 0) }, ...extra,
});
type Lot = { id: string; lotNo: string; expDate: string | null; purchaseName: string; namesSeen: { name: string }[]; stock: number; branches: { code: string; qty: number }[] };
const lots = async (q = 'LO-SUA') => (await call<{ data: Lot[] }>(ctx, 'GET', `/api/v1/lots?search=${q}`)).body.data;
const byNo = (ls: Lot[], no: string) => ls.find((l) => l.lotNo === no)!;

beforeAll(async () => {
  ctx = await setupTenant();
  tenantId = (await db.selectFrom('tenants').select('id').where('code', '=', ctx.tenantCode).executeTakeFirstOrThrow()).id;
  await call(ctx, 'POST', '/api/v1/branches', { code: 'CN02', name: 'Cửa hàng 02' });
});
afterAll(async () => { await ctx.app.close(); });

describe('Lô hàng xuyên suốt', () => {
  it('nhập 2 lô: lô theo số lô + hạn dùng, giữ tên lúc mua; nhập thêm cùng lô tên khác → tên lô giữ nguyên, ghi tên đã gặp', async () => {
    ok(await purchase('NM-LO1', D(1), [
      { sku: 'LO-SUA', name: 'Sữa Lô 900g (tên NCC A)', qty: 10, lotNo: 'A01', expDate: '2027-01-31' },
      { sku: 'LO-SUA', name: 'Sua Lo 900g', qty: 10, lotNo: 'B02', expDate: '2026-12-31' },
    ]));
    ok(await purchase('NM-LO2', D(2), [{ sku: 'LO-SUA', name: 'Sữa lô 900G - gõ khác', qty: 5, lotNo: 'A01', expDate: '2027-01-31' }]));
    const ls = await lots();
    expect(ls).toHaveLength(2);
    expect(byNo(ls, 'A01')).toMatchObject({ purchaseName: 'Sữa Lô 900g (tên NCC A)', stock: 15 });
    expect(byNo(ls, 'A01').namesSeen.map((x) => x.name)).toEqual(['Sữa lô 900G - gõ khác']);
    expect(byNo(ls, 'B02')).toMatchObject({ purchaseName: 'Sua Lo 900g', stock: 10 });
  });

  it('bán không ghi lô: tự lấy lô hạn sớm trước (B02 hết hạn 31/12), thiếu thì lấn sang lô kế', async () => {
    ok(await sale('BL-LO1', D(5), [{ sku: 'LO-SUA', qty: 12 }]));
    const ls = await lots();
    expect(byNo(ls, 'B02').stock).toBe(0);
    expect(byNo(ls, 'A01').stock).toBe(13);
    // Một dòng bán lấy từ 2 lô: vẫn một dòng (hoá đơn theo bill), tra được lô và tên lúc mua của từng lô.
    const d = (await call<{ data: { lines: { lots: { lotNo: string; qty: number }[]; lotNames: string[] }[] } }>(ctx, 'GET', '/api/v1/lots/document?docKey=BL-LO1')).body.data;
    expect(d.lines).toHaveLength(1);
    expect(d.lines[0]!.lots.map((x) => [x.lotNo, x.qty])).toEqual([['B02', 10], ['A01', 2]]);
    expect(d.lines[0]!.lotNames).toEqual(['Sua Lo 900g', 'Sữa Lô 900g (tên NCC A)']);
  });

  it('khách trả hàng có phiếu gốc → về đúng lô đã bán', async () => {
    ok(await call(ctx, 'POST', '/api/v1/documents', {
      docType: 'sale_return', docKey: 'TL-LO1', originalDocKey: 'BL-LO1', branchCode: 'CN01', docNo: 'TL-LO1', docDate: D(6),
      lines: [{ lineKey: 'l1', sku: 'LO-SUA', name: 'Sữa lô', unit: 'Hộp', qty: 3, amountBeforeTax: 450000, taxCode: 'R08', taxAmount: 0 }],
      payments: [], totals: { beforeTax: 450000, tax: 0, total: 450000 },
    }));
    const ls = await lots();
    // Phiếu gốc lấy 10 ở B02 trước rồi 2 ở A01 → trả 3 về B02 (lô xuất đầu).
    expect(byNo(ls, 'B02').stock).toBe(3);
    expect(byNo(ls, 'A01').stock).toBe(13);
    const how = (await sql<{ how: string }>`SELECT DISTINCT how FROM inventory_lot_moves m JOIN accounting_events e ON e.id = m.event_id WHERE e.tenant_id = ${tenantId} AND e.doc_key = 'TL-LO1'`.execute(db)).rows.map((r) => r.how);
    expect(how).toEqual(['return']);
  });

  it('chuyển kho: bên nhận nhận đúng lô bên xuất', async () => {
    ok(await call(ctx, 'POST', '/api/v1/documents', {
      docType: 'transfer', docKey: 'CK-LO1', branchCode: 'CN01', toBranchCode: 'CN02', docNo: 'CK-LO1', docDate: D(7), status: 'received',
      lines: [{ lineKey: 'l1', sku: 'LO-SUA', qty: 5, amount: 0 }], totals: { total: 0 },
    }));
    const ls = await lots();
    const b02 = byNo(ls, 'B02');
    const a01 = byNo(ls, 'A01');
    expect(b02.stock + a01.stock).toBe(16); // tổng công ty không đổi
    expect(b02.branches.find((b) => b.code === 'CN02')?.qty).toBe(3);
    expect(a01.branches.find((b) => b.code === 'CN02')?.qty).toBe(2);
    expect(b02.branches.find((b) => b.code === 'CN01')).toBeUndefined();
  });

  it('bán quá tồn lô: phần thiếu vào lô không số, tồn theo lô vẫn khớp tồn kho', async () => {
    ok(await sale('BL-LO2', D(8), [{ sku: 'LO-SUA', qty: 20 }]));
    const ls = await lots();
    const noLot = ls.find((l) => l.lotNo === '' && !l.expDate)!;
    expect(noLot.stock).toBe(-9); // CN01 còn 11 (A01) → thiếu 9
    const stock = (await sql<{ q: string }>`SELECT sum(qty)::text AS q FROM inventory_movements WHERE tenant_id = ${tenantId} AND sku = 'LO-SUA'`.execute(db)).rows[0]!.q;
    expect(ls.reduce((a, l) => a + l.stock, 0)).toBe(Number(stock));
  });

  it('sửa phiếu (phiên bản mới) → phân lô ghi lại; phân lô lại theo ngày ra cùng kết quả', async () => {
    ok(await sale('BL-LO2', D(8), [{ sku: 'LO-SUA', qty: 4 }], { version: 2 }));
    let ls = await lots();
    expect(ls.find((l) => l.lotNo === '' && !l.expDate)?.stock ?? 0).toBe(0);
    expect(byNo(ls, 'A01').branches.find((b) => b.code === 'CN01')?.qty).toBe(7);
    const before = ls.map((l) => [l.lotNo, l.stock]);
    expect((await call(ctx, 'POST', '/api/v1/lots/rebuild', {})).status).toBe(200);
    ls = await lots();
    expect(ls.map((l) => [l.lotNo, l.stock])).toEqual(before);
  });

  it('đổi tên danh mục: lô vẫn giữ tên lúc mua', async () => {
    await sql`UPDATE products SET name = 'Sữa Lô 900g — tên mới' WHERE tenant_id = ${tenantId} AND sku = 'LO-SUA'`.execute(db);
    ok(await sale('BL-LO3', D(9), [{ sku: 'LO-SUA', qty: 1 }]));
    const d = (await call<{ data: { lines: { lotNames: string[] }[] } }>(ctx, 'GET', '/api/v1/lots/document?docKey=BL-LO3')).body.data;
    expect(d.lines[0]!.lotNames).toEqual(['Sữa Lô 900g (tên NCC A)']);
    const l = byNo(await lots(), 'A01') as Lot & { name: string; nameChanged: boolean };
    expect(l.nameChanged).toBe(true);
  });

  it('gợi ý lô khi lập phiếu xuất: hạn sớm trước, thiếu thì báo shortage; chuyển kho hai phiếu một đầu ghi lô → bên nhận đúng lô', async () => {
    const r = await call<{ data: { sku: string; lots: { lotNo: string; take: number; available: number; purchaseName: string }[]; shortage: number }[] }>(ctx, 'GET', '/api/v1/lots/suggest?branchCode=CN01&items=LO-SUA*5');
    expect(r.status, JSON.stringify(r.body)).toBe(200);
    const s0 = r.body.data[0]!;
    const cn01 = byNo(await lots(), 'A01').branches.find((b) => b.code === 'CN01')!.qty;
    expect(s0.lots[0]).toMatchObject({ lotNo: 'A01', purchaseName: 'Sữa Lô 900g (tên NCC A)', take: Math.min(5, cn01) });
    expect(s0.shortage).toBe(Math.max(0, 5 - cn01));
    // Phiếu xuất / nhận riêng (như chuyển kho global của WordPress), dòng ghi lô gợi ý.
    const leg = (key: string, legName: 'out' | 'in', branch: string) => call(ctx, 'POST', '/api/v1/documents', {
      docType: 'transfer', leg: legName, docKey: key, branchCode: branch, docNo: 'GT-1', docDate: D(11), status: 'received',
      lines: [{ lineKey: 'l1', sku: 'LO-SUA', qty: 2, amount: 0, lotNo: 'A01', expDate: '2027-01-31' }], totals: { total: 0 },
    });
    ok(await leg('GT-OUT', 'out', 'CN01'));
    ok(await leg('GT-IN', 'in', 'CN02'));
    const how = (await sql<{ doc_key: string; how: string }>`SELECT e.doc_key, m.how FROM inventory_lot_moves m JOIN accounting_events e ON e.id = m.event_id
      WHERE e.tenant_id = ${tenantId} AND e.doc_key IN ('GT-OUT', 'GT-IN') ORDER BY 1`.execute(db)).rows;
    expect(how).toEqual([{ doc_key: 'GT-IN', how: 'line' }, { doc_key: 'GT-OUT', how: 'line' }]);
    expect(byNo(await lots(), 'A01').branches.find((b) => b.code === 'CN02')?.qty).toBe(4);
  });

  it('dòng ghi đúng số lô thì lấy lô đó (không tự chọn)', async () => {
    ok(await sale('BL-LO4', D(10), [{ sku: 'LO-SUA', qty: 1, lotNo: 'A01', expDate: '2027-01-31' }]));
    const how = (await sql<{ how: string }>`SELECT how FROM inventory_lot_moves m JOIN accounting_events e ON e.id = m.event_id WHERE e.tenant_id = ${tenantId} AND e.doc_key = 'BL-LO4'`.execute(db)).rows.map((r) => r.how);
    expect(how).toEqual(['line']);
  });

  it('lô theo từng phân kho: hàng ở kho phụ không bị tự lấy cho dòng kho khác; dòng không ghi kho = kho mặc định; danh sách tách từng kho', async () => {
    await call(ctx, 'POST', '/api/v1/branches', { code: 'CN03', name: 'Cửa hàng 03' });
    for (const w of [{ code: 'K3-HH', branchCode: 'CN03', name: 'Kho hàng', isDefault: true }, { code: 'K3-PB', branchCode: 'CN03', name: 'Kho phân bổ' }]) {
      const r = await call(ctx, 'POST', '/api/v1/warehouses', w);
      expect(r.status, JSON.stringify(r.body)).toBe(201);
    }
    const doc = (docType: string, docKey: string, lines: Record<string, unknown>[]) => call(ctx, 'POST', '/api/v1/documents', {
      docType, docKey, branchCode: 'CN03', docNo: docKey, docDate: D(20), ...(docType === 'purchase' ? { partner: { code: 'NCC-LO', name: 'NCC lô' } } : { payments: [] }),
      lines: lines.map((l, i) => ({ lineKey: `l${i + 1}`, name: 'Sữa kho lô', unit: 'Hộp', taxCode: docType === 'purchase' ? 'V08' : 'R08', taxAmount: 0, amountBeforeTax: Number(l.qty) * 100000, ...l })),
      totals: { beforeTax: lines.reduce((a, l) => a + Number(l.qty) * 100000, 0), tax: 0, total: lines.reduce((a, l) => a + Number(l.qty) * 100000, 0) },
    });
    ok(await doc('purchase', 'NM-KHO-PB', [{ sku: 'LO-KHO', qty: 5, lotNo: 'P01', expDate: '2026-12-01', warehouseCode: 'K3-PB' }]));
    ok(await doc('purchase', 'NM-KHO-HH', [{ sku: 'LO-KHO', qty: 5, lotNo: 'H01', expDate: '2027-06-01' }])); // không ghi kho → K3-HH
    ok(await doc('sale', 'BL-KHO', [{ sku: 'LO-KHO', qty: 2 }])); // không ghi kho → K3-HH: lấy H01 dù P01 hạn sớm hơn (P01 ở kho khác)
    const picked = (await sql<{ lot_no: string; warehouse_code: string; how: string }>`SELECT l.lot_no, m.warehouse_code, m.how FROM inventory_lot_moves m JOIN item_lots l ON l.id = m.lot_id
      JOIN accounting_events e ON e.id = m.event_id WHERE e.tenant_id = ${tenantId} AND e.doc_key = 'BL-KHO'`.execute(db)).rows;
    expect(picked).toEqual([{ lot_no: 'H01', warehouse_code: 'K3-HH', how: 'fifo' }]);
    type Row = { lotNo: string; branch: string; warehouse: string; stock: number };
    const rows = (await call<{ data: Row[] }>(ctx, 'GET', '/api/v1/lots?search=LO-KHO&split=1&branchCodes=CN03')).body.data;
    expect(rows.map((r) => [r.lotNo, r.warehouse, r.stock])).toEqual([['P01', 'K3-PB', 5], ['H01', 'K3-HH', 3]]);
    const onlyPb = (await call<{ data: Row[] }>(ctx, 'GET', '/api/v1/lots?search=LO-KHO&split=1&warehouses=K3-PB')).body.data;
    expect(onlyPb.map((r) => r.lotNo)).toEqual(['P01']);
    // Gợi ý lô: kho trống = kho mặc định; không truyền kho = mọi kho, mỗi lô kèm kho đang giữ.
    const sug = async (wh?: string) => (await call<{ data: { lots: { lotNo: string; warehouse: string }[] }[] }>(ctx, 'GET', `/api/v1/lots/suggest?branchCode=CN03&items=LO-KHO*1${wh !== undefined ? `&warehouse=${wh}` : ''}`)).body.data[0]!.lots;
    expect((await sug('')).map((x) => [x.lotNo, x.warehouse])).toEqual([['H01', 'K3-HH']]);
    expect((await sug()).map((x) => [x.lotNo, x.warehouse])).toEqual([['P01', 'K3-PB'], ['H01', 'K3-HH']]);
    // Danh sách phiếu theo lô: lọc theo kho, có nơi.
    const docs = (await call<{ data: { docNo: string; places: string[] }[] }>(ctx, 'GET', '/api/v1/lots/documents?warehouses=K3-PB')).body.data;
    expect(docs.map((d) => [d.docNo, d.places])).toEqual([['NM-KHO-PB', ['CN03 · K3-PB']]]);
  });
});
