/** GET /api/v1/m/pos/promo/drafts/:id/overlaps — chương trình đang áp / chờ duyệt trùng với bản nháp (hộp Duyệt hiện cảnh báo). */
// [2026-11-18 Võ Hoàng] NGHIEM-THU — NT-BH-025: action chương trình khuyến mại (đóng góp)
import { defineAction, z } from '@bizcity/module-sdk';
import { getDraft, overlapsFor, shapeOfDraft } from '../promo.js';

export default defineAction({
  id: 'pos.promo.draft.overlaps', title: 'Cảnh báo trùng của một bản nháp khuyến mại', tags: ['Chương trình khuyến mại'],
  permission: 'catalog:read', effect: 'read', idempotency: 'none',
  errors: ['VALIDATION_ERROR', 'NOT_FOUND'],
  input: z.object({ id: z.string().trim().min(1).max(64) }),
  output: z.array(z.record(z.unknown())),
  expose: { http: { method: 'GET', path: '/promo/drafts/:id/overlaps' }, mcp: false, ai: 'read' },
  handler: async (ctx, { id }) => {
    const d = await ctx.data.module((tx) => getDraft(tx, id));
    return overlapsFor(ctx, shapeOfDraft(d), d.id);
  },
});
