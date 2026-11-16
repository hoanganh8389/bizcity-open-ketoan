// @bizcity-layer K kernel/posting
// [2026-10-29 10:24 PM Johnny Chu - Chu Hoàng Anh] INIT — khởi tạo Bizcity Core Framework: sổ cái chỉ thêm, cửa nạp sự việc, CANON, hợp đồng, bộ kiểm chuẩn.
// [2026-10-30 09:58 AM Johnny Chu - Chu Hoàng Anh] PHASE-002 — nhãn lớp @bizcity-layer, đồ thị phụ thuộc mốc, bản nháp API module-sdk.
// [2026-11-01 04:39 PM Johnny Chu - Chu Hoàng Anh] PHASE-010 — dời từ apps/api/src/modules/posting/rules/stock.rule.ts sang packages/kernel (@bizcity/kernel, D010-7 chặng 3); import Platform qua @bizcity/platform
// [2026-11-10 02:00 PM Nguyễn Văn Thủy] PHASE-026 — gắn nhãn cặp (nghiệp vụ, hàng tặng, chương trình, hình thức) để áp bảng quy tắc định khoản (đóng góp)
/**
 * Luật định khoản PHIẾU KHO: chuyển kho và điều chỉnh kho. Giá trị ghi sổ là giá trị hàng theo
 * giá vốn (`amount` của dòng); dòng giá trị 0 vẫn ghi sẵn cặp số 0 theo mặt hàng (dòng chờ giá vốn), tính giá vốn
 * cuối tháng GHI ĐÈ số tiền lên chính dòng đó (không đảo bút toán).
 *
 * Chuyển kho (lý do mặc định: xuất chuyển kho) — mỗi chi nhánh một bút toán:
 *   Chi nhánh XUẤT (ghi ngay khi phiếu tạo):   Nợ TK hàng đang chuyển / Có TK kho
 *   Chi nhánh NHẬN (khi đã xác nhận nhận hàng): Nợ TK kho              / Có TK hàng đang chuyển
 *   TK hàng đang chuyển: "goods_in_transit" của Quy tắc hạch toán (1579) khi hai chi nhánh
 *   cùng đơn vị hạch toán; khác đơn vị hạch toán → ngầm định "internal_receivable_goods" (phải thu nội bộ hàng 13681; chưa đặt thì dùng phải thu nội bộ tiền).
 *   Đối tượng trên TK trung gian là chi nhánh bên kia, để đối chiếu từng cặp chi nhánh.
 *   Số dư TK hàng đang chuyển = hàng đã xuất mà nơi nhận chưa xác nhận.
 * Không có doanh thu, không có thuế: tổng hàng của công ty không đổi.
 * Phiếu một đầu (leg — phiếu xuất nội bộ / phiếu nhận nội bộ của từng cửa hàng): chỉ một bút toán ở chi nhánh của phiếu,
 *   'out': Nợ TK hàng đang chuyển / Có TK kho;  'in': Nợ TK kho / Có TK hàng đang chuyển. Đối tượng = chi nhánh bên kia (nếu biết).
 *
 * Điều chỉnh kho / xuất kho không bán:
 *   Tăng (kiểm kê thừa…): Nợ TK kho          / Có TK đối ứng
 *   Giảm (kiểm kê thiếu, hủy, dùng…): Nợ TK đối ứng / Có TK kho
 *   TK đối ứng: Mục đích xuất của phiếu (purposeCode: hủy hàng hỏng 6328, dùng BP bán hàng 64128…);
 *   không có mục đích → thừa chờ xử lý (3381) / thiếu chờ xử lý (1381) của Quy tắc hạch toán.
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

export function buildTransferParts(doc: TransferDocument, ctx: RuleContext): PostingPart[] {
  const { resolver } = ctx;
  const stock = ctx.stock;
  if (!stock) throw new Error('Thiếu ngữ cảnh chi nhánh của phiếu chuyển kho');
  if (!doc.leg && !stock.toBranchId) throw new Error('Thiếu chi nhánh nhận của phiếu chuyển kho');
  if (stock.toBranchId === stock.branchId) return []; // cùng chi nhánh: hàng không đổi chỗ trên sổ
  const transit = stock.sameAccountingUnit
    ? resolver.counterOr(undefined, 'goods_in_transit', 'tài khoản hàng đang chuyển giữa các chi nhánh')
    : resolver.counterOr(undefined, 'internal_receivable_goods', 'tài khoản phải thu nội bộ hàng', 'internal_receivable');

  if (doc.leg) {
    const b = new EntryBuilder();
    const other = stock.toBranchPartnerId ?? null;
    for (const line of doc.lines) {
      // Phiếu một đầu: kho của dòng (xuất: warehouseCode; nhận: toWarehouseCode, trống thì warehouseCode) ở chi nhánh của phiếu.
      const wh = resolver.warehouseAccount(doc.leg === 'in' ? line.toWarehouseCode || line.warehouseCode : line.warehouseCode, doc.branchCode);
      const inventory = wh ?? resolver.groupForSku(line.sku).inventory_account;
      const amount = Math.abs(line.amount);
      const tags = { biz: 'transfer', reason: doc.reasonCode ?? null, leg: doc.leg, sameUnit: Boolean(stock.sameAccountingUnit), ...(wh ? (doc.leg === 'out' ? { whCredit: true } : { whDebit: true }) : {}) };
      if (doc.leg === 'out') valued(b, { tags, part: 'goods', productSku: line.sku, debitAccount: transit, creditAccount: inventory, amount, debitPartnerId: other, description: 'Xuất chuyển kho' });
      else valued(b, { tags, part: 'goods', productSku: line.sku, debitAccount: inventory, creditAccount: transit, amount, creditPartnerId: other, description: 'Nhập chuyển kho' });
    }
    resolver.assertComplete();
    return [{ branchId: stock.branchId, lines: b.toLines() }].filter((p) => p.lines.length);
  }

  const out = new EntryBuilder();
  const into = new EntryBuilder();
  for (const line of doc.lines) {
    const base = resolver.groupForSku(line.sku).inventory_account;
    const whOut = resolver.warehouseAccount(line.warehouseCode, doc.branchCode);
    const whIn = resolver.warehouseAccount(line.toWarehouseCode, doc.toBranchCode);
    const amount = Math.abs(line.amount);
    const same = Boolean(stock.sameAccountingUnit);
    valued(out, { tags: { biz: 'transfer', reason: doc.reasonCode ?? null, leg: 'out', sameUnit: same, ...(whOut ? { whCredit: true } : {}) }, part: 'goods', productSku: line.sku, debitAccount: transit, creditAccount: whOut ?? base, amount, debitPartnerId: stock.toBranchPartnerId, description: 'Xuất chuyển kho' });
    if (doc.status === 'received') {
      valued(into, { tags: { biz: 'transfer', reason: doc.reasonCode ?? null, leg: 'in', sameUnit: same, ...(whIn ? { whDebit: true } : {}) }, part: 'goods', productSku: line.sku, debitAccount: whIn ?? base, creditAccount: transit, amount, creditPartnerId: stock.branchPartnerId, description: 'Nhập chuyển kho' });
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
  // [2026-11-15 Nguyễn Văn Thủy] TK đối ứng: Mục đích xuất của phiếu → không có thì thừa / thiếu chờ xử lý của quy tắc (đóng góp)
  const counterOf = (increase: boolean) => {
    if (!counters.has(increase)) {
      counters.set(increase, doc.purposeCode
        ? resolver.purposeAccount(doc.purposeCode, increase)
        : increase
          ? resolver.counterOr(undefined, 'stock_surplus', 'tài khoản hàng thừa chờ xử lý')
          : resolver.counterOr(undefined, 'stock_shortage', 'tài khoản hàng thiếu chờ xử lý'));
    }
    return counters.get(increase)!;
  };
  // Tài khoản đối ứng theo dõi đối tượng (1381, 3381…): người chịu trách nhiệm nếu chứng từ ghi, không thì chính chi nhánh.
  const partner = ctx.partnerId ?? ctx.stock?.branchPartnerId ?? null;
  const b = new EntryBuilder();
  for (const line of doc.lines) {
    const wh = resolver.warehouseAccount(line.warehouseCode, doc.branchCode);
    const inventory = wh ?? resolver.groupForSku(line.sku).inventory_account;
    const amount = Math.abs(line.amount);
    const increase = incOf(line.qty);
    const counter = counterOf(increase);
    const tags = { biz: increase ? 'stock_increase' : 'stock_decrease', reason: doc.reasonCode ?? null, ...(wh ? (increase ? { whDebit: true } : { whCredit: true }) : {}) };
    if (increase) valued(b, { tags, part: 'goods', productSku: line.sku, debitAccount: inventory, creditAccount: counter, amount, creditPartnerId: partner, description: 'Điều chỉnh tăng kho' });
    else valued(b, { tags, part: 'goods', productSku: line.sku, debitAccount: counter, creditAccount: inventory, amount, debitPartnerId: partner, description: 'Điều chỉnh giảm kho' });
  }
  resolver.assertComplete();
  return b.toLines();
}
