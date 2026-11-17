/** GET /api/v1/m/voucher/campaigns/:id — một đợt phát (mã hàng áp dụng hiện tại theo item_id đã lưu, số mã theo trạng thái). */
// [2026-11-18 Võ Hoàng] NGHIEM-THU — NT-BH-026: action voucher (đóng góp)
import { defineAction, z } from '@bizcity/module-sdk';
import { campaignView, getCampaign } from '../store.js';
import { todayVn } from '../today.js';

export default defineAction({
  id: 'voucher.campaign.get', title: 'Một đợt phát voucher', tags: ['Voucher'],
  permission: 'voucher:read', effect: 'read', idempotency: 'none',
  errors: ['VALIDATION_ERROR', 'NOT_FOUND'],
  input: z.object({ id: z.string().trim().min(1).max(64) }),
  output: z.record(z.unknown()),
  expose: { http: { method: 'GET', path: '/campaigns/:id' }, mcp: true, ai: 'read' },
  handler: async (ctx, { id }) => ctx.data.module(async (tx) => campaignView(tx, await getCampaign(tx, id), todayVn())),
});
