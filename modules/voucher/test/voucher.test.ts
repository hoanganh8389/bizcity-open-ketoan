// [2026-11-18 Võ Hoàng] NGHIEM-THU — NT-BH-026: hàm thuần voucher (đóng góp)
import { describe, expect, it } from 'vitest';
import {
  autoCode, autoEligible, campaignInput, campaignProblems, checkCode, displayStatus, expiryOf, normalizePhone, randomCode, type Campaign, type CartLine, type CodeRow,
} from '../api/domain/voucher.js';

const camp = (p: Partial<Campaign> = {}): Campaign => ({
  id: 'c1', code: 'ABBOTT50K', name: 'Abbott 50K', kind: 'cash', issuer: 'brand', issuerPartnerCode: 'NCC-ABBOTT', paymentMethodCode: 'VC-ABBOTT', faceValue: 50_000,
  minOrder: 0, validFrom: '2026-11-01', validTo: '2026-12-31', validDays: null, itemIds: [], brandCodes: [], issueMode: 'manual', autoRule: null, status: 'active', ...p,
});
const code = (p: Partial<CodeRow> = {}): CodeRow => ({
  code: 'V1', campaignId: 'c1', phone: '0901111111', partnerCode: null, status: 'active', expiresOn: '2026-12-31', usedSource: null, usedRefId: null, usedRefCode: null,
  usedBranch: null, usedOn: null, revokeReason: null, ...p,
});
const cart: CartLine[] = [
  { sku: 'BIOMIL', itemId: 'item-biomil', brandCode: 'BIO', qty: 2, amount: 600_000 },
  { sku: 'SUA330', itemId: 'item-330', brandCode: 'ABB', qty: 1, amount: 330_000 },
];
const ctx = (p: Partial<Parameters<typeof checkCode>[3]> = {}) => ({ phones: new Set(['0901111111']), customerCode: null, refId: 'o1', date: '2026-11-18', orderTotal: 930_000, cart, ...p });

describe('kiểm mã cho một đơn', () => {
  it('đúng khách, còn hạn → dùng được; tương đương tiền = cả đơn', () => {
    expect(checkCode('V1', code(), camp(), ctx())).toEqual({ applicableSkus: null });
  });
  it('khách khác → VOUCHER_NOT_OWNER; mã khách theo mã danh mục cũng nhận', () => {
    expect(checkCode('V1', code(), camp(), ctx({ phones: new Set(['0902222222']) }))).toMatchObject({ problem: { reason: 'VOUCHER_NOT_OWNER' } });
    expect(checkCode('V1', code({ partnerCode: 'KH-A' }), camp(), ctx({ phones: new Set(), customerCode: 'KH-A' }))).toEqual({ applicableSkus: null });
  });
  it('đã dùng ở đơn khác → VOUCHER_USED nêu đơn; đã dùng ở chính đơn này (gửi lại) → được', () => {
    const used = code({ status: 'used', usedRefId: 'o0', usedRefCode: 'HD2611000001', usedSource: 'pos', usedBranch: 'CN01', usedOn: '2026-11-17' });
    const r = checkCode('V1', used, camp(), ctx());
    expect(r).toMatchObject({ problem: { reason: 'VOUCHER_USED', usedIn: { refCode: 'HD2611000001', branch: 'CN01', date: '2026-11-17' } } });
    expect((r as { problem: { message: string } }).problem.message).toContain('HD2611000001');
    expect(checkCode('V1', { ...used, usedRefId: 'o1' }, camp(), ctx())).toEqual({ applicableSkus: null });
  });
  it('hết hạn / chưa tới ngày / thu hồi / đợt ngừng / không có mã', () => {
    expect(checkCode('V1', code({ expiresOn: '2026-11-10' }), camp(), ctx())).toMatchObject({ problem: { reason: 'VOUCHER_EXPIRED' } });
    expect(checkCode('V1', code(), camp({ validFrom: '2026-11-20' }), ctx())).toMatchObject({ problem: { reason: 'VOUCHER_EXPIRED' } });
    expect(checkCode('V1', code({ status: 'revoked', revokeReason: 'Trả hàng' }), camp(), ctx())).toMatchObject({ problem: { reason: 'VOUCHER_REVOKED' } });
    expect(checkCode('V1', code(), camp({ status: 'stopped' }), ctx())).toMatchObject({ problem: { reason: 'VOUCHER_REVOKED' } });
    expect(checkCode('V9', null, null, ctx())).toMatchObject({ problem: { reason: 'VOUCHER_NOT_FOUND' } });
  });
  it('đơn tối thiểu; lần mua sau chỉ khi giỏ có sản phẩm / nhãn áp dụng', () => {
    expect(checkCode('V1', code(), camp({ minOrder: 1_000_000 }), ctx())).toMatchObject({ problem: { reason: 'VOUCHER_MIN_ORDER' } });
    expect(checkCode('V1', code(), camp({ kind: 'next_purchase', itemIds: ['item-biomil'] }), ctx())).toEqual({ applicableSkus: ['BIOMIL'] });
    expect(checkCode('V1', code(), camp({ kind: 'next_purchase', brandCodes: ['ABB'] }), ctx())).toEqual({ applicableSkus: ['SUA330'] });
    expect(checkCode('V1', code(), camp({ kind: 'next_purchase', itemIds: ['item-khac'] }), ctx())).toMatchObject({ problem: { reason: 'VOUCHER_NOT_APPLICABLE' } });
  });
});

