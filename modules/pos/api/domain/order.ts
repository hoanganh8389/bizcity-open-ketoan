/**
 * Nghiệp vụ thuần của đơn bán tại quầy (kế hoạch module POS đợt W1, phiếu NT-BH-004): tính tiền dòng, tách thuế, kiểm thanh toán, dựng bản
 * chụp đơn trả cho máy và chứng từ `sale` (bizcity_ledger_intake@1) nộp qua ctx.ledger.submit. Không I/O: action đọc danh mục
 * rồi truyền vào đây, test thuần chạy được không cần CSDL.
 *
 * Tiền tính như máy bán và POS đang chạy (tgs_pos_react packages/pos-core: cart.ts lineNetExact / lineNet, tax.ts lineAmounts):
 *   thành tiền = làm tròn(giá gồm thuế × SL − giảm tay), giảm % không làm tròn tiền giảm;
 *   chưa thuế  = làm tròn(thành tiền CHƯA làm tròn ÷ (1 + thuế suất));   thuế = thành tiền − chưa thuế.
 */
import { allocate, roundMoney } from '@bizcity/module-sdk';
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

/** Tiền của một dòng theo giá gồm thuế. `taxRate` %, 0 = KCT / 0%. `promo`: tiền giảm theo chương trình (gồm thuế, NT-BH-003). */
export function lineMoney(unitPrice: number, qty: number, taxRate: number, manual?: ManualDiscount, promo = 0): LineMoney {
  const base = unitPrice * qty;
  const disc = (!manual ? 0 : manual.kind === 'amount' ? manual.value : (base * manual.value) / 100) + Math.max(0, promo);
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

/** Phần đối trừ của đổi hàng: mã danh mục loại offset (DOI_TRU) hoặc mã máy bán `doi_tru`. Không phải tiền thật. */
export const isOffsetMethod = (code: string) => paymentKind(code) === 'offset' || code.toLowerCase() === 'doi_tru';

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
  /** Tiền giảm của voucher đổi điểm chia vào dòng (gồm thuế, NT-BH-020 bước 2). */
  voucherDiscount?: number;
};

/** Dòng bill Z (NT-BH-019): mã không gửi thuế, 0đ. Trên chứng từ bán là dòng quà; máy bán in sang bill Z theo sendTax. */
export const isBillZLine = (l: PricedLine) => !l.item.sendTax && l.money.gross === 0;

export type OrderCustomer = { code: string; name: string; phone: string } | null;

export type ComputedOrder = {
  lines: PricedLine[];
  subtotal: number;
  taxTotal: number;
  total: number;
  /** Phần thu ghi sổ (mã hình thức kế toán + số tiền). Tiền thối không ghi. */
  payments: { methodCode: string; amount: number }[];
  /** Đổi hàng (W2): tiền hàng trả đối trừ vào đơn này — không phải tiền thu (offsets của chứng từ sale). */
  offsets: { docKey: string; amount: number }[];
  /** Phần trả bằng QR chuyển khoản (NT-BH-009): > 0 thì đơn chờ trả tiền tới khi tiền về / thu ngân xác nhận. */
  qrAmount: number;
  change: number;
  customer: OrderCustomer;
};

export type ComputeInput = {
  draft: OrderDraft;
  catalog: ReadonlyMap<string, CatalogItem>;
  paymentMethods: readonly PaymentMethodRow[];
  /** Khách theo mã (partnerId) tra ở danh mục; không có → null. */
  partner?: { code: string; name: string; phone: string } | null;
  /** Đơn mới của lần đổi hàng (NT-BH-005): phần `doi_tru` phải đúng bằng tiền hàng trả, đơn mới không rẻ hơn hàng trả. */
  exchange?: { credit: number; returnDocKey: string };
  /**
   * Đổi điểm / voucher (NT-BH-020 bước 2) — module loyalty đã báo giá (loyalty.redeem.quote). `gifts`: quà đổi điểm theo mã phần
   * thưởng (dòng quà giftKey `lp:<mã>` phải khớp mã hàng, số lượng). `voucher`: tiền giảm cả đơn, chia vào dòng theo thành tiền.
   * `lenient`: lần tính trước khi hỏi loyalty (chưa có báo giá) — nhận dòng quà `lp:`, chưa giảm voucher.
   */
  loyalty?: { gifts?: ReadonlyMap<string, { sku: string; quantity: number }>; voucher?: { code: string; amount: number }; lenient?: boolean };
};

