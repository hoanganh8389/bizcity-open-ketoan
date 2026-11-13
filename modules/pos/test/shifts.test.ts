// [2026-11-12 05:10 PM Võ Hoàng] POS-W3 — hàm thuần số liệu ca / tổng quan (phiếu NT-BH-007) (đóng góp)
import { describe, expect, it } from 'vitest';
import { dashboard, orderPayments, shiftNumbers, vnHour, type OrderSnap } from '../api/domain/shifts.js';

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
