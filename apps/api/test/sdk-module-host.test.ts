/**
 * PHASE-014 W1 — chỗ nạp module SDK (modules/<key>/, BIZCITY-EXTENSION §3). Module thử: test/fixtures/sdk-modules/ghi-chu.
 *   T014-1  module có trong registry (sync), API nạp: route /api/v1/m/ghi-chu/notes sinh từ action, ghi đọc bảng mod_ghi_chu.notes
 *   T014-2  quyền khai trong manifest (roles) có hiệu lực: viewer đọc được, không ghi được (403)
 *   T014-3  RLS: đơn vị khác không thấy ghi chú
 *   T014-4  tắt module ở một đơn vị → MODULE_DISABLED ở đơn vị đó, đơn vị khác vẫn chạy
 *   T014-5  manifest có trong danh sách module bật; subscriber đã đăng ký
 *   T014-6  lỗi là dừng: mã không export defineModule; khoá trùng phân hệ của Core
 * PHASE-014 W4 — khe hở ca chuẩn Hợp đồng (G1–G6), cùng module thử, chạy ở đơn vị B (đơn vị A đã tắt module ở T014-4):
 *   T014-9   G1 workflow YAML của module dùng quyền <module>:<việc>; quyền Core gõ sai vẫn bị bắt
 *   T014-10  G2 khoá cấu hình module tự khai (settings.registry.json): ctx.settings.get đọc mặc định
 *   T014-11  G3 hook masterdata.referenceCheck: đối tượng có ghi chú → Core không cho xoá; không ghi chú → xoá được
 *   T014-12  G4 + G6 subscriber đọc bảng module (ctx.module), gửi thông báo (ctx.notify); giao lại không gửi trùng; người dùng xem, đánh dấu đã đọc
 */
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { FastifyInstance } from 'fastify';
import { sql } from 'kysely';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { forgetTenantModules } from '@bizcity/platform/core/module-registry';
import { runModuleMigrations } from '@bizcity/platform/db/module-db';
import { dispatchOnce, emitEvent, listSubscribers } from '../src/core/events.js';
import { parseWorkflow } from '@bizcity/module-sdk';
import { buildApp } from '../src/app.js';
import { bundledModules, syncBundled } from '../src/core/module-lifecycle.js';
import { discoverSdkModules, importSdkModule } from '../src/core/sdk-modules.js';
import { db } from '../src/db/client.js';
import { setupTenant, type TestCtx } from './helpers.js';

const MODS = fileURLToPath(new URL('./fixtures/sdk-modules/', import.meta.url));
const tmp: string[] = [];
let a: TestCtx, b: TestCtx;
let app: FastifyInstance;
let tA = '';
const asOwner = <T>(fn: (trx: typeof db) => Promise<T>) => db.transaction().execute(async (trx) => {
  await sql`SET LOCAL ROLE NONE`.execute(trx);
  return fn(trx as unknown as typeof db);
});
const req = (method: 'GET' | 'POST' | 'PUT' | 'DELETE', url: string, token: string, payload?: unknown) =>
  app.inject({ method, url, payload: payload as never, headers: { authorization: `Bearer ${token}`, 'idempotency-key': `w1-${Math.random().toString(36).slice(2, 12)}` } });
const login = async (email: string, password: string) =>
  (await app.inject({ method: 'POST', url: '/api/v1/auth/login', payload: { tenantCode: a.tenantCode, email, password } })).json().data.token as string;

beforeAll(async () => {
  a = await setupTenant();
  b = await setupTenant();
  tA = (await db.selectFrom('tenants').select('id').where('code', '=', a.tenantCode).executeTakeFirstOrThrow()).id;
  await runModuleMigrations('ghi-chu', path.join(MODS, 'ghi-chu', 'migrations'));
  await asOwner((trx) => syncBundled('test:sdk-module-host', trx, MODS));
  app = await buildApp({ modulesDir: MODS });
});
afterAll(async () => {
  await app?.close();
  await asOwner(async (trx) => {
    await sql`DROP SCHEMA IF EXISTS mod_ghi_chu CASCADE`.execute(trx);
    await sql`DELETE FROM schema_migrations WHERE module = 'ghi-chu'`.execute(trx);
    await sql`DELETE FROM tenant_modules WHERE module_key = 'ghi-chu'`.execute(trx);
    await sql`DELETE FROM module_registry WHERE key = 'ghi-chu'`.execute(trx);
  });
  for (const d of tmp) rmSync(d, { recursive: true, force: true });
  await a.app.close();
  await b.app.close();
});

