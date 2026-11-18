/** PUT /api/v1/m/pos/channels/:code — sửa tên / loại online-offline / thứ tự của kênh bán hàng (phiếu NT-BH-031). Mã không đổi (đơn cũ lưu mã). */
// [2026-11-18 Võ Hoàng] NGHIEM-THU — NT-BH-031: action sửa kênh bán hàng (đóng góp)
import { defineAction, z } from '@bizcity/module-sdk';
import { updateChannel } from '../channels.js';
import { channelInput } from '../domain/channels.js';

export default defineAction({
  id: 'pos.channel.update', title: 'Sửa kênh bán hàng', tags: ['Kênh bán hàng'],
  permission: 'pos:kenh-ban-sua', effect: 'write', sideEffects: ['masterdata'], idempotency: 'required',
  errors: ['VALIDATION_ERROR', 'CONFLICT', 'NOT_FOUND'],
  input: channelInput.extend({ code: z.string().trim().min(1).max(32) }),
  output: z.record(z.unknown()),
  expose: { http: { method: 'PUT', path: '/channels/:code' }, mcp: false, ai: 'propose' },
  evidence: { objectType: 'pos.sale-channel', objectId: (input) => input.code },
  handler: async (ctx, { code, ...c }) => ctx.data.module((tx) => updateChannel(tx, ctx.tenant.id, ctx.actor, code, c)),
});
