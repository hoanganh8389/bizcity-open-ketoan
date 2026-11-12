/** NT-BH-004 — phần tính thuần của đơn bán tại quầy (không CSDL). Phần ghi sổ: apps/api/test/nt-bh-004-pos-don-ban.test.ts. */
import { describe, expect, it } from 'vitest';
import { codePeriod, computeOrder, formatCode, lineMoney, parseCode, paymentKind, toOrderSnapshot, toSaleDocument, type CatalogItem } from '../api/domain/order.js';
import { orderDraftSchema, type OrderDraft } from '../api/domain/schema.js';

const ITEM_SUA = '01JC0S0A4000000000000000AA';
const item = (sku: string, name: string, unit: string, taxCode: string | null, taxRate: number | null, over: Partial<CatalogItem> = {}): CatalogItem =>
  ({ sku, name, unit, taxCode, taxRate, itemId: null, variant: 'normal', sendTax: true, ...over });
const catalog = new Map<string, CatalogItem>([
  ['SUA400', item('SUA400', 'Sữa bột 400g', 'Hộp', 'R08', 8, { itemId: ITEM_SUA })],
  ['TA01', item('TA01', 'Tã quần L', 'Gói', 'R10', 10)],
  ['CHUATHUE', item('CHUATHUE', 'Hàng chưa khai thuế', 'Cái', null, null)],
  // Mã chỉ là số: nghĩa nằm ở ô Biến thể / Gửi lên thuế, không ở chữ cuối mã.
  ['11005100103', item('11005100103', 'Bình sữa quà tặng', 'Cái', 'R08', 8, { variant: 'internal', sendTax: false })],
  ['11005100102', item('11005100102', 'Bình sữa kẹp quà', 'Cái', 'R08', 8, { variant: 'clip', sendTax: false })],
  ['110051001Z', item('110051001Z', 'Mã cũ còn đuôi Z, gửi thuế', 'Cái', 'R08', 8)],
]);
const methods = [{ code: 'TM', name: 'Tiền mặt' }, { code: 'CK', name: 'Chuyển khoản' }, { code: 'QR', name: 'QR' }];

const draft = (over: Partial<OrderDraft> = {}): OrderDraft => orderDraftSchema.parse({
  id: '0193a1b2-0000-7000-8000-000000000001',
  branchCode: 'CN01',
  businessDate: '2026-11-09',
  shiftId: 'ngay-2026-11-09',
  exportReasonCode: 'XBA',
  customer: { retail: true },
  lines: [{ lineId: 'l1', productId: 'SUA400', sku: 'SUA400', unitName: 'Hộp', unitQty: 1, clientUnitPrice: 324_000 }],
  promotionSelections: [],
  payment: { mode: 'cash', cashGiven: 500_000 },
  clientTotal: 324_000,
  coreVersion: '0.1.0',
  promotionsVersion: '',
  ...over,
});

const tinhHuong2 = () => draft({
  customer: { phone: '0911 222 333', name: 'Khách thử POS' },
  lines: [
    { lineId: 'l1', sku: 'SUA400', unitName: 'Hộp', unitQty: 2, clientUnitPrice: 324_000, manualDiscount: { kind: 'percent', value: 10 } },
    { lineId: 'l2', sku: 'TA01', unitName: 'Gói', unitQty: 1, clientUnitPrice: 215_000 },
  ] as OrderDraft['lines'],
  payment: { mode: 'split', parts: [{ method: 'TM', amount: 300_000 }, { method: 'CK', amount: 498_200 }] },
  clientTotal: 798_200,
});

