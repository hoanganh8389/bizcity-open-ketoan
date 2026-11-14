// [2026-11-13 11:55 PM Võ Hoàng] NGHIEM-THU — NT-BH-015: hàm thuần phiếu bán / trả nhập tay (đóng góp)
import { describe, expect, it } from 'vitest';
import { computeDoc, formatNo, overReturn, periodOf, returnableBySku, toLedgerDoc, type CatalogItem, type DocInput } from '../api/domain/doc.js';

const catalog = new Map<string, CatalogItem>([['SUA330', { sku: 'SUA330', name: 'Sữa 330', unit: 'Hộp', taxCode: 'R08', itemId: null }]]);
const ctx = { catalog, taxRates: new Map([['R08', 8], ['KCT', 0]]), methods: new Set(['TM', 'CK']), partner: { code: 'KH001', name: 'Đại lý An', taxCode: null } };
const input = (over: Partial<DocInput> = {}): DocInput => ({ docDate: '2026-11-13', branchCode: 'CN01', partner: { code: 'KH001' }, lines: [{ lineKey: 'L1', sku: 'SUA330', qty: 2, unitPrice: 300_000 }], ...over });

describe('computeDoc', () => {
  it('tính lại ở máy chủ: tiền = SL × đơn giá − chiết khấu, thuế theo mã thuế danh mục; tên / ĐVT lấy theo danh mục', () => {
    const { body, problems } = computeDoc(input({ lines: [{ lineKey: 'L1', sku: 'SUA330', qty: 2, unitPrice: 300_000, discount: 10_000 }] }), ctx);
    expect(problems).toEqual([]);
    expect(body.lines[0]).toMatchObject({ name: 'Sữa 330', unit: 'Hộp', taxCode: 'R08', amountBeforeTax: 590_000, taxAmount: 47_200 });
    expect(body.totals).toEqual({ beforeTax: 590_000, tax: 47_200, total: 637_200 });
  });
  it('quà: tiền 0; thu đủ không cần khách; ghi nợ thiếu khách → lỗi', () => {
    const gift = computeDoc(input({ lines: [{ lineKey: 'L1', sku: 'SUA330', qty: 1, unitPrice: 300_000, isGift: true }] }), ctx);
    expect(gift.body.totals.total).toBe(0);
    const paid = computeDoc(input({ partner: undefined, payments: [{ methodCode: 'TM', amount: 648_000 }] }), { ...ctx, partner: null });
    expect(paid.problems).toEqual([]);
    const debt = computeDoc(input({ partner: undefined }), { ...ctx, partner: null });
    expect(debt.problems).toEqual(['Phiếu còn ghi nợ (thu chưa đủ) phải chọn khách hàng']);
  });
  it('báo đủ lỗi một lần: mã lạ, chưa có thuế, hình thức lạ, thu quá tổng, khoá dòng trùng', () => {
    const { problems } = computeDoc(input({
      lines: [{ lineKey: 'L1', sku: 'LA', qty: 1, unitPrice: 1 }, { lineKey: 'L1', sku: 'SUA330', qty: 1, unitPrice: 1 }],
      payments: [{ methodCode: 'XX', amount: 1_000_000 }],
    }), ctx);
    expect(problems.join(' | ')).toMatch(/Dòng 1 \(LA\): mã hàng không có.*chưa khai thuế đầu ra.*Khoá dòng L1 bị trùng.*XX.*lớn hơn tổng phiếu/);
  });
});

describe('số phiếu, trả hàng, chứng từ nộp sổ', () => {
  it('số theo tháng: BH / TL + yyMM + 6 số', () => {
    expect(periodOf('2026-11-13')).toBe('2611');
    expect(formatNo('sale', '2611', 1)).toBe('BH2611000001');
    expect(formatNo('sale_return', '2611', 42)).toBe('TL2611000042');
    expect(() => formatNo('sale', '2611', 1_000_000)).toThrow();
  });
  it('còn trả được = đã bán − đã trả; trả vượt → câu lỗi theo mã', () => {
    const left = returnableBySku([{ sku: 'A', qty: 3 }, { sku: 'A', qty: 1 }], [{ sku: 'A', qty: 1 }]);
    expect(left.get('A')).toBe(3);
    expect(overReturn([{ sku: 'A', qty: 3 }], left)).toEqual([]);
    expect(overReturn([{ sku: 'A', qty: 4 }, { sku: 'B', qty: 1 }], left)).toEqual(['A: trả 4, còn trả được 3', 'B: trả 1, còn trả được 0']);
  });
  it('chứng từ nộp: khoá phieu-ban:<id>, phiên bản, kho trên từng dòng, phiếu trả mang originalDocKey; không có số tài khoản', () => {
    const { body } = computeDoc(input({ warehouseCode: 'K01' }), ctx);
    const doc = toLedgerDoc({ docId: 'abc', kind: 'sale_return', branchCode: 'CN01', docNo: 'TL2611000001', docDate: '2026-11-13', body, version: 2, originalDocId: 'goc', catalog });
    expect(doc).toMatchObject({ docType: 'sale_return', docKey: 'phieu-ban:abc', version: 2, originalDocKey: 'phieu-ban:goc', partner: { code: 'KH001' } });
    expect(doc.lines[0]).toMatchObject({ warehouseCode: 'K01', amountBeforeTax: 600_000, taxAmount: 48_000 });
    expect(JSON.stringify(doc)).not.toMatch(/"(debit|credit)Account"|1311|5111/);
  });
});
