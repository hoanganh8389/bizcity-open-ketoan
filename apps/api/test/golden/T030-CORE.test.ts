// [2026-11-06 06:02 PM Johnny Chu - Chu Hoàng Anh] PHASE-030 — S030-19: golden T030-CORE-6 — roundMoney / allocate / schedule (R-MONEY-1..6, PHASE-030 · 18 §4)
import { describe, expect, it } from 'vitest';
import { allocate, roundMoney, schedule } from '@ketoan/contracts';

const sum = (a: readonly number[]) => a.reduce((s, x) => s + x, 0);

describe('T030-CORE-6 · roundMoney: nửa xa số 0 (R-MONEY-2)', () => {
  it.each([
    [2.5, 1, 3],
    [-2.5, 1, -3],
    [0.49999, 1, 0],
    [-0.4, 1, 0],
    [1_234_567, 1000, 1_235_000],
    [-1500, 1000, -2000],
    [1499, 1000, 1000],
  ])('roundMoney(%s, %s) = %s', (x, unit, want) => {
    expect(roundMoney(x, unit) + 0).toBe(want);
  });

  it('khác Math.round ở số âm: −2,5', () => {
    expect(Math.round(-2.5)).toBe(-2);
    expect(roundMoney(-2.5)).toBe(-3);
  });
});

describe('T030-CORE-6 · allocate: dư lớn nhất, Σ = tổng (R-MONEY-3, R-MONEY-5)', () => {
  const cases: { id: string; total: number; w: number[]; unit?: number; want: number[] }[] = [
    { id: 'a', total: 100, w: [1, 1, 1], want: [34, 33, 33] },
    { id: 'b', total: 1_000_000, w: [3, 3, 1], want: [428_572, 428_571, 142_857] },
    { id: 'c', total: -100, w: [1, 1, 1], want: [-34, -33, -33] },
    { id: 'd', total: 10_000_000, w: [1, 1, 1], unit: 1000, want: [3_334_000, 3_333_000, 3_333_000] },
    { id: 'e', total: 10_000_500, w: [1, 1, 1], unit: 1000, want: [3_334_500, 3_333_000, 3_333_000] },
    { id: 'f', total: 10, w: [0, 0], want: [5, 5] },
    { id: 'g', total: 5, w: [1, 0, 1], want: [3, 0, 2] },
    { id: 'h', total: 10_000_000, w: [240e6, 160e6, 100e6], want: [4_800_000, 3_200_000, 2_000_000] },
    { id: 'i', total: 200, w: [1, 1, 1], want: [67, 67, 66] },
    { id: 'o', total: 0, w: [1, 2], want: [0, 0] },
  ];
  it.each(cases)('ca $id: allocate($total, [$w], $unit) → $want', ({ total, w, unit, want }) => {
    const got = allocate(total, w, unit ? { unit } : {});
    expect(got).toEqual(want);
    expect(sum(got)).toBe(total);
  });

  it('chia xu theo %, tròn 100 xu: phần 10 % không mất, không có phần âm (lỗi của splitByPercent cũ)', () => {
    expect(allocate(1000, [45, 45, 10], { unit: 100 })).toEqual([500, 400, 100]);
    expect(allocate(200, [30, 30, 30, 10], { unit: 100 })).toEqual([100, 100, 0, 0]);
    expect(allocate(2500, [25, 25, 25, 25], { unit: 100 })).toEqual([700, 600, 600, 600]);
  });

  it('hoà phần dư → dòng đứng trước nhận (R-MONEY-5), không sắp lại dòng', () => {
    expect(allocate(2, [1, 1, 1])).toEqual([1, 1, 0]);
    expect(allocate(1, [1, 1])).toEqual([1, 0]);
  });

  it('đối xứng dấu', () => {
    for (const [t, w] of [[100, [1, 1, 1]], [999, [7, 3, 11, 0]], [1_000_000, [3, 3, 1]]] as [number, number[]][]) {
      expect(allocate(-t, w)).toEqual(allocate(t, w).map((x) => -x + 0));
    }
  });

  it('không sửa đầu vào', () => {
    const w = [3, 1, 2];
    allocate(1000, w);
    expect(w).toEqual([3, 1, 2]);
  });

  it('đầu vào sai thì ném RangeError, không đoán (R-MONEY-6)', () => {
    expect(() => allocate(100, [-1, 2])).toThrow(RangeError);
    expect(() => allocate(100, [Number.NaN, 2])).toThrow(RangeError);
    expect(() => allocate(100, [Number.POSITIVE_INFINITY, 2])).toThrow(RangeError);
    expect(() => allocate(100.5, [1, 2])).toThrow(RangeError);
    expect(() => allocate(100, [1, 2], { unit: 0 })).toThrow(RangeError);
    expect(() => allocate(100, [1, 2], { unit: 2.5 })).toThrow(RangeError);
    expect(() => allocate(100, [])).toThrow(RangeError);
    expect(allocate(0, [])).toEqual([]);
  });

  it('20.000 ca ngẫu nhiên (hạt giống cố định): Σ = tổng, phần ≥ 0 (cùng dấu), dòng trọng số 0 chỉ nhận phần lẻ dưới bước', () => {
    let seed = 0x9e3779b9;
    const rnd = () => { seed = (Math.imul(seed ^ (seed >>> 15), 0x2c1b3c6d) + 0x297a2d39) >>> 0; return seed / 2 ** 32; };
    for (let k = 0; k < 20_000; k++) {
      const n = 1 + Math.floor(rnd() * 8);
      const w = Array.from({ length: n }, () => (rnd() < 0.2 ? 0 : Math.floor(rnd() * 1e9)));
      const total = Math.floor((rnd() - 0.3) * 1e12);
      const unit = [1, 100, 1000][k % 3]!;
      const got = allocate(total, w, { unit });
      expect(sum(got)).toBe(total);
      const sign = total < 0 ? -1 : 1;
      expect(got.every((x) => x * sign >= 0)).toBe(true);
      if (w.some((x) => x > 0)) {
        const tail = Math.abs(total) % unit;
        got.forEach((x, i) => { if (w[i] === 0) expect(Math.abs(x)).toBeLessThanOrEqual(tail); });
      }
    }
  });
});