/** Mã phần thưởng của dòng quà đổi điểm (giftKey `lp:<mã>`), không phải thì null. */
export const loyaltyGiftIndex = (l: { isGift?: boolean; giftKey?: string }) => (l.isGift && l.giftKey?.startsWith('lp:') ? l.giftKey.slice(3) : null);

const fail = (kind: OrderProblem['kind'], reason: string, message: string, details?: unknown): { problem: OrderProblem } => ({ problem: { kind, reason, message, details } });

/** Mã voucher khách nhập (promotionSelections kind coupon), viết hoa, bỏ trùng. */
export function couponCodes(draft: Pick<OrderDraft, 'promotionSelections'>): string[] {
  const out = draft.promotionSelections
    .map((x) => (x && typeof x === 'object' && (x as { kind?: unknown }).kind === 'coupon' ? String((x as { code?: unknown }).code ?? '').trim().toUpperCase() : ''))
    .filter(Boolean);
  return [...new Set(out)];
}

/** Những gì W1 chưa nhận (D-MP-7): chặn cả đơn, nói rõ, không ghi sai một phần. */
export function unsupported(draft: OrderDraft): OrderProblem | null {
  const no = (what: string, details?: unknown): OrderProblem => ({ kind: 'validation', reason: 'POS_NOT_SUPPORTED_YET', message: `Máy chủ POS chưa nhận ${what} ở đợt này — dùng đường bán cũ cho đơn này`, details });
  // Khuyến mại theo luật riêng của máy (chọn quà / mã giảm giá kiểu plugin website) chưa nhận; khuyến mại do Core tính đi theo
  // dòng (policyRef + promoDiscount / dòng quà) — NT-BH-003.
  // NT-BH-020 bước 2: mã giảm giá chỉ nhận voucher đổi điểm (module loyalty kiểm), một mã mỗi đơn; đổi điểm nhận khi có khách.
  const other = draft.promotionSelections.filter((x) => !(x && typeof x === 'object' && (x as { kind?: unknown }).kind === 'coupon'));
  if (other.length) return no('đơn có khuyến mại kiểu plugin website', { field: 'promotionSelections' });
  if (couponCodes(draft).length > 1) return { kind: 'validation', reason: 'POS_NOT_SUPPORTED_YET', message: 'Mỗi đơn dùng một voucher', details: { field: 'promotionSelections' } };
  if (draft.payment.mode === 'credit') return no('bán ghi nợ', { field: 'payment.mode' });
  return null;
}

/** Khách (D-MP-7): lẻ / theo mã / theo SĐT + tên (tự thêm vào danh mục khi nộp chứng từ). */
function resolveCustomer(input: ComputeInput): { customer: OrderCustomer } | { problem: OrderProblem } {
  const c = input.draft.customer;
  if ('partnerId' in c) {
    if (!input.partner) return fail('validation', 'POS_UNKNOWN_CUSTOMER', `Không có khách ${c.partnerId}`, { partnerId: c.partnerId });
    return { customer: input.partner };
  }
  if ('phone' in c) {
    const phone = normalizePhone(c.phone);
    if (!/^0\d{9}$/.test(phone)) return fail('validation', 'POS_BAD_PHONE', 'SĐT khách phải có 10 số, bắt đầu bằng 0', { field: 'customer.phone' });
    if (!c.name.trim()) return fail('validation', 'POS_MISSING_NAME', 'Thiếu tên khách', { field: 'customer.name' });
    return { customer: { code: phone, name: c.name.trim(), phone } };
  }
  return { customer: null };
}

