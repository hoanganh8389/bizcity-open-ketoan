/**
 * Voucher (phiếu NT-BH-026) — hàm thuần (không đọc CSDL): khuôn đợt phát, chuẩn hoá SĐT / mã, hạn mã, kiểm một mã cho một đơn
 * (của khách nào, đã dùng chưa, hạn, đơn tối thiểu, giỏ có sản phẩm / nhãn áp dụng), điều kiện tự phát voucher lần mua sau, mã định
 * theo đơn. Tiền trừ thật (chia vào dòng / dòng thanh toán) do module bán (pos, phieu-ban) tính trên đơn của mình.
 */
// [2026-11-18 Võ Hoàng] NGHIEM-THU — NT-BH-026: hàm thuần voucher (đóng góp)
import { createHash, randomBytes } from 'node:crypto';
import { z } from '@bizcity/module-sdk';

export type Kind = 'cash' | 'next_purchase';
export type Issuer = 'tgs' | 'brand';
export type CodeStatus = 'active' | 'used' | 'revoked';

const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Ngày dạng YYYY-MM-DD');
const optDate = date.nullish().or(z.literal('').transform(() => null));
const codeList = z.array(z.string().trim().min(1).max(64)).max(500).default([]);

/** Khuôn đợt phát màn gửi (sản phẩm theo mã hàng — máy chủ đổi sang item_id lúc lưu). */
export const campaignInput = z.object({
  code: z.string().trim().min(1, 'Chưa nhập mã đợt').max(40).regex(/^[A-Za-z0-9_.-]+$/, 'Mã đợt chỉ gồm chữ không dấu, số, _ . -'),
  name: z.string().trim().min(1, 'Chưa nhập tên đợt').max(200),
  kind: z.enum(['cash', 'next_purchase']),
  issuer: z.enum(['tgs', 'brand']),
  issuerPartnerCode: z.string().trim().max(64).nullish(),
  paymentMethodCode: z.string().trim().max(32).nullish(),
  faceValue: z.number().int('Mệnh giá là số nguyên đồng').positive('Mệnh giá phải lớn hơn 0'),
  minOrder: z.number().int().min(0).default(0),
  validFrom: date,
  validTo: optDate,
  validDays: z.number().int().positive().max(3650).nullish(),
  skus: codeList,
  brandCodes: codeList,
  issueMode: z.enum(['manual', 'auto']).default('manual'),
  autoRule: z.object({ skus: codeList, brandCodes: codeList, minQty: z.number().positive('Số lượng tối thiểu phải lớn hơn 0'), branches: codeList }).nullish(),
  note: z.string().trim().max(1000).nullish(),
});
export type CampaignInput = z.infer<typeof campaignInput>;

/** Lỗi khuôn đợt phát (câu tiếng Việt) — rỗng = được. */
export function campaignProblems(c: CampaignInput): string[] {
  const p: string[] = [];
  if (c.issuer === 'brand' && !c.issuerPartnerCode) p.push('Voucher hãng phải chọn hãng / NCC phát');
  if (c.issuer === 'brand' && !c.paymentMethodCode) p.push('Voucher hãng phải chọn hình thức thanh toán (kế toán khai tài khoản phải thu hãng ở hình thức)');
  if (c.kind === 'next_purchase' && !c.skus.length && !c.brandCodes.length) p.push('Voucher lần mua sau phải chọn sản phẩm hoặc nhãn áp dụng');
  if (c.validTo && c.validTo < c.validFrom) p.push('Ngày hết hạn trước ngày bắt đầu');
  if (c.issueMode === 'auto') {
    if (!c.autoRule) p.push('Đợt tự phát phải khai điều kiện (mua sản phẩm / nhãn ≥ số lượng)');
    else if (!c.autoRule.skus.length && !c.autoRule.brandCodes.length) p.push('Điều kiện tự phát phải chọn sản phẩm hoặc nhãn');
  }
  return p;
}

