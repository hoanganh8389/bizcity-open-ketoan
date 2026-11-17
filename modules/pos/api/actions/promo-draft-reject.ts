/** POST /api/v1/m/pos/promo/drafts/:id/reject — từ chối bản nháp kèm lý do (người lập sửa rồi gửi lại); người lập không tự từ chối. */
// [2026-11-18 Võ Hoàng] NGHIEM-THU — NT-BH-025: action chương trình khuyến mại (đóng góp)
import { defineAction, z } from '@bizcity/module-sdk';
import { rejectDraft } from '../promo.js';

export default defineAction({
  id: 'pos.promo.draft.reject', title: 'Từ chối chương trình khuyến mại', tags: ['Chương trình khuyến mại'],
  permission: 'pos:promo-approve', effect: 'write', sideEffects: ['documents'], idempotency: 'required',
  errors: ['VALIDATION_ERROR', 'CONFLICT', 'NOT_FOUND', 'FORBIDDEN'],
  input: z.object({ id: z.string().trim().min(1).max(64), reason: z.string().trim().min(1, 'Ghi lý do từ chối').max(500) }),
  output: z.record(z.unknown()),
  expose: { http: { method: 'POST', path: '/promo/drafts/:id/reject' }, mcp: false, ai: 'deny' },
  evidence: { objectType: 'pos.promo-draft', objectId: (input) => input.id },
  handler: async (ctx, { id, reason }) => ctx.data.module((tx) => rejectDraft(tx, ctx, id, reason)),
});
