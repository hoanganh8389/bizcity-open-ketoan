/** POST /api/v1/m/phieu-ban/docs/:id/approve — duyệt: nộp chứng từ sale / sale_return vào sổ (ghi ngay hoặc chờ ACC14 theo chế độ ghi sổ). */
// [2026-11-13 11:30 PM Võ Hoàng] NGHIEM-THU — NT-BH-015: action phiếu bán / trả nhập tay (đóng góp)
import { defineAction, z } from '@bizcity/module-sdk';
import { approve } from '../service.js';

export default defineAction({
  id: 'phieu-ban.doc.approve', title: 'Duyệt phiếu bán / trả nhập tay (nộp sổ)', tags: ['Phiếu bán nhập tay'],
  permission: 'phieu-ban:write', effect: 'write', sideEffects: ['documents', 'ledger'], idempotency: 'required',
  errors: ['VALIDATION_ERROR', 'CONFLICT', 'NOT_FOUND', 'PERIOD_LOCKED'],
  input: z.object({ id: z.string().trim().min(1).max(64) }),
  output: z.record(z.unknown()),
  expose: { http: { method: 'POST', path: '/docs/:id/approve' }, mcp: false, ai: 'deny' },
  evidence: { objectType: 'phieu-ban.doc', objectId: (input) => input.id },
  handler: async (ctx, { id }) => approve(ctx, id),
});
