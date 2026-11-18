/**
 * POST /api/v1/m/voucher/campaigns — lập đợt phát: loại (tương đương tiền / lần mua sau sản phẩm – nhãn), người phát (TGS / hãng – NCC kèm
 * hình thức thanh toán kế toán khai), mệnh giá, hạn, đơn tối thiểu, sản phẩm / nhãn áp dụng, kiểu phát (thủ công / tự động lần mua sau).
 */
// [2026-11-18 Võ Hoàng] NGHIEM-THU — NT-BH-026: action voucher (đóng góp)
import { defineAction, z } from '@bizcity/module-sdk';
import { campaignInput } from '../domain/voucher.js';
import { campaignView, saveCampaign } from '../store.js';
import { todayVn } from '../today.js';

export default defineAction({
  id: 'voucher.campaign.create', title: 'Lập đợt phát voucher', tags: ['Voucher'],
  permission: 'voucher:write', effect: 'write', sideEffects: ['documents'], idempotency: 'required',
  errors: ['VALIDATION_ERROR', 'CONFLICT'],
  input: campaignInput,
  output: z.record(z.unknown()),
  expose: { http: { method: 'POST', path: '/campaigns' }, mcp: false, ai: 'propose' },
  evidence: { objectType: 'voucher.campaign', objectId: (input) => input.code },
  handler: async (ctx, input) => ctx.data.module(async (tx) => campaignView(tx, await saveCampaign(tx, ctx, input), todayVn())),
});
