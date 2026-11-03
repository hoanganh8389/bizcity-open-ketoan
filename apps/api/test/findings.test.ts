/**
 * Thư viện phát hiện hai cổng (bizcity_findings@1, PHASE-024 S024-27, ADR-0019 R-GATE-5): tra mã qua HTTP và công cụ MCP.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { FINDINGS_LIBRARY } from '@ketoan/contracts';
import { call, setupTenant, type TestCtx } from './helpers.js';

let ctx: TestCtx;
beforeAll(async () => { ctx = await setupTenant(); });
afterAll(async () => { await ctx.app.close(); });

describe('GET /api/v1/findings', () => {
  it('liệt kê đủ mã hai cổng, lọc theo cổng / mức / chữ', async () => {
    const all = await call(ctx, 'GET', '/api/v1/findings');
    expect(all.status, JSON.stringify(all.body)).toBe(200);
    expect(all.body.data.total).toBe(FINDINGS_LIBRARY.length);
    const b = await call(ctx, 'GET', '/api/v1/findings?gate=B&level=block');
    expect(b.body.data.items.length).toBeGreaterThan(0);
    expect(b.body.data.items.every((f: { gate: string; level: string; fix: string }) => f.gate === 'B' && f.level === 'block' && f.fix.length > 0)).toBe(true);
    const q = await call(ctx, 'GET', '/api/v1/findings?q=PART-HINT');
    expect(q.body.data.items.map((f: { code: string }) => f.code)).toEqual(['PART-HINT-001', 'PART-HINT-002', 'PART-HINT-003', 'PART-HINT-004']);
  });

  it('giải thích một mã (không phân biệt hoa thường); mã lạ → 404 kèm chỗ tra', async () => {
    const r = await call(ctx, 'GET', '/api/v1/findings/in-md-001');
    expect(r.status).toBe(200);
    expect(r.body.data).toMatchObject({ code: 'IN-MD-001', gate: 'B', step: 'L3', level: 'block', learn: 'docs/huong-dan/loi-dau-vao/IN-MD-001.md' });
    expect(r.body.data.why.length).toBeGreaterThan(10);
    const a = await call(ctx, 'GET', '/api/v1/findings/ACC-HINT-003');
    expect(a.body.data).toMatchObject({ gate: 'A', step: 'account', level: 'warn', basis: [{ key: 'TT99', title: 'Thông tư 99/2025/TT-BTC' }] });
    expect(a.body.data.fix).toMatch(/Theo dõi đối tượng/);
    const x = await call(ctx, 'GET', '/api/v1/findings/XX-YY-999');
    expect(x.status).toBe(404);
    expect(x.body.error.message).toMatch(/GET \/api\/v1\/findings/);
  });

  it('có trên MCP cho trợ lý AI (ai: read)', async () => {
    const res = await ctx.app.inject({ method: 'POST', url: '/mcp', headers: { authorization: `Bearer ${ctx.token}` }, payload: { jsonrpc: '2.0', id: 1, method: 'tools/list' } });
    const names = (res.json().result?.tools ?? []).map((t: { name: string }) => t.name);
    expect(names.some((n: string) => n.includes('findings') && n.includes('explain'))).toBe(true);
  });
});
