// [2026-11-20 Nguyễn Văn Thủy] Cơ cấu linh hoạt (0171): điểm hoạt động của nút, chỉ để thống kê, xoá trắng cơ cấu giữ nơi đã có chứng từ (đóng góp)
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { sql } from 'kysely';
import { db } from '../src/db/client.js';
import { call, setupTenant, type TestCtx } from './helpers.js';

let ctx: TestCtx;
let t: string;
const ok = async (method: 'GET' | 'POST' | 'PATCH', url: string, body?: unknown, status = method === 'POST' && !url.endsWith('/wipe') ? 201 : 200) => {
  const r = await call(ctx, method, url, body);
  expect(r.status, `${method} ${url}: ${JSON.stringify(r.body)}`).toBe(status);
  return r.body.data;
};
const node = async (code: string) => (await ok('GET', '/api/v1/org-units/tree')).nodes.find((n: { code: string }) => n.code === code);

beforeAll(async () => {
  ctx = await setupTenant();
  t = String((await db.selectFrom('tenants').select('id').where('code', '=', ctx.tenantCode).executeTakeFirstOrThrow()).id);
  await ok('POST', '/api/v1/org-units', { code: 'CTY', name: 'Công ty thử', kind: 'company', taxId: '0101234567' });
  await ok('POST', '/api/v1/org-units', { code: 'MB', name: 'Miền Bắc', parentCode: 'CTY', statsOnly: true });
  await ok('POST', '/api/v1/org-units', { code: 'CNPT', name: 'CN Phú Thọ', parentCode: 'MB' });
  for (const b of ['LHPT01', 'LHPT02', 'LHPT03']) {
    await ok('POST', '/api/v1/branches', { code: b, name: `Cửa hàng ${b}` });
    await ok('PATCH', `/api/v1/branches/${b}`, { orgUnitCode: 'CNPT' }, 200);
  }
});
afterAll(async () => { await ctx.app.close(); });

describe('Cơ cấu linh hoạt (0171)', () => {
  it('nút có điểm hoạt động (một chi nhánh, không dùng chung); chỉ để thống kê', async () => {
    await ok('PATCH', '/api/v1/org-units/CNPT', { branchCode: 'LHPT01' }, 200);
    expect(await node('CNPT')).toMatchObject({ branchCode: 'LHPT01', statsOnly: false });
    expect(await node('MB')).toMatchObject({ statsOnly: true, branchCode: null });
    const r = await call(ctx, 'PATCH', '/api/v1/org-units/MB', { branchCode: 'LHPT01' });
    expect(r.status).toBe(409);
    await ok('PATCH', '/api/v1/branches/LHPT03', { statsOnly: true }, 200);
    const b = (await ok('GET', '/api/v1/branches')).find((x: { code: string }) => x.code === 'LHPT03');
    expect(b.statsOnly).toBe(true);
  });

  it('xoá trắng: xoá nút, cửa hàng chưa phát sinh; cửa hàng đã có chứng từ giữ lại, gỡ khỏi cây', async () => {
    await sql`INSERT INTO purchase_documents (tenant_id, kind, status, doc_no, doc_date, branch_code, partner_code, total, created_by)
      VALUES (${t}, 'order', 'draft', 'DDH-LH-1', '2026-11-20', 'LHPT02', 'NCC-A', 1000, 'user:1')`.execute(db);
    const bad = await call(ctx, 'POST', '/api/v1/org-units/wipe', { confirm: true, password: 'sai' });
    expect(bad.status).toBe(403);
    const r = await ok('POST', '/api/v1/org-units/wipe', { confirm: true, password: process.env.RESTORE_DEFAULT_PASSWORD || process.env.CATALOG_WIPE_PASSWORD || process.env.PURCHASE_SEED_PASSWORD });
    expect(r.orgUnits).toBe(3);
    expect((await ok('GET', '/api/v1/org-units/tree')).nodes).toEqual([]);
    const left = (await ok('GET', '/api/v1/branches')) as { code: string; orgUnitCode: string | null }[];
    expect(left.find((b) => b.code === 'LHPT02')).toMatchObject({ orgUnitCode: null });
    expect(left.some((b) => b.code === 'LHPT01' || b.code === 'LHPT03')).toBe(false);
  });
});
