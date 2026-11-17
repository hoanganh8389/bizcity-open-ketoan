// [2026-11-18 Võ Hoàng] NGHIEM-THU — NT-BH-026: tiền trừ voucher TGS / hãng trên đơn máy bán (đóng góp)
import { describe, expect, it } from 'vitest';
import { planDiscounts, planPayments, type QuotedVoucher } from '../api/domain/voucher.js';

const v = (p: Partial<QuotedVoucher>): QuotedVoucher => ({ code: 'V1', campaignId: 'c1', campaignName: 'Đợt', issuer: 'tgs', faceValue: 20_000, paymentMethodCode: null, applicableSkus: null, ...p });
const lines = [{ sku: 'A', gross: 30_000, paid: true }, { sku: 'B', gross: 10_000, paid: true }, { sku: 'Q', gross: 0, paid: false }];

describe('voucher TGS = chiết khấu chia vào dòng', () => {
  it('chia theo thành tiền, tổng đúng tiền voucher; nhiều voucher cộng dồn', () => {
    const r = planDiscounts(lines, [v({}), v({ code: 'V2', faceValue: 8_000 })]);
    expect(r).toMatchObject({ uses: [{ code: 'V1', amount: 20_000, kind: 'discount' }, { code: 'V2', amount: 8_000 }] });
    expect((r as { shares: number[] }).shares).toEqual([21_000, 7_000, 0]);
  });
  it('mệnh giá lớn hơn đơn → trừ hết đơn, phần dư mất; mã sau không còn gì → báo', () => {
    expect(planDiscounts(lines, [v({ faceValue: 50_000 })])).toMatchObject({ uses: [{ amount: 40_000 }] });
    expect(planDiscounts(lines, [v({ faceValue: 50_000 }), v({ code: 'V2' })])).toMatchObject({ problem: { code: 'V2' } });
  });
  it('lần mua sau: chỉ trừ ở dòng áp dụng', () => {
    const r = planDiscounts(lines, [v({ faceValue: 30_000, applicableSkus: ['B'] })]);
    expect(r).toMatchObject({ uses: [{ amount: 10_000 }], shares: [0, 10_000, 0] });
  });
});

describe('voucher hãng = dòng thanh toán', () => {
  it('khách A mã 50K cho đơn 30K → trừ 30K, phần dư mất', () => {
    expect(planPayments([{ sku: 'A', gross: 30_000, paid: true }], 30_000, [v({ issuer: 'brand', faceValue: 50_000, paymentMethodCode: 'VC-ABBOTT' })]))
      .toEqual({ uses: [{ code: 'V1', campaignId: 'c1', campaignName: 'Đợt', issuer: 'brand', kind: 'payment', faceValue: 50_000, amount: 30_000, methodCode: 'VC-ABBOTT' }] });
  });
  it('không có hình thức thanh toán / đơn đã trừ hết → báo', () => {
    expect(planPayments(lines, 40_000, [v({ issuer: 'brand' })])).toMatchObject({ problem: { code: 'V1' } });
    expect(planPayments(lines, 40_000, [v({ issuer: 'brand', faceValue: 40_000, paymentMethodCode: 'X' }), v({ code: 'V2', issuer: 'brand', paymentMethodCode: 'X' })]))
      .toMatchObject({ problem: { code: 'V2' } });
  });
});
