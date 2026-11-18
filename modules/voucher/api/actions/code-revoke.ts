/** POST /api/v1/m/voucher/codes/:code/revoke — thu hồi tay một mã còn (phát nhầm khách…). Mã đã dùng không thu hồi được. */
// [2026-11-18 Võ Hoàng] NGHIEM-THU — NT-BH-026: action voucher (đóng góp)
import { Errors, defineAction, z } from '@bizcity/module-sdk';
import { normalizeCode } from '../domain/voucher.js';
import { codesByCode, lockCode, revokeCode } from '../store.js';

export default defineAction({
  id: 'voucher.code.revoke', title: 'Thu hồi mã voucher', tags: ['Voucher'],
  permission: 'voucher:write', effect: 'write', sideEffects: ['documents'], idempotency: 'required',
  errors: ['VALIDATION_ERROR', 'CONFLICT', 'NOT_FOUND'],
  input: z.object({ code: z.string().trim().min(1).max(64), reason: z.string().trim().min(1, 'Nhập lý do thu hồi').max(500) }),
  output: z.object({ code: z.string(), status: z.string() }),
  expose: { http: { method: 'POST', path: '/codes/:code/revoke' }, mcp: false, ai: 'deny' },
  evidence: { objectType: 'voucher.code', objectId: (input) => input.code },
  handler: async (ctx, i) => ctx.data.module(async (tx) => {
    const code = normalizeCode(i.code);
    await lockCode(tx, code);
    const c = (await codesByCode(tx, [code])).get(code);
    if (!c) throw Errors.notFound(`voucher ${code}`);
    if (c.status !== 'active') {
      throw Errors.conflict(`Voucher ${code} ${c.status === 'used' ? `đã dùng ở ${c.usedRefCode ?? '?'}` : 'đã thu hồi'} — không thu hồi được`, { reason: 'VOUCHER_CAMPAIGN_STATE', status: c.status });
    }
    await revokeCode(tx, ctx.tenant.id, code, i.reason, ctx.actor.id);
    return { code, status: 'revoked' };
  }),
});
