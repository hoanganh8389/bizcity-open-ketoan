/** GET /api/v1/m/pos/catalog/barcode/:code?branch= — tra một mã (mã hàng hoặc một trong các mã vạch "a/b"). Không có → 404. */
import { Errors, defineAction, z } from '@bizcity/module-sdk';
import { productByCode } from '../catalog.js';
import { resolveBranch } from '../read.js';

export default defineAction({
  id: 'pos.catalog.barcode', title: 'Tra mặt hàng theo mã / mã vạch cho máy POS', tags: ['Máy bán POS'],
  permission: 'pos:sell', effect: 'read', idempotency: 'none',
  errors: ['VALIDATION_ERROR', 'NOT_FOUND'],
  input: z.object({ code: z.string().trim().min(1).max(64), branch: z.string().trim().max(32).optional() }),
  output: z.record(z.unknown()),
  expose: { http: { method: 'GET', path: '/catalog/barcode/:code' }, mcp: false, ai: 'read' },
  handler: async (ctx, { code, branch }) => {
    const p = await ctx.data.module(async (tx) => productByCode(tx, (await resolveBranch(tx, branch || undefined)).code, code));
    if (!p) throw Errors.notFound(`mặt hàng ${code}`);
    return p;
  },
});