describe('NT-BH-004 — tiền dòng tách thuế như máy bán', () => {
  it('tình huống 1: 324.000 gồm thuế 8% → 300.000 + 24.000', () => {
    expect(lineMoney(324_000, 1, 8)).toEqual({ gross: 324_000, net: 300_000, tax: 24_000, discountGross: 0, discountNet: 0 });
  });

  it('tình huống 2: SUA400 ×2 giảm 10% → 583.200 = 540.000 + 43.200; TA01 215.000 thuế 10% → 195.455 + 19.545', () => {
    expect(lineMoney(324_000, 2, 8, { kind: 'percent', value: 10 })).toMatchObject({ gross: 583_200, net: 540_000, tax: 43_200, discountGross: 64_800 });
    expect(lineMoney(215_000, 1, 10)).toMatchObject({ gross: 215_000, net: 195_455, tax: 19_545 });
  });

  it('khớp từng đồng công thức pos-core của máy bán (giá 1.000–2.000.000 bước 500đ × thuế 0/5/8/10%, SL 1–3, giảm %)', () => {
    // Bản tham chiếu viết lại từ tgs_pos_react packages/pos-core (cart.ts lineNetExact, tax.ts lineAmounts).
    const ref = (price: number, qty: number, rate: number, pct?: number) => {
      const base = price * qty;
      const exact = pct ? base - (base * pct) / 100 : base;
      const gross = Math.floor(exact + 0.5);
      const net = Math.floor(exact / (1 + rate / 100) + 0.5);
      return { gross, net, tax: gross - net };
    };
    let n = 0;
    for (let price = 1_000; price <= 2_000_000; price += 500) {
      for (const rate of [0, 5, 8, 10]) {
        const qty = 1 + (price % 3);
        const pct = price % 7 === 0 ? 7.5 : undefined;
        const m = lineMoney(price, qty, rate, pct ? { kind: 'percent', value: pct } : undefined);
        const r = ref(price, qty, rate, pct);
        if (m.gross !== r.gross || m.net !== r.net || m.tax !== r.tax) throw new Error(`lệch ở giá ${price} SL ${qty} thuế ${rate}%`);
        n += 1;
      }
    }
    expect(n).toBeGreaterThan(15_000);
  });
});

