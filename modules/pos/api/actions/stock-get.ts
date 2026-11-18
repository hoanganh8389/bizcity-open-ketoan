/**
 * GET /api/v1/m/pos/stock?skus=a,b&branch=&scope= — tồn của CHÍNH chi nhánh theo mã (kho mặc định của cửa hàng — NT-BH-023 Q11, ĐVT nhỏ nhất; khung nhìn
 * stock_on_hand). Không có đường đọc tồn chi nhánh khác. Phạm vi chi nhánh của người dùng: khi Core thi hành (PHASE-028 W3) thì
 * module đọc phạm vi của phiên thay cho tham số (phiếu NT-BH-006, lệch chuẩn 3).
 * NT-BH-028: scope=gift → tồn ở kho quà (KKM) của cửa hàng (hộp chọn quà; không cộng số đang bán cùng mã); cửa hàng chưa khai kho quà
 * → tồn kho bán như cũ.
 */
// [2026-11-18 Võ Hoàng] NGHIEM-THU — NT-BH-028: tồn quà theo kho quà cho máy bán (đóng góp)
import { defineAction, z } from '@bizcity/module-sdk';
import { stockAtWarehouse, stockOf, warehousesFor } from '../catalog.js';
import { resolveBranch } from '../read.js';
import { giftWarehouses } from '../settings.js';

export default defineAction({
  id: 'pos.stock.get', title: 'Tồn của chi nhánh cho máy POS', tags: ['Máy bán POS'],
  permission: 'pos:sell', effect: 'read', idempotency: 'none',
  errors: ['VALIDATION_ERROR'],
  input: z.object({ skus: z.string().max(4000).default(''), branch: z.string().trim().max(32).optional(), scope: z.enum(['sale', 'gift']).default('sale') }),
  output: z.array(z.object({ sku: z.string(), available: z.number(), held: z.number() })),
  expose: { http: { method: 'GET', path: '/stock' }, mcp: false, ai: 'read' },
  handler: async (ctx, { skus, branch, scope }) => {
    const giftMap = scope === 'gift' ? await giftWarehouses(ctx) : new Map<string, string>();
    return ctx.data.module(async (tx) => {
      const code = (await resolveBranch(tx, branch || undefined)).code;
      const list = skus.split(',').slice(0, 200);
      const gift = scope === 'gift' ? (await warehousesFor(tx, code, giftMap)).gift : null;
      return gift ? stockAtWarehouse(tx, code, gift, list) : stockOf(tx, code, list);
    });
  },
});
