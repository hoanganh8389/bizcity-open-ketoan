/** GET /api/v1/m/pos/promo/drafts?status&q — bản nháp khuyến mại (mặc định: chưa phát hành) cho thẻ "Chờ duyệt" của màn BH18. */
// [2026-11-18 Võ Hoàng] NGHIEM-THU — NT-BH-025: action chương trình khuyến mại (đóng góp)
import { defineAction, z } from '@bizcity/module-sdk';
import { DRAFT_STATUS } from '../domain/promo.js';
import { listDrafts } from '../promo.js';

export default defineAction({
  id: 'pos.promo.draft.list', title: 'Bản nháp chương trình khuyến mại', tags: ['Chương trình khuyến mại'],
  permission: 'catalog:read', effect: 'read', idempotency: 'none',
  errors: ['VALIDATION_ERROR'],
  input: z.object({ status: z.enum(DRAFT_STATUS).optional(), q: z.string().trim().max(64).optional() }),
  output: z.array(z.record(z.unknown())),
  expose: { http: { method: 'GET', path: '/promo/drafts' }, mcp: false, ai: 'read' },
  handler: async (ctx, i) => ctx.data.module((tx) => listDrafts(tx, i)),
});
