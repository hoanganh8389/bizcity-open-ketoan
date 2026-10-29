/**
 * Phân hệ Mua hàng — chạy trên PostgreSQL thật: lưu phiếu (máy chủ tự tính), cảnh báo, hạn mức + duyệt ngoại lệ, duyệt = ghi
 * sổ (bút toán, công nợ, kho), ứng trước tự đối trừ, CKTT, trả hàng, quà, chi phí phân bổ, thưởng, bỏ duyệt, báo cáo,
 * 25 tình huống, dữ liệu mẫu.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { call, setupTenant, type TestCtx } from './helpers.js';
import { db, toNumber } from '../src/db/client.js';

const moves = async (eventId: string) => (await db.selectFrom('inventory_movements').select(['qty', 'amount', 'sku']).where('event_id', '=', eventId).execute()).map((m) => ({ sku: m.sku, qty: toNumber(m.qty), amount: toNumber(m.amount ?? 0) }));

let ctx: TestCtx;
const G = { sku: 'AN-GOLD', name: 'Anlene Gold 800g', unit: 'Lon', taxCode: 'V08' };
const V = { sku: 'AN-VANI', name: 'Anlene vani 800g', unit: 'Lon', taxCode: 'V08' };
const line = (p: typeof G, qty: number, price: number, extra: Record<string, unknown> = {}) => ({ lineKey: `${p.sku}-${qty}-${Math.random().toString(36).slice(2, 6)}`, ...p, qty, price, lineType: 'buy', lotNo: 'L1', expDate: '2028-01-31', ...extra });
const receipt = (over: Record<string, unknown> = {}) => ({ kind: 'receipt', outsideOrder: { reason: 'Phép thử: nhập ngoài đơn' }, docDate: '2026-10-01', branchCode: 'CN01', partnerCode: 'NCC-TH', brandCode: 'ANLENE', priceIncludesVat: true, lines: [line(G, 60, 528000), line(V, 24, 431000)], ...over });

async function save(body: Record<string, unknown>) {
  const r = await call(ctx, 'POST', '/api/v1/purchase/documents', body);
  expect(r.status, JSON.stringify(r.body)).toBe(201);
  return r.body.data;
}
async function approve(id: string) {
  const r = await call(ctx, 'POST', `/api/v1/purchase/documents/${id}/approve`);
  expect(r.status, JSON.stringify(r.body)).toBe(200);
  return r.body.data;
}
const debt = async (partner: string) => (await call(ctx, 'GET', `/api/v1/debt-items?partnerCode=${partner}&status=all`)).body.data as { docNo: string; side: string; amount: number; remaining: number; dueDate: string }[];

beforeAll(async () => {
  ctx = await setupTenant();
  for (const [code, name] of [['NCC-TH', 'Công ty Trung Hậu'], ['NCC-TB', 'Công ty Thắng Bảo'], ['NCC-VT', 'Vận tải Minh Phát']]) await call(ctx, 'PUT', `/api/v1/partners/${code}`, { name, kind: 'supplier' });
  const pol = async (p: Record<string, unknown>) => expect((await call(ctx, 'POST', '/api/v1/purchase/policies', p)).status).toBe(201);
  await pol({ code: 'TH-DK10', kind: 'payment_term', name: 'Hạn 10 ngày làm việc', scope: { partnerCode: 'NCC-TH' }, rule: { basis: 'invoice_date', days: 10, workingDays: true } });
  await pol({ code: 'TB-HM600', kind: 'credit_limit', name: 'Hạn mức Thắng Bảo', scope: { partnerCode: 'NCC-TB' }, rule: { limit: 600000000, warnPct: 90 } });
  // Mặt hàng trong danh mục + giá mua cố định chung (bảng mặt hàng & giá mua của NCC).
  const tid = String((await db.selectFrom('tenants').select('id').where('code', '=', ctx.tenantCode).executeTakeFirstOrThrow()).id);
  for (const p of [G, V]) await db.insertInto('products').values({ tenant_id: tid, sku: p.sku, name: p.name, unit: p.unit, tax_in_code: 'V08' }).onConflict((oc) => oc.columns(['tenant_id', 'sku']).doNothing()).execute();
  const gp = await call(ctx, 'POST', '/api/v1/purchase/supplier-products', { rows: [{ partnerCode: null, sku: 'AN-GOLD', unit: 'Lon', price: 528000, priceIncludesVat: true, warnPct: 2 }] });
  expect(gp.status, JSON.stringify(gp.body)).toBe(200);
  await pol({ code: 'LO-ALL', kind: 'lot_tracking', name: 'Bắt buộc lô', scope: { sku: 'AN-GOLD' }, rule: { required: true } });
  const ob = await call(ctx, 'POST', '/api/v1/opening-balances', { branchCode: 'CN01', docDate: '2026-09-30', balancingAccount: '4211', lines: [{ accountCode: '3312', partnerCode: 'NCC-TB', credit: 480000000 }] });
  expect(ob.status, JSON.stringify(ob.body)).toBe(201);
});
afterAll(async () => { await ctx.app.close(); });

describe('Mua hàng — chứng từ và ghi sổ', () => {
  let th1 = '';
  it('TH1: máy chủ tự tính CK 7% + hạn 10 ngày làm việc; duyệt → bút toán, công nợ, kho', async () => {
    const d = await save(receipt({ orderDiscount: { pct: 7 }, invoice: { no: '3181', serial: 'TH/26E', date: '2026-10-01', total: 39082320 } }));
    th1 = d.id;
    expect(d).toMatchObject({ status: 'draft', totals: { total: 39082320 }, dueDate: '2026-10-15' });
    expect(d.docNo).toMatch(/^NM2610\d{4}$/);
    const a = await approve(d.id);
    expect(a.status).toBe('approved');
    expect(a.links[0]).toMatchObject({ role: 'Nhập mua' });
    const ev = (await call(ctx, 'GET', `/api/v1/documents/${a.links[0].eventId}`)).body.data;
    expect(ev).toMatchObject({ docType: 'purchase', status: 'posted', total: 39082320 });
    expect((await moves(a.links[0].eventId)).reduce((s, m) => s + m.qty, 0)).toBe(84);
    const items = await debt('NCC-TH');
    expect(items.find((i) => i.docNo === a.docNo)).toMatchObject({ side: 'credit', amount: 39082320, dueDate: '2026-10-15' });
    expect((await call(ctx, 'PUT', `/api/v1/purchase/documents/${d.id}`, receipt())).status).toBe(409);
  });

  it('cảnh báo: trùng hoá đơn (chặn), giá lệch giá cố định, thiếu lô (chặn), lần nhập gần nhất', async () => {
    const r = await call(ctx, 'POST', '/api/v1/purchase/analyze', receipt({ docDate: '2026-10-10', invoice: { no: '3181', serial: 'TH/26E', date: '2026-10-10' }, lines: [line(G, 10, 545000, { lotNo: undefined }), line(V, 5, 431000)] }));
    expect(r.status, JSON.stringify(r.body)).toBe(200);
    const codes = r.body.data.checks.map((c: { code: string }) => c.code);
    expect(codes).toEqual(expect.arrayContaining(['invoice_dup', 'price_fixed', 'lot_missing', 'price_last']));
    expect(r.body.data.priceHistory['AN-GOLD'][0]).toMatchObject({ unitPrice: 528000 });
    const d = await save(receipt({ docDate: '2026-10-10', lines: [line(G, 10, 528000, { lotNo: undefined })] }));
    const ap = await call(ctx, 'POST', `/api/v1/purchase/documents/${d.id}/approve`);
    expect(ap.status).toBe(409);
    expect(ap.body.error.message).toMatch(/số lô/);
    // Chiết khấu trên đơn lớn hơn tiền hàng → số phải trả âm: chặn duyệt.
    const neg = await call(ctx, 'POST', '/api/v1/purchase/analyze', receipt({ docDate: '2026-10-10', orderDiscount: { amount: 1_000_000 }, lines: [line(V, 1, 43)] }));
    expect(neg.body.data.checks.find((c: { code: string }) => c.code === 'discount_over')).toMatchObject({ level: 'error', blocking: true });
  });

  it('TH12–13: trong hạn mức duyệt được; vượt 58 triệu bị chặn → duyệt ngoại lệ có lý do, ghi nhật ký', async () => {
    const tb = { kind: 'receipt', outsideOrder: { reason: 'Phép thử: nhập ngoài đơn' }, docDate: '2026-10-09', branchCode: 'CN01', partnerCode: 'NCC-TB', priceIncludesVat: false, lines: [line(G, 200, 500000)] };
    const ok1 = await save(tb);
    const a1 = (await call(ctx, 'GET', `/api/v1/purchase/documents/${ok1.id}`)).body.data.analysis;
    expect(a1.credit[0]).toMatchObject({ current: 480000000, after: 588000000, remaining: 12000000 });
    await approve(ok1.id);
    const pay = await save({ kind: 'payment', docDate: '2026-10-09', branchCode: 'CN01', partnerCode: 'NCC-TB', amount: 38000000, method: 'bank', lines: [] });
    await approve(pay.id);
    const order = await save({ ...tb, kind: 'order', docDate: '2026-10-10' });
    const blocked = await call(ctx, 'POST', `/api/v1/purchase/documents/${order.id}/approve`);
    expect(blocked.status).toBe(409);
    expect(blocked.body.error.message).toMatch(/vượt hạn mức 58\.000\.000/);
    expect((await call(ctx, 'POST', `/api/v1/purchase/documents/${order.id}/override`, { reason: 'x' })).status).toBe(400);
    const ov = await call(ctx, 'POST', `/api/v1/purchase/documents/${order.id}/override`, { reason: 'NCC cam kết giãn nợ' });
    expect(ov.status, JSON.stringify(ov.body)).toBe(200);
    expect(ov.body.data).toMatchObject({ status: 'approved', override: { reason: 'NCC cam kết giãn nợ' } });
    const logs = (await call(ctx, 'GET', '/api/v1/purchase/logs?event=override_approved')).body.data;
    expect(logs[0]).toMatchObject({ docNo: order.docNo, data: { reason: 'NCC cam kết giãn nợ' } });
  });

  it('TH5: ứng trước theo đơn đặt → nhập hàng theo đơn tự đối trừ, không còn nợ', async () => {
    const order = await save(receipt({ kind: 'order', docDate: '2026-10-07', lines: [line(G, 30, 528000), line(V, 20, 431000)] }));
    await approve(order.id);
    const pre = await save({ kind: 'prepayment', docDate: '2026-10-07', branchCode: 'CN01', partnerCode: 'NCC-TH', amount: 24460000, method: 'bank', refIds: [order.id], lines: [] });
    await approve(pre.id);
    const r = await save(receipt({ docDate: '2026-10-08', refIds: [order.id], invoice: { no: '3185', date: '2026-10-08' }, lines: [line(G, 30, 528000), line(V, 20, 431000)] }));
    const an = (await call(ctx, 'GET', `/api/v1/purchase/documents/${r.id}`)).body.data.analysis;
    expect(an.prepayment).toBe(24460000);
    expect(an.checks.map((c: { code: string }) => c.code)).toContain('po_match');
    const a = await approve(r.id);
    expect((await debt('NCC-TH')).find((i) => i.docNo === a.docNo)).toMatchObject({ amount: 24460000, remaining: 0 });
  });

  it('TH4: trả đúng hạn được CKTT 2% (Nợ 331 / Có 515), trả trễ bị chặn', async () => {
    const r = await save(receipt({ docDate: '2026-10-06', orderDiscount: { pct: 7 }, cktt: { pct: 2 }, invoice: { no: '3184', date: '2026-10-06' } }));
    const a = await approve(r.id);
    expect(a.dueDate).toBe('2026-10-20');
    const late = await save({ kind: 'payment', docDate: '2026-10-21', branchCode: 'CN01', partnerCode: 'NCC-TH', amount: 38300674, ckttAmount: 781646, refIds: [r.id], lines: [] });
    expect((await call(ctx, 'POST', `/api/v1/purchase/documents/${late.id}/approve`)).body.error.message).toMatch(/quá hạn/);
    await call(ctx, 'POST', `/api/v1/purchase/documents/${late.id}/cancel`);
    const pay = await save({ kind: 'payment', docDate: '2026-10-14', branchCode: 'CN01', partnerCode: 'NCC-TH', amount: 38300674, ckttAmount: 781646, method: 'bank', refIds: [r.id], lines: [] });
    const p = await approve(pay.id);
    expect(p.links.map((l: { role: string }) => l.role)).toEqual(['Trả tiền', 'Chiết khấu thanh toán']);
    expect((await debt('NCC-TH')).find((i) => i.docNo === a.docNo)?.remaining).toBe(0);
    const ck = (await call(ctx, 'GET', `/api/v1/documents/${p.links[1].eventId}`)).body.data;
    expect(JSON.stringify(ck.entries)).toMatch(/515/);
  });

  it('trả hàng, nhận quà (711), chi phí phân bổ (SL 0, tổng khớp), thưởng; bỏ duyệt đảo sổ', async () => {
    const ret = await save(receipt({ kind: 'return', docDate: '2026-10-15', refIds: [th1], orderDiscount: { pct: 7 }, lines: [line(V, 4, 431000)] }));
    const retOk = await approve(ret.id);
    expect(retOk.links[0].role).toBe('Trả hàng NCC');

    await call(ctx, 'PUT', '/api/v1/catalog/products/QUA-THUNG?new=true', { name: 'Thùng sữa tặng', unit: 'Thùng', taxInCode: 'V08', units: [{ unit: 'Thùng', ratio: 1, isDefault: true }] });
    const gift = await save({ kind: 'gift_in', docDate: '2026-10-03', branchCode: 'CN01', partnerCode: 'NCC-TH', priceIncludesVat: false, gift: { source: 'ncc_extra', hasVat: false }, lines: [{ lineKey: 'g1', sku: 'QUA-THUNG', name: 'Thùng sữa tặng', unit: 'Thùng', qty: 5, price: 480000, taxCode: 'V08', lineType: 'gift_consumer' }] });
    const g = await approve(gift.id);
    const gev = (await call(ctx, 'GET', `/api/v1/documents/${g.links[0].eventId}`)).body.data;
    expect(gev).toMatchObject({ docType: 'stock_adjustment', total: 2400000 });
    expect(JSON.stringify(gev.entries)).toMatch(/711/);

    const big = await save({ ...receipt({ docDate: '2026-10-12', priceIncludesVat: false, lines: [line(G, 500, 480000), line(V, 400, 400000)] }) });
    await approve(big.id);
    const cost = await save({ kind: 'cost', docDate: '2026-10-12', branchCode: 'CN01', partnerCode: 'NCC-VT', amount: 10000000, basis: 'value', refIds: [big.id], lines: [] });
    const alloc = (await call(ctx, 'GET', `/api/v1/purchase/allocations/${cost.id}`)).body.data;
    expect(alloc.rows.reduce((s: number, r: { amount: number }) => s + r.amount, 0)).toBe(10000000);
    expect(alloc.rows.find((r: { sku: string }) => r.sku === 'AN-GOLD')).toMatchObject({ amount: 6000000, unitBefore: 480000 });
    const c = await approve(cost.id);
    const cev = (await call(ctx, 'GET', `/api/v1/documents/${c.links[0].eventId}`)).body.data;
    expect(cev).toMatchObject({ docType: 'purchase', status: 'posted' });
    const cm = await moves(c.links[0].eventId);
    expect(cm.every((m) => m.qty === 0)).toBe(true);
    expect(cm.reduce((s, m) => s + m.amount, 0)).toBe(10000000);

    await call(ctx, 'POST', '/api/v1/purchase/policies', { code: 'TH-THUONG', kind: 'period_rebate', name: 'Thưởng tháng', scope: { partnerCode: 'NCC-TH' }, rule: { period: 'month', tiers: [{ from: 200000000, pct: 2 }, { from: 300000000, pct: 3 }] } });
    const pv = (await call(ctx, 'POST', '/api/v1/purchase/rebates/preview', { policyCode: 'TH-THUONG', period: '2026-10' })).body.data;
    expect(pv.base).toBeGreaterThan(300000000);
    expect(pv.rate).toBe(3);
    expect(pv.allocation.reduce((s: number, a: { amount: number }) => s + a.amount, 0)).toBe(pv.amount);
    const rb = await save({ kind: 'rebate', docDate: '2026-10-31', branchCode: 'CN01', partnerCode: 'NCC-TH', amount: pv.amount, rebate: { policyCode: 'TH-THUONG', period: '2026-10', base: pv.base, rate: pv.rate, detail: pv.detail }, allocation: pv.allocation, lines: [] });
    expect((await approve(rb.id)).links[0].role).toBe('Thưởng / CK giảm giá vốn');
    expect((await call(ctx, 'POST', '/api/v1/purchase/documents', { kind: 'rebate', docDate: '2026-10-31', branchCode: 'CN01', partnerCode: 'NCC-TH', amount: pv.amount, rebate: { policyCode: 'TH-THUONG', period: '2026-10', base: 1, rate: 1, detail: [] }, allocation: pv.allocation, lines: [] })).status).toBe(409);

    // Phiếu nhập đang có phiếu trả hàng dựa vào: không bỏ duyệt được.
    expect((await call(ctx, 'POST', `/api/v1/purchase/documents/${th1}/unapprove`)).status).toBe(409);
    const un = await call(ctx, 'POST', `/api/v1/purchase/documents/${ret.id}/unapprove`);
    expect(un.status, JSON.stringify(un.body)).toBe(200);
    expect(un.body.data).toMatchObject({ status: 'draft', links: [] });
    expect((await call(ctx, 'GET', `/api/v1/documents/${retOk.links[0].eventId}`)).body.data.status).toBe('cancelled');
    expect(await moves(retOk.links[0].eventId)).toEqual([]);
  });

  it('báo cáo: hạn mức, đến hạn / tuổi nợ, lô, quà, 25 tình huống', async () => {
    const credit = (await call(ctx, 'GET', '/api/v1/purchase/credit?asOf=2026-10-23')).body.data;
    expect(credit.partners.find((p: { partnerCode: string }) => p.partnerCode === 'NCC-TB')).toBeTruthy();
    const due = (await call(ctx, 'GET', '/api/v1/purchase/due?asOf=2026-10-23')).body.data;
    expect(due.buckets).toHaveLength(6);
    expect(due.rows.length).toBeGreaterThan(0);
    const lots = (await call(ctx, 'GET', '/api/v1/purchase/lots?asOf=2026-10-23')).body.data;
    expect(lots.lots.find((l: { sku: string }) => l.sku === 'AN-GOLD')).toMatchObject({ lotNo: 'L1' });
    const gifts = (await call(ctx, 'GET', '/api/v1/purchase/gifts')).body.data.rows;
    expect(gifts.find((g: { sku: string }) => g.sku === 'QUA-THUNG')).toMatchObject({ inQty: 5, onHand: 5 });
    const sc = (await call(ctx, 'GET', '/api/v1/purchase/scenarios')).body.data;
    expect(sc.filter((s: { ok?: boolean }) => s.ok === false)).toEqual([]);
    expect(sc.filter((s: { ok?: boolean }) => s.ok === true)).toHaveLength(24);
  });
});

describe('Mua hàng — dữ liệu mẫu 25 tình huống', () => {
  it('cần mật khẩu; nạp vào sổ thật không lỗi, nạp chồng bị chặn, nạp lại được, xoá được', async () => {
    const t = await setupTenant();
    const PW = { password: 'Thuy!@#' };
    expect((await call(t, 'POST', '/api/v1/purchase/demo/seed', { password: 'sai' })).status).toBe(403);
    const seeded = await call(t, 'POST', '/api/v1/purchase/demo/seed', PW);
    expect(seeded.status, JSON.stringify(seeded.body)).toBe(200);
    expect(seeded.body.data.errors).toEqual([]);
    expect(seeded.body.data.documents).toBeGreaterThan(25);
    expect((await call(t, 'POST', '/api/v1/purchase/demo/seed', PW)).status).toBe(409);
    const docs = (await call(t, 'GET', '/api/v1/purchase/documents')).body.data as { note?: string; totals: { total: number }; status: string; dueDate?: string; checks?: { code: string }[] }[];
    const th3 = docs.find((d) => d.note?.startsWith('TH3 — không chiết khấu'))!;
    expect(th3).toMatchObject({ status: 'pending_approval', totals: { total: 117450000 } });
    const th3b = docs.find((d) => d.note?.startsWith('TH3 — đặt thêm'))!;
    expect(th3b.checks?.map((c) => c.code)).toContain('credit_exceeded');
    // Việc cần làm (trang Quy trình): số chờ duyệt / lỗi khớp danh sách chứng từ; mỗi việc có đường dẫn mở đúng màn.
    const todo = (await call(t, 'GET', '/api/v1/purchase/todo')).body.data as { byKind: Record<string, { draft: number; pending: number; approved: number }>; items: { key: string; count: number; path: string }[] };
    const pending = docs.filter((d) => d.status === 'pending_approval').length;
    expect(Object.values(todo.byKind).reduce((s, k) => s + k.pending, 0)).toBe(pending);
    expect(todo.items.find((i) => i.key === 'pending')?.count).toBe(pending);
    expect(todo.items.find((i) => i.key === 'blocked')?.count).toBe(docs.filter((d) => d.status !== 'approved' && d.status !== 'cancelled' && (d.checks as { level?: string }[] | undefined)?.some((c) => c.level === 'error')).length || undefined);
    expect(todo.items.every((i) => i.path.startsWith('/mua-hang/') && i.count > 0)).toBe(true);
    expect(todo.byKind.receipt?.approved).toBeGreaterThan(0);
    // Nạp lại: xoá bản cũ (đảo bút toán) rồi nạp — số phiếu như lần đầu, không lỗi.
    const again = await call(t, 'POST', '/api/v1/purchase/demo/seed', { ...PW, reset: true });
    expect(again.status, JSON.stringify(again.body)).toBe(200);
    expect(again.body.data).toMatchObject({ documents: seeded.body.data.documents, errors: [] });
    expect((await call(t, 'POST', '/api/v1/purchase/demo/clear', { password: 'sai' })).status).toBe(403);
    const cleared = await call(t, 'POST', '/api/v1/purchase/demo/clear', PW);
    expect(cleared.status, JSON.stringify(cleared.body)).toBe(200);
    expect((await call(t, 'GET', '/api/v1/purchase/documents')).body.data).toEqual([]);
    await t.app.close();
  }, 60_000);
});
