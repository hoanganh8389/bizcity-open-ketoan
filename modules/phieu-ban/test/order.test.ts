// [2026-11-17 Võ Hoàng] NGHIEM-THU — NT-BH-023: hàm thuần đơn đặt hàng (đóng góp)
import { describe, expect, it } from 'vitest';
import type { Line } from '../api/domain/doc.js';
import {
  applyDelivery, creditReasons, debtOf, deliveryLines, diffOrder, duplicatesOf, expired, formatOrderNo, mergeProgress, normPhone, parseHoldMap,
  rebalanceHolds, returnDelivery, toHoldDoc, undeliveredValue, type OrderLine,
} from '../api/domain/order.js';

const line = (over: Partial<OrderLine> = {}): OrderLine => ({
  lineKey: 'L1', sku: 'SUA330', name: 'Sữa 330', unit: 'Hộp', qty: 10, unitPrice: 330_000, discount: 0, amountBeforeTax: 3_300_000, taxCode: 'KCT',
  taxAmount: 0, isGift: false, delivered: 0, held: 0, ...over,
});

describe('số đơn, hạn, SĐT, cấu hình kho giữ', () => {
  it('DH + yyMM + 6 số; hết hạn so theo ngày; SĐT chỉ chữ số; "CN01=KCB01" → bảng', () => {
    expect(formatOrderNo('2611', 7)).toBe('DH2611000007');
    expect(() => formatOrderNo('2611', 0)).toThrow();
    expect(expired('2026-11-16', '2026-11-17')).toBe(true);
    expect(expired('2026-11-17', '2026-11-17')).toBe(false);
    expect(expired(null, '2026-11-17')).toBe(false);
    expect(normPhone('0909 123-456')).toBe('0909123456');
    expect(parseHoldMap(['CN01=KCB01', ' CN02 = K2 ', 'xấu', 3])).toEqual(new Map([['CN01', 'KCB01'], ['CN02', 'K2']]));
    expect(parseHoldMap(null).size).toBe(0);
  });
});

describe('hạn mức, nợ quá hạn', () => {
  it('nợ = Σ(dư Nợ − dư Có) của khách; quá hạn = nợ − phát sinh Nợ trong hạn thanh toán', () => {
    const rows = [
      { partnerCode: 'KH001', debit: 6_000_000, closingDebit: 6_000_000, closingCredit: 0 },
      { partnerCode: 'KH002', debit: 0, closingDebit: 1_000_000, closingCredit: 0 },
      { partnerCode: 'KH002', debit: 200_000, closingDebit: 0, closingCredit: 100_000 },
    ];
    expect(debtOf(rows, 'KH001')).toEqual({ debt: 6_000_000, periodDebit: 6_000_000, overdue: 0 });
    expect(debtOf(rows, 'KH002')).toEqual({ debt: 900_000, periodDebit: 200_000, overdue: 700_000 });
  });
  it('vượt hạn mức → câu theo phiếu; hạn mức 0 = không giới hạn; nợ quá hạn luôn phải duyệt', () => {
    expect(creditReasons({ limit: 10_000_000, debt: 6_000_000, openOthers: 3_300_000, thisOrder: 6_600_000, overdue: 0, termDays: 30 }))
      .toEqual(['Vượt hạn mức 10.000.000: nợ 6.000.000 + đơn mở 3.300.000 + đơn này 6.600.000']);
    expect(creditReasons({ limit: 10_000_000, debt: 6_000_000, openOthers: 0, thisOrder: 3_300_000, overdue: 0, termDays: 30 })).toEqual([]);
    expect(creditReasons({ limit: 0, debt: 99_000_000, openOthers: 0, thisOrder: 1, overdue: 0, termDays: 30 })).toEqual([]);
    expect(creditReasons({ limit: 0, debt: 1, openOthers: 0, thisOrder: 1, overdue: 1_000_000, termDays: 45 })).toEqual(['Khách có nợ quá hạn 1.000.000 (hạn thanh toán 45 ngày)']);
  });
  it('giá trị chưa giao = tiền sau thuế × phần còn lại', () => {
    expect(undeliveredValue({ lines: [line({ delivered: 6, taxAmount: 264_000 })] })).toBe(1_425_600);
  });
});

