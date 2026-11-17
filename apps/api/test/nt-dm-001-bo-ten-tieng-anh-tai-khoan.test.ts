// [2026-11-17 10:20 AM kiennt] NT-DM-001 — bỏ tên tiếng Anh của tài khoản (D023-9, PHASE-023 00 §9), ca T023-8 (đóng góp)
/**
 * NT-DM-001 / T023-8 — bỏ accounts.name_en.
 *   1. Migration 0147 trên CSDL TẠM (áp 0001..0146, có tài khoản đã khai tên tiếng Anh): giá trị khác rỗng chép sang
 *      accounts_name_en_luu, dòng trống không chép, cột bị xoá; chạy lại không lỗi, không chép trùng. CSDL tạm luôn bị xoá ở cuối.
 *   2. API tài khoản: không trả nameEn; tạo / sửa còn gửi nameEn thì bỏ qua, không lỗi.
 */
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import pg from 'pg';
import { env } from '../src/config/env.js';
import { call, setupTenant, type TestCtx } from './helpers.js';

const MIGRATIONS = path.resolve(__dirname, '../../../db/migrations');
const NAME = `ketoan_ntdm1_${Date.now()}${Math.floor(Math.random() * 1000)}`;
const withDb = (url: string, dbName: string) => { const u = new URL(url); u.pathname = `/${dbName}`; return u.toString(); };
const file0147 = () => readdirSync(MIGRATIONS).find((f) => /^0147_.+\.sql$/.test(f))!;

describe('NT-DM-001 — migration 0147 trên bản cài có tên tiếng Anh', () => {
  let admin: pg.Client;
  let tmp: pg.Client;
  let tenantId = '';

  beforeAll(async () => {
    admin = new pg.Client({ connectionString: withDb(env.DATABASE_URL, 'postgres') });
    await admin.connect();
    await admin.query(`CREATE DATABASE ${NAME}`);
    tmp = new pg.Client({ connectionString: withDb(env.DATABASE_URL, NAME) });
    await tmp.connect();
    await tmp.query('CREATE TABLE IF NOT EXISTS schema_migrations (name text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())');
    const files = readdirSync(MIGRATIONS).filter((f) => /^\d{4}_.+\.sql$/.test(f)).sort().filter((f) => f < '0147');
    for (const f of files) {
      try {
        await tmp.query('BEGIN');
        await tmp.query(readFileSync(path.join(MIGRATIONS, f), 'utf8'));
        await tmp.query('INSERT INTO schema_migrations (name) VALUES ($1)', [f]);
        await tmp.query('COMMIT');
      } catch (err) {
        await tmp.query('ROLLBACK').catch(() => undefined);
        throw new Error(`Migration ${f} lỗi trên CSDL tạm: ${(err as Error).message}`);
      }
    }
    tenantId = String((await tmp.query(`INSERT INTO tenants (code, name) VALUES ('ntdm1', 'Đơn vị NT-DM-001') RETURNING id`)).rows[0].id);
    await tmp.query(
      `INSERT INTO accounts (tenant_id, code, name, name_en) VALUES ($1, '1111', 'Tiền Việt Nam', ' Cash in VND '), ($1, '131', 'Phải thu của khách hàng', NULL), ($1, '331', 'Phải trả cho người bán', '   ')`,
      [tenantId],
    );
  }, 180_000);

  afterAll(async () => {
    await tmp?.end().catch(() => undefined);
    await admin?.query(`DROP DATABASE IF EXISTS ${NAME} WITH (FORCE)`).catch(() => undefined);
    await admin?.end().catch(() => undefined);
  });

  it('chép tên tiếng Anh khác rỗng sang accounts_name_en_luu rồi xoá cột accounts.name_en', async () => {
    await tmp.query(readFileSync(path.join(MIGRATIONS, file0147()), 'utf8'));
    const col = await tmp.query(`SELECT 1 FROM information_schema.columns WHERE table_name = 'accounts' AND column_name = 'name_en'`);
    expect(col.rowCount).toBe(0);
    const luu = await tmp.query('SELECT code, name_en FROM accounts_name_en_luu WHERE tenant_id = $1 ORDER BY code', [tenantId]);
    expect(luu.rows).toEqual([{ code: '1111', name_en: 'Cash in VND' }]);
    expect((await tmp.query('SELECT count(*)::int AS n FROM accounts WHERE tenant_id = $1', [tenantId])).rows[0].n).toBe(3);
  });

  it('chạy lại migration: không lỗi, không chép trùng', async () => {
    await tmp.query(readFileSync(path.join(MIGRATIONS, file0147()), 'utf8'));
    expect((await tmp.query('SELECT count(*)::int AS n FROM accounts_name_en_luu WHERE tenant_id = $1', [tenantId])).rows[0].n).toBe(1);
  });
});

describe('NT-DM-001 — API tài khoản không còn nameEn', () => {
  let ctx: TestCtx;
  beforeAll(async () => { ctx = await setupTenant(); });
  afterAll(async () => { await ctx.app.close(); });

  it('danh sách tài khoản không trả nameEn', async () => {
    const r = await call<{ data: Record<string, unknown>[] }>(ctx, 'GET', '/api/v1/accounts');
    expect(r.status).toBe(200);
    expect(r.body.data.length).toBeGreaterThan(0);
    expect(r.body.data.some((a) => 'nameEn' in a)).toBe(false);
  });

  it('tạo / sửa tài khoản còn gửi nameEn (client cũ, tệp Excel cũ) thì bỏ qua, không lỗi', async () => {
    const c = await call(ctx, 'POST', '/api/v1/accounts', { code: '11111', name: 'Tiền mặt quầy 1', parentCode: '1111', nameEn: 'Cash desk 1' });
    expect(c.status, JSON.stringify(c.body)).toBeLessThan(300);
    expect('nameEn' in (c.body.data as object)).toBe(false);
    const u = await call(ctx, 'PATCH', '/api/v1/accounts/11111', { name: 'Tiền mặt quầy số 1', nameEn: 'Cash desk no. 1' });
    expect(u.status, JSON.stringify(u.body)).toBeLessThan(300);
    const one = (await call<{ data: { code: string; name: string }[] }>(ctx, 'GET', '/api/v1/accounts')).body.data.find((a) => a.code === '11111');
    expect(one).toMatchObject({ name: 'Tiền mặt quầy số 1' });
  });
});
