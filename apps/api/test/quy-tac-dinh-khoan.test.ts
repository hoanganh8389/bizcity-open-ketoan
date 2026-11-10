// [2026-11-10 02:00 PM Nguyễn Văn Thủy] PHASE-026 — quy tắc định khoản: hàm chọn / kiểm đụng / áp lên bút toán (đóng góp)
// [2026-11-11 Nguyễn Văn Thủy] PHASE-026 — bỏ ACC92: chỉ còn phần thuần của lõi; dòng thêm ở ACC41 kiểm ở tai-khoan-ngam-dinh.test.ts (đóng góp)
/**
 * Hàm chọn dòng định khoản của lõi (rule-table.ts): cụ thể hơn thắng, nghiệp vụ phân hệ tự khai thắng nghiệp vụ hệ thống,
 * hết hiệu lực bỏ qua; kiểm đụng; áp lên bút toán đã đổi bên.
 */
import { describe, expect, it } from 'vitest';
import { applyRuleTable, findTies, pickRule, type PostingRule, type RuleTable } from '@bizcity/kernel/modules/posting/rule-table';

describe('Hàm chọn quy tắc (thuần)', () => {
  const rule = (id: string, cond: PostingRule['cond'], over: Partial<PostingRule> = {}): PostingRule => ({ id, business: 'sale', part: 'goods', book: 'all', cond, debit: null, credit: `C${id}`, priority: 0, from: '2026-01-01', to: null, ...over });
  const table = (rules: PostingRule[]): RuleTable => ({ rules, businesses: [{ code: 'XQ', name: 'X', baseCode: 'sale', reasonCode: 'XQ' }], itemTypes: new Map(), programKinds: new Map([['CT1', 'KM-NCC']]) });

  it('cụ thể hơn thắng; nghiệp vụ tự tạo thắng hệ thống; hết hiệu lực thì bỏ qua', () => {
    const t = table([rule('1', {}), rule('2', { gift: true }), rule('3', { programKind: 'KM-NCC', gift: true }), rule('4', {}, { business: 'XQ' }), rule('5', { gift: true }, { to: '2026-01-02', priority: 9 })]);
    const ctxGift = { gift: true, programKind: 'KM-NCC' };
    expect(pickRule(t, { biz: 'sale', part: 'goods', book: 'internal', date: '2026-05-01', ctx: ctxGift }).rule?.id).toBe('3');
    expect(pickRule(t, { biz: 'sale', part: 'goods', book: 'internal', date: '2026-05-01', ctx: { gift: true } }).rule?.id).toBe('2');
    expect(pickRule(t, { biz: 'sale', part: 'goods', book: 'internal', date: '2026-05-01', ctx: {} }).rule?.id).toBe('1');
    expect(pickRule(t, { biz: 'sale', reason: 'XQ', part: 'goods', book: 'internal', date: '2026-05-01', ctx: ctxGift }).rule?.id).toBe('4');
    expect(pickRule(t, { biz: 'sale', part: 'tax', book: 'internal', date: '2026-05-01', ctx: {} }).rule).toBeNull();
  });

  it('đụng: cùng số điều kiện, cùng ưu tiên, có thể cùng khớp; khác giá trị thì không đụng', () => {
    const a = rule('1', { method: 'TM' });
    expect(findTies(rule('9', { taxCode: 'R08' }), [a])).toHaveLength(1); // TM + R08 cùng khớp
    expect(findTies(rule('9', { method: 'CK' }), [a])).toHaveLength(0);
    expect(findTies(rule('9', { method: 'TM' }, { priority: 1 }), [a])).toHaveLength(0);
    expect(findTies(rule('9', { method: 'TM' }, { from: '2027-01-01' }), [{ ...a, to: '2026-06-01' }])).toHaveLength(0);
  });

  it('số âm đã đổi bên: Nợ của quy tắc vào đúng dòng; tài khoản không theo dõi đối tượng thì bỏ đối tượng', () => {
    const lines = [
      { accountCode: '5111', debit: 100, credit: 0, pairNo: 1, part: 'goods' as const, partnerId: 'p1', ruleTags: { biz: 'sale', swapped: true } },
      { accountCode: '131', debit: 0, credit: 100, pairNo: 1, part: 'goods' as const, partnerId: 'p1', ruleTags: { biz: 'sale', swapped: true } },
    ];
    const r = applyRuleTable(lines, table([rule('1', {}, { debit: '1311', credit: '5113' })]), { date: '2026-05-01', tracksPartner: (c) => c.startsWith('13') });
    expect(r.lines[0]!.accountCode).toBe('5113'); // dòng Nợ thật = Có của quy tắc (đã đổi bên)
    expect(r.lines[1]!.accountCode).toBe('1311');
    expect(r.lines[0]!.partnerId).toBeNull();
    expect(r.lines[0]!.dims).toEqual({ postingRule: '1' });
    expect('ruleTags' in r.lines[0]!).toBe(false);
  });
});
