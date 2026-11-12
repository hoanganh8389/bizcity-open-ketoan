/** POST /api/v1/m/pos/shifts/open — mở ca (tiền đầu ca). Chi nhánh đang có ca mở → 409 POS_SHIFT_ALREADY_OPEN (phiếu NT-BH-007). Không ghi sổ. */
import { defineAction, z } from '@bizcity/module-sdk';
import { resolveBranch } from '../read.js';
import { openShift } from '../shifts.js';

export default defineAction({
  id: 'pos.shift.open', title: 'Mở ca bán', tags: ['Máy bán POS'],
  permission: 'pos:sell', effect: 'write', sideEffects: ['documents'], idempotency: 'required',
  errors: ['VALIDATION_ERROR', 'CONFLICT'],
  input: z.object({ openingCash: z.number().min(0).max(1e12), branchCode: z.string().trim().max(32).optional() }).passthrough(),
  output: z.object({ id: z.string(), openedAt: z.string() }),
  expose: { http: { method: 'POST', path: '/shifts/open', status: 201 }, mcp: false, ai: 'deny' },
  handler: async (ctx, { openingCash, branchCode }) => {
    const ref = await ctx.data.module(async (tx) =>
      openShift(tx, ctx.tenant.id, (await resolveBranch(tx, branchCode || undefined)).code, { id: ctx.actor.id, name: ctx.actor.name }, openingCash));
    ctx.evidence.note('pos.shift.open', { shiftId: ref.id, openingCash });
    return ref;
  },
});
