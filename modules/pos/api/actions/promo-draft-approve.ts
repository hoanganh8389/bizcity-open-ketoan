/**
 * POST /api/v1/m/pos/promo/drafts/:id/approve — duyệt bản nháp (quyền pos:promo-approve; người lập không tự duyệt): ghi hạn mức lượt theo
 * cửa hàng, trả nội dung để màn phát hành POST /api/v1/policies bằng quyền người duyệt, rồi gọi …/published ghi bản đã phát hành.
 */
// [2026-11-18 Võ Hoàng] NGHIEM-THU — NT-BH-025: action chương trình khuyến mại (đóng góp)
import { defineAction, z } from '@bizcity/module-sdk';
import { approveDraft } from '../promo.js';

export default defineAction({
  id: 'pos.promo.draft.approve', title: 'Duyệt chương trình khuyến mại', tags: ['Chương trình khuyến mại'],
  permission: 'pos:promo-approve', effect: 'write', sideEffects: ['documents'], idempotency: 'required',
  errors: ['VALIDATION_ERROR', 'CONFLICT', 'NOT_FOUND', 'FORBIDDEN'],
  input: z.object({ id: z.string().trim().min(1).max(64), note: z.string().trim().max(500).optional() }),
  output: z.record(z.unknown()),
  expose: { http: { method: 'POST', path: '/promo/drafts/:id/approve' }, mcp: false, ai: 'deny' },
  evidence: { objectType: 'pos.promo-draft', objectId: (input) => input.id },
  handler: async (ctx, { id, note }) => ctx.data.module((tx) => approveDraft(tx, ctx, id, note)),
});
