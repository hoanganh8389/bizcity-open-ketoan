/**
 * Kênh bán hàng (phiếu NT-BH-031) — hàm thuần, không đọc CSDL: 14 kênh nạp sẵn (nguồn bán của POS cũ `TGS_POS_Sale_Source`), khuôn
 * mã, tìm kênh theo mã / tên (máy bán cũ gửi TÊN nguồn), kênh mặc định cho đơn không mang kênh, gộp số liệu báo cáo bán theo kênh.
 * Kênh là thông tin nội bộ của module bán hàng: không lên sổ, không sửa lõi (Q1).
 */
// [2026-11-18 Võ Hoàng] NGHIEM-THU — NT-BH-031: danh mục kênh bán hàng, kênh mặc định, gộp báo cáo theo kênh (đóng góp)
import { roundMoney, z } from '@bizcity/module-sdk';

export type ChannelKind = 'online' | 'offline';
export const CHANNEL_KINDS = ['online', 'offline'] as const;
export type Channel = { code: string; name: string; kind: ChannelKind; sortOrder: number; active: boolean };

/** Kênh của đơn / phiếu không mang kênh (đơn cũ, máy bán cũ không gửi) — "Gần shop" như POS cũ. */
export const DEFAULT_CHANNEL = 'GAN_SHOP';
/** Mã nguồn bán bản kế toán cũ trả ở bootstrap ("Tại quầy") — coi là kênh mặc định. */
const LEGACY_DEFAULT = new Set(['', 'tai_quay']);

/** 14 nguồn bán của POS cũ, đúng thứ tự; Gần shop / Giới thiệu / Hotline / Khác = offline, còn lại online (kế toán sửa được). */
export const SEED_CHANNELS: readonly Omit<Channel, 'active'>[] = ([
  ['GAN_SHOP', 'Gần shop', 'offline'],
  ['GIOI_THIEU', 'Giới thiệu', 'offline'],
  ['HOTLINE', 'Hotline', 'offline'],
  ['ZALO', 'Zalo', 'online'],
  ['WEBSITE', 'Website', 'online'],
  ['KHAC', 'Khác', 'offline'],
  ['FACEBOOK_CT', 'Facebook CT', 'online'],
  ['FACEBOOK_CN', 'Facebook CN', 'online'],
  ['IG_TIKTOK_CT', 'IG-Tik Tok CT', 'online'],
  ['IG_TIKTOK_CN', 'IG-Tik Tok CN', 'online'],
  ['LIVESTREAM_CT', 'Livestream CT', 'online'],
  ['LIVESTREAM_CN', 'Livestream CN', 'online'],
  ['TMDT_SHOPEE', 'TMĐT-Shopee', 'online'],
  ['TMDT_LAZADA', 'TMĐT-Lazada', 'online'],
] as const).map(([code, name, kind], i) => ({ code, name, kind, sortOrder: (i + 1) * 10 }));

/** Mã kênh: chữ in hoa không dấu, số, gạch dưới; ≤ 32 ký tự (máy bán gửi mã này). */
export const CHANNEL_CODE_RE = /^[A-Z0-9_]{1,32}$/;
export const channelInput = z.object({
  name: z.string().trim().min(1, 'Chưa nhập tên kênh').max(100),
  kind: z.enum(CHANNEL_KINDS),
  sortOrder: z.coerce.number().int().min(0).max(100_000).optional(),
});
export const newChannelInput = channelInput.extend({
  code: z.string().trim().toUpperCase().regex(CHANNEL_CODE_RE, 'Mã kênh: chữ in hoa không dấu, số, gạch dưới (tối đa 32 ký tự), vd TMDT_TIKTOK'),
});

/** Mã kênh lưu trên đơn (snapshot.saleSource) → mã kênh dùng để lọc / gộp: trống, "tai_quay" → kênh mặc định. */
export const channelKey = (code: string | null | undefined): string => (LEGACY_DEFAULT.has((code ?? '').trim()) ? DEFAULT_CHANNEL : (code ?? '').trim());

const fold = (s: string) => s.normalize('NFC').trim().toLowerCase().replace(/\s+/g, ' ');

export type SaleSourceMatch =
  | { ok: true; channel: Channel; by: 'default' | 'code' | 'name' }
  | { ok: false; reason: 'unknown' | 'inactive'; channel?: Channel };

/**
 * Kênh của đơn máy bán: không gửi / "tai_quay" → kênh mặc định (kể cả khi đã ngừng — máy bán cũ không chọn kênh); theo mã (không phân biệt
 * hoa thường); không trùng mã thì theo TÊN (máy bán cũ gửi chuỗi như "Zalo"). Kênh đã ngừng → inactive; không có → unknown.
 */
