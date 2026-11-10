// [2026-11-10 02:00 PM Nguyễn Văn Thủy] PHASE-026 — quy tắc định khoản: đề xuất / duyệt / hiệu lực theo ngày / nghiệp vụ tự tạo / đụng quy tắc (đóng góp)
/**
 * Bảng quy tắc định khoản (0096) quyết tài khoản trên bút toán THẬT:
 *   - chưa có quy tắc → sổ y như trước; quy tắc chờ duyệt chưa áp;
 *   - quy tắc đã duyệt áp cho chứng từ từ ngày hiệu lực, chứng từ trước ngày đó giữ tài khoản cũ;
 *   - quy tắc cụ thể hơn (thêm điều kiện hàng tặng / chương trình…) thắng quy tắc chung;
 *   - hai quy tắc ngang hàng bị chặn ngay lúc đề xuất;
 *   - nghiệp vụ tự tạo nhận chứng từ theo lý do riêng và thắng nghiệp vụ hệ thống;
 *   - bản sửa đóng bản cũ ở ngày hiệu lực của nó; ngừng áp đóng quy tắc.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { sql } from 'kysely';
import { db } from '../src/db/client.js';
import { applyRuleTable, findTies, pickRule, type PostingRule, type RuleTable } from '@bizcity/kernel/modules/posting/rule-table';
import { call, saleDoc, setupTenant, type TestCtx } from './helpers.js';

let ctx: TestCtx;
let tenantId = '';
const today = new Date().toISOString().slice(0, 10);
const addDays = (d: string, n: number) => new Date(new Date(`${d}T00:00:00Z`).getTime() + n * 86400000).toISOString().slice(0, 10);

beforeAll(async () => {
  ctx = await setupTenant();
  tenantId = (await db.selectFrom('tenants').select('id').where('code', '=', ctx.tenantCode).executeTakeFirstOrThrow()).id;
});
afterAll(async () => { await ctx.app.close(); });

type Sim = { entries: { part: string; group: string; debit: { auto: string; account: string }; credit: { auto: string; account: string }; ruleId: string | null }[]; errors: string[]; context: Record<string, unknown> };
const simulate = async (body: Record<string, unknown>) => {
  const r = await call<{ data: Sim }>(ctx, 'POST', '/api/v1/posting-rules/simulate', body);
  expect(r.status, JSON.stringify(r.body)).toBe(200);
  return r.body.data;
};
/** Tài khoản chi tiết khác `not` có tiền tố `prefix` (để quy tắc đổi sang). */
const otherAccount = async (prefix: string, not: string) => (await sql<{ code: string }>`
  SELECT code FROM accounts WHERE tenant_id = ${tenantId} AND is_posting AND is_active AND code LIKE ${`${prefix}%`} AND code <> ${not} ORDER BY code LIMIT 1`.execute(db)).rows[0]?.code;

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

