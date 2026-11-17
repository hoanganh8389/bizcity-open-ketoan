/**
 * PUT /api/v1/m/voucher/campaigns/:id — sửa đợt phát; `status` ngừng / mở lại. Đợt đã phát mã: chỉ sửa tên, hạn, ghi chú, điều kiện tự
 * phát, trạng thái (ECP-13 — mã đã phát giữ đúng điều kiện lúc phát).
 */
// [2026-11-18 Võ Hoàng] NGHIEM-THU — NT-BH-026: action voucher (đóng góp)
import { defineAction, z } from '@bizcity/module-sdk';
import { campaignInput } from '../domain/voucher.js';
import { campaignView, saveCampaign } from '../store.js';
import { todayVn } from '../today.js';

export default defineAction({
  id: 'voucher.campaign.update', title: 'Sửa / ngừng đợt phát voucher', tags: ['Voucher'],
  permission: 'voucher:write', effect: 'write', sideEffects: ['documents'], idempotency: 'required',
  errors: ['VALIDATION_ERROR', 'CONFLICT', 'NOT_FOUND'],
  input: campaignInput.extend({ id: z.string().trim().min(1).max(64), status: z.enum(['active', 'stopped']).optional() }),
  output: z.record(z.unknown()),
  expose: { http: { method: 'PUT', path: '/campaigns/:id' }, mcp: false, ai: 'propose' },
  evidence: { objectType: 'voucher.campaign', objectId: (input) => input.code },
  handler: async (ctx, { id, status, ...input }) => ctx.data.module(async (tx) => campaignView(tx, await saveCampaign(tx, ctx, input, id, status), todayVn())),
});
