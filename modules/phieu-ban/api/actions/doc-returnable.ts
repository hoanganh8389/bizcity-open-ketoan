/** GET /api/v1/m/phieu-ban/docs/:id/returnable — số còn trả được theo dòng của phiếu bán (đã trừ phiếu trả đã duyệt). */
// [2026-11-13 11:30 PM Võ Hoàng] NGHIEM-THU — NT-BH-015: action phiếu bán / trả nhập tay (đóng góp)
import { defineAction, z } from '@bizcity/module-sdk';
import { returnable } from '../service.js';

export default defineAction({
  id: 'phieu-ban.doc.returnable', title: 'Số còn trả được của phiếu bán nhập tay', tags: ['Phiếu bán nhập tay'],
  permission: 'phieu-ban:read', effect: 'read', idempotency: 'none', errors: ['NOT_FOUND', 'VALIDATION_ERROR'],
  input: z.object({ id: z.string().trim().min(1).max(64) }),
  output: z.record(z.unknown()),
  expose: { http: { method: 'GET', path: '/docs/:id/returnable' }, mcp: true, ai: 'read' },
  handler: async (ctx, { id }) => returnable(ctx, id),
});
