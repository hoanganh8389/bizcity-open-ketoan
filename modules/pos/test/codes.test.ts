// [2026-11-18 Võ Hoàng] NGHIEM-THU — NT-BH-027: test thuần mã phiếu dạng shop, số kế thừa, số thiếu (đóng góp)
import { describe, expect, it } from 'vitest';
import { SHOP_LAST_MAX, isWebsiteLast, missingCodes, missingRanges, schemeOf, shopFloor, shopReturnCode, shopReturnSeq, shopSaleCode, shopSaleSeq } from '../api/domain/codes.js';

describe('mã phiếu dạng shop (luật chế độ bt của POS website)', () => {
  it('phiếu bán {shop}BT{5 số}, tràn 99999 sang BU, đọc ngược đúng bộ đếm', () => {
    expect(shopSaleCode('08022', 10_000)).toBe('08022BT10000');
    expect(shopSaleCode('08022', 12_346)).toBe('08022BT12346');
    expect(shopSaleCode('08022', 99_999)).toBe('08022BT99999');
    expect(shopSaleCode('08022', 100_000)).toBe('08022BU00001');
    expect(shopSaleCode('08022', 199_998)).toBe('08022BU99999');
    expect(shopSaleCode('08022', 199_999)).toBe('08022BV00001');
    for (const n of [10_000, 99_999, 100_000, 250_123]) expect(shopSaleSeq('08022', shopSaleCode('08022', n))).toBe(n);
    expect(shopSaleCode('08022', 12_346)).toHaveLength(12);
  });
  it('mã của shop khác, bill Z, mã HD, dải AA (htsoft) không thuộc dãy', () => {
    expect(shopSaleSeq('08022', '08023BT12346')).toBeNull();
    expect(shopSaleSeq('08022', '08022BT12346Z')).toBeNull();
    expect(shopSaleSeq('08022', 'HD2611000001')).toBeNull();
    expect(shopSaleSeq('08022', '08022AA20505')).toBeNull();
  });
  it('phiếu hoàn {shop}.B{5 số}, không chia dải', () => {
    expect(shopReturnCode('08022', 269)).toBe('08022.B00269');
    expect(shopReturnCode('08022', 100_000)).toBe('08022.B100000');
    expect(shopReturnSeq('08022', '08022.B00269')).toBe(269);
    expect(shopReturnSeq('08022', 'TH2611000001')).toBeNull();
  });
  // [2026-11-18 Võ Hoàng] NGHIEM-THU — NT-BH-027 (18/11 anh chốt): dạng shop mặc định, mã chi nhánh lạ giữ HD / TH; số cuối website (đóng góp)
  it('dạng shop mặc định; mã chi nhánh không dựng được mã 12 ký tự (không phải 1–5 chữ hoa / số) giữ HD / TH', () => {
    expect(schemeOf('08022')).toEqual({ mode: 'shop', shop: '08022' });
    expect(schemeOf('CN01')).toEqual({ mode: 'shop', shop: 'CN01' });
    for (const b of ['CN-NA', 'CN001X', 'cn01', '']) expect(schemeOf(b)).toEqual({ mode: 'legacy' });
  });
  it('sàn mặc định: bán 9999 (số đầu 10000), hoàn 0 (số đầu 00001); số cuối website: số nguyên 1…99 999 999', () => {
    expect(shopFloor('sale')).toBe(9_999);
    expect(shopFloor('return')).toBe(0);
    for (const n of [1, 12_345, SHOP_LAST_MAX]) expect(isWebsiteLast(n)).toBe(true);
    for (const n of [0, -1, 1.5, SHOP_LAST_MAX + 1, Number.NaN, '12345', null, undefined]) expect(isWebsiteLast(n)).toBe(false);
  });
});

describe('số bill bị thiếu', () => {
  const r = { codes: ['08022BT12350', '08022BT12351', '08022BT12352', '08022BT12353'], deviceId: 'MAY-01', reservedBy: 'user:1', reservedByName: 'Thu ngân', reservedAt: '2026-11-18T01:00:00.000Z', expiresAt: '2026-11-30T17:00:00.000Z' };
  it('số đã cấp mà chưa dùng: lý do máy xin chưa dùng; quá hạn dải ghi thêm hết hạn; gộp thành dải', () => {
    const m = missingCodes([r], new Set(['08022BT12350']), new Date('2026-11-18T05:00:00Z'));
    expect(m.map((x) => x.code)).toEqual(['08022BT12351', '08022BT12352', '08022BT12353']);
    expect(m[0]).toMatchObject({ reasonCode: 'reserved_unused', reason: 'máy MAY-01 xin lúc 18/11 08:00 chưa dùng' });
    expect(missingRanges(m)).toEqual([{ from: '08022BT12351', to: '08022BT12353', count: 3, reason: m[0]!.reason }]);
    const late = missingCodes([r], new Set(), new Date('2026-12-02T00:00:00Z'));
    expect(late[0]).toMatchObject({ reasonCode: 'range_expired', reason: expect.stringContaining('dải hết hạn') });
  });
});
