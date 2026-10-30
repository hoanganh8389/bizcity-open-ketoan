// @bizcity-layer K kernel/posting
/**
 * Luật định khoản PHIẾU KHO: chuyển kho và điều chỉnh kho. Giá trị ghi sổ là giá trị hàng theo
 * giá vốn (`amount` của dòng); dòng giá trị 0 vẫn ghi sẵn cặp số 0 theo mặt hàng (dòng chờ giá vốn), tính giá vốn
 * cuối tháng GHI ĐÈ số tiền lên chính dòng đó (không đảo bút toán).
 *
 * Chuyển kho (lý do mặc định: xuất chuyển kho) — mỗi chi nhánh một bút toán:
 *   Chi nhánh XUẤT (ghi ngay khi phiếu tạo):   Nợ TK hàng đang chuyển / Có TK kho
 *   Chi nhánh NHẬN (khi đã xác nhận nhận hàng): Nợ TK kho              / Có TK hàng đang chuyển
 *   TK hàng đang chuyển: lý do.counter_account → ngầm định "goods_in_transit" (1579) khi hai chi nhánh
 *   cùng đơn vị hạch toán; khác đơn vị hạch toán → ngầm định "internal_receivable_goods" (phải thu nội bộ hàng 13681; chưa đặt thì dùng phải thu nội bộ tiền).
 *   Đối tượng trên TK trung gian là chi nhánh bên kia, để đối chiếu từng cặp chi nhánh.
 *   Số dư TK hàng đang chuyển = hàng đã xuất mà nơi nhận chưa xác nhận.
 * Không có doanh thu, không có thuế: tổng hàng của công ty không đổi.
 * Phiếu một đầu (leg — phiếu xuất nội bộ / phiếu nhận nội bộ của từng cửa hàng): chỉ một bút toán ở chi nhánh của phiếu,
 *   'out': Nợ TK hàng đang chuyển / Có TK kho;  'in': Nợ TK kho / Có TK hàng đang chuyển. Đối tượng = chi nhánh bên kia (nếu biết).
 *
 * Điều chỉnh kho (lý do mặc định theo chiều):
 *   Tăng (kiểm kê thừa…): Nợ TK kho          / Có TK đối ứng (3381 thừa chờ xử lý…)
 *   Giảm (kiểm kê thiếu…): Nợ TK đối ứng (1381 thiếu chờ xử lý, 632, 641…) / Có TK kho
 */
import type { StockAdjustmentDocument, TransferDocument, DocType } from '@ketoan/contracts';
import type { DraftLine } from '../../ledger/ledger.types.js';
import { EntryBuilder } from '../entry-builder.js';
import type { RuleContext } from './sale.rule.js';

export interface PostingPart {
  /** Chi nhánh của bút toán; bỏ trống = chi nhánh của chứng từ. */
  branchId?: string;
  lines: DraftLine[];
  /** Bút toán thu / trả tiền đi kèm hoá đơn: số phiếu thu, lý do thu, diễn giải riêng (bỏ trống = theo chứng từ). */
  docNo?: string;
  reasonCode?: string;
  description?: string;
  /** Không gắn số hoá đơn (bút toán thu tiền). */
  noInvoice?: boolean;
  /**
   * Loại chứng từ của bút toán (bỏ trống = loại của chứng từ). Tiền thu / trả kèm phiếu bán, hoàn, mua, trả NCC là chứng từ
   * thanh toán riêng trên sổ (số = mã phiếu thu / chi): customer_payment (thanh toán khách hàng), supplier_payment
   * (thanh toán nhà cung cấp) — lọc sổ theo loại chứng từ tách được phiếu bán và phiếu thu.
   */
  docType?: DocType;
}

/**
 * Dòng chưa có giá trị (0 đồng): KHÔNG ghi (22/10/2026) — giá trị hàng chuyển / điều chỉnh theo giá vốn nằm ở phiếu
 * giá vốn tháng (costing.service, mỗi mã hàng một dòng). Dòng có sẵn giá trị (nguồn gửi kèm) vẫn ghi như cũ.
 */
const valued = (b: EntryBuilder, pair: Parameters<EntryBuilder['add']>[0]) => { if (pair.amount) b.add(pair); };

/** Tài khoản hàng tồn kho (15x trừ 157 hàng gửi đi / đang chuyển). */
const isInventoryAccount = (code: string | null | undefined) => Boolean(code && code.startsWith('15') && !code.startsWith('157'));

