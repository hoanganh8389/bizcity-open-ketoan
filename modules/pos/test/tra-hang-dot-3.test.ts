// [2026-11-18 Võ Hoàng] NGHIEM-THU — NT-BH-030 trả lại hàng bán đợt 3: hàm thuần (không CSDL) (đóng góp)
// Trả khác cửa hàng cùng MST (Q1), quá hạn cần yêu cầu đã duyệt + khớp nội dung (Q2), hạn trả riêng từng shop (Q3).
import { describe, expect, it } from 'vitest';
import { computeReturn, daysOf, otherShopProblem, parseDaysMap, sameReturnLines, type ReturnInput, type SoldLine } from '../api/domain/returns.js';

const SUA: SoldLine = { lineId: 'l1', sku: 'SUA400', name: 'Sữa bột 400g', unitName: 'Hộp', unitRatio: 1, soldQty: 2, net: 600_000, tax: 48_000, taxRate: 8, taxCode: 'R08', itemId: null, isGift: false };
const methods = [{ code: 'TM', name: 'Tiền mặt' }];
const MST = '0100000030';
const input = (over: Partial<ReturnInput> = {}): ReturnInput => ({
  draft: { id: 'r1', lines: [{ lineId: 'l1', qty: 1 }], refundMethod: 'TM', reason: 'Khách đổi ý' },
  order: { status: 'completed', branchCode: 'CN01', businessDate: '2026-11-17', branchTaxCode: MST },
  lines: [SUA], done: new Map(), branchCode: 'CN02', branchTaxCode: MST, today: '2026-11-18', days: 3, paymentMethods: methods, exchange: false,
  ...over,
});
const problem = (r: ReturnType<typeof computeReturn>) => ('problem' in r ? r.problem : null);

describe('NT-BH-030 Q1 — trả ở cửa hàng khác cùng MST', () => {
  it('cùng MST → trả được ở cửa hàng nhận', () => {
    expect(problem(computeReturn(input()))).toBeNull();
    expect(otherShopProblem('CN01', '', 'CN01', '')).toBeNull(); // cùng cửa hàng: không xét MST
  });
  it('khác MST → POS_RETURN_OTHER_SHOP "khác mã số thuế"; chưa khai → "chưa khai MST", nêu cửa hàng chưa khai', () => {
    const diff = problem(computeReturn(input({ branchCode: 'CN03', branchTaxCode: '0100000031' })));
    expect(diff).toMatchObject({ kind: 'conflict', reason: 'POS_RETURN_OTHER_SHOP', details: { orderBranch: 'CN01', cause: 'TAX_CODE_DIFFERENT' } });
    expect(diff!.message).toContain('khác mã số thuế');
    const missing = problem(computeReturn(input({ branchCode: 'CN03', branchTaxCode: ' ' })));
    expect(missing).toMatchObject({ reason: 'POS_RETURN_OTHER_SHOP', details: { cause: 'TAX_CODE_MISSING', branches: ['CN03'] } });
    expect(missing!.message).toContain('chưa khai MST');
  });
});

describe('NT-BH-030 Q2 — quá hạn cần yêu cầu đã duyệt', () => {
  it('quá hạn, chưa duyệt → POS_RETURN_EXPIRED nêu gửi yêu cầu; máy chủ đã kiểm duyệt → qua', () => {
    const late = input({ today: '2026-11-25' });
    expect(problem(computeReturn(late))).toMatchObject({ reason: 'POS_RETURN_EXPIRED', details: { deadline: '2026-11-20' } });
    expect(problem(computeReturn(late))!.message).toContain('gửi yêu cầu trả quá hạn');
    const ok = computeReturn({ ...late, approved: true });
    if ('problem' in ok) throw new Error(ok.problem.message);
    expect(ok.late).toBe(true);
  });
  it('phiếu trả phải đúng dòng / SL / tình trạng của yêu cầu (thứ tự không quan trọng; tình trạng trống = nguyên vẹn)', () => {
    const a = [{ lineId: 'l1', qty: 1 }, { lineId: 'l2', qty: 2, condition: 'bad' as const }];
    expect(sameReturnLines(a, [{ lineId: 'l2', qty: 2, condition: 'bad' }, { lineId: 'l1', qty: 1, condition: 'good' }])).toBe(true);
    expect(sameReturnLines(a, [{ lineId: 'l1', qty: 1 }])).toBe(false);
    expect(sameReturnLines(a, [{ lineId: 'l1', qty: 2 }, { lineId: 'l2', qty: 2, condition: 'bad' }])).toBe(false);
    expect(sameReturnLines(a, [{ lineId: 'l1', qty: 1 }, { lineId: 'l2', qty: 2 }])).toBe(false);
  });
});

describe('NT-BH-030 Q3 — hạn trả riêng từng shop', () => {
  it('khoá "<shop>=<ngày>": shop khai riêng lấy riêng, còn lại mặc định công ty; phần tử sai khuôn / > 60 bỏ', () => {
    const byShop = parseDaysMap(['CN02=7', ' CN04 = 10 ', 'CN05=61', 'CN06=x', 'sai', 5]);
    expect([...byShop]).toEqual([['CN02', 7], ['CN04', 10]]);
    expect(daysOf({ days: 3, byShop }, 'CN02')).toBe(7);
    expect(daysOf({ days: 3, byShop }, 'CN01')).toBe(3);
  });
  it('CN02 hạn 7 ngày: trả ngày thứ 5 trong hạn, không cần duyệt', () => {
    const r = computeReturn(input({ today: '2026-11-22', days: 7 }));
    if ('problem' in r) throw new Error(r.problem.message);
    expect(r).toMatchObject({ late: false, deadline: '2026-11-24' });
  });
});
