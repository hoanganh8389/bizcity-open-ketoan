/**
 * GET /api/v1/m/phieu-ban/quote?branch=&warehouse=&skus=a,b — giá bán theo cửa hàng (bizcity_read.branch_prices: giá đã áp luật
 * bảng giá cửa hàng → chi nhánh → công ty, như máy bán) và tồn theo sổ kế toán (bizcity_read.stock_on_hand, ĐVT nhỏ nhất) cho form
 * phiếu bán nhập tay (NT-BH-015 bước 2). Chỉ đọc. Mã không bán / không có → không có trong kết quả.
 */
// [2026-11-14 03:00 PM Võ Hoàng] NGHIEM-THU — NT-BH-015 bước 2: giá theo cửa hàng + tồn cho form phiếu bán (đóng góp)
import { defineAction, sql, z } from '@bizcity/module-sdk';

export default defineAction({
  id: 'phieu-ban.quote.get', title: 'Giá theo cửa hàng và tồn kho cho phiếu bán nhập tay', tags: ['Phiếu bán nhập tay'],
  permission: 'phieu-ban:read', effect: 'read', idempotency: 'none',
  input: z.object({
    branch: z.string().trim().max(32).default(''), warehouse: z.string().trim().max(64).optional(),
    skus: z.string().trim().max(4000).default(''),
  }),
  output: z.array(z.record(z.unknown())),
  expose: { http: { method: 'GET', path: '/quote' }, mcp: true, ai: 'read' },
  handler: async (ctx, i) => ctx.data.module(async (tx) => {
    const skus = [...new Set(i.skus.split(',').map((s) => s.trim()).filter(Boolean))].slice(0, 200);
    if (!i.branch || !skus.length) return [];
    const prices = (await sql<{ sku: string; name: string; unit: string | null; ratio: string | null; price: string | null; price_source: string | null; tax_code: string | null }>`
      SELECT p.sku, p.name, bp.unit, bp.ratio, bp.price, bp.price_source, p.tax_out_code AS tax_code
        FROM bizcity_read.products p
        LEFT JOIN bizcity_read.branch_prices bp ON bp.branch_code = ${i.branch} AND bp.sku = p.sku AND bp.is_default_unit
       WHERE p.sku IN (${sql.join(skus)}) AND p.is_active IS NOT FALSE AND p.no_sale IS NOT TRUE`.execute(tx)).rows;
    const stock = new Map((await sql<{ sku: string; qty: string }>`
      SELECT sku, SUM(qty)::text AS qty FROM bizcity_read.stock_on_hand
       WHERE branch_code = ${i.branch} AND sku IN (${sql.join(skus)}) ${i.warehouse ? sql`AND warehouse_code = ${i.warehouse}` : sql``}
       GROUP BY sku`.execute(tx)).rows.map((r) => [r.sku, Number(r.qty)]));
    return prices.map((p) => ({
      sku: p.sku, name: p.name, unit: p.unit ?? '', ratio: p.ratio === null ? 1 : Number(p.ratio),
      price: p.price === null ? null : Number(p.price), priceSource: p.price_source, taxCode: p.tax_code, stock: stock.get(p.sku) ?? 0,
    }));
  }),
});
