/**
 * Nhập tồn cho test bán hàng (NT-BH-021: máy bán chặn cứng khi bán quá tồn). Một phiếu mua đã ghi sổ mỗi chi nhánh, ngày trước
 * ngày bán; chỉ chạm hàng tồn (156), thuế đầu vào, phải trả nhà cung cấp — không chạm phải thu / doanh thu của bài kiểm bán hàng.
 */
// [2026-11-16 06:30 PM Võ Hoàng] NGHIEM-THU — NT-BH-021: test bán hàng phải có tồn trước khi bán (đóng góp)
import { expect } from 'vitest';
import { call, type TestCtx } from './helpers.js';

export async function nhapTon(ctx: TestCtx, branchCode: string, items: readonly (readonly [sku: string, qty: number, unit?: string])[], docDate = '2026-10-01', key = `NHAP-TON-${branchCode}`) {
  const lines = items.map(([sku, qty, unit], i) => ({
    lineKey: `l${i + 1}`, sku, name: sku, unit: unit ?? 'Cái', qty, amountBeforeTax: qty * 1000, taxCode: 'V08', taxAmount: qty * 80,
  }));
  const beforeTax = lines.reduce((s, l) => s + l.amountBeforeTax, 0);
  const tax = lines.reduce((s, l) => s + l.taxAmount, 0);
  const r = await call(ctx, 'POST', '/api/v1/documents', {
    docType: 'purchase', docKey: key, branchCode, docNo: key, docDate, partner: { code: 'NCC-NHAP-TON', name: 'Nhà cung cấp nhập tồn (test)' },
    lines, totals: { beforeTax, tax, total: beforeTax + tax },
  });
  expect(r.body?.data?.status, JSON.stringify(r.body)).toBe('posted');
}
