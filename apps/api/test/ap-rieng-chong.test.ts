// [2026-11-20 khanhtd] TRA-CUU — test dò chương trình áp riêng chồng nhau (cảnh báo ở form chính sách MH04) (đóng góp)
/** apRiengChong: theo phạm vi (NCC, nhãn, mã, chi nhánh, hiệu lực) — ai chồng ai, ở mã nào, thắng / thua theo ưu tiên. */
import { describe, expect, it } from 'vitest';
import { apRiengChong, uuTienDeThang, type Policy } from '@bizcity/mua-hang-domain';

const pol = (code: string, kind: Policy['kind'], rule: Record<string, unknown>, scope: Policy['scope'] = {}, priority = 0, o: Partial<Policy> = {}): Policy =>
  ({ id: code, code, kind, name: `CT ${code}`, scope: { partnerCode: 'N1', ...scope }, isActive: true, rule, priority, ...o });
const ex = { apply: 'exclusive' };
const codes = (r: ReturnType<typeof apRiengChong>) => r.map((x) => `${x.other.code}:${x.result}:${x.skus?.join('+') ?? '*'}`);

describe('Chồng áp riêng', () => {
  const ma = (code: string, skus: string[], pr = 0, rule: Record<string, unknown> = ex) => pol(code, 'item_discount', { items: skus.map((sku) => ({ sku, pct: 3 })), ...rule }, {}, pr);

  it('hai bảng CK theo mã áp riêng: chỉ báo mã trùng; ưu tiên quyết thắng / thua / ngang', () => {
    const p = ma('P', ['A', 'B', 'C'], 1);
    expect(codes(apRiengChong(p, [p, ma('Q', ['B', 'C', 'D'], 5), ma('R', ['A'], 0), ma('S', ['C'], 1), ma('T', ['X'], 9)])))
      .toEqual(['Q:thua:B+C', 'S:ngang:C', 'R:thang:A']);
  });

  it('ưu tiên vừa đủ thắng = lớn nhất của bên thua / ngang + 1', () => {
    const p = ma('P', ['A', 'B'], 1);
    expect(uuTienDeThang(p, apRiengChong(p, [ma('Q', ['A'], 5), ma('S', ['B'], 1)]))).toBe(6);
    expect(uuTienDeThang(p, apRiengChong(p, [ma('R', ['A'], 0)]))).toBeUndefined();
  });

  it('chính sách KHÔNG áp riêng: báo mã bị chương trình áp riêng khác chặn', () => {
    const p = pol('CK7', 'trade_discount', { pct: 7 });
    expect(codes(apRiengChong(p, [ma('MA3', ['A', 'B'])]))).toEqual(['MA3:bi-chan:A+B']);
    // chương trình KHÔNG áp riêng thì không chặn ai
    expect(apRiengChong(p, [ma('MA3', ['A'], 0, {})])).toEqual([]);
  });

  it('khác NCC, khác chi nhánh, lệch hiệu lực, đã tắt: không chồng', () => {
    const p = { ...ma('P', ['A']), scope: { partnerCode: 'N1', branchCodes: ['B1'] }, validFrom: '2026-01-01' };
    expect(apRiengChong(p, [
      { ...ma('N2', ['A']), scope: { partnerCode: 'N2' } },
      { ...ma('CN', ['A']), scope: { partnerCode: 'N1', branchCodes: ['B2'] } },
      { ...ma('CU', ['A']), validTo: '2025-12-31' },
      { ...ma('TAT', ['A']), isActive: false },
    ])).toEqual([]);
    // chi nhánh trống = mọi chi nhánh → vẫn chồng
    expect(codes(apRiengChong(p, [ma('MOI', ['A'])]))).toEqual(['MOI:ngang:A']);
  });

  it('CK trên đơn áp riêng không ghi mã chồng cả phạm vi; nhãn khác thì không chồng; mã thuộc nhãn khác bị loại', () => {
    const don = (code: string, brandCode?: string) => pol(code, 'trade_discount', { pct: 2, ...ex }, brandCode ? { brandCode } : {});
    const p = don('P', 'TH');
    expect(codes(apRiengChong(p, [don('Q', 'TH')]))).toEqual(['Q:ngang:*']);
    expect(apRiengChong(p, [don('Q', 'VNM')])).toEqual([]);
    const brandOf = (s: string) => ({ A: 'TH', B: 'VNM' })[s];
    expect(codes(apRiengChong(p, [ma('MA', ['A', 'B'])], brandOf))).toEqual(['MA:ngang:A']);
  });

  it('mua X tặng Y: chỉ dòng áp riêng tính là áp riêng', () => {
    const km = pol('KM', 'promo_gift', { items: [{ sku: 'A', buyQty: 5, getQty: 1, apply: 'exclusive' }, { sku: 'B', buyQty: 5, getQty: 1 }] });
    const p = ma('P', ['A', 'B']);
    expect(codes(apRiengChong(p, [km]))).toEqual(['KM:ngang:A']);
  });
});
