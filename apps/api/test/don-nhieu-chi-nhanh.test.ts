// [2026-11-21 Nguyễn Văn Thủy] Đơn đặt giao nhiều chi nhánh · phiếu nhập nhiều hoá đơn (docs/nghiep-vu/27) — phần miền (đóng góp)
import { describe, expect, it } from 'vitest';
import {
  deliveryBranches, deliveryBranchOf, invoiceDueDate, invoicePlanText, invoiceQtyBySku, invoiceQtyOfLine, invoicesOf, orderProgress, orderProgressByBranch,
  orderReconcile, receiptFromOrder, splitLinesByInvoice, type PDoc, type PLine,
} from '@bizcity/mua-hang-domain';

const units = { S1: [{ unit: 'Lon', ratio: 1 }, { unit: 'Thùng', ratio: 24 }], S2: [{ unit: 'Lon', ratio: 1 }] } as never;
const line = (o: Partial<PLine>): PLine => ({ lineKey: o.sku ?? 'x', sku: 'S1', name: 'x', unit: 'Thùng', qty: 1, price: 100, taxCode: 'V08', lineType: 'buy', ...o });
const order: PDoc = {
  id: '1', kind: 'order', status: 'approved', docNo: 'DH1', docDate: '2026-11-01', branchCode: 'HN', deliveryBranch: '12000', partnerCode: 'N', priceIncludesVat: false,
  lines: [line({ lineKey: 'a', qty: 10 }), line({ lineKey: 'b', qty: 4, branchCode: '12001', warehouseCode: '12001' }), line({ lineKey: 'c', sku: 'S2', unit: 'Lon', qty: 6, branchCode: '12001' })],
};
const rec = (id: string, branch: string, lines: PLine[], status: PDoc['status'] = 'approved'): PDoc => ({ id, kind: 'receipt', status, docNo: `NM${id}`, docDate: '2026-11-05', branchCode: branch, partnerCode: 'N', priceIncludesVat: false, refIds: ['1'], lines });

describe('Đơn giao nhiều chi nhánh — chi nhánh nhận, tiến độ theo chi nhánh', () => {
  it('chi nhánh nhận: dòng → Giao tại kho → chi nhánh lập', () => {
    expect(deliveryBranchOf(order, order.lines[0]!)).toBe('12000');
    expect(deliveryBranchOf(order, order.lines[1]!)).toBe('12001');
    expect(deliveryBranchOf({ branchCode: 'HN' }, {})).toBe('HN');
    expect(deliveryBranches(order)).toEqual(['12000', '12001']);
  });

  it('cùng mã đặt cho 2 chi nhánh: còn phải nhập tính riêng từng chi nhánh, không cộng lẫn', () => {
    const r12001 = rec('9', '12001', [line({ lineKey: 'r1', qty: 3 })]);
    const docs = [order, r12001];
    const p12000 = orderProgress(order, docs, undefined, units, '12000');
    const p12001 = orderProgress(order, docs, undefined, units, '12001');
    expect(p12000.lines.find((x) => x.sku === 'S1')).toMatchObject({ ordered: 10, received: 0, remaining: 10 });
    expect(p12001.lines.find((x) => x.sku === 'S1')).toMatchObject({ ordered: 4, received: 3, remaining: 1 });
    expect(p12001.lines.find((x) => x.sku === 'S2')).toMatchObject({ ordered: 6, remaining: 6 });
    // Cả đơn (không truyền chi nhánh) vẫn như cũ.
    expect(orderProgress(order, docs, undefined, units).lines.find((x) => x.sku === 'S1')).toMatchObject({ ordered: 14, received: 3 });
    const by = orderProgressByBranch(order, docs, units);
    expect(by.map((x) => [x.branch, x.receipts.length])).toEqual([['12000', 0], ['12001', 1]]);
    expect(orderReconcile(order, docs, units, '12001').find((x) => x.sku === 'S1')).toMatchObject({ ordered: 4, received: 3, state: 'thieu' });
  });

  it('phiếu nhập lập từ đơn: mỗi chi nhánh chỉ phần của mình, phiếu thuộc đúng chi nhánh nhận', () => {
    const r = receiptFromOrder(order, [order], '2026-11-06', units, '12000');
    expect(r.branchCode).toBe('12000');
    expect(r.lines.map((l) => [l.sku, l.qty])).toEqual([['S1', 10]]);
    const r2 = receiptFromOrder(order, [order, rec('9', '12001', [line({ lineKey: 'r1', qty: 3 })])], '2026-11-06', units, '12001');
    expect(r2.branchCode).toBe('12001');
    expect(r2.lines.map((l) => [l.sku, l.qty])).toEqual([['S1', 1], ['S2', 6]]);
  });
});

