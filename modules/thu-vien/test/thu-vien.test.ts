/** Logic thuần của màn Kho thư viện: điều kiện đọc bằng lời, độ tươi, sức khoẻ, ô Kiểm thử. */
import { describe, expect, it } from 'vitest';
import { attention, conditionText, freshnessDays, healthSummary, parseTestInput, shortHash, showValue } from '../web/lib/thu-vien';

describe('Kho thư viện — logic màn', () => {
  it('điều kiện khai báo đọc bằng lời', () => {
    expect(conditionText({ all: [{ field: 'item.payload.kind', op: 'eq', value: 'law' }, { field: 'input.override', op: 'eq', value: true }] }))
      .toBe('mục · payload.kind là "law" và ô nhập · override là true');
    expect(conditionText({ any: [{ field: 'input.op', op: 'in', value: ['create', 'update'] }, { not: { field: 'input.note', op: 'missing' } }] }))
      .toBe('(ô nhập · op thuộc "create", "update" hoặc không phải (ô nhập · note để trống))');
  });

  it('độ tươi và sức khoẻ', () => {
    expect(freshnessDays('2026-11-07', '2026-11-08')).toBe(1);
    expect(freshnessDays('x', '2026-11-08')).toBe(0);
    const list = [
      { id: 'a.b', kind: 'param', title: 'A', version: '1.0.0', released: '2026-11-07', contentHash: 'sha256:x', owner: 'o', count: 120, verified: 0 },
      { id: 'c.d', kind: 'calendar', title: 'C', version: '1.0.0', released: '2026-01-01', contentHash: 'sha256:y', owner: 'o', count: 10, verified: 10 },
    ];
    expect(healthSummary(list, '2026-11-08')).toEqual({ libraries: 2, items: 130, verified: 10, verifiedPct: 7.7, stale: 1, unverifiedLibs: 1 });
    expect(attention(list[0]!, '2026-11-08')).toEqual(['chưa mục nào được duyệt']);
    expect(attention(list[1]!, '2026-11-08')).toEqual(['bản cuối đã hơn 6 tháng']);
  });

  it('ô Kiểm thử dựng đúng input cho core.library.validate', () => {
    expect(parseTestInput(' LUONG_CO_SO ', '', false)).toBe('LUONG_CO_SO');
    expect(parseTestInput('LUONG_CO_SO', '2340000', false)).toEqual({ code: 'LUONG_CO_SO', value: 2340000 });
    expect(parseTestInput('BHXH_NLD', '8,5', true)).toEqual({ code: 'BHXH_NLD', value: 8.5, override: true });
    expect(parseTestInput('MOI', '{"n":1}', false)).toEqual({ code: 'MOI', fields: { n: 1 } });
  });

  it('hiện giá trị và băm', () => {
    expect(showValue(2340000)).toBe((2340000).toLocaleString('vi-VN'));
    expect(showValue(null)).toBe('—');
    expect(shortHash('sha256:bebd189444d9d90c6b043e34680b330d93e1527b284e2b2dca48a3d4f74d6d2e')).toBe('bebd18…6d2e');
  });
});
