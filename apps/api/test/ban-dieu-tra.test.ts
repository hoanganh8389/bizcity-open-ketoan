// [2026-11-01 10:40 PM Johnny Chu - Chu Hoàng Anh] PHASE-019 — W2: ca T019-2, T019-3, T019-6, T019-7, T019-8 — API trung gian của Bàn điều tra với Tempo / Loki giả
/**
 * Bàn điều tra — API trung gian (PHASE-019 W2). Tempo / Loki giả bằng một máy chủ HTTP cục bộ trả đúng khuôn thật (OTLP JSON của
 * Tempo 2.6 — id base64; query_range của Loki 3.3 — dòng pino), nên điều test thấy là điều bản thật nhận. Kiểm:
 *   T019-8  không devtools:read (viewer, khoá API) → 403; chủ đơn vị, developer → được; developer không ghi chứng từ;
 *   T019-2  trace của đơn vị khác / không gắn đơn vị / lẫn hai đơn vị → 404 giống hệt mã không tồn tại;
 *   T019-7  không trường ngoài danh sách cho phép (span: TRACE_ATTRIBUTES; log: §3.3; bằng chứng: cột mô tả);
 *   T019-3  nguồn chưa bật / không trả lời → NOT_READY có details.backend, không 500; phần CSDL vẫn chạy;
 *   T019-6  tham số chèn → VALIDATION_ERROR; truy vấn gửi Loki chỉ theo mẫu, đơn vị do máy chủ gắn;
 *   chế độ Vận hành (Q019-2): bản cài nhiều đơn vị → tắt dù DEVTOOLS_OPS=true; giới hạn 30 truy vấn / phút.
 */
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { db } from '../src/db/client.js';
import { env } from '../src/config/env.js';
import { TRACE_ATTRIBUTES } from '../src/core/tracing.js';
import { quote, resetQuota } from '../src/modules/system/devtools.sources.js';
import { call, setupTenant, type TestCtx } from './helpers.js';

let owner: TestCtx, dev: TestCtx, viewer: TestCtx, ownerB: TestCtx;
let tenantA = '', tenantB = '';
let server: Server;
let base = '';
const traces = new Map<string, unknown>();
let lokiLines: [string, string][] = [];
const lokiQueries: string[] = [];

const b64 = (hex: string) => Buffer.from(hex, 'hex').toString('base64');
const T_A = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa1';
const T_B = 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb2';
const T_NOAUTH = 'ccccccccccccccccccccccccccccccc3';
const T_MIXED = 'ddddddddddddddddddddddddddddddd4';
const T_LEDGER = 'eeeeeeeeeeeeeeeeeeeeeeeeeeeeeee5';
const T_MISSING = 'fffffffffffffffffffffffffffffff6';

const s = (v: string | number) => (typeof v === 'number' ? { intValue: String(v) } : { stringValue: v });
const attrs = (o: Record<string, string | number>) => Object.entries(o).map(([key, v]) => ({ key, value: s(v) }));
const span = (traceId: string, spanId: string, parent: string | null, name: string, kind: string, startMs: number, endMs: number, a: Record<string, string | number>, extra: Record<string, unknown> = {}) => ({
  traceId: b64(traceId), spanId: b64(spanId), ...(parent ? { parentSpanId: b64(parent) } : {}), name, kind,
  startTimeUnixNano: String(BigInt(1_793_543_476_000 + startMs) * 1_000_000n), endTimeUnixNano: String(BigInt(1_793_543_476_000 + endMs) * 1_000_000n),
  attributes: attrs(a), status: {}, ...extra,
});
const tempoJson = (spans: unknown[]) => ({ batches: [{ resource: { attributes: attrs({ 'service.name': 'bizcity-core-api' }) }, scopeSpans: [{ scope: { name: 'bizcity-core' }, spans }] }] });