describe('giữ hàng, giao, trả lại', () => {
  it('giữ đúng số còn lại; thiếu tồn thì giữ được bao nhiêu giữ bấy nhiêu và báo thiếu; đóng → trả hết', () => {
    const a = rebalanceHolds([line(), line({ lineKey: 'L2', qty: 5, amountBeforeTax: 1_650_000 })], new Map([['SUA330', 12]]));
    expect(a.lines.map((l) => l.held)).toEqual([10, 2]);
    expect(a.hold.map((m) => m.qty)).toEqual([10, 2]);
    expect(a.short).toEqual([{ sku: 'SUA330', need: 15, have: 12 }]);
    const b = rebalanceHolds([line({ qty: 8, delivered: 2, held: 10 })], new Map());
    expect(b.release).toEqual([expect.objectContaining({ qty: 4 })]);
    expect(b.lines[0]!.held).toBe(6);
    const c = rebalanceHolds([line({ delivered: 6, held: 4 })], new Map(), { releaseAll: true });
    expect(c.release.map((m) => m.qty)).toEqual([4]);
    expect(c.lines[0]!.held).toBe(0);
  });
  it('giao ≤ số còn lại: 6 → còn 4, giữ 4; 5 khi còn 4 → over', () => {
    const a = applyDelivery([line({ held: 10 })], [{ lineKey: 'L1', qty: 6 }]);
    expect(a.over).toEqual([]);
    expect(a.lines[0]).toMatchObject({ delivered: 6, held: 4 });
    const b = applyDelivery(a.lines, [{ lineKey: 'L1', qty: 5 }]);
    expect(b.over).toEqual([{ lineKey: 'L1', sku: 'SUA330', qty: 5, remaining: 4 }]);
    expect(applyDelivery(a.lines, [{ lineKey: 'X', qty: 1 }]).problems).toEqual(['Đơn không có dòng X']);
  });
  it('xoá phiếu giao: đơn mở → giữ lại hàng; đơn đóng tay → trả về kho bán', () => {
    const keep = returnDelivery([line({ delivered: 6, held: 4 })], [{ lineKey: 'L1', qty: 6 }], true);
    expect(keep.lines[0]).toMatchObject({ delivered: 0, held: 10 });
    expect(keep.release).toEqual([]);
    const back = returnDelivery([line({ delivered: 6, held: 0 })], [{ lineKey: 'L1', qty: 6 }], false);
    expect(back.lines[0]).toMatchObject({ delivered: 0, held: 0 });
    expect(back.release.map((m) => m.qty)).toEqual([6]);
  });
  it('dòng phiếu giao: giá theo đơn, chiết khấu chia luỹ kế (cộng các lần = chiết khấu dòng)', () => {
    const l = line({ qty: 3, discount: 100 });
    const d1 = deliveryLines([l], [{ lineKey: 'L1', qty: 1 }], new Map());
    const d2 = deliveryLines([l], [{ lineKey: 'L1', qty: 1 }], new Map([['L1', 1]]));
    const d3 = deliveryLines([l], [{ lineKey: 'L1', qty: 1 }], new Map([['L1', 2]]));
    expect(d1[0]).toMatchObject({ qty: 1, unitPrice: 330_000, taxCode: 'KCT' });
    expect(d1[0]!.discount + d2[0]!.discount + d3[0]!.discount).toBe(100);
  });
  it('sửa đơn đã giao: không giảm dưới số đã giao, không bỏ dòng đã giao; dòng bỏ còn giữ hàng → trả', () => {
    const old = [line({ delivered: 6, held: 4 }), line({ lineKey: 'L2', sku: 'B', held: 3 })];
    const next: Line[] = [{ ...line({ qty: 5 }) }];
    const m = mergeProgress(old, next);
    expect(m.problems).toEqual(['Dòng L1 (SUA330): số lượng 5 nhỏ hơn số đã giao 6']);
    expect(m.removed.map((l) => l.lineKey)).toEqual(['L2']);
    expect(mergeProgress(old, []).problems).toContain('Dòng L1 (SUA330) đã giao 6 — không bỏ được, giảm số lượng về số đã giao');
  });
});

describe('lịch sử, trùng livestream, chứng từ giữ hàng', () => {
  it('diff cũ → mới: đầu đơn và từng dòng', () => {
    const a = { head: { partner: 'KH001', validUntil: '2026-11-20' }, lines: [line()] };
    const b = { head: { partner: 'KH001', validUntil: '2026-11-25' }, lines: [line({ unitPrice: 320_000 }), line({ lineKey: 'L2', sku: 'B', qty: 1 })] };
    expect(diffOrder(a, b)).toEqual([
      { field: 'validUntil', from: '2026-11-20', to: '2026-11-25' },
      { field: 'line L1 unitPrice', from: 330_000, to: 320_000 },
      { field: 'line L2', from: null, to: 'B × 1' },
    ]);
  });
  it('trùng = cùng SĐT (đã lọc) + chung mã + trong 24 giờ, không tính đơn huỷ', () => {
    const now = new Date('2026-11-17T10:00:00Z');
    const c = (h: number, skus: string[], status = 'draft') => ({ orderId: `o${h}`, orderNo: `DH${h}`, status, createdAt: new Date(now.getTime() - h * 3600_000), skus });
    const d = duplicatesOf([c(1, ['SUA330', 'X']), c(2, ['Y']), c(25, ['SUA330']), c(3, ['SUA330'], 'cancelled')], ['SUA330'], now);
    expect(d.map((x) => x.orderNo)).toEqual(['DH1']);
    expect(d[0]!.skus).toEqual(['SUA330']);
  });
  it('chứng từ giữ hàng: transfer cùng chi nhánh, một chứng từ cả cặp, amount 0, không số tài khoản', () => {
    const doc = toHoldDoc({ orderId: 'abc', orderNo: 'DH2611000001', seq: 2, branchCode: 'CN01', docDate: '2026-11-17', from: 'K1', to: 'KCB',
      moves: [{ lineKey: 'L1', sku: 'SUA330', name: 'Sữa', unit: 'Hộp', qty: 10 }, { lineKey: 'L1', sku: 'SUA330', name: 'Sữa', unit: 'Hộp', qty: 0 }], release: false });
    expect(doc).toMatchObject({ docType: 'transfer', docKey: 'phieu-ban:dh:abc:2', branchCode: 'CN01', toBranchCode: 'CN01', status: 'received', docNo: 'DH2611000001-G2', totals: { total: 0 } });
    expect(doc.lines).toEqual([{ lineKey: 'L1', sku: 'SUA330', name: 'Sữa', unit: 'Hộp', qty: 10, amount: 0, warehouseCode: 'K1', toWarehouseCode: 'KCB' }]);
    expect(JSON.stringify(doc)).not.toMatch(/"(debit|credit)Account"|156|1561/);
  });
});
