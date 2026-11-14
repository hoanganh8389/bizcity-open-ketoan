// [2026-11-13 08:40 PM Johnny Chu - Chu Hoàng Anh] PHASE-036 — S036-8a: quay về dữ liệu gốc an toàn — xem trước bắt buộc, mã xem trước, ảnh chụp danh mục, chặn bộ giả lập trên đơn vị có bút toán
/**
 * PHASE-036 · 00 §9 (D036-9). Dữ liệu trong test là giả lập.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { call, setupTenant, type TestCtx } from './helpers.js';

let ctx: TestCtx;
let other: TestCtx;
const url = (key: string) => `/api/v1/default-data/${key}/restore`;
const preview = (key: string, c: TestCtx = ctx) => call(c, 'POST', `${url(key)}?dryRun=1`, { confirm: true });
const run = (key: string, previewToken?: string, c: TestCtx = ctx) => call(c, 'POST', url(key), { confirm: true, ...(previewToken ? { previewToken } : {}) });
const costItems = async () => (await call(ctx, 'GET', '/api/v1/dimensions/cost_item')).body.data as { code: string; isActive: boolean }[];
const backups = async (c: TestCtx = ctx) => (await call(c, 'GET', '/api/v1/default-data/backups')).body.data as { id: string; datasetKey: string; tables: string[]; rowCount: number; result: unknown }[];

beforeAll(async () => {
  ctx = await setupTenant();
  other = await setupTenant();
});
afterAll(async () => {
  await ctx.app.close();
  await other.app.close();
});

describe('Quay về dữ liệu gốc: xem trước bắt buộc', () => {
  it('chạy thật không có mã xem trước / mã sai → từ chối, không ghi gì', async () => {
    const before = (await costItems()).length;
    const none = await run('cost_item');
    expect(none.status).toBe(400);
    expect(JSON.stringify(none.body)).toContain('Cần xem trước');
    expect((await run('cost_item', '1700000000000.abcdefabcdefabcdefabcdef.' + 'A'.repeat(43))).status).toBe(400);
    expect((await costItems()).length).toBe(before);
    expect(await backups()).toHaveLength(0);
  });

  it('xem trước trả kết quả thật nhưng không ghi gì, kèm mã xem trước', async () => {
    const before = (await costItems()).length;
    const p = await preview('cost_item');
    expect(p.status, JSON.stringify(p.body)).toBe(200);
    expect(p.body.meta.dryRun).toBe(true);
    expect(p.body.data.added).toBeGreaterThan(200);
    expect(p.body.meta.previewToken).toMatch(/^\d{13}\.[0-9a-f]{24}\./);
    expect((await costItems()).length).toBe(before);
    expect(await backups()).toHaveLength(0);
  });

  it('chạy thật với mã xem trước: ghi đúng như xem trước, chụp danh mục trước khi ghi', async () => {
    await call(ctx, 'PUT', '/api/v1/dimensions/cost_item/TU-THEM-1', { name: 'Tự thêm (giả lập)' });
    const p = await preview('cost_item');
    const r = await run('cost_item', p.body.meta.previewToken);
    expect(r.status, JSON.stringify(r.body)).toBe(200);
    expect(r.body.data).toMatchObject({ added: p.body.data.added, removed: 1 });
    expect(r.body.meta.backupId).toBeTruthy();
    const list = await backups();
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({ id: r.body.meta.backupId, datasetKey: 'cost_item', tables: ['dimensions'] });
    expect(list[0]!.rowCount).toBeGreaterThan(0);
    // ảnh chụp là trạng thái TRƯỚC khi ghi: còn mã tự thêm đã bị xoá
    const one = await call(ctx, 'GET', `/api/v1/default-data/backups/${r.body.meta.backupId}`);
    expect(one.status).toBe(200);
    const dims = one.body.data.snapshot.dimensions as { code: string; kind: string }[];
    expect(dims.some((d) => d.code === 'TU-THEM-1' && d.kind === 'cost_item')).toBe(true);
    expect((await costItems()).some((d) => d.code === 'TU-THEM-1')).toBe(false);
  });

  it('danh mục đổi sau khi xem trước → CONFLICT, không ghi, không chụp', async () => {
    const p = await preview('cost_item');
    expect(p.body.data).toMatchObject({ added: 0, removed: 0 });
    await call(ctx, 'PUT', '/api/v1/dimensions/cost_item/TU-THEM-2', { name: 'Thêm sau khi xem trước (giả lập)' });
    const n = (await backups()).length;
    const r = await run('cost_item', p.body.meta.previewToken);
    expect(r.status).toBe(409);
    expect(JSON.stringify(r.body)).toContain('đã đổi sau khi xem trước');
    expect((await costItems()).some((d) => d.code === 'TU-THEM-2')).toBe(true);
    expect(await backups()).toHaveLength(n);
  });

  it('mã xem trước gắn với bộ và đơn vị: dùng cho bộ khác / đơn vị khác → từ chối', async () => {
    const p = await preview('cost_item');
    expect((await run('case', p.body.meta.previewToken)).status).toBe(400);
    expect((await run('cost_item', p.body.meta.previewToken, other)).status).toBe(400);
  });

  it('giữ 10 bản chụp gần nhất; đơn vị khác không thấy bản chụp của đơn vị này', async () => {
    for (let i = 0; i < 11; i++) {
      const p = await preview('case');
      expect((await run('case', p.body.meta.previewToken)).status).toBe(200);
    }
    const list = await backups();
    expect(list).toHaveLength(10);
    expect(list.every((b) => b.datasetKey === 'case')).toBe(true);
    expect(await backups(other)).toHaveLength(0);
    expect((await call(other, 'GET', `/api/v1/default-data/backups/${list[0]!.id}`)).status).toBe(404);
  });

  it('quay về toàn bộ cũng phải xem trước', async () => {
    const r = await call(other, 'POST', '/api/v1/default-data/all/restore', { confirm: true });
    expect(r.status).toBe(400);
    expect(JSON.stringify(r.body)).toContain('Cần xem trước');
  });
});

describe('Quay về dữ liệu gốc: bộ giả lập trên đơn vị đã có bút toán', () => {
  it('đơn vị chưa có bút toán: quay về bộ giả lập được; có bút toán: bị chặn, chỉ cách đặt SEEDS_DIR; bộ chuẩn vẫn được', async () => {
    expect((await preview('partners', other)).status).toBe(200);
    const v = await call(other, 'POST', '/api/v1/vouchers', { docType: 'manual', branchCode: 'CN01', docDate: '2026-10-05', description: 'Thu khác (giả lập)', lines: [{ debitAccount: '1111', creditAccount: '7111', amount: 100000 }] });
    expect(v.status, JSON.stringify(v.body)).toBe(201);
    const blocked = await preview('partners', other);
    expect(blocked.status).toBe(400);
    expect(JSON.stringify(blocked.body)).toContain('dữ liệu mẫu giả lập');
    expect(JSON.stringify(blocked.body)).toContain('SEEDS_DIR');
    expect((await call(other, 'POST', '/api/v1/default-data/all/restore?dryRun=1', { confirm: true })).status).toBe(400);
    expect((await preview('cost_item', other)).status).toBe(200);
  });
});
