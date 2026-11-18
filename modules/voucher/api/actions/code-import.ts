/**
 * POST /api/v1/m/voucher/campaigns/:id/import — nạp danh sách mã có sẵn (voucher giấy, mã của hãng) kèm SĐT khách (nhập tay / Excel).
 * Mã đã có / lặp, SĐT sai → bỏ qua dòng đó, báo lại.
 */
// [2026-11-18 Võ Hoàng] NGHIEM-THU — NT-BH-026: action voucher (đóng góp)
import { defineAction, z } from '@bizcity/module-sdk';
import { issueCodes } from '../store.js';
import { todayVn } from '../today.js';

const issued = z.object({ campaignId: z.string(), created: z.array(z.object({ code: z.string(), phone: z.string() })), skipped: z.array(z.record(z.unknown())) });

export default defineAction({
  id: 'voucher.code.import', title: 'Nạp danh sách mã voucher có sẵn', tags: ['Voucher'],
  permission: 'voucher:write', effect: 'write', sideEffects: ['documents'], idempotency: 'required',
  errors: ['VALIDATION_ERROR', 'CONFLICT', 'NOT_FOUND'],
  input: z.object({
    id: z.string().trim().min(1).max(64),
    items: z.array(z.object({ code: z.string().trim().min(1).max(64), phone: z.string().trim().max(20) })).min(1, 'Danh sách trống').max(5000),
  }),
  output: issued,
  expose: { http: { method: 'POST', path: '/campaigns/:id/import' }, mcp: false, ai: 'deny' },
  evidence: { objectType: 'voucher.campaign', objectId: (input) => input.id },
  handler: async (ctx, i) => ctx.data.module((tx) => issueCodes(tx, ctx, i.id, i.items, 'import', todayVn())),
});
