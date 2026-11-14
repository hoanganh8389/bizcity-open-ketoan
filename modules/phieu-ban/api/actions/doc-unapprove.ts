/** POST /api/v1/m/phieu-ban/docs/:id/unapprove — bỏ duyệt: huỷ chứng từ trong sổ (đảo bút toán), phiếu về nháp. */
// [2026-11-13 11:30 PM Võ Hoàng] NGHIEM-THU — NT-BH-015: action phiếu bán / trả nhập tay (đóng góp)
import { defineAction, z } from '@bizcity/module-sdk';
import { unapprove } from '../service.js';

export default defineAction({
  id: 'phieu-ban.doc.unapprove', title: 'Bỏ duyệt phiếu bán / trả nhập tay (đảo bút toán)', tags: ['Phiếu bán nhập tay'],
  permission: 'phieu-ban:write', effect: 'write', sideEffects: ['documents', 'ledger'], idempotency: 'required',
  errors: ['VALIDATION_ERROR', 'CONFLICT', 'NOT_FOUND', 'PERIOD_LOCKED'],
  input: z.object({ id: z.string().trim().min(1).max(64), reason: z.string().trim().max(500).optional() }),
  output: z.record(z.unknown()),
  expose: { http: { method: 'POST', path: '/docs/:id/unapprove' }, mcp: false, ai: 'deny' },
  evidence: { objectType: 'phieu-ban.doc', objectId: (input) => input.id },
  handler: async (ctx, { id, reason }) => unapprove(ctx, id, reason || 'Bỏ duyệt phiếu nhập tay'),
});
