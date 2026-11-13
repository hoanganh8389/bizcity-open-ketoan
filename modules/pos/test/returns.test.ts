// NT-BH-005 — hoàn hàng / đổi hàng tại quầy: hàm thuần (không CSDL). Số liệu đơn gốc là tình huống 2 của NT-BH-004.
import { describe, expect, it } from 'vitest';
import { computeOrder, type CatalogItem } from '../api/domain/order.js';
import { orderDraftSchema } from '../api/domain/schema.js';
import { computeReturn, daysSince, refundFor, requiredGiftReturns, returnDeadline, returnableLines, splitRefund, toSaleReturnDocument, type ReturnInput, type SoldLine } from '../api/domain/returns.js';

const SUA: SoldLine = { lineId: 'l1', sku: 'SUA400', name: 'Sữa bột 400g', unitName: 'Hộp', unitRatio: 1, soldQty: 2, net: 540_000, tax: 43_200, taxRate: 8, taxCode: 'R08', itemId: '01JC0S0A4000000000000000AA', isGift: false };
const TA: SoldLine = { lineId: 'l2', sku: 'TA01', name: 'Tã quần L', unitName: 'Gói', unitRatio: 1, soldQty: 1, net: 195_455, tax: 19_545, taxRate: 10, taxCode: 'R10', itemId: null, isGift: false };
const methods = [{ code: 'TM', name: 'Tiền mặt' }, { code: 'CK', name: 'Chuyển khoản' }, { code: 'QR', name: 'QR' }];

const input = (over: Partial<ReturnInput> = {}, draft: Partial<ReturnInput['draft']> = {}): ReturnInput => ({
  draft: { id: 'r1', lines: [{ lineId: 'l1', qty: 1 }], refundMethod: 'TM', reason: 'Khách đổi ý', ...draft },
  order: { status: 'completed', branchCode: 'CN01', businessDate: '2026-11-09' },
  lines: [SUA, TA], done: new Map(), branchCode: 'CN01', today: '2026-11-10', days: 3, paymentMethods: methods, exchange: false,
  ...over,
});

describe('NT-BH-005 — tiền hoàn', () => {
  it('trả 1 trong 2 hộp: 583.200 × 1 ÷ 2 = 291.600 = 270.000 + 21.600', () => {
    const [l] = returnableLines([SUA], new Map());
    expect(l).toMatchObject({ soldQty: 2, returnedQty: 0, returnableQty: 2, lineTotal: 583_200, refundedAmount: 0 });
    expect(refundFor(l!, 1)).toBe(291_600);
    expect(splitRefund(SUA, { qty: 0, refund: 0, net: 0 }, 1, 291_600)).toEqual({ net: 270_000, tax: 21_600 });
  });

  it('trả nốt phần còn lại: đúng số còn lại, chưa thuế còn lại → tổng khớp đơn gốc', () => {
    const done = { qty: 1, refund: 291_600, net: 270_000 };
    const [l] = returnableLines([SUA], new Map([['l1', done]]));
    expect(refundFor(l!, 1)).toBe(291_600);
    expect(splitRefund(SUA, done, 1, 291_600)).toEqual({ net: 270_000, tax: 21_600 });
    // Dòng lẻ: 3 hộp 100.000 (8%) — 2 lần trả không lệch 1đ so với tiền đã thu.
    const odd: SoldLine = { ...SUA, soldQty: 3, net: 277_778, tax: 22_222 };
    const first = refundFor({ soldQty: 3, returnedQty: 0, lineTotal: 300_000, refundedAmount: 0 }, 2);
    const firstSplit = splitRefund(odd, { qty: 0, refund: 0, net: 0 }, 2, first);
    const last = refundFor({ soldQty: 3, returnedQty: 2, lineTotal: 300_000, refundedAmount: first }, 1);
    const lastSplit = splitRefund(odd, { qty: 2, refund: first, net: firstSplit.net }, 1, last);
    expect(first + last).toBe(300_000);
    expect(firstSplit.net + lastSplit.net).toBe(277_778);
    expect(firstSplit.tax + lastSplit.tax).toBe(22_222);
  });

  it('hạn trả: ngày bán + 3 ngày; quá hạn tính theo lịch', () => {
    expect(returnDeadline('2026-11-09', 3)).toBe('2026-11-12');
    expect(daysSince('2026-11-09', '2026-11-12')).toBe(3);
    expect(daysSince('2026-10-31', '2026-11-01')).toBe(1);
  });
});

