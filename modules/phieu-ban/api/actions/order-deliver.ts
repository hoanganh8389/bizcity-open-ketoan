/** POST /api/v1/m/phieu-ban/orders/:id/deliver — giao một lần: mỗi dòng ≤ số còn lại (vượt → PHIEU_BAN_OVER_REMAINING) → phiếu bán BH10 nháp xuất từ kho KCB, nối số đơn. */
// [2026-11-17 Võ Hoàng] NGHIEM-THU — NT-BH-023: action đơn đặt hàng (đóng góp)
import { defineAction, z } from '@bizcity/module-sdk';
import { deliverOrder } from '../order-service.js';

export default defineAction({
  id: 'phieu-ban.order.deliver', title: 'Giao đơn đặt hàng (sinh phiếu bán nháp)', tags: ['Đơn đặt hàng'],
  permission: 'phieu-ban:write', effect: 'write', sideEffects: ['documents'], idempotency: 'required',
  errors: ['VALIDATION_ERROR', 'CONFLICT', 'NOT_FOUND'],
  input: z.object({ id: z.string().trim().min(1).max(64), docDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().or(z.literal('').transform(() => undefined)),
    lines: z.array(z.object({ lineKey: z.string().trim().min(1).max(64), qty: z.number().finite().min(0) })).min(1).max(500) }),
  output: z.record(z.unknown()),
  expose: { http: { method: 'POST', path: '/orders/:id/deliver' }, mcp: false, ai: 'deny' },
  evidence: { objectType: 'phieu-ban.order', objectId: (input) => input.id },
  handler: async (ctx, i) => deliverOrder(ctx, i.id, { docDate: i.docDate, lines: i.lines }),
});
