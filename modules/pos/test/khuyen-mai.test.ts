// [2026-11-14 01:35 AM Võ Hoàng] NGHIEM-THU — NT-BH-016: hàm thuần màn Khuyến mại (đóng góp)
import { describe, expect, it } from 'vitest';
import { emptyForm, num, parseGifts, statusOf, stopParams, toParams, STOP_REASON } from '../web/screens/khuyen-mai/model.js';

describe('nhập số, quà', () => {
  it('số kiểu Việt: 1.000.000 → 1000000; 2,5 → 2.5; trống → undefined', () => {
    expect(num('1.000.000')).toBe(1_000_000);
    expect(num('2,5')).toBe(2.5);
    expect(num('')).toBeUndefined();
    expect(num('abc')).toBeNaN();
  });
  it('quà "MÃ:SL, MÃ"; sai khuôn → null', () => {
    expect(parseGifts('QUA01:1, QUA02 x 2; QUA03')).toEqual([{ sku: 'QUA01', qty: 1 }, { sku: 'QUA02', qty: 2 }, { sku: 'QUA03', qty: 1 }]);
    expect(parseGifts('QUA01:0')).toBeNull();
  });
});

describe('toParams', () => {
  it('Mua X tặng Y chỉ có ô của khuôn (không điều kiện chung — khuôn strict)', () => {
    const f = { ...emptyForm('buy_x_get_y', '2026-11-14'), key: 'KM-XY', buy: { sku: 'A', qty: '2' }, get: { sku: 'C', qty: '1' }, weekdays: [6] };
    expect(toParams(f)).toEqual({ problems: [], params: { validFrom: '2026-11-14', buy: { sku: 'A', qty: 2 }, get: { sku: 'C', qty: 1 }, repeat: true } });
  });
  it('miễn trần NĐ81 → legalCapPct null; quà sai khuôn → lỗi theo bậc', () => {
    const f = { ...emptyForm('order_gift', '2026-11-14'), key: 'KM-QUA', noCap: true, giftTiers: [{ minOrder: '1.000.000', gifts: 'QUA01:0' }] };
    const r = toParams(f);
    expect(r.params.legalCapPct).toBeNull();
    expect(r.problems).toEqual(['Bậc 1: quà ghi dạng MÃ:số lượng, cách nhau dấu phẩy']);
  });
});

describe('ngừng, trạng thái', () => {
  it('ngừng từ ngày: validTo = hôm trước; khuyến mại chưa chạy thu cửa sổ về trước ngày ngừng', () => {
    expect(stopParams({ validFrom: '2026-11-01', validTo: '2026-12-31', x: 1 }, '2026-11-14')).toEqual({ validFrom: '2026-11-01', validTo: '2026-11-13', x: 1 });
    expect(stopParams({ validFrom: '2026-12-01' }, '2026-11-14')).toEqual({ validFrom: '2026-11-13', validTo: '2026-11-13' });
    expect(stopParams({ validTo: '2026-11-05' }, '2026-11-14')).toEqual({ validTo: '2026-11-05' });
  });
  it('trạng thái: sắp chạy / đang chạy / đã hết / đã ngừng', () => {
    const t = '2026-11-14';
    expect(statusOf({ validFrom: '2026-11-20' }, t)).toBe('upcoming');
    expect(statusOf({ validFrom: '2026-11-01', validTo: '2026-11-30' }, t)).toBe('running');
    expect(statusOf({ validTo: '2026-11-13' }, t)).toBe('ended');
    expect(statusOf({ validTo: '2026-11-30', lastReason: `${STOP_REASON} từ 2026-11-14` }, t)).toBe('stopped');
  });
});
