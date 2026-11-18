/** GET /api/v1/m/pos/promo/drafts/:id — một bản nháp kèm nhật ký của mã khuyến mại (lập, sửa, gửi duyệt, duyệt, từ chối, ngừng…). */
// [2026-11-18 Võ Hoàng] NGHIEM-THU — NT-BH-025: action chương trình khuyến mại (đóng góp)
import { defineAction, z } from '@bizcity/module-sdk';
import { getDraft } from '../promo.js';

export default defineAction({
  id: 'pos.promo.draft.get', title: 'Một bản nháp khuyến mại + nhật ký', tags: ['Chương trình khuyến mại'],
  permission: 'catalog:read', effect: 'read', idempotency: 'none',
  errors: ['VALIDATION_ERROR', 'NOT_FOUND'],
  input: z.object({ id: z.string().trim().min(1).max(64) }),
  output: z.record(z.unknown()),
  expose: { http: { method: 'GET', path: '/promo/drafts/:id' }, mcp: false, ai: 'read' },
  handler: async (ctx, { id }) => ctx.data.module((tx) => getDraft(tx, id)),
});
