// [2026-11-12 03:30 PM kiennt] NT-KHO-002 — test kiểm kê kho: biên bản → xác minh → quyết định, khoá đúng số của phiếu nghiệm thu
/**
 * NT-KHO-002 — Kiểm kê kho (docs/nghiem-thu/kho/NT-KHO-002-kiem-ke-kho.md).
 * Số liệu: kho KA-1 (CN01) đến 30/11/2026 — HANG01 L01 (HSD 31/03/2027) 80, L02 (31/12/2026) 40; HANG02 M01 (30/06/2027) 50; HANG03 10.
 * Đơn giá bình quân tháng 11: HANG01 10.000, HANG02 5.000. Kiểm: L01 80 (kém phẩm chất 2), L02 38 (HSD thực tế 15/12/2026), M01 53, HANG03 10.
 * Xác minh: HANG01 thiếu 2 → 1 bồi thường (NV-A), 1 tính vào chi phí; HANG02 thừa 3 → thuộc doanh nghiệp. Quyết định QĐ-KK-01 ngày 05/12/2026.
 * Tài khoản chi tiết của hệ thống tài khoản mẫu: 13888 (bồi thường), 6328 (chi phí), 7118 (thu nhập khác).
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { sql } from 'kysely';
import { db } from '../src/db/client.js';
import { call, setupTenant, type TestCtx } from './helpers.js';

let ctx: TestCtx;
let tenantId = '';
type Line = { lineKey: string; sku: string; lotNo: string; expDate?: string; bookQty: number; countedQty?: number; poorQty?: number; lostQty?: number; actualExpDate?: string; diff?: number };
type Count = { id: string; docNo: string; status: string; lines: Line[]; adjustDocKey: string; transferDocKey: string; journalDocKey: string; totals: Record<string, number> };
const ok = <T>(r: { status: number; body: { data: T } }) => { expect(r.status, JSON.stringify(r.body).slice(0, 600)).toBeLessThan(300); return r.body.data; };

/** Dòng sổ còn hiệu lực của chứng từ: "tài khoản[đối tượng] Nợ/Có số tiền". */
async function entries(key: string) {
  const res = await sql<{ account: string; partner: string | null; debit: string; credit: string }>`
    SELECT l.account_code AS account, p.code AS partner, l.debit, l.credit
      FROM accounting_events d JOIN ledger_entries e ON e.event_id = d.id JOIN ledger_lines l ON l.entry_id = e.id LEFT JOIN partners p ON p.id = l.partner_id
     WHERE d.tenant_id = ${tenantId} AND d.doc_key = ${key} AND e.status = 'posted' AND NOT e.is_reversal ORDER BY l.account_code, l.debit DESC`.execute(db);
  return res.rows.map((r) => `${r.account}${r.partner ? `[${r.partner}]` : ''} ${Number(r.debit) ? `Nợ ${Number(r.debit)}` : `Có ${Number(r.credit)}`}`).sort();
}
/** Số dư (Nợ − Có) của tài khoản trên các chứng từ (giá trị chênh lệch kiểm kê lõi ghi ở phiếu giá vốn tháng: cogs:<chi nhánh>:<kỳ>). */
async function balance(account: string, docKeys: string[]) {
  const r = await sql<{ v: string | null }>`
    SELECT sum(l.debit - l.credit)::text AS v FROM accounting_events d JOIN ledger_entries e ON e.event_id = d.id JOIN ledger_lines l ON l.entry_id = e.id
     WHERE d.tenant_id = ${tenantId} AND d.doc_key = ANY(${docKeys}::text[]) AND e.status = 'posted' AND l.account_code = ${account}`.execute(db);
  return Number(r.rows[0]?.v ?? 0);
}
/** Tồn theo thẻ kho đến hết ngày ở chi nhánh CN01 + phân kho. */
async function stock(wh: string, sku: string, lot?: string) {
  const r = await sql<{ q: string | null }>`
    SELECT sum(m.qty)::text AS q FROM inventory_lot_moves m JOIN item_lots l ON l.id = m.lot_id JOIN branches b ON b.id = m.branch_id
     WHERE m.tenant_id = ${tenantId} AND b.code = 'CN01' AND m.warehouse_code = ${wh} AND m.sku = ${sku} ${lot !== undefined ? sql`AND l.lot_no = ${lot}` : sql``}`.execute(db);
  return Number(r.rows[0]?.q ?? 0);
}
const purchase = (key: string, date: string, lines: { sku: string; qty: number; price: number; lotNo?: string; expDate?: string }[]) => ({
  docType: 'purchase', docKey: key, branchCode: 'CN01', docNo: key, docDate: date, partner: { code: 'NCC-KK', name: 'NCC kiểm kê' },
  lines: lines.map((l, i) => ({ lineKey: `l${i + 1}`, sku: l.sku, name: l.sku, unit: 'Hộp', qty: l.qty, warehouseCode: 'KA-1', lotNo: l.lotNo, expDate: l.expDate, amountBeforeTax: l.qty * l.price, taxCode: 'V08', taxAmount: 0 })),
  totals: { beforeTax: lines.reduce((s, l) => s + l.qty * l.price, 0), tax: 0, total: lines.reduce((s, l) => s + l.qty * l.price, 0) },
});
/** Lập biên bản từ số tồn rồi điền số kiểm theo bảng. */
async function draft(counted: Record<string, Partial<Line>>, extra: Record<string, unknown> = {}) {
  const book = ok(await call<{ data: { lines: Line[] } }>(ctx, 'GET', '/api/v1/kho/kiem-ke/so-ton?branchCode=CN01&warehouse=KA-1&date=2026-11-30'));
  const lines = book.lines.map((l) => ({ ...l, countedQty: l.bookQty, ...(counted[`${l.sku}/${l.lotNo}`] ?? {}) }));
  return ok(await call<{ data: Count }>(ctx, 'POST', '/api/v1/kho/kiem-ke', { countDate: '2026-11-30', branchCode: 'CN01', warehouseCode: 'KA-1', quarantineWarehouse: 'KA-CL', purpose: 'Kiểm kê cuối tháng 11', members: [{ name: 'Thủ kho A', title: 'Thủ kho', represent: 'Kho' }], lines, ...extra }));
}
const MAIN = { 'HANG01/L01': { countedQty: 80, poorQty: 2 }, 'HANG01/L02': { countedQty: 38, actualExpDate: '2026-12-15' }, 'HANG02/M01': { countedQty: 53 } };

