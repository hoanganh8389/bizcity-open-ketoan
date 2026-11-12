/**
 * POST /api/v1/m/pos/shifts/close — chốt ca: đếm két, chênh lệch = đếm được − phải có (âm = thiếu), lưu biên bản. Còn việc dở (đơn
 * chờ trả tiền) thì phải force + lý do. Ca đã chốt → 409 POS_SHIFT_CLOSED; gửi lại cùng khoá idempotency nhận biên bản cũ.
 * Không lập chứng từ (NT-BH-007 Q1: chênh lệch kế toán xử lý cho tới khi chốt khác).
 */
import { defineAction, z } from '@bizcity/module-sdk';
import { closeShift } from '../shifts.js';

export default defineAction({
  id: 'pos.shift.close', title: 'Chốt ca bán', tags: ['Máy bán POS'],
  permission: 'pos:sell', effect: 'write', sideEffects: ['documents'], idempotency: 'required',
  errors: ['VALIDATION_ERROR', 'CONFLICT', 'NOT_FOUND'],
  input: z.object({
    shiftId: z.string().trim().min(1).max(64), countedCash: z.number().min(0).max(1e12), force: z.boolean().optional(), note: z.string().trim().max(500).optional(),
  }).passthrough(),
  output: z.record(z.unknown()),
  expose: { http: { method: 'POST', path: '/shifts/close' }, mcp: false, ai: 'deny' },
  evidence: { objectType: 'pos.shift', objectId: (input) => input.shiftId },
  handler: async (ctx, { shiftId, countedCash, force, note }) => {
    const report = await ctx.data.module(async (tx) => closeShift(tx, { shiftId, countedCash, force, note, actorId: ctx.actor.id }));
    ctx.evidence.note('pos.shift.close', { shiftId, countedCash, difference: report.difference, forced: report.forced });
    return report;
  },
});
