// [2026-11-18 Võ Hoàng] NGHIEM-THU — NT-BH-024 trả lại hàng bán đợt 2: hàm thuần (không CSDL) (đóng góp)
// Chặn đơn có hoá đơn MST (Q1), không trả quà đổi điểm (Q2), hàng lỗi vào kho KTL của cửa hàng (Q3).
import { describe, expect, it } from 'vitest';
import {
  buyerTaxCodeOf, computeReturn, parseWarehouseMap, requiredGiftReturns, returnableLines, toSaleReturnDocument, type ReturnInput, type SoldLine,
} from '../api/domain/returns.js';

const SUA: SoldLine = { lineId: 'l1', sku: 'SUA400', name: 'Sữa bột 400g', unitName: 'Hộp', unitRatio: 1, soldQty: 2, net: 600_000, tax: 48_000, taxRate: 8, taxCode: 'R08', itemId: null, isGift: false };
const TA: SoldLine = { lineId: 'l2', sku: 'TA01', name: 'Tã quần L', unitName: 'Gói', unitRatio: 1, soldQty: 1, net: 195_455, tax: 19_545, taxRate: 10, taxCode: 'R10', itemId: null, isGift: false };
const LP: SoldLine = { lineId: 'g1', sku: 'QUA200', name: 'Quà đổi điểm', unitName: 'Hộp', unitRatio: 1, soldQty: 1, net: 0, tax: 0, taxRate: 8, taxCode: 'R08', itemId: null, isGift: true, loyaltyGift: true };
const methods = [{ code: 'TM', name: 'Tiền mặt' }, { code: 'CK', name: 'Chuyển khoản' }];

const input = (over: Partial<ReturnInput> = {}, draft: Partial<ReturnInput['draft']> = {}): ReturnInput => ({
  draft: { id: 'r1', lines: [{ lineId: 'l1', qty: 1 }], refundMethod: 'TM', reason: 'Khách đổi ý', ...draft },
  order: { status: 'completed', branchCode: 'CN01', businessDate: '2026-11-17' },
  lines: [SUA, TA, LP], done: new Map(), branchCode: 'CN01', today: '2026-11-18', days: 3, paymentMethods: methods, exchange: false,
  ...over,
});
const problem = (r: ReturnType<typeof computeReturn>) => ('problem' in r ? r.problem : null);

describe('NT-BH-024 Q1 — đơn có hoá đơn MST', () => {
  it('đơn có invoiceBuyer.taxCode → POS_RETURN_TAX_INVOICE (conflict), câu báo nêu MST và BH11; đổi hàng cũng chặn', () => {
    for (const exchange of [false, true]) {
      const p = problem(computeReturn(input({ exchange, order: { status: 'completed', branchCode: 'CN01', businessDate: '2026-11-17', buyerTaxCode: '0312345678' } }, exchange ? { refundMethod: 'doi_tru' } : {})));
      expect(p).toMatchObject({ kind: 'conflict', reason: 'POS_RETURN_TAX_INVOICE', details: { taxCode: '0312345678' } });
      expect(p!.message).toContain('MST 0312345678');
      expect(p!.message).toContain('BH11');
    }
  });

  it('đơn không MST (khách lẻ / chỉ tên) → trả như cũ; MST đọc từ bản chụp đơn', () => {
    expect(problem(computeReturn(input({ order: { status: 'completed', branchCode: 'CN01', businessDate: '2026-11-17', buyerTaxCode: ' ' } })))).toBeNull();
    expect(buyerTaxCodeOf({ invoiceBuyer: { name: 'Chị Lan' } })).toBe('');
    expect(buyerTaxCodeOf({ invoiceBuyer: { taxCode: '0312345678-001' } })).toBe('0312345678-001');
    expect(buyerTaxCodeOf(null)).toBe('');
  });
});

describe('NT-BH-024 Q2 — quà đổi điểm', () => {
  it('còn trả được: dòng quà đổi điểm 0, đánh dấu LOYALTY_GIFT', () => {
    const g = returnableLines([SUA, LP], new Map()).find((l) => l.lineId === 'g1')!;
    expect(g).toMatchObject({ returnableQty: 0, loyaltyGift: true, notReturnable: 'LOYALTY_GIFT' });
  });

  it('trả dòng quà đổi điểm → POS_RETURN_LOYALTY_GIFT', () => {
    expect(problem(computeReturn(input({}, { lines: [{ lineId: 'g1', qty: 1 }] })))).toMatchObject({ reason: 'POS_RETURN_LOYALTY_GIFT', details: { lineId: 'g1', sku: 'QUA200' } });
  });

  it('trả hết hàng chính: quà đổi điểm không tính vào quà vượt suất (kể cả khi mang promotionId)', () => {
    const lp = { ...LP, promotionId: 7 };
    expect([...requiredGiftReturns(returnableLines([SUA, lp], new Map()), new Map([['l1', 2]]), () => null)]).toEqual([]);
    expect(problem(computeReturn(input({ lines: [SUA, lp] }, { lines: [{ lineId: 'l1', qty: 2 }] })))).toBeNull();
  });
});