beforeAll(async () => {
  ctx = await setupTenant();
  tenantId = (await db.selectFrom('tenants').select('id').where('code', '=', ctx.tenantCode).executeTakeFirstOrThrow()).id;
  for (const w of [{ code: 'KA-1', branchCode: 'CN01', name: 'Kho hàng', isDefault: true }, { code: 'KA-CL', branchCode: 'CN01', name: 'Kho cách ly' }]) ok(await call(ctx, 'POST', '/api/v1/warehouses', w));
  const put = (code: string, b: Record<string, unknown>) => call(ctx, 'PUT', `/api/v1/posting/reasons/${code}`, b);
  ok(await put('KKBT', { name: 'Thiếu kiểm kê — cá nhân bồi thường', kind: 'journal', debitAccount: '13888', creditAccount: '1381' }));
  ok(await put('KKCP', { name: 'Thiếu kiểm kê — tính vào chi phí', kind: 'journal', debitAccount: '6328', creditAccount: '1381' }));
  ok(await put('KKTN', { name: 'Thừa kiểm kê — thuộc doanh nghiệp', kind: 'journal', debitAccount: '3381', creditAccount: '7118' }));
  expect((await call(ctx, 'POST', '/api/v1/partners', { code: 'NV-A', name: 'Nguyễn Văn A', kind: 'customer' })).status).toBeLessThan(300);
  ok(await call(ctx, 'POST', '/api/v1/documents', purchase('NK-KK1', '2026-11-02', [
    { sku: 'HANG01', qty: 80, price: 10000, lotNo: 'L01', expDate: '2027-03-31' }, { sku: 'HANG01', qty: 40, price: 10000, lotNo: 'L02', expDate: '2026-12-31' },
    { sku: 'HANG02', qty: 50, price: 5000, lotNo: 'M01', expDate: '2027-06-30' }, { sku: 'HANG03', qty: 10, price: 20000 },
  ])));
});
afterAll(async () => { await ctx.app.close(); });

