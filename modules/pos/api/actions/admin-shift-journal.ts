/**
 * POST /api/v1/m/pos/admin/shifts/:id/journal — Sổ ca bán (BH15) "Lập lại phiếu": ca đã chốt có chênh lệch mà phiếu kế toán chưa lập
 * (lý do chưa khai lúc chốt, hoặc ca chốt khi đang tắt) → lập theo lý do hiện tại của Cài đặt bán hàng (NT-BH-014). Đã có phiếu
 * (đã ghi / chờ duyệt / lỗi ở ACC14) → 409: sửa ở ACC14. Quyền ghi chứng từ của Core (kế toán). Lỗi chỉ có câu báo (chưa thêm mã reason
 * vào ERROR_REASONS của Core — đợt sau nếu máy cần phân biệt).
 */
// [2026-11-13 09:45 PM Võ Hoàng] NGHIEM-THU — NT-BH-014: lập lại phiếu chênh lệch két từ Sổ ca (đóng góp)
import { Errors, defineAction, sql, z } from '@bizcity/module-sdk';
import { JOURNAL_DONE, submitCashDiff } from '../cash-diff.js';
import { posSettings } from '../settings.js';

export default defineAction({
  id: 'pos.admin.shift-journal', title: 'Lập lại phiếu kế toán chênh lệch két của ca', tags: ['Quản trị bán lẻ'],
  permission: 'documents:write', effect: 'write', sideEffects: ['documents', 'ledger'], idempotency: 'required',
  errors: ['VALIDATION_ERROR', 'CONFLICT', 'NOT_FOUND', 'PERIOD_LOCKED'],
  input: z.object({ id: z.string().trim().min(1).max(64) }),
  output: z.record(z.unknown()),
  expose: { http: { method: 'POST', path: '/admin/shifts/:id/journal' }, mcp: false, ai: 'deny' },
  evidence: { objectType: 'pos.shift', objectId: (input) => input.id },
  handler: async (ctx, { id }) => {
    const s = await ctx.data.module(async (tx) => (await sql<{
      branch_code: string; status: string; opened_at: Date; closed_at: Date | null; opened_by_name: string; expected_cash: string | null; counted_cash: string | null;
      report: { journal?: { status?: string } } | null;
    }>`SELECT branch_code, status, opened_at, closed_at, opened_by_name, expected_cash, counted_cash, report FROM mod_pos.shifts WHERE shift_id = ${id}`.execute(tx)).rows[0]);
    if (!s) throw Errors.notFound(`ca ${id}`);
    if (s.status !== 'closed' || !s.closed_at || s.counted_cash === null || s.expected_cash === null) throw Errors.conflict('Ca chưa chốt — chốt ca rồi mới lập phiếu chênh lệch két');
    const cur = s.report?.journal?.status;
    if (cur && JOURNAL_DONE.has(cur)) throw Errors.conflict(`Ca đã có phiếu kế toán chênh lệch két (${cur}) — xem / sửa ở Trạm chứng từ ACC14`);
    const journal = await submitCashDiff(ctx, {
      shiftId: id, branchCode: s.branch_code, openedAt: s.opened_at, closedAt: s.closed_at, cashier: s.opened_by_name,
      expectedCash: Number(s.expected_cash), countedCash: Number(s.counted_cash),
    }, await posSettings(ctx));
    if (!journal) throw Errors.conflict('Ca không có chênh lệch két — không cần phiếu');
    if (journal.status === 'not_created') throw Errors.validation(`Chưa lập được phiếu: ${journal.error ?? ''}`);
    ctx.evidence.note('pos.shift.journal', { shiftId: id, status: journal.status, amount: journal.amount });
    return { journal };
  },
});
