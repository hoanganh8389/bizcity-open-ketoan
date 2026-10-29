/**
 * MÃ HÀNG theo quy tắc mã hàng của công ty:
 *   Hàng thường: 9 ký tự = ngành (2) + nhãn (3) + nhóm (1) + số tự sinh (3). Nhóm 8 = hàng Combo.
 *   Ký tự thứ 10: K = hàng chia giá (giá trị hàng KM của NCC chia vào giá hàng bán) · M = hàng khuyến mại (ghi nhận 0 đồng,
 *   tên bắt đầu "KM") · Q = hàng kẹp quà (bán kèm, không tách) · T = hàng có tem.
 *   Quà khuyến mại: "Q" + nhãn (3) + nhóm (1) + số tự sinh (4).
 *   Sổ thuế: hàng K, M, T nhập theo mã hàng thường; kẹp quà / combo theo hoá đơn.
 * Phần mềm đọc mã để tự biết loại hàng — người dùng không phải chọn "loại dòng".
 */
import type { LineType, Policy } from './engine.js';
import { policyApplies } from './engine.js';

export type SkuKind = 'normal' | 'share' | 'promo' | 'clip' | 'stamp' | 'combo' | 'gift' | 'variant' | 'other';
export interface SkuInfo {
  kind: SkuKind;
  /** Mã hàng thường tương ứng (bỏ đuôi K/M/Q/T) — dùng cho sổ thuế, so đổi mã. */
  base: string;
  industry?: string; brand?: string; group?: string;
  /** Số tự sinh (3 số; quà KM 4 số) và ký tự đuôi (K, M, Q, T hoặc đuôi riêng B, Z…). */
  seq?: string; suffix?: string;
  label: string; hint: string; tone: 'info' | 'ok' | 'warn' | 'gray';
}

export const SKU_KIND: Record<SkuKind, { label: string; hint: string; tone: SkuInfo['tone'] }> = {
  normal: { label: 'Hàng thường', hint: 'Mã 9 ký tự: ngành (2) + nhãn (3) + nhóm (1) + số (3)', tone: 'gray' },
  share: { label: 'Chia giá (K)', hint: 'Hàng chia giá: giá trị hàng KM của NCC chia vào giá hàng bán. Sổ thuế nhập theo mã hàng thường', tone: 'info' },
  promo: { label: 'Khuyến mại (M)', hint: 'Hàng khuyến mại tặng người tiêu dùng, ghi nhận 0 đồng. Sổ thuế nhập theo mã hàng thường', tone: 'ok' },
  clip: { label: 'Kẹp quà (Q)', hint: 'Hàng kẹp quà KM: bán kèm, không được tách. Tách quà phải được duyệt', tone: 'warn' },
  stamp: { label: 'Có tem (T)', hint: 'Hàng có tem chương trình. Sổ thuế nhập theo mã hàng thường; hàng có KM trên tem không được phá combo', tone: 'info' },
  combo: { label: 'Combo', hint: 'Hàng combo (nhóm 8): nội bộ nhập theo mã combo; phá combo phải có chứng từ và được duyệt', tone: 'warn' },
  gift: { label: 'Quà KM', hint: 'Quà khuyến mại: "Q" + nhãn (3) + nhóm (1) + số (4)', tone: 'ok' },
  variant: { label: 'Mã phụ', hint: 'Mã hàng thường + chữ đuôi riêng của công ty (Z, B, D, C, CB…) để quản lý đợt / chương trình / quy cách. Sổ thuế nhập theo mã hàng thường', tone: 'info' },
  other: { label: '', hint: 'Mã không theo quy tắc mã hàng', tone: 'gray' },
};

/** Đọc một mã hàng. */
export function skuInfo(sku: string): SkuInfo {
  const s = (sku ?? '').trim().toUpperCase();
  const mk = (kind: SkuKind, base: string, parts?: { industry: string; brand: string; group: string; seq: string; suffix?: string }): SkuInfo => ({ kind, base, ...parts, ...SKU_KIND[kind], ...(kind === 'variant' ? { label: `Mã phụ (${parts?.suffix})` } : {}) });
  let m = /^(\d{2})(\d{3})(\d)(\d{3})([A-Z]{1,3})?$/.exec(s);
  if (m) {
    const suffix = m[5];
    const parts = { industry: m[1]!, brand: m[2]!, group: m[3]!, seq: m[4]!, ...(suffix ? { suffix } : {}) };
    const base = s.slice(0, 9);
    if (suffix) return mk(({ K: 'share', M: 'promo', Q: 'clip', T: 'stamp' } as Record<string, SkuKind>)[suffix] ?? 'variant', base, parts);
    return mk(parts.group === '8' ? 'combo' : 'normal', base, parts);
  }
  m = /^Q(\d{3})(\d)(\d{4})$/.exec(s);
  if (m) return mk('gift', s, { industry: 'Q', brand: m[1]!, group: m[2]!, seq: m[3]! });
  return mk('other', s);
}

