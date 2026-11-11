/** POST /api/v1/m/pos/sequences/reserve — cấp trước một dải số phiếu cho máy (dùng khi mất mạng; nhảy số chấp nhận, Q20). */
import { defineAction, z } from '@bizcity/module-sdk';
import { codePeriod } from '../domain/order.js';
import { takeCodes } from '../codes.js';
import { resolveBranch, todayVn } from '../read.js';

export default defineAction({
  id: 'pos.sequence.reserve', title: 'Cấp trước số phiếu cho máy bán', tags: ['Máy bán POS'],
  permission: 'pos:sell', effect: 'write', sideEffects: ['documents'], idempotency: 'required',
  errors: ['VALIDATION_ERROR'],
  input: z.object({
    kind: z.enum(['sale', 'return']),
    count: z.number().int().min(1).max(100),
    branchCode: z.string().trim().max(32).optional(),
    businessDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  }),
  output: z.object({ kind: z.enum(['sale', 'return']), codes: z.array(z.string()), expiresAt: z.string() }),
  expose: { http: { method: 'POST', path: '/sequences/reserve' }, mcp: false, ai: 'deny' },
  handler: async (ctx, input) => ctx.data.module(async (tx) => {
    const branch = await resolveBranch(tx, input.branchCode);
    const day = input.businessDate ?? todayVn();
    const codes = await takeCodes(tx, ctx.tenant.id, branch.code, input.kind, codePeriod(day), input.count);
    // Số thuộc tháng của ngày bán: hết tháng thì máy xin dải mới.
    const [y, m] = day.split('-').map(Number) as [number, number];
    const expiresAt = new Date(Date.UTC(y, m, 1) - 7 * 3600_000).toISOString();
    return { kind: input.kind, codes, expiresAt };
  }),
});
