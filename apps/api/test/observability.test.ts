/**
 * Quan sát + mã lỗi (docs/ops/OBSERVABILITY.md, bizcity_errors@1): X-Request-Id (R-OBS-1), error.requestId (R-ERR-5),
 * ánh xạ lỗi trigger CSDL P0001 (R-ERR-8), /metrics (R-OBS-3), danh mục mã lỗi là nguồn của Errors.* (R-ERR-1).
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import Fastify from 'fastify';
import { ERROR_CATALOG, ERROR_CODES } from '@ketoan/contracts';
import { env } from '../src/config/env.js';
import { Errors } from '../src/core/errors.js';
import { registerErrorHandler } from '../src/core/http.js';
import { call, saleDoc, setupTenant, type TestCtx } from './helpers.js';

let ctx: TestCtx;

beforeAll(async () => {
  ctx = await setupTenant();
  expect((await call(ctx, 'POST', '/api/v1/documents', saleDoc())).body.data.status).toBe('posted');
});
afterAll(async () => {
  await ctx.app.close();
});

describe('Quan sát', () => {
  it('R-OBS-1: mọi phản hồi có X-Request-Id; nhận mã hợp lệ của bên gọi, mã xấu thì tự sinh', async () => {
    const own = await ctx.app.inject({ method: 'GET', url: '/api/v1/system/health', headers: { 'x-request-id': 'cell-turn-0001' } });
    expect(own.headers['x-request-id']).toBe('cell-turn-0001');
    const bad = await ctx.app.inject({ method: 'GET', url: '/api/v1/system/health', headers: { 'x-request-id': 'x y' } });
    expect(bad.headers['x-request-id']).toMatch(/^req-/);
  });

  it('R-ERR-5: phản hồi lỗi có error.requestId trùng header; thông báo / HTTP theo danh mục', async () => {
    const res = await ctx.app.inject({ method: 'GET', url: '/api/v1/accounts', headers: { 'x-request-id': 'bao-loi-0001' } });
    expect(res.statusCode).toBe(401);
    expect(res.json().error).toMatchObject({ code: 'UNAUTHORIZED', requestId: 'bao-loi-0001', message: ERROR_CATALOG.UNAUTHORIZED.message });
    const missing = await call(ctx, 'GET', '/api/v1/khong-co-duong-nay');
    expect(missing.body.error).toMatchObject({ code: 'NOT_FOUND', requestId: expect.stringMatching(/^req-/) });
  });

  it('R-ERR-8: lỗi trigger bảo vệ (P0001) không thành 500 — sổ chỉ thêm → CONFLICT + reason, không cân → UNBALANCED_ENTRY', async () => {
    const app = Fastify();
    registerErrorHandler(app);
    const pg = (message: string) => Object.assign(new Error(message), { code: 'P0001' });
    app.get('/sua-so', async () => { throw pg('Sổ cái chỉ được thêm. Hãy ghi bút toán đảo thay vì sửa hoặc xoá.'); });
    app.get('/khong-can', async () => { throw pg('Bút toán 12 không cân: Nợ 100 ≠ Có 90'); });
    app.get('/loi-khac', async () => { throw new Error('connection reset by peer at 10.0.0.5'); });
    const a = await app.inject({ method: 'GET', url: '/sua-so' });
    expect(a.statusCode).toBe(409);
    expect(a.json().error).toMatchObject({ code: 'CONFLICT', message: expect.stringContaining('chỉ được thêm'), details: { reason: 'LEDGER_APPEND_ONLY' } });
    const b = await app.inject({ method: 'GET', url: '/khong-can' });
    expect([b.statusCode, b.json().error.code]).toEqual([422, 'UNBALANCED_ENTRY']);
    // R-ERR-4: lỗi lạ → 500 "Lỗi hệ thống", không lộ chi tiết.
    const c = await app.inject({ method: 'GET', url: '/loi-khac' });
    expect(c.statusCode).toBe(500);
    expect(c.json().error.message).toBe('Lỗi hệ thống');
    expect(c.body).not.toContain('10.0.0.5');
    await app.close();
  });

  it('R-ERR-1: mọi mã trong ERROR_CODES có trong danh mục; Errors.* lấy HTTP + thông báo mặc định từ danh mục', () => {
    for (const code of Object.values(ERROR_CODES)) expect(ERROR_CATALOG[code], code).toBeDefined();
    expect(Errors.forbidden()).toMatchObject({ code: 'FORBIDDEN', httpStatus: 403, message: ERROR_CATALOG.FORBIDDEN.message });
    expect(Errors.rateLimited()).toMatchObject({ httpStatus: 429 });
    expect(Errors.capabilityMissing('ledger.query')).toMatchObject({ httpStatus: 501, details: { capability: 'ledger.query' } });
  });

  it('/metrics: văn bản Prometheus có số đo HTTP, CSDL, sổ cái, phiên bản; METRICS_TOKEN đặt thì bắt buộc', async () => {
    const res = await ctx.app.inject({ method: 'GET', url: '/metrics' });
    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toMatch(/^text\/plain/);
    for (const name of ['bizcity_build_info{', 'bizcity_http_requests_total{', 'bizcity_http_request_duration_seconds_bucket{', 'bizcity_db_query_duration_seconds_bucket{',
      'bizcity_ledger_events{status="posted"}', 'bizcity_ledger_entries_last_24h', 'bizcity_diagnostics_errors{layer="L3"}', 'bizcity_db_pool_connections{state="total"}', 'process_resident_memory_bytes']) {
      expect(res.body, name).toContain(name);
    }
    expect(res.body).toMatch(/bizcity_http_errors_total\{code="(UNAUTHORIZED|NOT_FOUND)"\} \d+/);
    // Không nhãn tenant / actor trên số đo (R-OBS-4).
    expect(res.body).not.toMatch(/tenant="|actor="/);

    const saved = env.METRICS_TOKEN;
    (env as { METRICS_TOKEN: string }).METRICS_TOKEN = 'bi-mat-do-luong-123';
    try {
      expect((await ctx.app.inject({ method: 'GET', url: '/metrics' })).statusCode).toBe(401);
      expect((await ctx.app.inject({ method: 'GET', url: '/metrics', headers: { authorization: 'Bearer bi-mat-do-luong-123' } })).statusCode).toBe(200);
    } finally {
      (env as { METRICS_TOKEN: string }).METRICS_TOKEN = saved;
    }
  });
});
