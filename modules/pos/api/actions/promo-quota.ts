/**
 * GET /api/v1/m/pos/promo/quota?branch&keys=A,B&exclude= — lượt còn của chương trình có hạn mức ở cửa hàng (chỉ chương trình có hạn mức).
 * Máy bán hỏi trước khi thanh toán; module phieu-ban gọi (ctx.actions.call) lúc duyệt phiếu bán. `exclude`: bỏ lượt của chính đơn / phiếu.
 */
// [2026-11-18 Võ Hoàng] NGHIEM-THU — NT-BH-025: action chương trình khuyến mại (đóng góp)
import { defineAction, z } from '@bizcity/module-sdk';
import { quotaState } from '../promo.js';
import { resolveBranch } from '../read.js';

export default defineAction({
  id: 'pos.promo.quota', title: 'Lượt còn của chương trình khuyến mại ở cửa hàng', tags: ['Chương trình khuyến mại'],
  permission: 'catalog:read', effect: 'read', idempotency: 'none',
  errors: ['VALIDATION_ERROR'],
  input: z.object({ branch: z.string().trim().max(32).optional(), keys: z.string().trim().max(4000).default(''), exclude: z.string().trim().max(64).optional() }),
  output: z.object({ branch: z.string(), items: z.array(z.object({ key: z.string(), quota: z.number(), used: z.number(), left: z.number() })) }),
  expose: { http: { method: 'GET', path: '/promo/quota' }, mcp: false, ai: 'read' },
  handler: async (ctx, i) => ctx.data.module(async (tx) => {
    const b = await resolveBranch(tx, i.branch || undefined);
    const keys = i.keys.split(',').map((x) => x.trim()).filter(Boolean).slice(0, 100);
    return { branch: b.code, items: await quotaState(tx, b.code, keys, i.exclude || undefined) };
  }),
});
