/** POST /api/v1/m/pos/channels — thêm kênh bán hàng (phiếu NT-BH-031). Máy bán thấy kênh mới sau khi khởi động lại. Mã / tên trùng → CONFLICT. */
// [2026-11-18 Võ Hoàng] NGHIEM-THU — NT-BH-031: action thêm kênh bán hàng (đóng góp)
import { defineAction, z } from '@bizcity/module-sdk';
import { createChannel } from '../channels.js';
import { newChannelInput } from '../domain/channels.js';

export default defineAction({
  id: 'pos.channel.create', title: 'Thêm kênh bán hàng', tags: ['Kênh bán hàng'],
  permission: 'pos:kenh-ban-lap', effect: 'write', sideEffects: ['masterdata'], idempotency: 'required',
  errors: ['VALIDATION_ERROR', 'CONFLICT'],
  input: newChannelInput,
  output: z.record(z.unknown()),
  expose: { http: { method: 'POST', path: '/channels', status: 201 }, mcp: false, ai: 'propose' },
  evidence: { objectType: 'pos.sale-channel', objectId: (input) => input.code },
  handler: async (ctx, input) => ctx.data.module((tx) => createChannel(tx, ctx.tenant.id, ctx.actor, input)),
});
