/**
 * Nghiệp vụ thuần của hoàn hàng / đổi hàng tại quầy (kế hoạch module POS đợt W2, phiếu NT-BH-005). Không I/O: action đọc đơn
 * gốc + các phiếu trả trước rồi truyền vào đây; test thuần chạy không cần CSDL.
 *
 * Tiền hoàn giống máy bán (tgs_pos_react src/features/returns/refund.ts, packages/pos-core/src/returns.ts) và POS đang chạy:
 *   tiền hoàn dòng = làm tròn(tiền khách đã trả cho dòng × SL trả ÷ SL bán); trả hết dòng → đúng phần còn lại;
 *   chưa thuế = làm tròn(tiền hoàn ÷ (1 + thuế suất)); trả hết dòng → chưa thuế còn lại của dòng (tổng khớp đơn gốc);
 *   thuế = tiền hoàn − chưa thuế.
 * Luật (họp phòng kế toán 04/11/2026, G1 / G2): hạn trả là tham số (3 ngày theo ngày bán), quá hạn phải có người duyệt;
 * trả hàng chính thì quà vượt suất phải trả theo; đổi hàng phải bằng hoặc cao hơn giá trị hàng trả.
 * NT-BH-030: trả ở cửa hàng khác cùng MST chi nhánh (Q1); quá hạn phải có yêu cầu trả quá hạn đã duyệt (Q2); hạn trả riêng từng shop (Q3).
 */
// [2026-11-18 Võ Hoàng] NGHIEM-THU — NT-BH-030: trả khác shop cùng MST, quá hạn theo yêu cầu đã duyệt, hạn trả theo shop (đóng góp)
import { roundMoney } from '@bizcity/module-sdk';
import { isOffsetMethod, paymentKind, type OrderProblem, type PaymentMethodRow } from './order.js';

export { isOffsetMethod };

/** Dòng của đơn gốc (bản chụp đơn + dòng đơn đã lưu). */
export type SoldLine = {
  lineId: string;
  sku: string;
  name: string;
  unitName: string;
  unitRatio: number;
  /** SL bán theo ĐVT bán. */
  soldQty: number;
  /** Chưa thuế sau giảm của dòng (amountBeforeTax của chứng từ sale). */
  net: number;
  /** Thuế của dòng. */
  tax: number;
  taxRate: number;
  taxCode: string;
  itemId: string | null;
  isGift: boolean;
  promotionId?: number;
  // [2026-11-18 Võ Hoàng] NGHIEM-THU — NT-BH-024 Q2: dòng quà đổi điểm (giftKey `lp:…`) không trả được (đóng góp)
  /** Dòng quà đổi bằng điểm (NT-BH-020, giftKey `lp:…`): không trả được, không tính vào quà vượt suất. */
  loyaltyGift?: boolean;
};

/** Phần đã trả của một dòng ở các phiếu trước. */
export type ReturnedSoFar = { qty: number; refund: number; net: number };

export type ReturnableLine = {
  lineId: string;
  sku: string;
  name: string;
  unitName: string;
  unitRatio: number;
  isGift: boolean;
  promotionId?: number;
  soldQty: number;
  returnedQty: number;
  returnableQty: number;
  /** Khách đã trả cho dòng (sau giảm, gồm thuế). */
  lineTotal: number;
  refundedAmount: number;
  /** Quà đổi điểm: returnableQty = 0, notReturnable = 'LOYALTY_GIFT' (NT-BH-024). */
  loyaltyGift?: boolean;
  notReturnable?: 'LOYALTY_GIFT';
};

export function returnableLines(lines: readonly SoldLine[], done: ReadonlyMap<string, ReturnedSoFar>): ReturnableLine[] {
  return lines.map((l) => {
    const d = done.get(l.lineId) ?? { qty: 0, refund: 0, net: 0 };
    return {
      lineId: l.lineId, sku: l.sku, name: l.name, unitName: l.unitName, unitRatio: l.unitRatio, isGift: l.isGift,
      ...(l.promotionId !== undefined ? { promotionId: l.promotionId } : {}),
      soldQty: l.soldQty, returnedQty: d.qty, returnableQty: l.loyaltyGift ? 0 : Math.max(0, l.soldQty - d.qty),
      lineTotal: l.net + l.tax, refundedAmount: d.refund,
      ...(l.loyaltyGift ? { loyaltyGift: true, notReturnable: 'LOYALTY_GIFT' as const } : {}),
    };
  });
}