/** TH-01: chi lại phiếu đã chi → 409, từ chối ở action, Kernel không được gọi. Có thuộc tính / thông điệp lậu để kiểm lọc. */
function rejectedTrace(traceId: string, tenant: string | null) {
  return tempoJson([
    span(traceId, '1111111111111111', null, 'HTTP POST /api/v1/payment-requests/:id/pay', 'SPAN_KIND_SERVER', 0, 12, {
      'http.request.method': 'POST', 'http.route': '/api/v1/payment-requests/:id/pay', 'http.response.status_code': 409,
      'bizcity.outcome': 'rejected', 'bizcity.error.code': 'CONFLICT', ...(tenant ? { 'bizcity.tenant': tenant } : {}),
      so_tien: 1234567, 'url.full': 'https://x/?mst=0101234567',
    }, { status: { code: 'STATUS_CODE_UNSET', message: 'Khách Nguyễn Văn Bí Mật' } }),
    span(traceId, '2222222222222222', '1111111111111111', 'action quy.payment-request.pay', 'SPAN_KIND_INTERNAL', 2, 10, {
      'bizcity.module': 'quy', 'bizcity.action.id': 'quy.payment-request.pay', 'bizcity.outcome': 'rejected', 'bizcity.error.code': 'CONFLICT',
      ...(tenant ? { 'bizcity.tenant': tenant } : {}),
    }, { events: [{ name: 'exception', attributes: attrs({ 'exception.type': 'AppError', 'exception.message': 'Phiếu PC-0099 của Khách Nguyễn Văn Bí Mật đã chi' }) }] }),
    span(traceId, '3333333333333333', '2222222222222222', 'db select payment_requests', 'SPAN_KIND_CLIENT', 3, 9, { 'db.system.name': 'postgresql', 'db.operation.name': 'select', 'db.collection.name': 'payment_requests' }),
  ]);
}

beforeAll(async () => {
  owner = await setupTenant();
  ownerB = await setupTenant();
  tenantA = (await db.selectFrom('tenants').select('id').where('code', '=', owner.tenantCode).executeTakeFirstOrThrow()).id;
  tenantB = (await db.selectFrom('tenants').select('id').where('code', '=', ownerB.tenantCode).executeTakeFirstOrThrow()).id;
  const login = async (email: string, role: string): Promise<TestCtx> => {
    const made = await call(owner, 'POST', '/api/v1/users', { email, fullName: email, role, password: 'Pass@12345' });
    expect(made.status, JSON.stringify(made.body)).toBe(201);
    const res = await owner.app.inject({ method: 'POST', url: '/api/v1/auth/login', payload: { tenantCode: owner.tenantCode, email, password: 'Pass@12345' } });
    return { ...owner, token: res.json().data.token };
  };
  dev = await login('dev@ketoan.local', 'developer');
  viewer = await login('xem@ketoan.local', 'viewer');

  traces.set(T_A, rejectedTrace(T_A, tenantA));
  traces.set(T_B, rejectedTrace(T_B, tenantB));
  traces.set(T_NOAUTH, rejectedTrace(T_NOAUTH, null));
  const mixed = rejectedTrace(T_MIXED, tenantA) as { batches: { scopeSpans: { spans: unknown[] }[] }[] };
  mixed.batches[0]!.scopeSpans[0]!.spans.push(span(T_MIXED, '4444444444444444', '1111111111111111', 'event deliver x → y', 'SPAN_KIND_CONSUMER', 5, 6, { 'bizcity.tenant': tenantB }));
  traces.set(T_MIXED, mixed);
  traces.set(T_LEDGER, tempoJson([
    span(T_LEDGER, '1111111111111111', null, 'HTTP POST /api/v1/vouchers', 'SPAN_KIND_SERVER', 0, 20, { 'http.route': '/api/v1/vouchers', 'http.response.status_code': 409, 'bizcity.outcome': 'rejected', 'bizcity.error.code': 'PERIOD_LOCKED', 'bizcity.tenant': tenantA }),
    span(T_LEDGER, '2222222222222222', '1111111111111111', 'kernel voucherService.createIn', 'SPAN_KIND_INTERNAL', 2, 18, { 'bizcity.layer': 'K', 'bizcity.kernel.op': 'voucherService.createIn', 'bizcity.outcome': 'rejected', 'bizcity.error.code': 'PERIOD_LOCKED' }),
  ]));

  server = createServer((req, res) => {
    const url = new URL(req.url ?? '/', 'http://x');
    const send = (status: number, body?: unknown) => { res.writeHead(status, { 'content-type': 'application/json' }); res.end(body === undefined ? '' : JSON.stringify(body)); };
    if (url.pathname === '/ready') return send(200, 'ready');
    const m = /^\/api\/traces\/([0-9a-f]{32})$/.exec(url.pathname);
    if (m) return traces.has(m[1]!) ? send(200, traces.get(m[1]!)) : send(404, 'trace not found');
    if (url.pathname === '/loki/api/v1/query_range') {
      lokiQueries.push(url.searchParams.get('query') ?? '');
      return send(200, { status: 'success', data: { resultType: 'streams', result: [{ stream: { service: 'api' }, values: lokiLines }] } });
    }
    return send(404);
  });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  env.DEVTOOLS_TEMPO_URL = base;
  env.DEVTOOLS_LOKI_URL = base;
});
beforeEach(() => {
  resetQuota();
  env.DEVTOOLS_TEMPO_URL = base;
  env.DEVTOOLS_LOKI_URL = base;
  env.DEVTOOLS_OPS = '';
});
afterAll(async () => {
  env.DEVTOOLS_TEMPO_URL = '';
  env.DEVTOOLS_LOKI_URL = '';
  env.DEVTOOLS_OPS = '';
  await new Promise<void>((r) => server.close(() => r()));
  await owner.app.close();
  await ownerB.app.close();
});