export function computeOrder(input: ComputeInput): ComputedOrder | { problem: OrderProblem } {
  const { draft, catalog, paymentMethods } = input;
  const notYet = unsupported(draft);
  if (notYet) return { problem: notYet };

  // [2026-11-12 10:35 PM Võ Hoàng] POS-KM — NT-BH-003 (đóng góp): quà 0đ / tiền giảm theo chương trình phải có căn cứ — chương trình nêu ở dòng và ở policyRefs (kèm băm).
  const refs = new Map((draft.policyRefs ?? []).filter((r) => r.hash).map((r) => [r.key, r]));
  // Quà đổi điểm (giftKey lp:…, NT-BH-020) có căn cứ là phần thưởng module loyalty báo giá — kiểm riêng ở dưới, không cần chương trình Core.
  const noPolicy = draft.lines.filter((l) => !loyaltyGiftIndex(l) && (l.isGift || (l.promoDiscount ?? 0) > 0) && (!l.policyRef || !refs.has(l.policyRef.key) || refs.get(l.policyRef.key)!.version !== l.policyRef.version));
  if (noPolicy.length) {
    return fail('validation', 'POS_GIFT_WITHOUT_POLICY', `Dòng quà / giảm theo chương trình thiếu căn cứ (chương trình + bản ở dòng và ở policyRefs kèm băm): ${noPolicy.map((l) => l.sku).join(', ')}`, noPolicy.map((l) => ({ lineId: l.lineId, sku: l.sku })));
  }

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
    if ((l.promoDiscount ?? 0) > l.clientUnitPrice * l.unitQty) {
      return fail('validation', 'POS_DISCOUNT_TOO_LARGE', `Dòng ${l.sku}: tiền giảm theo chương trình lớn hơn thành tiền`, { lineId: l.lineId });
    }
    // Dòng quà: 0đ (giá máy gửi chỉ để hiện "trị giá"), không giảm.
    const money = l.isGift ? lineMoney(0, l.unitQty, item.taxRate) : lineMoney(l.clientUnitPrice, l.unitQty, item.taxRate, l.manualDiscount, l.promoDiscount ?? 0);
    lines.push({ draft: l, item: { ...item, taxCode: item.taxCode, taxRate: item.taxRate }, unitRatio: l.unitRatio ?? 1, money });
  }
  if (missing.length) return fail('validation', 'POS_UNKNOWN_SKU', `Không có mã hàng trong danh mục kế toán: ${missing.join(', ')}`, missing.map((sku) => ({ sku })));
  if (untaxed.length) return fail('validation', 'POS_TAX_NOT_DECLARED', `Mã hàng chưa khai mã thuế đầu ra: ${untaxed.join(', ')}`, untaxed.map((sku) => ({ sku })));

  // [2026-11-15 07:40 PM Võ Hoàng] POS-LOYALTY — NT-BH-020 bước 2: quà đổi điểm khớp báo giá; voucher chia vào dòng (đóng góp)
  const loy = input.loyalty;
  if (!loy?.lenient) {
    const gifts = loy?.gifts ?? new Map<string, { sku: string; quantity: number }>();
    const wrong = lines.filter((l) => {
      const idx = loyaltyGiftIndex(l.draft);
      if (!idx) return false;
      const r = gifts.get(idx);
      return !r || r.sku !== l.item.sku || r.quantity !== l.draft.unitQty * l.unitRatio;
    });
    const missing = [...gifts.entries()].filter(([idx]) => !lines.some((l) => loyaltyGiftIndex(l.draft) === idx));
    if (wrong.length || missing.length) {
      return fail('validation', 'POS_GIFT_WITHOUT_POLICY', `Quà đổi điểm không khớp phần thưởng đã chọn (mã hàng / số lượng): ${[...wrong.map((l) => l.item.sku), ...missing.map(([i]) => i)].join(', ')}`,
        { field: 'lines', items: [...wrong.map((l) => ({ lineId: l.draft.lineId, sku: l.item.sku })), ...missing.map(([index]) => ({ index }))] });
    }
    const v = loy?.voucher;
    if (v && v.amount > 0) {
      const paid = lines.filter((l) => !l.draft.isGift && l.money.gross > 0);
      const room = paid.reduce((t, l) => t + l.money.gross, 0);
      if (!paid.length || v.amount > room) {
        return fail('validation', 'POS_DISCOUNT_TOO_LARGE', `Voucher ${v.code} giảm ${v.amount} lớn hơn tiền hàng còn lại (${room})`, { field: 'promotionSelections' });
      }
      // Chia tiền giảm theo thành tiền dòng (sau các giảm khác), tổng đúng bằng tiền voucher (allocate — chia không lệch đồng).
      const shares = allocate(v.amount, paid.map((l) => l.money.gross));
      paid.forEach((l, i) => {
        l.voucherDiscount = shares[i]!;
        l.money = lineMoney(l.draft.clientUnitPrice, l.draft.unitQty, l.item.taxRate, l.draft.manualDiscount, (l.draft.promoDiscount ?? 0) + shares[i]!);
      });
    }
  }

  // [2026-11-15 10:55 AM Võ Hoàng] POS-BILLZ — NT-BH-019 bước 1 (đóng góp): nhận bill Z thay vì chặn.
  // Bill Z (D-MP-12): dòng 0đ của mã không gửi thuế — POS đang chạy in thành phiếu riêng (xuất tặng, không lên hoá đơn). Ở đây
  // đơn vẫn là một chứng từ bán: dòng đó là dòng quà 0đ (isBillZ → isGift trên chứng từ, không doanh thu, không thuế; giá vốn
  // tháng ghi theo luật hàng khuyến mãi), đơn trả máy mang sendTax = false → máy bán tách bill Z khi in, hoá đơn điện tử bỏ dòng.
  // Không nộp phiếu điều chỉnh giảm kho riêng: loại stock_adjustment ghi đối ứng "hàng thiếu chờ xử lý" (NT-BH-019 Q2).
  // Dòng không gửi thuế mà THU TIỀN: nhận như dòng bán (phiếu thu khớp phiếu bán), sendTax = false, không lên hoá đơn.

  const subtotal = lines.reduce((s, l) => s + l.money.net, 0);
  const taxTotal = lines.reduce((s, l) => s + l.money.tax, 0);
  const total = subtotal + taxTotal;
  // Lần tính thử trước khi hỏi module loyalty (NT-BH-020): chỉ cần dòng, tổng, khách — chưa có voucher nên chưa so tổng / thanh toán.
  if (input.loyalty?.lenient) {
    const who = resolveCustomer(input);
    if ('problem' in who) return who;
    return { lines, subtotal, taxTotal, total, payments: [], offsets: [], change: 0, customer: who.customer, qrAmount: 0 };
  }
  if (total !== draft.clientTotal) {
    return fail('conflict', 'POS_PRICE_CHANGED', `Tổng máy tính ${draft.clientTotal} khác tổng máy chủ tính ${total} — tải lại giỏ`, { clientTotal: draft.clientTotal, total });
  }

  // Đổi hàng (G1, họp 04/11): đơn mới phải bằng hoặc cao hơn giá trị hàng trả.
  const ex = input.exchange;
  if (ex && total < ex.credit) {
    return fail('validation', 'POS_EXCHANGE_LOWER', `Đổi hàng phải bằng hoặc cao hơn giá trị hàng trả (${ex.credit}); đơn mới ${total}`, { credit: ex.credit, total });
  }

  // Thanh toán (D-MP-7): tiền mặt, hoặc chia tiền không có QR / ghi nợ; đối trừ chỉ trong đổi hàng.
  const active = new Map(paymentMethods.map((m) => [m.code, m]));
  let payments: ComputedOrder['payments'];
  let offsetPaid = 0;
  let change = 0;
  let qrAmount = 0;
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
      if (isOffsetMethod(part.method)) {
        if (!ex) return fail('validation', 'POS_NOT_SUPPORTED_YET', 'Đối trừ chỉ dùng trong đổi hàng', { method: part.method });
        offsetPaid += part.amount;
        continue;
      }
      if (!active.has(part.method)) return fail('validation', 'POS_UNKNOWN_METHOD', `Hình thức thanh toán ${part.method} không có trong danh mục`, { method: part.method });
      if (seen.has(part.method)) return fail('validation', 'POS_DUPLICATE_METHOD', `Hình thức ${part.method} lặp lại`, { method: part.method });
      seen.add(part.method);
      const kind = paymentKind(part.method);
      if (kind === 'qr') { qrAmount += part.amount; continue; }
      if (kind === 'credit' || kind === 'offset') {
        return fail('validation', 'POS_NOT_SUPPORTED_YET', `Máy chủ POS chưa nhận phần ${part.method} trong chia tiền ở đợt này`, { method: part.method });
      }
    }
    const paid = p.parts.reduce((s, x) => s + x.amount, 0);
    if (paid !== total) return fail('validation', 'POS_SPLIT_MISMATCH', `Các phần cộng ${paid}, tổng đơn ${total} (chênh ${paid - total})`, { total, paid });
    if (ex && offsetPaid !== ex.credit) {
      return fail('validation', 'POS_SPLIT_MISMATCH', `Phần đối trừ ${offsetPaid} phải đúng bằng tiền hàng trả ${ex.credit}`, { credit: ex.credit, offset: offsetPaid });
    }
    payments = p.parts.filter((x) => !isOffsetMethod(x.method)).map((x) => ({ methodCode: x.method, amount: x.amount }));
  } else if (p.mode === 'qr') {
    // Trả hết bằng QR chuyển khoản (NT-BH-009): ghi sổ theo hình thức QR của danh mục; đơn chờ trả tiền.
    const qr = paymentMethods.find((m) => paymentKind(m.code) === 'qr');
    if (!qr) return fail('validation', 'POS_UNKNOWN_METHOD', 'Danh mục hình thức thanh toán chưa có QR chuyển khoản', { method: 'QR' });
    payments = total > 0 ? [{ methodCode: qr.code, amount: total }] : [];
    qrAmount = total;
  } else {
    return fail('validation', 'POS_NOT_SUPPORTED_YET', 'Hình thức thanh toán chưa nhận ở đợt này');
  }

  const who = resolveCustomer(input);
  if ('problem' in who) return who;
  const customer = who.customer;

  if (ex && p.mode !== 'split') return fail('validation', 'POS_SPLIT_MISMATCH', 'Đổi hàng phải có phần đối trừ đúng bằng tiền hàng trả', { credit: ex.credit });
  const offsets = ex && ex.credit > 0 ? [{ docKey: ex.returnDocKey, amount: ex.credit }] : [];
  return { lines, subtotal, taxTotal, total, payments, offsets, change, customer, qrAmount };
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
      // Kế toán khớp dòng theo định danh, mã chỉ để đọc. Riêng dòng quà theo chương trình: chỉ gửi mã (NT-BH-003) — khuôn BH12 chỉ biết
      // mã, cửa nạp so quà theo itemId ?? sku (IN-POL-004) nên gửi itemId là lệch giả; cửa nạp tự tra mặt hàng theo mã tại ngày chứng từ.
      // Đề xuất Core: IN-POL-004 quy cả hai phía về itemId trước khi so (ghi ở chữ chốt PHASE-031 · 00 §17).
      ...(l.item.itemId && !(l.draft.isGift && l.draft.policyRef) ? { itemId: l.item.itemId } : {}),
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
      ...(l.draft.isGift || isBillZLine(l) ? { isGift: true } : {}),
      ...(l.draft.policyRef ? { policyRef: { key: l.draft.policyRef.key, version: l.draft.policyRef.version, line: l.draft.policyRef.line ?? (l.draft.isGift ? 'gift' : 'discount') } } : {}),
      ...(l.draft.note ? { note: l.draft.note } : {}),
    })),
    // Bản chính sách đã áp (NT-BH-003): đúng mảng Core trả, chỉ các chương trình có dòng trên phiếu — cửa nạp kiểm lại (IN-POL-001..004).
    ...(usedRefs(o, draft).length ? { policyRefs: usedRefs(o, draft) } : {}),
    payments: o.payments,
    ...(o.offsets.length ? { offsets: o.offsets } : {}),
    totals: { beforeTax: o.subtotal, tax: o.taxTotal, total: o.total },
  };
}

