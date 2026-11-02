/**
 * Hồ sơ kế toán của đơn vị có phiên bản (ADR-0013; PHASE-020 S020-22, khoảng trống G1):
 *   - chưa khai → current = null (Core không đoán chế độ);
 *   - năm tài chính lệch năm dương lịch (01/7): năm 01/7/2025 – 30/6/2026 vẫn theo hồ sơ cũ, hồ sơ mới chỉ áp từ 01/7/2026
 *     — đúng ca C02.2 của bộ kiểm chuẩn (không tự chuyển chế độ giữa năm tài chính);
 *   - hiệu lực phải là ngày 01 của tháng bắt đầu năm tài chính; không phát hành vào năm đã có kỳ khoá;
 *   - chỉ thêm (trigger), có bằng chứng; AI đọc được, không phát hành được.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { sql } from 'kysely';
import { db } from '../src/db/client.js';
import { fiscalYearOf } from '@bizcity/kernel/modules/posting-config/profile';
import { call, setupTenant, type TestCtx } from './helpers.js';

let ctx: TestCtx;
let tenantId = '';
const publish = (body: Record<string, unknown>) => call(ctx, 'POST', '/api/v1/accounting/profile/publish', body);
const get = async (asOf: string) => (await call(ctx, 'GET', `/api/v1/accounting/profile?asOf=${asOf}`)).body.data;

beforeAll(async () => {
  ctx = await setupTenant();
  tenantId = (await db.selectFrom('tenants').select('id').where('code', '=', ctx.tenantCode).executeTakeFirstOrThrow()).id;
});
afterAll(async () => {
  await ctx.app.close();
});

describe('Năm tài chính', () => {
  it('fiscalYearOf: năm dương lịch, năm lệch, năm nhuận', () => {
    expect(fiscalYearOf(1, '2026-03-15')).toEqual({ start: '2026-01-01', end: '2026-12-31' });
    expect(fiscalYearOf(7, '2026-03-15')).toEqual({ start: '2025-07-01', end: '2026-06-30' });
    expect(fiscalYearOf(7, '2026-07-01')).toEqual({ start: '2026-07-01', end: '2027-06-30' });
    expect(fiscalYearOf(3, '2028-02-10')).toEqual({ start: '2027-03-01', end: '2028-02-29' });
  });
});

describe('Hồ sơ kế toán có phiên bản', () => {
  it('chưa khai: current = null, không suy đoán chế độ', async () => {
    const r = await get('2026-03-15');
    expect(r).toMatchObject({ asOf: '2026-03-15', current: null, fiscalYear: null, history: [] });
  });

  it('năm tài chính 01/7: TT200 cho năm 2025–2026, TT99 chỉ từ 01/7/2026 — không tự chuyển ngày 01/01/2026', async () => {
    const a = await publish({ effectiveFrom: '2025-07-01', fiscalYearStartMonth: 7, regime: 'vn-tt200-2014', entityType: 'enterprise', note: 'Khai hồ sơ ban đầu: năm tài chính 01/7' });
    expect(a.status, JSON.stringify(a.body)).toBe(201);
    expect(a.body.data).toMatchObject({ version: 1, effectiveFrom: '2025-07-01', fiscalYearStartMonth: 7, regime: 'vn-tt200-2014' });
    expect(a.body.meta.receipt.evidenceId).toMatch(/^\d+$/);
    const b = await publish({ effectiveFrom: '2026-07-01', fiscalYearStartMonth: 7, regime: 'vn-tt99-2025', entityType: 'enterprise', note: 'TT99 áp cho năm tài chính bắt đầu 01/7/2026' });
    expect(b.status, JSON.stringify(b.body)).toBe(201);

    const mar = await get('2026-03-15');
    expect(mar.current).toMatchObject({ version: 1, regime: 'vn-tt200-2014' });
    expect(mar.fiscalYear).toEqual({ start: '2025-07-01', end: '2026-06-30' });
    const aug = await get('2026-08-01');
    expect(aug.current).toMatchObject({ version: 2, regime: 'vn-tt99-2025' });
    expect(aug.fiscalYear).toEqual({ start: '2026-07-01', end: '2027-06-30' });
    expect(aug.history.map((h: { version: number }) => h.version)).toEqual([2, 1]);
    // Trước hồ sơ đầu tiên: chưa khai.
    expect((await get('2025-06-30')).current).toBeNull();
  });

  it('hiệu lực phải là ngày 01 của tháng bắt đầu năm tài chính', async () => {
    const wrongMonth = await publish({ effectiveFrom: '2027-01-01', fiscalYearStartMonth: 7, regime: 'vn-tt99-2025', entityType: 'enterprise', note: 'Sai tháng bắt đầu' });
    expect(wrongMonth.status).toBe(400);
    expect(JSON.stringify(wrongMonth.body)).toMatch(/đầu năm tài chính/);
    const midMonth = await publish({ effectiveFrom: '2027-07-15', fiscalYearStartMonth: 7, regime: 'vn-tt99-2025', entityType: 'enterprise', note: 'Giữa tháng' });
    expect(midMonth.status).toBe(400);
    const noNote = await publish({ effectiveFrom: '2027-07-01', fiscalYearStartMonth: 7, regime: 'vn-tt99-2025', entityType: 'enterprise', note: 'x' });
    expect(noNote.status).toBe(400);
  });

  it('không phát hành vào năm đã có kỳ khoá', async () => {
    expect((await call(ctx, 'PUT', '/api/v1/periods/locks', { year: 2027, month: 8, changes: [{ branchCode: 'CN01', docType: 'sale', locked: true }] })).status).toBe(200);
    const r = await publish({ effectiveFrom: '2027-07-01', fiscalYearStartMonth: 7, regime: 'vn-tt99-2025', entityType: 'sme', note: 'Đổi loại pháp nhân năm đã khoá một kỳ' });
    expect(r.status).toBe(400);
    expect(JSON.stringify(r.body)).toMatch(/08\/2027 đã khoá/);
  });

  it('chỉ thêm: không sửa, không xoá', async () => {
    await expect(sql`UPDATE accounting_profiles SET regime = 'vn-tt133-2016' WHERE tenant_id = ${tenantId}`.execute(db)).rejects.toThrow(/không sửa/);
    await expect(sql`DELETE FROM accounting_profiles WHERE tenant_id = ${tenantId}`.execute(db)).rejects.toThrow(/không sửa/);
  });

  it('AI đọc được hồ sơ, không phát hành được', async () => {
    const res = await ctx.app.inject({ method: 'POST', url: '/mcp', headers: { authorization: `Bearer ${ctx.token}` }, payload: { jsonrpc: '2.0', id: 1, method: 'tools/list' } as never });
    const names = (res.json().result.tools as { name: string }[]).map((t) => t.name);
    expect(names).toContain('accounting.profile.get');
    expect(names).not.toContain('accounting.profile.publish');
  });
});
