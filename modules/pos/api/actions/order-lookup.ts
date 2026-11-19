/**
 * GET /api/v1/m/pos/orders/lookup?code=&branch= — tra đơn theo mã phiếu (màn hoàn hàng). Mã chỉ duy nhất trong một chi nhánh.
 * NT-BH-030 Q1: không có ở cửa hàng `branch` thì tìm ở các cửa hàng cùng MST chi nhánh (trả khác cửa hàng cùng MST).
 */
// [2026-11-18 Võ Hoàng] NGHIEM-THU — NT-BH-030: tra đơn gốc ở cửa hàng cùng MST (đóng góp)
import { defineAction, z } from '@bizcity/module-sdk';
import { findOrder, findOrderForReturn } from '../return-service.js';

export default defineAction({
  id: 'pos.order.lookup', title: 'Tra đơn máy POS theo mã phiếu', tags: ['Máy bán POS'],
  permission: 'pos:sell', effect: 'read', idempotency: 'none',
  errors: ['VALIDATION_ERROR', 'NOT_FOUND'],
  // Không có mã thì trả null (hợp đồng module C-4: GET không tham số đường dẫn trả 200).
  input: z.object({ code: z.string().trim().max(64).default(''), branch: z.string().trim().max(32).optional() }),
  output: z.record(z.unknown()).nullable(),
  expose: { http: { method: 'GET', path: '/orders/lookup' }, mcp: false, ai: 'read' },
  handler: async (ctx, { code, branch }) => (code
    ? ctx.data.module(async (tx) => (await (branch ? findOrderForReturn(tx, code, branch) : findOrder(tx, code))).snapshot)
    : null),
});