describe('NT-KHO-002 — kiểm kê kho', () => {
  let c: Count;

  it('Lấy số tồn: theo mặt hàng × lô / HSD, đúng số theo sổ', async () => {
    const book = ok(await call<{ data: { warehouse: string; lines: Line[] } }>(ctx, 'GET', '/api/v1/kho/kiem-ke/so-ton?branchCode=CN01&warehouse=KA-1&date=2026-11-30'));
    expect(book.warehouse).toBe('KA-1');
    expect(book.lines.map((l) => [l.sku, l.lotNo, l.expDate ?? null, l.bookQty])).toEqual([
      ['HANG01', 'L02', '2026-12-31', 40], ['HANG01', 'L01', '2027-03-31', 80], ['HANG02', 'M01', '2027-06-30', 50], ['HANG03', '', null, 10],
    ]);
  });

  it('Biên bản: chênh lệch theo lô, dòng tổng; số kiểm âm bị chặn; nháp chưa đụng sổ', async () => {
    const bad = await call(ctx, 'POST', '/api/v1/kho/kiem-ke', { countDate: '2026-11-30', branchCode: 'CN01', warehouseCode: 'KA-1', lines: [{ lineKey: 'x', sku: 'HANG03', bookQty: 10, countedQty: -1 }] });
    expect(bad.status).toBe(400);
    c = await draft(MAIN);
    expect(c.status).toBe('draft');
    expect(c.docNo).toMatch(/^KK26\d{5}$/);
    expect(Object.fromEntries(c.lines.map((l) => [`${l.sku}/${l.lotNo}`, l.diff]))).toEqual({ 'HANG01/L02': -2, 'HANG01/L01': 0, 'HANG02/M01': 3, 'HANG03/': 0 });
    expect(c.totals).toMatchObject({ bookQty: 180, countedQty: 181, diff: 1 });
    expect(await stock('KA-1', 'HANG01')).toBe(120);
  });

  it('Ghi nhận chênh lệch: một phiếu điều chỉnh mixed (L02 −2, M01 +3) + một phiếu chuyển L01 × 2 sang kho cách ly', async () => {
    c = ok(await call<{ data: Count }>(ctx, 'POST', `/api/v1/kho/kiem-ke/${c.id}/ghi-nhan`, {}));
    expect(c.status).toBe('recorded');
    expect(c.adjustDocKey).toBe(`erp:kk:${c.id}:dc`);
    expect(c.transferDocKey).toBe(`erp:kk:${c.id}:cl`);
    const adj = await sql<{ payload: { direction: string; lines: { sku: string; qty: number; lotNo?: string }[] } }>`SELECT payload FROM accounting_events WHERE tenant_id = ${tenantId} AND doc_key = ${c.adjustDocKey}`.execute(db);
    expect(adj.rows[0]!.payload.direction).toBe('mixed');
    expect(adj.rows[0]!.payload.lines.map((l) => [l.sku, l.lotNo, l.qty])).toEqual([['HANG01', 'L02', -2], ['HANG02', 'M01', 3]]);
    // ACC83 / KHO05: KA-1 HANG01 = 116 (L01 78, L02 38), HANG02 = 53, HANG03 = 10; KA-CL HANG01 L01 = 2
    expect(await stock('KA-1', 'HANG01')).toBe(116);
    expect(await stock('KA-1', 'HANG01', 'L01')).toBe(78);
    expect(await stock('KA-1', 'HANG01', 'L02')).toBe(38);
    expect(await stock('KA-1', 'HANG02')).toBe(53);
    expect(await stock('KA-1', 'HANG03')).toBe(10);
    expect(await stock('KA-CL', 'HANG01', 'L01')).toBe(2);
    expect(await entries(c.transferDocKey)).toEqual([]); // chuyển kho cùng chi nhánh: không bút toán
  });

  it('Sửa biên bản đã ghi nhận bị chặn; quyết định trước xác minh bị chặn', async () => {
    expect((await call(ctx, 'PUT', `/api/v1/kho/kiem-ke/${c.id}`, { countDate: '2026-11-30', branchCode: 'CN01', warehouseCode: 'KA-1', lines: [] })).status).toBe(409);
    expect((await call(ctx, 'POST', `/api/v1/kho/kiem-ke/${c.id}/quyet-dinh`, { decisionNo: 'QĐ-X', decisionDate: '2026-12-05' })).status).toBe(409);
  });

  it('Tính giá vốn tháng 11: bút toán bước 1 (phiếu giá vốn tháng) — Nợ 1381[CN-CN01] 20.000 / Có 156; Nợ 156 / Có 3381[CN-CN01] 15.000', async () => {
    ok(await call(ctx, 'POST', '/api/v1/inventory/costing', { period: '2026-11' }));
    expect(await entries('cogs:CN01:2026-11')).toEqual(expect.arrayContaining(['1381[CN-CN01] Nợ 20000', '3381[CN-CN01] Có 15000']));
    expect(await balance('1381', ['cogs:CN01:2026-11'])).toBe(20000);
    expect(await balance('3381', ['cogs:CN01:2026-11'])).toBe(-15000);
  });

  it('Xác minh: tổng nguyên nhân ≠ chênh lệch bị chặn; nguyên nhân sai hướng bị chặn; đúng thì Đã xác minh', async () => {
    const lk = (sku: string, lot: string) => c.lines.find((l) => l.sku === sku && l.lotNo === lot)!.lineKey;
    const lack = lk('HANG01', 'L02');
    const sur = lk('HANG02', 'M01');
    expect((await call(ctx, 'POST', `/api/v1/kho/kiem-ke/${c.id}/xac-minh`, { causes: [{ lineKey: lack, cause: 'compensate', qty: 1, partnerCode: 'NV-A' }, { lineKey: sur, cause: 'owned', qty: 3 }] })).status).toBe(400);
    expect((await call(ctx, 'POST', `/api/v1/kho/kiem-ke/${c.id}/xac-minh`, { causes: [{ lineKey: lack, cause: 'owned', qty: 2 }, { lineKey: sur, cause: 'owned', qty: 3 }] })).status).toBe(400);
    c = ok(await call<{ data: Count }>(ctx, 'POST', `/api/v1/kho/kiem-ke/${c.id}/xac-minh`, {
      causes: [{ lineKey: lack, cause: 'compensate', qty: 1, partnerCode: 'NV-A', note: 'làm vỡ' }, { lineKey: lack, cause: 'expense', qty: 1 }, { lineKey: sur, cause: 'owned', qty: 3 }],
      note: 'Đã xác minh với thủ kho',
    }));
    expect(c.status).toBe('verified');
  });

  it('Quyết định QĐ-KK-01: một phiếu kế toán 3 dòng — 13888[NV-A] / 1381 10.000; 6328 / 1381 10.000; 3381 / 7118 15.000; 1381, 3381 về 0', async () => {
    expect((await call(ctx, 'POST', `/api/v1/kho/kiem-ke/${c.id}/quyet-dinh`, { decisionNo: 'QĐ-KK-01', decisionDate: '2026-12-05', reasons: { compensate: 'KKBT' } })).status).toBe(400);
    c = ok(await call<{ data: Count }>(ctx, 'POST', `/api/v1/kho/kiem-ke/${c.id}/quyet-dinh`, { decisionNo: 'QĐ-KK-01', decisionDate: '2026-12-05', signer: 'Giám đốc', reasons: { compensate: 'KKBT', expense: 'KKCP', owned: 'KKTN' } }));
    expect(c.status).toBe('settled');
    expect(c.journalDocKey).toBe(`erp:kk:${c.id}:qd`);
    expect(await entries(c.journalDocKey)).toEqual(['13888[NV-A] Nợ 10000', '1381[NV-A] Có 10000', '1381[CN-CN01] Có 10000', '3381[CN-CN01] Nợ 15000', '6328[CN-CN01] Nợ 10000', '7118[CN-CN01] Có 15000'].sort());
    expect(await balance('1381', ['cogs:CN01:2026-11', c.journalDocKey])).toBe(0);
    expect(await balance('3381', ['cogs:CN01:2026-11', c.journalDocKey])).toBe(0);
  });

  it('Bỏ ghi nhận khi đã có quyết định bị chặn; huỷ quyết định rồi bỏ ghi nhận → chứng từ đảo, tồn trở lại', async () => {
    expect((await call(ctx, 'POST', `/api/v1/kho/kiem-ke/${c.id}/bo-ghi-nhan`, { reason: 'Thử' })).status).toBe(409);
    c = ok(await call<{ data: Count }>(ctx, 'POST', `/api/v1/kho/kiem-ke/${c.id}/huy-quyet-dinh`, { reason: 'Quyết định ghi nhầm' }));
    expect(c.status).toBe('verified');
    expect(await entries(`erp:kk:${c.id}:qd`)).toEqual([]);
    c = ok(await call<{ data: Count }>(ctx, 'POST', `/api/v1/kho/kiem-ke/${c.id}/bo-ghi-nhan`, { reason: 'Đếm lại' }));
    expect(c.status).toBe('draft');
    expect(await stock('KA-1', 'HANG01')).toBe(120);
    expect(await stock('KA-CL', 'HANG01')).toBe(0);
  });
});

