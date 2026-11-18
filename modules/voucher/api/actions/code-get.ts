/**
 * GET /api/v1/m/voucher/codes/:code — tra cứu một mã: đợt, khách, hạn, trạng thái; đã dùng ở đơn / phiếu nào, ngày, cửa hàng, số tiền trừ;
 * nhật ký phát / dùng / trả / thu hồi / dùng trùng.
 */
// [2026-11-18 Võ Hoàng] NGHIEM-THU — NT-BH-026: action voucher (đóng góp)
import { Errors, defineAction, z } from '@bizcity/module-sdk';
import { normalizeCode } from '../domain/voucher.js';
import { campaignsByIds, codesByCode, displayStatus, logOf } from '../store.js';
import { todayVn } from '../today.js';

export default defineAction({
  id: 'voucher.code.get', title: 'Tra cứu mã voucher', tags: ['Voucher'],
  permission: 'voucher:read', effect: 'read', idempotency: 'none',
  errors: ['VALIDATION_ERROR', 'NOT_FOUND'],
  input: z.object({ code: z.string().trim().min(1).max(64) }),
  output: z.record(z.unknown()),
  expose: { http: { method: 'GET', path: '/codes/:code' }, mcp: true, ai: 'read' },
  handler: async (ctx, i) => ctx.data.module(async (tx) => {
    const code = normalizeCode(i.code);
    const c = (await codesByCode(tx, [code])).get(code);
    if (!c) throw Errors.notFound(`voucher ${code}`);
    const camp = (await campaignsByIds(tx, [c.campaignId])).get(c.campaignId)!;
    return {
      ...c, state: displayStatus(c, todayVn()),
      campaign: { id: camp.id, code: camp.code, name: camp.name, kind: camp.kind, issuer: camp.issuer, issuerPartnerCode: camp.issuerPartnerCode, faceValue: camp.faceValue, minOrder: camp.minOrder },
      log: await logOf(tx, code),
    };
  }),
});
