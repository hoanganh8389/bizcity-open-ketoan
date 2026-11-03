/**
 * HT09 "Quy định dữ liệu danh mục" (PHASE-024, D023-4 / D023-8, D024-3):
 *   - chỉnh luật nhắc theo đơn vị (ADR-0020: không có "chờ duyệt" — luật chạy ngay, có căn cứ): sửa câu chữ chỉ dùng biến của luật
 *     gốc; hạ cảnh báo mềm xuống nhắc bắt buộc lý do và không còn đòi lý do khi lưu; không hạ được mức chặn; về mặc định; có nhật ký;
 *   - tự thêm mặt hàng từ chứng từ: đơn vị mới mặc định tắt; tắt thì mã lạ → IN-ITEM-001 ở tiền kiểm VÀ cửa nạp (ca cặp), bể chờ tạo
 *     mặt hàng nháp từ dòng; kích hoạt hàng loạt → bể kiểm lại → nộp lại được; bật thì như cũ và báo cáo "tự thêm trong N ngày".
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { withRequestContext } from '@bizcity/platform/core/request-context';
import type { AuthContext } from '../src/core/auth.js';
import { preflight } from '../src/kernel/public.js';
import { db } from '../src/db/client.js';
import { auditRows, call, saleDoc, setupTenant, type TestCtx } from './helpers.js';

let ctx: TestCtx;
let tenantId = '';
let auth: AuthContext;
const audits = async (action: string, objectId?: string) => (await auditRows(tenantId, action, objectId)).map((r) => ({ action: r.action, before_data: r.before, after_data: r.after }));
const pre = (raw: unknown) => withRequestContext({ requestId: `ht09-${Math.random().toString(36).slice(2, 9)}`, correlationId: 'ht09', tenantId },
  () => db.transaction().execute((trx) => preflight(trx, auth, raw)));
const door = (raw: unknown) => ctx.app.inject({ method: 'POST', url: '/api/v1/documents', payload: raw as never, headers: { authorization: `Bearer ${ctx.token}` } });
const review = (code: string, body: Record<string, unknown>) => call(ctx, 'POST', `/api/v1/catalog-rules/${code}/review`, body);
const validateAccount = async (body: Record<string, unknown>) => (await call(ctx, 'POST', '/api/v1/accounts/validate', body)).body.data.findings as { code: string; level: string; title: string; draft?: boolean; lowered?: boolean; basis?: string[] }[];

beforeAll(async () => {
  ctx = await setupTenant();
  tenantId = (await db.selectFrom('tenants').select('id').where('code', '=', ctx.tenantCode).executeTakeFirstOrThrow()).id;
  auth = { tenantId, actor: 'system:ht09-test', actorName: 'Thử HT09', kind: 'user', role: 'owner', permissions: new Set(['documents:write', 'documents:read']) } as AuthContext;
});
afterAll(async () => {
  await ctx.app.close();
});

describe('Luật nhắc tại đơn vị (HT09)', () => {
  const ACC003 = { mode: 'create', code: '13199', parentCode: '131', normalSide: 'debit', trackPartner: false, isDebt: false };

  it('danh sách: mọi luật ở trạng thái mặc định, có bản xem trước với giá trị minh hoạ và căn cứ', async () => {
    const r = await call(ctx, 'GET', '/api/v1/catalog-rules');
    expect(r.status, JSON.stringify(r.body)).toBe(200);
    const items = r.body.data.items as { code: string; status: string; preview: { title: string }; canLower: boolean; basis: string[] }[];
    expect(r.body.data.customized).toBe(0);
    const a3 = items.find((i) => i.code === 'ACC-HINT-003')!;
    expect(a3).toMatchObject({ status: 'default', canLower: true, basis: ['Thông tư 99/2025/TT-BTC'] });
    expect(a3.preview.title).toContain('13198');
    expect(items.find((i) => i.code === 'ITEM-BLOCK-001')).toMatchObject({ canLower: false });
  });

  it('khung Vì sao: luật chạy ngay, không nhãn "chờ duyệt", có căn cứ (R-GATE-11)', async () => {
    const f = (await validateAccount(ACC003)).find((x) => x.code === 'ACC-HINT-003')!;
    expect(f.draft).toBeUndefined();
    expect(f.basis).toEqual(['Thông tư 99/2025/TT-BTC']);
  });

  it('sửa câu chữ: biến lạ → 400; biến của luật gốc → form hiện câu mới đã thay biến', async () => {
    expect((await review('ACC-HINT-003', { decision: 'edit', title: 'TK {code} thiếu {abc}' })).status).toBe(400);
    const r = await review('ACC-HINT-003', { decision: 'edit', title: 'Tài khoản {code} (nhóm {root}) chưa vào sổ công nợ.' });
    expect(r.status, JSON.stringify(r.body)).toBe(200);
    expect(r.body.data).toMatchObject({ edited: true, status: 'edited' });
    expect((await audits('catalog.rule.review', 'ACC-HINT-003')).length).toBe(1);
    expect((await validateAccount(ACC003)).find((f) => f.code === 'ACC-HINT-003')?.title).toBe('Tài khoản 13199 (nhóm 131) chưa vào sổ công nợ.');
  });

  it('hạ mức: không lý do → 400; có lý do → cảnh báo thành nhắc, lưu không còn ghi catalog.warn.unacked', async () => {
    expect((await review('ACC-HINT-003', { decision: 'lower' })).status).toBe(400);
    const r = await review('ACC-HINT-003', { decision: 'lower', note: 'Đơn vị dùng 131x nội bộ, không theo dõi công nợ' });
    expect(r.body.data).toMatchObject({ status: 'lowered', effectiveLevel: 'info' });
    expect((await validateAccount(ACC003)).find((f) => f.code === 'ACC-HINT-003')).toMatchObject({ level: 'info', lowered: true });
    const save = await call(ctx, 'POST', '/api/v1/accounts', { code: '13195', parentCode: '131', name: 'Phải thu nội bộ thử', normalSide: 'debit' });
    expect(save.status, JSON.stringify(save.body)).toBe(201);
    expect(await audits('catalog.warn.unacked', '13195')).toHaveLength(0);
  });

  it('luật gốc đổi ở bản phát hành sau (dấu khác) → phần chỉnh của đơn vị hết hiệu lực, luật về mặc định', async () => {
    expect((await review('ACC-HINT-005', { decision: 'lower', note: 'Đơn vị không theo dõi đối tượng ở 331x' })).status).toBe(200);
    const ACC005 = { mode: 'create', code: '33199', parentCode: '331', normalSide: 'credit', trackPartner: false, isDebt: true };
    expect((await validateAccount(ACC005)).find((f) => f.code === 'ACC-HINT-005')?.level).toBe('info');
    await db.updateTable('catalog_rule_reviews').set({ rule_hash: 'h1:cu' }).where('tenant_id', '=', tenantId).where('code', '=', 'ACC-HINT-005').execute();
    expect((await validateAccount(ACC005)).find((f) => f.code === 'ACC-HINT-005')).toMatchObject({ level: 'warn' });
    const list = (await call(ctx, 'GET', '/api/v1/catalog-rules')).body.data.items as { code: string; status: string; stale: boolean }[];
    expect(list.find((i) => i.code === 'ACC-HINT-005')).toMatchObject({ status: 'default', stale: true });
  });

  it('không hạ được mức chặn; về mặc định → cảnh báo mềm như cũ', async () => {
    const block = await review('ITEM-BLOCK-001', { decision: 'lower', note: 'thử hạ mức chặn' });
    expect(block.status).toBe(400);
    expect(block.body.error.message).toMatch(/không hạ được/);
    const r = await review('ACC-HINT-003', { decision: 'reset' });
    expect(r.body.data.status).toBe('default');
    expect((await validateAccount(ACC003)).find((f) => f.code === 'ACC-HINT-003')).toMatchObject({ level: 'warn', title: 'Tài khoản 13199 sẽ không vào sổ phụ công nợ.' });
  });
});

describe('Tự thêm mặt hàng từ chứng từ (D024-3)', () => {
  let k = 0;
  const sale = (sku: string) => { k += 1; const d = saleDoc({ docKey: `ht09:CN01:${k}`, docNo: `HT${k}` }); d.lines = [{ ...d.lines[0]!, sku, name: `Hàng mới ${sku}` }, ...d.lines.slice(1)] as typeof d.lines; return d; };

  it('mặc định BẬT cho mọi đơn vị, kể cả đơn vị mới (R-GATE-9: mặc định cho phép, nhắc khi sai)', async () => {
    const g = await call(ctx, 'GET', '/api/v1/settings/item-auto-create');
    expect(g.body.data).toEqual({ mode: 'on', last: null });
  });

  it('bật: mã lạ tự thêm như cũ; báo cáo "tự thêm trong 7 ngày" đếm được, thiếu nhóm hạch toán', async () => {
    const res = await door(sale('AUTO-ON-1'));
    expect(res.statusCode, res.body).toBe(200);
    const r = await call(ctx, 'GET', '/api/v1/products/auto-created?days=7');
    expect(r.body.data.count).toBeGreaterThanOrEqual(1);
    expect(r.body.data.items.map((i: { sku: string }) => i.sku)).toContain('AUTO-ON-1');
    expect(r.body.data.noGroup).toBeGreaterThanOrEqual(1);
    // nhắc kế toán: một thông báo cho chứng từ, nêu mặt hàng và điều cần kiểm
    const n = await db.selectFrom('notifications').select(['title', 'body', 'link', 'audience_permission']).where('tenant_id', '=', tenantId).where('title', 'like', '%tự thêm%').execute();
    expect(n).toHaveLength(1);
    expect(n[0]).toMatchObject({ link: '/danh-muc/mat-hang', audience_permission: 'catalog:write' });
    expect(n[0]!.body).toMatch(/AUTO-ON-1 \(ghi theo nhóm mặc định/);
    // R-GATE-10: câu chữ dựng từ mã ITEM-HINT-002 của thư viện (kèm mã + căn cứ), không viết tay; chứng từ mẫu có 2 mã mới (AUTO-ON-1, quà QUA01)
    expect(n[0]!.title).toMatch(/^Chứng từ HT\d+ đã tự thêm 2 mặt hàng — cần kiểm\.$/);
    expect(n[0]!.body).toContain('(mã ITEM-HINT-002)');
    expect(n[0]!.body).toContain('Căn cứ: Chuẩn mực kế toán số 02 — Hàng tồn kho');
  });

  it('đổi chế độ bắt buộc lý do; GET trả chế độ + lần đổi gần nhất', async () => {
    expect((await call(ctx, 'PUT', '/api/v1/settings/item-auto-create', { mode: 'off', reason: '' })).status).toBe(400);
    const r = await call(ctx, 'PUT', '/api/v1/settings/item-auto-create', { mode: 'off', reason: 'Kế toán trưởng: đã báo bên POS' });
    expect(r.status, JSON.stringify(r.body)).toBe(200);
    const g = await call(ctx, 'GET', '/api/v1/settings/item-auto-create');
    expect(g.body.data).toMatchObject({ mode: 'off', last: { reason: 'Kế toán trưởng: đã báo bên POS' } });
  });

  it('ca cặp IN-ITEM-001: tắt → tiền kiểm báo VÀ cửa nạp từ chối; bể tạo mặt hàng nháp từ dòng', async () => {
    const raw = sale('AUTO-OFF-1');
    expect((await pre(raw)).findings.map((f) => f.code)).toContain('IN-ITEM-001');
    const res = await door(raw);
    expect(res.statusCode).toBe(400);
    expect(res.json().error.message).toMatch(/IN-ITEM-001/);
    expect(await db.selectFrom('accounting_events').select('id').where('tenant_id', '=', tenantId).where('doc_key', '=', raw.docKey).executeTakeFirst()).toBeUndefined();
    const p = await db.selectFrom('products').select(['name', 'unit', 'is_draft', 'draft_codes', 'source_system']).where('tenant_id', '=', tenantId).where('sku', '=', 'AUTO-OFF-1').executeTakeFirstOrThrow();
    expect(p).toMatchObject({ name: 'Hàng mới AUTO-OFF-1', unit: 'Hộp', is_draft: true, draft_codes: ['IN-ITEM-001'], source_system: 'document' });
    // gửi lại: mặt hàng đã có nhưng còn nháp → IN-ITEM-009
    expect((await door(raw)).json().error.message).toMatch(/IN-ITEM-009/);
  });

  it('kích hoạt hàng loạt → bể chờ kiểm lại → nộp lại được', async () => {
    const r = await call(ctx, 'POST', '/api/v1/products/activate', { skus: ['AUTO-OFF-1'], warnAck: { reason: 'Hàng hoá thường, nhóm mặc định', codes: ['ITEM-HINT-001'] } });
    expect(r.status, JSON.stringify(r.body)).toBe(200);
    expect(r.body.data).toMatchObject({ activated: ['AUTO-OFF-1'], stillDraft: [] });
    expect(r.body.data.inboxRechecked.checked).toBeGreaterThanOrEqual(1);
    expect((await audits('product.activate', 'AUTO-OFF-1')).length).toBe(1);
    expect((await door(sale('AUTO-OFF-1'))).statusCode).toBe(200);
  });

  it('kích hoạt hàng loạt: mặt hàng thiếu ĐVT vẫn nháp, trả mã còn thiếu; điền ĐVT cho cả lô thì kích hoạt', async () => {
    const raw = sale('AUTO-OFF-2');
    raw.lines = [{ ...raw.lines[0]!, unit: '' }, ...raw.lines.slice(1)] as typeof raw.lines;
    await door(raw);
    const r1 = await call(ctx, 'POST', '/api/v1/products/activate', { skus: ['AUTO-OFF-2'] });
    expect(r1.body.data.stillDraft).toEqual([{ sku: 'AUTO-OFF-2', codes: ['ITEM-BLOCK-001'] }]);
    const r2 = await call(ctx, 'POST', '/api/v1/products/activate', { skus: ['AUTO-OFF-2'], unit: 'Cái' });
    expect(r2.body.data.activated).toEqual(['AUTO-OFF-2']);
  });
});