describe('Kế hoạch hoá đơn — gửi sau N ngày tính từ ngày đặt / ngày nhận', () => {
  it('hạn hoá đơn', () => {
    expect(invoiceDueDate({ mode: 'later', days: 7 }, '2026-11-10', '2026-11-01')).toBe('2026-11-17');
    expect(invoiceDueDate({ mode: 'later', days: 7, from: 'receipt' }, '2026-11-10', '2026-11-01')).toBe('2026-11-17');
    expect(invoiceDueDate({ mode: 'later', days: 7, from: 'order' }, '2026-11-10', '2026-11-01')).toBe('2026-11-08');
    expect(invoiceDueDate({ mode: 'with_goods' }, '2026-11-10')).toBe('2026-11-10');
    expect(invoiceDueDate({ mode: 'none' }, '2026-11-10')).toBe('');
    expect(invoicePlanText({ mode: 'none' })).toBe('Hàng không có hoá đơn');
    expect(invoicePlanText({ mode: 'later', days: 5, from: 'order' })).toBe('HĐ gửi sau 5 ngày (từ ngày đặt đơn)');
  });
});

describe('Phiếu nhập nhiều hoá đơn — SL theo hoá đơn, chia dòng khi ghi sổ', () => {
  const lines = [line({ lineKey: 'a', qty: 10 }), line({ lineKey: 'b', sku: 'S2', unit: 'Lon', qty: 6 }), line({ lineKey: 'g', sku: 'S2', unit: 'Lon', qty: 2, price: 0, lineType: 'gift_seller' })];
  const invs = [
    { key: 'C26T-1', lines: [{ sku: 'S1', unit: 'Thùng', qty: 6 }, { sku: 'S2', unit: 'Lon', qty: 6 }] },
    { key: 'C26T-2', lines: [{ sku: 'S1', unit: 'Lon', qty: 72 }] }, // 3 Thùng
  ];
  it('invoicesOf: dữ liệu cũ chỉ có invoice', () => {
    expect(invoicesOf({ invoice: { no: '1', date: '2026-11-01' } })).toHaveLength(1);
    expect(invoicesOf({ invoice: { no: '1', date: '2026-11-01' }, invoices: [{ no: '1', date: '2026-11-01' }, { no: '2', date: '2026-11-02' }] })).toHaveLength(2);
    expect(invoicesOf({})).toHaveLength(0);
  });
  it('SL theo hoá đơn cộng dồn, quy về ĐVT dòng', () => {
    const by = invoiceQtyBySku(invs, units);
    expect(invoiceQtyOfLine(lines[0]!, by, units)).toBe(9); // 6 + 3 Thùng → lệch 1 so với thực nhận 10
    expect(invoiceQtyOfLine(lines[1]!, by, units)).toBe(6);
    expect(invoiceQtyOfLine(lines[0]!, new Map(), units)).toBeUndefined();
  });
  it('chia dòng theo từng hoá đơn; phần không có trên hoá đơn → phần không hoá đơn', () => {
    const parts = splitLinesByInvoice(lines, invs, units);
    expect(parts.map((p) => [p.key, p.lines.map((l) => `${l.lineKey}:${l.qty}`)])).toEqual([
      ['C26T-1', ['a:6', 'b:6']],
      ['C26T-2', ['a:3']],
      [null, ['a:1', 'g:2']],
    ]);
    // Tổng phần của mỗi dòng = SL dòng.
    for (const l of lines) expect(parts.flatMap((p) => p.lines).filter((x) => x.lineKey === l.lineKey).reduce((s, x) => s + x.qty, 0)).toBeCloseTo(l.qty, 6);
  });
});
