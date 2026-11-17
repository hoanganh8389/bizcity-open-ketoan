/** POST /api/v1/m/pos/promo/drafts/:id/published — màn đã phát hành bản nháp đã duyệt vào sổ chính sách: ghi số bản, nhật ký. */
// [2026-11-18 Võ Hoàng] NGHIEM-THU — NT-BH-025: action chương trình khuyến mại (đóng góp)
import { defineAction, z } from '@bizcity/module-sdk';
import { markPublished } from '../promo.js';

export default defineAction({
  id: 'pos.promo.draft.published', title: 'Ghi bản khuyến mại đã phát hành', tags: ['Chương trình khuyến mại'],
  permission: 'pos:promo-approve', effect: 'write', sideEffects: ['documents'], idempotency: 'required',
  errors: ['VALIDATION_ERROR', 'CONFLICT', 'NOT_FOUND'],
  input: z.object({ id: z.string().trim().min(1).max(64), version: z.number().int().min(1) }),
  output: z.record(z.unknown()),
  expose: { http: { method: 'POST', path: '/promo/drafts/:id/published' }, mcp: false, ai: 'deny' },
  evidence: { objectType: 'pos.promo-draft', objectId: (input) => input.id },
  handler: async (ctx, { id, version }) => ctx.data.module((tx) => markPublished(tx, ctx, id, version)),
});
