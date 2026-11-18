/**
 * Nhập tồn cho test bán hàng (NT-BH-021: máy bán chặn cứng khi bán quá tồn). Một phiếu mua đã ghi sổ mỗi chi nhánh, ngày trước
 * ngày bán; chỉ chạm hàng tồn (156), thuế đầu vào, phải trả nhà cung cấp — không chạm phải thu / doanh thu của bài kiểm bán hàng.
 */
// [2026-11-16 06:30 PM Võ Hoàng] NGHIEM-THU — NT-BH-021: test bán hàng phải có tồn trước khi bán (đóng góp)
import { sql } from 'kysely';
import { expect } from 'vitest';
import { db } from '../src/db/client.js';
import { call, type TestCtx } from './helpers.js';

// [2026-11-18 Võ Hoàng] NGHIEM-THU — NT-BH-028: nhập tồn vào một kho cụ thể (kho quà KKM) — tham số warehouseCode, trống = kho mặc định (đóng góp)
export async function nhapTon(ctx: TestCtx, branchCode: string, items: readonly (readonly [sku: string, qty: number, unit?: string])[], docDate = '2026-10-01', key = `NHAP-TON-${branchCode}`, warehouseCode?: string) {
  const lines = items.map(([sku, qty, unit], i) => ({
    lineKey: `l${i + 1}`, sku, name: sku, unit: unit ?? 'Cái', qty, amountBeforeTax: qty * 1000, taxCode: 'V08', taxAmount: qty * 80,
    ...(warehouseCode ? { warehouseCode } : {}),
  }));
  const beforeTax = lines.reduce((s, l) => s + l.amountBeforeTax, 0);
  const tax = lines.reduce((s, l) => s + l.taxAmount, 0);
  const r = await call(ctx, 'POST', '/api/v1/documents', {
    docType: 'purchase', docKey: key, branchCode, docNo: key, docDate, partner: { code: 'NCC-NHAP-TON', name: 'Nhà cung cấp nhập tồn (test)' },
    lines, totals: { beforeTax, tax, total: beforeTax + tax },
  });
  expect(r.body?.data?.status, JSON.stringify(r.body)).toBe('posted');
}

// [2026-11-17 Võ Hoàng] NGHIEM-THU — NT-BH-022: máy bán chỉ bán đúng bảng giá cửa hàng → test bán hàng phải khai giá trước khi bán (đóng góp)
/**
 * Khai giá bán (gồm thuế) cho test bán hàng: một bảng giá công ty (`is_company`, mọi cửa hàng chưa gán bảng giá riêng đều lấy) +
 * ĐVT của mã (`product_units`, đã có thì giữ nguyên; ĐVT hệ số 1 là ĐVT bán chính) + ô giá (`product_prices`, gọi lại thì ghi đè).
 * Mỗi đơn vị chỉ một bảng giá công ty → bảng công ty cũ (nếu có, khác mã) bị bỏ cờ công ty. Mã hàng phải có sẵn ở danh mục.
 */
export async function khaiGia(tenantId: string | number, rows: readonly (readonly [sku: string, unit: string, price: number, ratio?: number])[], code = 'BG-TEST') {
  await sql`UPDATE price_lists SET is_company = false WHERE tenant_id = ${tenantId} AND is_company AND code <> ${code}`.execute(db);
  await sql`INSERT INTO price_lists (tenant_id, code, name, is_company) VALUES (${tenantId}, ${code}, 'Bảng giá công ty (test)', true)
    ON CONFLICT (tenant_id, code) DO UPDATE SET is_company = true, is_active = true, updated_at = now()`.execute(db);
  for (const [sku, unit, price, ratio = 1] of rows) {
    await sql`INSERT INTO product_units (tenant_id, sku, unit, ratio, is_default) VALUES (${tenantId}, ${sku}, ${unit}, ${ratio}, ${ratio === 1})
      ON CONFLICT (tenant_id, sku, unit) DO NOTHING`.execute(db);
    await sql`INSERT INTO product_prices (tenant_id, price_list_code, sku, unit, price) VALUES (${tenantId}, ${code}, ${sku}, ${unit}, ${price})
      ON CONFLICT (tenant_id, price_list_code, sku, unit) DO UPDATE SET price = EXCLUDED.price, updated_at = now()`.execute(db);
  }
}
