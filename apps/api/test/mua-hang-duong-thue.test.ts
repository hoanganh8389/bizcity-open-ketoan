// [2026-11-10 10:30 AM Nguyễn Văn Thủy] PHASE-026 — kịch bản test đường thuế theo mã ở mua hàng (đóng góp)
/**
 * Mỗi mã đi trọn một đường thuế (docs/nghiep-vu/14-ma-so-bien-the-xuyen-suot.md, Quy tắc thuế theo mã).
 * Kịch bản bám mô tả 25 trường hợp mua hàng:
 *   TH2  nhận quà ngoài hợp đồng, không hoá đơn       → chỉ mã không gửi thuế; mã chính bị chặn, chỉ sang mã quà cùng họ
 *   TH1  nhập mua có hoá đơn                            → chỉ mã gửi thuế; mã không gửi thuế bị chặn
 *   TH12 KM người bán chia giá trên hoá đơn            → mã gửi thuế, không nhắc
 *   TH12 KM người tiêu dùng trên hoá đơn                → nhắc (chờ kế toán chốt cách ghi sổ thuế quà có hoá đơn)
 *   TH20 quà tự mua không VAT / có VAT                  → không VAT: chỉ mã không gửi thuế; có VAT: không chặn
 *   Xuất quà                                            → mã không gửi thuế: không nhắc; mã gửi thuế: nhắc
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { call, setupTenant, type TestCtx } from './helpers.js';

interface Check { level: string; code: string; text: string; blocking?: boolean }
let t: TestCtx;
const PARENT = '170530001';
let GIFT = '';
const NCC = 'NCC-DT01';
const analyze = async (body: Record<string, unknown>) => {
  const r = await call(t, 'POST', '/api/v1/purchase/analyze', body);
  expect(r.status, JSON.stringify(r.body)).toBe(200);
  return r.body.data.checks as Check[];
};
const line = (sku: string, qty: number, price: number, o: Record<string, unknown> = {}) =>
  ({ lineKey: `l${Math.random().toString(36).slice(2, 8)}`, sku, name: sku, unit: 'Lon', qty, price, taxCode: 'V08', lineType: price > 0 ? 'buy' : 'gift_consumer', ...o });
const base = { docDate: '2026-10-03', branchCode: 'CN01', partnerCode: NCC, priceIncludesVat: false, orderDiscount: {} };
const codes = (cs: Check[]) => cs.map((c) => c.code);
const ack = { warnAck: { reason: 'kịch bản đường thuế', codes: ['ITEM-HINT-001', 'ITEM-HINT-003'] } };

beforeAll(async () => {
  t = await setupTenant();
  await call(t, 'PUT', `/api/v1/partners/${NCC}`, { name: 'NCC thử đường thuế', kind: 'supplier' });
  const p = await call(t, 'PUT', `/api/v1/catalog/products/${PARENT}?new=1`, { name: 'Anlene Gold thử', unit: 'Lon', taxInCode: 'V08', taxOutCode: 'R08', units: [{ unit: 'Lon', ratio: 1, isDefault: true, isPurchaseDefault: true }], ...ack });
  expect(p.status, JSON.stringify(p.body)).toBe(200);
}, 60_000);
afterAll(async () => { await t.app.close(); });

describe('Đường thuế theo mã — mua hàng', () => {
  it('TH2 quà ngoài hợp đồng không hoá đơn vào mã chính: chặn; chưa có mã quà thì báo khai báo danh mục', async () => {
    const cs = await analyze({ ...base, kind: 'gift_in', gift: { source: 'ncc_extra', hasVat: false }, lines: [line(PARENT, 5, 0, { taxCode: 'KKKN' })] });
    const c = cs.find((x) => x.code === 'tax_path_gift');
    expect(c).toMatchObject({ level: 'error', blocking: true });
    expect(c!.text).toMatch(/Thêm sản phẩm con/);
  });

  it('TH2 tạo mã quà con không gửi thuế: lần sau chặn và chỉ đúng mã quà; dùng mã quà thì đạt', async () => {
    const k = await call(t, 'POST', '/api/v1/items/add-child', { parentSku: PARENT, name: 'Anlene Gold thử quà', variantCode: 'promo', sendToTax: false });
    expect(k.status, JSON.stringify(k.body)).toBe(200);
    GIFT = k.body.data.sku;
    const wrong = await analyze({ ...base, kind: 'gift_in', gift: { source: 'ncc_extra', hasVat: false }, lines: [line(PARENT, 5, 0, { taxCode: 'KKKN' })] });
    expect(wrong.find((x) => x.code === 'tax_path_gift')!.text).toContain(GIFT);
    const ok = await analyze({ ...base, kind: 'gift_in', gift: { source: 'ncc_extra', hasVat: false }, lines: [line(GIFT, 5, 0, { taxCode: 'KKKN' })] });
    expect(codes(ok)).not.toContain('tax_path_gift');
  });

  it('TH1 nhập mua có hoá đơn vào mã quà không gửi thuế: chặn; vào mã chuẩn thì đạt', async () => {
    const inv = { invoice: { no: '3181', date: '2026-10-01' } };
    const bad = await analyze({ ...base, ...inv, kind: 'receipt', lines: [line(GIFT, 60, 488_889)] });
    expect(bad.find((x) => x.code === 'tax_path_invoice')).toMatchObject({ level: 'error', blocking: true });
    const ok = await analyze({ ...base, ...inv, kind: 'receipt', lines: [line(PARENT, 60, 488_889)] });
    expect(codes(ok).filter((x) => x.startsWith('tax_path'))).toEqual([]);
  });

  it('TH12 KM người bán chia giá trên hoá đơn: mã chuẩn, không nhắc; KM người tiêu dùng trên hoá đơn bằng mã chuẩn: nhắc, không chặn', async () => {
    const seller = await analyze({ ...base, kind: 'receipt', lines: [line(PARENT, 1200, 7787), line(PARENT, 120, 0, { lineType: 'gift_seller' })] });
    expect(codes(seller).filter((x) => x.startsWith('tax_path'))).toEqual([]);
    const consumer = await analyze({ ...base, kind: 'receipt', lines: [line(PARENT, 1200, 7787), line(PARENT, 240, 0, { lineType: 'gift_consumer' })] });
    const w = consumer.find((x) => x.code === 'tax_path_invoiced_gift');
    expect(w?.level).toBe('warn');
    expect(w?.blocking).toBeFalsy();
    // KM người tiêu dùng ghi vào mã quà không gửi thuế ngay trên phiếu: không nhắc.
    const clean = await analyze({ ...base, kind: 'receipt', lines: [line(PARENT, 1200, 7787), line(GIFT, 240, 0, { lineType: 'gift_consumer' })] });
    expect(codes(clean).filter((x) => x.startsWith('tax_path'))).toEqual([]);
  });

  it('TH20 quà tự mua không VAT: mã gửi thuế bị chặn, mã quà đạt; có VAT: không chặn', async () => {
    const self = (sku: string, hasVat: boolean) => ({ ...base, kind: 'receipt', gift: { source: 'self_buy', hasVat }, lines: [line(sku, 30, 100_000)] });
    expect((await analyze(self(PARENT, false))).find((x) => x.code === 'tax_path_gift')?.blocking).toBe(true);
    expect(codes(await analyze(self(GIFT, false)))).not.toContain('tax_path_gift');
    expect((await analyze(self(GIFT, true))).filter((x) => x.blocking && x.code.startsWith('tax_path'))).toEqual([]);
  });

  it('Xuất quà: mã quà không nhắc; mã gửi thuế thì nhắc', async () => {
    const out = (sku: string) => ({ ...base, kind: 'gift_out', lines: [line(sku, 5, 0, { taxCode: 'KKKN' })] });
    expect(codes(await analyze(out(GIFT))).filter((x) => x.startsWith('tax_path'))).toEqual([]);
    expect((await analyze(out(PARENT))).find((x) => x.code === 'tax_path_invoiced_gift')?.level).toBe('warn');
  });

  it('Chọn mã quà trên phiếu tự thành hàng tặng người tiêu dùng (theo ô của mặt hàng, không theo chữ cuối mã)', async () => {
    const p = (await call(t, 'GET', `/api/v1/catalog/products/${GIFT}`)).body.data;
    expect(p).toMatchObject({ sendToTax: false, variantCode: 'promo', parentSku: PARENT });
  });
});
