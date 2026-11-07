// [2026-11-06 02:40 PM Johnny Chu - Chu Hoàng Anh] PHASE-030 — S030-39: GET /api/v1/settings/overview — T030-CFG-VIEW-1..6 (chữ chốt: docs/phases/PHASE-030-THU-VIEN-NGHIEP-VU-ERP-VN/24-CAU-HINH-HE-THONG.md)
/**
 * Tổng quan cấu hình cho màn HT13 (chỉ đọc).
 *   T030-CFG-VIEW-1  trả đủ mọi khoá registry, mỗi khoá có nhóm; không khoá nào rơi vào nhóm lạ
 *   T030-CFG-VIEW-2  khoá có phiên bản có giá trị + nguồn; khoá chưa đi đường chung không có giá trị
 *   T030-CFG-VIEW-3  khoá bí mật: có dòng, có cờ secret, KHÔNG có giá trị — kể cả khi đơn vị đã lưu bí mật trong cấu hình (D030-13)
 *   T030-CFG-VIEW-4  đổi một khoá: số phiên bản, thay đổi gần nhất (người, lý do) và bản sắp hiệu lực hiện đúng; sức khoẻ đếm đúng
 *   T030-CFG-VIEW-5  cô lập đơn vị; người chỉ xem đọc được; chưa đăng nhập 401
 *   T030-CFG-VIEW-6  căn cứ: khoá loại A có căn cứ mặc định ở registry, khoá còn lại thiếu (S030-43)
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { sql } from 'kysely';
import { db } from '../src/db/client.js';
import { settingsRegistry } from '@bizcity/platform/core/settings';
import { groupOf, isSecretKey } from '../src/modules/system/settings-overview.routes.js';
import { call, setupTenant, type TestCtx } from './helpers.js';

let ctx: TestCtx, other: TestCtx, viewer: TestCtx;
let tenantId = '';
const SECRET = 'sk-test-BI-MAT-khong-duoc-lo-9f3a';

async function viewerOf(c: TestCtx, email: string): Promise<TestCtx> {
  expect((await call(c, 'POST', '/api/v1/users', { email, fullName: 'xem', role: 'viewer', password: 'Pass@12345' })).status).toBe(201);
  const login = await c.app.inject({ method: 'POST', url: '/api/v1/auth/login', payload: { tenantCode: c.tenantCode, email, password: 'Pass@12345' } });
  return { ...c, token: login.json().data.token };
}

beforeAll(async () => {
  ctx = await setupTenant();
  other = await setupTenant();
  tenantId = (await db.selectFrom('tenants').select('id').where('code', '=', ctx.tenantCode).executeTakeFirstOrThrow()).id;
  viewer = await viewerOf(ctx, 'xem-cau-hinh@ketoan.local');
  // Đơn vị đã lưu một bí mật trong nhánh cấu hình kết nối: màn tổng quan không được lộ.
  await sql`UPDATE tenants SET settings = jsonb_set(coalesce(settings, '{}'::jsonb), '{connections}', ${JSON.stringify({ pos: { apiKey: SECRET } })}::jsonb) WHERE id = ${tenantId}`.execute(db);
});
afterAll(async () => {
  await ctx.app.close();
  await other.app.close();
});

const overview = async (c: TestCtx) => {
  const r = await call(c, 'GET', '/api/v1/settings/overview');
  expect(r.status, JSON.stringify(r.body)).toBe(200);
  return r.body.data as { configVersion: number; today: string; health: Record<string, number | null>; items: Array<Record<string, any>> };
};

describe('T030-CFG-VIEW — tổng quan cấu hình (HT13 chỉ đọc)', () => {
  it('T030-CFG-VIEW-1 đủ mọi khoá registry, mỗi khoá có nhóm hợp lệ', async () => {
    const d = await overview(ctx);
    const reg = [...settingsRegistry().keys()].sort();
    expect(d.items.map((i) => i.key)).toEqual(reg);
    expect(d.health.total).toBe(reg.length);
    for (const i of d.items) {
      expect(['duyet', 'ketoan', 'nhaplieu', 'he-thong'], i.key).toContain(i.group);
      expect(i.group).toBe(groupOf(i.key));
      expect(['A', 'B', 'C', null]).toContain(i.class);
      expect(i.scopes.length).toBeGreaterThan(0);
    }
    expect(d.items.find((i) => i.key === 'bizcity.lock.period')).toMatchObject({ group: 'duyet', class: 'A' });
    expect(d.items.find((i) => i.key === 'bizcity.posting.tax_codes')).toMatchObject({ group: 'ketoan', class: 'A' });
    expect(d.items.find((i) => i.key === 'bizcity.intake.retention_days')).toMatchObject({ group: 'nhaplieu', class: 'C' });
  });

  it('T030-CFG-VIEW-2 khoá có phiên bản có giá trị + nguồn; khoá chưa đi đường chung không có giá trị', async () => {
    const d = await overview(ctx);
    for (const i of d.items) {
      if (i.versioned && !i.secret) {
        expect(i.current, i.key).not.toBeNull();
        expect(i.current).toHaveProperty('value');
        expect(i.current).toHaveProperty('source');
      } else {
        expect(i.current, i.key).toBeNull();
      }
    }
    expect(d.items.find((i) => i.key === 'bizcity.intake.retention_days')?.current).toMatchObject({ value: 90, source: 'default' });
    expect(d.items.filter((i) => i.versioned).length).toBe(d.health.versioned);
    expect(d.items.find((i) => i.key === 'bizcity.posting.tax_codes')).toMatchObject({ versioned: false, current: null, storage: expect.stringContaining('tax_codes') });
  });

  it('T030-CFG-VIEW-3 khoá bí mật có dòng và cờ secret nhưng không bao giờ có giá trị', async () => {
    const d = await overview(ctx);
    const conn = d.items.find((i) => i.key === 'bizcity.connector.connections')!;
    expect(conn).toMatchObject({ secret: true, current: null });
    expect(JSON.stringify(d)).not.toContain(SECRET);
    expect(isSecretKey('bizcity.connector.connections')).toBe(true);
    expect(isSecretKey('bizcity.ui.theme')).toBe(false);
    expect(isSecretKey('bizcity.tenant.logo')).toBe(false);
  });

  it('T030-CFG-VIEW-4 đổi một khoá: phiên bản, thay đổi gần nhất, bản sắp hiệu lực, sức khoẻ', async () => {
    const before = await overview(ctx);
    expect(before.health.changedRecently).toBe(0);
    expect(before.items.find((i) => i.key === 'bizcity.intake.retention_days')).toMatchObject({ versions: 0, lastChange: null, upcoming: null });
    expect(before.items.find((i) => i.key === 'bizcity.ui.theme')).toMatchObject({ versions: 0, upcoming: null, current: { value: 'light', source: 'default' } });

    const put = await call(ctx, 'PUT', '/api/v1/settings/values/bizcity.intake.retention_days', { value: 60, reason: 'Rút ngắn thời hạn giữ' });
    expect(put.status, JSON.stringify(put.body)).toBe(200);
    // Khoá còn đường đọc cũ chưa nhận ngày hiệu lực tương lai (E2 đợt 2): dùng khoá lưu thẳng ở setting_values.
    const future = addDays(before.today, 40);
    const put2 = await call(ctx, 'PUT', '/api/v1/settings/values/bizcity.ui.theme', { value: 'dark', validFrom: future, reason: 'Từ kỳ sau' });
    expect(put2.status, JSON.stringify(put2.body)).toBe(200);

    const d = await overview(ctx);
    const row = d.items.find((i) => i.key === 'bizcity.intake.retention_days')!;
    expect(row.versions).toBe(1);
    expect(row.current).toMatchObject({ value: 60 });
    expect(row.lastChange).toMatchObject({ version: 1, reason: 'Rút ngắn thời hạn giữ' });
    expect(row.lastChange.by).toMatch(/^user:/);
    expect(row.upcoming).toBeNull();
    const theme = d.items.find((i) => i.key === 'bizcity.ui.theme')!;
    expect(theme).toMatchObject({ versions: 1, current: { value: 'light' }, lastChange: { reason: 'Từ kỳ sau', validFrom: future }, upcoming: { validFrom: future, version: 1 } });
    expect(d.health).toMatchObject({ changedRecently: 2, changedRecentlyClassA: 0, upcoming: 1 });
    expect(d.configVersion).toBeGreaterThan(before.configVersion);
    // khoá khác không bị ảnh hưởng
    expect(d.items.find((i) => i.key === 'bizcity.intake.open_alert_days')).toMatchObject({ versions: 0, lastChange: null, upcoming: null });
  });

  it('T030-CFG-VIEW-5 cô lập đơn vị; người chỉ xem đọc được; chưa đăng nhập 401', async () => {
    const o = await overview(other);
    expect(o.items.find((i) => i.key === 'bizcity.intake.retention_days')).toMatchObject({ versions: 0, lastChange: null, upcoming: null, current: { value: 90 } });
    expect(o.health.changedRecently).toBe(0);
    const v = await overview(viewer);
    expect(v.items.find((i) => i.key === 'bizcity.intake.retention_days')).toMatchObject({ versions: 1 });
    const anon = await ctx.app.inject({ method: 'GET', url: '/api/v1/settings/overview' });
    expect(anon.statusCode).toBe(401);
  });

  it('T030-CFG-VIEW-6 căn cứ: khoá loại A đã khai có căn cứ mặc định ở registry, khoá chưa khai thì thiếu (S030-43)', async () => {
    const d = await overview(ctx);
    const reg = settingsRegistry();
    for (const i of d.items) {
      const want = reg.get(i.key)?.basis ?? null;
      expect(i.basis, i.key).toEqual(want);
      expect(i.basisFrom, i.key).toBe(want ? 'registry' : null);
    }
    expect(d.health.withBasis).toBe(d.items.filter((i) => i.basis !== null).length);
    expect(d.health.missingBasis).toBe(d.items.length - d.health.withBasis!);
    expect(d.items.find((i) => i.key === 'bizcity.lock.period')?.basis).toBeTruthy();
    expect(d.items.find((i) => i.key === 'bizcity.tenant.logo')?.basis).toBeNull();
    expect(d.health.sealMissing === null || typeof d.health.sealMissing === 'number').toBe(true);
  });
});

function addDays(date: string, n: number): string {
  return new Date(Date.parse(`${date}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);
}
