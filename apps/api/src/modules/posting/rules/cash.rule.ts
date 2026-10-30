// @bizcity-layer K kernel/posting
/**
 * Luật định khoản PHIẾU TIỀN. Tài khoản tiền mỗi phía lấy theo hình thức thanh toán (TM → 1111, CK → 112…).
 *
 * Chuyển tiền (lý do chi = reasonCode, lý do thu = toReasonCode; lý do có cờ postToLedger = false — CPCT, TPCT
 * chép từ HTsoft — coi như không chọn, dùng lý do mặc định "chuyển tiền giữa chi nhánh"):
 *   TK tiền mỗi phía: mã tài khoản ngân hàng (fromBankCode / toBankCode) → TK của ngân hàng; không có → theo hình thức.
 *   Khác chi nhánh — mỗi chi nhánh một bút toán; nơi CHUYỂN ghi ngay, nơi NHẬN ghi khi status = received:
 *     Qua tiền đang chuyển (cùng đơn vị hạch toán, mặc định):
 *       Nơi chuyển: Nợ 11319 (đối tượng nơi nhận) / Có TK tiền phía chuyển
 *       Nơi nhận:   Nợ TK tiền phía nhận / Có 11319 (đối tượng nơi chuyển)
 *       (lý do chi có TK đối ứng khác 13681 / 33681 thì dùng TK đó thay cho 11319)
 *     Cấp tiền nội bộ (khác đơn vị hạch toán, mặc định; hoặc lý do thu có TK đối ứng 33681):
 *       Nơi chuyển: Nợ 13681 phải thu nội bộ (nơi nhận) / Có TK tiền;  Nơi nhận: Nợ TK tiền / Có 33681 phải trả nội bộ (nơi chuyển)
 *     Trả nợ nội bộ (lý do thu có TK đối ứng 13681 — TBNH "Thu tiền BH các CN khác"; hoặc lý do chi đối ứng 33681):
 *       Nơi chuyển: Nợ 33681 phải trả nội bộ (nơi nhận) / Có TK tiền;  Nơi nhận: Nợ TK tiền / Có 13681 phải thu nội bộ (nơi chuyển)
 *     Lý do thu có TK đối ứng khác (1311, 13888…): chưa có cách hạch toán phía chuyển cho cân → lỗi định khoản, chờ kế toán.
 *   Cùng chi nhánh (nộp tiền quỹ vào ngân hàng, rút tiền…): Nợ TK tiền phía nhận / Có TK tiền phía chuyển.
 *
 * Thu tiền khách hàng (lý do mặc định: thu tiền khách hàng; TK đối ứng = lý do.counter_account → "receivable"):
 *   Khoản trả cho công nợ cùng chi nhánh: Nợ TK tiền / Có TK phải thu (theo khách)
 *   THU HỘ công nợ của chi nhánh B, lập phiếu tại A:
 *     tại A: Nợ TK tiền            / Có TK phải trả nội bộ (33681, đối tượng chi nhánh B)
 *     tại B: Nợ TK phải thu nội bộ (13681, đối tượng chi nhánh A) / Có TK phải thu (theo khách)
 *   Thu thừa (tổng phiếu > tổng phân bổ): Nợ TK tiền / Có TK phải thu, tại chi nhánh lập phiếu.
 *
 * Trả tiền nhà cung cấp là ảnh đối xứng (TK đối ứng = lý do.counter_account → "payable"):
 *   cùng chi nhánh: Nợ TK phải trả (theo NCC) / Có TK tiền
 *   TRẢ HỘ cho B, lập phiếu tại A: tại A Nợ 13681 (chi nhánh B) / Có TK tiền; tại B Nợ TK phải trả (NCC) / Có 33681 (chi nhánh A)
 *   trả thừa: Nợ TK phải trả / Có TK tiền, tại chi nhánh lập phiếu (một lần).
 */
import type { CashTransferDocument, CustomerPaymentDocument, SupplierPaymentDocument } from '@ketoan/contracts';
import { Errors } from '../../../core/errors.js';
import { EntryBuilder } from '../entry-builder.js';
import type { RuleContext } from './sale.rule.js';
import type { PostingPart } from './stock.rule.js';

