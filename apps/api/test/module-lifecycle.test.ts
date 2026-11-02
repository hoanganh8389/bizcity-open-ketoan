/**
 * Registry module + vòng đời (ADR-0011 D1, D2; PHASES 3.13):
 *   - hash thư mục module ổn định, đổi một byte là đổi hash;
 *   - syncBundled cài mọi module đi kèm (active), chạy lại không đổi gì; registry ghi lịch sử;
 *   - decideLoad: registry trống → nạp; chưa cài / không active → bỏ; hash lệch → bỏ (bản thật) hoặc cảnh báo (dev);
 *   - bật / tắt theo đơn vị (core.module.disable / enable): route của module → MODULE_DISABLED chỉ ở đơn vị đó, route dùng chung
 *     vẫn chạy, GET /system/modules bỏ module tắt, dry-run không đổi gì, module lõi không tắt được, sự kiện toggled + bằng chứng;
 *   - sự kiện tới subscriber của module tắt → việc giao 'skipped', không xử lý; bật lại thì sự kiện mới xử lý bình thường.
 */
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { sql } from 'kysely';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { decideLoad, forgetTenantModules, hashModuleDir, type RegistryRow } from '@bizcity/platform/core/module-registry';
import { bundledModules, missingCapabilities, setStatus, syncBundled } from '../src/core/module-lifecycle.js';
import { db } from '../src/db/client.js';
import { defineSubscriber, dispatchOnce, emitEvent, registerSubscribers } from '../src/core/events.js';
import { setupTenant, type TestCtx } from './helpers.js';

let ctx: TestCtx;
let other: TestCtx;
let tenantId = '';

/** Ghi registry cần vai trò sở hữu (ketoan_app chỉ đọc): SET LOCAL ROLE NONE trong giao dịch, như job cài đặt. */
const asOwner = <T>(fn: (trx: typeof db) => Promise<T>) => db.transaction().execute(async (trx) => {
  await sql`SET LOCAL ROLE NONE`.execute(trx);
  return fn(trx as unknown as typeof db);
});
const call = (method: 'GET' | 'POST', url: string, payload?: unknown, token = ctx.token) =>
  ctx.app.inject({ method, url, payload: payload as never, headers: { authorization: `Bearer ${token}`, 'idempotency-key': `mod-${Math.random().toString(36).slice(2)}` } });

let pinged = 0;
const probe = defineSubscriber({ id: 'quy.test-probe', module: 'quy', on: ['quy.test.pinged'], handle: async () => { pinged += 1; } });

beforeAll(async () => {
  registerSubscribers([probe]);
  ctx = await setupTenant();
  other = await setupTenant();
  tenantId = (await db.selectFrom('tenants').select('id').where('code', '=', ctx.tenantCode).executeTakeFirstOrThrow()).id;
});
afterAll(async () => {
  // Trả đơn vị thử về như cũ (bật Quỹ) để không ảnh hưởng tệp test khác.
  await call('POST', '/api/v1/system/modules/enable', { key: 'quy' });
  await ctx.app.close();
  await other.app.close();
});

describe('Hash thư mục module', () => {
  it('ổn định, không phụ thuộc thứ tự tạo tệp; đổi một byte → đổi hash', () => {
    const a = mkdtempSync(path.join(tmpdir(), 'mod-a-'));
    const b = mkdtempSync(path.join(tmpdir(), 'mod-b-'));
    try {
      mkdirSync(path.join(a, 'sub')); mkdirSync(path.join(b, 'sub'));
      writeFileSync(path.join(a, 'x.js'), 'export const x = 1;'); writeFileSync(path.join(a, 'sub', 'y.js'), 'y');
      writeFileSync(path.join(b, 'sub', 'y.js'), 'y'); writeFileSync(path.join(b, 'x.js'), 'export const x = 1;');
      expect(hashModuleDir(a)).toMatch(/^sha256:[0-9a-f]{64}$/);
      expect(hashModuleDir(a)).toBe(hashModuleDir(b));
      writeFileSync(path.join(b, 'x.js'), 'export const x = 2;');
      expect(hashModuleDir(a)).not.toBe(hashModuleDir(b));
    } finally {
      rmSync(a, { recursive: true, force: true }); rmSync(b, { recursive: true, force: true });
    }
  });
});

