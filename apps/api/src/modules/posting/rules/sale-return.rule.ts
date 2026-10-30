// @bizcity-layer K kernel/posting
/**
 * Luật định khoản HÀNG BÁN TRẢ LẠI (kể cả hoá đơn điều chỉnh giảm).
 *
 * Với mỗi dòng hàng (lý do mặc định: nhập trả hàng bán):
 *   Giảm doanh thu: Nợ TK hàng bán trả lại (5213…) / Có TK đối ứng (131…)   = tiền trước thuế
 *   Giảm thuế     : Nợ TK thuế đầu ra (33311)      / Có TK đối ứng          = tiền thuế
 *   Nhập lại kho  : Nợ TK kho                      / Có TK giá vốn          = giá vốn (nếu có)
 * Trả tiền lại khách — mỗi khoản một bút toán RIÊNG như phiếu chi trả tiền hàng bán trả lại:
 *   Nợ TK của lý do trả tiền (CNBL: 131…) / Có TK tiền của hình thức;
 *   số chứng từ = số phiếu chi (reference), lý do = lý do có cờ default "sale_refund" (CNBL).
 *
 * Số tiền trong chứng từ là số DƯƠNG (số hàng trả); dấu do luật quyết định.
 */
import type { SaleReturnDocument } from '@ketoan/contracts';
import type { DraftLine } from '../../ledger/ledger.types.js';
import { EntryBuilder } from '../entry-builder.js';
import type { RuleContext } from './sale.rule.js';
import type { PostingPart } from './stock.rule.js';

export function buildSaleReturnParts(doc: SaleReturnDocument, ctx: RuleContext): PostingPart[] {
  const { resolver, partnerId } = ctx;
  const reason = resolver.reason(doc.reasonCode, 'sale_return');
  const counter = resolver.counterAccount(reason);
  const payReason = resolver.defaultReason('sale_refund');
  const parts: PostingPart[] = [{ lines: buildReturnGoods(doc, ctx, reason, counter) }];

  for (const pay of doc.payments) {
    const { account, isReceivable, partnerId: holder } = resolver.paymentAccount(pay.methodCode);
    if (isReceivable || !account) continue;
    const b = new EntryBuilder();
    b.add({
      part: 'payment',
      debitAccount: payReason?.counter_account ?? counter,
      creditAccount: account,
      amount: Math.abs(pay.amount),
      debitPartnerId: partnerId,
      // Tài khoản của hình thức thanh toán: đối tượng nhận hộ nếu có, không thì khách (ví dụ voucher 1388).
      creditPartnerId: holder ?? partnerId,
      description: `Trả tiền khách (${pay.methodCode})`,
    });
    parts.push({
      lines: b.toLines(),
      docNo: pay.reference || doc.docNo,
      reasonCode: payReason?.code,
      description: `Trả tiền hàng bán trả lại ${doc.docNo}`,
      noInvoice: true,
      docType: 'customer_payment',
    });
  }

  resolver.assertComplete();
  return parts;
}

function buildReturnGoods(doc: SaleReturnDocument, ctx: RuleContext, reason: ReturnType<RuleContext['resolver']['reason']>, counter: string): DraftLine[] {
  const { resolver, partnerId } = ctx;
  const b = new EntryBuilder();
  for (const line of doc.lines) {
    const group = resolver.groupForSku(line.sku);
    const amount = Math.abs(line.amountBeforeTax);
    const tax = Math.abs(line.taxAmount);
    b.add({
      part: 'goods',
      productSku: line.sku,
      debitAccount: resolver.salesReturnAccount(reason, group),
      creditAccount: counter,
      amount,
      creditPartnerId: partnerId,
      taxCode: line.taxCode,
      description: 'Hàng bán bị trả lại',
    });
    b.add({
      part: 'tax',
      productSku: line.sku,
      debitAccount: resolver.outputTaxAccount(line.taxCode),
      creditAccount: counter,
      amount: tax,
      creditPartnerId: partnerId,
      taxCode: line.taxCode,
      description: 'Giảm thuế GTGT đầu ra',
    });
    // Giá vốn hàng trả KHÔNG ghi trên phiếu hoàn (22/10/2026) — vào phiếu giá vốn tháng; chỉ ghi khi nguồn gửi sẵn.
    if (line.cost !== undefined && line.cost !== 0) {
      b.add({
        part: 'cogs',
        productSku: line.sku,
        debitAccount: group.inventory_account,
        creditAccount: resolver.cogsAccount(reason, group, line.isGift),
        amount: Math.abs(line.cost),
        description: 'Nhập lại kho hàng trả',
      });
    }
  }
  return b.toLines();
}
