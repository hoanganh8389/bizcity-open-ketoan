/**
 * GET /api/v1/m/pos/orders/:id/returnable?branch= — phần còn trả được của từng dòng, hạn trả, lý do không trả được (NT-BH-005).
 * NT-BH-024: `taxInvoice` (đơn có MST → blockers TAX_INVOICE), dòng quà đổi điểm `notReturnable: 'LOYALTY_GIFT'`, `badWarehouse`.
 */
import { defineAction, z } from '@bizcity/module-sdk';
import { findOrder, returnableOf } from '../return-service.js';
import { resolveBranch } from '../read.js';
import { returnBadWarehouses, returnDays } from '../settings.js';

export default defineAction({
  id: 'pos.order.returnable', title: 'Phần còn trả được của đơn máy POS', tags: ['Máy bán POS'],
  permission: 'pos:return', effect: 'read', idempotency: 'none',
  errors: ['VALIDATION_ERROR', 'NOT_FOUND'],
  input: z.object({ id: z.string().trim().min(1).max(64), branch: z.string().trim().max(32).optional() }),
  output: z.record(z.unknown()),
  expose: { http: { method: 'GET', path: '/orders/:id/returnable' }, mcp: false, ai: 'read' },
  handler: async (ctx, { id, branch }) => {
    const days = await returnDays(ctx);
    // [2026-11-18 Võ Hoàng] NGHIEM-THU — NT-BH-024: kho KTL nhận hàng lỗi của cửa hàng (cờ badWarehouse cho máy bán) (đóng góp)
    const badMap = await returnBadWarehouses(ctx);
    return ctx.data.module(async (tx) => {
    const here = await resolveBranch(tx, branch);
    return returnableOf(tx, await findOrder(tx, id, branch), here.code, days, undefined, badMap);
    });
  },
});
