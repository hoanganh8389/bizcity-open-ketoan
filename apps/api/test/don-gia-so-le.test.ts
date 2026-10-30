/**
 * ĐƠN GIÁ CÓ SỐ LẺ (kế toán yêu cầu 30/10/2026): đơn giá / CK % được có số lẻ (506.018,52), thành tiền và tiền thuế vẫn tròn đồng.
 * Kiểm cả bộ tính (không làm tròn đơn giá trước khi nhân), cảnh báo lệch giá khi giá khai gồm thuế còn phiếu chưa thuế,
 * và qua API: lưu → duyệt → đơn giá giữ nguyên số lẻ, công nợ / bút toán là số đồng tròn; giá mua của NCC lưu được số lẻ.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { checkDoc, computeDoc, type PDoc, type PLine } from '@ketoan/contracts/mua-hang';
import { call, setupTenant, type TestCtx } from './helpers.js';

const line = (k: string, sku: string, qty: number, price: number, o: Partial<PLine> = {}): PLine => ({ lineKey: k, sku, name: sku, unit: 'Lon', qty, price, taxCode: 'V08', lineType: 'buy', ...o });
const doc = (lines: PLine[], o: Partial<PDoc> = {}): PDoc => ({ id: 'd', kind: 'receipt', status: 'draft', docNo: '', docDate: '2026-10-30', branchCode: 'B', partnerCode: 'N1', priceIncludesVat: false, lines, ...o });
const ctx = (price: number, priceIncludesVat: boolean) => ({ policies: [], products: [], priceHistory: () => [], otherDocs: [], prices: [{ partnerCode: 'N1', sku: 'A', unit: 'Lon', price, priceIncludesVat, warnPct: 2, isActive: true }] });

describe('Đơn giá có số lẻ — bộ tính', () => {
  it('72 × 506.018,52: tiền hàng 36.433.333 (tròn đồng từ 36.433.333,44), thuế 8% 2.914.667, phải trả 39.348.000', () => {
    const c = computeDoc(doc([line('a', 'A', 72, 506018.52)]), []);
    expect(c.gross).toBe(36_433_333);
    expect(c.tax).toBe(2_914_667);
    expect(c.payable).toBe(39_348_000);
  });

  it('CK % có số lẻ: 10 × 100.000,5 CK 2,5% → giảm 25.000 (tròn đồng), không mất phần lẻ của đơn giá', () => {
    const c = computeDoc(doc([line('a', 'A', 10, 100000.5, { discountPct: 2.5 })]), []);
    expect(c.gross).toBe(1_000_005);
    expect(c.lineDiscount).toBe(25_000);
    expect(c.beforeTax).toBe(975_005);
  });

  it('Giá khai gồm thuế 546.500, phiếu chưa thuế 506.018,52 (= 546.500 ÷ 1,08): không báo lệch giá; giá cao hơn 3% thì báo', () => {
    const ok = doc([line('a', 'A', 1, 506018.52)]);
    expect(checkDoc(ok, computeDoc(ok, []), ctx(546500, true)).map((x) => x.code)).not.toContain('price_fixed');
    const cao = doc([line('a', 'A', 1, 521200.5)]);
    expect(checkDoc(cao, computeDoc(cao, []), ctx(546500, true)).map((x) => x.code)).toContain('price_fixed');
  });
});

describe('Đơn giá có số lẻ — qua API', () => {
  let t: TestCtx;
  beforeAll(async () => {
    t = await setupTenant();
    const s = await call(t, 'POST', '/api/v1/purchase/demo/seed', { password: 'Thuy!@#' });
    expect(s.status, JSON.stringify(s.body)).toBe(200);
    await call(t, 'PUT', '/api/v1/partners/NCC-LE', { name: 'NCC giá lẻ', kind: 'supplier' });
  }, 60_000);
  afterAll(async () => { await t.app.close(); });

  it('lưu + duyệt phiếu nhập đơn giá 506.018,52: đơn giá giữ số lẻ, tổng / công nợ tròn đồng, bút toán không có số lẻ', async () => {
    const r = await call(t, 'POST', '/api/v1/purchase/documents', {
      kind: 'receipt', outsideOrder: { reason: 'Phép thử: đơn giá có số lẻ' }, docDate: '2026-10-30', branchCode: 'CN-NA', partnerCode: 'NCC-LE', priceIncludesVat: false, orderDiscount: {},
      lines: [{ lineKey: 'a', sku: '110154028', name: 'Anlene Gold 5X hương vani 400g', unit: 'Lon', qty: 72, price: 506018.52, discountPct: 0, taxCode: 'V08', lineType: 'buy', lotNo: 'LE1', expDate: '2028-01-01' }],
    });
    expect(r.status, JSON.stringify(r.body)).toBe(201);
    const ap = await call(t, 'POST', `/api/v1/purchase/documents/${r.body.data.id}/approve`);
    expect(ap.status, JSON.stringify(ap.body)).toBe(200);
    const d = (await call(t, 'GET', `/api/v1/purchase/documents/${r.body.data.id}`)).body.data.doc as { status: string; totals: { beforeTax: number; tax: number; total: number }; lines: { price: number }[]; links: { eventId: string }[] };
    expect(d.status).toBe('approved');
    expect(d.lines[0]!.price).toBe(506018.52);
    expect(d.totals).toMatchObject({ beforeTax: 36_433_333, tax: 2_914_667, total: 39_348_000 });
    const debt = (await call(t, 'GET', '/api/v1/debt-items?partnerCode=NCC-LE&status=all')).body.data as { amount: number }[];
    expect(debt.map((x) => Number(x.amount))).toEqual([39_348_000]);
    const entries = (await call(t, 'GET', `/api/v1/documents/${d.links[0]!.eventId}`)).body.data.entries as { lines: { accountCode: string; debit: number; credit: number }[] }[];
    const lines = entries.flatMap((e) => e.lines);
    expect(lines.length).toBeGreaterThan(0);
    for (const l of lines) expect(Number.isInteger(Number(l.debit)) && Number.isInteger(Number(l.credit)), JSON.stringify(l)).toBe(true);
    expect(lines.filter((l) => l.accountCode === '1561').reduce((s, l) => s + Number(l.debit), 0)).toBe(36_433_333);
  });

  it('giá mua của NCC lưu được số lẻ (4 chữ số): 506.018,5238 đọc lại đúng', async () => {
    const s = await call(t, 'POST', '/api/v1/purchase/supplier-products', { rows: [{ partnerCode: 'NCC-LE', sku: '110154028', unit: 'Lon', price: 506018.5238, priceIncludesVat: false, warnPct: 2, isActive: true }] });
    expect(s.status, JSON.stringify(s.body)).toBe(200);
    const rows = (await call(t, 'GET', '/api/v1/purchase/supplier-products?partnerCode=NCC-LE')).body.data.rows as { sku: string; price: number | string }[];
    expect(Number(rows.find((x) => x.sku === '110154028')!.price)).toBe(506018.5238);
  });
});
