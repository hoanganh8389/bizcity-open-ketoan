// [2026-11-10 09:00 PM Nguyễn Văn Thủy] PHASE-026 — thiết kế hạch toán: lý do theo màn, sơ đồ dây chuyền, đổi nhóm hạch toán hàng loạt (đóng góp)
/**
 * Sơ đồ dây chuyền (ACC90) phải ra ĐÚNG tài khoản mà định khoản thật dùng: đổi cấu hình ở sơ đồ là đổi bút toán thật.
 * Lý do theo màn: màn đã gán chỉ trả các lý do đó; chưa gán thì lọc theo loại như cũ. Đổi nhóm hạch toán hàng loạt.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { sql } from 'kysely';
import { db } from '../src/db/client.js';
import { call, saleDoc, setupTenant, type TestCtx } from './helpers.js';

let ctx: TestCtx;
let tenantId = '';
beforeAll(async () => {
  ctx = await setupTenant();
  tenantId = (await db.selectFrom('tenants').select('id').where('code', '=', ctx.tenantCode).executeTakeFirstOrThrow()).id;
});
afterAll(async () => { await ctx.app.close(); });

type Side = { account: string | null; from: { source: string; field: string } | null; chain: { source: string; value: string | null }[] };
type Flow = { entries: { key: string; amount: number; debit: Side; credit: Side }[]; totals: { debit: number; credit: number; balanced: boolean }; missing: string[]; sources: { id: string }[] };
const flow = async (q: string) => { const r = await call<{ data: Flow }>(ctx, 'GET', `/api/v1/posting-flow/flow?${q}`); expect(r.status).toBe(200); return r.body.data; };

describe('Sơ đồ dây chuyền khớp định khoản thật', () => {
  it('bán hàng: tiền hàng, thuế, thu tiền ra đúng tài khoản bút toán thật', async () => {
    const posted = await call(ctx, 'POST', '/api/v1/documents', saleDoc({ docDate: new Date().toISOString().slice(0, 10) }));
    expect([200, 201]).toContain(posted.status);
    const lines = (await sql<{ part: string; account_code: string; debit: string; credit: string }>`
      SELECT l.part, l.account_code, l.debit::text, l.credit::text FROM ledger_lines l JOIN ledger_entries e ON e.id = l.entry_id
       WHERE e.tenant_id = ${tenantId} AND e.doc_no IN ('HD0001') AND e.status = 'posted' AND l.product_sku IS DISTINCT FROM 'QUA01'`.execute(db)).rows;
    const real = (part: string, side: 'debit' | 'credit') => lines.find((l) => l.part === part && Number(l[side]) > 0)?.account_code;
    const f = await flow('screen=sale&taxCode=R08&method=TM');
    const e = (k: string) => f.entries.find((x) => x.key === k)!;
    expect(e('goods').debit.account).toBe(real('goods', 'debit'));
    expect(e('goods').credit.account).toBe(real('goods', 'credit'));
    expect(e('tax').credit.account).toBe(real('tax', 'credit'));
    // Thu tiền là bút toán riêng (số phiếu thu) — so tài khoản tiền.
    const pay = (await sql<{ account_code: string }>`SELECT l.account_code FROM ledger_lines l JOIN ledger_entries e ON e.id = l.entry_id
      WHERE e.tenant_id = ${tenantId} AND e.doc_type = 'customer_payment' AND l.part = 'payment' AND l.debit > 0 LIMIT 1`.execute(db)).rows[0]?.account_code;
    if (pay) expect(e('payment').debit.account).toBe(pay);
    expect(f.totals.balanced).toBe(true);
    expect(f.totals.debit).toBe(f.totals.credit);
  });

  it('nguồn được dùng là nguồn đầu tiên có giá trị; lý do bỏ trống TK doanh thu thì lấy theo nhóm hạch toán', async () => {
    const f = await flow('screen=sale&taxCode=R08');
    const goods = f.entries.find((x) => x.key === 'goods')!;
    expect(goods.credit.chain.map((c) => c.source)).toEqual(['reason', 'group']);
    const first = goods.credit.chain.find((c) => c.value)!;
    expect(goods.credit.from?.source).toBe(first.source);
    // Bỏ TK doanh thu của lý do bán mặc định → sơ đồ chuyển sang nhóm hạch toán.
    const reasons = (await call<{ data: { code: string; name: string; kind: string; counterAccount: string | null; revenueAccount: string | null; expenseAccount: string | null; flags: Record<string, unknown>; isActive: boolean }[] }>(ctx, 'GET', '/api/v1/posting/reasons')).body.data;
    const xba = reasons.find((r) => r.flags?.default === 'sale')!;
    const put = await call(ctx, 'PUT', `/api/v1/posting/reasons/${xba.code}`, { name: xba.name, kind: xba.kind, counterAccount: xba.counterAccount ?? '', revenueAccount: '', expenseAccount: xba.expenseAccount ?? '', flags: xba.flags, isActive: true });
    expect(put.status).toBe(200);
    const g = (await flow('screen=sale&taxCode=R08')).entries.find((x) => x.key === 'goods')!;
    expect(g.credit.from?.source).toBe('group');
  });

  it('mua hàng, trả NCC, điều chỉnh kho, thu, chi đều cân Nợ = Có', async () => {
    for (const s of ['purchase', 'purchase_return', 'stock_increase', 'stock_decrease', 'cash_receipt', 'cash_payment', 'sale_return', 'transfer']) {
      const f = await flow(`screen=${s}`);
      expect(f.entries.length, s).toBeGreaterThan(0);
      expect(f.totals.debit, s).toBe(f.totals.credit);
    }
  });

  it('màn lạ hoặc lý do lạ báo lỗi rõ', async () => {
    expect((await call(ctx, 'GET', '/api/v1/posting-flow/flow?screen=khong-co')).status).toBe(400);
    expect((await call(ctx, 'GET', '/api/v1/posting-flow/flow?screen=sale&reason=KHONGCO')).status).toBe(400);
  });
});

describe('Lý do theo màn', () => {
  it('chưa gán: lọc theo loại; gán rồi: chỉ trả lý do đã gán, có lý do chọn sẵn', async () => {
    const before = (await call<{ data: { assigned: boolean; reasons: { code: string }[] } }>(ctx, 'GET', '/api/v1/posting-flow/screens/cash_receipt/reasons')).body.data;
    expect(before.assigned).toBe(false);
    expect(before.reasons.length).toBeGreaterThan(0);
    const pick = before.reasons[0]!.code;
    const put = await call(ctx, 'PUT', '/api/v1/posting-flow/screens/cash_receipt/reasons', { reasons: [{ code: pick, isDefault: true }] });
    expect(put.status).toBe(200);
    const after = (await call<{ data: { assigned: boolean; reasons: { code: string; isDefault: boolean }[] } }>(ctx, 'GET', '/api/v1/posting-flow/screens/cash_receipt/reasons')).body.data;
    expect(after.assigned).toBe(true);
    expect(after.reasons).toEqual([expect.objectContaining({ code: pick, isDefault: true })]);
  });

  it('chặn lý do sai loại, trùng, hai lý do chọn sẵn', async () => {
    const pay = (await call<{ data: { reasons: { code: string }[] } }>(ctx, 'GET', '/api/v1/posting-flow/screens/cash_payment/reasons')).body.data.reasons[0]!.code;
    expect((await call(ctx, 'PUT', '/api/v1/posting-flow/screens/cash_receipt/reasons', { reasons: [{ code: pay }] })).status).toBe(400);
    const rec = (await call<{ data: { reasons: { code: string }[] } }>(ctx, 'GET', '/api/v1/posting-flow/screens/cash_receipt/reasons')).body.data.reasons[0]!.code;
    expect((await call(ctx, 'PUT', '/api/v1/posting-flow/screens/cash_receipt/reasons', { reasons: [{ code: rec }, { code: rec }] })).status).toBe(400);
    expect((await call(ctx, 'PUT', '/api/v1/posting-flow/screens/cash_receipt/reasons', { reasons: [{ code: rec, isDefault: true }, { code: pay, isDefault: true }] })).status).toBe(400);
  });

  it('danh sách màn trả đủ 9 màn kèm lý do đã gán', async () => {
    const r = (await call<{ data: { key: string; reasons: unknown[] }[] }>(ctx, 'GET', '/api/v1/posting-flow/screens')).body.data;
    expect(r.map((x) => x.key)).toEqual(['sale', 'sale_return', 'purchase', 'purchase_return', 'transfer', 'stock_increase', 'stock_decrease', 'cash_receipt', 'cash_payment']);
    expect(r.find((x) => x.key === 'cash_receipt')!.reasons.length).toBe(1);
  });
});

describe('Đổi nhóm hạch toán hàng loạt', () => {
  it('xem trước đếm đúng, đổi thật đổi đúng số, chạy lại không đổi gì; bắt buộc có điều kiện lọc', async () => {
    const groups = (await call<{ data: { code: string; isDefault: boolean }[] }>(ctx, 'GET', '/api/v1/posting/groups')).body.data;
    const target = groups.find((g) => !g.isDefault) ?? groups[0]!;
    for (const sku of ['HLA001', 'HLA002', 'HLA003']) {
      const made = await call(ctx, 'PUT', `/api/v1/catalog/products/${sku}?new=1`, { name: `Hàng loạt ${sku}`, unit: 'Hộp', warnAck: { reason: 'thử đổi nhóm hàng loạt', codes: ['ITEM-HINT-001', 'ITEM-HINT-003'] } });
      expect(made.status, JSON.stringify(made.body)).toBe(200);
    }
    const body = { targetGroup: target.code, search: 'Hàng loạt HLA' };
    const pre = (await call<{ data: { matched: number; toChange: number; changed: number } }>(ctx, 'POST', '/api/v1/posting-flow/products/posting-group', { ...body, dryRun: true })).body.data;
    expect(pre).toMatchObject({ matched: 3, toChange: 3, changed: 0 });
    const run = (await call<{ data: { changed: number } }>(ctx, 'POST', '/api/v1/posting-flow/products/posting-group', body)).body.data;
    expect(run.changed).toBe(3);
    const n = (await sql<{ n: string }>`SELECT count(*)::text AS n FROM products WHERE tenant_id = ${tenantId} AND sku LIKE 'HLA%' AND posting_group_code = ${target.code}`.execute(db)).rows[0]!.n;
    expect(Number(n)).toBe(3);
    const again = (await call<{ data: { toChange: number; changed: number } }>(ctx, 'POST', '/api/v1/posting-flow/products/posting-group', body)).body.data;
    expect(again).toMatchObject({ toChange: 0, changed: 0 });
    expect((await call(ctx, 'POST', '/api/v1/posting-flow/products/posting-group', { targetGroup: target.code })).status).toBe(400);
    expect((await call(ctx, 'POST', '/api/v1/posting-flow/products/posting-group', { targetGroup: 'KHONGCO', search: 'x' })).status).toBe(400);
  });
});

// [2026-11-11 08:00 AM Nguyễn Văn Thủy] PHASE-026 — lịch sử sửa cấu hình hạch toán (đóng góp)
describe('Lịch sử thay đổi cấu hình', () => {
  it('sửa lý do hai lần: lần sau hiện đúng ô đổi, trước → sau; lọc theo loại', async () => {
    const reasons = (await call<{ data: { code: string; name: string; kind: string; counterAccount: string | null; revenueAccount: string | null; expenseAccount: string | null; flags: Record<string, unknown> }[] }>(ctx, 'GET', '/api/v1/posting/reasons')).body.data;
    const r = reasons.find((x) => x.kind === 'out' && x.flags?.default === 'sale')!;
    const body = (rev: string) => ({ name: r.name, kind: r.kind, counterAccount: r.counterAccount ?? '', revenueAccount: rev, expenseAccount: r.expenseAccount ?? '', flags: r.flags, isActive: true });
    expect((await call(ctx, 'PUT', `/api/v1/posting/reasons/${r.code}`, body('5111'))).status).toBe(200);
    expect((await call(ctx, 'PUT', `/api/v1/posting/reasons/${r.code}`, body(''))).status).toBe(200);
    const h = (await call<{ data: { kind: string; object: string; action: string; changes: { field: string; before: string | null; after: string | null }[] }[] }>(ctx, 'GET', '/api/v1/posting-flow/history?kind=reason')).body.data;
    expect(h.every((x) => x.kind === 'reason')).toBe(true);
    const latest = h.find((x) => x.object === r.code)!;
    expect(latest.changes).toEqual([expect.objectContaining({ field: 'revenueAccount', before: '5111', after: null })]);
  });

  it('gán lý do cho màn và đổi nhóm hàng loạt cũng có trong lịch sử', async () => {
    const h = (await call<{ data: { kind: string; changes: { after: string | null }[]; note?: string }[] }>(ctx, 'GET', '/api/v1/posting-flow/history')).body.data;
    expect(h.some((x) => x.kind === 'screen' && x.changes[0]?.after?.startsWith('★'))).toBe(true);
    expect(h.some((x) => x.kind === 'bulk' && /3 mặt hàng/.test(x.note ?? ''))).toBe(true);
  });
});
