/**
 * Nghiệp vụ thuần của đơn bán tại quầy (kế hoạch module POS đợt W1, phiếu NT-BH-004): tính tiền dòng, tách thuế, kiểm thanh toán, dựng bản
 * chụp đơn trả cho máy và chứng từ `sale` (bizcity_ledger_intake@1) nộp qua ctx.ledger.submit. Không I/O: action đọc danh mục
 * rồi truyền vào đây, test thuần chạy được không cần CSDL.
 *
 * Tiền tính như máy bán và POS đang chạy (tgs_pos_react packages/pos-core: cart.ts lineNetExact / lineNet, tax.ts lineAmounts):
 *   thành tiền = làm tròn(giá gồm thuế × SL − giảm tay), giảm % không làm tròn tiền giảm;
 *   chưa thuế  = làm tròn(thành tiền CHƯA làm tròn ÷ (1 + thuế suất));   thuế = thành tiền − chưa thuế.
 */
import { roundMoney } from '@bizcity/module-sdk';
import type { ManualDiscount, OrderDraft, OrderLineDraft } from './schema.js';

/**
 * Mặt hàng đọc từ bizcity_read.products. `variant` (ô Biến thể) chỉ dùng cho giá 0đ của hàng Nội bộ; `sendTax` (ô Gửi lên thuế)
 * là căn cứ DUY NHẤT để tách khỏi thuế. Không đọc chữ cuối mã (mã hàng chỉ còn là số; tgs_shop_management
 * docs/ma-hang-so-va-bien-the.md).
 */
export type CatalogItem = {
  sku: string;
  name: string;
  unit: string;
  taxCode: string | null;
  taxRate: number | null;
  itemId: string | null;
  variant: string;
  sendTax: boolean;
};
export type PaymentMethodRow = { code: string; name: string };
export type PaymentKind = 'cash' | 'qr' | 'transfer' | 'card' | 'voucher' | 'credit' | 'offset';
export type BranchRow = { code: string; name: string; taxCode: string; address: string };

/** Lỗi nghiệp vụ: action đổi thành Errors.validation / Errors.conflict; `reason` = mã của hợp đồng POS (D-MP-11). */
export type OrderProblem = { kind: 'validation' | 'conflict'; reason: string; message: string; details?: unknown };

// ── Tiền ─────────────────────────────────────────────────────────────────────────────────────────────────────────────

export type LineMoney = { gross: number; net: number; tax: number; discountGross: number; discountNet: number };

/** Tiền của một dòng theo giá gồm thuế. `taxRate` %, 0 = KCT / 0%. */
export function lineMoney(unitPrice: number, qty: number, taxRate: number, manual?: ManualDiscount): LineMoney {
  const base = unitPrice * qty;
  const disc = !manual ? 0 : manual.kind === 'amount' ? manual.value : (base * manual.value) / 100;
  const exact = base - Math.min(Math.max(disc, 0), base);
  const gross = roundMoney(exact);
  const net = roundMoney(exact / (1 + taxRate / 100));
  const netBeforeDiscount = roundMoney(base / (1 + taxRate / 100));
  return { gross, net, tax: gross - net, discountGross: roundMoney(base) - gross, discountNet: Math.max(0, netBeforeDiscount - net) };
}

// ── Mã phiếu, hình thức thanh toán ───────────────────────────────────────────────────────────────────────────────────

const CODE_PREFIX = { sale: 'HD', return: 'TH' } as const;

/** Kỳ số phiếu của ngày bán: '2026-11-09' → '2611'. */
export function codePeriod(businessDate: string): string {
  return businessDate.slice(2, 4) + businessDate.slice(5, 7);
}

/** Mã phiếu 12 ký tự: HD + yyMM + 6 số (hợp đồng Order.code maxLength 12). */
export function formatCode(kind: 'sale' | 'return', period: string, no: number): string {
  if (!Number.isInteger(no) || no < 1 || no > 999_999) throw new RangeError(`Số phiếu ngoài khoảng: ${no}`);
  return `${CODE_PREFIX[kind]}${period}${String(no).padStart(6, '0')}`;
}

/** Mã phiếu máy gửi có đúng khuôn của chi nhánh × tháng này không; trả số thứ tự hoặc null. */
export function parseCode(kind: 'sale' | 'return', period: string, code: string): number | null {
  const m = new RegExp(`^${CODE_PREFIX[kind]}${period}(\\d{6})$`).exec(code);
  return m ? Number(m[1]) : null;
}

