/** GET /api/v1/m/pos/catalog/search?q=&branch= — tìm mặt hàng (mã, mã vạch, tên không dấu) khi danh mục trên máy không thấy. Tối đa 50. */
import { defineAction, z } from '@bizcity/module-sdk';
import { searchCatalog } from '../catalog.js';
import { resolveBranch } from '../read.js';

export default defineAction({
  id: 'pos.catalog.search', title: 'Tìm mặt hàng cho máy POS', tags: ['Máy bán POS'],
  permission: 'pos:sell', effect: 'read', idempotency: 'none',
  errors: ['VALIDATION_ERROR'],
  input: z.object({ q: z.string().max(100).default(''), branch: z.string().trim().max(32).optional() }),
  output: z.array(z.record(z.unknown())),
  expose: { http: { method: 'GET', path: '/catalog/search' }, mcp: false, ai: 'read' },
  handler: async (ctx, { q, branch }) => ctx.data.module(async (tx) => searchCatalog(tx, (await resolveBranch(tx, branch || undefined)).code, q)),
});