/**
 * HỌ MÃ (1 cấp): mã có đuôi (Z, Q, K, M, B…) mà mã gốc 9 số CÓ trong danh mục là MÃ CON của mã gốc; còn lại tự là mã cha.
 * Riêng đuôi T (hàng có tem) đặt riêng với NCC → KHÔNG gộp, tự là mã cha (danh sách sắp theo mã nên vẫn đứng cạnh mã gốc).
 * Tự quét theo mã — không phải khai. Phân tích đặt hàng cộng dồn cả họ vào mã cha; danh mục mặt hàng xếp mã con dưới mã cha.
 */
export function familyParent(sku: string, catalog: Set<string>): string {
  const info = skuInfo(sku);
  if (info.kind === 'stamp') return sku;
  return info.base && info.base !== sku && catalog.has(info.base) ? info.base : sku;
}
/** Gom các mã thành họ: mã cha → [mã cha, các mã con…] (mã cha luôn đứng đầu, kể cả khi không có trong danh sách đưa vào). */
export function familiesOf(skus: string[], catalog: Set<string>): Map<string, string[]> {
  return familiesBy(skus, (s) => familyParent(s, catalog));
}
/** Gom họ theo hàm mã cha cho trước (vd đọc products.parent_sku) — mã cha đứng đầu, mã con theo sau. */
export function familiesBy(skus: string[], parentOf: (sku: string) => string): Map<string, string[]> {
  const out = new Map<string, string[]>();
  for (const s of [...new Set(skus)].sort()) {
    const p = parentOf(s);
    const list = out.get(p) ?? [p];
    if (s !== p && !list.includes(s)) list.push(s);
    out.set(p, list);
  }
  return out;
}

/** Đuôi mã theo quy tắc mã hàng (ký tự thứ 10) + đuôi riêng; tên hàng đặt theo mẫu tương ứng. */
export const SKU_SUFFIXES: { suffix: string; label: string; official: boolean; name: (n: string) => string }[] = [
  { suffix: 'K', label: 'K — hàng chia giá', official: true, name: (n) => `${n} K` },
  { suffix: 'M', label: 'M — hàng khuyến mại (0 đồng)', official: true, name: (n) => `KM ${n}` },
  { suffix: 'Q', label: 'Q — hàng kẹp quà KM', official: true, name: (n) => `${n} Kẹp quà KM` },
  { suffix: 'T', label: 'T — hàng có tem', official: true, name: (n) => `${n} T` },
  // Đuôi riêng đang dùng thực tế (ngoài đuôi chuẩn) — cách đặt tên theo mẫu trong danh mục hiện có.
  { suffix: 'Z', label: 'Z — đuôi riêng (đang dùng)', official: false, name: (n) => `(Z) ${n}` },
  { suffix: 'B', label: 'B — đuôi riêng (đang dùng)', official: false, name: (n) => `${n} B` },
  { suffix: 'D', label: 'D — đuôi riêng (đang dùng)', official: false, name: (n) => `${n} D` },
  { suffix: 'C', label: 'C — đuôi riêng (đang dùng)', official: false, name: (n) => `${n} (C)` },
];
/** Tên hàng của mã biến thể (mã thường + đuôi): theo mẫu chuẩn với K/M/Q/T, theo mẫu đang dùng với Z/B/D/C; đuôi khác thì tên + " " + đuôi. */
export function variantName(baseName: string, suffix: string): string {
  const n = baseName.trim();
  const rule = SKU_SUFFIXES.find((x) => x.suffix === suffix.toUpperCase());
  return rule ? rule.name(n) : suffix ? `${n} ${suffix.toUpperCase()}` : n;
}

/**
 * Loại dòng tự suy ra (thay ô "Loại dòng" chọn tay):
 *  - mã M / quà KM, hoặc dòng giá 0 không được chia giá → hàng tặng người tiêu dùng (0 đồng, vào sổ quà);
 *  - mã K, hoặc dòng giá 0 được chia giá → hàng tặng chia vào giá vốn hàng mua cùng phiếu;
 *  - còn lại → hàng mua.
 * Dòng giá 0 của mã thường: theo chính sách khuyến mại của NCC cho mã đó (splitIntoCost), không có chính sách thì mặc định
 * CHIA GIÁ (đúng định nghĩa "hàng chia giá" của TGS) — người dùng bỏ tích "Chia vào giá vốn" nếu là quà cho khách.
 */
export function autoLineType(sku: string, price: number, ctx: { policies: Policy[]; date: string; partnerCode?: string; brandCode?: string; branchCode?: string }, share?: boolean): LineType {
  const info = skuInfo(sku);
  if (info.kind === 'promo' || info.kind === 'gift') return 'gift_consumer';
  if (price > 0) return 'buy';
  if (share !== undefined) return share ? 'gift_seller' : 'gift_consumer';
  if (info.kind === 'share') return 'gift_seller';
  const promo = ctx.policies.find((p) => p.kind === 'promo_gift' && policyApplies(p, { ...ctx, sku: info.base }));
  if (promo) return promo.rule.splitIntoCost ? 'gift_seller' : 'gift_consumer';
  return 'gift_seller';
}
