// [2026-11-20 03:30 PM khanhtd] MH29 — test: số hợp đồng MỚI có dấu cách bị chặn ở Danh mục hợp đồng; hợp đồng cũ vẫn sửa được
/**
 * Số hợp đồng không được có dấu cách (dùng - hoặc /):
 *   - Danh mục hợp đồng (PUT /api/v1/dimensions/contract/:code) chặn khi THÊM MỚI, như màn Hợp đồng mua hàng MH29;
 *   - hợp đồng đã có (tạo trước khi có luật) vẫn sửa được — số hợp đồng không đổi được nên không bắt sửa số;
 *   - khoản mục, bộ phận… không đổi luật.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { db } from '../src/db/client.js';
import { call, setupTenant, type TestCtx } from './helpers.js';

let ctx: TestCtx;
beforeAll(async () => { ctx = await setupTenant(); }, 60_000);
afterAll(async () => { await ctx.app.close(); });

const url = (kind: string, code: string) => `/api/v1/dimensions/${kind}/${encodeURIComponent(code)}`;

describe('Danh mục hợp đồng — số hợp đồng có dấu cách', () => {
  it('thêm mới số có dấu cách → 400; số dùng - hoặc / → được', async () => {
    const bad = await call(ctx, 'PUT', url('contract', '2026 HD 01'), { name: 'HĐ có dấu cách' });
    expect(bad.status).toBe(400);
    expect(JSON.stringify(bad.body)).toContain('dấu cách');
    for (const code of ['2026-HD-01', '2026/HD/02']) expect((await call(ctx, 'PUT', url('contract', code), { name: `HĐ ${code}` })).status).toBe(200);
  });

  it('hợp đồng cũ đã có số chứa dấu cách vẫn sửa được', async () => {
    const t = await db.selectFrom('tenants').select('id').where('code', '=', ctx.tenantCode).executeTakeFirstOrThrow();
    await db.insertInto('dimensions').values({ tenant_id: t.id, kind: 'contract', code: '2026 hợp đồng', name: 'HĐ cũ', extra: JSON.stringify({}) }).execute();
    const r = await call(ctx, 'PUT', url('contract', '2026 hợp đồng'), { name: 'HĐ cũ — sửa tên' });
    expect(r.status, JSON.stringify(r.body)).toBe(200);
  });

  it('danh mục khác không đổi luật (khoản mục có dấu cách vẫn thêm được)', async () => {
    expect((await call(ctx, 'PUT', url('cost_item', 'KM 01'), { name: 'Khoản mục' })).status).toBe(200);
  });
});