describe('Chỗ nạp module SDK', () => {
  it('T014-1: route sinh từ action dưới /api/v1/m/<key>/, ghi đọc bảng của module', async () => {
    const w = await req('POST', '/api/v1/m/ghi-chu/notes', a.token, { body: 'Gọi lại khách ngày 5' });
    expect(w.statusCode, w.body).toBe(200);
    const id = w.json().data.id as string;
    const r = await req('GET', '/api/v1/m/ghi-chu/notes', a.token);
    expect(r.statusCode, r.body).toBe(200);
    expect(r.json().data.items).toEqual([{ id, body: 'Gọi lại khách ngày 5' }]);
  });

  it('T014-2: quyền theo manifest — viewer đọc được, không ghi được', async () => {
    expect((await req('POST', '/api/v1/users', a.token, { email: 'xem@ketoan.local', fullName: 'Người xem', role: 'viewer', password: 'Xem@12345' })).statusCode).toBe(201);
    const v = await login('xem@ketoan.local', 'Xem@12345');
    expect((await req('GET', '/api/v1/m/ghi-chu/notes', v)).statusCode).toBe(200);
    expect((await req('POST', '/api/v1/m/ghi-chu/notes', v, { body: 'x' })).statusCode).toBe(403);
  });

  it('T014-3: đơn vị khác không thấy ghi chú (RLS)', async () => {
    const r = await req('GET', '/api/v1/m/ghi-chu/notes', b.token);
    expect(r.statusCode, r.body).toBe(200);
    expect(r.json().data.items).toEqual([]);
  });

  it('T014-4: tắt module ở một đơn vị → MODULE_DISABLED ở đơn vị đó, đơn vị khác vẫn chạy', async () => {
    await asOwner((trx) => trx.insertInto('tenant_modules').values({ tenant_id: tA, module_key: 'ghi-chu', enabled: false, changed_by: 'test', reason: 'thử cổng' }).execute());
    forgetTenantModules(tA);
    const off = await req('GET', '/api/v1/m/ghi-chu/notes', a.token);
    expect(off.json().error?.code, off.body).toBe('MODULE_DISABLED');
    expect((await req('GET', '/api/v1/m/ghi-chu/notes', b.token)).statusCode).toBe(200);
  });

  it('T014-5: manifest trong danh sách module bật; subscriber đã đăng ký', () => {
    expect(app.enabledModules).toContain('ghi-chu');
    expect(app.moduleManifests.map((m) => m.key)).toContain('ghi-chu');
    expect(listSubscribers().map((s) => s.id)).toContain('ghi-chu.daily');
  });

  it('T014-6: lỗi là dừng — mã không export defineModule; khoá trùng phân hệ Core', async () => {
    const root = mkdtempSync(path.join(tmpdir(), 'sdk-mod-'));
    tmp.push(root);
    const manifest = (key: string) => JSON.stringify({ contract: 'bizcity_module@1', id: `bizcity.${key}`, key, kind: 'module', version: '0.1.0', label: key, owners: ['@hoanganh8389'], standard: '^1.0', requires: { capabilities: [] } });
    mkdirSync(path.join(root, 'hong', 'api'), { recursive: true });
    writeFileSync(path.join(root, 'hong', 'bizcity.module.json'), manifest('hong'));
    writeFileSync(path.join(root, 'hong', 'api', 'index.ts'), 'export default { ten: "không phải module" };\n');
    const [hong] = discoverSdkModules(root);
    await expect(importSdkModule(hong!)).rejects.toThrow(/defineModule/);
    mkdirSync(path.join(root, 'kho'));
    writeFileSync(path.join(root, 'kho', 'bizcity.module.json'), manifest('kho'));
    expect(() => bundledModules(root)).toThrow(/trùng mã phân hệ/);
  });

  it('T014-9: G1 workflow của module dùng quyền <module>:<việc>; quyền Core gõ sai bị bắt', () => {
    const yaml = (perm: string) => `type: ghi-chu.note
label: Ghi chú
states:
  draft: { group: draft }
  done: { group: done }
transitions:
  close: { title: Đóng, from: [draft], to: done, permission: ${perm}, sod: true }
`;
    const wf = parseWorkflow(yaml('ghi-chu:write'), 'ghi-chu.note.workflow.yaml');
    expect(wf.plan('close', { status: 'draft', createdBy: 'user:1' }, { id: 'user:2', can: (p) => p === 'ghi-chu:write' }).to).toBe('done');
    expect(() => wf.plan('close', { status: 'draft', createdBy: 'user:1' }, { id: 'user:1', can: () => true })).toThrow(/tách nhiệm/);
    expect(() => parseWorkflow(yaml('documents:fly'), 'x.workflow.yaml')).toThrow();
  });

  it('T014-10: G2 khoá cấu hình của module — mặc định 40 ký tự chặn ghi chú dài', async () => {
    const long = await req('POST', '/api/v1/m/ghi-chu/notes', b.token, { body: 'x'.repeat(41) });
    expect(long.json().error?.message, long.body).toMatch(/40 ký tự/);
    expect((await req('POST', '/api/v1/m/ghi-chu/notes', b.token, { body: 'x'.repeat(40) })).statusCode).toBe(200);
  });

  it('T014-11: G3 đối tượng có ghi chú → Core không cho xoá (referenceCheck); không có → xoá được', async () => {
    for (const code of ['KH-GHICHU', 'KH-TRONG']) expect((await req('PUT', `/api/v1/partners/${code}`, b.token, { name: code, kind: 'customer' })).statusCode).toBeLessThan(300);
    expect((await req('POST', '/api/v1/m/ghi-chu/notes', b.token, { body: 'Hỏi lại báo giá', partnerCode: 'KH-GHICHU' })).statusCode).toBe(200);
    const del = await req('DELETE', '/api/v1/partners/KH-GHICHU', b.token);
    expect(del.statusCode, del.body).toBe(409);
    expect(del.json().error.message).toMatch(/ghi-chu: 1 ghi chú/);
    expect((await req('DELETE', '/api/v1/partners/KH-TRONG', b.token)).statusCode).toBe(200);
  });

  it('T014-12: G4 + G6 đồng hồ ngày → subscriber đếm bảng module, gửi thông báo một lần; người dùng xem, đánh dấu đã đọc', async () => {
    const tB = (await db.selectFrom('tenants').select('id').where('code', '=', b.tenantCode).executeTakeFirstOrThrow()).id;
    await db.transaction().execute((trx) => emitEvent(trx, { tenantId: tB, type: 'bizcity.clock.daily', subject: 'clock:test', source: 'bizcity.platform', actor: { kind: 'system', id: 'test' } }));
    await dispatchOnce({ consumers: ['ghi-chu.daily'], tenantId: tB, limit: 10 });
    await dispatchOnce({ consumers: ['ghi-chu.daily'], tenantId: tB, limit: 10 });
    const list = await req('GET', '/api/v1/notifications', b.token);
    expect(list.statusCode, list.body).toBe(200);
    const mine = list.json().data.items.filter((i: { source: string }) => i.source === 'ghi-chu');
    expect(mine).toHaveLength(1);
    expect(mine[0]).toMatchObject({ title: 'Có 2 ghi chú', link: '/app/ghi-chu/danh-sach', read: false });
    expect((await req('POST', '/api/v1/notifications/read', b.token, { ids: [mine[0].id] })).json().data.marked).toBe(1);
    expect((await req('GET', '/api/v1/notifications', b.token)).json().data.unread).toBe(0);
    expect((await req('GET', '/api/v1/notifications', a.token)).json().data.items).toEqual([]);
  });
});
