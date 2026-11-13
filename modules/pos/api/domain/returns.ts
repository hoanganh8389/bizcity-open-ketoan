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
 */
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
};

export function returnableLines(lines: readonly SoldLine[], done: ReadonlyMap<string, ReturnedSoFar>): ReturnableLine[] {
  return lines.map((l) => {
    const d = done.get(l.lineId) ?? { qty: 0, refund: 0, net: 0 };
    return {
      lineId: l.lineId, sku: l.sku, name: l.name, unitName: l.unitName, unitRatio: l.unitRatio, isGift: l.isGift,
      ...(l.promotionId !== undefined ? { promotionId: l.promotionId } : {}),
      soldQty: l.soldQty, returnedQty: d.qty, returnableQty: Math.max(0, l.soldQty - d.qty),
      lineTotal: l.net + l.tax, refundedAmount: d.refund,
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
  const ids = [...new Set(lines.filter((l) => l.isGift && l.promotionId !== undefined).map((l) => l.promotionId!))];
  for (const id of ids) {
    const skus = promoSkus(id);
    const mains = lines.filter((l) => !l.isGift && (!skus || skus.length === 0 || skus.includes(l.sku)));
    const sold = mains.reduce((t, l) => t + l.soldQty, 0);
    if (sold <= 0) continue;
    const kept = mains.reduce((t, l) => t + l.soldQty - l.returnedQty - (qty.get(l.lineId) ?? 0), 0);
    const gifts = lines.filter((l) => l.isGift && l.promotionId === id);
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


export type ReturnInput = {
  draft: { id: string; lines: readonly { lineId: string; qty: number }[]; refundMethod: string; reason: string; approval?: { by: string; note: string } };
  order: { status: string; branchCode: string; businessDate: string };
  lines: readonly SoldLine[];
  done: ReadonlyMap<string, ReturnedSoFar>;
  branchCode: string;
  today: string;
  days: number;
  paymentMethods: readonly PaymentMethodRow[];
  /** Đổi hàng: tiền hoàn thành đối trừ, không trả tiền. */
  exchange: boolean;
};

export type ComputedReturnLine = SoldLine & { qty: number; refund: number; refundNet: number; refundTax: number };
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
  if (order.branchCode !== input.branchCode) {
    return fail('conflict', 'POS_RETURN_OTHER_SHOP', `Đơn của chi nhánh ${order.branchCode}: đợt này chỉ trả ở cửa hàng đã bán`, { orderBranch: order.branchCode });
  }
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
  if (late && !(draft.approval?.by.trim() && draft.approval.note.trim())) {
    return fail('validation', 'POS_RETURN_EXPIRED', `Quá hạn trả (hạn cuối ${deadline}): cần người duyệt và lý do duyệt`, { deadline });
  }

  const byId = new Map(lines.map((l) => [l.lineId, l]));
  const avail = returnableLines(lines, done);
  const availById = new Map(avail.map((l) => [l.lineId, l]));
  const qty = new Map<string, number>();
  for (const x of draft.lines) qty.set(x.lineId, (qty.get(x.lineId) ?? 0) + x.qty);
  for (const [lineId, q] of qty) {
    const a = availById.get(lineId);
    if (!a) return fail('validation', 'POS_RETURN_QTY', `Dòng ${lineId} không có trong đơn`, { lineId });
    if (q > a.returnableQty) return fail('validation', 'POS_RETURN_QTY', `Dòng ${a.sku}: còn trả được ${a.returnableQty}, xin trả ${q}`, { lineId, returnableQty: a.returnableQty });
  }
  const needGifts = requiredGiftReturns(avail, qty, () => null);
  const missing = [...needGifts].filter(([id, need]) => (qty.get(id) ?? 0) < need).map(([lineId, need]) => ({ lineId, qty: need }));
  if (missing.length) return fail('validation', 'POS_GIFT_REQUIRED', 'Trả hàng chính thì phải trả kèm quà vượt suất', { gifts: missing });

  const out: ComputedReturnLine[] = [];
  for (const [lineId, q] of qty) {
    const l = byId.get(lineId)!;
    const d = done.get(lineId) ?? { qty: 0, refund: 0, net: 0 };
    const refund = refundFor(availById.get(lineId)!, q);
    const { net, tax } = splitRefund(l, d, q, refund);
    out.push({ ...l, qty: q, refund, refundNet: net, refundTax: tax });
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
    })),
    payments: r.methodCode && r.refundTotal > 0 ? [{ methodCode: r.methodCode, amount: r.refundTotal }] : [],
    totals: { beforeTax: r.net, tax: r.tax, total: r.refundTotal },
  };
}
