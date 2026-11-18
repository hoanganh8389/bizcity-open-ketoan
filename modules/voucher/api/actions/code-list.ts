/** GET /api/v1/m/voucher/codes?campaignId&phone&status&q&limit — danh sách mã (lọc theo đợt, SĐT khách, trạng thái: active / used / expired / revoked). */
// [2026-11-18 Võ Hoàng] NGHIEM-THU — NT-BH-026: action voucher (đóng góp)
import { defineAction, z } from '@bizcity/module-sdk';
import { normalizePhone } from '../domain/voucher.js';
import { displayStatus, listCodes } from '../store.js';
import { todayVn } from '../today.js';

export default defineAction({
  id: 'voucher.code.list', title: 'Danh sách mã voucher', tags: ['Voucher'],
  permission: 'voucher:read', effect: 'read', idempotency: 'none',
  errors: ['VALIDATION_ERROR'],
  input: z.object({
    campaignId: z.string().trim().max(64).optional(), phone: z.string().trim().max(20).optional(), q: z.string().trim().max(64).optional(),
    status: z.enum(['active', 'used', 'expired', 'revoked']).optional(), limit: z.coerce.number().int().min(1).max(5000).default(1000),
  }),
  output: z.array(z.record(z.unknown())),
  expose: { http: { method: 'GET', path: '/codes' }, mcp: true, ai: 'read' },
  handler: async (ctx, i) => ctx.data.module(async (tx) => {
    const today = todayVn();
    const phone = i.phone ? normalizePhone(i.phone) || i.phone : undefined;
    return (await listCodes(tx, { ...i, ...(phone ? { phone } : {}), today })).map((c) => ({ ...c, state: displayStatus(c, today) }));
  }),
});
