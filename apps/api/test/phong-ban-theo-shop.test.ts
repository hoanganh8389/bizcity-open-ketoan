/**
 * [2026-11-13 Nguyễn Văn Thủy] Phòng ban riêng của chi nhánh / shop (0129) (đóng góp)
 * Chi nhánh mới tự có phòng ban riêng (BH + số mã; mã chữ → BH- + mã); chứng từ vào tài khoản theo dõi phòng ban
 * mà chi nhánh chưa ánh xạ phòng ban → báo lỗi; gắn xong thì ghi được và dòng sổ mang phòng ban.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { sql } from 'kysely';
import { db } from '../src/db/client.js';
import { call, saleDoc, setupTenant, type TestCtx } from './helpers.js';

let ctx: TestCtx;
let tenantId: string;

beforeAll(async () => {
  ctx = await setupTenant();
  tenantId = (await db.selectFrom('tenants').select('id').where('code', '=', ctx.tenantCode).executeTakeFirstOrThrow()).id;
  expect((await call(ctx, 'PUT', '/api/v1/dimensions/department/CN-CH', { name: 'Cửa hàng' })).status).toBeLessThan(300);
});
afterAll(async () => { await ctx.app.close(); });

describe('Phòng ban theo shop', () => {
  it('chi nhánh mới tự có phòng ban riêng', async () => {
    expect((await call(ctx, 'POST', '/api/v1/branches', { code: '00077Plus', name: 'Thử 77' })).status).toBe(201);
    expect((await call(ctx, 'POST', '/api/v1/branches', { code: 'SHOPX', name: 'Shop chữ' })).status).toBe(201);
    const list = (await call(ctx, 'GET', '/api/v1/branches')).body.data as { code: string; departmentCode: string | null }[];
    expect(list.find((b) => b.code === '00077Plus')?.departmentCode).toBe('BH00077');
    expect(list.find((b) => b.code === 'SHOPX')?.departmentCode).toBe('BH-SHOPX');
    const deps = (await call(ctx, 'GET', '/api/v1/dimensions/department')).body.data as { code: string; name: string }[];
    expect(deps.find((d) => d.code === 'BH00077')?.name).toContain('Thử 77');
  });

  it('tài khoản theo dõi phòng ban mà chi nhánh chưa gắn → báo lỗi; gắn xong ghi được', async () => {
    expect((await call(ctx, 'PATCH', '/api/v1/branches/CN01', { departmentCode: null })).status).toBe(200);
    const accs = ((await call(ctx, 'GET', '/api/v1/accounts')).body.data as { code: string; isPosting: boolean }[]).filter((a) => a.code.startsWith('511') && a.isPosting);
    for (const a of accs) expect((await call(ctx, 'PATCH', `/api/v1/accounts/${a.code}`, { trackDepartment: true })).status).toBe(200);
    const bad = await call(ctx, 'POST', '/api/v1/documents', saleDoc({ docKey: 'pb:1', docNo: 'PB1' }));
    expect(JSON.stringify(bad.body)).toContain('phòng ban');
    expect(bad.body?.data?.status).not.toBe('posted');

    expect((await call(ctx, 'PATCH', '/api/v1/branches/CN01', { departmentCode: 'CN-CH' })).status).toBe(200);
    const good = await call(ctx, 'POST', '/api/v1/documents', saleDoc({ docKey: 'pb:2', docNo: 'PB2' }));
    expect(good.body.data.status, JSON.stringify(good.body).slice(0, 400)).toBe('posted');
    const deps = await sql<{ dep: string | null }>`SELECT DISTINCT l.dims->>'department' AS dep FROM ledger_lines l JOIN ledger_entries e ON e.id = l.entry_id WHERE l.tenant_id = ${tenantId} AND e.doc_no = 'PB2'`.execute(db);
    expect(deps.rows.map((r) => r.dep)).toEqual(['CN-CH']);
  });
});
