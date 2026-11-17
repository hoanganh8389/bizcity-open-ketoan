/**
 * POST /api/v1/m/voucher/campaigns/:id/generate — sinh mã cho đợt: mỗi SĐT khách `perPhone` mã (luôn gắn khách — chỉ khách đó dùng).
 * SĐT sai bị bỏ qua, báo lại theo dòng.
 */
// [2026-11-18 Võ Hoàng] NGHIEM-THU — NT-BH-026: action voucher (đóng góp)
import { defineAction, z } from '@bizcity/module-sdk';
import { issueCodes } from '../store.js';
import { todayVn } from '../today.js';

const issued = z.object({ campaignId: z.string(), created: z.array(z.object({ code: z.string(), phone: z.string() })), skipped: z.array(z.record(z.unknown())) });

export default defineAction({
  id: 'voucher.code.generate', title: 'Sinh mã voucher cho đợt phát', tags: ['Voucher'],
  permission: 'voucher:write', effect: 'write', sideEffects: ['documents'], idempotency: 'required',
  errors: ['VALIDATION_ERROR', 'CONFLICT', 'NOT_FOUND'],
  input: z.object({
    id: z.string().trim().min(1).max(64), phones: z.array(z.string().trim().max(20)).min(1, 'Chưa nhập SĐT khách').max(5000),
    perPhone: z.number().int().min(1).max(20).default(1),
  }),
  output: issued,
  expose: { http: { method: 'POST', path: '/campaigns/:id/generate' }, mcp: false, ai: 'deny' },
  evidence: { objectType: 'voucher.campaign', objectId: (input) => input.id },
  handler: async (ctx, i) => ctx.data.module((tx) => issueCodes(tx, ctx, i.id, i.phones.flatMap((phone) => Array.from({ length: i.perPhone }, () => ({ phone }))), 'generate', todayVn())),
});