function usedRefs(o: ComputedOrder, draft: OrderDraft) {
  const keys = new Set(o.lines.map((l) => l.draft.policyRef?.key).filter((k): k is string => Boolean(k)));
  return (draft.policyRefs ?? []).filter((r) => keys.has(r.key) && r.hash).map((r) => ({ key: r.key, version: r.version, hash: r.hash! }));
}

/** Hạn giữ mã QR (gia hạn được trong ngày bán — NT-BH-009). */
export const QR_HOLD_MS = 5 * 60_000;

/**
 * Tách bill Z cho đơn trả máy (NT-BH-019; cùng luật máy bán tgs_pos_react core/zBill.ts và POS cũ split_products_by_promo_sku):
 * dòng ứng viên = mã không gửi thuế; chỉ tách khi TẤT CẢ ứng viên cộng lại bằng 0đ (có dòng thu tiền thì không tách gì — phiếu thu
 * đã theo tổng đơn). Mã bill Z = mã đơn + "Z". Chỉ là cách trình bày đơn (in bill, bản sao website zsale / zexport): chứng từ bán
 * vẫn mang đủ dòng, dòng bill Z là dòng quà 0đ.
 */
export function splitBillZ<L extends { sendTax: boolean; amount: number; taxAmount: number }>(lines: readonly L[]): { main: L[]; z: L[] } {
  const z = lines.filter((l) => !l.sendTax);
  if (!z.length || z.reduce((t, l) => t + l.amount + l.taxAmount, 0) !== 0) return { main: [...lines], z: [] };
  return { main: lines.filter((l) => l.sendTax), z };
}

