/**
 * Luật định khoản HOÁ ĐƠN BÁN HÀNG.
 *
 * Với mỗi dòng hàng (lý do mặc định: xuất bán):
 *   Tiền hàng : Nợ TK đối ứng (131…)       / Có TK doanh thu      = tiền trước thuế (đã trừ chiết khấu)
 *   Thuế      : Nợ TK đối ứng              / Có TK thuế đầu ra    = tiền thuế của dòng
 *   Giá vốn   : Nợ TK giá vốn (hoặc CP KM) / Có TK kho            = giá vốn của dòng; chưa có thì ghi sẵn số 0
 *               (dòng chờ giá vốn), tính giá vốn cuối tháng ghi đè số tiền — không đảo bút toán
 * Với mỗi khoản thanh toán (không phải ghi nợ) — một bút toán RIÊNG như phiếu thu tiền khách:
 *   Thu tiền  : Nợ TK tiền của hình thức   / Có TK của lý do thu (TTBHK: 131…) = số tiền
 *   số chứng từ = số phiếu thu (reference), lý do = lý do thu mặc định.
 *
 * Lý do có cờ costAtSalePrice (bán cho chi nhánh khác — XCN): giá vốn ghi ngay, bằng TIỀN HÀNG (giá bán),
 * và không tính vào đơn giá vốn bình quân của tháng.
 *
 * Chiết khấu không ghi riêng (đã trừ trong tiền hàng). Dòng tiền âm tự đổi bên.
 * Đối tượng gắn vào phía TK đối ứng (công nợ).
 */
import type { SaleDocument } from '@ketoan/contracts';
import type { DraftLine } from '../../ledger/ledger.types.js';
import type { AccountResolver } from '../account-resolver.js';
import { EntryBuilder } from '../entry-builder.js';
import type { PostingPart } from './stock.rule.js';

export interface RuleContext {
  resolver: AccountResolver;
  partnerId: string | null;
  /** Ngữ cảnh phiếu kho (chuyển kho, điều chỉnh kho). */
  stock?: StockContext;
}

export interface BranchRef {
  id: string;
  code: string;
  /** Đối tượng đại diện cho chi nhánh. */
  partnerId: string;
}

/** Ngữ cảnh chi nhánh của chứng từ liên quan nhiều chi nhánh (chuyển kho, chuyển tiền, thu hộ, trả hộ). */
export interface StockContext {
  branchId: string;
  branchCode: string;
  /** Đối tượng đại diện cho chi nhánh (dùng trên tài khoản nội bộ theo dõi đối tượng). */
  branchPartnerId: string;
  toBranchId?: string;
  toBranchPartnerId?: string;
  /** Hai chi nhánh cùng đơn vị hạch toán. */
  sameAccountingUnit?: boolean;
  /** Các chi nhánh khác được nhắc trên chứng từ, theo mã (thu hộ, trả hộ). */
  refs?: Map<string, BranchRef>;
}

/**
 * Hoá đơn bán → các phần bút toán: một bút toán hàng (tiền hàng, thuế, giá vốn; lý do xuất của hoá đơn) và
 * mỗi khoản thu tiền một bút toán riêng như phiếu thu tiền khách: số chứng từ = số phiếu thu, lý do = lý do thu
 * mặc định (TTBHK), Có tài khoản ngầm định của lý do thu (không có thì tài khoản đối ứng của hoá đơn).
 */
export function buildSaleParts(doc: SaleDocument, ctx: RuleContext): PostingPart[] {
  const { resolver, partnerId } = ctx;
  const reason = resolver.reason(doc.reasonCode, 'sale');
  const counter = resolver.counterAccount(reason);
  const payReason = resolver.defaultReason('receipt');
  const parts: PostingPart[] = [{ lines: buildSaleGoods(doc, ctx, reason, counter) }];
  for (const pay of doc.payments) {
    const { account, isReceivable, partnerId: holder } = resolver.paymentAccount(pay.methodCode);
    if (isReceivable || !account) continue; // ghi nợ: để nguyên trên TK đối ứng
    const b = new EntryBuilder();
    b.add({
      part: 'payment',
      debitAccount: account,
      creditAccount: payReason?.counter_account ?? counter,
      amount: pay.amount,
      // Phía tài khoản tiền: đối tượng nhận hộ của hình thức (QR, thẻ vào tài khoản công ty → 13681 chi tiết công ty),
      // không có thì gắn khách (ví dụ voucher ghi vào 1388). Tài khoản không theo dõi đối tượng thì sổ số dư bỏ qua.
      debitPartnerId: holder ?? partnerId,
      creditPartnerId: partnerId,
      description: `Thu tiền (${pay.methodCode})`,
    });
    parts.push({
      lines: b.toLines(),
      docNo: pay.reference || doc.docNo,
      reasonCode: payReason?.code,
      description: `Thu tiền bán hàng ${doc.docNo}`,
      noInvoice: true,
      docType: 'customer_payment',
    });
  }
  resolver.assertComplete();
  return parts;
}

function buildSaleGoods(doc: SaleDocument, ctx: RuleContext, reason: ReturnType<RuleContext['resolver']['reason']>, counter: string): DraftLine[] {
  const { resolver, partnerId } = ctx;
  const atSalePrice = Boolean((reason.flags as Record<string, unknown> | null)?.costAtSalePrice);
  const b = new EntryBuilder();

  for (const line of doc.lines) {
    const group = resolver.groupForSku(line.sku);
    b.add({
      part: 'goods',
      productSku: line.sku,
      debitAccount: counter,
      creditAccount: resolver.revenueAccount(reason, group),
      amount: line.amountBeforeTax,
      debitPartnerId: partnerId,
      taxCode: line.taxCode,
      description: 'Doanh thu bán hàng',
    });
    b.add({
      part: 'tax',
      productSku: line.sku,
      debitAccount: counter,
      creditAccount: resolver.outputTaxAccount(line.taxCode),
      amount: line.taxAmount,
      debitPartnerId: partnerId,
      taxCode: line.taxCode,
      description: 'Thuế GTGT đầu ra',
    });
    const cost = atSalePrice ? line.amountBeforeTax : line.cost;
    // Giá vốn KHÔNG ghi trên phiếu bán (22/10/2026): tính giá vốn tháng sinh một phiếu giá vốn riêng liệt kê từng mã
    // hàng (costing.service). Chỉ ghi ở đây khi hệ thống nguồn đã gửi sẵn giá vốn (vd. giá vốn nội bộ theo giá bán).
    if (cost !== undefined && cost !== 0) {
      b.add({
        part: 'cogs',
        productSku: line.sku,
        debitAccount: resolver.cogsAccount(reason, group, line.isGift),
        creditAccount: group.inventory_account,
        amount: cost,
        description: atSalePrice ? 'Giá vốn hàng bán nội bộ (theo giá bán)' : line.isGift ? 'Giá vốn hàng khuyến mãi' : 'Giá vốn hàng bán',
      });
    }
  }
  return b.toLines();
}
