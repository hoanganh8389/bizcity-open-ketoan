/** Logic thuần của TC01 Tra chính sách theo mã hàng: đọc số kiểu Việt Nam, tham số gửi máy chủ, câu tóm tắt, nguồn đơn giá, đếm trạng thái. */
import { describe, expect, it } from 'vitest';
import { EMPTY_FORM, countBy, lookupQuery, parseNum, priceNote, summaryText, type TraResult, type TraRow } from '../web/lib/tra-chinh-sach';

const input = (o: Partial<TraResult['input']> = {}): TraResult['input'] => ({ partnerCode: 'N1', qty: 10, unit: 'Lon', price: 100_000, priceSource: 'gia-mua', priceIncludesVat: false, date: '2026-11-20', branchCode: '', ...o });

describe('TC01 — ô nhập và tham số', () => {
  it('đọc số kiểu Việt Nam: dấu chấm ngăn nghìn, dấu phẩy thập phân', () => {
    expect(parseNum('1.000')).toBe(1000);
    expect(parseNum('1,5')).toBe(1.5);
    expect(parseNum('100000')).toBe(100000);
    expect(parseNum('')).toBeUndefined();
    expect(parseNum('abc')).toBeUndefined();
    expect(parseNum('-3')).toBeUndefined();
  });

  it('chưa chọn mã → chưa tra; ô trống không gửi (máy chủ tự chọn)', () => {
    expect(lookupQuery(EMPTY_FORM)).toBeNull();
    expect(lookupQuery({ ...EMPTY_FORM, sku: ' A ' })).toEqual({ sku: 'A', qty: 1 });
    expect(lookupQuery({ ...EMPTY_FORM, sku: 'A', partnerCode: 'N1', qty: '24', unit: 'Thùng', price: '0', branchCode: 'CN1', date: '2026-11-01' }))
      .toEqual({ sku: 'A', partnerCode: 'N1', qty: 24, unit: 'Thùng', price: 0, branchCode: 'CN1', date: '2026-11-01' });
  });
});

describe('TC01 — kết quả', () => {
  it('tóm tắt phiếu thử: chỉ nêu khoản có', () => {
    const t = { gross: 1_000_000, lineDiscount: 30_000, orderDiscount: 0, after: 970_000, realUnitCost: 97_000, gifts: [] };
    expect(summaryText({ input: input(), total: t })).toBe('10 Lon × 100.000 = 1.000.000 · CK dòng −30.000 · sau CK 970.000 · giá vốn thực tế 97.000 / Lon');
  });

  it('nguồn đơn giá: không có giá mua thì nhắc nhập giá', () => {
    expect(priceNote(input({ priceSource: 'nhap' }))).toBe('Đơn giá bạn nhập');
    expect(priceNote(input({ priceIncludesVat: true }))).toContain('gồm VAT');
    expect(priceNote(input({ priceSource: 'khong-co' }))).toContain('nhập đơn giá');
  });

  it('đếm theo trạng thái', () => {
    const r = (status: TraRow['status']) => ({ status }) as TraRow;
    expect(countBy([r('ap'), r('ap'), r('bi-chan')])).toEqual({ ap: 2, 'chua-du': 0, 'bi-chan': 1, 'khong-dung': 0 });
  });
});