describe('NT-KHO-002 — trường hợp lệch chuẩn', () => {
  it('Không chênh lệch, không hàng kém phẩm chất → không sinh chứng từ, biên bản Đã xử lý', async () => {
    const c = await draft({});
    const r = ok(await call<{ data: Count & { message?: string } }>(ctx, 'POST', `/api/v1/kho/kiem-ke/${c.id}/ghi-nhan`, {}));
    expect(r.status).toBe('settled');
    expect(r.adjustDocKey).toBe('');
    expect(r.message).toBe('Không có chênh lệch');
  });

  it('Có hàng kém phẩm chất mà chưa chọn kho cách ly → không cho ghi nhận', async () => {
    const c = await draft({ 'HANG03/': { countedQty: 10, poorQty: 1 } }, { quarantineWarehouse: '' });
    expect((await call(ctx, 'POST', `/api/v1/kho/kiem-ke/${c.id}/ghi-nhan`, {})).status).toBe(400);
  });

  it('Thừa do ghi thiếu phiếu nhập: không ghi 711, đảo phần thừa trong phiếu điều chỉnh (tồn không tăng hai lần)', async () => {
    const c0 = await draft({ 'HANG03/': { countedQty: 12 } });
    let c = ok(await call<{ data: Count }>(ctx, 'POST', `/api/v1/kho/kiem-ke/${c0.id}/ghi-nhan`, {}));
    const lk = c.lines.find((l) => l.sku === 'HANG03')!.lineKey;
    expect((await call(ctx, 'POST', `/api/v1/kho/kiem-ke/${c.id}/quyet-dinh`, { decisionNo: 'QĐ-KK-02', decisionDate: '2026-12-06', causes: [{ lineKey: lk, cause: 'missing_receipt', qty: 2 }] })).status).toBe(409);
    c = ok(await call<{ data: Count }>(ctx, 'POST', `/api/v1/kho/kiem-ke/${c.id}/xac-minh`, { causes: [{ lineKey: lk, cause: 'missing_receipt', qty: 2, receiptDocNo: 'NK-BOSUNG-01' }] }));
    expect(await stock('KA-1', 'HANG03')).toBe(12);
    c = ok(await call<{ data: Count }>(ctx, 'POST', `/api/v1/kho/kiem-ke/${c.id}/quyet-dinh`, { decisionNo: 'QĐ-KK-02', decisionDate: '2026-12-06' }));
    expect(c.status).toBe('settled');
    expect(c.journalDocKey).toBe('');
    expect(await stock('KA-1', 'HANG03')).toBe(10);
    expect(await entries(`erp:kk:${c.id}:qd`)).toEqual([]);
  });

  it('Quyết định khi tháng chưa tính giá vốn → báo tính giá vốn trước', async () => {
    const book = ok(await call<{ data: { lines: Line[] } }>(ctx, 'GET', '/api/v1/kho/kiem-ke/so-ton?branchCode=CN01&warehouse=KA-1&date=2026-12-31'));
    const lines = book.lines.map((l) => ({ ...l, countedQty: l.sku === 'HANG03' ? l.bookQty - 1 : l.bookQty }));
    let c = ok(await call<{ data: Count }>(ctx, 'POST', '/api/v1/kho/kiem-ke', { countDate: '2026-12-31', branchCode: 'CN01', warehouseCode: 'KA-1', lines }));
    c = ok(await call<{ data: Count }>(ctx, 'POST', `/api/v1/kho/kiem-ke/${c.id}/ghi-nhan`, {}));
    const lk = c.lines.find((l) => l.sku === 'HANG03')!.lineKey;
    ok(await call(ctx, 'POST', `/api/v1/kho/kiem-ke/${c.id}/xac-minh`, { causes: [{ lineKey: lk, cause: 'expense', qty: 1 }] }));
    const r = await call<{ error: { message: string } }>(ctx, 'POST', `/api/v1/kho/kiem-ke/${c.id}/quyet-dinh`, { decisionNo: 'QĐ-KK-03', decisionDate: '2027-01-05', reasons: { expense: 'KKCP' } });
    expect(r.status).toBe(409);
    expect(JSON.stringify(r.body)).toMatch(/Tính giá vốn tháng 12\/2026 trước/);
  });
});