describe('NT-BH-024 Q3 — tình trạng hàng trả, kho nhận', () => {
  it('mặc định nguyên vẹn: dòng chứng từ không ghi kho (kho mặc định)', () => {
    const r = computeReturn(input());
    if ('problem' in r) throw new Error(r.problem.message);
    expect(r.lines[0]).toMatchObject({ condition: 'good' });
    expect(r.lines[0]).not.toHaveProperty('warehouseCode');
    const doc = toSaleReturnDocument(r, { id: 'r1', branchCode: 'CN01', code: 'TH1', businessDate: '2026-11-18', reason: 'x', originalDocKey: 'o', partner: null });
    expect(doc.lines[0]).not.toHaveProperty('warehouseCode');
  });

  it('lệch chuẩn 3: một phiếu, 1 dòng nguyên vẹn + 1 dòng lỗi → dòng lỗi ghi kho KTL, dòng kia kho mặc định', () => {
    const r = computeReturn(input({ badWarehouse: 'CN01-KTL' }, { lines: [{ lineId: 'l1', qty: 1, condition: 'good' }, { lineId: 'l2', qty: 1, condition: 'bad' }] }));
    if ('problem' in r) throw new Error(r.problem.message);
    const doc = toSaleReturnDocument(r, { id: 'r1', branchCode: 'CN01', code: 'TH1', businessDate: '2026-11-18', reason: 'x', originalDocKey: 'o', partner: null });
    expect(doc.lines.map((l) => [l.lineKey, (l as { warehouseCode?: string }).warehouseCode ?? null])).toEqual([['l1', null], ['l2', 'CN01-KTL']]);
    expect(r.lines.map((l) => l.condition)).toEqual(['good', 'bad']);
  });

  it('chọn Lỗi mà cửa hàng chưa khai kho KTL → POS_RETURN_NO_BAD_WAREHOUSE, nêu lý do kho đã khai không dùng được', () => {
    const p = problem(computeReturn(input({ badWarehouse: null }, { lines: [{ lineId: 'l1', qty: 1, condition: 'bad' }] })));
    expect(p).toMatchObject({ reason: 'POS_RETURN_NO_BAD_WAREHOUSE', details: { branchCode: 'CN01' } });
    const p2 = problem(computeReturn(input({ badWarehouse: null, badWarehouseIssue: 'kho X đã ngừng dùng' }, { lines: [{ lineId: 'l1', qty: 1, condition: 'bad' }] })));
    expect(p2!.message).toContain('kho X đã ngừng dùng');
  });

  it('lệch chuẩn 4: quá hạn có người duyệt + dòng lỗi → duyệt như cũ, kho theo tình trạng', () => {
    const late = input({ badWarehouse: 'CN01-KTL', today: '2026-11-25' }, { lines: [{ lineId: 'l1', qty: 1, condition: 'bad' }] });
    expect(problem(computeReturn(late))).toMatchObject({ reason: 'POS_RETURN_EXPIRED' });
    // NT-BH-030 Q2: yêu cầu trả quá hạn đã duyệt (máy chủ kiểm) thay người duyệt gõ tay.
    const r = computeReturn({ ...late, approved: true });
    if ('problem' in r) throw new Error(r.problem.message);
    expect(r.late).toBe(true);
    expect(r.lines[0]).toMatchObject({ condition: 'bad', warehouseCode: 'CN01-KTL' });
  });

  it('cùng dòng gửi hai tình trạng → POS_RETURN_CONDITION', () => {
    expect(problem(computeReturn(input({ badWarehouse: 'CN01-KTL' }, { lines: [{ lineId: 'l1', qty: 1, condition: 'good' }, { lineId: 'l1', qty: 1, condition: 'bad' }] }))))
      .toMatchObject({ reason: 'POS_RETURN_CONDITION', details: { lineId: 'l1' } });
  });

  it('khoá kho: mảng "<cửa hàng>=<kho>", bỏ phần tử sai khuôn', () => {
    expect([...parseWarehouseMap(['CN01=CN01-KTL', ' CN02 = KTL2 ', 'sai', '=X', 3, 'CN03='])]).toEqual([['CN01', 'CN01-KTL'], ['CN02', 'KTL2']]);
    expect(parseWarehouseMap(null).size).toBe(0);
  });
});