describe('tự phát lần mua sau', () => {
  const auto = camp({ id: 'c2', kind: 'next_purchase', issuer: 'tgs', itemIds: ['item-biomil'], issueMode: 'auto', autoRule: { itemIds: ['item-biomil'], brandCodes: [], minQty: 2, branches: [] } });
  it('mua 2 Biomil → đủ; 1 Biomil → chưa; khác cửa hàng / đợt ngừng → không', () => {
    expect(autoEligible([auto], { branch: 'CN01', date: '2026-11-18', cart }).map((c) => c.id)).toEqual(['c2']);
    expect(autoEligible([auto], { branch: 'CN01', date: '2026-11-18', cart: [{ ...cart[0]!, qty: 1 }] })).toEqual([]);
    expect(autoEligible([{ ...auto, autoRule: { ...auto.autoRule!, branches: ['CN02'] } }], { branch: 'CN01', date: '2026-11-18', cart })).toEqual([]);
    expect(autoEligible([{ ...auto, status: 'stopped' }], { branch: 'CN01', date: '2026-11-18', cart })).toEqual([]);
  });
  it('mã định theo đơn × đợt (gửi lại ra cùng mã); mã ngẫu nhiên 10 ký tự', () => {
    expect(autoCode('o1', 'c2')).toBe(autoCode('o1', 'c2'));
    expect(autoCode('o1', 'c2')).not.toBe(autoCode('o2', 'c2'));
    expect(autoCode('o1', 'c2')).toMatch(/^L[A-Z2-9]{9}$/);
    expect(randomCode()).toMatch(/^V[A-Z2-9]{9}$/);
  });
});

describe('hạn, SĐT, khuôn đợt', () => {
  it('hạn = sớm hơn giữa ngày phát + số ngày và ngày hết hạn đợt', () => {
    expect(expiryOf({ validTo: '2026-12-31', validDays: 30 }, '2026-11-18')).toBe('2026-12-17');
    expect(expiryOf({ validTo: '2026-11-30', validDays: 30 }, '2026-11-18')).toBe('2026-11-30');
    expect(expiryOf({ validTo: null, validDays: null }, '2026-11-18')).toBeNull();
    expect(displayStatus({ status: 'active', expiresOn: '2026-11-10' }, '2026-11-18')).toBe('expired');
  });
  it('SĐT chuẩn hoá +84 → 0; sai → rỗng', () => {
    expect(normalizePhone('+84 901 111 111')).toBe('0901111111');
    expect(normalizePhone('12345')).toBe('');
  });
  it('voucher hãng phải có hãng + hình thức thanh toán; lần mua sau phải có sản phẩm / nhãn; tự phát phải có điều kiện', () => {
    const base = campaignInput.parse({ code: 'X', name: 'X', kind: 'cash', issuer: 'brand', faceValue: 50_000, validFrom: '2026-11-18' });
    expect(campaignProblems(base)).toHaveLength(2);
    const np = campaignInput.parse({ code: 'Y', name: 'Y', kind: 'next_purchase', issuer: 'tgs', faceValue: 30_000, validFrom: '2026-11-18', issueMode: 'auto' });
    expect(campaignProblems(np)).toHaveLength(2);
  });
});
