/** GET /api/v1/m/voucher/campaigns?q&status&issuer — danh sách đợt phát voucher kèm số mã phát / còn / đã dùng / hết hạn / thu hồi. */
// [2026-11-18 Võ Hoàng] NGHIEM-THU — NT-BH-026: action voucher (đóng góp)
import { defineAction, z } from '@bizcity/module-sdk';
import { campaignView, listCampaigns } from '../store.js';
import { todayVn } from '../today.js';

export default defineAction({
  id: 'voucher.campaign.list', title: 'Danh sách đợt phát voucher', tags: ['Voucher'],
  permission: 'voucher:read', effect: 'read', idempotency: 'none',
  errors: ['VALIDATION_ERROR'],
  input: z.object({ q: z.string().trim().max(100).optional(), status: z.enum(['active', 'stopped']).optional(), issuer: z.enum(['tgs', 'brand']).optional() }),
  output: z.array(z.record(z.unknown())),
  expose: { http: { method: 'GET', path: '/campaigns' }, mcp: true, ai: 'read' },
  handler: async (ctx, i) => ctx.data.module(async (tx) => {
    const today = todayVn();
    const out = [];
    for (const c of await listCampaigns(tx, i)) out.push(await campaignView(tx, c, today));
    return out;
  }),
});
