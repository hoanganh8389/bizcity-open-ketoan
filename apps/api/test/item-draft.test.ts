/**
 * Mặt hàng NHÁP — Gate A nối Gate B (PHASE-024 S024-28 / 29, ADR-0019 R-GATE-3 / 4 / 6):
 *   - khai báo còn lỗi chặn (thiếu ĐVT gốc) → lưu nháp, không mất bản khai; ô chọn (status=active) không hiện;
 *   - chứng từ có mặt hàng nháp → cửa nạp từ chối, bể chờ giữ với IN-ITEM-009;
 *   - sửa hết lỗi chặn → tự kích hoạt, mục bể được tiền kiểm lại (hết IN-ITEM-009);
 *   - chỉ cảnh báo mềm (dùng nhóm mặc định) thì KHÔNG thành nháp (R-GATE-4);
 *   - đồng bộ hàng loạt: mặt hàng thiếu ĐVT thành nháp, trả danh sách.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { db } from '../src/db/client.js';
import { call, saleDoc, setupTenant, type TestCtx } from './helpers.js';

let ctx: TestCtx;
let tenantId = '';
const product = (sku: string) => db.selectFrom('products').select(['is_draft', 'draft_codes', 'unit']).where('tenant_id', '=', tenantId).where('sku', '=', sku).executeTakeFirst();
const inboxOf = (docKey: string) => db.selectFrom('intake_inbox').select(['status', 'findings']).where('tenant_id', '=', tenantId).where('doc_key', '=', docKey).executeTakeFirst();
const codesOf = (f: unknown) => (f as { code: string }[]).map((x) => x.code);

beforeAll(async () => {
  ctx = await setupTenant();
  tenantId = (await db.selectFrom('tenants').select('id').where('code', '=', ctx.tenantCode).executeTakeFirstOrThrow()).id;
});
afterAll(async () => {
  await ctx.app.close();
});

describe('Gate A: khung Vì sao mặt hàng', () => {
  it('thiếu ĐVT gốc → chặn; chưa nhóm hạch toán (có nhóm mặc định) → cảnh báo mềm', async () => {
    const r = await call(ctx, 'POST', '/api/v1/products/validate', { sku: 'MH-X' });
    expect(r.status, JSON.stringify(r.body)).toBe(200);
    const f = r.body.data.findings as { code: string; level: string; howTo?: string }[];
    expect(f.map((x) => [x.code, x.level])).toEqual([['ITEM-BLOCK-001', 'block'], ['ITEM-HINT-001', 'warn']]);
    expect(f[0]!.howTo).toMatch(/đơn vị tính/);
  });

  it('chỉ cảnh báo mềm → đang dùng ngay (không nháp), có ghi nhận', async () => {
    const r = await call(ctx, 'PUT', '/api/v1/products/MH-WARN', { name: 'Có ĐVT, chưa nhóm', unit: 'Cái', warnAck: { reason: 'Đúng là hàng hoá thường', codes: ['ITEM-HINT-001'] } });
    expect(r.status).toBe(200);
    expect(r.body.data).toMatchObject({ isDraft: false });
    expect(r.body.meta.held).toBeUndefined();
    expect(await product('MH-WARN')).toMatchObject({ is_draft: false });
  });
});

describe('Nháp → bể chờ → kích hoạt → kiểm lại', () => {
  it('lưu khi thiếu ĐVT → nháp, có held; ô chọn không hiện, lọc "draft" thì có', async () => {
    const r = await call(ctx, 'PUT', '/api/v1/products/MH-NHAP', { name: 'Sữa thử nháp' });
    expect(r.status, JSON.stringify(r.body)).toBe(200);
    expect(r.body.data).toEqual({ sku: 'MH-NHAP', isDraft: true });
    expect(r.body.meta).toMatchObject({ gate: 'A', held: { kind: 'draft', id: 'MH-NHAP' } });
    expect(await product('MH-NHAP')).toMatchObject({ is_draft: true, draft_codes: ['ITEM-BLOCK-001'] });
    const active = await call(ctx, 'GET', '/api/v1/products?status=active&search=MH-NHAP');
    expect(active.body.data).toHaveLength(0);
    const drafts = await call(ctx, 'GET', '/api/v1/products?status=draft');
    expect(drafts.body.data.map((p: { sku: string }) => p.sku)).toContain('MH-NHAP');
  });

  it('chứng từ dùng mặt hàng nháp → cửa nạp từ chối, bể giữ với IN-ITEM-009, không thành sự việc', async () => {
    const doc = saleDoc({ docKey: 'nhap:CN01:HD-1', docNo: 'NHAP-1' });
    doc.lines = [{ ...doc.lines[0]!, sku: 'MH-NHAP' }, ...doc.lines.slice(1)] as typeof doc.lines;
    const res = await ctx.app.inject({ method: 'POST', url: '/api/v1/documents', payload: doc as never, headers: { authorization: `Bearer ${ctx.token}` } });
    expect(res.statusCode).toBeGreaterThanOrEqual(400);
    expect(res.json().error.message).toMatch(/IN-ITEM-009/);
    expect(await db.selectFrom('accounting_events').select('id').where('tenant_id', '=', tenantId).where('doc_key', '=', 'nhap:CN01:HD-1').executeTakeFirst()).toBeUndefined();
    const inbox = await inboxOf('nhap:CN01:HD-1');
    expect(inbox?.status).toBe('open');
    expect(codesOf(inbox!.findings)).toContain('IN-ITEM-009');
  });

  it('khai ĐVT → tự kích hoạt; mục bể được tiền kiểm lại, hết IN-ITEM-009', async () => {
    const r = await call(ctx, 'PUT', '/api/v1/products/MH-NHAP', { unit: 'Hộp', postingGroupCode: null, warnAck: { reason: 'Hàng hoá thường, nhóm mặc định', codes: ['ITEM-HINT-001'] } });
    expect(r.body.data).toEqual({ sku: 'MH-NHAP', isDraft: false });
    expect(r.body.meta.inboxRechecked).toEqual({ checked: 1, cleared: 1 });
    const inbox = await inboxOf('nhap:CN01:HD-1');
    expect(codesOf(inbox!.findings)).not.toContain('IN-ITEM-009');
    const audit = await db.selectFrom('audit_logs').select('action').where('tenant_id', '=', tenantId).where('object_id', '=', 'MH-NHAP').where('action', 'like', 'product.%').orderBy('id').execute();
    expect(audit.map((a) => a.action)).toEqual(['product.draft', 'product.activate']);
  });

  it('đồng bộ hàng loạt: mặt hàng thiếu ĐVT thành nháp và được liệt kê', async () => {
    const r = await call(ctx, 'PUT', '/api/v1/products', { source: 'pos', products: [{ sku: 'POS-1', name: 'Có ĐVT', unit: 'Gói' }, { sku: 'POS-2', name: 'Thiếu ĐVT' }] });
    expect(r.status).toBe(200);
    expect(r.body.data).toEqual({ count: 2, drafts: ['POS-2'] });
    expect(r.body.meta).toMatchObject({ gate: 'A', held: { kind: 'draft', ids: ['POS-2'] } });
    expect(await product('POS-1')).toMatchObject({ is_draft: false });
    const fixed = await call(ctx, 'PUT', '/api/v1/products', { products: [{ sku: 'POS-2', unit: 'Gói' }] });
    expect(fixed.body.data.drafts).toEqual([]);
    expect(await product('POS-2')).toMatchObject({ is_draft: false });
  });
});
