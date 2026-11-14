// [2026-11-15 10:30 AM Võ Hoàng] NGHIEM-THU — NT-BH-018: hàm thuần thẻ Có hạn mức (chuyển từ BH12) (đóng góp)
import { describe, expect, it } from 'vitest';
import { emptyProgramForm, fromProgram, offerText, toProgramBody, type Program } from '../web/screens/khuyen-mai/han-muc.js';

const P: Program = {
  id: '7', code: 'KM-T11-LY', name: 'Mua sữa tặng ly', programKind: 'KM-CTY', mode: 'gift', sku: 'SUA330', skuName: 'Sữa 330', buyQty: 2, giftSku: 'LY01', giftSkuName: 'Ly',
  giftQty: 1, discountPct: null, discountAmount: null, salePrice: null, validFrom: '2026-11-01', validTo: '2026-11-30', isActive: true, state: 'running', version: 2, note: '',
  quotas: [{ branchCode: 'CN01', quotaQty: 10, usedQty: 4, remaining: 6 }, { branchCode: 'CN02', quotaQty: 5, usedQty: 0, remaining: 5 }], quotaTotal: 15, usedTotal: 4, remainingTotal: 11,
};

describe('NT-BH-018 — chương trình có hạn mức (thẻ Có hạn mức của BH18)', () => {
  it('nhãn ưu đãi như BH12', () => {
    expect(offerText(P)).toBe('Mua 2 tặng 1 Ly');
    expect(offerText({ ...P, mode: 'discount', discountPct: 10 })).toBe('Giảm 10%');
    expect(offerText({ ...P, mode: 'discount', discountAmount: 20_000 })).toBe('Giảm 20.000 đ / đơn vị');
    expect(offerText({ ...P, mode: 'discount', salePrice: 299_000 })).toBe('Giá chương trình 299.000 đ');
  });

  it('khứ hồi: chương trình → form → thân API giữ đủ ô, hạn mức từng cửa hàng', () => {
    const used = new Map([['CN01', 4]]);
    const { body, problems } = toProgramBody(fromProgram(P), used);
    expect(problems).toEqual([]);
    expect(body).toEqual({
      code: 'KM-T11-LY', name: 'Mua sữa tặng ly', programKind: 'KM-CTY', mode: 'gift', sku: 'SUA330', validFrom: '2026-11-01', validTo: '2026-11-30', isActive: true, note: '',
      buyQty: 2, giftSku: 'LY01', giftQty: 1, quotas: [{ branchCode: 'CN01', quotaQty: 10 }, { branchCode: 'CN02', quotaQty: 5 }],
    });
  });

  it('giảm giá: chỉ gửi đúng một ô mức giảm theo cách giảm; tặng chính hàng → giftSku null', () => {
    const f = { ...emptyProgramForm('discount', '2026-11-15'), code: 'XA-CAN-DATE', name: 'Xả cận date', sku: 'SUA330', discountWay: 'price' as const, discountValue: 250_000, quotas: { CN01: 20 } };
    const { body } = toProgramBody(f, new Map());
    expect(body).toMatchObject({ salePrice: 250_000, quotas: [{ branchCode: 'CN01', quotaQty: 20 }] });
    expect(body).not.toHaveProperty('discountPct');
    expect(toProgramBody({ ...emptyProgramForm('gift', '2026-11-15'), code: 'KM-X', name: 'x', sku: 'A' }, new Map()).body).toMatchObject({ giftSku: null, buyQty: 1, giftQty: 1 });
    expect(emptyProgramForm('gift', '2026-11-15')).toMatchObject({ validFrom: '2026-11-15', validTo: '2026-12-15' });
  });

  it('kiểm ở màn: thiếu ô, ngày ngược, % quá 100, hạ hạn mức dưới số đã dùng; cửa hàng đã dùng vẫn gửi dù đặt 0', () => {
    const bad = { ...fromProgram(P), code: 'A B', name: ' ', sku: '', validTo: '2026-10-01', quotas: { CN01: 2, CN02: 5 } };
    expect(toProgramBody(bad, new Map([['CN01', 4]])).problems).toEqual([
      'Mã chương trình: 2–64 ký tự, không dấu cách (vd KM-T11-LY)', 'Chưa nhập tên chương trình', 'Chưa chọn mặt hàng chính',
      'Thời gian: đến ngày phải từ ngày trở về sau', 'Hạn mức CN01 không được thấp hơn số đã dùng (4)',
    ]);
    expect(toProgramBody({ ...fromProgram(P), mode: 'discount', discountWay: 'pct', discountValue: 120 }, new Map()).problems).toEqual(['Phần trăm giảm không quá 100']);
    expect(toProgramBody({ ...fromProgram(P), quotas: { CN01: 4, CN02: 0 } }, new Map([['CN01', 4]])).body.quotas).toEqual([{ branchCode: 'CN01', quotaQty: 4 }]);
  });
});
