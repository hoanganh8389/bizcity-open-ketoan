/**
 * Khung "Vì sao" của form danh mục (PHASE-023 S023-14 / 15, bizcity_catalog_hint@1):
 *   - POST /api/v1/accounts/validate, /api/v1/partners/validate trả nhắc / hướng dẫn / cảnh báo mềm / chặn, chỉ đọc;
 *   - lưu trả meta.findings; còn cảnh báo mềm → nhật ký catalog.warn.ack (có lý do, D023-6) hoặc catalog.warn.unacked (API không lý do);
 *   - lý do ngắn hơn 5 ký tự → từ chối; cảnh báo mềm không chặn lưu.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { db } from '../src/db/client.js';
import { call, saleDoc, setupTenant, type TestCtx } from './helpers.js';

let ctx: TestCtx;
let tenantId = '';
const codes = (r: { body: { data?: { findings?: { code: string }[] }; meta?: { findings?: { code: string }[] } } }, where: 'data' | 'meta' = 'data') =>
  ((where === 'data' ? r.body.data?.findings : r.body.meta?.findings) ?? []).map((f) => f.code).sort();
const audits = (objectId: string) => db.selectFrom('audit_logs').select(['action', 'after_data']).where('tenant_id', '=', tenantId)
  .where('object_id', '=', objectId).where('action', 'like', 'catalog.warn%').orderBy('id').execute();

beforeAll(async () => {
  ctx = await setupTenant();
  tenantId = (await db.selectFrom('tenants').select('id').where('code', '=', ctx.tenantCode).executeTakeFirstOrThrow()).id;
});
afterAll(async () => {
  await ctx.app.close();
});

describe('Tài khoản: POST /api/v1/accounts/validate', () => {
  it('tài khoản con của 131 không theo dõi đối tượng, không lưỡng tính → kế thừa (ℹ) + không vào sổ phụ công nợ (⚠)', async () => {
    const r = await call(ctx, 'POST', '/api/v1/accounts/validate', { mode: 'create', code: '13199', parentCode: '131', normalSide: 'debit', trackPartner: false, isDebt: false });
    expect(r.status, JSON.stringify(r.body)).toBe(200);
    expect(codes(r)).toEqual(['ACC-HINT-001', 'ACC-HINT-003']);
    const warn = r.body.data.findings.find((f: { code: string }) => f.code === 'ACC-HINT-003');
    expect(warn).toMatchObject({ level: 'warn', rule: 'R-MD-8', fix: { set: { trackPartner: true } } });
    expect(warn.why).toMatch(/sổ phụ công nợ/);
  });

  it('lưỡng tính → hướng dẫn (▶); bên số dư trái với tài khoản cha → ⚠ kèm sửa một chạm', async () => {
    const both = await call(ctx, 'POST', '/api/v1/accounts/validate', { mode: 'create', code: '13199', parentCode: '131', normalSide: 'both', trackPartner: true });
    expect(codes(both)).toEqual(['ACC-HINT-001', 'ACC-HINT-002']);
    const side = await call(ctx, 'POST', '/api/v1/accounts/validate', { mode: 'create', code: '15699', parentCode: '156', normalSide: 'credit' });
    expect(codes(side)).toContain('ACC-HINT-004');
    expect(side.body.data.findings.find((f: { code: string }) => f.code === 'ACC-HINT-004').fix.set).toEqual({ normalSide: 'debit' });
  });

  it('mã con không bắt đầu bằng mã cha → chặn (✘); tài khoản cấp 1 ngoài hệ thống chuẩn → ⚠', async () => {
    expect(codes(await call(ctx, 'POST', '/api/v1/accounts/validate', { mode: 'create', code: '14199', parentCode: '131', normalSide: 'both', trackPartner: true }))).toContain('ACC-BLOCK-001');
    expect(codes(await call(ctx, 'POST', '/api/v1/accounts/validate', { mode: 'create', code: '990', normalSide: 'debit' }))).toEqual(['ACC-HINT-007']);
  });
});

describe('Tài khoản: lưu còn cảnh báo mềm', () => {
  it('API không lý do → lưu được, meta.findings, nhật ký catalog.warn.unacked', async () => {
    const r = await call(ctx, 'POST', '/api/v1/accounts', { code: '13198', parentCode: '131', name: 'Phải thu thử không đối tượng', normalSide: 'debit' });
    expect(r.status, JSON.stringify(r.body)).toBe(201);
    expect(codes(r, 'meta')).toContain('ACC-HINT-003');
    const a = await audits('13198');
    expect(a.map((x) => x.action)).toEqual(['catalog.warn.unacked']);
  });

  it('có lý do → catalog.warn.ack giữ lý do và mã đã thấy; lý do < 5 ký tự → 400, không lưu', async () => {
    const short = await call(ctx, 'POST', '/api/v1/accounts', { code: '13197', parentCode: '131', name: 'Thử', normalSide: 'debit', warnAck: { reason: 'ok', codes: ['ACC-HINT-003'] } });
    expect(short.status).toBe(400);
    expect(await db.selectFrom('accounts').select('code').where('tenant_id', '=', tenantId).where('code', '=', '13197').executeTakeFirst()).toBeUndefined();
    const r = await call(ctx, 'POST', '/api/v1/accounts', { code: '13197', parentCode: '131', name: 'Thử', normalSide: 'debit', warnAck: { reason: 'Tài khoản tạm, kế toán trưởng đồng ý', codes: ['ACC-HINT-003'] } });
    expect(r.status).toBe(201);
    const [a] = await audits('13197');
    expect(a!.action).toBe('catalog.warn.ack');
    expect(a!.after_data).toMatchObject({ codes: ['ACC-HINT-003'], reason: 'Tài khoản tạm, kế toán trưởng đồng ý', seen: ['ACC-HINT-003'] });
  });

  it('không có cảnh báo mềm → không ghi nhật ký cảnh báo', async () => {
    const r = await call(ctx, 'POST', '/api/v1/accounts', { code: '13196', parentCode: '131', name: 'Phải thu đúng', normalSide: 'both', trackPartner: true });
    expect(r.status).toBe(201);
    expect(await audits('13196')).toHaveLength(0);
  });

  it('ngừng dùng tài khoản còn số dư → ⚠ ACC-HINT-006 nêu số dư', async () => {
    expect((await ctx.app.inject({ method: 'POST', url: '/api/v1/documents', payload: saleDoc({ docKey: 'why:CN01:HD-1', docNo: 'WHY-1' }), headers: { 'x-api-key': ctx.apiKey } })).statusCode).toBeLessThan(300);
    const acc = await db.selectFrom('ledger_lines').select('account_code').where('tenant_id', '=', tenantId).groupBy('account_code')
      .having((eb) => eb(eb.fn.sum(eb('debit', '-', eb.ref('credit'))), '<>', 0)).executeTakeFirstOrThrow();
    const r = await call(ctx, 'POST', '/api/v1/accounts/validate', { mode: 'update', code: acc.account_code, isActive: false });
    expect(codes(r)).toContain('ACC-HINT-006');
  });
});

describe('Đối tượng: POST /api/v1/partners/validate và lưu', () => {
  it('nhà cung cấp không MST → ℹ + ⚠; MST sai định dạng → ⚠; trùng tên → ⚠', async () => {
    expect(codes(await call(ctx, 'POST', '/api/v1/partners/validate', { code: 'NCC-W1', name: 'Công ty Điện thử', kind: 'supplier' }))).toEqual(['PART-HINT-001', 'PART-HINT-002']);
    expect(codes(await call(ctx, 'POST', '/api/v1/partners/validate', { code: 'KH-W1', name: 'Khách thử', kind: 'customer', taxCode: '123' }))).toEqual(['PART-HINT-004']);
    expect(codes(await call(ctx, 'POST', '/api/v1/partners/validate', { code: 'KH-W2', name: 'Khách thử', kind: 'customer', taxCode: '0100101114' }))).toEqual([]);
    expect((await call(ctx, 'POST', '/api/v1/partners', { code: 'KH-W2', name: 'Khách thử', kind: 'customer' })).status).toBe(201);
    expect(codes(await call(ctx, 'POST', '/api/v1/partners/validate', { code: 'KH-W3', name: 'khách thử ', kind: 'customer' }))).toEqual(['PART-HINT-003']);
  });

  it('lưu nhà cung cấp không MST kèm lý do → 201, meta.findings, catalog.warn.ack', async () => {
    const r = await call(ctx, 'POST', '/api/v1/partners', { code: 'NCC-W2', name: 'Hộ kinh doanh A', kind: 'supplier', warnAck: { reason: 'Hộ kinh doanh, không có MST', codes: ['PART-HINT-002'] } });
    expect(r.status, JSON.stringify(r.body)).toBe(201);
    expect(codes(r, 'meta')).toEqual(['PART-HINT-001', 'PART-HINT-002']);
    const [a] = await audits('NCC-W2');
    expect(a).toMatchObject({ action: 'catalog.warn.ack', after_data: { codes: ['PART-HINT-002'], reason: 'Hộ kinh doanh, không có MST' } });
  });
});