function cashAccount(ctx: RuleContext, methodCode: string): string {
  const { account, isReceivable } = ctx.resolver.paymentAccount(methodCode);
  if (isReceivable) throw Errors.posting(`Hình thức ${methodCode} là ghi nợ, không phải tiền: không dùng cho phiếu tiền`);
  return account;
}

/** Lý do có ghi sổ: không truyền mã, hoặc lý do đánh dấu không ghi sổ (postToLedger = false) → undefined. */
function postingReason(ctx: RuleContext, code: string | undefined, docType: string) {
  if (!code) return undefined;
  const r = ctx.resolver.reason(code, docType);
  return (r.flags as Record<string, unknown> | null)?.postToLedger === false ? undefined : r;
}

export function buildCashTransferParts(doc: CashTransferDocument, ctx: RuleContext): PostingPart[] {
  const { resolver } = ctx;
  const b = ctx.stock;
  if (!b?.toBranchId) throw Errors.posting('Thiếu chi nhánh nhận của phiếu chuyển tiền');
  const from = doc.fromBankCode ? resolver.bankAccount(doc.fromBankCode) : cashAccount(ctx, doc.fromMethodCode);
  const to = doc.toBankCode ? resolver.bankAccount(doc.toBankCode) : cashAccount(ctx, doc.toMethodCode);
  const amount = Math.abs(doc.totals.total);

  if (b.toBranchId === b.branchId) {
    resolver.assertComplete();
    if (from === to) return []; // cùng chi nhánh, cùng tài khoản tiền: không có gì đổi chỗ trên sổ
    return [{ lines: new EntryBuilder().add({ part: 'payment', debitAccount: to, creditAccount: from, amount, description: 'Chuyển tiền nội bộ chi nhánh' }).toLines() }];
  }

  const sendReason = postingReason(ctx, doc.reasonCode, 'cash_transfer') ?? resolver.reason(undefined, 'cash_transfer');
  const recvReason = postingReason(ctx, doc.toReasonCode, 'cash_transfer');
  // Tài khoản nội bộ, tiền đang chuyển: so sánh bằng peekDefault, chỉ ghi "thiếu cấu hình" khi thật sự dùng.
  const ir = () => resolver.defaultAccount('internal_receivable', 'tài khoản phải thu nội bộ');
  const ip = () => resolver.defaultAccount('internal_payable', 'tài khoản phải trả nội bộ');
  const transit = () => resolver.defaultAccount('cash_in_transit', 'tài khoản tiền đang chuyển giữa các chi nhánh');
  const irCode = resolver.peekDefault('internal_receivable');
  const ipCode = resolver.peekDefault('internal_payable');
  const sendCounter = sendReason.counter_account;
  const recvCounter = recvReason?.counter_account;

  // Cặp tài khoản trung gian: [Nợ ở nơi chuyển, Có ở nơi nhận].
  let pair: [string, string];
  if (recvCounter) {
    if (recvCounter === irCode) pair = [ip(), recvCounter]; // trả nợ nội bộ
    else if (recvCounter === ipCode) pair = [ir(), recvCounter]; // cấp tiền nội bộ
    else if (recvCounter === (sendCounter ?? resolver.peekDefault('cash_in_transit'))) pair = [recvCounter, recvCounter];
    else throw Errors.posting(`Lý do thu ${recvReason!.code} (tài khoản đối ứng ${recvCounter}) chưa dùng được cho chuyển tiền giữa chi nhánh: chưa có cách hạch toán phía chuyển — cần kế toán xác nhận`);
  } else if (sendCounter && sendCounter === ipCode) pair = [sendCounter, ir()];
  else if (sendCounter && sendCounter === irCode) pair = [sendCounter, ip()];
  else if (sendCounter) pair = [sendCounter, sendCounter];
  else if (b.sameAccountingUnit) pair = [transit(), transit()];
  else pair = [ir(), ip()];
  resolver.assertComplete();

  const parts: PostingPart[] = [
    { branchId: b.branchId, lines: new EntryBuilder().add({ part: 'payment', debitAccount: pair[0], creditAccount: from, amount, debitPartnerId: b.toBranchPartnerId, description: `Chuyển tiền cho ${doc.toBranchCode}` }).toLines() },
  ];
  if (doc.status === 'received') {
    parts.push({
      branchId: b.toBranchId,
      reasonCode: doc.toReasonCode || undefined,
      lines: new EntryBuilder().add({ part: 'payment', debitAccount: to, creditAccount: pair[1], amount, creditPartnerId: b.branchPartnerId, description: `Nhận tiền từ ${doc.branchCode}` }).toLines(),
    });
  }
  return parts;
}