describe('NT-BH-005 — phiếu trả', () => {
  it('tình huống 1: phiếu trả TM 291.600; chứng từ sale_return nối đơn gốc, trả tiền một khoản', () => {
    const r = computeReturn(input());
    if ('problem' in r) throw new Error(r.problem.message);
    expect([r.refundTotal, r.net, r.tax, r.methodCode, r.late]).toEqual([291_600, 270_000, 21_600, 'TM', false]);
    const doc = toSaleReturnDocument(r, { id: 'r1', branchCode: 'CN01', code: 'TH2611000001', businessDate: '2026-11-10', reason: 'Khách đổi ý', originalDocKey: 'pos:CN01:sale:o1', partner: null });
    expect(doc).toMatchObject({
      docType: 'sale_return', docKey: 'pos:CN01:sale_return:r1', docNo: 'TH2611000001', docDate: '2026-11-10', originalDocKey: 'pos:CN01:sale:o1',
      payments: [{ methodCode: 'TM', amount: 291_600 }], totals: { beforeTax: 270_000, tax: 21_600, total: 291_600 },
    });
    expect(doc.lines).toEqual([expect.objectContaining({ lineKey: 'l1', sku: 'SUA400', itemId: SUA.itemId, qty: 1, unitPrice: 270_000, amountBeforeTax: 270_000, taxCode: 'R08', taxAmount: 21_600 })]);
    expect(doc).not.toHaveProperty('partner');
  });

  it('lệch chuẩn: trả quá số còn lại, dòng lạ, quá hạn không duyệt, khác chi nhánh, đơn chưa hoàn tất, hình thức sai', () => {
    const reason = (i: ReturnInput) => { const r = computeReturn(i); return 'problem' in r ? r.problem.reason : 'ok'; };
    expect(reason(input({}, { lines: [{ lineId: 'l1', qty: 3 }] }))).toBe('POS_RETURN_QTY');
    expect(reason(input({ done: new Map([['l1', { qty: 2, refund: 583_200, net: 540_000 }]]) }))).toBe('POS_RETURN_QTY');
    expect(reason(input({}, { lines: [{ lineId: 'zz', qty: 1 }] }))).toBe('POS_RETURN_QTY');
    expect(reason(input({ today: '2026-11-13' }))).toBe('POS_RETURN_EXPIRED');
    expect(reason(input({ today: '2026-11-13' }, { approval: { by: 'Phòng kinh doanh – chị A', note: 'Lỗi nhà sản xuất' } }))).toBe('ok');
    expect(reason(input({ branchCode: 'CN02' }))).toBe('POS_RETURN_OTHER_SHOP');
    expect(reason(input({ order: { status: 'cancelled', branchCode: 'CN01', businessDate: '2026-11-09' } }))).toBe('POS_ORDER_NOT_RETURNABLE');
    expect(reason(input({}, { refundMethod: 'QR' }))).toBe('POS_REFUND_METHOD');
    expect(reason(input({}, { refundMethod: 'doi_tru' }))).toBe('POS_REFUND_METHOD');
    expect(reason(input({ exchange: true }, { refundMethod: 'TM' }))).toBe('POS_REFUND_METHOD');
  });

  it('quà vượt suất phải trả kèm (họp kế toán 04/11): mua 2 tặng 1, trả 1 hộp → phải trả quà', () => {
    const lines = returnableLines([SUA, { ...TA, lineId: 'g1', isGift: true, promotionId: 7, net: 0, tax: 0 }].map((l) => (l.lineId === 'l1' ? { ...l, promotionId: undefined } : l)) as SoldLine[], new Map());
    expect([...requiredGiftReturns(lines, new Map([['l1', 1]]), () => null)]).toEqual([['g1', 1]]);
    expect([...requiredGiftReturns(lines, new Map(), () => null)]).toEqual([]);
  });

  it('đổi hàng: phiếu trả không trả tiền (đối trừ)', () => {
    const r = computeReturn(input({ exchange: true }, { refundMethod: 'doi_tru' }));
    if ('problem' in r) throw new Error(r.problem.message);
    expect(r.methodCode).toBeNull();
    const doc = toSaleReturnDocument(r, { id: 'r3', branchCode: 'CN01', code: 'TH2611000003', businessDate: '2026-11-10', reason: 'Đổi hàng', originalDocKey: 'pos:CN01:sale:o3', partner: null });
    expect(doc.payments).toEqual([]);
  });
});

