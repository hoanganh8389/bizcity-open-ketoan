// [2026-11-16 06:30 PM Võ Hoàng] NGHIEM-THU — NT-BH-021: hàm thuần chặn bán quá tồn (đóng góp)
import { describe, expect, it } from 'vitest';
import { stockNeeds, stockShortMessage, stockShortages } from '../api/domain/stock.js';

describe('NT-BH-021 — kiểm tồn máy bán (hàm thuần)', () => {
  it('cộng theo mã (4 + 3 = 7 > 5) → thiếu; đủ thì rỗng', () => {
    const need = stockNeeds([{ sku: 'A', qty: 4 }, { sku: 'A', qty: 3 }, { sku: 'B', qty: 2 }]);
    expect(need).toEqual(new Map([['A', 7], ['B', 2]]));
    expect(stockShortages(need, new Map([['A', 5], ['B', 2]]))).toEqual([{ sku: 'A', need: 7, have: 5 }]);
    expect(stockShortages(need, new Map([['A', 7], ['B', 9]]))).toEqual([]);
  });
  it('quy ĐVT: 1 thùng × 6 = 6 > 5; mã không có dòng sổ → tồn 0; dòng SL 0 bỏ qua', () => {
    expect(stockShortages(stockNeeds([{ sku: 'A', qty: 1 * 6 }]), new Map([['A', 5]]))).toEqual([{ sku: 'A', need: 6, have: 5 }]);
    expect(stockShortages(stockNeeds([{ sku: 'X', qty: 1 }, { sku: 'Y', qty: 0 }]), new Map())).toEqual([{ sku: 'X', need: 1, have: 0 }]);
  });
  it('số lẻ không sai vì dấu phẩy động; câu báo', () => {
    expect(stockShortages(stockNeeds([{ sku: 'A', qty: 0.1 }, { sku: 'A', qty: 0.2 }]), new Map([['A', 0.3]]))).toEqual([]);
    expect(stockShortMessage([{ sku: '11005100103', need: 7, have: 5 }], 'CN01')).toBe('Bán quá tồn: 11005100103 cần 7, tồn 5 ở CN01');
  });
});
