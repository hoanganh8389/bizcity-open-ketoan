/** PUT /api/v1/m/pos/promo/drafts/:id — sửa bản nháp (nháp / chờ duyệt / bị từ chối); `submit: true` = gửi duyệt. Trả kèm cảnh báo trùng. */
// [2026-11-18 Võ Hoàng] NGHIEM-THU — NT-BH-025: action chương trình khuyến mại (đóng góp)
import { defineAction, z } from '@bizcity/module-sdk';
import { draftContentSchema } from '../domain/promo.js';
import { overlapsFor, saveDraft, shapeOfDraft } from '../promo.js';

export default defineAction({
  id: 'pos.promo.draft.update', title: 'Sửa nháp chương trình khuyến mại', tags: ['Chương trình khuyến mại'],
  permission: 'settings:write', effect: 'write', sideEffects: ['documents'], idempotency: 'required',
  errors: ['VALIDATION_ERROR', 'CONFLICT', 'NOT_FOUND'],
  input: draftContentSchema.extend({ id: z.string().trim().min(1).max(64), submit: z.boolean().default(false) }),
  output: z.object({ draft: z.record(z.unknown()), overlaps: z.array(z.record(z.unknown())) }),
  expose: { http: { method: 'PUT', path: '/promo/drafts/:id' }, mcp: false, ai: 'deny' },
  evidence: { objectType: 'pos.promo-draft', objectId: (input) => input.id },
  handler: async (ctx, { id, submit, ...c }) => {
    const draft = await ctx.data.module((tx) => saveDraft(tx, ctx, c, { id, submit }));
    return { draft, overlaps: await overlapsFor(ctx, shapeOfDraft(draft), draft.id) };
  },
});