/** SĐT chuẩn hoá: chỉ chữ số, +84 / 84 đầu → 0. Trả '' khi không đủ 10 số bắt đầu bằng 0. */
export function normalizePhone(raw: string | null | undefined): string {
  const d = String(raw ?? '').replace(/\D/g, '');
  const p = d.startsWith('84') && d.length === 11 ? `0${d.slice(2)}` : d;
  return /^0\d{9}$/.test(p) ? p : '';
}

export const normalizeCode = (raw: string) => raw.trim().toUpperCase();

const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const encode = (bytes: Uint8Array, n: number) => [...bytes].slice(0, n).map((b) => ALPHABET[b % ALPHABET.length]).join('');

/** Mã ngẫu nhiên 10 ký tự (không có 0 / O / 1 / I để khỏi đọc nhầm). */
export const randomCode = (prefix = 'V') => `${prefix}${encode(randomBytes(16), 9)}`;

/** Mã tự phát định theo đơn × đợt: hỏi lại / giao lại sự kiện ra cùng mã, in trên bill trước khi lưu. */
export const autoCode = (orderId: string, campaignId: string) => `L${encode(createHash('sha256').update(`${orderId}|${campaignId}`).digest(), 9)}`;

const addDays = (d: string, n: number) => new Date(Date.parse(`${d}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);

/** Hạn của mã phát ngày `issuedOn`: sớm hơn giữa (ngày phát + hạn − 1) và ngày hết hạn của đợt. */
export function expiryOf(c: { validTo: string | null; validDays: number | null }, issuedOn: string): string | null {
  const byDays = c.validDays ? addDays(issuedOn, c.validDays - 1) : null;
  if (byDays && c.validTo) return byDays < c.validTo ? byDays : c.validTo;
  return byDays ?? c.validTo;
}

export type Campaign = {
  id: string; code: string; name: string; kind: Kind; issuer: Issuer; issuerPartnerCode: string | null; paymentMethodCode: string | null;
  faceValue: number; minOrder: number; validFrom: string; validTo: string | null; validDays: number | null; itemIds: string[]; brandCodes: string[];
  issueMode: 'manual' | 'auto'; autoRule: { itemIds: string[]; brandCodes: string[]; minQty: number; branches: string[] } | null; status: 'active' | 'stopped';
};
export type CodeRow = {
  code: string; campaignId: string; phone: string; partnerCode: string | null; status: CodeStatus; expiresOn: string | null;
  usedSource: string | null; usedRefId: string | null; usedRefCode: string | null; usedBranch: string | null; usedOn: string | null; revokeReason: string | null;
};
/** Dòng giỏ đã tra danh mục (item_id, nhãn) — số lượng theo đơn vị nhỏ nhất, tiền gồm thuế sau khuyến mại. */
export type CartLine = { sku: string; itemId: string | null; brandCode: string | null; qty: number; amount: number };

export type Problem = { code: string; reason: string; message: string; usedIn?: { source: string; refCode: string; branch: string | null; date: string | null } };

const vnd = (n: number) => `${n.toLocaleString('vi-VN')}đ`;

/** Dòng giỏ thuộc phạm vi (item_id hoặc nhãn). */
export const inScope = (scope: { itemIds: string[]; brandCodes: string[] }, l: CartLine) =>
  (l.itemId !== null && scope.itemIds.includes(l.itemId)) || (l.brandCode !== null && scope.brandCodes.includes(l.brandCode));

/**
 * Kiểm một mã cho một đơn. `phones`: SĐT của khách đơn này (khách theo mã: SĐT ở danh mục + mã nếu là SĐT). `refId`: đơn / phiếu đang
 * dùng — mã đã dùng ở chính đơn đó (gửi lại, duyệt lại) vẫn được. Đúng → mã hàng áp dụng trong giỏ (null = cả đơn).
 */
export function checkCode(code: string, row: CodeRow | null, c: Campaign | null, o: {
  phones: ReadonlySet<string>; customerCode: string | null; refId: string; date: string; orderTotal: number; cart: readonly CartLine[];
}): { problem: Problem } | { applicableSkus: string[] | null } {
  const bad = (reason: string, message: string, extra: Partial<Problem> = {}) => ({ problem: { code, reason, message, ...extra } });
  if (!row || !c) return bad('VOUCHER_NOT_FOUND', `Không có voucher ${code}`);
  const owner = o.phones.has(row.phone) || (row.partnerCode !== null && row.partnerCode === o.customerCode);
  if (!owner) return bad('VOUCHER_NOT_OWNER', `Voucher ${code} không thuộc khách này (gắn SĐT ${maskPhone(row.phone)}) — chỉ khách được phát mới dùng được`);
  if (row.status === 'used' && row.usedRefId !== o.refId) {
    return bad('VOUCHER_USED', `Voucher ${code} đã dùng ở ${row.usedSource === 'phieu-ban' ? 'phiếu' : 'đơn'} ${row.usedRefCode ?? '?'}${row.usedOn ? ` ngày ${row.usedOn}` : ''}${row.usedBranch ? ` (${row.usedBranch})` : ''}`,
      { usedIn: { source: row.usedSource ?? '', refCode: row.usedRefCode ?? '', branch: row.usedBranch, date: row.usedOn } });
  }
  if (row.status === 'revoked') return bad('VOUCHER_REVOKED', `Voucher ${code} đã thu hồi${row.revokeReason ? ` (${row.revokeReason})` : ''}`);
  if (c.status === 'stopped') return bad('VOUCHER_REVOKED', `Đợt ${c.name} đã ngừng — voucher ${code} không dùng được`);
  if (o.date < c.validFrom) return bad('VOUCHER_EXPIRED', `Voucher ${code} dùng từ ngày ${c.validFrom}`);
  if (row.expiresOn && o.date > row.expiresOn) return bad('VOUCHER_EXPIRED', `Voucher ${code} hết hạn ngày ${row.expiresOn}`);
  if (c.minOrder > 0 && o.orderTotal < c.minOrder) return bad('VOUCHER_MIN_ORDER', `Voucher ${code} cần đơn tối thiểu ${vnd(c.minOrder)} (đơn ${vnd(o.orderTotal)})`);
  if (c.kind === 'cash') return { applicableSkus: null };
  const skus = [...new Set(o.cart.filter((l) => l.amount > 0 && inScope(c, l)).map((l) => l.sku))];
  if (!skus.length) return bad('VOUCHER_NOT_APPLICABLE', `Voucher ${code} (${c.name}) chỉ dùng khi giỏ có sản phẩm / nhãn áp dụng — giỏ này không có`);
  return { applicableSkus: skus };
}

export const maskPhone = (p: string) => (p.length >= 7 ? `${p.slice(0, 3)}****${p.slice(-3)}` : p);

/** Đợt tự phát đủ điều kiện với giỏ này (đang dùng, trong hạn, đúng cửa hàng, mua sản phẩm / nhãn ≥ số lượng). */
export function autoEligible(campaigns: readonly Campaign[], o: { branch: string; date: string; cart: readonly CartLine[] }): Campaign[] {
  return campaigns.filter((c) => {
    const r = c.autoRule;
    if (c.issueMode !== 'auto' || c.status !== 'active' || !r) return false;
    if (o.date < c.validFrom || (c.validTo && o.date > c.validTo)) return false;
    if (r.branches.length && !r.branches.includes(o.branch)) return false;
    const qty = o.cart.filter((l) => l.amount > 0 && inScope(r, l)).reduce((t, l) => t + l.qty, 0);
    return qty + 1e-9 >= r.minQty;
  });
}

/** Trạng thái hiển thị: còn / đã dùng / hết hạn / thu hồi. */
export function displayStatus(r: { status: CodeStatus; expiresOn: string | null }, today: string): 'active' | 'used' | 'expired' | 'revoked' {
  if (r.status !== 'active') return r.status;
  return r.expiresOn && today > r.expiresOn ? 'expired' : 'active';
}
