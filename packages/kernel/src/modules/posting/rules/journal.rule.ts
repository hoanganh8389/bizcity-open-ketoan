// @bizcity-layer K kernel/posting
// [2026-11-02 08:45 PM Johnny Chu - Chu Hoàng Anh] PHASE-011 — 3.15 (ADR-0015 Q1, K2): luật định khoản manual_journal theo lý do journal (đặc tả 50-DAC-TA-MANUAL-JOURNAL phương án A)
/**
 * Luật định khoản PHIẾU KẾ TOÁN MODULE LẬP (manual_journal). Module chỉ chọn lý do và số tiền; cặp tài khoản do kế toán khai
 * ở lý do loại "journal" (posting_reasons.debit_account / credit_account, migration 0058):
 *
 *   mỗi dòng: Nợ lý do.debit_account / Có lý do.credit_account, số tiền dòng, diễn giải dòng (trống = tên lý do)
 *   đối tượng: dòng có partnerCode → đối tượng đó; không có → đối tượng của chứng từ (partner). Sổ chỉ giữ đối tượng ở phía
 *              tài khoản theo dõi đối tượng; tài khoản bắt buộc đối tượng mà thiếu → sổ chặn (ledgerService, đặc tả K4).
 *   bút toán: một bút toán cho cả phiếu (gộp các dòng), chi nhánh của chứng từ.
 *
 * Lý do lạ, ngừng dùng, khác loại "journal", hoặc thiếu cặp tài khoản → lỗi định khoản (không đoán tài khoản).
 */
import type { ManualJournalDocument } from '@ketoan/contracts';
import { Errors } from '@bizcity/platform/core/errors';
import { EntryBuilder } from '../entry-builder.js';
import type { RuleContext } from './sale.rule.js';
import type { PostingPart } from './stock.rule.js';

export function buildManualJournalParts(doc: ManualJournalDocument, ctx: RuleContext): PostingPart[] {
  const eb = new EntryBuilder();
  for (const line of doc.lines) {
    const reason = ctx.resolver.reason(line.reasonCode, 'manual_journal');
    if (reason.kind !== 'journal') {
      throw Errors.posting(`Lý do ${reason.code} là loại "${reason.kind}", không dùng cho phiếu kế toán manual_journal (cần lý do loại "journal" có tài khoản Nợ / Có)`);
    }
    if (!reason.debit_account || !reason.credit_account) throw Errors.posting(`Lý do ${reason.code} chưa khai đủ tài khoản Nợ / Có`);
    const partnerId = line.partnerCode ? ctx.partners?.get(line.partnerCode) ?? null : ctx.partnerId;
    if (line.partnerCode && !partnerId) throw Errors.validation(`Đối tượng ${line.partnerCode} (dòng ${line.lineKey}) chưa có trong danh mục`);
    eb.add({
      part: 'other', debitAccount: reason.debit_account, creditAccount: reason.credit_account, amount: line.amount,
      debitPartnerId: partnerId, creditPartnerId: partnerId, description: line.description || reason.name,
    });
  }
  return [{ lines: eb.toLines() }];
}