describe('Registry bản cài', () => {
  it('syncBundled cài mọi module đi kèm (active + hash), chạy lại không đổi gì', async () => {
    await asOwner((trx) => syncBundled('test', trx));
    const again = await asOwner((trx) => syncBundled('test', trx));
    expect(again).toEqual([]);
    const rows = await db.selectFrom('module_registry').select(['key', 'status', 'build_hash', 'source']).execute();
    for (const m of bundledModules()) {
      expect(rows.find((r) => r.key === m.key), m.key).toMatchObject({ status: 'active', source: 'bundled', build_hash: hashModuleDir(m.dir) });
    }
  });

  it('decideLoad: trống → nạp; chưa cài / không active → bỏ; hash lệch → bỏ ở bản thật, cảnh báo ở dev', () => {
    const row = (status: RegistryRow['status'], hash = 'sha256:' + 'a'.repeat(64)): Map<string, RegistryRow> =>
      new Map([['quy', { key: 'quy', kind: 'module', version: '1.0.0', source: 'bundled', build_hash: hash, status }]]);
    const h = 'sha256:' + 'a'.repeat(64);
    expect(decideLoad('quy', h, null, true)).toMatchObject({ load: true, result: 'loaded' });
    expect(decideLoad('kho', h, row('active'), true)).toMatchObject({ load: false, result: 'skipped_status' });
    expect(decideLoad('quy', h, row('disabled'), true)).toMatchObject({ load: false, result: 'skipped_status' });
    expect(decideLoad('quy', h, row('active'), true)).toMatchObject({ load: true, result: 'loaded' });
    expect(decideLoad('quy', 'sha256:' + 'b'.repeat(64), row('active'), true)).toMatchObject({ load: false, result: 'skipped_hash' });
    expect(decideLoad('quy', 'sha256:' + 'b'.repeat(64), row('active'), false)).toMatchObject({ load: true, warning: expect.stringContaining('hash') });
  });

  it('module lõi không tắt được trên bản cài; năng lực planned bị chặn khi bật', async () => {
    await expect(asOwner((trx) => setStatus('ke-toan', 'disabled', 'test', trx))).rejects.toThrow(/lõi/);
    expect(missingCapabilities(['ledger.submit'])).toEqual([]);
    expect(missingCapabilities(['ui.slots', 'khong.co'])).toEqual(['ui.slots', 'khong.co']);
  });
});

describe('Bật / tắt module theo đơn vị', () => {
  it('dry-run báo ảnh hưởng, không đổi gì', async () => {
    const res = await call('POST', '/api/v1/system/modules/disable?dryRun=1', { key: 'quy', reason: 'thử' });
    expect(res.statusCode, res.body).toBe(200);
    expect(res.json().data).toMatchObject({ key: 'quy', enabled: false, changed: true, impact: { pendingDocuments: expect.any(Number), postedEntries: expect.any(Number) } });
    expect((await call('GET', '/api/v1/payment-requests')).statusCode).toBe(200);
  });

  it('tắt Quỹ: route của Quỹ → MODULE_DISABLED ở đơn vị này, đơn vị khác vẫn chạy; route dùng chung vẫn chạy; danh sách bỏ quy', async () => {
    const res = await call('POST', '/api/v1/system/modules/disable', { key: 'quy', reason: 'Đơn vị chưa dùng Quỹ' });
    expect(res.json().data).toMatchObject({ enabled: false, changed: true });
    const blocked = await call('GET', '/api/v1/payment-requests');
    expect(blocked.statusCode).toBe(403);
    expect(blocked.json().error.code).toBe('MODULE_DISABLED');
    expect((await call('GET', '/api/v1/payment-requests', undefined, other.token)).statusCode).toBe(200);
    expect((await call('GET', '/api/v1/reports/trial-balance?from=2026-01-01&to=2026-12-31')).statusCode).toBe(200);
    expect((await call('GET', '/api/v1/system/modules')).json().data).not.toContain('quy');
    const view = (await call('GET', '/api/v1/system/modules?view=tenant')).json().data as { key: string; enabled: boolean; required: boolean }[];
    expect(view.find((m) => m.key === 'quy')).toMatchObject({ enabled: false, required: false });
    expect(view.find((m) => m.key === 'ke-toan')).toMatchObject({ enabled: true, required: true });
    const evt = await db.selectFrom('event_outbox').select(['data']).where('tenant_id', '=', tenantId).where('type', '=', 'bizcity.module.toggled').orderBy('seq', 'desc').executeTakeFirstOrThrow();
    expect(evt.data).toMatchObject({ module: 'quy', enabled: false });
    const ev = await db.selectFrom('audit_logs').select(['action']).where('tenant_id', '=', tenantId).where('action', '=', 'core.module.disable').executeTakeFirst();
    expect(ev).toBeTruthy();
  });

  it('module lõi (ke-toan) không tắt được ở đơn vị', async () => {
    const res = await call('POST', '/api/v1/system/modules/disable', { key: 'ke-toan' });
    expect(res.json().error.code).toBe('VALIDATION_ERROR');
  });

  it('sự kiện tới subscriber của Quỹ khi Quỹ tắt → skipped, không xử lý; bật lại → sự kiện mới xử lý', async () => {
    const emit = () => db.transaction().execute((trx) => emitEvent(trx, { tenantId, type: 'quy.test.pinged', subject: 'probe', source: 'quy', actor: { kind: 'system', id: 'test' }, data: {} }));
    const id1 = await emit();
    pinged = 0;
    const r1 = await dispatchOnce({ consumers: ['quy.test-probe'], tenantId });
    expect(r1.skipped).toBeGreaterThan(0);
    expect(pinged).toBe(0);
    const d1 = await db.selectFrom('event_deliveries').select('status').where('consumer', '=', 'quy.test-probe').where('event_id', '=', id1!).executeTakeFirstOrThrow();
    expect(d1.status).toBe('skipped');

    await call('POST', '/api/v1/system/modules/enable', { key: 'quy' });
    forgetTenantModules(tenantId);
    expect((await call('GET', '/api/v1/payment-requests')).statusCode).toBe(200);
    await emit();
    await dispatchOnce({ consumers: ['quy.test-probe'], tenantId });
    expect(pinged).toBe(1);
  });
});
