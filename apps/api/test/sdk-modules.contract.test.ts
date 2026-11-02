/**
 * PHASE-014 W3 — test hợp đồng cho MỌI module SDK ở <gốc repo>/modules (hoặc đúng một module: BIZCITY_CHECK_MODULE=<key>,
 * `bizcity module check <key>` đặt biến này). Không có module nào → bỏ qua. Mỗi module, trên CSDL test:
 *   C-1  migration chạy bằng mod_<key>_owner; bảng khai ở data.tables có trong schema, FORCE RLS, COMMENT bảng + mọi cột
 *   C-2  action trong manifest = action trong defineModule (hai chiều); id, quyền mang tiền tố <key>
 *   C-3  quyền manifest mang tiền tố <key>:, vai trò hợp lệ; action ghi có idempotency (required | natural)
 *   C-4  API nạp module: mọi action GET không tham số đường dẫn trả 200 cho chủ đơn vị
 *   C-5  vai trò không có quyền ghi (viewer) gọi action POST → 403
 */
import path from 'node:path';
import type { FastifyInstance } from 'fastify';
import { sql } from 'kysely';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { ModuleDef } from '@bizcity/module-sdk';
import { moduleRoles, runModuleMigrations } from '@bizcity/platform/db/module-db';
import { ROLES } from '@ketoan/contracts';
import type { AuthContext } from '../src/core/auth.js';
import { runAction } from '../src/core/actions.js';
import { buildApp } from '../src/app.js';
import { syncBundled } from '../src/core/module-lifecycle.js';
import { discoverSdkModules, importSdkModule, modulesRoot } from '../src/core/sdk-modules.js';
import { db } from '../src/db/client.js';
import { setupTenant, type TestCtx } from './helpers.js';

const only = process.env.BIZCITY_CHECK_MODULE;
const all = discoverSdkModules(modulesRoot());
const targets = only ? all.filter((m) => m.key === only) : all;
if (only && !targets.length) throw new Error(`BIZCITY_CHECK_MODULE=${only}: không có modules/${only}/bizcity.module.json`);

const asOwner = <T>(fn: (trx: typeof db) => Promise<T>) => db.transaction().execute(async (trx) => {
  await sql`SET LOCAL ROLE NONE`.execute(trx);
  return fn(trx as unknown as typeof db);
});