describe('NT-BH-004 — tính đơn và dựng chứng từ sale', () => {
  it('tình huống 1: khách lẻ, tiền mặt 500.000 → thu TM 324.000, thối 176.000, không đối tượng', () => {
    const o = computeOrder({ draft: draft(), catalog, paymentMethods: methods });
    if ('problem' in o) throw new Error(o.problem.message);
    expect([o.subtotal, o.taxTotal, o.total, o.change]).toEqual([300_000, 24_000, 324_000, 176_000]);
    const doc = toSaleDocument(o, { draft: draft(), branchCode: 'CN01', code: 'HD2611000001' });
    expect(doc).toMatchObject({
      docType: 'sale', docKey: 'pos:CN01:sale:0193a1b2-0000-7000-8000-000000000001', docNo: 'HD2611000001', docDate: '2026-11-09',
      payments: [{ methodCode: 'TM', amount: 324_000 }], totals: { beforeTax: 300_000, tax: 24_000, total: 324_000 },
    });
    expect(doc).not.toHaveProperty('partner');
    expect(doc.lines[0]).toMatchObject({ sku: 'SUA400', qty: 1, amountBeforeTax: 300_000, taxCode: 'R08', taxAmount: 24_000 });
    expect(JSON.stringify(doc)).not.toMatch(/"(account|debit|credit)/i);
  });

  it('tình huống 2: giảm tay 10%, hai thuế suất, TM + CK, khách mới theo SĐT', () => {
    const d = tinhHuong2();
    const o = computeOrder({ draft: d, catalog, paymentMethods: methods });
    if ('problem' in o) throw new Error(o.problem.message);
    expect([o.subtotal, o.taxTotal, o.total]).toEqual([735_455, 62_745, 798_200]);
    expect(o.customer).toEqual({ code: '0911222333', name: 'Khách thử POS', phone: '0911222333' });
    const doc = toSaleDocument(o, { draft: d, branchCode: 'CN01', code: 'HD2611000002' });
    expect(doc.payments).toEqual([{ methodCode: 'TM', amount: 300_000 }, { methodCode: 'CK', amount: 498_200 }]);
    expect(doc.lines.map((l) => [l.amountBeforeTax, l.taxAmount, l.discount])).toEqual([[540_000, 43_200, 60_000], [195_455, 19_545, 0]]);
    // Đơn giá chưa thuế trước giảm: 300.000 × 2 − 60.000 = 540.000 (không trừ chiết khấu hai lần).
    expect(doc.lines.map((l) => l.unitPrice)).toEqual([300_000, 195_455]);
    expect(doc.partner).toEqual({ code: '0911222333', name: 'Khách thử POS', phone: '0911222333' });
  });

  it('ĐVT quy đổi: 2 Lốc_4 → qty 8 đơn vị nhỏ nhất, unitQty 2', () => {
    const d = draft({ lines: [{ lineId: 'l1', sku: 'SUA400', unitName: 'Lốc_4', unitQty: 2, unitRatio: 4, clientUnitPrice: 324_000 }] as OrderDraft['lines'], clientTotal: 648_000, payment: { mode: 'cash', cashGiven: 648_000 } });
    const o = computeOrder({ draft: d, catalog, paymentMethods: methods });
    if ('problem' in o) throw new Error(o.problem.message);
    expect(toSaleDocument(o, { draft: d, branchCode: 'CN01', code: 'HD2611000003' }).lines[0]).toMatchObject({ qty: 8, unitQty: 2, unitRatio: 4 });
  });
});

describe('NT-BH-004 — trường hợp lệch chuẩn (tầng tính)', () => {
  const reason = (d: OrderDraft) => {
    const o = computeOrder({ draft: d, catalog, paymentMethods: methods });
    return 'problem' in o ? o.problem.reason : 'OK';
  };

  it('2. mã hàng không có trong danh mục → POS_UNKNOWN_SKU', () => {
    expect(reason(draft({ lines: [{ lineId: 'l1', sku: 'KHONGCO', unitName: 'Hộp', unitQty: 1, clientUnitPrice: 1000 }] as OrderDraft['lines'] }))).toBe('POS_UNKNOWN_SKU');
  });
  it('3. mã hàng chưa khai mã thuế → POS_TAX_NOT_DECLARED', () => {
    expect(reason(draft({ lines: [{ lineId: 'l1', sku: 'CHUATHUE', unitName: 'Cái', unitQty: 1, clientUnitPrice: 1000 }] as OrderDraft['lines'] }))).toBe('POS_TAX_NOT_DECLARED');
  });
  it('4. tiền mặt thiếu → POS_CASH_INSUFFICIENT', () => {
    expect(reason(draft({ payment: { mode: 'cash', cashGiven: 300_000 } }))).toBe('POS_CASH_INSUFFICIENT');
  });
  it('5. chia tiền lệch tổng / mã lạ / lặp mã', () => {
    expect(reason(draft({ payment: { mode: 'split', parts: [{ method: 'TM', amount: 300_000 }] } }))).toBe('POS_SPLIT_MISMATCH');
    expect(reason(draft({ payment: { mode: 'split', parts: [{ method: 'VI', amount: 324_000 }] } }))).toBe('POS_UNKNOWN_METHOD');
    expect(reason(draft({ payment: { mode: 'split', parts: [{ method: 'TM', amount: 1 }, { method: 'TM', amount: 323_999 }] } }))).toBe('POS_DUPLICATE_METHOD');
  });
  it('6. tổng máy tính khác → POS_PRICE_CHANGED (xung đột)', () => {
    const o = computeOrder({ draft: draft({ clientTotal: 324_001 }), catalog, paymentMethods: methods });
    expect('problem' in o && o.problem).toMatchObject({ kind: 'conflict', reason: 'POS_PRICE_CHANGED' });
  });
  it('7. SL ≤ 0, giá âm, giảm % > 100 bị chặn ngay ở khuôn; giảm tiền > thành tiền → POS_DISCOUNT_TOO_LARGE', () => {
    expect(() => draft({ lines: [{ lineId: 'l1', sku: 'SUA400', unitName: 'Hộp', unitQty: 0, clientUnitPrice: 1 }] as OrderDraft['lines'] })).toThrow();
    expect(() => draft({ lines: [{ lineId: 'l1', sku: 'SUA400', unitName: 'Hộp', unitQty: 1, clientUnitPrice: -1 }] as OrderDraft['lines'] })).toThrow();
    expect(() => draft({ lines: [{ lineId: 'l1', sku: 'SUA400', unitName: 'Hộp', unitQty: 1, clientUnitPrice: 1, manualDiscount: { kind: 'percent', value: 101 } }] as OrderDraft['lines'] })).toThrow();
    expect(reason(draft({ lines: [{ lineId: 'l1', sku: 'SUA400', unitName: 'Hộp', unitQty: 1, clientUnitPrice: 324_000, manualDiscount: { kind: 'amount', value: 324_001 } }] as OrderDraft['lines'] }))).toBe('POS_DISCOUNT_TOO_LARGE');
  });
  it('8. CTKM, dòng quà, đổi điểm, ghi nợ → POS_NOT_SUPPORTED_YET (QR nhận từ NT-BH-009)', () => {
    expect(reason(draft({ promotionSelections: [{ kind: 'coupon', code: 'KM1' }] }))).toBe('POS_NOT_SUPPORTED_YET');
    expect(reason(draft({ lines: [{ lineId: 'g', sku: 'SUA400', unitName: 'Hộp', unitQty: 1, clientUnitPrice: 0, isGift: true }] as OrderDraft['lines'] }))).toBe('POS_NOT_SUPPORTED_YET');
    expect(reason(draft({ loyalty: { redeem: ['lp_1'] } }))).toBe('POS_NOT_SUPPORTED_YET');
    expect(reason(draft({ payment: { mode: 'credit' } }))).toBe('POS_NOT_SUPPORTED_YET');
  });
  // [2026-11-13 12:50 AM Võ Hoàng] POS-QR — QR trả hết / phần QR trong chia tiền: nhận, đơn chờ trả tiền (NT-BH-009) (đóng góp)
  it('QR trả hết và phần QR trong chia tiền: nhận; qrAmount = phần QR; ghi sổ theo hình thức QR', () => {
    const all = computeOrder({ draft: draft({ payment: { mode: 'qr' } }), catalog, paymentMethods: methods });
    expect('problem' in all ? all.problem.reason : all.qrAmount).toBe(324_000);
    if (!('problem' in all)) expect(all.payments).toEqual([{ methodCode: 'QR', amount: 324_000 }]);
    const split = computeOrder({ draft: draft({ payment: { mode: 'split', parts: [{ method: 'TM', amount: 24_000 }, { method: 'QR', amount: 300_000 }] } }), catalog, paymentMethods: methods });
    expect('problem' in split ? split.problem.reason : split.qrAmount).toBe(300_000);
  });
  it('SĐT sai khuôn / thiếu tên', () => {
    expect(reason(draft({ customer: { phone: '0911', name: 'A' } }))).toBe('POS_BAD_PHONE');
    expect(reason(draft({ customer: { phone: '0911222333', name: ' ' } }))).toBe('POS_MISSING_NAME');
  });
});

describe('Mã phiếu, hình thức thanh toán', () => {
  it('HD + yyMM + 6 số, 12 ký tự; đọc lại đúng kỳ', () => {
    expect(codePeriod('2026-11-09')).toBe('2611');
    expect(formatCode('sale', '2611', 1)).toBe('HD2611000001');
    expect(formatCode('sale', '2611', 1)).toHaveLength(12);
    expect(parseCode('sale', '2611', 'HD2611000042')).toBe(42);
    expect(parseCode('sale', '2612', 'HD2611000042')).toBeNull();
    expect(() => formatCode('sale', '2611', 1_000_000)).toThrow();
  });
  it('loại hình thức theo mã kế toán; mã lạ = chuyển khoản', () => {
    expect(['TM', 'CK', 'QR', 'POS', 'VOUCHER', 'CONGNO', 'DOI_TRU', 'VI_MOMO'].map(paymentKind)).toEqual(['cash', 'transfer', 'qr', 'card', 'voucher', 'credit', 'offset', 'transfer']);
  });
});

// D-MP-12: mã số cha – con. Thuế xét ô Gửi lên thuế, giá 0đ xét ô Biến thể; không đọc chữ cuối mã.
describe('ô Gửi lên thuế / Biến thể của mặt hàng', () => {
  const lines = (...ls: Partial<OrderDraft['lines'][number]>[]) =>
    ls.map((l, i) => ({ lineId: `l${i + 1}`, sku: 'SUA400', unitName: 'Hộp', unitQty: 1, clientUnitPrice: 324_000, ...l })) as OrderDraft['lines'];

  it('dòng chứng từ mang itemId (kế toán khớp theo định danh); đơn trả máy mang sendTax', () => {
    const d = draft();
    const o = computeOrder({ draft: d, catalog, paymentMethods: methods });
    if ('problem' in o) throw new Error(o.problem.message);
    expect(toSaleDocument(o, { draft: d, branchCode: 'CN01', code: 'HD2611000001' }).lines[0]).toMatchObject({ sku: 'SUA400', itemId: ITEM_SUA });
    const snap = toOrderSnapshot(o, { draft: d, code: 'HD2611000001', branch: { code: 'CN01', name: 'CN01', taxCode: '', address: '' }, createdAt: '2026-11-09T00:00:00Z' });
    expect(snap.lines[0]).toMatchObject({ itemId: ITEM_SUA, sendTax: true });
  });

  it('hàng 0đ không gửi thuế (bill Z): W1 chặn rõ, kể cả mã chỉ là số', () => {
    const d = draft({ lines: lines({}, { sku: '11005100103', unitName: 'Cái', clientUnitPrice: 0 }) });
    const o = computeOrder({ draft: d, catalog, paymentMethods: methods });
    expect('problem' in o && o.problem).toMatchObject({ kind: 'validation', reason: 'POS_NOT_SUPPORTED_YET', details: { billZ: ['11005100103'] } });
  });

  it('hàng Nội bộ máy gửi giá khác 0 → POS_PRICE_CHANGED (Nội bộ luôn 0đ)', () => {
    const d = draft({ lines: lines({ sku: '11005100103', unitName: 'Cái', clientUnitPrice: 10_000 }), clientTotal: 10_000 });
    const o = computeOrder({ draft: d, catalog, paymentMethods: methods });
    expect('problem' in o && o.problem).toMatchObject({ kind: 'conflict', reason: 'POS_PRICE_CHANGED', details: [{ sku: '11005100103', price: 0 }] });
  });

  it('mã không gửi thuế mà thu tiền: nhận như dòng bán (không tách), đơn ghi sendTax = false', () => {
    const d = draft({ lines: lines({}, { sku: '11005100102', unitName: 'Cái', clientUnitPrice: 54_000 }), clientTotal: 378_000 });
    const o = computeOrder({ draft: d, catalog, paymentMethods: methods });
    if ('problem' in o) throw new Error(o.problem.message);
    expect(o.total).toBe(378_000);
    const snap = toOrderSnapshot(o, { draft: d, code: 'HD2611000002', branch: { code: 'CN01', name: 'CN01', taxCode: '', address: '' }, createdAt: '2026-11-09T00:00:00Z' });
    expect(snap.lines.map((l) => [l.sku, l.sendTax])).toEqual([['SUA400', true], ['11005100102', false]]);
    expect(snap).not.toHaveProperty('zBill');
  });

  it('mã còn đuôi Z nhưng ô Gửi lên thuế bật: bán như hàng thường', () => {
    const d = draft({ lines: lines({ sku: '110051001Z', unitName: 'Cái', clientUnitPrice: 54_000 }), clientTotal: 54_000 });
    const o = computeOrder({ draft: d, catalog, paymentMethods: methods });
    if ('problem' in o) throw new Error(o.problem.message);
    expect(o.lines[0]!.item.sendTax).toBe(true);
  });
});
