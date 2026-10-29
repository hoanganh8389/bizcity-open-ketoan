/**
 * Phép tính ĐVT dùng chung (@ketoan/contracts dvt.ts): khai theo ĐVT trung gian, chuỗi quy đổi, giá gợi ý theo tỉ lệ, kiểm bộ ĐVT.
 */
import { describe, expect, it } from 'vitest';
import { chainText, refOf, suggestPrice, unitProblems } from '@ketoan/contracts';

const TH = [{ unit: 'Lon', ratio: 1 }, { unit: 'Lốc', ratio: 4 }, { unit: 'Thùng', ratio: 48 }];

describe('ĐVT trung gian', () => {
  it('Thùng 48 hiển thị theo Lốc (1 Thùng = 12 Lốc); Lốc theo Lon; tỉ lệ không chia hết thì theo ĐVT nhỏ nhất', () => {
    expect(refOf(TH, TH[2]!)?.unit).toBe('Lốc');
    expect(refOf(TH, TH[1]!)?.unit).toBe('Lon');
    expect(refOf([...TH, { unit: 'Két', ratio: 30 }], { unit: 'Két', ratio: 30 })?.unit).toBe('Lon');
  });
  it('chuỗi quy đổi từ lớn đến nhỏ', () => {
    expect(chainText(TH)).toBe('1 Thùng = 12 Lốc = 48 Lon');
    expect(chainText([{ unit: 'Lon', ratio: 1 }])).toBe('Lon (ĐVT nhỏ nhất)');
  });
  it('giá gợi ý: biết giá Lon 340.000 → Lốc 1.360.000, Thùng 16.320.000; chỉ biết giá Thùng → Lon = Thùng ÷ 48', () => {
    expect(suggestPrice(TH, [{ unit: 'Lon', price: 340000 }], 'Lốc')).toBe(1360000);
    expect(suggestPrice(TH, [{ unit: 'Lon', price: 340000 }], 'Thùng')).toBe(16320000);
    expect(suggestPrice(TH, [{ unit: 'Thùng', price: 258711 }], 'Lon')).toBe(5390);
    expect(suggestPrice(TH, [], 'Lốc')).toBeUndefined();
  });
  it('kiểm bộ ĐVT: trùng tên (khác hoa thường), chưa quy đổi, thiếu / thừa ĐVT nhỏ nhất', () => {
    const p = unitProblems([{ unit: 'Lon', ratio: 1 }, { unit: 'lon', ratio: 4 }, { unit: 'Thùng', ratio: 0 }, { unit: '', ratio: 2 }]);
    expect(p.rows).toEqual({ 1: 'Trùng với dòng 1', 2: 'Chưa nhập quy đổi', 3: 'Chưa chọn tên ĐVT' });
    expect(unitProblems([{ unit: 'Lốc', ratio: 4 }]).general[0]).toMatch(/một ĐVT nhỏ nhất/);
    expect(unitProblems([{ unit: 'Lon', ratio: 1 }, { unit: 'Hộp', ratio: 1 }]).general[0]).toMatch(/Lon, Hộp/);
    expect(unitProblems(TH)).toEqual({ rows: {}, general: [] });
  });
});
