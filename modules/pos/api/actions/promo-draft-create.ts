/**
 * POST /api/v1/m/pos/promo/drafts — lưu chương trình khuyến mại thành BẢN NHÁP (chưa áp ở máy bán / BH10); `submit: true` = gửi duyệt luôn.
 * Trả kèm chương trình trùng (cùng mã hàng, cùng cửa hàng, giao thời gian) — chỉ cảnh báo, vẫn lưu.
 */
// [2026-11-18 Võ Hoàng] NGHIEM-THU — NT-BH-025: action chương trình khuyến mại (đóng góp)
import { defineAction, z } from '@bizcity/module-sdk';
import { draftContentSchema } from '../domain/promo.js';
import { overlapsFor, saveDraft, shapeOfDraft } from '../promo.js';

export default defineAction({
  id: 'pos.promo.draft.create', title: 'Lưu nháp chương trình khuyến mại', tags: ['Chương trình khuyến mại'],
  permission: 'settings:write', effect: 'write', sideEffects: ['documents'], idempotency: 'required',
  errors: ['VALIDATION_ERROR', 'CONFLICT'],
  input: draftContentSchema.extend({ submit: z.boolean().default(false) }),
  output: z.object({ draft: z.record(z.unknown()), overlaps: z.array(z.record(z.unknown())) }),
  expose: { http: { method: 'POST', path: '/promo/drafts' }, mcp: false, ai: 'deny' },
  evidence: { objectType: 'pos.promo-draft', objectId: (input) => input.key },
  handler: async (ctx, { submit, ...c }) => {
    const draft = await ctx.data.module((tx) => saveDraft(tx, ctx, c, { submit }));
    return { draft, overlaps: await overlapsFor(ctx, shapeOfDraft(draft), draft.id) };
  },
});