describe.skipIf(!targets.length)('Hợp đồng module SDK', () => {
  let ctx: TestCtx;
  let app: FastifyInstance;
  let viewer = '';
  const defs = new Map<string, ModuleDef>();

  beforeAll(async () => {
    ctx = await setupTenant();
    for (const m of targets) {
      await runModuleMigrations(m.key, path.join(m.dir, 'migrations'), { reads: (m.manifest.data as { reads?: string[] } | undefined)?.reads ?? [] });
      defs.set(m.key, await importSdkModule(m));
    }
    await asOwner((trx) => syncBundled('test:module-contract', trx));
    app = await buildApp();
    const u = await app.inject({ method: 'POST', url: '/api/v1/users', headers: { authorization: `Bearer ${ctx.token}`, 'idempotency-key': 'mc-viewer' },
      payload: { email: 'xem-mc@ketoan.local', fullName: 'Người xem', role: 'viewer', password: 'Xem@12345' } });
    expect(u.statusCode, u.body).toBe(201);
    viewer = (await app.inject({ method: 'POST', url: '/api/v1/auth/login', payload: { tenantCode: ctx.tenantCode, email: 'xem-mc@ketoan.local', password: 'Xem@12345' } })).json().data.token;
  });
  afterAll(async () => {
    await app?.close();
    await ctx?.app.close();
  });

  for (const m of targets) {
    describe(m.key, () => {
      const key = m.key;
      const data = (m.manifest.data ?? {}) as { tables?: string[] };
      const perms = (m.manifest.permissions ?? []) as { key: string; roles?: string[] }[];

      it('C-1: bảng khai ở data.tables có trong schema mod_<key>, FORCE RLS, COMMENT bảng + mọi cột', async () => {
        const schema = moduleRoles(key).schema;
        for (const t of data.tables ?? []) {
          const r = await asOwner((trx) => sql<{ force: boolean; tcomment: string | null; missing: string[] }>`
            SELECT c.relforcerowsecurity AS force, obj_description(c.oid, 'pg_class') AS tcomment,
                   ARRAY(SELECT a.attname::text FROM pg_attribute a WHERE a.attrelid = c.oid AND a.attnum > 0 AND NOT a.attisdropped
                          AND col_description(c.oid, a.attnum) IS NULL AND a.attname NOT IN ('id')) AS missing
              FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname = ${schema} AND c.relname = ${t}`.execute(trx));
          const row = r.rows[0];
          expect(row, `bảng ${schema}.${t} khai ở data.tables nhưng migration không tạo`).toBeDefined();
          expect(row!.force, `${schema}.${t}: thiếu FORCE ROW LEVEL SECURITY`).toBe(true);
          expect(row!.tcomment, `${schema}.${t}: thiếu COMMENT ON TABLE`).toBeTruthy();
          expect(row!.missing, `${schema}.${t}: cột thiếu COMMENT`).toEqual([]);
        }
      });

      it('C-2: action manifest = action defineModule; id và quyền mang tiền tố module', () => {
        const def = defs.get(key)!;
        const code = def.actions.map((a) => a.id).sort();
        expect(code).toEqual([...((m.manifest.actions as string[] | undefined) ?? [])].sort());
        for (const a of def.actions) expect(a.id.startsWith(`${key}.`), a.id).toBe(true);
        for (const s of def.subscribers) expect(s.id.startsWith(`${key}.`), s.id).toBe(true);
      });

      it('C-3: quyền mang tiền tố <key>:, vai trò hợp lệ; action ghi có idempotency', () => {
        const roles = new Set<string>(Object.values(ROLES));
        for (const p of perms) {
          expect(p.key.startsWith(`${key}:`), p.key).toBe(true);
          for (const r of p.roles ?? []) expect(roles.has(r), `${p.key}: vai trò ${r}`).toBe(true);
        }
        for (const a of defs.get(key)!.actions.filter((x) => x.effect === 'write')) {
          expect(['required', 'natural'], `${a.id}: action ghi cần idempotency required | natural`).toContain(a.idempotency);
          expect(a.permission.startsWith(`${key}:`) || a.permission.includes(':'), a.id).toBe(true);
        }
      });

      it('C-4: mọi action GET không tham số đường dẫn trả 200 cho chủ đơn vị', async () => {
        for (const a of defs.get(key)!.actions) {
          const h = a.expose.http;
          if (!h || h.method !== 'GET' || h.path.includes(':')) continue;
          const r = await app.inject({ method: 'GET', url: `/api/v1/m/${key}${h.path}`, headers: { authorization: `Bearer ${ctx.token}` } });
          expect(r.statusCode, `${a.id}: ${r.body}`).toBe(200);
        }
      });

      it('C-5: vai trò viewer không có quyền ghi của module → action ghi bị từ chối (FORBIDDEN, trước khi kiểm input)', async () => {
        // Quyền thật của phiên viewer (registry quyền đã gộp roles của manifest), rồi chạy action qua runtime: runtime xét quyền
        // trước khi kiểm input — không cần dựng body hợp lệ (qua HTTP, Fastify kiểm khuôn body trước nên body rỗng ra 400).
        const me = await app.inject({ method: 'GET', url: '/api/v1/auth/me', headers: { authorization: `Bearer ${viewer}` } });
        const granted = new Set<string>(me.json().data.permissions);
        const tenantId = (await db.selectFrom('tenants').select('id').where('code', '=', ctx.tenantCode).executeTakeFirstOrThrow()).id;
        const auth: AuthContext = { tenantId, actor: 'user:viewer', actorName: 'Người xem', kind: 'user', role: 'viewer', permissions: granted as AuthContext['permissions'] };
        for (const a of defs.get(key)!.actions.filter((x) => x.effect === 'write')) {
          expect(granted.has(a.permission), `${a.id}: viewer không được có quyền ghi ${a.permission}`).toBe(false);
          await expect(runAction(a, {}, { auth, requestId: `mc-${a.id}`, idempotencyKey: `mc-${a.id}` }), a.id).rejects.toMatchObject({ code: 'FORBIDDEN' });
        }
        for (const p of perms.filter((x) => x.roles?.includes('viewer'))) expect(granted.has(p.key), `viewer phải có ${p.key} (roles trong manifest)`).toBe(true);
      });
    });
  }
});

