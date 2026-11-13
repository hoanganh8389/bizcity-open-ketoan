/** GET /api/v1/m/phieu-ban/docs/:id — một phiếu đầy đủ (khuôn TradeDoc). */
// [2026-11-13 11:30 PM Võ Hoàng] NGHIEM-THU — NT-BH-015: action phiếu bán / trả nhập tay (đóng góp)
import { defineAction, z } from '@bizcity/module-sdk';
import { getDoc, toTradeDoc } from '../store.js';

export default defineAction({
  id: 'phieu-ban.doc.get', title: 'Xem phiếu bán / trả nhập tay', tags: ['Phiếu bán nhập tay'],
  permission: 'phieu-ban:read', effect: 'read', idempotency: 'none', errors: ['NOT_FOUND'],
  input: z.object({ id: z.string().trim().min(1).max(64) }),
  output: z.record(z.unknown()),
  expose: { http: { method: 'GET', path: '/docs/:id' }, mcp: true, ai: 'read' },
  handler: async (ctx, { id }) => ctx.data.module(async (tx) => toTradeDoc(await getDoc(tx, id))),
});