describe('Quy tắc định khoản trên bút toán thật', () => {
  let ruleId = '';
  let newRevenue = '';
  let autoRevenue = '';

  it('nghiệp vụ hệ thống có sẵn; chưa có quy tắc thì chạy thử ra tài khoản tự tra', async () => {
    const biz = (await call<{ data: { code: string; isSystem: boolean }[] }>(ctx, 'GET', '/api/v1/posting-rules/businesses')).body.data;
    expect(biz.map((b) => b.code)).toEqual(expect.arrayContaining(['sale', 'sale_return', 'purchase', 'transfer', 'stock_decrease', 'customer_payment']));
    const s = await simulate({ business: 'sale', taxCode: 'R08' });
    expect(s.errors).toEqual([]);
    const goods = s.entries.find((e) => e.part === 'goods')!;
    expect(goods.ruleId).toBeNull();
    expect(goods.credit.account).toBe(goods.credit.auto);
    autoRevenue = goods.credit.auto;
    newRevenue = (await otherAccount('511', autoRevenue))!;
    expect(newRevenue).toBeTruthy();
  });

  it('đề xuất → chưa áp; trùng đề xuất ngang hàng bị chặn; duyệt → chạy thử ra tài khoản mới', async () => {
    const p = await call<{ data: { id: string; state: string } }>(ctx, 'POST', '/api/v1/posting-rules', { business: 'sale', part: 'goods', credit: newRevenue, from: today, note: 'Doanh thu theo quy tắc' });
    expect(p.status, JSON.stringify(p.body)).toBe(200);
    ruleId = p.body.data.id;
    expect(p.body.data.state).toBe('draft');
    expect((await simulate({ business: 'sale', taxCode: 'R08' })).entries.find((e) => e.part === 'goods')!.credit.account).toBe(autoRevenue);
    // Thử đề xuất trước khi duyệt: thấy tài khoản mới.
    expect((await simulate({ business: 'sale', taxCode: 'R08', draftId: ruleId })).entries.find((e) => e.part === 'goods')!.credit.account).toBe(newRevenue);
    expect((await call(ctx, 'POST', `/api/v1/posting-rules/${ruleId}/approve`, {})).status).toBe(200);
    const dup = await call<{ error: { message: string } }>(ctx, 'POST', '/api/v1/posting-rules', { business: 'sale', part: 'goods', credit: autoRevenue, from: today });
    expect(dup.status).toBe(400);
    expect(JSON.stringify(dup.body)).toContain('Đụng quy tắc');
    const s = await simulate({ business: 'sale', taxCode: 'R08' });
    const goods = s.entries.find((e) => e.part === 'goods')!;
    expect(goods.credit.account).toBe(newRevenue);
    expect(goods.ruleId).toBe(ruleId);
  });

  it('chứng từ từ ngày hiệu lực ghi theo quy tắc; chứng từ trước ngày đó giữ tài khoản cũ', async () => {
    const lastYear = addDays(today, -400);
    expect([200, 201]).toContain((await call(ctx, 'POST', '/api/v1/documents', saleDoc({ docKey: 'pos:CN01:QT-OLD', docNo: 'QT-OLD', docDate: lastYear, invoice: undefined }))).status);
    expect([200, 201]).toContain((await call(ctx, 'POST', '/api/v1/documents', saleDoc({ docKey: 'pos:CN01:QT-NEW', docNo: 'QT-NEW', docDate: today, invoice: undefined }))).status);
    const credit = async (docNo: string) => (await sql<{ account_code: string; dims: Record<string, unknown> | null }>`
      SELECT l.account_code, l.dims FROM ledger_lines l JOIN ledger_entries e ON e.id = l.entry_id
       WHERE e.tenant_id = ${tenantId} AND e.doc_no = ${docNo} AND e.status = 'posted' AND l.part = 'goods' AND l.credit > 0 AND l.product_sku = 'SUA01'`.execute(db)).rows[0];
    const oldLine = await credit('QT-OLD');
    const newLine = await credit('QT-NEW');
    expect(oldLine?.account_code).toBe(autoRevenue);
    expect(newLine?.account_code).toBe(newRevenue);
    expect(newLine?.dims?.postingRule).toBe(ruleId);
  });

  it('quy tắc cụ thể hơn (hàng tặng) thắng quy tắc chung của cùng khoản', async () => {
    const giftCogs = (await otherAccount('64', ''))!;
    const p = await call<{ data: { id: string } }>(ctx, 'POST', '/api/v1/posting-rules', { business: 'sale', part: 'cogs', cond: { gift: true }, debit: giftCogs, from: today, note: 'Quà công ty tặng vào chi phí' });
    expect(p.status, JSON.stringify(p.body)).toBe(200);
    expect((await call(ctx, 'POST', `/api/v1/posting-rules/${p.body.data.id}/approve`, {})).status).toBe(200);
    const gift = (await simulate({ business: 'sale', gift: true })).entries.find((e) => e.part === 'cogs')!;
    expect(gift.debit.account).toBe(giftCogs);
    const normal = (await simulate({ business: 'sale' })).entries.find((e) => e.part === 'cogs')!;
    expect(normal.debit.account).toBe(normal.debit.auto);
  });

  it('nghiệp vụ tự tạo: thêm lý do, chứng từ theo lý do đó đi quy tắc riêng', async () => {
    const b = await call<{ data: { code: string; reasonCode: string } }>(ctx, 'POST', '/api/v1/posting-rules/businesses', { name: 'Xuất quà tặng nhà cung cấp', baseCode: 'stock_decrease', reasonCode: 'xqncc' });
    expect(b.status, JSON.stringify(b.body)).toBe(200);
    expect(b.body.data.code).toBe('XQNCC');
    const reason = (await sql<{ kind: string }>`SELECT kind FROM posting_reasons WHERE tenant_id = ${tenantId} AND code = 'XQNCC'`.execute(db)).rows[0];
    expect(reason?.kind).toBe('out');
    const before = (await simulate({ business: 'XQNCC' })).entries.find((e) => e.part === 'goods')!;
    const target = (await otherAccount('64', before.debit.auto))!;
    const p = await call<{ data: { id: string } }>(ctx, 'POST', '/api/v1/posting-rules', { business: 'XQNCC', part: 'goods', debit: target, from: today });
    expect(p.status, JSON.stringify(p.body)).toBe(200);
    expect((await call(ctx, 'POST', `/api/v1/posting-rules/${p.body.data.id}/approve`, {})).status).toBe(200);
    expect((await simulate({ business: 'XQNCC' })).entries.find((e) => e.part === 'goods')!.debit.account).toBe(target);
    // Nghiệp vụ hệ thống không đổi.
    expect((await simulate({ business: 'stock_decrease' })).entries.find((e) => e.part === 'goods')!.debit.account).toBe(before.debit.auto);
  });

  it('bản sửa đóng bản cũ ở ngày hiệu lực của nó; quy tắc đã duyệt không xoá được; ngừng áp', async () => {
    const tomorrow = addDays(today, 1);
    const fix = await call<{ data: { id: string } }>(ctx, 'POST', '/api/v1/posting-rules', { business: 'sale', part: 'goods', credit: autoRevenue, from: tomorrow, replacesId: ruleId, changeReason: 'Trả lại tài khoản cũ' });
    expect(fix.status, JSON.stringify(fix.body)).toBe(200);
    expect((await call(ctx, 'POST', `/api/v1/posting-rules/${fix.body.data.id}/approve`, {})).status).toBe(200);
    const old = (await sql<{ effective_to: string }>`SELECT effective_to::text FROM posting_rules WHERE id = ${ruleId}`.execute(db)).rows[0];
    expect(old?.effective_to).toBe(tomorrow);
    expect((await simulate({ business: 'sale', date: today })).entries.find((e) => e.part === 'goods')!.credit.account).toBe(newRevenue);
    expect((await simulate({ business: 'sale', date: tomorrow })).entries.find((e) => e.part === 'goods')!.credit.account).toBe(autoRevenue);
    expect((await call(ctx, 'DELETE', `/api/v1/posting-rules/${ruleId}`)).status).toBe(400);
    const stop = await call(ctx, 'POST', `/api/v1/posting-rules/${fix.body.data.id}/stop`, { from: addDays(today, 5), reason: 'Thử ngừng' });
    expect(stop.status, JSON.stringify(stop.body)).toBe(200);
    expect((await simulate({ business: 'sale', date: addDays(today, 6) })).entries.find((e) => e.part === 'goods')!.ruleId).toBeNull();
  });

  it('kiểm khai báo: khoản không có ở nghiệp vụ, điều kiện không dùng được, tài khoản tổng hợp', async () => {
    expect((await call(ctx, 'POST', '/api/v1/posting-rules', { business: 'customer_payment', part: 'goods', debit: '1111', from: today })).status).toBe(400);
    expect((await call(ctx, 'POST', '/api/v1/posting-rules', { business: 'customer_payment', part: 'payment', cond: { gift: true }, debit: '1111', from: today })).status).toBe(400);
    const parent = (await sql<{ code: string }>`SELECT code FROM accounts WHERE tenant_id = ${tenantId} AND NOT is_posting ORDER BY code LIMIT 1`.execute(db)).rows[0]?.code;
    if (parent) expect((await call(ctx, 'POST', '/api/v1/posting-rules', { business: 'sale', part: 'tax', credit: parent, from: today })).status).toBe(400);
  });
});