describe('T030-CORE-6 · schedule: lịch đều, kỳ cuối nhận dư (R-MONEY-4)', () => {
  it('k: 1 tỷ / 60 tháng từ 16/09/2026 (T030-TS-1): 8.333.334, 16.666.667 × 59, 8.333.313 — 61 kỳ', () => {
    const s = schedule(1_000_000_000, 60, { firstDays: 15, daysInFirstMonth: 30 });
    expect(s).toHaveLength(61);
    expect(s[0]).toBe(8_333_334);
    expect(s.slice(1, 60).every((x) => x === 16_666_667)).toBe(true);
    expect(s[60]).toBe(8_333_313);
    expect(sum(s)).toBe(1_000_000_000);
  });
  it('l: 120 tr / 12 tháng = 12 × 10.000.000', () => {
    expect(schedule(120_000_000, 12)).toEqual(Array(12).fill(10_000_000));
  });
  it('m, n: kỳ cuối nhận dư — 100 / 3 = 33, 33, 34 (không ra kỳ thứ 4 như vòng while của Erp-vn); 200 / 3 = 67, 67, 66', () => {
    expect(schedule(100, 3)).toEqual([33, 33, 34]);
    expect(schedule(200, 3)).toEqual([67, 67, 66]);
  });
  it('o: bắt đầu ngày 30 của tháng 30 ngày (1 ngày dùng): 555.556, 16.666.667 × 59, 16.111.091', () => {
    const s = schedule(1_000_000_000, 60, { firstDays: 1, daysInFirstMonth: 30 });
    expect(s).toHaveLength(61);
    expect(s[0]).toBe(555_556);
    expect(s[60]).toBe(16_111_091);
    expect(sum(s)).toBe(1_000_000_000);
  });
  it('kỳ đầu đủ tháng (firstDays = daysInFirstMonth) thì không thêm kỳ', () => {
    expect(schedule(1200, 12, { firstDays: 30, daysInFirstMonth: 30 })).toHaveLength(12);
  });
  it('tổng nhỏ hơn số kỳ: mỗi kỳ ≥ 1 cho tới khi hết, Σ = tổng', () => {
    const s = schedule(10, 20);
    expect(sum(s)).toBe(10);
    expect(s.every((x) => x >= 1)).toBe(true);
  });
  it('đầu vào sai thì ném RangeError', () => {
    expect(() => schedule(-1, 3)).toThrow(RangeError);
    expect(() => schedule(100.5, 3)).toThrow(RangeError);
    expect(() => schedule(100, 0)).toThrow(RangeError);
    expect(() => schedule(100, 2.5)).toThrow(RangeError);
  });
  it('1.000 ca ngẫu nhiên: Σ = tổng, mọi kỳ > 0', () => {
    let seed = 12345;
    const rnd = () => { seed = (Math.imul(seed ^ (seed >>> 15), 0x2c1b3c6d) + 0x297a2d39) >>> 0; return seed / 2 ** 32; };
    for (let k = 0; k < 1000; k++) {
      const total = 1 + Math.floor(rnd() * 5e10);
      const periods = 1 + Math.floor(rnd() * 120);
      const days = 28 + Math.floor(rnd() * 4);
      const s = schedule(total, periods, rnd() < 0.5 ? { firstDays: 1 + Math.floor(rnd() * days), daysInFirstMonth: days } : {});
      expect(sum(s)).toBe(total);
      expect(s.every((x) => x > 0)).toBe(true);
    }
  });
});