/** Đơn trả cho máy (khuôn Order của hợp đồng /pos/*). */
/**
 * Điểm thành viên của đơn (khuôn OrderLoyalty máy bán in bill) + phần thưởng đã đổi (module loyalty đọc lại khi ghi sổ điểm) —
 * NT-BH-020 bước 2. Có khi module loyalty đã báo giá cho đơn có khách.
 */
export type SnapshotLoyalty = {
  earned: number; redeemed: number; balanceAfter: number; tierKey: string; tierName: string;
  vouchers: { code: string; discountType: string; discountValue: number; maxDiscount: number; minOrderAmount: number; expiresAt: string | null }[];
  rewards: unknown[];
};

export function toOrderSnapshot(o: ComputedOrder, meta: { draft: OrderDraft; code: string; branch: BranchRow; createdAt: string; loyalty?: SnapshotLoyalty; usedVouchers?: string[] }) {
  const { draft } = meta;
  const all = o.lines.map((l) => ({
      ...l.draft,
      name: l.item.name,
      unitRatio: l.unitRatio,
      unitPrice: l.draft.clientUnitPrice,
      taxRate: l.item.taxRate,
      amount: l.money.net,
      taxAmount: l.money.tax,
      promoDiscount: l.draft.promoDiscount ?? 0,
      promotions: [] as { promotionId: number; amount: number }[],
      ...(l.item.itemId ? { itemId: l.item.itemId } : {}),
      // false = không lên hoá đơn thuế (máy bán và hoá đơn điện tử đọc cờ này).
      sendTax: l.item.sendTax,
      ...(l.voucherDiscount ? { voucherDiscount: l.voucherDiscount } : {}),
    }));
  const bill = splitBillZ(all);
  const payment = draft.payment.mode === 'cash' ? { ...draft.payment, change: o.change } : draft.payment;
  return {
    id: draft.id,
    code: meta.code,
    // Đơn có phần QR chờ tiền về / thu ngân xác nhận (NT-BH-009); hạn mã 5 phút, gia hạn trong ngày bán.
    status: (o.qrAmount > 0 ? 'awaiting_payment' : 'completed') as 'completed' | 'awaiting_payment',
    ...(o.qrAmount > 0 ? { qr: { amount: o.qrAmount, status: 'waiting' as const, expiresAt: new Date(Date.parse(meta.createdAt) + QR_HOLD_MS).toISOString() } } : {}),
    businessDate: draft.businessDate,
    createdAt: meta.createdAt,
    customer: o.customer ? { id: o.customer.code, name: o.customer.name, phone: o.customer.phone } : { id: '', name: 'Khách lẻ', phone: '' },
    lines: bill.main,
    ...(bill.z.length ? { zBill: { code: `${meta.code}Z`, lines: bill.z } } : {}),
    subtotal: o.subtotal,
    taxTotal: o.taxTotal,
    total: o.total,
    payment,
    flags: { oversold: false, promoMismatch: false },
    ...(draft.saleSource ? { saleSource: draft.saleSource } : {}),
    promotions: [] as unknown[],
    ...(meta.loyalty ? { loyalty: meta.loyalty } : {}),
    ...(meta.usedVouchers?.length ? { usedVouchers: meta.usedVouchers } : {}),
    branch: { code: meta.branch.code, name: meta.branch.name, taxCode: meta.branch.taxCode },
    mirror: { status: 'pending' as const },
  };
}
