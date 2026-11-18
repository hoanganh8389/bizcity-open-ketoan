/**
 * POST /api/v1/m/pos/channels/:code/stop — ngừng dùng kênh bán hàng (phiếu NT-BH-031): máy bán (sau khi khởi động lại) và BH10 không chọn
 * được; đơn / phiếu cũ vẫn giữ kênh. Thay cho xoá (ECP-13): module không có lệnh xoá kênh.
 */
// [2026-11-18 Võ Hoàng] NGHIEM-THU — NT-BH-031: action ngừng dùng kênh bán hàng (đóng góp)
import { defineAction, z } from '@bizcity/module-sdk';
import { setChannelActive } from '../channels.js';

export default defineAction({
  id: 'pos.channel.stop', title: 'Ngừng dùng kênh bán hàng', tags: ['Kênh bán hàng'],
  permission: 'pos:kenh-ban-xoa', effect: 'write', sideEffects: ['masterdata'], idempotency: 'required',
  errors: ['VALIDATION_ERROR', 'NOT_FOUND'],
  input: z.object({ code: z.string().trim().min(1).max(32) }),
  output: z.record(z.unknown()),
  expose: { http: { method: 'POST', path: '/channels/:code/stop' }, mcp: false, ai: 'propose' },
  evidence: { objectType: 'pos.sale-channel', objectId: (input) => input.code },
  handler: async (ctx, { code }) => ctx.data.module((tx) => setChannelActive(tx, ctx.tenant.id, ctx.actor, code, false)),
});
