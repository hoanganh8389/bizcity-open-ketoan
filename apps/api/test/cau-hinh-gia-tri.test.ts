/**
 * PHASE-029 E2 đợt 1 (bizcity_settings@1 1.1.0-draft §2, ECP-03): cấu hình có phạm vi, ngày hiệu lực, phiên bản, chỉ thêm.
 * Một đường đọc (getSetting) / một đường ghi (core.settings.set); khoá cũ ở tenants.settings ghi song song để đường đọc cũ vẫn đúng.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { sql } from 'kysely';
import { closeDb, db } from '../src/db/client.js';
import { auditRows, call, setupTenant, type TestCtx } from './helpers.js';

let ctx: TestCtx;
let tenantId = '';
let ownerId = '';
let branchId = '';
let viewer: Record<string, string> = {};
let viewerId = '';

const put = (key: string, body: Record<string, unknown>) => call(ctx, 'PUT', `/api/v1/settings/values/${key}`, body);
const get = (key: string, qs = '') => call(ctx, 'GET', `/api/v1/settings/values/${key}${qs ? `?${qs}` : ''}`);

beforeAll(async () => {
  ctx = await setupTenant();
  const t = await db.selectFrom('tenants').select('id').where('code', '=', ctx.tenantCode).executeTakeFirstOrThrow();
  tenantId = String(t.id);
  ownerId = String((await db.selectFrom('users').select('id').where('tenant_id', '=', tenantId).orderBy('id').executeTakeFirstOrThrow()).id);
  branchId = String((await db.selectFrom('branches').select('id').where('tenant_id', '=', tenantId).orderBy('id').executeTakeFirstOrThrow()).id);
  await call(ctx, 'POST', '/api/v1/users', { email: 'xem-cauhinh@ketoan.local', fullName: 'Người xem cấu hình', role: 'viewer', password: 'Xem@12345' });
  const login = (await ctx.app.inject({ method: 'POST', url: '/api/v1/auth/login', payload: { tenantCode: ctx.tenantCode, email: 'xem-cauhinh@ketoan.local', password: 'Xem@12345' } })).json();
  viewer = { authorization: `Bearer ${login.data.token}` };
  viewerId = String((await db.selectFrom('users').select('id').where('tenant_id', '=', tenantId).where('email', '=', 'xem-cauhinh@ketoan.local').executeTakeFirstOrThrow()).id);
});
afterAll(async () => {
  await ctx.app.close();
  await closeDb();
});

describe('Danh sách và khuôn giá trị', () => {
  it('liệt kê khoá có valueType, kèm configVersion; khoá không có valueType không đi đường chung', async () => {
    const res = await call(ctx, 'GET', '/api/v1/settings/values');
    expect(res.status).toBe(200);
    const keys = res.body.data.items.map((i: any) => i.key);
    expect(keys).toEqual(expect.arrayContaining(['bizcity.item.auto_create', 'bizcity.ui.theme', 'bizcity.intake.retention_days']));
    expect(keys).not.toContain('bizcity.posting.modes');
    expect(typeof res.body.data.configVersion).toBe('number');
    expect((await put('bizcity.posting.modes', { value: {} })).status).toBe(400);
    expect((await put('bizcity.khong.co', { value: 1 })).status).toBe(404);
  });

  it('giá trị sai khuôn bị từ chối, nói rõ khuôn đúng', async () => {
    const bad = await put('bizcity.item.auto_create', { value: 'maybe', reason: 'thử' });
    expect(bad.status).toBe(400);
    expect(bad.body.error.message).toMatch(/on \/ off/);
    expect((await put('bizcity.intake.retention_days', { value: 0 })).status).toBe(400);
    expect((await put('bizcity.intake.accept_roles', { value: ['owner', 'owner'] })).status).toBe(400);
  });
});

describe('Khoá cũ ở tenants.settings: ghi song song, lịch sử, theo ngày', () => {
  it('ghi = phiên bản mới + nhánh JSON cũ + nhật ký + configVersion tăng; đường đọc cũ thấy ngay', async () => {
    const cv0 = (await get('bizcity.item.auto_create')).body.data.configVersion;
    const res = await put('bizcity.item.auto_create', { value: 'off', reason: 'Kiểm danh mục chặt hơn' });
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ value: 'off', before: 'on', source: { scope: 'tenant', version: 1 } });
    expect(res.body.data.configVersion).toBe(cv0 + 1);
    const t = await db.selectFrom('tenants').select('settings').where('id', '=', tenantId).executeTakeFirstOrThrow();
    expect((t.settings as any).item.autoCreate).toBe('off');
    // Route riêng cũ (HT09) đọc nhánh JSON — cùng giá trị.
    expect((await call(ctx, 'GET', '/api/v1/settings/item-auto-create')).body.data.mode).toBe('off');
    expect((await get('bizcity.item.auto_create')).body.data).toMatchObject({ value: 'off', source: 'legacy' });
    const audit = await auditRows(tenantId, 'settings.set', 'bizcity.item.auto_create');
    expect(audit.at(-1)?.after).toMatchObject({ value: 'off', version: 1, reason: 'Kiểm danh mục chặt hơn' });
  });

  it('hiệu lực lùi cần lý do; không đè giá trị hiện hành; đọc theo ngày quá khứ ra đúng phiên bản', async () => {
    expect((await put('bizcity.item.auto_create', { value: 'on', validFrom: '2020-01-01' })).status).toBe(400);
    const back = await put('bizcity.item.auto_create', { value: 'on', validFrom: '2020-01-01', reason: 'Ghi nhận chế độ từ lúc mở sổ' });
    expect(back.status).toBe(200);
    expect(back.body.data.source.version).toBe(2);
    // Hiện hành vẫn là phiên bản hiệu lực muộn hơn (off) — nhánh JSON không bị đè.
    const t = await db.selectFrom('tenants').select('settings').where('id', '=', tenantId).executeTakeFirstOrThrow();
    expect((t.settings as any).item.autoCreate).toBe('off');
    expect((await get('bizcity.item.auto_create', 'date=2021-06-30')).body.data).toMatchObject({ value: 'on', source: { validFrom: '2020-01-01', version: 2 } });
    const hist = (await call(ctx, 'GET', '/api/v1/settings/values/bizcity.item.auto_create/history')).body.data.versions;
    expect(hist.map((v: any) => v.version)).toEqual([2, 1]);
    expect(hist[0]).toMatchObject({ value: 'on', reason: 'Ghi nhận chế độ từ lúc mở sổ', by: expect.stringMatching(/^user:/) });
  });

  it('khoá còn đường đọc cũ chưa nhận ngày hiệu lực tương lai', async () => {
    const res = await put('bizcity.item.auto_create', { value: 'on', validFrom: '2099-01-01', reason: 'Tương lai' });
    expect(res.status).toBe(400);
    expect(res.body.error.message).toMatch(/đường đọc cũ/);
  });

  it('ngày quá khứ chưa có phiên bản: trả giá trị nhánh JSON (biết từ trước khi có lịch sử), không rơi về mặc định', async () => {
    await sql`UPDATE tenants SET settings = COALESCE(settings, '{}'::jsonb) || jsonb_build_object('intake', COALESCE(settings -> 'intake', '{}'::jsonb) || '{"openAlertDays": 9}'::jsonb) WHERE id = ${tenantId}`.execute(db);
    expect((await get('bizcity.intake.open_alert_days', 'date=2019-01-01')).body.data).toMatchObject({ value: 9, source: 'legacy' });
  });
});

describe('Khoá mới ở setting_values: phạm vi hẹp thắng, ngày hiệu lực tương lai', () => {
  it('mặc định → đơn vị → chi nhánh → người dùng (hẹp thắng trước)', async () => {
    expect((await get('bizcity.ui.theme')).body.data).toMatchObject({ value: 'light', source: 'default' });
    expect((await put('bizcity.ui.theme', { value: 'dark' })).status).toBe(200);
    expect((await put('bizcity.ui.theme', { value: 'system', scope: 'branch', scopeId: branchId })).status).toBe(200);
    expect((await put('bizcity.ui.theme', { value: 'light', scope: 'user', scopeId: ownerId })).status).toBe(200);
    expect((await get('bizcity.ui.theme', `userId=${ownerId}&branchId=${branchId}`)).body.data).toMatchObject({ value: 'light', source: { scope: 'user' } });
    expect((await get('bizcity.ui.theme', `userId=${viewerId}&branchId=${branchId}`)).body.data).toMatchObject({ value: 'system', source: { scope: 'branch' } });
    expect((await get('bizcity.ui.theme', `userId=${viewerId}`)).body.data).toMatchObject({ value: 'dark', source: { scope: 'tenant' } });
    // Không truyền userId: đọc theo chính người gọi.
    expect((await get('bizcity.ui.theme')).body.data.value).toBe('light');
  });

  it('phạm vi không khai cho khoá / phạm vi trỏ bản ghi không có → từ chối', async () => {
    expect((await put('bizcity.ui.theme', { value: 'dark', scope: 'accounting_unit', scopeId: '1' })).status).toBe(400);
    expect((await put('bizcity.ui.theme', { value: 'dark', scope: 'branch', scopeId: '999999999' })).status).toBe(404);
    expect((await put('bizcity.item.auto_create', { value: 'on', scope: 'branch', scopeId: branchId })).status).toBe(400);
  });

  it('ngày hiệu lực tương lai: hôm nay chưa đổi, tới ngày thì đổi', async () => {
    expect((await put('bizcity.ui.theme', { value: 'system', validFrom: '2099-01-01' })).status).toBe(200);
    expect((await get('bizcity.ui.theme', `userId=${viewerId}`)).body.data.value).toBe('dark');
    expect((await get('bizcity.ui.theme', `userId=${viewerId}&date=2099-02-01`)).body.data).toMatchObject({ value: 'system', source: { validFrom: '2099-01-01' } });
  });
});

describe('Quyền và bất biến', () => {
  it('người xem không ghi được, không đọc cấu hình người dùng khác; đọc của chính mình được', async () => {
    const w = await ctx.app.inject({ method: 'PUT', url: '/api/v1/settings/values/bizcity.ui.theme', payload: { value: 'dark' }, headers: { ...viewer, 'idempotency-key': 'xem-ghi-1' } });
    expect(w.statusCode).toBe(403);
    expect((await ctx.app.inject({ method: 'GET', url: `/api/v1/settings/values/bizcity.ui.theme?userId=${ownerId}`, headers: viewer })).statusCode).toBe(403);
    const mine = await ctx.app.inject({ method: 'GET', url: '/api/v1/settings/values/bizcity.ui.theme', headers: viewer });
    expect(mine.statusCode).toBe(200);
    expect(mine.json().data.value).toBe('dark');
  });

  it('kho chỉ thêm: CSDL chặn sửa / xoá phiên bản cũ', async () => {
    await expect(sql`UPDATE setting_values SET value = '"x"'::jsonb WHERE tenant_id = ${tenantId}`.execute(db)).rejects.toThrow(/chỉ thêm/);
    await expect(sql`DELETE FROM setting_values WHERE tenant_id = ${tenantId}`.execute(db)).rejects.toThrow(/chỉ thêm/);
  });
});
