/** POST /api/v1/m/pos/channels/:code/resume — dùng lại kênh đã ngừng (phiếu NT-BH-031). Quyền sửa kênh. */
// [2026-11-18 Võ Hoàng] NGHIEM-THU — NT-BH-031: action dùng lại kênh bán hàng (đóng góp)
import { defineAction, z } from '@bizcity/module-sdk';
import { setChannelActive } from '../channels.js';

export default defineAction({
  id: 'pos.channel.resume', title: 'Dùng lại kênh bán hàng', tags: ['Kênh bán hàng'],
  permission: 'pos:kenh-ban-sua', effect: 'write', sideEffects: ['masterdata'], idempotency: 'required',
  errors: ['VALIDATION_ERROR', 'NOT_FOUND'],
  input: z.object({ code: z.string().trim().min(1).max(32) }),
  output: z.record(z.unknown()),
  expose: { http: { method: 'POST', path: '/channels/:code/resume' }, mcp: false, ai: 'propose' },
  evidence: { objectType: 'pos.sale-channel', objectId: (input) => input.code },
  handler: async (ctx, { code }) => ctx.data.module((tx) => setChannelActive(tx, ctx.tenant.id, ctx.actor, code, true)),
});