describe('NT-BH-005 — đơn mới của đổi hàng', () => {
  const ta = (over: Partial<CatalogItem> = {}): CatalogItem => ({ sku: 'TA01', name: 'Tã quần L', unit: 'Gói', taxCode: 'R10', taxRate: 10, itemId: null, variant: 'normal', sendTax: true, ...over });
  const catalog = new Map([['TA01', ta()]]);
  const order = (parts: { method: string; amount: number }[], total = 430_000) => orderDraftSchema.parse({
    id: '0193a1b2-0000-7000-8000-0000000000x1', businessDate: '2026-11-10', shiftId: 'ngay-2026-11-10', exportReasonCode: 'XBA', customer: { retail: true },
    lines: [{ lineId: 'n1', sku: 'TA01', unitName: 'Gói', unitQty: 2, clientUnitPrice: 215_000 }], promotionSelections: [],
    payment: { mode: 'split', parts }, clientTotal: total, coreVersion: '0.1.0', promotionsVersion: '',
  });
  const exchange = { credit: 291_600, returnDocKey: 'pos:CN01:sale_return:r3' };

  it('tình huống 3: 430.000 = đối trừ 291.600 + TM 138.400; chứng từ sale mang offsets, thu tiền chỉ phần TM', () => {
    const o = computeOrder({ draft: order([{ method: 'doi_tru', amount: 291_600 }, { method: 'TM', amount: 138_400 }]), catalog, paymentMethods: methods, exchange });
    if ('problem' in o) throw new Error(o.problem.message);
    expect([o.subtotal, o.taxTotal, o.total]).toEqual([390_909, 39_091, 430_000]);
    expect(o.payments).toEqual([{ methodCode: 'TM', amount: 138_400 }]);
    expect(o.offsets).toEqual([{ docKey: 'pos:CN01:sale_return:r3', amount: 291_600 }]);
  });

  it('lệch chuẩn: hàng mới rẻ hơn, đối trừ sai số, đối trừ ngoài đổi hàng', () => {
    const reason = (o: ReturnType<typeof computeOrder>) => ('problem' in o ? o.problem.reason : 'ok');
    const cheap = orderDraftSchema.parse({ ...order([{ method: 'doi_tru', amount: 291_600 }]), lines: [{ lineId: 'n1', sku: 'TA01', unitName: 'Gói', unitQty: 1, clientUnitPrice: 215_000 }], clientTotal: 215_000 });
    expect(reason(computeOrder({ draft: cheap, catalog, paymentMethods: methods, exchange }))).toBe('POS_EXCHANGE_LOWER');
    expect(reason(computeOrder({ draft: order([{ method: 'doi_tru', amount: 200_000 }, { method: 'TM', amount: 230_000 }]), catalog, paymentMethods: methods, exchange }))).toBe('POS_SPLIT_MISMATCH');
    expect(reason(computeOrder({ draft: order([{ method: 'doi_tru', amount: 291_600 }, { method: 'TM', amount: 138_400 }]), catalog, paymentMethods: methods }))).toBe('POS_NOT_SUPPORTED_YET');
  });
});