/** Loại hình thức theo mã danh mục kế toán (D-MP-4). Mã lạ coi như chuyển khoản. */
const KIND_BY_CODE: Record<string, PaymentKind> = {
  TM: 'cash', CK: 'transfer', QR: 'qr', POS: 'card', VOUCHER: 'voucher', CONGNO: 'credit', DOI_TRU: 'offset',
};
export function paymentKind(code: string): PaymentKind {
  return KIND_BY_CODE[code.toUpperCase()] ?? 'transfer';
}

/** SĐT chuẩn hoá: chỉ chữ số, +84 / 84 đầu → 0. */
export function normalizePhone(raw: string): string {
  const d = raw.replace(/\D/g, '');
  return d.startsWith('84') && d.length === 11 ? `0${d.slice(2)}` : d;
}

// ── Tính đơn ──────────────────────────────────────────────────────────────────────────────────────────────────────────

export type PricedLine = {
  draft: OrderLineDraft;
  item: CatalogItem & { taxCode: string; taxRate: number };
  unitRatio: number;
  money: LineMoney;
};

export type OrderCustomer = { code: string; name: string; phone: string } | null;

export type ComputedOrder = {
  lines: PricedLine[];
  subtotal: number;
  taxTotal: number;
  total: number;
  /** Phần thu ghi sổ (mã hình thức kế toán + số tiền). Tiền thối không ghi. */
  payments: { methodCode: string; amount: number }[];
  change: number;
  customer: OrderCustomer;
};

export type ComputeInput = {
  draft: OrderDraft;
  catalog: ReadonlyMap<string, CatalogItem>;
  paymentMethods: readonly PaymentMethodRow[];
  /** Khách theo mã (partnerId) tra ở danh mục; không có → null. */
  partner?: { code: string; name: string; phone: string } | null;
};

const fail = (kind: OrderProblem['kind'], reason: string, message: string, details?: unknown): { problem: OrderProblem } => ({ problem: { kind, reason, message, details } });

/** Những gì W1 chưa nhận (D-MP-7): chặn cả đơn, nói rõ, không ghi sai một phần. */
export function unsupported(draft: OrderDraft): OrderProblem | null {
  const no = (what: string, details?: unknown): OrderProblem => ({ kind: 'validation', reason: 'POS_NOT_SUPPORTED_YET', message: `Máy chủ POS chưa nhận ${what} ở đợt này — dùng đường bán cũ cho đơn này`, details });
  if (draft.promotionSelections.length) return no('đơn có khuyến mại / mã giảm giá', { field: 'promotionSelections' });
  if (draft.lines.some((l) => l.isGift)) return no('dòng quà tặng', { field: 'lines', isGift: true });
  if (draft.loyalty?.redeem.length) return no('đổi điểm thành viên', { field: 'loyalty' });
  if (draft.payment.mode === 'qr') return no('thanh toán QR', { field: 'payment.mode' });
  if (draft.payment.mode === 'credit') return no('bán ghi nợ', { field: 'payment.mode' });
  return null;
}

