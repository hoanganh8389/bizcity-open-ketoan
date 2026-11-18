/** POST /api/v1/m/phieu-ban/orders/:id/send — gửi đơn nháp: hết hạn → PHIEU_BAN_ORDER_EXPIRED; chưa khai kho KCB → PHIEU_BAN_NO_HOLD_WAREHOUSE; vượt hạn mức / nợ quá hạn → Chờ duyệt; không vướng → Đã gửi (giữ hàng). */
// [2026-11-17 Võ Hoàng] NGHIEM-THU — NT-BH-023: action đơn đặt hàng (đóng góp)
import { defineAction, z } from '@bizcity/module-sdk';
import { sendOrder } from '../order-service.js';

export default defineAction({
  id: 'phieu-ban.order.send', title: 'Gửi đơn đặt hàng (kiểm hạn mức, nợ quá hạn; giữ hàng)', tags: ['Đơn đặt hàng'],
  permission: 'phieu-ban:write', effect: 'write', sideEffects: ['documents', 'ledger'], idempotency: 'required',
  errors: ['VALIDATION_ERROR', 'CONFLICT', 'NOT_FOUND', 'PERIOD_LOCKED'],
  input: z.object({ id: z.string().trim().min(1).max(64) }),
  output: z.record(z.unknown()),
  expose: { http: { method: 'POST', path: '/orders/:id/send' }, mcp: false, ai: 'deny' },
  evidence: { objectType: 'phieu-ban.order', objectId: (input) => input.id },
  handler: async (ctx, i) => sendOrder(ctx, i.id),
});
