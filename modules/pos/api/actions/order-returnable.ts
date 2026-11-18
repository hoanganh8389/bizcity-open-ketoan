/**
 * GET /api/v1/m/pos/orders/:id/returnable?branch= — phần còn trả được của từng dòng, hạn trả, lý do không trả được (NT-BH-005).
 * NT-BH-024: `taxInvoice` (đơn có MST → blockers TAX_INVOICE), dòng quà đổi điểm `notReturnable: 'LOYALTY_GIFT'`, `badWarehouse`.
 * NT-BH-030: `branch` = cửa hàng nhận trả; đơn của cửa hàng khác cùng MST trả được (tra mã phiếu ở cửa hàng cùng MST); hạn theo cửa hàng nhận
 * (`days`); `approvals` = yêu cầu trả quá hạn của đơn ở cửa hàng này (trạng thái, lý do từ chối).
 */
// [2026-11-18 Võ Hoàng] NGHIEM-THU — NT-BH-030: còn trả được ở cửa hàng cùng MST, hạn theo shop, kèm yêu cầu trả quá hạn (đóng góp)
import { defineAction, z } from '@bizcity/module-sdk';
import { daysOf } from '../domain/returns.js';
import { findOrderForReturn, returnableOf } from '../return-service.js';
import { resolveBranch } from '../read.js';
import { returnBadWarehouses, returnDaysPolicy } from '../settings.js';

export default defineAction({
  id: 'pos.order.returnable', title: 'Phần còn trả được của đơn máy POS', tags: ['Máy bán POS'],
  permission: 'pos:return', effect: 'read', idempotency: 'none',
  errors: ['VALIDATION_ERROR', 'NOT_FOUND'],
  input: z.object({ id: z.string().trim().min(1).max(64), branch: z.string().trim().max(32).optional() }),
  output: z.record(z.unknown()),
  expose: { http: { method: 'GET', path: '/orders/:id/returnable' }, mcp: false, ai: 'read' },
  handler: async (ctx, { id, branch }) => {
    const policy = await returnDaysPolicy(ctx);
    // [2026-11-18 Võ Hoàng] NGHIEM-THU — NT-BH-024: kho KTL nhận hàng lỗi của cửa hàng (cờ badWarehouse cho máy bán) (đóng góp)
    const badMap = await returnBadWarehouses(ctx);
    return ctx.data.module(async (tx) => {
      const here = await resolveBranch(tx, branch);
      return returnableOf(tx, await findOrderForReturn(tx, id, here.code), here, daysOf(policy, here.code), undefined, badMap);
    });
  },
});
