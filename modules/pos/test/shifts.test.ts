// [2026-11-12 05:10 PM Võ Hoàng] POS-W3 — hàm thuần số liệu ca / tổng quan (phiếu NT-BH-007) (đóng góp)
import { describe, expect, it } from 'vitest';
import { cashDiffJournal, dashboard, orderPayments, shiftNumbers, vnHour, type OrderSnap } from '../api/domain/shifts.js';

const o = (over: Partial<OrderSnap>): OrderSnap => ({ code: 'HD1', status: 'completed', total: 0, createdAt: '2026-11-12T02:00:00Z', payment: { mode: 'cash' }, ...over });

describe('orderPayments', () => {
  it('tiền mặt → tổng đơn vào mã tiền mặt (đã trừ thối); nhiều hình thức → từng phần, bỏ đối trừ', () => {
    expect(orderPayments(o({ total: 325_000 }), 'TM')).toEqual([{ method: 'TM', name: 'TM', amount: 325_000 }]);
    expect(orderPayments(o({ total: 660_000, payment: { mode: 'split', parts: [{ method: 'doi_tru', amount: 330_000 }, { method: 'CK', amount: 330_000 }] } }), 'TM'))
      .toEqual([{ method: 'CK', name: 'CK', amount: 330_000 }]);
  });
});

describe('shiftNumbers', () => {
  it('đúng ví dụ NT-BH-007 §4: phải có 1.330.000', () => {
    const n = shiftNumbers({
      openingCash: 1_000_000, cashCode: 'TM',
      orders: [o({ total: 660_000, payment: { mode: 'split', parts: [{ method: 'TM', amount: 330_000 }, { method: 'CK', amount: 330_000 }] } }), o({ total: 325_000 })],
      returns: [{ refundMethod: 'TM', refundTotal: 325_000 }],
    });
    expect(n).toMatchObject({ orderCount: 2, total: 985_000, cashSales: 655_000, cashRefunds: 325_000, expectedCash: 1_330_000, blockers: [] });
  });
  it('đơn chờ trả tiền: không tính doanh thu, là việc dở', () => {
    const n = shiftNumbers({ openingCash: 0, cashCode: 'TM', orders: [o({ code: 'HD9', status: 'awaiting_payment', total: 100 })], returns: [] });
    expect(n.orderCount).toBe(0);
    expect(n.blockers).toEqual([{ kind: 'awaiting_payment', ref: 'HD9', message: 'Đơn HD9 còn chờ trả tiền' }]);
  });
});

describe('dashboard', () => {
  it('giờ theo giờ Việt Nam; mặt hàng theo ĐVT nhỏ nhất', () => {
    expect(vnHour('2026-11-12T02:30:00Z')).toBe(9);
    const d = dashboard({
      from: '2026-11-12', to: '2026-11-12', cashCode: 'TM', returns: [],
      orders: [o({ total: 440_000, lines: [{ sku: 'X', name: 'X', unitQty: 1, unitRatio: 4, amount: 407_407, taxAmount: 32_593 }] })],
    });
    expect(d.topProducts).toEqual([{ sku: 'X', name: 'X', qty: 4, total: 440_000 }]);
    expect(d.byHour).toEqual([{ hour: 9, orders: 1, total: 440_000 }]);
    expect(d.net).toBe(440_000);
  });
});

// [2026-11-13 09:10 PM Võ Hoàng] NGHIEM-THU — NT-BH-014: phiếu kế toán chênh lệch két (đóng góp)
describe('cashDiffJournal (NT-BH-014)', () => {
  const base = {
    shiftId: 'S1', branchCode: 'CN01', openedAt: new Date('2026-11-13T01:00:00Z'), closedAt: new Date('2026-11-13T14:30:00Z'), cashier: 'Lan',
    expectedCash: 1_330_000, shortReason: 'POS-THIEU-KET', overReason: 'POS-THUA-KET', partnerCode: 'CN-CN01',
  };
  it('thiếu 10.000 → một dòng lý do thiếu, đối tượng chi nhánh, khoá theo ca, ngày giờ Việt Nam', () => {
    const d = cashDiffJournal({ ...base, countedCash: 1_320_000 })!;
    expect(d).toMatchObject({
      docType: 'manual_journal', docKey: 'pos:shift:S1:cash-diff', branchCode: 'CN01', docDate: '2026-11-13', docNo: 'CA-CN01-20261113-2130', totals: { total: 10_000 },
      lines: [{ lineKey: '1', reasonCode: 'POS-THIEU-KET', amount: 10_000, partnerCode: 'CN-CN01', description: 'Thiếu tiền két 10.000: phải có 1.330.000, đếm được 1.320.000' }],
    });
    expect(d.description).toBe('Chênh lệch két ca 08:00–21:30 ngày 2026-11-13, thu ngân Lan');
    expect(JSON.stringify(d)).not.toMatch(/1381|1111|3381/);
  });
  it('thừa → lý do thừa; lệch 0 → không lập; chưa có đối tượng chi nhánh → không gửi partnerCode', () => {
    expect(cashDiffJournal({ ...base, countedCash: 1_335_000 })!.lines[0]).toMatchObject({ reasonCode: 'POS-THUA-KET', amount: 5_000 });
    expect(cashDiffJournal({ ...base, countedCash: 1_330_000 })).toBeNull();
    expect(cashDiffJournal({ ...base, countedCash: 1_320_000, partnerCode: null })!.lines[0]).not.toHaveProperty('partnerCode');
  });
  it('ca qua đêm: ghi ngày mở trong diễn giải; ngày chứng từ = ngày chốt', () => {
    const d = cashDiffJournal({ ...base, openedAt: new Date('2026-11-12T14:00:00Z'), closedAt: new Date('2026-11-12T18:00:00Z'), countedCash: 1_320_000 })!;
    expect(d.docDate).toBe('2026-11-13');
    expect(d.description).toContain('ca 21:00 2026-11-12–01:00');
  });
});
