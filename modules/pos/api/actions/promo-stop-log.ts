/** POST /api/v1/m/pos/promo/stopped — màn vừa phát hành bản "ngừng" của một khuyến mại: ghi nhật ký (ai ngừng, từ ngày nào). */
// [2026-11-18 Võ Hoàng] NGHIEM-THU — NT-BH-025: action chương trình khuyến mại (đóng góp)
import { defineAction, z } from '@bizcity/module-sdk';
import { logStop } from '../promo.js';

export default defineAction({
  id: 'pos.promo.stop-log', title: 'Ghi nhật ký ngừng khuyến mại', tags: ['Chương trình khuyến mại'],
  permission: 'settings:write', effect: 'write', sideEffects: ['documents'], idempotency: 'required',
  errors: ['VALIDATION_ERROR'],
  input: z.object({ key: z.string().trim().min(1).max(64), from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/) }),
  output: z.object({ ok: z.boolean() }),
  expose: { http: { method: 'POST', path: '/promo/stopped' }, mcp: false, ai: 'deny' },
  evidence: { objectType: 'pos.promo-draft', objectId: (input) => input.key },
  handler: async (ctx, { key, from }) => { await ctx.data.module((tx) => logStop(tx, ctx, key, from)); return { ok: true }; },
});
