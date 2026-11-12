/**
 * GET /api/v1/m/pos/stock?skus=a,b&branch= — tồn của CHÍNH chi nhánh theo mã (mọi kho của chi nhánh, ĐVT nhỏ nhất; khung nhìn
 * stock_on_hand). Không có đường đọc tồn chi nhánh khác. Phạm vi chi nhánh của người dùng: khi Core thi hành (PHASE-028 W3) thì
 * module đọc phạm vi của phiên thay cho tham số (phiếu NT-BH-006, lệch chuẩn 3).
 */
import { defineAction, z } from '@bizcity/module-sdk';
import { stockOf } from '../catalog.js';
import { resolveBranch } from '../read.js';

export default defineAction({
  id: 'pos.stock.get', title: 'Tồn của chi nhánh cho máy POS', tags: ['Máy bán POS'],
  permission: 'pos:sell', effect: 'read', idempotency: 'none',
  errors: ['VALIDATION_ERROR'],
  input: z.object({ skus: z.string().max(4000).default(''), branch: z.string().trim().max(32).optional() }),
  output: z.array(z.object({ sku: z.string(), available: z.number(), held: z.number() })),
  expose: { http: { method: 'GET', path: '/stock' }, mcp: false, ai: 'read' },
  handler: async (ctx, { skus, branch }) => ctx.data.module(async (tx) => stockOf(tx, (await resolveBranch(tx, branch || undefined)).code, skus.split(',').slice(0, 200))),
});
