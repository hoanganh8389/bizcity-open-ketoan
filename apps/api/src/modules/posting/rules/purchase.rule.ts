// @bizcity-layer K kernel/posting
// [2026-10-29 10:24 PM Johnny Chu - Chu Hoàng Anh] INIT — khởi tạo Bizcity Core Framework: sổ cái chỉ thêm, cửa nạp sự việc, CANON, hợp đồng, bộ kiểm chuẩn.
// [2026-10-30 09:58 AM Johnny Chu - Chu Hoàng Anh] PHASE-002 — nhãn lớp @bizcity-layer, đồ thị phụ thuộc mốc, bản nháp API module-sdk.
/**
 * Luật định khoản NHẬP MUA HÀNG và TRẢ HÀNG NHÀ CUNG CẤP.
 *
 * Nhập mua, với mỗi dòng hàng (lý do mặc định: nhập mua hàng):
 *   Tiền hàng : Nợ TK kho (1561…)        / Có TK phải trả NCC (3312…)   = tiền trước thuế (đã trừ chiết khấu)
 *               (lý do có tài khoản chi phí → mua thẳng vào chi phí: Nợ TK chi phí thay cho TK kho)
 *   Thuế      : Nợ TK thuế đầu vào (1331) / Có TK phải trả NCC           = tiền thuế của dòng
 * Trả tiền ngay (hình thức không phải ghi nợ): mỗi khoản một bút toán RIÊNG, loại chứng từ "thanh toán nhà cung cấp",
 * số = mã phiếu chi (như phiếu thanh toán NCC tách khỏi phiếu nhập):
 *   Nợ TK phải trả NCC / Có TK tiền của hình thức.
 *
 * Trả hàng nhà cung cấp là ảnh ngược: Nợ TK phải trả NCC / Có TK kho, Có TK thuế đầu vào;
 * nhà cung cấp trả lại tiền: Nợ TK tiền / Có TK phải trả NCC. Số tiền trong chứng từ là số DƯƠNG.
 *
 * Nhập mua không sinh dòng giá vốn: giá trị hàng nhập vào kho chính là tiền hàng.
 * Đối tượng (nhà cung cấp) gắn vào phía tài khoản phải trả.
 */
import type { PurchaseDocument, PurchaseReturnDocument } from '@ketoan/contracts';
import type { DraftLine } from '../../ledger/ledger.types.js';
import type { PostingPart } from './stock.rule.js';
import { EntryBuilder } from '../entry-builder.js';
import type { RuleContext } from './sale.rule.js';

export function buildPurchaseParts(doc: PurchaseDocument, ctx: RuleContext): PostingPart[] {
  const { resolver, partnerId } = ctx;
  const reason = resolver.reason(doc.reasonCode, 'purchase');
  const payable = resolver.counterOr(reason, 'payable', 'tài khoản phải trả nhà cung cấp');
  const b = new EntryBuilder();

  for (const line of doc.lines) {
    const group = resolver.groupForSku(line.sku);
    b.add({
      part: 'goods',
      productSku: line.sku,
      debitAccount: reason.expense_account ?? group.inventory_account,
      creditAccount: payable,
      amount: line.amountBeforeTax,
      creditPartnerId: partnerId,
      taxCode: line.taxCode,
      description: reason.expense_account ? 'Mua hàng, dịch vụ vào chi phí' : 'Nhập mua hàng',
    });
    b.add({
      part: 'tax',
      productSku: line.sku,
      debitAccount: resolver.inputTaxAccount(line.taxCode, line.taxAmount),
      creditAccount: payable,
      amount: line.taxAmount,
      creditPartnerId: partnerId,
      taxCode: line.taxCode,
      description: 'Thuế GTGT đầu vào',
    });
  }

  const parts: PostingPart[] = [{ lines: b.toLines() }];
  for (const pay of doc.payments) {
    const { account, isReceivable, partnerId: holder } = resolver.paymentAccount(pay.methodCode);
    if (isReceivable || !account) continue; // ghi nợ: để nguyên trên TK phải trả
    const p = new EntryBuilder();
    p.add({
      part: 'payment',
      debitAccount: payable,
      creditAccount: account,
      amount: pay.amount,
      debitPartnerId: partnerId,
      creditPartnerId: holder ?? partnerId,
      description: `Trả tiền nhà cung cấp (${pay.methodCode})`,
    });
    parts.push({ lines: p.toLines(), docNo: pay.reference || doc.docNo, description: `Trả tiền nhập mua ${doc.docNo}`, noInvoice: true, docType: 'supplier_payment' });
  }

  resolver.assertComplete();
  return parts;
}

export function buildPurchaseReturnParts(doc: PurchaseReturnDocument, ctx: RuleContext): PostingPart[] {
  const { resolver, partnerId } = ctx;
  const reason = resolver.reason(doc.reasonCode, 'purchase_return');
  const payable = resolver.counterOr(reason, 'payable', 'tài khoản phải trả nhà cung cấp');
  const b = new EntryBuilder();

  for (const line of doc.lines) {
    const group = resolver.groupForSku(line.sku);
    b.add({
      part: 'goods',
      productSku: line.sku,
      debitAccount: payable,
      creditAccount: reason.expense_account ?? group.inventory_account,
      amount: Math.abs(line.amountBeforeTax),
      debitPartnerId: partnerId,
      taxCode: line.taxCode,
      description: 'Trả hàng nhà cung cấp',
    });
    b.add({
      part: 'tax',
      productSku: line.sku,
      debitAccount: payable,
      creditAccount: resolver.inputTaxAccount(line.taxCode, line.taxAmount),
      amount: Math.abs(line.taxAmount),
      debitPartnerId: partnerId,
      taxCode: line.taxCode,
      description: 'Giảm thuế GTGT đầu vào',
    });
  }

  const parts: PostingPart[] = [{ lines: b.toLines() }];
  for (const pay of doc.payments) {
    const { account, isReceivable, partnerId: holder } = resolver.paymentAccount(pay.methodCode);
    if (isReceivable || !account) continue;
    const p = new EntryBuilder();
    p.add({
      part: 'payment',
      debitAccount: account,
      creditAccount: payable,
      amount: Math.abs(pay.amount),
      debitPartnerId: holder ?? partnerId,
      creditPartnerId: partnerId,
      description: `Nhà cung cấp trả lại tiền (${pay.methodCode})`,
    });
    parts.push({ lines: p.toLines(), docNo: pay.reference || doc.docNo, description: `Nhà cung cấp trả lại tiền ${doc.docNo}`, noInvoice: true, docType: 'supplier_payment' });
  }

  resolver.assertComplete();
  return parts;
}
