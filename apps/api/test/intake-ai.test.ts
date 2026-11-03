/**
 * Gợi ý cấu hình và action đọc cho AI (PHASE-021 W5, PHASES 2.21; ADR-0014 D9, D11; R-INTAKE-8/12):
 *   S021-23 lỗi cấu hình lặp từ N chứng từ → gợi ý (chỉ gợi ý, không đổi dữ liệu), người không có documents:edit-all không xem
 *   T021-18 action AI core.intake.get không trả nguyên văn (kể cả giá trị đã gửi trong phát hiện); không có action ghi nào cho AI
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { db } from '../src/db/client.js';
import { call, saleDoc, setupTenant, type TestCtx } from './helpers.js';

let ctx: TestCtx;
let tenantId = '';
let ktv = '';
let seq = 0;
let k = 0;
const H = (t = ctx.token) => ({ authorization: `Bearer ${t}` });
const send = (over: Record<string, unknown>) => { k += 1; return ctx.app.inject({ method: 'POST', url: '/api/v1/documents', payload: saleDoc({ docKey: `ai:CN01:${k}`, docNo: `AI${k}`, ...over }) as never, headers: H() }); };
const rpc = async (method: string, params?: unknown, token = ctx.token) => {
  const res = await ctx.app.inject({ method: 'POST', url: '/mcp', payload: { jsonrpc: '2.0', id: (seq += 1), method, params } as never, headers: H(token) });
  return res.json();
};
const tool = async (name: string, args: unknown) => (await rpc('tools/call', { name, arguments: args })).result;
const branchCount = async () => Number((await db.selectFrom('branches').select(db.fn.countAll().as('n')).where('tenant_id', '=', tenantId).executeTakeFirstOrThrow()).n);

const SECRET = 'BI-MAT-AI-001';
let itemId = '';

beforeAll(async () => {
  ctx = await setupTenant();
  tenantId = (await db.selectFrom('tenants').select('id').where('code', '=', ctx.tenantCode).executeTakeFirstOrThrow()).id;
  expect((await call(ctx, 'POST', '/api/v1/users', { email: 'ktv-ai@ketoan.local', fullName: 'Kế toán viên AI', role: 'accountant', password: 'Ktv@12345' })).status).toBe(201);
  ktv = (await ctx.app.inject({ method: 'POST', url: '/api/v1/auth/login', payload: { tenantCode: ctx.tenantCode, email: 'ktv-ai@ketoan.local', password: 'Ktv@12345' } })).json().data.token;
  // Một chứng từ hỏng có giá trị nhạy cảm: ngày sai khuôn, MST sai, diễn giải bí mật
  const bad = await send({ docDate: '05/10/2026', description: SECRET, partner: { code: '0912000077', name: 'Khách MST sai', taxCode: '01234' } });
  expect(bad.statusCode).toBe(400);
  itemId = bad.json().error.intake.id;
  // Lỗi cấu hình lặp: chi nhánh chưa khai ở ba chứng từ; chi nhánh khác chỉ hai chứng từ
  for (let i = 0; i < 3; i += 1) expect((await send({ branchCode: 'CN-LA-X' })).statusCode).toBe(400);
  for (let i = 0; i < 2; i += 1) expect((await send({ branchCode: 'CN-HAI' })).statusCode).toBe(400);
});
afterAll(async () => {
  await ctx.app.close();
});

describe('Gợi ý cấu hình từ lỗi lặp (S021-23)', () => {
  it('chi nhánh lạ lặp 3 lần → gợi ý kèm màn Danh mục chi nhánh; lặp 2 lần chưa gợi ý; dữ liệu không đổi', async () => {
    const before = await branchCount();
    const res = await ctx.app.inject({ method: 'GET', url: '/api/v1/intake/suggestions', headers: H() });
    expect(res.statusCode, res.body).toBe(200);
    const list = res.json().data as { code: string; value: string | null; items: number; suggestion: string; screen: { code: string } | null }[];
    const s = list.find((x) => x.code === 'IN-MD-001' && x.value === 'CN-LA-X');
    expect(s, res.body).toMatchObject({ items: 3, screen: { code: 'DM02' } });
    expect(s!.suggestion).toContain('CN-LA-X');
    expect(list.find((x) => x.value === 'CN-HAI')).toBeUndefined();
    expect(await branchCount()).toBe(before); // chỉ gợi ý, không tự khai chi nhánh
  });

  it('hạ ngưỡng min=2 thì thấy cả chi nhánh lặp 2 lần; kế toán viên (không documents:edit-all) → 403', async () => {
    const res = await ctx.app.inject({ method: 'GET', url: '/api/v1/intake/suggestions?min=2', headers: H() });
    expect((res.json().data as { value: string | null }[]).map((x) => x.value)).toEqual(expect.arrayContaining(['CN-LA-X', 'CN-HAI']));
    expect((await ctx.app.inject({ method: 'GET', url: '/api/v1/intake/suggestions', headers: H(ktv) })).statusCode).toBe(403);
  });
});

describe('Action đọc cho AI (S021-24, T021-18)', () => {
  it('tools/list có list / get / explain; không có công cụ ghi nào của bể chờ', async () => {
    const names = ((await rpc('tools/list')).result.tools as { name: string }[]).map((t) => t.name);
    expect(names).toEqual(expect.arrayContaining(['core.intake.list', 'core.intake.get', 'core.intake.explain']));
    expect(names.filter((n) => /^core\.intake\.(patch|resubmit|accept|dismiss|preflight)$/.test(n))).toEqual([]);
  });

  it('list: mục đang mở kèm mã, điểm; không nguyên văn', async () => {
    const r = await tool('core.intake.list', { status: 'open', limit: 50 });
    expect(r.isError, JSON.stringify(r)).toBeUndefined();
    const items = r.structuredContent.data.items as { id: string; codes: string[]; score: number }[];
    expect(items.find((i) => i.id === itemId)).toMatchObject({ score: 0, codes: expect.arrayContaining(['IN-SHAPE-003']) });
    expect(JSON.stringify(r)).not.toContain(SECRET);
  });

  it('get: phát hiện có mã, trường, vì sao, cách sửa nhưng KHÔNG có giá trị đã gửi / mong đợi, nguyên văn, diễn giải', async () => {
    const r = await tool('core.intake.get', { id: itemId });
    expect(r.isError, JSON.stringify(r)).toBeUndefined();
    const d = r.structuredContent.data;
    expect(d).toMatchObject({ id: itemId, status: 'open', score: 0, history: [] });
    expect(d.findings.map((f: { code: string }) => f.code)).toEqual(expect.arrayContaining(['IN-SHAPE-003', 'IN-MD-005']));
    expect(d.findings.every((f: Record<string, unknown>) => !('got' in f) && !('expected' in f) && typeof f.why === 'string' && typeof f.fix === 'string')).toBe(true);
    const text = JSON.stringify(r);
    for (const leak of [SECRET, '05/10/2026', '01234', '0912000077', 'payload_raw']) expect(text, leak).not.toContain(leak);
  });

  it('explain: câu kết luận + việc phải sửa + việc cần làm; mục không có → lỗi', async () => {
    const r = await tool('core.intake.explain', { id: itemId });
    const d = r.structuredContent.data;
    expect(d.summary).toContain('chưa vào sổ');
    expect(d.mustFix.map((f: { code: string }) => f.code)).toContain('IN-SHAPE-003');
    expect(d.canAccept).toContain('IN-MD-005');
    expect(d.nextSteps.length).toBeGreaterThan(0);
    expect(JSON.stringify(r)).not.toContain(SECRET);
    const none = await tool('core.intake.get', { id: '999999999' });
    expect(none.isError).toBe(true);
  });
});
