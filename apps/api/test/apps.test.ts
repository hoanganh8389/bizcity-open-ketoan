/**
 * App ngoài tiến trình (ADR-0011 mức 2, PHASES 3.14):
 *   - kết nối: khoá API + bí mật webhook trả một lần, phạm vi = app.scopes của manifest; kết nối hai lần → CONFLICT;
 *   - khoá app: chỉ quyền đã đồng ý; nộp chứng từ chỉ docKey `<app>:…` ở MỌI cửa nạp, nguồn = app, bằng chứng via app:<key>;
 *   - webhook: chỉ đơn vị đã kết nối có việc giao; POST ký HMAC đúng, Idempotency-Key = id sự kiện; non-2xx → thử lại;
 *   - tắt kết nối: khoá bị từ chối, sự kiện mới không giao; bật lại dùng tiếp; xoay khoá: khoá cũ hết hiệu lực;
 *   - vé iframe: chỉ người dùng xin được, không dùng làm phiên, chỉ khoá của đúng app đổi được;
 *   - manifest sai (quyền quản trị, origin có đường dẫn, sự kiện không webhook) → dừng lúc đăng ký.
 */
import { createHmac } from 'node:crypto';
import { createServer, type IncomingHttpHeaders, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { appManifestProblems, registerAppManifests, type AppManifest } from '@bizcity/platform/core/apps';
import { db } from '../src/db/client.js';
import { dispatchOnce } from '../src/core/events.js';
import { saleDoc, setupTenant, type TestCtx } from './helpers.js';

type Hit = { headers: IncomingHttpHeaders; body: string };
const hits: Hit[] = [];
let reply = 200;
let server: Server;
let ctx: TestCtx;
let tenantId = '';
let install: { apiKey: string; webhookSecret: string; permissions: string[]; events: string[] };

const manifest = (url: string): AppManifest => ({
  contract: 'bizcity_module@1', id: 'acme.pos-ngoai', key: 'pos-ngoai', kind: 'app', version: '0.1.0', label: 'POS ngoài', description: 'App bán lẻ chạy riêng (thử)',
  app: { scopes: ['documents:write', 'documents:read', 'catalog:read'], webhook: { url } },
  events: { subscribes: [{ type: 'bizcity.ledger.entry.posted', version: 1 }] },
  ui: { origin: 'https://pos.example.test', entry: '/nhung' },
});

const auth = (t = ctx.token) => ({ authorization: `Bearer ${t}` });
const asApp = (key = install.apiKey) => ({ 'x-api-key': key });
const submit = (doc: unknown, key?: string) => ctx.app.inject({ method: 'POST', url: '/api/v1/documents/submit', payload: { document: doc } as never, headers: asApp(key) });
const deliveries = (tid = tenantId) => db.selectFrom('event_deliveries').select(['event_id', 'status', 'attempts', 'last_error'])
  .where('tenant_id', '=', tid).where('consumer', '=', 'pos-ngoai.webhook').orderBy('event_id').execute();
const dispatch = () => dispatchOnce({ consumers: ['pos-ngoai.webhook'], tenantId, limit: 50 });
const appDoc = (no: string) => saleDoc({ docKey: `pos-ngoai:CN01:${no}`, docNo: no });

beforeAll(async () => {
  server = createServer((req, res) => {
    let body = '';
    req.on('data', (c) => { body += c; });
    req.on('end', () => { hits.push({ headers: req.headers, body }); res.writeHead(reply).end(); });
  });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  registerAppManifests([manifest(`http://127.0.0.1:${(server.address() as AddressInfo).port}/hook`)]);
  ctx = await setupTenant();
  tenantId = (await db.selectFrom('tenants').select('id').where('code', '=', ctx.tenantCode).executeTakeFirstOrThrow()).id;
});
afterAll(async () => {
  await ctx.app.close();
  await new Promise((r) => server.close(r));
});

describe('Kết nối app', () => {
  it('danh sách có app chưa kết nối; kết nối → khoá + bí mật một lần, phạm vi theo manifest; kết nối lại → CONFLICT', async () => {
    const list = await ctx.app.inject({ method: 'GET', url: '/api/v1/apps', headers: auth() });
    expect(list.json().data).toEqual(expect.arrayContaining([expect.objectContaining({ key: 'pos-ngoai', installation: null, ui: { origin: 'https://pos.example.test', entry: '/nhung' } })]));
    const res = await ctx.app.inject({ method: 'POST', url: '/api/v1/apps/pos-ngoai/install', headers: auth() });
    expect(res.statusCode, res.body).toBe(201);
    install = res.json().data;
    expect(install.webhookSecret).toMatch(/^whsec_/);
    expect(install.permissions).toEqual(['documents:write', 'documents:read', 'catalog:read']);
    expect(install.events).toEqual(['bizcity.ledger.entry.posted']);
    const key = await db.selectFrom('api_keys').select(['app_key', 'scopes']).where('tenant_id', '=', tenantId).where('app_key', '=', 'pos-ngoai').executeTakeFirstOrThrow();
    expect(key).toEqual({ app_key: 'pos-ngoai', scopes: [] });
    const again = await ctx.app.inject({ method: 'POST', url: '/api/v1/apps/pos-ngoai/install', headers: auth() });
    expect(again.json().error.code).toBe('CONFLICT');
  });
});

describe('Khoá app', () => {
  it('nộp chứng từ của app: posted, nguồn = app, bằng chứng via app:pos-ngoai', async () => {
    const res = await submit(appDoc('A1'));
    expect(res.statusCode, res.body).toBe(200);
    expect(res.json().data).toMatchObject({ docKey: 'pos-ngoai:CN01:A1', status: 'posted' });
    const evt = await db.selectFrom('accounting_events').select('source_system').where('tenant_id', '=', tenantId).where('doc_key', '=', 'pos-ngoai:CN01:A1').executeTakeFirstOrThrow();
    expect(evt.source_system).toBe('pos-ngoai');
    const ev = await db.selectFrom('audit_logs').select(['actor_kind', 'actor_via']).where('tenant_id', '=', tenantId).where('action', '=', 'core.document.submit').orderBy('id', 'desc').executeTakeFirstOrThrow();
    expect(ev).toEqual({ actor_kind: 'apikey', actor_via: 'app:pos-ngoai' });
  });

  it('docKey không mang tiền tố app → VALIDATION ở cả cửa mới lẫn cửa nạp cũ; không có gì được ghi', async () => {
    const bad = await submit(saleDoc({ docKey: 'pos:CN01:A2', docNo: 'A2' }));
    expect(bad.json().error.code).toBe('VALIDATION_ERROR');
    const legacy = await ctx.app.inject({ method: 'POST', url: '/api/v1/documents', payload: saleDoc({ docKey: 'pos:CN01:A3', docNo: 'A3' }) as never, headers: asApp() });
    expect(legacy.statusCode).toBe(400);
    const rows = await db.selectFrom('accounting_events').select('doc_key').where('tenant_id', '=', tenantId).where('doc_key', 'in', ['pos:CN01:A2', 'pos:CN01:A3']).execute();
    expect(rows).toEqual([]);
  });

  it('quyền ngoài phạm vi → FORBIDDEN (khoá app không quản trị được người dùng / khoá API)', async () => {
    const res = await ctx.app.inject({ method: 'GET', url: '/api/v1/api-keys', headers: asApp() });
    expect(res.statusCode).toBe(403);
  });
});

describe('Webhook từ outbox', () => {
  it('sự kiện entry.posted → POST ký HMAC đúng, Idempotency-Key = id sự kiện', async () => {
    await submit(appDoc('W1'));
    const pending = await deliveries();
    expect(pending.length).toBeGreaterThan(0);
    hits.length = 0;
    reply = 200;
    await dispatch();
    const hit = hits.find((h) => JSON.parse(h.body).subject === 'pos-ngoai:CN01:W1');
    expect(hit).toBeTruthy();
    const evt = JSON.parse(hit!.body);
    expect(evt).toMatchObject({ type: 'bizcity.ledger.entry.posted', tenantId });
    expect(hit!.headers['idempotency-key']).toBe(evt.id);
    const [t, v1] = String(hit!.headers['bizcity-signature']).split(',').map((p) => p.split('=')[1]);
    expect(v1).toBe(createHmac('sha256', install.webhookSecret).update(`${t}.${hit!.body}`).digest('hex'));
    expect(Math.abs(Date.now() / 1000 - Number(t))).toBeLessThan(60);
    expect((await deliveries()).every((d) => d.status === 'done')).toBe(true);
  });

  it('app trả 500 → việc giao giữ pending, ghi lần thử, lỗi chỉ mã HTTP', async () => {
    await submit(appDoc('W2'));
    reply = 500;
    await dispatch();
    const left = (await deliveries()).filter((d) => d.status === 'pending');
    expect(left.length).toBeGreaterThan(0);
    expect(left[0]).toMatchObject({ attempts: 1, last_error: expect.stringContaining('HTTP 500') });
    reply = 200;
  });

  it('đơn vị không kết nối app: không có việc giao', async () => {
    const other = await setupTenant();
    try {
      const otherId = (await db.selectFrom('tenants').select('id').where('code', '=', other.tenantCode).executeTakeFirstOrThrow()).id;
      const res = await other.app.inject({ method: 'POST', url: '/api/v1/documents', payload: saleDoc({ docKey: 'pos:CN01:K1', docNo: 'K1' }) as never, headers: { 'x-api-key': other.apiKey } });
      expect(res.statusCode, res.body).toBeLessThan(300);
      expect(await deliveries(otherId)).toEqual([]);
    } finally {
      await other.app.close();
    }
  });
});

describe('Tắt / bật, xoay khoá', () => {
  it('tắt: khoá app bị từ chối, sự kiện mới không giao; bật lại: dùng tiếp', async () => {
    const off = await ctx.app.inject({ method: 'POST', url: '/api/v1/apps/pos-ngoai/disable', headers: auth() });
    expect(off.json().data).toMatchObject({ status: 'disabled', changed: true });
    expect((await submit(appDoc('D1'))).statusCode).toBe(401);
    const before = (await deliveries()).length;
    // Sự kiện của đơn vị phát lúc app tắt (người dùng nộp chứng từ) → không tạo việc giao cho app.
    await ctx.app.inject({ method: 'POST', url: '/api/v1/documents', payload: saleDoc({ docKey: 'pos:CN01:D2', docNo: 'D2' }) as never, headers: { 'x-api-key': ctx.apiKey } });
    expect((await deliveries()).length).toBe(before);
    await ctx.app.inject({ method: 'POST', url: '/api/v1/apps/pos-ngoai/enable', headers: auth() });
    expect((await submit(appDoc('D3'))).statusCode).toBe(200);
  });

  it('xoay khoá: khoá cũ 401, khoá mới dùng được, bí mật webhook đổi', async () => {
    const res = await ctx.app.inject({ method: 'POST', url: '/api/v1/apps/pos-ngoai/rotate', headers: auth() });
    const next = res.json().data;
    expect(next.webhookSecret).not.toBe(install.webhookSecret);
    expect((await submit(appDoc('R1'))).statusCode).toBe(401);
    expect((await submit(appDoc('R2'), next.apiKey)).statusCode).toBe(200);
    install = { ...install, apiKey: next.apiKey, webhookSecret: next.webhookSecret };
  });
});

describe('Vé iframe', () => {
  it('người dùng xin vé; vé không dùng làm phiên; chỉ khoá của đúng app đổi được', async () => {
    const res = await ctx.app.inject({ method: 'POST', url: '/api/v1/apps/pos-ngoai/ticket', headers: auth() });
    expect(res.statusCode, res.body).toBe(200);
    const t = res.json().data;
    expect(t).toMatchObject({ origin: 'https://pos.example.test', url: 'https://pos.example.test/nhung' });
    expect(new Date(t.expiresAt).getTime() - Date.now()).toBeLessThanOrEqual(300_000);
    expect((await ctx.app.inject({ method: 'GET', url: '/api/v1/apps', headers: auth(t.ticket) })).statusCode).toBe(401);
    const ex = await ctx.app.inject({ method: 'POST', url: '/api/v1/apps/ticket/exchange', payload: { ticket: t.ticket }, headers: asApp() });
    expect(ex.statusCode, ex.body).toBe(200);
    expect(ex.json().data).toMatchObject({ app: 'pos-ngoai', tenant: { code: ctx.tenantCode }, user: { role: 'owner' }, permissions: ['catalog:read', 'documents:read', 'documents:write'] });
    const plain = await ctx.app.inject({ method: 'POST', url: '/api/v1/apps/ticket/exchange', payload: { ticket: t.ticket }, headers: { 'x-api-key': ctx.apiKey } });
    expect(plain.statusCode).toBe(403);
    const forged = await ctx.app.inject({ method: 'POST', url: '/api/v1/apps/ticket/exchange', payload: { ticket: `${t.ticket.slice(0, -4)}AAAA` }, headers: asApp() });
    expect(forged.statusCode).toBe(401);
    expect((await ctx.app.inject({ method: 'POST', url: '/api/v1/apps/pos-ngoai/ticket', headers: asApp() })).statusCode).toBe(403);
  });
});

describe('Manifest app', () => {
  it('quyền quản trị, origin có đường dẫn, sự kiện không webhook, khoá trùng phân hệ → lỗi', () => {
    const base = manifest('https://pos.example.test/hook');
    expect(appManifestProblems(base)).toEqual([]);
    expect(appManifestProblems({ ...base, app: { ...base.app, scopes: ['users:write'] } }).join()).toMatch(/users:write/);
    expect(appManifestProblems({ ...base, ui: { origin: 'https://pos.example.test/nhung' } }).join()).toMatch(/phải là origin/);
    expect(appManifestProblems({ ...base, app: { scopes: [] } }).join()).toMatch(/cần app.webhook.url/);
    expect(() => registerAppManifests([{ ...base, key: 'ke-toan' }], ['ke-toan'])).toThrow(/trùng phân hệ/);
  });
});
