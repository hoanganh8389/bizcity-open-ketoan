/** GET /api/v1/m/pos/orders/lookup?code=&branch= — tra đơn theo mã phiếu (màn hoàn hàng). Mã chỉ duy nhất trong một chi nhánh. */
import { defineAction, z } from '@bizcity/module-sdk';
import { findOrder } from '../return-service.js';

export default defineAction({
  id: 'pos.order.lookup', title: 'Tra đơn máy POS theo mã phiếu', tags: ['Máy bán POS'],
  permission: 'pos:sell', effect: 'read', idempotency: 'none',
  errors: ['VALIDATION_ERROR', 'NOT_FOUND'],
  // Không có mã thì trả null (hợp đồng module C-4: GET không tham số đường dẫn trả 200).
  input: z.object({ code: z.string().trim().max(64).default(''), branch: z.string().trim().max(32).optional() }),
  output: z.record(z.unknown()).nullable(),
  expose: { http: { method: 'GET', path: '/orders/lookup' }, mcp: false, ai: 'read' },
  handler: async (ctx, { code, branch }) => (code ? ctx.data.module(async (tx) => (await findOrder(tx, code, branch)).snapshot) : null),
});