/** Thu tiền khách / trả tiền nhà cung cấp, kể cả thu hộ / trả hộ chi nhánh khác. */
export function buildPaymentParts(doc: CustomerPaymentDocument | SupplierPaymentDocument, ctx: RuleContext): PostingPart[] {
  const { resolver, partnerId } = ctx;
  const b = ctx.stock;
  if (!b) throw Errors.posting('Thiếu ngữ cảnh chi nhánh của phiếu');
  const customer = doc.docType === 'customer_payment';
  // receipt = tiền vào (thu tiền khách; nhà cung cấp trả lại tiền); ngược lại là tiền ra (trả NCC; chi trả tiền khách).
  const receipt = doc.direction ? doc.direction === 'in' : customer;
  const reason = resolver.reason(doc.reasonCode, doc.docType);
  const counter = customer ? resolver.counterAccount(reason) : resolver.counterOr(reason, 'payable', 'tài khoản phải trả nhà cung cấp');
  const what = customer ? (receipt ? 'Thu tiền khách hàng' : 'Chi trả tiền khách hàng') : receipt ? 'Nhà cung cấp trả lại tiền' : 'Trả tiền nhà cung cấp';
  const cash = cashAccount(ctx, doc.methodCode);
  const builders = new Map<string, EntryBuilder>();
  const at = (branchId: string) => {
    if (!builders.has(branchId)) builders.set(branchId, new EntryBuilder());
    return builders.get(branchId)!;
  };
  const sameBranch = (amount: number, description: string) =>
    receipt
      ? at(b.branchId).add({ part: 'payment', debitAccount: cash, creditAccount: counter, amount, debitPartnerId: partnerId, creditPartnerId: partnerId, description })
      : at(b.branchId).add({ part: 'payment', debitAccount: counter, creditAccount: cash, amount, debitPartnerId: partnerId, creditPartnerId: partnerId, description });

  let allocated = 0;
  for (const line of doc.lines) {
    allocated += line.amount;
    const target = line.branchCode ? b.refs?.get(line.branchCode) : undefined;
    if (!target || target.id === b.branchId) {
      sameBranch(line.amount, line.description ?? what);
      continue;
    }
    const ir = resolver.defaultAccount('internal_receivable', 'tài khoản phải thu nội bộ');
    const ip = resolver.defaultAccount('internal_payable', 'tài khoản phải trả nội bộ');
    if (receipt) {
      at(b.branchId).add({ part: 'payment', debitAccount: cash, creditAccount: ip, amount: line.amount, debitPartnerId: partnerId, creditPartnerId: target.partnerId, description: `Thu hộ ${target.code}` });
      at(target.id).add({ part: 'payment', debitAccount: ir, creditAccount: counter, amount: line.amount, debitPartnerId: b.branchPartnerId, creditPartnerId: partnerId, description: `${b.branchCode} thu hộ` });
    } else {
      at(b.branchId).add({ part: 'payment', debitAccount: ir, creditAccount: cash, amount: line.amount, debitPartnerId: target.partnerId, creditPartnerId: partnerId, description: `Trả hộ ${target.code}` });
      at(target.id).add({ part: 'payment', debitAccount: counter, creditAccount: ip, amount: line.amount, debitPartnerId: partnerId, creditPartnerId: b.branchPartnerId, description: `${b.branchCode} trả hộ` });
    }
  }
  const rest = doc.totals.total - allocated;
  if (rest > 0.004) sameBranch(rest, `${what}: phần chưa phân bổ, ghi vào công nợ ${customer ? 'khách' : 'nhà cung cấp'}`);

  resolver.assertComplete();
  return [...builders].map(([branchId, eb]) => ({ branchId, lines: eb.toLines() }));
}
