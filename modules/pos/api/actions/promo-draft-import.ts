/**
 * POST /api/v1/m/pos/promo/drafts/import — nhận nhiều bản nháp một lần (lệnh website `wp tgs-pos promo-migrate` chuyển chương trình cũ của
 * plugin tgs_selling_policy). Tạo NHÁP (chưa áp); cùng sourceRef đã chuyển → bỏ qua (chạy lại an toàn); mã đang có nháp mở → bỏ qua.
 */
// [2026-11-18 Võ Hoàng] NGHIEM-THU — NT-BH-025: action chương trình khuyến mại (đóng góp)
import { defineAction, z } from '@bizcity/module-sdk';
import { draftContentSchema } from '../domain/promo.js';
import { importDrafts } from '../promo.js';

export default defineAction({
  id: 'pos.promo.draft.import', title: 'Nhận nháp khuyến mại hàng loạt (chuyển chương trình cũ)', tags: ['Chương trình khuyến mại'],
  permission: 'settings:write', effect: 'write', sideEffects: ['documents'], idempotency: 'required',
  errors: ['VALIDATION_ERROR'],
  input: z.object({
    source: z.string().trim().min(1).max(64),
    items: z.array(draftContentSchema.extend({ sourceRef: z.string().trim().min(1).max(200) })).min(1).max(200),
  }),
  output: z.object({ created: z.array(z.record(z.unknown())), skipped: z.array(z.record(z.unknown())) }),
  expose: { http: { method: 'POST', path: '/promo/drafts/import' }, mcp: false, ai: 'deny' },
  evidence: { objectType: 'pos.promo-draft', objectId: (input) => input.source },
  handler: async (ctx, { source, items }) => ctx.data.module((tx) => importDrafts(tx, ctx, source, items)),
});