export function matchSaleSource(list: readonly Channel[], input: string | null | undefined): SaleSourceMatch {
  const raw = (input ?? '').trim();
  if (LEGACY_DEFAULT.has(raw)) {
    const d = list.find((c) => c.code === DEFAULT_CHANNEL) ?? list.find((c) => c.active);
    return d ? { ok: true, channel: d, by: 'default' } : { ok: false, reason: 'unknown' };
  }
  const byCode = list.find((c) => c.code === raw.toUpperCase());
  const hit = byCode ?? list.find((c) => fold(c.name) === fold(raw));
  if (!hit) return { ok: false, reason: 'unknown' };
  if (!hit.active) return { ok: false, reason: 'inactive', channel: hit };
  return { ok: true, channel: hit, by: byCode ? 'code' : 'name' };
}

/** Câu báo lỗi kênh cho thu ngân / kế toán. */
export function saleSourceMessage(input: string, m: Extract<SaleSourceMatch, { ok: false }>): string {
  return m.reason === 'inactive'
    ? `Kênh bán "${m.channel!.name}" (${m.channel!.code}) đã ngừng dùng — chọn kênh khác (khởi động lại máy bán để lấy danh sách kênh mới)`
    : `Không có kênh bán "${input}" trong danh mục Kênh bán hàng — chọn kênh trong danh sách (khởi động lại máy bán để lấy danh sách kênh mới)`;
}

// ------------------------------------------------------------------ báo cáo bán theo kênh

/** Một dòng nguồn của báo cáo: đơn máy bán, phiếu bán BH10 hay phiếu trả (âm vào cột Trả hàng). */
export type ChannelFact = {
  source: 'pos' | 'phieu-ban';
  channel: string;
  branchCode: string;
  /** Số đơn / phiếu bán (0 với dòng trả hàng). */
  orders: number;
  /** Tiền khách phải trả sau khuyến mại (gồm thuế). */
  revenue: number;
  /** Tiền giảm theo chương trình khuyến mại + voucher (gồm thuế) — tham khảo, đã trừ trong doanh thu. */
  discount: number;
  /** Tiền trả lại khách (gồm thuế). */
  returns: number;
};

export type ChannelRow = {
  channelCode: string; channelName: string; kind: ChannelKind | ''; active: boolean; branchCode: string;
  orders: number; posOrders: number; phieuBanDocs: number; revenue: number; discount: number; returns: number; net: number;
};

/**
 * Gộp theo kênh × cửa hàng (thứ tự kênh trong danh mục, rồi mã cửa hàng). Thực thu = doanh thu − trả hàng. Kênh trên đơn không còn ở danh
 * mục (không xảy ra khi không xoá kênh) vẫn hiện với tên = mã. `byKind`: tổng online / offline.
 */
export function channelReport(facts: readonly ChannelFact[], channels: readonly Channel[]) {
  const meta = new Map(channels.map((c) => [c.code, c]));
  const rows = new Map<string, ChannelRow>();
  for (const f of facts) {
    const code = channelKey(f.channel);
    const key = `${code}|${f.branchCode}`;
    const c = meta.get(code);
    const r = rows.get(key) ?? {
      channelCode: code, channelName: c?.name ?? code, kind: c?.kind ?? '', active: c?.active ?? false, branchCode: f.branchCode,
      orders: 0, posOrders: 0, phieuBanDocs: 0, revenue: 0, discount: 0, returns: 0, net: 0,
    };
    r.orders += f.orders;
    if (f.source === 'pos') r.posOrders += f.orders; else r.phieuBanDocs += f.orders;
    r.revenue = roundMoney(r.revenue + f.revenue);
    r.discount = roundMoney(r.discount + f.discount);
    r.returns = roundMoney(r.returns + f.returns);
    r.net = roundMoney(r.revenue - r.returns);
    rows.set(key, r);
  }
  const order = new Map(channels.map((c) => [c.code, c.sortOrder]));
  const list = [...rows.values()].sort((a, b) => (order.get(a.channelCode) ?? 1e9) - (order.get(b.channelCode) ?? 1e9)
    || a.channelCode.localeCompare(b.channelCode) || a.branchCode.localeCompare(b.branchCode));
  const sum = (kind: ChannelKind | 'all') => {
    const xs = kind === 'all' ? list : list.filter((r) => r.kind === kind);
    return {
      orders: xs.reduce((s, r) => s + r.orders, 0), revenue: roundMoney(xs.reduce((s, r) => s + r.revenue, 0)),
      discount: roundMoney(xs.reduce((s, r) => s + r.discount, 0)), returns: roundMoney(xs.reduce((s, r) => s + r.returns, 0)),
      net: roundMoney(xs.reduce((s, r) => s + r.net, 0)),
    };
  };
  return { rows: list, byKind: { online: sum('online'), offline: sum('offline'), all: sum('all') } };
}

/** Tiền giảm khuyến mại + voucher của một đơn máy bán (giá dòng gồm thuế): promoDiscount + voucherDiscount mọi dòng (gồm bill Z). */
export function orderDiscount(snap: { lines?: { promoDiscount?: number; voucherDiscount?: number }[]; zBill?: { lines?: { promoDiscount?: number; voucherDiscount?: number }[] } }): number {
  return roundMoney([...(snap.lines ?? []), ...(snap.zBill?.lines ?? [])].reduce((s, l) => s + (l.promoDiscount ?? 0) + (l.voucherDiscount ?? 0), 0));
}