export function computeOrder(input: ComputeInput): ComputedOrder | { problem: OrderProblem } {
  const { draft, catalog, paymentMethods } = input;
  const notYet = unsupported(draft);
  if (notYet) return { problem: notYet };

  const lines: PricedLine[] = [];
  const missing: string[] = [];
  const untaxed: string[] = [];
  for (const l of draft.lines) {
    const item = catalog.get(l.sku);
    if (!item) { missing.push(l.sku); continue; }
    if (item.taxCode === null || item.taxRate === null) { untaxed.push(l.sku); continue; }
    // Hàng Nội bộ luôn bán 0đ (như POS đang chạy): máy gửi giá khác 0 là giỏ cũ / sai giá.
    if (item.variant === 'internal' && l.clientUnitPrice !== 0) {
      return fail('conflict', 'POS_PRICE_CHANGED', `Mã ${l.sku} là hàng Nội bộ, bán 0đ — tải lại giỏ`, [{ sku: l.sku, price: 0 }]);
    }
    if (l.manualDiscount?.kind === 'amount' && l.manualDiscount.value > l.clientUnitPrice * l.unitQty) {
      return fail('validation', 'POS_DISCOUNT_TOO_LARGE', `Dòng ${l.sku}: tiền giảm lớn hơn thành tiền`, { lineId: l.lineId });
    }
    lines.push({ draft: l, item: { ...item, taxCode: item.taxCode, taxRate: item.taxRate }, unitRatio: l.unitRatio ?? 1, money: lineMoney(l.clientUnitPrice, l.unitQty, item.taxRate, l.manualDiscount) });
  }
  if (missing.length) return fail('validation', 'POS_UNKNOWN_SKU', `Không có mã hàng trong danh mục kế toán: ${missing.join(', ')}`, missing.map((sku) => ({ sku })));
  if (untaxed.length) return fail('validation', 'POS_TAX_NOT_DECLARED', `Mã hàng chưa khai mã thuế đầu ra: ${untaxed.join(', ')}`, untaxed.map((sku) => ({ sku })));

  // Bill Z (D-MP-12): dòng 0đ của mã không gửi thuế tách thành phiếu riêng ở POS đang chạy (xuất tặng, không lên hoá đơn).
  // Cách ghi sổ của phiếu đó đi cùng quà (W3), chưa có phiếu nghiệm thu → W1 chặn rõ. Dòng không gửi thuế mà THU TIỀN thì
  // POS không tách (phiếu thu phải khớp phiếu bán): nhận như dòng bán, đơn ghi sendTax = false để không lên hoá đơn.
  const noTax = lines.filter((l) => !l.item.sendTax);
  if (noTax.length && noTax.reduce((s, l) => s + l.money.gross, 0) === 0) {
    return fail('validation', 'POS_NOT_SUPPORTED_YET', `Máy chủ POS chưa nhận hàng 0đ không gửi thuế (bill Z) ở đợt này — dùng đường bán cũ cho đơn này: ${noTax.map((l) => l.item.sku).join(', ')}`, { field: 'lines', billZ: noTax.map((l) => l.item.sku) });
  }

  const subtotal = lines.reduce((s, l) => s + l.money.net, 0);
  const taxTotal = lines.reduce((s, l) => s + l.money.tax, 0);
  const total = subtotal + taxTotal;
  if (total !== draft.clientTotal) {
    return fail('conflict', 'POS_PRICE_CHANGED', `Tổng máy tính ${draft.clientTotal} khác tổng máy chủ tính ${total} — tải lại giỏ`, { clientTotal: draft.clientTotal, total });
  }

  // Thanh toán (D-MP-7): tiền mặt, hoặc chia tiền không có QR / ghi nợ / đối trừ.
  const active = new Map(paymentMethods.map((m) => [m.code, m]));
  let payments: ComputedOrder['payments'];
  let change = 0;
  const p = draft.payment;
  if (p.mode === 'cash') {
    const cash = paymentMethods.find((m) => paymentKind(m.code) === 'cash');
    if (!cash) return fail('validation', 'POS_NO_CASH_METHOD', 'Danh mục hình thức thanh toán chưa có tiền mặt (TM)');
    if (p.cashGiven < total) return fail('validation', 'POS_CASH_INSUFFICIENT', `Khách đưa ${p.cashGiven}, còn thiếu ${total - p.cashGiven}`, { total, cashGiven: p.cashGiven });
    payments = total > 0 ? [{ methodCode: cash.code, amount: total }] : [];
    change = p.cashGiven - total;
  } else if (p.mode === 'split') {
    const seen = new Set<string>();
    for (const part of p.parts) {
      if (!active.has(part.method)) return fail('validation', 'POS_UNKNOWN_METHOD', `Hình thức thanh toán ${part.method} không có trong danh mục`, { method: part.method });
      if (seen.has(part.method)) return fail('validation', 'POS_DUPLICATE_METHOD', `Hình thức ${part.method} lặp lại`, { method: part.method });
      seen.add(part.method);
      const kind = paymentKind(part.method);
      if (kind === 'qr' || kind === 'credit' || kind === 'offset') {
        return fail('validation', 'POS_NOT_SUPPORTED_YET', `Máy chủ POS chưa nhận phần ${part.method} trong chia tiền ở đợt này`, { method: part.method });
      }
    }
    const paid = p.parts.reduce((s, x) => s + x.amount, 0);
    if (paid !== total) return fail('validation', 'POS_SPLIT_MISMATCH', `Các phần cộng ${paid}, tổng đơn ${total} (chênh ${paid - total})`, { total, paid });
    payments = p.parts.map((x) => ({ methodCode: x.method, amount: x.amount }));
  } else {
    return fail('validation', 'POS_NOT_SUPPORTED_YET', 'Hình thức thanh toán chưa nhận ở đợt này');
  }

  // Khách (D-MP-7): lẻ / theo mã / theo SĐT + tên (tự thêm vào danh mục khi nộp chứng từ).
  let customer: OrderCustomer = null;
  const c = draft.customer;
  if ('partnerId' in c) {
    if (!input.partner) return fail('validation', 'POS_UNKNOWN_CUSTOMER', `Không có khách ${c.partnerId}`, { partnerId: c.partnerId });
    customer = input.partner;
  } else if ('phone' in c) {
    const phone = normalizePhone(c.phone);
    if (!/^0\d{9}$/.test(phone)) return fail('validation', 'POS_BAD_PHONE', 'SĐT khách phải có 10 số, bắt đầu bằng 0', { field: 'customer.phone' });
    if (!c.name.trim()) return fail('validation', 'POS_MISSING_NAME', 'Thiếu tên khách', { field: 'customer.name' });
    customer = { code: phone, name: c.name.trim(), phone };
  }

  return { lines, subtotal, taxTotal, total, payments, change, customer };
}

