/**
 * POST /api/v1/m/pos/shifts/close — chốt ca: đếm két, chênh lệch = đếm được − phải có (âm = thiếu), lưu biên bản. Còn việc dở (đơn
 * chờ trả tiền) thì phải force + lý do. Ca đã chốt → 409 POS_SHIFT_CLOSED; gửi lại cùng khoá idempotency nhận biên bản cũ.
 * Lệch ≠ 0 và Cài đặt bán hàng bật "lập phiếu kế toán" (mặc định bật, NT-BH-007 Q1 chốt 13/11) → nộp một manual_journal theo lý do
 * thiếu / thừa (NT-BH-014, chữ chốt nghiep-vu/20). Core từ chối phiếu (chưa có lý do…) không chặn chốt ca: biên bản ghi "chưa lập",
 * kế toán Lập lại phiếu ở Sổ ca (cash-diff.ts).
 */
// [2026-11-13 08:30 PM Võ Hoàng] NGHIEM-THU — NT-BH-014: chốt ca lệch két nộp phiếu kế toán theo lý do (đóng góp)
import { defineAction, z } from '@bizcity/module-sdk';
import { submitCashDiff } from '../cash-diff.js';
import { posSettings } from '../settings.js';
import { closeShift } from '../shifts.js';

export default defineAction({
  id: 'pos.shift.close', title: 'Chốt ca bán', tags: ['Máy bán POS'],
  permission: 'pos:sell', effect: 'write', sideEffects: ['documents', 'ledger'], idempotency: 'required',
  errors: ['VALIDATION_ERROR', 'CONFLICT', 'NOT_FOUND', 'PERIOD_LOCKED'],
  input: z.object({
    shiftId: z.string().trim().min(1).max(64), countedCash: z.number().min(0).max(1e12), force: z.boolean().optional(), note: z.string().trim().max(500).optional(),
  }).passthrough(),
  output: z.record(z.unknown()),
  expose: { http: { method: 'POST', path: '/shifts/close' }, mcp: false, ai: 'deny' },
  evidence: { objectType: 'pos.shift', objectId: (input) => input.shiftId },
  handler: async (ctx, { shiftId, countedCash, force, note }) => {
    const settings = await posSettings(ctx);
    const report = await ctx.data.module(async (tx) => closeShift(tx, { shiftId, countedCash, force, note, actorId: ctx.actor.id }));
    const journal = settings.cashDiffJournal ? await submitCashDiff(ctx, {
      shiftId, branchCode: report.branchCode, openedAt: new Date(report.openedAt), closedAt: new Date(report.closedAt), cashier: report.cashier,
      expectedCash: report.expectedCash, countedCash,
    }, settings) : null;
    ctx.evidence.note('pos.shift.close', { shiftId, countedCash, difference: report.difference, forced: report.forced, journal: journal?.status ?? 'none' });
    return journal ? { ...report, journal } : report;
  },
});
