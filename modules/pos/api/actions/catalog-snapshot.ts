/**
 * GET /api/v1/m/pos/catalog/snapshot?branch= — toàn bộ danh mục bán của chi nhánh: mặt hàng, ĐVT, giá đã áp bảng giá của chi nhánh
 * (thiếu thì bảng giá công ty; hàng chính chỉ giá công ty — luật ở Core, khung nhìn branch_prices), thuế suất, Biến thể, Gửi lên thuế.
 * `version` đổi khi mặt hàng / ô giá đổi; máy kéo lại khi khác (phiếu NT-BH-006).
 */
import { defineAction, z } from '@bizcity/module-sdk';
import { catalogSnapshot } from '../catalog.js';
import { resolveBranch } from '../read.js';

export default defineAction({
  id: 'pos.catalog.snapshot', title: 'Danh mục bán của chi nhánh cho máy POS', tags: ['Máy bán POS'],
  permission: 'pos:sell', effect: 'read', idempotency: 'none',
  errors: ['VALIDATION_ERROR'],
  input: z.object({ branch: z.string().trim().max(32).optional() }),
  output: z.object({ items: z.array(z.record(z.unknown())), version: z.string(), cursor: z.string() }),
  expose: { http: { method: 'GET', path: '/catalog/snapshot' }, mcp: false, ai: 'read' },
  handler: async (ctx, { branch }) => ctx.data.module(async (tx) => catalogSnapshot(tx, (await resolveBranch(tx, branch || undefined)).code)),
});
