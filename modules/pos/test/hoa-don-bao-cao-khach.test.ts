// [2026-11-19 Võ Hoàng] NGHIEM-THU — NT-BH-034: hàm thuần người mua hoá đơn + báo cáo khách hàng (đóng góp)
import { describe, expect, it } from 'vitest';
import { customerReport, customerTotals, withGiftValues, type Purchase } from '../api/domain/customer-report.js';
import { invoiceBuyerProblem, isPlaceholderBuyerName } from '../api/domain/invoice-buyer.js';

describe('người mua hoá đơn — luật như POS cũ', () => {
  it('không mã số thuế: không đòi gì; email gõ sai thì báo', () => {
    expect(invoiceBuyerProblem({})).toBeNull();
    expect(invoiceBuyerProblem({ email: 'abc' })?.field).toBe('email');
  });
  it('mã 10 / 12 / 13 số; khác → taxCode', () => {
    const ok = { name: 'Nguyễn An', address: '1 Phố', email: 'a@b.vn' };
    for (const taxCode of ['0101234567', '001099012345', '0101234567001', '0101234567-001']) expect(invoiceBuyerProblem({ ...ok, taxCode })).toBeNull();
    for (const taxCode of ['12345', '01012345678', '01012345670012']) expect(invoiceBuyerProblem({ ...ok, taxCode })?.field).toBe('taxCode');
  });
  it('có mã: tên "Khách lẻ" → name; thiếu địa chỉ → address; 12 số thiếu email → email', () => {
    expect(invoiceBuyerProblem({ taxCode: '0101234567', name: 'Khách lẻ', address: 'x' })?.field).toBe('name');
    expect(invoiceBuyerProblem({ taxCode: '0101234567', name: 'khach hang le', address: 'x' })?.field).toBe('name');
    expect(invoiceBuyerProblem({ taxCode: '0101234567', address: 'x' })?.field).toBe('name');
    expect(invoiceBuyerProblem({ taxCode: '0101234567', companyName: 'Cty A', address: 'x' })).toBeNull();
    expect(invoiceBuyerProblem({ taxCode: '0101234567', name: 'An' })?.field).toBe('address');
    expect(invoiceBuyerProblem({ taxCode: '001099012345', name: 'An', address: 'x' })).toMatchObject({ field: 'email', message: expect.stringContaining('căn cước') });
    expect(invoiceBuyerProblem({ taxCode: '001099012345', name: 'An', address: 'x', email: 'sai' })?.field).toBe('email');
    expect(invoiceBuyerProblem({ taxCode: '0101234567', name: 'An', address: 'x', email: 'sai@' })?.field).toBe('email');
  });
  it('nhãn nội bộ', () => {
    expect(isPlaceholderBuyerName('  Khách  vãng lai ')).toBe(true);
    expect(isPlaceholderBuyerName('Khánh Lê')).toBe(false);
  });
});

const p = (over: Partial<Purchase>): Purchase => ({
  source: 'pos', kind: 'sale', refId: 'o1', refCode: 'HD1', date: '2026-11-05', branchCode: 'CN01', channel: 'GAN_SHOP', customerCode: '0901', customerName: 'An',
  phone: '0901', goods: 0, discount: 0, total: 0, returns: 0, vouchers: [], pointsEarned: 0, pointsRedeemed: 0, lines: [], ...over,
});

describe('báo cáo khách hàng', () => {
  it('gộp khách × cửa hàng: đơn máy bán + phiếu BH10, trả hàng, voucher, điểm, quà; cửa hàng đã mua', () => {
    const gift = withGiftValues([{ sku: 'QUA', name: 'Quà', unit: 'Cái', qty: 2, unitPrice: 0, discount: 0, amount: 0, isGift: true, promo: 'KM1' }], () => 15_000);
    const rows = customerReport([
      p({ goods: 330_000, discount: 30_000, total: 300_000, vouchers: [{ code: 'V1', campaignName: 'Đợt 1', amount: 20_000 }], pointsEarned: 30, lines: gift }),
      p({ source: 'phieu-ban', refId: 'd1', branchCode: 'CN02', goods: 500_000, total: 500_000 }),
      p({ kind: 'return', refId: 'r1', returns: 100_000 }),
      p({ customerCode: '', customerName: '', phone: '', refId: 'o9', goods: 10_000, total: 10_000 }),
    ], { groupBy: 'range', from: '2026-11-01', to: '2026-11-19' });
    const an1 = rows.find((r) => r.customerCode === '0901' && r.branchCode === 'CN01')!;
    expect(an1).toMatchObject({ orders: 1, posOrders: 1, goods: 330_000, discount: 30_000, net: 300_000, returns: 100_000, netAfterReturns: 200_000,
      voucherCount: 1, voucherAmount: 20_000, pointsEarned: 30, giftQty: 2, giftValue: 30_000, shops: 'CN01, CN02', period: '2026-11-01..2026-11-19' });
    expect(rows.find((r) => r.branchCode === 'CN02')).toMatchObject({ phieuBanDocs: 1, net: 500_000 });
    expect(rows.find((r) => r.customerCode === '')).toMatchObject({ customerName: 'Khách lẻ', net: 10_000 });
    expect(customerTotals(rows)).toMatchObject({ customers: 2, orders: 3, net: 810_000, returns: 100_000, giftValue: 30_000 });
  });
  it('theo tháng: tách kỳ', () => {
    const rows = customerReport([p({ total: 1 }), p({ refId: 'o2', date: '2026-10-30', total: 2 })], { groupBy: 'month', from: '2026-10-01', to: '2026-11-19' });
    expect(rows.map((r) => r.period).sort()).toEqual(['2026-10', '2026-11']);
  });
  it('quà không có giá bán → giá trị null (không đoán)', () => {
    expect(withGiftValues([{ sku: 'Q', name: 'Q', unit: 'Cái', qty: 1, unitPrice: 0, discount: 0, amount: 0, isGift: true, promo: null }], () => null)[0]!.giftValue).toBeNull();
  });
});
