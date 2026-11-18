/** POST /api/v1/m/phieu-ban/orders/:id/approve — duyệt đơn chờ duyệt (quyền phieu-ban:order-approve; người lập không tự duyệt) → Đã gửi, giữ hàng. */
// [2026-11-17 Võ Hoàng] NGHIEM-THU — NT-BH-023: action đơn đặt hàng (đóng góp)
import { defineAction, z } from '@bizcity/module-sdk';
import { approveOrder } from '../order-service.js';

export default defineAction({
  id: 'phieu-ban.order.approve', title: 'Duyệt đơn đặt hàng chờ duyệt (kế toán trưởng / chủ đơn vị)', tags: ['Đơn đặt hàng'],
  permission: 'phieu-ban:order-approve', effect: 'write', sideEffects: ['documents', 'ledger'], idempotency: 'required',
  errors: ['VALIDATION_ERROR', 'CONFLICT', 'NOT_FOUND', 'PERIOD_LOCKED', 'FORBIDDEN'],
  input: z.object({ id: z.string().trim().min(1).max(64), note: z.string().trim().max(500).default('') }),
  output: z.record(z.unknown()),
  expose: { http: { method: 'POST', path: '/orders/:id/approve' }, mcp: false, ai: 'deny' },
  evidence: { objectType: 'phieu-ban.order', objectId: (input) => input.id },
  handler: async (ctx, i) => approveOrder(ctx, i.id, i.note),
});
