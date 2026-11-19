// [2026-11-18 Võ Hoàng] NGHIEM-THU — NT-BH-031: hàm thuần kênh bán hàng (đóng góp)
import { describe, expect, it } from 'vitest';
import { DEFAULT_CHANNEL, SEED_CHANNELS, channelKey, channelReport, matchSaleSource, newChannelInput, orderDiscount, type Channel } from '../api/domain/channels.js';

const list: Channel[] = SEED_CHANNELS.map((c) => ({ ...c, active: c.code !== 'HOTLINE' }));

describe('danh mục nạp sẵn', () => {
  it('14 nguồn bán của POS cũ, đúng thứ tự, mã không dấu, loại online / offline', () => {
    expect(SEED_CHANNELS.map((c) => c.name)).toEqual(['Gần shop', 'Giới thiệu', 'Hotline', 'Zalo', 'Website', 'Khác', 'Facebook CT', 'Facebook CN',
      'IG-Tik Tok CT', 'IG-Tik Tok CN', 'Livestream CT', 'Livestream CN', 'TMĐT-Shopee', 'TMĐT-Lazada']);
    expect(SEED_CHANNELS.every((c) => /^[A-Z0-9_]+$/.test(c.code))).toBe(true);
    expect(SEED_CHANNELS.filter((c) => c.kind === 'offline').map((c) => c.code)).toEqual(['GAN_SHOP', 'GIOI_THIEU', 'HOTLINE', 'KHAC']);
    expect(SEED_CHANNELS[0]!.code).toBe(DEFAULT_CHANNEL);
  });
  it('mã kênh mới: tự viết hoa, chặn dấu / khoảng trắng', () => {
    expect(newChannelInput.parse({ code: 'tmdt_tiktok', name: 'TMĐT-TikTok Shop', kind: 'online' }).code).toBe('TMDT_TIKTOK');
    expect(newChannelInput.safeParse({ code: 'TMĐT TIKTOK', name: 'x', kind: 'online' }).success).toBe(false);
  });
});

describe('matchSaleSource', () => {
  it('không gửi / "tai_quay" → kênh mặc định Gần shop', () => {
    expect(matchSaleSource(list, undefined)).toMatchObject({ ok: true, by: 'default', channel: { code: 'GAN_SHOP' } });
    expect(matchSaleSource(list, 'tai_quay')).toMatchObject({ ok: true, channel: { code: 'GAN_SHOP' } });
  });
  it('theo mã (không phân biệt hoa thường) hoặc theo tên (máy bán cũ gửi tên)', () => {
    expect(matchSaleSource(list, 'zalo')).toMatchObject({ ok: true, by: 'code', channel: { code: 'ZALO' } });
    expect(matchSaleSource(list, ' TMĐT-Shopee ')).toMatchObject({ ok: true, by: 'name', channel: { code: 'TMDT_SHOPEE' } });
    expect(matchSaleSource(list, 'livestream ct')).toMatchObject({ ok: true, by: 'name', channel: { code: 'LIVESTREAM_CT' } });
  });
  it('kênh đã ngừng → inactive; kênh lạ → unknown', () => {
    expect(matchSaleSource(list, 'HOTLINE')).toMatchObject({ ok: false, reason: 'inactive', channel: { name: 'Hotline' } });
    expect(matchSaleSource(list, 'Hotline')).toMatchObject({ ok: false, reason: 'inactive' });
    expect(matchSaleSource(list, 'KHONG_CO')).toEqual({ ok: false, reason: 'unknown' });
  });
  it('channelKey: đơn cũ không mang kênh tính vào kênh mặc định', () => {
    expect(channelKey(undefined)).toBe('GAN_SHOP');
    expect(channelKey('tai_quay')).toBe('GAN_SHOP');
    expect(channelKey('ZALO')).toBe('ZALO');
  });
});

describe('channelReport', () => {
  it('gộp kênh × cửa hàng, thực thu = doanh thu − trả hàng, tách online / offline, theo thứ tự danh mục', () => {
    const r = channelReport([
      { source: 'pos', channel: 'ZALO', branchCode: 'CN01', orders: 1, revenue: 500_000, discount: 20_000, returns: 0 },
      { source: 'phieu-ban', channel: 'ZALO', branchCode: 'CN01', orders: 1, revenue: 300_000, discount: 0, returns: 0 },
      { source: 'pos', channel: 'ZALO', branchCode: 'CN01', orders: 0, revenue: 0, discount: 0, returns: 100_000 },
      { source: 'pos', channel: '', branchCode: 'CN02', orders: 1, revenue: 200_000, discount: 0, returns: 0 },
    ], list);
    expect(r.rows.map((x) => [x.channelCode, x.branchCode])).toEqual([['GAN_SHOP', 'CN02'], ['ZALO', 'CN01']]);
    expect(r.rows[1]).toMatchObject({ channelName: 'Zalo', kind: 'online', orders: 2, posOrders: 1, phieuBanDocs: 1, revenue: 800_000, discount: 20_000, returns: 100_000, net: 700_000 });
    expect(r.byKind.online).toMatchObject({ orders: 2, net: 700_000 });
    expect(r.byKind.offline).toMatchObject({ orders: 1, net: 200_000 });
    expect(r.byKind.all.revenue).toBe(1_000_000);
  });
  it('orderDiscount: khuyến mại + voucher mọi dòng, gồm bill Z', () => {
    expect(orderDiscount({ lines: [{ promoDiscount: 10_000 }, { voucherDiscount: 5_000 }], zBill: { lines: [{ promoDiscount: 1_000 }] } })).toBe(16_000);
  });
});