// ── Đầu ra ────────────────────────────────────────────────────────────────────────────────────────────────────────────

export function saleDocKey(branchCode: string, orderId: string): string {
  return `pos:${branchCode}:sale:${orderId}`;
}

/** Chứng từ sale (bizcity_ledger_intake@1). Không số tài khoản, không reasonCode (mặc định của loại). */
export function toSaleDocument(o: ComputedOrder, meta: { draft: OrderDraft; branchCode: string; code: string }) {
  const { draft } = meta;
  return {
    docType: 'sale',
    docKey: saleDocKey(meta.branchCode, draft.id),
    version: 1,
    branchCode: meta.branchCode,
    docNo: meta.code,
    docDate: draft.businessDate,
    description: `Bán lẻ máy POS ${meta.code}`,
    sourceRef: { type: 'pos.order', id: draft.id, label: meta.code },
    ...(o.customer ? { partner: { code: o.customer.code, name: o.customer.name, ...(o.customer.phone ? { phone: o.customer.phone } : {}) } } : {}),
    lines: o.lines.map((l) => ({
      lineKey: l.draft.lineId,
      sku: l.item.sku,
      // Kế toán khớp dòng theo định danh, mã chỉ để đọc.
      ...(l.item.itemId ? { itemId: l.item.itemId } : {}),
      name: l.item.name,
      unit: l.item.unit,
      qty: l.draft.unitQty * l.unitRatio,
      unitQty: l.draft.unitQty,
      unitRatio: l.unitRatio,
      // Đơn giá chưa thuế TRƯỚC giảm: đơn giá × SL − giảm ≈ thành tiền chưa thuế (LEDGER-INTAKE §3: amountBeforeTax đã trừ
      // chiết khấu, discount tách riêng). Lấy đơn giá sau giảm mà vẫn gửi discount là trừ chiết khấu hai lần.
      unitPrice: roundMoney((l.money.net + l.money.discountNet) / l.draft.unitQty),
      amountBeforeTax: l.money.net,
      discount: l.money.discountNet,
      taxCode: l.item.taxCode,
      taxAmount: l.money.tax,
      ...(l.draft.note ? { note: l.draft.note } : {}),
    })),
    payments: o.payments,
    totals: { beforeTax: o.subtotal, tax: o.taxTotal, total: o.total },
  };
}

/** Đơn trả cho máy (khuôn Order của hợp đồng /pos/*). */
export function toOrderSnapshot(o: ComputedOrder, meta: { draft: OrderDraft; code: string; branch: BranchRow; createdAt: string }) {
  const { draft } = meta;
  const payment = draft.payment.mode === 'cash' ? { ...draft.payment, change: o.change } : draft.payment;
  return {
    id: draft.id,
    code: meta.code,
    status: 'completed' as const,
    businessDate: draft.businessDate,
    createdAt: meta.createdAt,
    customer: o.customer ? { id: o.customer.code, name: o.customer.name, phone: o.customer.phone } : { id: '', name: 'Khách lẻ', phone: '' },
    lines: o.lines.map((l) => ({
      ...l.draft,
      name: l.item.name,
      unitRatio: l.unitRatio,
      unitPrice: l.draft.clientUnitPrice,
      taxRate: l.item.taxRate,
      amount: l.money.net,
      taxAmount: l.money.tax,
      promoDiscount: 0,
      promotions: [] as { promotionId: number; amount: number }[],
      ...(l.item.itemId ? { itemId: l.item.itemId } : {}),
      // false = không lên hoá đơn thuế (máy bán và hoá đơn điện tử đọc cờ này).
      sendTax: l.item.sendTax,
    })),
    subtotal: o.subtotal,
    taxTotal: o.taxTotal,
    total: o.total,
    payment,
    flags: { oversold: false, promoMismatch: false },
    ...(draft.saleSource ? { saleSource: draft.saleSource } : {}),
    promotions: [] as unknown[],
    branch: { code: meta.branch.code, name: meta.branch.name, taxCode: meta.branch.taxCode },
    mirror: { status: 'pending' as const },
  };
}
