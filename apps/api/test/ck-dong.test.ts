/**
 * CK dòng hai cột CK % ⇄ CK (đ): gõ % hoặc tiền đều ra cùng số; CK không vượt tiền hàng của dòng (tối đa 100%), kể cả dữ liệu gửi
 * thẳng API vượt mức; API chặn % > 100.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { computeDoc, type PDoc, type PLine } from '@ketoan/contracts/mua-hang';
import { call, setupTenant, type TestCtx } from './helpers.js';

const line = (o: Partial<PLine> = {}): PLine => ({ lineKey: 'a', sku: 'A', name: 'A', unit: 'Lon', qty: 10, price: 100_000, taxCode: 'V08', lineType: 'buy', ...o });
const doc = (l: PLine): PDoc => ({ id: 'd', kind: 'order', status: 'draft', docNo: '', docDate: '2026-10-30', branchCode: 'B', partnerCode: 'N1', priceIncludesVat: false, lines: [l] });
const one = (o: Partial<PLine>) => computeDoc(doc(line(o)), []).lines[0]!;

let t: TestCtx;
beforeAll(async () => {
  t = await setupTenant();
  const s = await call(t, 'POST', '/api/v1/purchase/demo/seed', { password: 'Thuy!@#' });
  expect(s.status, JSON.stringify(s.body)).toBe(200);
}, 90_000);
afterAll(async () => { await t.app.close(); });

describe('CK dòng: CK % ⇄ CK (đ)', () => {
  it('5% và 50.000đ trên tiền hàng 1.000.000 ra cùng một số', () => {
    expect(one({ discountPct: 5 }).lineDiscount).toBe(50_000);
    expect(one({ discountAmt: 50_000 }).lineDiscount).toBe(50_000);
    expect(one({ discountAmt: 50_000 }).after).toBe(950_000);
  });

  it('không vượt tiền hàng: 150% hoặc 2.000.000đ đều chỉ bằng 1.000.000', () => {
    expect(one({ discountPct: 150 }).lineDiscount).toBe(1_000_000);
    expect(one({ discountAmt: 2_000_000 }).lineDiscount).toBe(1_000_000);
    expect(one({ discountAmt: 2_000_000 }).after).toBe(0);
  });

  it('lần nhập trước theo Hộp, nay đặt theo Thùng ×48: so giá đã quy về Thùng (không báo lệch 100%)', async () => {
    const p = await call(t, 'PUT', '/api/v1/catalog/products/CKD1?new=1', { name: 'Hàng thử ĐVT', unit: 'Hộp', taxInCode: 'V08', units: [{ unit: 'Hộp', ratio: 1, isDefault: true }, { unit: 'Thùng', ratio: 48, isPurchaseDefault: true }] });
    expect(p.status, JSON.stringify(p.body)).toBe(200);
    await call(t, 'PUT', '/api/v1/partners/NCC-CKD', { name: 'NCC thử ĐVT', kind: 'supplier' });
    const base = { kind: 'receipt', outsideOrder: { reason: 'Phép thử' }, branchCode: 'CN-NA', partnerCode: 'NCC-CKD', priceIncludesVat: false, orderDiscount: {} };
    const r = await call(t, 'POST', '/api/v1/purchase/documents', { ...base, docDate: '2026-10-20', lines: [{ lineKey: 'a', sku: 'CKD1', name: 'x', unit: 'Hộp', qty: 10, price: 10_000, taxCode: 'V08', lineType: 'buy' }] });
    expect(r.status, JSON.stringify(r.body)).toBe(201);
    const ap = await call(t, 'POST', `/api/v1/purchase/documents/${r.body.data.id}/approve`);
    expect(ap.status, JSON.stringify(ap.body)).toBe(200);
    const a = await call(t, 'POST', '/api/v1/purchase/analyze', { ...base, kind: 'order', docDate: '2026-10-30', lines: [{ lineKey: 'b', sku: 'CKD1', name: 'x', unit: 'Thùng', qty: 1, price: 480_000, taxCode: 'V08', lineType: 'buy' }] });
    const checks = a.body.data.checks as { code: string; text: string }[];
    expect(checks.some((c) => c.code === 'price_last'), JSON.stringify(checks)).toBe(false);
    const b = await call(t, 'POST', '/api/v1/purchase/analyze', { ...base, kind: 'order', docDate: '2026-10-30', lines: [{ lineKey: 'b', sku: 'CKD1', name: 'x', unit: 'Thùng', qty: 1, price: 10_000, taxCode: 'V08', lineType: 'buy' }] });
    expect((b.body.data.checks as { code: string; text: string }[]).find((c) => c.code === 'price_last')!.text).toContain('480.000 / Thùng — quy từ Hộp');
  });

  it('chương trình theo GIAI ĐOẠN (giảm tiền / Thùng, %): chọn theo NGÀY CHỨNG TỪ trên phiếu, phiếu theo Lon tự quy đổi', async () => {
    const pol = async (code: string, from: string, to: string, items: unknown[]) => {
      const r = await call(t, 'POST', '/api/v1/purchase/policies', { code, kind: 'item_discount', name: code, scope: { partnerCode: 'NCC-CKD' }, validFrom: from, validTo: to, priority: 0, isActive: true, rule: { items } });
      expect(r.status, JSON.stringify(r.body)).toBe(201);
    };
    await pol('GD1', '2026-09-01', '2026-09-21', [{ sku: 'CKD1', amount: 105_000, unit: 'Thùng' }]);
    await pol('GD2', '2026-09-22', '2026-09-28', [{ sku: 'CKD1', amount: 84_000, unit: 'Thùng' }]);
    const disc = async (docDate: string, unit: string, qty: number) => {
      const r = await call(t, 'POST', '/api/v1/purchase/analyze', { kind: 'order', docDate, branchCode: 'CN-NA', partnerCode: 'NCC-CKD', priceIncludesVat: false, orderDiscount: {}, lines: [{ lineKey: 'a', sku: 'CKD1', name: 'x', unit, qty, price: unit === 'Thùng' ? 480_000 : 10_000, taxCode: 'V08', lineType: 'buy' }] });
      expect(r.status, JSON.stringify(r.body)).toBe(200);
      return r.body.data.calc.lines[0].lineDiscount as number;
    };
    expect(await disc('2026-09-10', 'Thùng', 2)).toBe(210_000); // giai đoạn 1: 105.000 × 2 thùng
    expect(await disc('2026-09-10', 'Hộp', 96)).toBe(210_000); // cùng giai đoạn, phiếu theo Hộp: 96 hộp = 2 thùng
    expect(await disc('2026-09-25', 'Thùng', 2)).toBe(168_000); // ngày chứng từ rơi giai đoạn 2: 84.000 × 2
    expect(await disc('2026-10-30', 'Thùng', 2)).toBe(0); // ngoài cả hai giai đoạn
  });

  it('API chặn CK % trên 100', async () => {
    const r = await call(t, 'POST', '/api/v1/purchase/analyze', { ...doc(line({ discountPct: 120 })), id: undefined });
    expect(r.status).toBe(400);
  });
});