describe('Bàn điều tra — API trung gian (PHASE-019 W2)', () => {
  it('T019-8: không devtools:read → 403 (viewer, khoá API); chủ đơn vị + developer được; developer không ghi chứng từ', async () => {
    expect((await call(viewer, 'GET', '/api/v1/system/devtools/status')).status).toBe(403);
    expect((await call(viewer, 'GET', `/api/v1/system/devtools/traces/${T_A}`)).status).toBe(403);
    const byKey = await owner.app.inject({ method: 'GET', url: '/api/v1/system/devtools/status', headers: { 'x-api-key': owner.apiKey } });
    expect(byKey.statusCode).toBe(403);
    expect((await call(owner, 'GET', '/api/v1/system/devtools/status')).status).toBe(200);
    const st = await call(dev, 'GET', '/api/v1/system/devtools/status');
    expect(st.status).toBe(200);
    expect(st.body.data).toMatchObject({ mode: 'unit', sources: { tempo: 'up', loki: 'up', prometheus: null, alertmanager: null }, grafanaUrl: null });
    // developer = chỉ xem + Bàn điều tra: đọc được, ghi bị chặn.
    expect((await call(dev, 'GET', '/api/v1/payment-requests')).status).toBe(200);
    expect((await call(dev, 'POST', '/api/v1/payment-requests', { requestDate: '2026-10-12', branchCode: 'CN01', partnerCode: 'X', amount: 1, debitAccount: '64211', description: 'x' })).status).toBe(403);
  });

  it('trace của đơn vị: cây span đã lọc + tóm tắt theo luật (TH-01: từ chối ở action, Kernel không được gọi)', async () => {
    const r = await call(dev, 'GET', `/api/v1/system/devtools/traces/${T_A.toUpperCase()}`);
    expect(r.status, JSON.stringify(r.body)).toBe(200);
    const t = r.body.data;
    expect(t.traceId).toBe(T_A);
    expect(t.spans.map((x: { name: string }) => x.name)).toEqual(['HTTP POST /api/v1/payment-requests/:id/pay', 'action quy.payment-request.pay', 'db select payment_requests']);
    expect(t.spans[1].parentId).toBe('1111111111111111');
    expect(t.summary).toMatchObject({
      outcome: 'rejected', status: 409, errorCode: 'CONFLICT', playbook: 'TH-01',
      stoppedAt: { name: 'action quy.payment-request.pay', module: 'quy' }, kernel: { state: 'not-called', ops: [] },
    });
    expect(t.summary.lines).toContain('Kernel không được gọi — sổ không đổi.');
    expect(t.links.grafana).toBeNull();

    const k = (await call(dev, 'GET', `/api/v1/system/devtools/traces/${T_LEDGER}`)).body.data.summary;
    expect(k).toMatchObject({ playbook: 'TH-04', kernel: { state: 'rejected', ops: ['voucherService.createIn'] }, errorCode: 'PERIOD_LOCKED' });
  });

  it('T019-2: trace của đơn vị khác / không gắn đơn vị / lẫn hai đơn vị → 404 giống hệt mã không tồn tại', async () => {
    const missing = await call(owner, 'GET', `/api/v1/system/devtools/traces/${T_MISSING}`);
    expect(missing.status).toBe(404);
    for (const id of [T_B, T_NOAUTH, T_MIXED]) {
      const r = await call(owner, 'GET', `/api/v1/system/devtools/traces/${id}`);
      expect(r.status, id).toBe(404);
      expect(r.body.error.code).toBe(missing.body.error.code);
      expect(r.body.error.message).toBe(missing.body.error.message);
      expect(r.body.error.details).toEqual(missing.body.error.details);
    }
    // Chiều ngược lại: chủ đơn vị B xem được trace của B, không xem được của A.
    expect((await call(ownerB, 'GET', `/api/v1/system/devtools/traces/${T_B}`)).status).toBe(200);
    expect((await call(ownerB, 'GET', `/api/v1/system/devtools/traces/${T_A}`)).status).toBe(404);
  });

  it('T019-7: span chỉ còn thuộc tính được phép; không thông điệp trạng thái, không exception.message', async () => {
    const r = await call(dev, 'GET', `/api/v1/system/devtools/traces/${T_A}`);
    for (const sp of r.body.data.spans) for (const k of Object.keys(sp.attributes)) expect(TRACE_ATTRIBUTES.has(k), k).toBe(true);
    const dump = JSON.stringify(r.body);
    for (const secret of ['1234567', 'so_tien', '0101234567', 'url.full', 'Nguyễn', 'PC-0099', 'exception.message']) expect(dump).not.toContain(secret);
    expect(r.body.data.spans[1].events).toEqual([{ name: 'exception', exceptionType: 'AppError' }]);
  });

  it('request: log của yêu cầu chỉ trong đơn vị, trường được phép; LogQL theo mẫu, đơn vị do máy chủ gắn; kéo theo trace', async () => {
    const t0 = Date.now();
    lokiLines = [
      [String(BigInt(t0) * 1_000_000n), JSON.stringify({ level: 50, time: t0, reqId: 'req-abc12345', traceId: T_A, tenant: tenantA, actor: 'user:9', route: '/api/v1/payment-requests/:id/pay', method: 'POST', status: 409, ms: 12, errCode: 'CONFLICT', amount: 999888, partnerName: 'Khách Bí Mật', err: { type: 'AppError', message: 'duplicate key (name)=(Khách Bí Mật)', stack: 'Error: at handler' }, msg: 'xong yêu cầu' })],
      [String(BigInt(t0 + 1) * 1_000_000n), JSON.stringify({ level: 30, time: t0 + 1, reqId: 'req-abc12345', tenant: tenantB, msg: 'dòng của đơn vị khác lọt qua bộ lọc Loki' })],
      [String(BigInt(t0 + 2) * 1_000_000n), 'không phải JSON'],
    ];
    lokiQueries.length = 0;
    const r = await call(dev, 'GET', '/api/v1/system/devtools/requests/req-abc12345');
    expect(r.status, JSON.stringify(r.body)).toBe(200);
    expect(lokiQueries).toEqual([`{service="api"} | reqId="req-abc12345" | json | tenant="${tenantA}"`]);
    const d = r.body.data;
    expect(d.logs).toHaveLength(1);
    expect(d.logs[0]).toEqual({
      time: new Date(t0).toISOString(), level: 'error', msg: 'xong yêu cầu', reqId: 'req-abc12345', traceId: T_A,
      route: '/api/v1/payment-requests/:id/pay', method: 'POST', status: 409, ms: 12, errCode: 'CONFLICT', err: { type: 'AppError' },
    });
    expect(d.traceId).toBe(T_A);
    expect(d.trace.summary.playbook).toBe('TH-01');
    const dump = JSON.stringify(r.body);
    for (const secret of ['999888', 'Khách Bí Mật', 'Error: at handler', 'user:9', 'đơn vị khác']) expect(dump).not.toContain(secret);

    // Không có dòng nào của đơn vị → 404.
    lokiLines = [];
    expect((await call(dev, 'GET', '/api/v1/system/devtools/requests/req-khongco1')).status).toBe(404);
  });

  it('T019-3: nguồn chưa bật / không trả lời → NOT_READY có details.backend, không 500; status báo off / down', async () => {
    env.DEVTOOLS_TEMPO_URL = '';
    const off = await call(dev, 'GET', `/api/v1/system/devtools/traces/${T_A}`);
    expect(off.status).toBe(503);
    expect(off.body.error).toMatchObject({ code: 'NOT_READY', details: { backend: 'tempo', reason: 'off' } });
    expect((await call(dev, 'GET', '/api/v1/system/devtools/status')).body.data.sources.tempo).toBe('off');

    env.DEVTOOLS_TEMPO_URL = 'http://127.0.0.1:1';
    env.DEVTOOLS_LOKI_URL = 'http://127.0.0.1:1';
    const down = await call(dev, 'GET', `/api/v1/system/devtools/traces/${T_A}`);
    expect(down.status).toBe(503);
    expect(down.body.error.details).toEqual({ backend: 'tempo', reason: 'down' });
    expect((await call(dev, 'GET', '/api/v1/system/devtools/requests/req-abc12345')).body.error.details).toEqual({ backend: 'loki', reason: 'down' });
    expect((await call(dev, 'GET', '/api/v1/system/devtools/status')).body.data.sources).toMatchObject({ tempo: 'down', loki: 'down' });
    // Phần đọc CSDL không cần bộ giám sát.
    expect((await call(dev, 'GET', `/api/v1/system/devtools/evidence?traceId=${T_A}`)).status).toBe(200);
  });

  it('T019-6: tham số chèn bị chặn trước khi tới Loki / Tempo; chuỗi truy vấn được thoát ký tự', async () => {
    lokiQueries.length = 0;
    for (const bad of [
      `/api/v1/system/devtools/traces/${encodeURIComponent('abc"} || { true')}`,
      `/api/v1/system/devtools/traces/${'a'.repeat(31)}g`,
      `/api/v1/system/devtools/requests/${encodeURIComponent('req-1" | json | tenant=~".*')}`,
      `/api/v1/system/devtools/requests/${encodeURIComponent('req 1')}`,
      '/api/v1/system/devtools/evidence',
      `/api/v1/system/devtools/evidence?traceId=${encodeURIComponent("x' OR 1=1 --")}`,
    ]) {
      const r = await call(dev, 'GET', bad);
      expect(r.status, bad).toBe(400);
      expect(r.body.error.code).toBe('VALIDATION_ERROR');
    }
    expect(lokiQueries).toEqual([]);
    expect(quote('a"} or {b\\')).toBe('"a\\"} or {b\\\\"');
  });

  it('bằng chứng theo requestId / traceId: chỉ cột mô tả, chỉ của đơn vị', async () => {
    const reqId = `req-dt-${Date.now()}`;
    await call(owner, 'PUT', '/api/v1/partners/NCC-DT', { name: 'Đối tác Bàn điều tra', kind: 'supplier' });
    const made = await call(owner, 'POST', '/api/v1/payment-requests',
      { requestDate: '2026-10-12', branchCode: 'CN01', partnerCode: 'NCC-DT', amount: 4242424, debitAccount: '64211', description: 'Chi bàn điều tra' }, { 'x-request-id': reqId });
    expect(made.status, JSON.stringify(made.body)).toBe(201);
    const r = await call(dev, 'GET', `/api/v1/system/devtools/evidence?requestId=${reqId}`);
    expect(r.status, JSON.stringify(r.body)).toBe(200);
    expect(r.body.data.length).toBeGreaterThan(0);
    expect(Object.keys(r.body.data[0]).sort()).toEqual(['action', 'actor', 'at', 'id', 'module', 'object', 'requestId', 'result', 'traceId']);
    const dump = JSON.stringify(r.body);
    for (const secret of ['4242424', 'Đối tác Bàn điều tra', 'before', 'after', 'inputHash', 'idempotency']) expect(dump).not.toContain(secret);
    // Đơn vị khác không thấy.
    expect((await call(ownerB, 'GET', `/api/v1/system/devtools/evidence?requestId=${reqId}`)).body.data).toEqual([]);
  });

  it('chế độ Vận hành (Q019-2): bản cài nhiều đơn vị → tắt dù DEVTOOLS_OPS=true; người không phải chủ → tắt', async () => {
    env.DEVTOOLS_OPS = 'true';
    const o = (await call(owner, 'GET', '/api/v1/system/devtools/status')).body.data;
    expect(o.mode).toBe('unit');
    expect(o.opsBlocked).toMatch(/nhiều đơn vị/);
    expect(o.sources.prometheus).toBeNull();
    expect(o.grafanaUrl).toBeNull();
    const d = (await call(dev, 'GET', '/api/v1/system/devtools/status')).body.data;
    expect(d.mode).toBe('unit');
    expect(d.opsBlocked).toMatch(/chủ đơn vị/);
  });

  it('giới hạn: quá 30 truy vấn / phút / người → RATE_LIMITED; người khác không bị ảnh hưởng', async () => {
    for (let i = 0; i < 30; i++) expect((await call(dev, 'GET', `/api/v1/system/devtools/evidence?traceId=${T_A}`)).status).toBe(200);
    const over = await call(dev, 'GET', `/api/v1/system/devtools/evidence?traceId=${T_A}`);
    expect(over.status).toBe(429);
    expect(over.body.error.code).toBe('RATE_LIMITED');
    expect((await call(owner, 'GET', `/api/v1/system/devtools/evidence?traceId=${T_A}`)).status).toBe(200);
  });
});