export function buildTransferParts(doc: TransferDocument, ctx: RuleContext): PostingPart[] {
  const { resolver } = ctx;
  const stock = ctx.stock;
  if (!stock) throw new Error('Thiếu ngữ cảnh chi nhánh của phiếu chuyển kho');
  if (!doc.leg && !stock.toBranchId) throw new Error('Thiếu chi nhánh nhận của phiếu chuyển kho');
  if (stock.toBranchId === stock.branchId) return []; // cùng chi nhánh: hàng không đổi chỗ trên sổ
  const picked = resolver.reason(doc.reasonCode, 'transfer');
  // Lý do lấy từ danh mục cũ có thể đặt đối ứng là chính tài khoản kho (1561): ghi Nợ 1561 / Có 1561 là vô nghĩa,
  // nên bỏ qua đối ứng đó và dùng tài khoản trung gian ngầm định (1579 hàng đang chuyển / 13681 phải thu nội bộ).
  const reason = isInventoryAccount(picked.counter_account) ? { ...picked, counter_account: null } : picked;
  const transit = stock.sameAccountingUnit
    ? resolver.counterOr(reason, 'goods_in_transit', 'tài khoản hàng đang chuyển giữa các chi nhánh')
    : resolver.counterOr(reason, 'internal_receivable_goods', 'tài khoản phải thu nội bộ hàng', 'internal_receivable');

  if (doc.leg) {
    const b = new EntryBuilder();
    const other = stock.toBranchPartnerId ?? null;
    for (const line of doc.lines) {
      const inventory = resolver.groupForSku(line.sku).inventory_account;
      const amount = Math.abs(line.amount);
      if (doc.leg === 'out') valued(b, { part: 'goods', productSku: line.sku, debitAccount: transit, creditAccount: inventory, amount, debitPartnerId: other, description: 'Xuất chuyển kho' });
      else valued(b, { part: 'goods', productSku: line.sku, debitAccount: inventory, creditAccount: transit, amount, creditPartnerId: other, description: 'Nhập chuyển kho' });
    }
    resolver.assertComplete();
    return [{ branchId: stock.branchId, lines: b.toLines() }].filter((p) => p.lines.length);
  }

  const out = new EntryBuilder();
  const into = new EntryBuilder();
  for (const line of doc.lines) {
    const inventory = resolver.groupForSku(line.sku).inventory_account;
    const amount = Math.abs(line.amount);
    valued(out, { part: 'goods', productSku: line.sku, debitAccount: transit, creditAccount: inventory, amount, debitPartnerId: stock.toBranchPartnerId, description: 'Xuất chuyển kho' });
    if (doc.status === 'received') {
      valued(into, { part: 'goods', productSku: line.sku, debitAccount: inventory, creditAccount: transit, amount, creditPartnerId: stock.branchPartnerId, description: 'Nhập chuyển kho' });
    }
  }
  resolver.assertComplete();
  const parts: PostingPart[] = [{ branchId: stock.branchId, lines: out.toLines() }];
  if (doc.status === 'received') parts.push({ branchId: stock.toBranchId, lines: into.toLines() });
  return parts.filter((p) => p.lines.length);
}

export function buildStockAdjustmentLines(doc: StockAdjustmentDocument, ctx: RuleContext): DraftLine[] {
  const { resolver } = ctx;
  // Chiều của từng dòng: theo chứng từ, riêng 'mixed' theo dấu số lượng. Tài khoản đối ứng tra theo chiều (3381 / 1381…).
  const incOf = (qty: number) => (doc.direction === 'mixed' ? qty > 0 : doc.direction === 'increase');
  const counters = new Map<boolean, string>();
  const counterOf = (increase: boolean) => {
    if (!counters.has(increase)) {
      const reason = resolver.reason(doc.reasonCode, `stock_adjustment:${increase ? 'increase' : 'decrease'}`);
      counters.set(increase, increase
        ? resolver.counterOr(reason, 'stock_surplus', 'tài khoản hàng thừa chờ xử lý')
        : resolver.counterOr(reason, 'stock_shortage', 'tài khoản hàng thiếu chờ xử lý'));
    }
    return counters.get(increase)!;
  };
  // Tài khoản đối ứng theo dõi đối tượng (1381, 3381…): người chịu trách nhiệm nếu chứng từ ghi, không thì chính chi nhánh.
  const partner = ctx.partnerId ?? ctx.stock?.branchPartnerId ?? null;
  const b = new EntryBuilder();
  for (const line of doc.lines) {
    const inventory = resolver.groupForSku(line.sku).inventory_account;
    const amount = Math.abs(line.amount);
    const increase = incOf(line.qty);
    const counter = counterOf(increase);
    if (increase) valued(b, { part: 'goods', productSku: line.sku, debitAccount: inventory, creditAccount: counter, amount, creditPartnerId: partner, description: 'Điều chỉnh tăng kho' });
    else valued(b, { part: 'goods', productSku: line.sku, debitAccount: counter, creditAccount: inventory, amount, debitPartnerId: partner, description: 'Điều chỉnh giảm kho' });
  }
  resolver.assertComplete();
  return b.toLines();
}
