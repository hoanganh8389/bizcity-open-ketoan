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
import { quote, resetQuota, PROMQL, probeLevel, queryProm, listAlerts, grafanaTraceLink } from '../src/modules/system/devtools.sources.js';
import { noiDungChoAI } from '@ketoan/contracts';
import { call, setupTenant, type TestCtx } from './helpers.js';

let owner: TestCtx, dev: TestCtx, viewer: TestCtx, ownerB: TestCtx;
let tenantA = '', tenantB = '';
let server: Server;
let base = '';
const traces = new Map<string, unknown>();
let lokiLines: [string, string][] = [];
const lokiQueries: string[] = [];
const lokiDirections: string[] = [];
// [2026-11-01 11:30 PM Johnny Chu - Chu Hoàng Anh] PHASE-019 — W3: Loki số đo + Tempo tìm kiếm giả cho logs / traces / summary
let lokiVector: { metric: Record<string, string>; value: [number, string] }[] = [];
const lokiMetricQueries: string[] = [];
let tempoSearch: unknown[] = [];
const tempoQueries: { q: string; limit: string; start: string; end: string }[] = [];
// [2026-11-02 02:40 PM Johnny Chu - Chu Hoàng Anh] PHASE-019 — W5: Prometheus / Alertmanager giả cho chế độ Vận hành
const promQueries: string[] = [];
let promValues: Record<string, string | null> = {};
let amAlerts: unknown[] = [];

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
    if (url.pathname === '/api/echo' || url.pathname === '/loki/api/v1/status/buildinfo') return send(200, 'echo');
    const m = /^\/api\/traces\/([0-9a-f]{32})$/.exec(url.pathname);
    if (m) return traces.has(m[1]!) ? send(200, traces.get(m[1]!)) : send(404, 'trace not found');
    if (url.pathname === '/api/search') {
      tempoQueries.push({ q: url.searchParams.get('q') ?? '', limit: url.searchParams.get('limit') ?? '', start: url.searchParams.get('start') ?? '', end: url.searchParams.get('end') ?? '' });
      // Như Tempo 2.6.1 (max_search_duration 168h): khoảng dài hơn 168 giờ dù 1 giây → 400 (lỗi thật đo được ở W4, 2026-11-02).
      if (Number(url.searchParams.get('end')) - Number(url.searchParams.get('start')) > 7 * 86400) return send(400, 'range specified by start and end exceeds 168h0m0s');
      return send(200, { traces: tempoSearch, metrics: {} });
    }
    if (url.pathname === '/api/v1/query') {
      const q = url.searchParams.get('query') ?? '';
      promQueries.push(q);
      const v = promValues[q];
      return send(200, { status: 'success', data: { resultType: 'vector', result: v === null || v === undefined ? [] : [{ metric: {}, value: [1793600000, v] }] } });
    }
    if (url.pathname === '/api/v2/alerts') return send(200, amAlerts);
    if (url.pathname === '/loki/api/v1/query') {
      lokiMetricQueries.push(url.searchParams.get('query') ?? '');
      const q = url.searchParams.get('query') ?? '';
      return send(200, { status: 'success', data: { resultType: 'vector', result: q.startsWith('sum by (errCode)') ? lokiVector : [{ metric: {}, value: [0, '3'] }] } });
    }
    if (url.pathname === '/loki/api/v1/query_range') {
      lokiQueries.push(url.searchParams.get('query') ?? '');
      lokiDirections.push(url.searchParams.get('direction') ?? '');
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

describe('Bàn điều tra — Nhật ký, tìm trace, Tổng quan (PHASE-019 W3)', () => {
  it('logs: mẫu LogQL có bộ lọc, đơn vị máy chủ gắn; lấy dòng MỚI NHẤT (backward), trả mới trước; dòng đơn vị khác bị bỏ', async () => {
    const t0 = Date.now() - 60_000;
    lokiLines = [
      [String(BigInt(t0) * 1_000_000n), JSON.stringify({ level: 40, time: t0, tenant: tenantA, reqId: 'req-1', route: '/api/v1/vouchers', status: 409, errCode: 'PERIOD_LOCKED', msg: 'xong yêu cầu' })],
      [String(BigInt(t0 + 5) * 1_000_000n), JSON.stringify({ level: 40, time: t0 + 5, tenant: tenantA, reqId: 'req-2', route: '/api/v1/vouchers', status: 409, errCode: 'PERIOD_LOCKED', msg: 'xong yêu cầu' })],
      [String(BigInt(t0 + 9) * 1_000_000n), JSON.stringify({ level: 40, time: t0 + 9, tenant: tenantB, reqId: 'req-3', msg: 'của B' })],
    ];
    lokiQueries.length = 0;
    lokiDirections.length = 0;
    const r = await call(dev, 'GET', `/api/v1/system/devtools/logs?window=6h&level=warn&errCode=PERIOD_LOCKED&route=${encodeURIComponent('/api/v1/vouchers')}&traceId=${T_A}`);
    expect(r.status, JSON.stringify(r.body)).toBe(200);
    expect(lokiQueries).toEqual([`{service="api", level="warn"} | traceId="${T_A}" | json | __error__="" | tenant="${tenantA}" | errCode="PERIOD_LOCKED" | route="/api/v1/vouchers"`]);
    expect(lokiDirections).toEqual(['backward']);
    expect(r.body.data.lines.map((l: { reqId: string }) => l.reqId)).toEqual(['req-2', 'req-1']);
    expect(r.body.data.window).toBe('6h');
    // Khung > 24 giờ, mức lạ, mã lỗi chữ thường / chèn → 400, không tới Loki.
    lokiQueries.length = 0;
    for (const q of ['window=7d', 'level=fatal', 'errCode=period_locked', `errCode=${encodeURIComponent('X" | tenant=~".*')}`, `route=${encodeURIComponent('/a" or "')}`, `evt=${encodeURIComponent('a b')}`, 'limit=201']) {
      expect((await call(dev, 'GET', `/api/v1/system/devtools/logs?${q}`)).status, q).toBe(400);
    }
    expect(lokiQueries).toEqual([]);
  });

  it('traces: mẫu TraceQL đóng trên span mang đơn vị; đệm traceID; thuộc tính chỉ trong danh sách, không lộ đơn vị', async () => {
    tempoSearch = [{
      traceID: '904127dd2944f22c086c236c5ceb5af', rootServiceName: 'bizcity-core-api', rootTraceName: 'HTTP POST /api/v1/payment-requests/:id/pay',
      startTimeUnixNano: '1793543476669000000', durationMs: 12,
      spanSets: [{ spans: [{ spanID: 'x', attributes: [
        { key: 'bizcity.tenant', value: { stringValue: tenantA } }, { key: 'bizcity.outcome', value: { stringValue: 'rejected' } },
        { key: 'bizcity.module', value: { stringValue: 'quy' } }, { key: 'http.response.status_code', value: { intValue: '409' } },
        { key: 'so_tien', value: { intValue: '1234567' } },
      ] }] }],
    }];
    tempoQueries.length = 0;
    const r = await call(dev, 'GET', '/api/v1/system/devtools/traces?window=7d&outcome=failed&module=quy&minDurationMs=1000&limit=5');
    expect(r.status, JSON.stringify(r.body)).toBe(200);
    expect(tempoQueries[0]!.q).toBe(`{ span.bizcity.tenant = "${tenantA}" && span.bizcity.outcome != "ok" && span.bizcity.module = "quy" && duration > 1000ms } | select(span.bizcity.module, span.bizcity.action.id, span.bizcity.error.code, span.bizcity.outcome, span.http.route, span.http.response.status_code)`);
    expect(tempoQueries[0]!.limit).toBe('5');
    expect(Number(tempoQueries[0]!.end) - Number(tempoQueries[0]!.start)).toBe(7 * 86400);
    expect(r.body.data.traces).toEqual([{
      traceId: '0904127dd2944f22c086c236c5ceb5af', rootName: 'HTTP POST /api/v1/payment-requests/:id/pay', startedAt: new Date(1_793_543_476_669).toISOString(), durationMs: 12,
      attributes: { 'bizcity.outcome': 'rejected', 'bizcity.module': 'quy', 'http.response.status_code': 409 },
    }]);
    for (const q of ['window=30d', 'outcome=ok', `module=${encodeURIComponent('quy" || true')}`, 'limit=51', 'minDurationMs=0']) {
      expect((await call(dev, 'GET', `/api/v1/system/devtools/traces?${q}`)).status, q).toBe(400);
    }
  });

  it('summary: câu kết luận trước; lỗi theo mã chia từ chối đúng luật / lỗi kỹ thuật; nguồn tắt thì ô đó báo, phần CSDL vẫn có', async () => {
    lokiVector = [
      { metric: { errCode: 'CONFLICT' }, value: [0, '5'] },
      { metric: { errCode: 'INTERNAL_ERROR' }, value: [0, '2'] },
      { metric: { errCode: 'không phải mã' }, value: [0, '9'] },
    ];
    tempoSearch = [{ traceID: T_A, rootTraceName: 'HTTP POST /api/v1/x', startTimeUnixNano: '1793543476669000000', durationMs: 30,
      spanSets: [{ spans: [{ attributes: [{ key: 'bizcity.outcome', value: { stringValue: 'error' } }, { key: 'bizcity.module', value: { stringValue: 'vat' } }] }] }] }];
    lokiMetricQueries.length = 0;
    const r = await call(dev, 'GET', '/api/v1/system/devtools/summary?window=1h');
    expect(r.status, JSON.stringify(r.body)).toBe(200);
    const d = r.body.data;
    expect(lokiMetricQueries).toContain(`sum by (errCode) (count_over_time({service="api"} | json | __error__="" | tenant="${tenantA}" | errCode != "" [1h]))`);
    expect(d.errors).toEqual({ state: 'up', rejected: 5, error: 2, byCode: [{ code: 'CONFLICT', count: 5, kind: 'rejected' }, { code: 'INTERNAL_ERROR', count: 2, kind: 'error' }] });
    expect(d.slow).toEqual({ state: 'up', count: 3 });
    expect(d.recent.traces[0].traceId).toBe(T_A);
    expect(d.level).toBe('bad');
    expect(d.lines[0]).toBe('2 lỗi kỹ thuật trong 1 giờ qua — module vat.');
    expect(d.lines).toContain('5 lần từ chối đúng luật trong 1 giờ qua (CONFLICT 5) — không phải sự cố.');
    expect(d.events).toMatchObject({ dead: 0 });

    env.DEVTOOLS_LOKI_URL = '';
    env.DEVTOOLS_TEMPO_URL = 'http://127.0.0.1:1';
    const off = await call(dev, 'GET', '/api/v1/system/devtools/summary');
    expect(off.status).toBe(200);
    expect(off.body.data).toMatchObject({ errors: { state: 'off', error: 0 }, slow: { state: 'off' }, recent: { state: 'down', traces: [] }, level: 'ok' });
    expect(off.body.data.lines).toEqual(['Không thấy lỗi trong CSDL; Loki chưa bật nên chưa đếm được lỗi theo yêu cầu.']);
  });

  it('summary: log không ghi nhận lỗi nhưng Tempo có trace khác ok → kết luận vẫn nói (không "ổn" khi bảng dưới có lỗi)', async () => {
    lokiVector = [];
    tempoSearch = [
      { traceID: T_A, rootTraceName: 'HTTP POST /api/v1/payment-requests/:id/pay', startTimeUnixNano: '1793543476669000000', durationMs: 51,
        spanSets: [{ spans: [{ attributes: [{ key: 'bizcity.outcome', value: { stringValue: 'rejected' } }, { key: 'bizcity.module', value: { stringValue: 'quy' } }] }] }] },
      { traceID: T_LEDGER, rootTraceName: 'HTTP POST /api/v1/x', startTimeUnixNano: '1793543476669000000', durationMs: 9,
        spanSets: [{ spans: [{ attributes: [{ key: 'bizcity.outcome', value: { stringValue: 'error' } }, { key: 'bizcity.module', value: { stringValue: 'vat' } }] }] }] },
    ];
    const d = (await call(dev, 'GET', '/api/v1/system/devtools/summary')).body.data;
    expect(d.errors).toMatchObject({ state: 'up', error: 0, rejected: 0 });
    expect(d.level).toBe('bad');
    expect(d.lines).toContain('1 trace lỗi kỹ thuật gần đây — module vat (theo Tempo; nhật ký chưa ghi nhận).');
    expect(d.lines).toContain('1 trace bị từ chối đúng luật gần đây — module quy (theo Tempo) — không phải sự cố.');
  });
});

// [2026-11-02 10:42 AM Johnny Chu - Chu Hoàng Anh] PHASE-019 — W4: Lỗi theo module; màn Ghi sổ / Sự kiện / Toàn vẹn đọc API sẵn có bằng vai trò developer
describe('Bàn điều tra — Lỗi theo module, màn đọc API sẵn có (PHASE-019 W4)', () => {
  const sp = (spanID: string, name: string, a: Record<string, string | number>) => ({ spanID, name, attributes: attrs(a) });

  it('module-errors: mẫu TraceQL đóng (>> và ||); gom module → chỗ hỏng theo bậc step → action → yêu cầu; không lộ đơn vị / trường ngoài danh sách', async () => {
    tempoSearch = [
      // Trace mới nhất trước (như Tempo). Lỗi ở bước của module vat: span step không mang đơn vị, span db bên dưới.
      { traceID: '1'.repeat(32), rootTraceName: 'HTTP POST /api/v1/vat/declarations', startTimeUnixNano: '1793600000000000000', durationMs: 40,
        spanSets: [{ spans: [
          sp('a1', 'HTTP POST /api/v1/vat/declarations', { 'bizcity.tenant': tenantA, 'bizcity.outcome': 'error', 'bizcity.module': 'vat' }),
          sp('a2', 'action vat.declaration.create', { 'bizcity.tenant': tenantA, 'bizcity.outcome': 'error', 'bizcity.module': 'vat', 'bizcity.action.id': 'vat.declaration.create', 'bizcity.error.code': 'INTERNAL_ERROR', so_tien: 1234567 }),
          sp('a3', 'step vat.tinh-thue', { 'bizcity.outcome': 'error', 'bizcity.module': 'vat', 'bizcity.step': 'vat.tinh-thue' }),
          sp('a4', 'db insert vat_lines', { 'bizcity.outcome': 'error', 'bizcity.module': 'vat' }),
        ] }] },
      { traceID: '2'.repeat(32), rootTraceName: 'HTTP POST /api/v1/vat/declarations', startTimeUnixNano: '1793590000000000000', durationMs: 30,
        spanSets: [{ spans: [sp('b2', 'step vat.tinh-thue', { 'bizcity.outcome': 'error', 'bizcity.module': 'vat', 'bizcity.step': 'vat.tinh-thue' })] }] },
      // Route không qua action: chỉ span HTTP mang đơn vị.
      { traceID: '3'.repeat(32), rootTraceName: 'HTTP GET /api/v1/reports/trial-balance', startTimeUnixNano: '1793580000000000000', durationMs: 900,
        spanSets: [{ spans: [sp('c1', 'HTTP GET /api/v1/reports/trial-balance', { 'bizcity.tenant': tenantA, 'bizcity.outcome': 'error', 'bizcity.module': 'core' })] }] },
    ];
    tempoQueries.length = 0;
    const r = await call(dev, 'GET', '/api/v1/system/devtools/module-errors?window=7d');
    expect(r.status, JSON.stringify(r.body)).toBe(200);
    const t = `span.bizcity.tenant = "${tenantA}"`;
    expect(tempoQueries[0]!.q).toBe(`({ ${t} } >> { span.bizcity.outcome = "error" }) || { ${t} && span.bizcity.outcome = "error" } | select(name, span.bizcity.module, span.bizcity.action.id, span.bizcity.step, span.bizcity.layer, span.bizcity.error.code)`);
    expect(Number(tempoQueries[0]!.end) - Number(tempoQueries[0]!.start)).toBe(7 * 86400);
    const d = r.body.data;
    expect(d).toMatchObject({ window: '7d', outcome: 'error', traces: 3, truncated: false });
    expect(d.modules.map((m: { module: string; count: number }) => [m.module, m.count])).toEqual([['vat', 2], ['core', 1]]);
    expect(d.modules[0].places).toEqual([{
      kind: 'step', place: 'step vat.tinh-thue', count: 2, codes: [{ code: 'INTERNAL_ERROR', count: 1 }], via: 'db insert vat_lines',
      lastAt: new Date(1_793_600_000_000).toISOString(), traceId: '1'.repeat(32),
    }]);
    expect(d.modules[1].places[0]).toMatchObject({ kind: 'request', place: 'HTTP GET /api/v1/reports/trial-balance', count: 1 });
    expect(d.lines).toEqual([
      '3 trace lỗi kỹ thuật trong 7 ngày qua.',
      'Nhiều nhất: module vat — 2 trace; chỗ hỏng hay gặp nhất step vat.tinh-thue (2), mã INTERNAL_ERROR.',
      'Lỗi trong mã của module vat — sửa trong thư mục của module (Sổ tay TH-11).',
    ]);
    const text = JSON.stringify(d);
    // Mã đơn vị dò ở dạng giá trị ("4", =4), không dò chữ số trần — CSDL test mới cho id ngắn, khớp nhầm thời gian / số đếm.
    // [2026-11-02 05:10 PM Johnny Chu - Chu Hoàng Anh] FIX — phép dò mã đơn vị không khớp nhầm khi id ngắn
    for (const secret of [`"${tenantA}"`, `=${tenantA}`, 'so_tien', '1234567']) expect(text).not.toContain(secret);
    expect(text).not.toMatch(/bizcity\.tenant|tenant"?\s*[=:]/i);

    // Từ chối đúng luật: mẫu đổi outcome; không có trace → câu "không có".
    tempoSearch = [];
    const rej = await call(dev, 'GET', '/api/v1/system/devtools/module-errors?outcome=rejected&window=1h');
    expect(tempoQueries.at(-1)!.q).toContain('span.bizcity.outcome = "rejected"');
    expect(rej.body.data.lines).toEqual(['Không có trace bị từ chối đúng luật nào trong 1 giờ qua.']);

    for (const q of ['window=30d', 'outcome=ok', 'outcome=failed']) expect((await call(dev, 'GET', `/api/v1/system/devtools/module-errors?${q}`)).status, q).toBe(400);
    expect((await call(viewer, 'GET', '/api/v1/system/devtools/module-errors')).status).toBe(403);
    env.DEVTOOLS_TEMPO_URL = '';
    const off = await call(dev, 'GET', '/api/v1/system/devtools/module-errors');
    expect(off.status).toBe(503);
    expect(off.body.error.details).toMatchObject({ backend: 'tempo', reason: 'off' });
  });

  it('Ghi sổ, Sự kiện, Toàn vẹn: vai trò developer đọc được API sẵn có mà các màn dùng; không ghi được', async () => {
    for (const path of ['/api/v1/posting-log?from=2026-10-27&to=2026-11-02&action=error','/api/v1/documents?status=error&pageSize=100', '/api/v1/system/events', '/api/v1/system/diagnostics/runs?limit=20']) {
      expect((await call(dev, 'GET', path)).status, path).toBe(200);
    }
    // Phát lại sự kiện cần settings:write — không có ở developer (màn Sự kiện không có nút ghi, U8).
    expect((await call(dev, 'POST', '/api/v1/system/events/replay', { consumer: 'x.y', from: new Date().toISOString() }, { 'idempotency-key': 'w4-replay' })).status).toBe(403);
  });
});

// [2026-11-02 02:40 PM Johnny Chu - Chu Hoàng Anh] PHASE-019 — W5: chế độ Vận hành (ops.health / ops.alerts, link Grafana) + "Chép cho AI"
describe('Bàn điều tra — Vận hành, Chép cho AI (PHASE-019 W5)', () => {
  it('ops.health / ops.alerts: chưa mở chế độ Vận hành → 403 kèm lý do; không truy vấn nào tới Prometheus / Alertmanager', async () => {
    env.DEVTOOLS_PROMETHEUS_URL = base;
    env.DEVTOOLS_ALERTMANAGER_URL = base;
    try {
      promQueries.length = 0;
      for (const path of ['/api/v1/system/devtools/ops/health', '/api/v1/system/devtools/ops/alerts']) {
        // DEVTOOLS_OPS tắt.
        const off = await call(owner, 'GET', path);
        expect(off.status, path).toBe(403);
        expect(off.body.error.message).toMatch(/Vận hành chưa bật/);
        // Bật nhưng CSDL thử có nhiều đơn vị (Q019-2).
        env.DEVTOOLS_OPS = 'true';
        const many = await call(owner, 'GET', path);
        expect(many.status, path).toBe(403);
        expect(many.body.error.message).toMatch(/nhiều đơn vị/);
        // developer không phải chủ đơn vị.
        expect((await call(dev, 'GET', path)).body.error.message).toMatch(/chủ đơn vị/);
        expect((await call(viewer, 'GET', path)).status).toBe(403);
        env.DEVTOOLS_OPS = '';
      }
      expect(promQueries).toEqual([]);
    } finally {
      env.DEVTOOLS_PROMETHEUS_URL = '';
      env.DEVTOOLS_ALERTMANAGER_URL = '';
    }
  });

  it('nguồn Vận hành: PromQL cố định gửi đúng nguyên văn; mức theo ngưỡng cảnh báo; rỗng = "không có dữ liệu" (khác 0); cảnh báo chỉ lấy alertname / severity', async () => {
    env.DEVTOOLS_PROMETHEUS_URL = base;
    env.DEVTOOLS_ALERTMANAGER_URL = base;
    try {
      // Không biểu thức nào có tham số / đơn vị (số đo toàn hệ, mẫu đóng — SC-DEV-1 kiểm tĩnh cùng điều này).
      for (const p of PROMQL) expect(p.expr, p.key).not.toMatch(/\$\{|tenant/);
      const byKey = Object.fromEntries(PROMQL.map((p) => [p.key, p]));
      promValues = { [byKey['error-rate']!.expr]: '0.08', [byKey['api-up']!.expr]: '1', [byKey['outbox-dead']!.expr]: '0' };
      promQueries.length = 0;
      expect(await queryProm(byKey['error-rate']!.expr)).toBe(0.08);
      expect(await queryProm(byKey['recon-age']!.expr)).toBeNull();
      expect(promQueries).toEqual([byKey['error-rate']!.expr, byKey['recon-age']!.expr]);
      expect(probeLevel(byKey['error-rate']!, 0.08)).toBe('bad');
      expect(probeLevel(byKey['error-rate']!, 0.01)).toBe('ok');
      expect(probeLevel(byKey['api-up']!, 0)).toBe('bad');
      expect(probeLevel(byKey['outbox-dead']!, 0)).toBe('ok');
      expect(probeLevel(byKey['outbox-dead']!, 2)).toBe('warn');
      expect(probeLevel(byKey['recon-age']!, null)).toBe('none');

      amAlerts = [
        { labels: { alertname: 'OutboxBacklog', severity: 'warning', tenant: '42', instance: 'api:4100' }, annotations: { summary: 'Việc giao chờ lâu', description: 'd', dashboard: '/d/bizcity-su-kien' }, status: { state: 'active' }, startsAt: '2026-11-02T03:00:00Z' },
        { labels: { alertname: 'LedgerIntegrityError', severity: 'critical' }, annotations: { summary: 'Sổ lỗi', dashboard: 'javascript:alert(1)' }, status: { state: 'active' }, startsAt: '2026-11-02T04:00:00Z' },
        { labels: {}, annotations: {}, status: { state: 'active' } },
      ];
      const alerts = await listAlerts();
      expect(alerts.map((a) => a.name)).toEqual(['LedgerIntegrityError', 'OutboxBacklog']);
      expect(alerts[0]!.dashboard).toBeNull();
      expect(alerts[1]).toEqual({ name: 'OutboxBacklog', severity: 'warning', state: 'active', startsAt: '2026-11-02T03:00:00Z', summary: 'Việc giao chờ lâu', description: 'd', dashboard: '/d/bizcity-su-kien' });
      expect(JSON.stringify(alerts)).not.toContain('api:4100');
    } finally {
      env.DEVTOOLS_PROMETHEUS_URL = '';
      env.DEVTOOLS_ALERTMANAGER_URL = '';
    }
  });

  it('link Grafana: Explore khuôn panes (Grafana 11), nguồn tempo, mã trace; mở được trên 11.4', () => {
    const url = new URL(grafanaTraceLink('http://127.0.0.1:3000/', T_A));
    expect(url.pathname).toBe('/explore');
    expect(url.searchParams.get('schemaVersion')).toBe('1');
    const panes = JSON.parse(url.searchParams.get('panes')!);
    expect(panes.a.datasource).toBe('tempo');
    expect(panes.a.queries[0]).toMatchObject({ queryType: 'traceql', query: T_A, datasource: { uid: 'tempo' } });
  });

  it('Chép cho AI: từ trace thật của API — tóm tắt, cây span, chỗ tìm mã, việc phải làm; không đơn vị, không trường ngoài danh sách', async () => {
    const r = await call(dev, 'GET', `/api/v1/system/devtools/traces/${T_A}`);
    expect(r.status).toBe(200);
    const text = noiDungChoAI(r.body.data);
    expect(text).toContain(`## Lỗi cần sửa — trace ${T_A}`);
    expect(text).toContain('Kernel không được gọi — sổ không đổi.');
    // Cây span thụt lề cha → con, thuộc tính rút gọn.
    expect(text).toContain('- `HTTP POST /api/v1/payment-requests/:id/pay` — rejected');
    expect(text).toContain('  - `action quy.payment-request.pay` — rejected');
    expect(text).toContain('action=quy.payment-request.pay');
    expect(text).toContain('table=payment_requests');
    expect(text).toContain('(ngoại lệ AppError)');
    // Chỗ tìm mã + việc phải làm.
    expect(text).toContain("`defineAction({ id: 'quy.payment-request.pay' … })` trong `apps/api/src/phan-he/quy/`");
    expect(text).toContain('docs/ops/SO-TAY-DIEU-TRA-LOI.md` mục TH-01');
    expect(text).toContain('Viết test tái hiện');
    expect(text).toContain('mã `CONFLICT`');
    expect(text).toContain('từ chối đúng luật');
    // Mã đơn vị dò ở dạng giá trị, không dò chữ số trần (CSDL test mới cho id ngắn).
    for (const secret of [`"${tenantA}"`, `=${tenantA}`, 'so_tien', '1234567', 'mst', 'Nguyễn Văn Bí Mật', 'PC-0099']) expect(text).not.toContain(secret);
    expect(text).not.toMatch(/bizcity\.tenant|tenant"?\s*[=:]/i);
  });
});