/** Tiền hoàn của một dòng (gồm thuế) — cùng công thức với máy bán. */
export function refundFor(l: Pick<ReturnableLine, 'soldQty' | 'returnedQty' | 'lineTotal' | 'refundedAmount'>, qty: number): number {
  if (!(qty > 0)) return 0;
  if (l.returnedQty + qty >= l.soldQty) return l.lineTotal - l.refundedAmount;
  return roundMoney((l.lineTotal * qty) / l.soldQty);
}

/** Tách tiền hoàn thành chưa thuế / thuế; trả hết dòng thì lấy phần chưa thuế còn lại để tổng khớp đơn gốc. */
export function splitRefund(line: SoldLine, done: ReturnedSoFar, qty: number, refund: number): { net: number; tax: number } {
  const net = done.qty + qty >= line.soldQty ? line.net - done.net : roundMoney(refund / (1 + line.taxRate / 100));
  return { net, tax: refund - net };
}

/** Số ngày kể từ ngày bán (theo lịch). */
export function daysSince(businessDate: string, today: string): number {
  const at = (d: string) => Date.UTC(+d.slice(0, 4), +d.slice(5, 7) - 1, +d.slice(8, 10));
  return Math.round((at(today) - at(businessDate)) / 86_400_000);
}

export function returnDeadline(businessDate: string, days: number): string {
  const d = new Date(Date.UTC(+businessDate.slice(0, 4), +businessDate.slice(5, 7) - 1, +businessDate.slice(8, 10)));
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/**
 * Quà phải trả kèm (giống pos-core requiredGiftReturns): suất quà được giữ = floor(quà × hàng chính khách giữ ÷ hàng chính
 * đã mua); quà khách đang giữ vượt suất thì phải trả. Trả về lineId quà → SL tối thiểu phải có trên phiếu này.
 */
export function requiredGiftReturns(lines: readonly ReturnableLine[], qty: ReadonlyMap<string, number>, promoSkus: (id: number) => readonly string[] | null): Map<string, number> {
  const out = new Map<string, number>();
  // NT-BH-024 Q2: quà đổi điểm không phải quà chương trình — không thu lại, không tính suất.
  const ids = [...new Set(lines.filter((l) => l.isGift && !l.loyaltyGift && l.promotionId !== undefined).map((l) => l.promotionId!))];
  for (const id of ids) {
    const skus = promoSkus(id);
    const mains = lines.filter((l) => !l.isGift && (!skus || skus.length === 0 || skus.includes(l.sku)));
    const sold = mains.reduce((t, l) => t + l.soldQty, 0);
    if (sold <= 0) continue;
    const kept = mains.reduce((t, l) => t + l.soldQty - l.returnedQty - (qty.get(l.lineId) ?? 0), 0);
    const gifts = lines.filter((l) => l.isGift && !l.loyaltyGift && l.promotionId === id);
    const entitled = Math.floor((gifts.reduce((t, l) => t + l.soldQty, 0) * Math.max(0, kept)) / sold);
    let excess = gifts.reduce((t, l) => t + l.soldQty - l.returnedQty - (qty.get(l.lineId) ?? 0), 0) - entitled;
    for (const g of gifts) {
      if (excess <= 0) break;
      const take = Math.min(g.soldQty - g.returnedQty - (qty.get(g.lineId) ?? 0), excess);
      if (take > 0) out.set(g.lineId, (qty.get(g.lineId) ?? 0) + take);
      excess -= take;
    }
  }
  return out;
}


/** Tình trạng hàng trả (NT-BH-024 Q3): nguyên vẹn → kho bán (kho mặc định); lỗi / hết hạn → kho KTL của cửa hàng. */
export type ReturnCondition = 'good' | 'bad';

/** Mã số thuế người mua hoá đơn của đơn (bản chụp `invoiceBuyer.taxCode`, NT-BH-010); trống → ''. */
export function buyerTaxCodeOf(snapshot: unknown): string {
  const t = (snapshot as { invoiceBuyer?: { taxCode?: unknown } } | null)?.invoiceBuyer?.taxCode;
  return typeof t === 'string' ? t.trim() : '';
}

/** Câu báo đơn có hoá đơn MST: máy bán không trả / đổi, kế toán lập phiếu trả BH11 kèm hoá đơn điều chỉnh (NT-BH-024 Q1). */
export const taxInvoiceMessage = (taxCode: string) =>
  `Đơn đã xuất hoá đơn cho MST ${taxCode} — máy bán không trả / đổi; kế toán lập phiếu trả BH11 kèm hoá đơn điều chỉnh`;

/** Khoá `bizcity.pos.return_bad_warehouses`: mảng "<mã cửa hàng>=<mã kho>" (như kho KCB của NT-BH-023) → Map cửa hàng → kho. */
export function parseWarehouseMap(v: unknown): Map<string, string> {
  const m = new Map<string, string>();
  if (!Array.isArray(v)) return m;
  for (const x of v) {
    if (typeof x !== 'string') continue;
    const i = x.indexOf('=');
    if (i <= 0) continue;
    const b = x.slice(0, i).trim();
    const w = x.slice(i + 1).trim();
    if (b && w) m.set(b, w);
  }
  return m;
}

/**
 * Trả ở cửa hàng khác (NT-BH-030 Q1): cùng cửa hàng → được; khác cửa hàng thì cả hai phải khai MST chi nhánh và trùng MST.
 * Không được → problem POS_RETURN_OTHER_SHOP kèm cause TAX_CODE_MISSING (chưa khai) / TAX_CODE_DIFFERENT (khác MST).
 */
export function otherShopProblem(orderBranch: string, orderTax: string | undefined, hereBranch: string, hereTax: string | undefined): OrderProblem | null {
  if (orderBranch === hereBranch) return null;
  const a = (orderTax ?? '').trim();
  const b = (hereTax ?? '').trim();
  const missing = [...(a ? [] : [orderBranch]), ...(b ? [] : [hereBranch])];
  if (missing.length) {
    return { kind: 'conflict', reason: 'POS_RETURN_OTHER_SHOP',
      message: `Đơn của cửa hàng ${orderBranch}: chưa khai MST chi nhánh ${missing.join(', ')} ở Danh mục chi nhánh — chỉ trả khác cửa hàng khi hai cửa hàng cùng mã số thuế`,
      details: { orderBranch, cause: 'TAX_CODE_MISSING', branches: missing } };
  }
  if (a !== b) {
    return { kind: 'conflict', reason: 'POS_RETURN_OTHER_SHOP',
      message: `Đơn của cửa hàng ${orderBranch} khác mã số thuế với cửa hàng ${hereBranch} — mang về trả ở cửa hàng cùng MST`,
      details: { orderBranch, cause: 'TAX_CODE_DIFFERENT' } };
  }
  return null;
}

/** Khoá `bizcity.pos.return_days_by_shop`: mảng "<mã cửa hàng>=<số ngày 0–60>" → Map cửa hàng → số ngày; phần tử sai khuôn bỏ qua. */
export function parseDaysMap(v: unknown): Map<string, number> {
  const m = new Map<string, number>();
  for (const [b, d] of parseWarehouseMap(v)) {
    if (/^\d{1,2}$/.test(d) && Number(d) <= 60) m.set(b, Number(d));
  }
  return m;
}

/** Hạn trả của cửa hàng: khai riêng thì lấy riêng, không thì mặc định công ty. */
export const daysOf = (policy: { days: number; byShop: ReadonlyMap<string, number> }, branchCode: string) => policy.byShop.get(branchCode) ?? policy.days;

type ReqLine = { lineId: string; qty: number; condition?: ReturnCondition };
/** Dòng phiếu trả khớp đúng dòng của yêu cầu đã duyệt (mỗi dòng: SL, tình trạng; không thừa, không thiếu) — NT-BH-030 Q2. */
export function sameReturnLines(approved: readonly ReqLine[], draft: readonly ReqLine[]): boolean {
  const norm = (ls: readonly ReqLine[]) => {
    const m = new Map<string, { qty: number; condition: ReturnCondition }>();
    for (const l of ls) {
      const c = l.condition ?? 'good';
      const k = `${l.lineId}|${c}`;
      m.set(k, { qty: (m.get(k)?.qty ?? 0) + l.qty, condition: c });
    }
    return m;
  };
  const a = norm(approved);
  const b = norm(draft);
  if (a.size !== b.size) return false;
  for (const [k, v] of a) {
    const w = b.get(k);
    if (!w || Math.abs(w.qty - v.qty) > 1e-9) return false;
  }
  return true;
}

export type ReturnInput = {
  draft: { id: string; lines: readonly { lineId: string; qty: number; condition?: ReturnCondition }[]; refundMethod: string; reason: string };
  /**
   * buyerTaxCode: MST người mua hoá đơn của đơn lúc trả (khác rỗng → chặn, NT-BH-024 Q1). branchTaxCode: MST chi nhánh đã bán (danh mục
   * chi nhánh) — trả ở cửa hàng khác chỉ khi hai cửa hàng cùng MST (NT-BH-030 Q1).
   */
  order: { status: string; branchCode: string; businessDate: string; buyerTaxCode?: string; branchTaxCode?: string };
  lines: readonly SoldLine[];
  done: ReadonlyMap<string, ReturnedSoFar>;
  branchCode: string;
  /** MST chi nhánh nhận trả (NT-BH-030 Q1). */
  branchTaxCode?: string;
  today: string;
  /** Hạn trả không cần duyệt của cửa hàng nhận (NT-BH-030 Q3: mặc định công ty, khai riêng từng shop). */
  days: number;
  /** Quá hạn đã có yêu cầu trả quá hạn được duyệt và khớp nội dung (máy chủ đã kiểm, NT-BH-030 Q2). */
  approved?: boolean;
  paymentMethods: readonly PaymentMethodRow[];
  /** Đổi hàng: tiền hoàn thành đối trừ, không trả tiền. */
  exchange: boolean;
  /**
   * Kho KTL nhận hàng lỗi của cửa hàng (đã kiểm thuộc cửa hàng, đang dùng); null = chưa khai / không dùng được. `badWarehouseIssue`:
   * vì sao kho đã khai không dùng được (ghép vào câu báo).
   */
  badWarehouse?: string | null;
  badWarehouseIssue?: string;
};

export type ComputedReturnLine = SoldLine & {
  qty: number; refund: number; refundNet: number; refundTax: number;
  /** NT-BH-024: tình trạng; hàng lỗi mang kho KTL nhận (nguyên vẹn: không ghi kho → kho mặc định). */
  condition: ReturnCondition; warehouseCode?: string;
};
export type ComputedReturn = {
  lines: ComputedReturnLine[];
  refundTotal: number;
  net: number;
  tax: number;
  late: boolean;
  deadline: string;
  /** Mã hình thức trả tiền ghi sổ (null khi đổi hàng: đối trừ, không trả tiền). */
  methodCode: string | null;
};

const fail = (kind: OrderProblem['kind'], reason: string, message: string, details?: unknown): { problem: OrderProblem } => ({ problem: { kind, reason, message, details } });

export function computeReturn(input: ReturnInput): ComputedReturn | { problem: OrderProblem } {
  const { draft, order, lines, done } = input;
  if (order.status !== 'completed') return fail('conflict', 'POS_ORDER_NOT_RETURNABLE', 'Chỉ trả hàng của đơn đã hoàn tất');
  const other = otherShopProblem(order.branchCode, order.branchTaxCode, input.branchCode, input.branchTaxCode);
  if (other) return { problem: other };
  // [2026-11-18 Võ Hoàng] NGHIEM-THU — NT-BH-024 Q1: đơn có người mua hoá đơn kèm MST coi là đã xuất hoá đơn → máy bán không trả / đổi (đóng góp)
  const taxCode = order.buyerTaxCode?.trim() ?? '';
  if (taxCode) return fail('conflict', 'POS_RETURN_TAX_INVOICE', taxInvoiceMessage(taxCode), { taxCode });
  if (!draft.reason.trim()) return fail('validation', 'POS_RETURN_REASON', 'Thiếu lý do trả hàng');

  // Hình thức trả: tiền mặt / chuyển khoản; đổi hàng thì đối trừ.
  let methodCode: string | null = null;
  if (input.exchange) {
    if (!isOffsetMethod(draft.refundMethod)) return fail('validation', 'POS_REFUND_METHOD', 'Đổi hàng: tiền hàng trả phải là đối trừ (doi_tru)');
  } else {
    const m = input.paymentMethods.find((x) => x.code === draft.refundMethod);
    const kind = m ? paymentKind(m.code) : null;
    if (!m || (kind !== 'cash' && kind !== 'transfer')) {
      return fail('validation', 'POS_REFUND_METHOD', `Trả tiền khách bằng tiền mặt hoặc chuyển khoản (mã ${draft.refundMethod} không dùng được)`, { method: draft.refundMethod });
    }
    methodCode = m.code;
  }

  const deadline = returnDeadline(order.businessDate, input.days);
  const late = daysSince(order.businessDate, input.today) > input.days;
  if (late && !input.approved) {
    return fail('validation', 'POS_RETURN_EXPIRED', `Quá hạn trả (hạn cuối ${deadline}): gửi yêu cầu trả quá hạn, chờ kế toán trưởng duyệt rồi mới lập phiếu`, { deadline });
  }

  const byId = new Map(lines.map((l) => [l.lineId, l]));
  const avail = returnableLines(lines, done);
  const availById = new Map(avail.map((l) => [l.lineId, l]));
  const qty = new Map<string, number>();
  const cond = new Map<string, ReturnCondition>();
  for (const x of draft.lines) {
    qty.set(x.lineId, (qty.get(x.lineId) ?? 0) + x.qty);
    const c = x.condition ?? 'good';
    const was = cond.get(x.lineId);
    // Một dòng đơn = một dòng phiếu trả (một kho nhận): hai tình trạng cho cùng dòng thì phần lỗi lập phiếu riêng.
    if (was && was !== c) return fail('validation', 'POS_RETURN_CONDITION', `Dòng ${x.lineId}: một phiếu trả chỉ một tình trạng cho mỗi dòng — phần lỗi lập phiếu trả riêng`, { lineId: x.lineId });
    cond.set(x.lineId, c);
  }
  for (const [lineId, q] of qty) {
    const a = availById.get(lineId);
    if (!a) return fail('validation', 'POS_RETURN_QTY', `Dòng ${lineId} không có trong đơn`, { lineId });
    // [2026-11-18 Võ Hoàng] NGHIEM-THU — NT-BH-024 Q2: quà đổi bằng điểm không trả được (đóng góp)
    if (a.loyaltyGift) return fail('validation', 'POS_RETURN_LOYALTY_GIFT', `Dòng ${a.sku}: quà đổi bằng điểm không trả được`, { lineId, sku: a.sku });
    if (q > a.returnableQty) return fail('validation', 'POS_RETURN_QTY', `Dòng ${a.sku}: còn trả được ${a.returnableQty}, xin trả ${q}`, { lineId, returnableQty: a.returnableQty });
  }
  const needGifts = requiredGiftReturns(avail, qty, () => null);
  const missing = [...needGifts].filter(([id, need]) => (qty.get(id) ?? 0) < need).map(([lineId, need]) => ({ lineId, qty: need }));
  if (missing.length) return fail('validation', 'POS_GIFT_REQUIRED', 'Trả hàng chính thì phải trả kèm quà vượt suất', { gifts: missing });
  // [2026-11-18 Võ Hoàng] NGHIEM-THU — NT-BH-024 Q3: hàng lỗi / hết hạn vào kho KTL của cửa hàng; chưa khai → không trả (đóng góp)
  if ([...cond.values()].includes('bad') && !input.badWarehouse) {
    return fail('validation', 'POS_RETURN_NO_BAD_WAREHOUSE',
      `Cửa hàng ${input.branchCode} chưa có kho hàng trả lại (loại KTL) cho hàng lỗi / hết hạn — kế toán khai kho ở Danh mục kho (DM18) rồi chọn ở Cài đặt bán hàng (BH17)${input.badWarehouseIssue ? ` (${input.badWarehouseIssue})` : ''}`,
      { branchCode: input.branchCode });
  }

  const out: ComputedReturnLine[] = [];
  for (const [lineId, q] of qty) {
    const l = byId.get(lineId)!;
    const d = done.get(lineId) ?? { qty: 0, refund: 0, net: 0 };
    const refund = refundFor(availById.get(lineId)!, q);
    const { net, tax } = splitRefund(l, d, q, refund);
    const condition = cond.get(lineId) ?? 'good';
    out.push({ ...l, qty: q, refund, refundNet: net, refundTax: tax, condition, ...(condition === 'bad' && input.badWarehouse ? { warehouseCode: input.badWarehouse } : {}) });
  }
  const net = out.reduce((t, l) => t + l.refundNet, 0);
  const tax = out.reduce((t, l) => t + l.refundTax, 0);
  return { lines: out, refundTotal: net + tax, net, tax, late, deadline, methodCode };
}

export function returnDocKey(branchCode: string, returnId: string): string {
  return `pos:${branchCode}:sale_return:${returnId}`;
}

/** Chứng từ sale_return (bizcity_ledger_intake@1): nối đơn gốc, không số tài khoản, không giá vốn. */
export function toSaleReturnDocument(r: ComputedReturn, meta: {
  id: string; branchCode: string; code: string; businessDate: string; reason: string; originalDocKey: string;
  partner: { code: string; name: string; phone?: string } | null;
}) {
  return {
    docType: 'sale_return',
    docKey: returnDocKey(meta.branchCode, meta.id),
    version: 1,
    branchCode: meta.branchCode,
    docNo: meta.code,
    docDate: meta.businessDate,
    description: `Khách trả hàng máy POS ${meta.code}: ${meta.reason}`.slice(0, 500),
    sourceRef: { type: 'pos.return', id: meta.id, label: meta.code },
    originalDocKey: meta.originalDocKey,
    ...(meta.partner ? { partner: meta.partner } : {}),
    lines: r.lines.map((l) => ({
      lineKey: l.lineId,
      sku: l.sku,
      ...(l.itemId ? { itemId: l.itemId } : {}),
      name: l.name,
      unit: l.unitName,
      qty: l.qty * l.unitRatio,
      unitQty: l.qty,
      unitRatio: l.unitRatio,
      unitPrice: roundMoney(l.refundNet / l.qty),
      amountBeforeTax: l.refundNet,
      taxCode: l.taxCode,
      taxAmount: l.refundTax,
      // NT-BH-019 bước 2: dòng quà trả lại mang cờ quà như lúc bán — giá vốn đảo cùng luật hàng khuyến mãi.
      ...(l.isGift ? { isGift: true } : {}),
      // NT-BH-024 Q3: hàng lỗi vào kho KTL (TK kho theo loại kho DM18); nguyên vẹn không ghi kho → kho mặc định của chi nhánh.
      ...(l.warehouseCode ? { warehouseCode: l.warehouseCode } : {}),
    })),
    payments: r.methodCode && r.refundTotal > 0 ? [{ methodCode: r.methodCode, amount: r.refundTotal }] : [],
    totals: { beforeTax: r.net, tax: r.tax, total: r.refundTotal },
  };
}
