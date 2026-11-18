/**
 * GET /api/v1/m/pos/gift-warehouse?branch= — kho bán / kho quà (KKM) của cửa hàng theo Cài đặt bán hàng (khoá bizcity.pos.gift_warehouses,
 * phiếu NT-BH-028). Module phieu-ban gọi (ctx.actions.call) để dòng quà của phiếu bán BH10 tự vào kho quà — một khoá dùng chung cho máy
 * bán và BH10. giftWarehouse null = cửa hàng chưa khai (quà trừ kho bán như cũ) hoặc khai sai (issue nêu lý do).
 */
// [2026-11-18 Võ Hoàng] NGHIEM-THU — NT-BH-028: action đọc kho quà của cửa hàng cho phieu-ban (đóng góp)
import { defineAction, z } from '@bizcity/module-sdk';
import { warehousesFor } from '../catalog.js';
import { resolveBranch } from '../read.js';
import { giftWarehouses } from '../settings.js';

export default defineAction({
  id: 'pos.gift-warehouse.get', title: 'Kho quà (KKM) của cửa hàng', tags: ['Máy bán POS'],
  permission: 'catalog:read', effect: 'read', idempotency: 'none',
  errors: ['VALIDATION_ERROR'],
  input: z.object({ branch: z.string().trim().max(32).optional() }),
  output: z.object({ branch: z.string(), saleWarehouse: z.string(), giftWarehouse: z.string().nullable(), issue: z.string().nullable() }),
  expose: { http: { method: 'GET', path: '/gift-warehouse' }, mcp: false, ai: 'read' },
  handler: async (ctx, input) => {
    const map = await giftWarehouses(ctx);
    return ctx.data.module(async (tx) => {
      const b = await resolveBranch(tx, input.branch || undefined);
      const w = await warehousesFor(tx, b.code, map);
      return { branch: b.code, saleWarehouse: w.sale, giftWarehouse: w.gift, issue: w.issue ?? null };
    });
  },
});
