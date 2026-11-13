/**
 * Phiếu kế toán chênh lệch két (NT-BH-014, chữ chốt nghiep-vu/20): dựng từ biên bản ca, nộp qua ctx.ledger.submit, ghi trạng thái vào
 * biên bản (`report.journal`). Dùng chung cho chốt ca (shift-close) và "Lập lại phiếu" ở Sổ ca (admin-shift-journal).
 * Core từ chối lúc nhận (lý do chưa khai / thiếu tài khoản → POSTING_FAILED; khuôn sai → VALIDATION_ERROR): không làm hỏng chốt ca —
 * biên bản ghi `not_created` + câu lỗi, kế toán khai lý do ở Cài đặt bán hàng rồi bấm Lập lại phiếu.
 * Lần nộp bọc trong SAVEPOINT của giao dịch action (ctx.data.module dùng chung kết nối): Core đã ghi sự việc trước khi định khoản, bắt lỗi
 * mà không quay lui sẽ để lại chứng từ dở — ROLLBACK TO SAVEPOINT bỏ đúng phần phiếu, giữ phần chốt ca.
 */
// [2026-11-13 09:45 PM Võ Hoàng] NGHIEM-THU — NT-BH-014: nộp phiếu chênh lệch két, lỗi nhận không chặn chốt ca (đóng góp)
import { AppError, sql, type ActionContext } from '@bizcity/module-sdk';
import { cashDiffJournal } from './domain/shifts.js';
import { partnerByCode } from './read.js';
import type { PosSettings } from './settings.js';

export type JournalState = { docKey: string; docNo: string; reasonCode: string; amount: number; status: string; error?: string };
/** Trạng thái đã có phiếu trong sổ / trạm chứng từ — không lập lại. */
export const JOURNAL_DONE = new Set(['posted', 'pending', 'unchanged', 'error']);

type ShiftFacts = { shiftId: string; branchCode: string; openedAt: Date; closedAt: Date; cashier: string; expectedCash: number; countedCash: number };

export async function submitCashDiff(ctx: ActionContext, s: ShiftFacts, settings: Pick<PosSettings, 'cashShortReason' | 'cashOverReason'>): Promise<JournalState | null> {
  const partner = await ctx.data.module((tx) => partnerByCode(tx, `CN-${s.branchCode}`));
  const doc = cashDiffJournal({ ...s, shortReason: settings.cashShortReason, overReason: settings.cashOverReason, partnerCode: partner?.code ?? null });
  if (!doc) return null;
  const head = { docKey: doc.docKey, docNo: doc.docNo, reasonCode: doc.lines[0]!.reasonCode, amount: doc.totals.total };
  let journal: JournalState;
  await ctx.data.module((tx) => sql`SAVEPOINT pos_cash_diff`.execute(tx));
  try {
    const r = await ctx.ledger.submit(doc);
    await ctx.data.module((tx) => sql`RELEASE SAVEPOINT pos_cash_diff`.execute(tx));
    journal = { ...head, status: r.status, ...('error' in r && r.error ? { error: r.error.message } : {}) };
  } catch (err) {
    if (!(err instanceof AppError) || (err.code !== 'POSTING_FAILED' && err.code !== 'VALIDATION_ERROR')) throw err;
    await ctx.data.module((tx) => sql`ROLLBACK TO SAVEPOINT pos_cash_diff`.execute(tx));
    journal = { ...head, status: 'not_created', error: err.message };
  }
  await ctx.data.module(async (tx) => {
    await sql`UPDATE mod_pos.shifts SET report = report || ${JSON.stringify({ journal })}::jsonb WHERE shift_id = ${s.shiftId}`.execute(tx);
  });
  return journal;
}
