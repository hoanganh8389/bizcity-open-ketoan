/**
 * Commit Guard (PHASE-024 S024-29, ADR-0019 R-GATE-8): dấu cấu hình lúc Kiểm thử so với lúc ghi sổ.
 *   - dấu chỉ đổi khi phần cấu hình chứng từ chạm tới đổi (mặt hàng trên dòng), không đổi khi sửa mặt hàng khác;
 *   - ca cặp IN-GUARD-001: Kiểm thử đạt → mặt hàng thành nháp → tiền kiểm với dấu cũ báo IN-GUARD-001 (+ IN-ITEM-009) VÀ cửa nạp
 *     (header X-Preflight-Guard) từ chối, bể chờ giữ với IN-GUARD-001, không thành sự việc;
 *   - cấu hình đổi nhưng chạy lại vẫn đạt → cửa nạp nhận; không gửi dấu → hành vi cũ;
 *   - core.document.submit nhận `guard` cùng luật.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { withRequestContext } from '@bizcity/platform/core/request-context';
import type { AuthContext } from '../src/core/auth.js';
import { preflight } from '../src/kernel/public.js';
import { db } from '../src/db/client.js';
import { saleDoc, setupTenant, type TestCtx } from './helpers.js';

let ctx: TestCtx;
let tenantId = '';
let auth: AuthContext;

const pre = (raw: unknown, guard?: string) => withRequestContext({ requestId: `cg-${Math.random().toString(36).slice(2, 9)}`, correlationId: 'cg', tenantId },
  () => db.transaction().execute((trx) => preflight(trx, auth, raw, guard ? { guard } : {})));
const door = (raw: unknown, guard?: string) => ctx.app.inject({
  method: 'POST', url: '/api/v1/documents', payload: raw as never,
  headers: { authorization: `Bearer ${ctx.token}`, ...(guard ? { 'x-preflight-guard': guard } : {}) },
});
const eventOf = (docKey: string) => db.selectFrom('accounting_events').select('status').where('tenant_id', '=', tenantId).where('doc_key', '=', docKey).executeTakeFirst();
const codes = (r: { findings: { code: string }[] }) => r.findings.map((f) => f.code);
const setProduct = (sku: string, v: { is_draft?: boolean; draft_codes?: string[]; name?: string }) =>
  db.updateTable('products').set({ ...v, updated_at: new Date() }).where('tenant_id', '=', tenantId).where('sku', '=', sku).execute();

let k = 0;
const base = saleDoc();
const sale = (sku: string) => { k += 1; return saleDoc({ docKey: `cg:CN01:${k}`, docNo: `CG${k}`, lines: [{ ...base.lines[0]!, sku }, ...base.lines.slice(1)] }) as unknown as Record<string, unknown>; };

beforeAll(async () => {
  ctx = await setupTenant();
  tenantId = (await db.selectFrom('tenants').select('id').where('code', '=', ctx.tenantCode).executeTakeFirstOrThrow()).id;
  await db.insertInto('products').values(['G1', 'G2', 'G3', 'KHAC'].map((sku) => ({ tenant_id: tenantId, sku, name: `Hàng ${sku}`, unit: 'Cái' }))).execute();
  auth = { tenantId, actor: 'system:guard-test', actorName: 'Thử guard', kind: 'user', role: 'owner', permissions: new Set(['documents:write', 'documents:read']) } as AuthContext;
});
afterAll(async () => {
  await ctx.app.close();
});

describe('Dấu cấu hình', () => {
  it('ổn định; sửa mặt hàng khác không đổi dấu; sửa mặt hàng trên dòng thì đổi', async () => {
    const raw = sale('G1');
    const a = await pre(raw);
    expect(a.guard).toMatch(/^g1:[0-9a-f]{32}$/);
    expect((await pre(raw)).guard).toBe(a.guard);
    await setProduct('KHAC', { name: 'Đổi tên hàng khác' });
    expect((await pre(raw, a.guard)).guardChanged).toBe(false);
    await setProduct('G1', { name: 'Đổi tên G1' });
    const b = await pre(raw, a.guard);
    expect(b.guardChanged).toBe(true);
    expect(codes(b)).not.toContain('IN-GUARD-001'); // đổi nhưng vẫn đạt → không chặn
  });
});

describe('Ca cặp IN-GUARD-001: cấu hình đổi, chạy lại còn lỗi chặn ⇔ cửa nạp từ chối', () => {
  it('Kiểm thử đạt → mặt hàng thành nháp → preflight + cửa nạp cùng báo IN-GUARD-001, bể giữ', async () => {
    const raw = sale('G2');
    const first = await pre(raw);
    expect(first.findings.filter((f) => f.severity === 'block')).toEqual([]);
    await setProduct('G2', { is_draft: true, draft_codes: ['ITEM-BLOCK-001'] });

    const again = await pre(raw, first.guard);
    expect(codes(again)).toEqual(expect.arrayContaining(['IN-GUARD-001', 'IN-ITEM-009']));

    const res = await door(raw, first.guard);
    expect(res.statusCode, res.body).toBe(400);
    expect(res.json().error.message).toMatch(/IN-GUARD-001/);
    expect(await eventOf(raw.docKey as string)).toBeUndefined();
    const inbox = await db.selectFrom('intake_inbox').select('findings').where('tenant_id', '=', tenantId).where('doc_key', '=', raw.docKey as string).executeTakeFirstOrThrow();
    expect(codes({ findings: inbox.findings as { code: string }[] })).toEqual(expect.arrayContaining(['IN-GUARD-001', 'IN-ITEM-009']));
  });

  it('không gửi dấu → hành vi cũ (IN-ITEM-009, không IN-GUARD-001)', async () => {
    const res = await door(sale('G2'));
    expect(res.statusCode).toBe(400);
    expect(res.json().error.message).toMatch(/IN-ITEM-009/);
    expect(res.json().error.message).not.toMatch(/IN-GUARD-001/);
  });
});

describe('Cấu hình đổi nhưng vẫn đạt / dấu trùng → nhận', () => {
  it('dấu cũ, mặt hàng chỉ đổi tên → cửa nạp nhận', async () => {
    const raw = sale('G3');
    const first = await pre(raw);
    await setProduct('G3', { name: 'G3 tên mới' });
    const res = await door(raw, first.guard);
    expect(res.statusCode, res.body).toBe(200);
    expect(await eventOf(raw.docKey as string)).toBeDefined();
  });

  it('core.document.submit: dấu trùng → nhận; dấu cũ + mặt hàng thành nháp → IN-GUARD-001', async () => {
    const ok = sale('G3');
    const g = (await pre(ok)).guard;
    const r1 = await ctx.app.inject({ method: 'POST', url: '/api/v1/documents/submit', payload: { document: ok, guard: g }, headers: { authorization: `Bearer ${ctx.token}` } });
    expect(r1.statusCode, r1.body).toBe(200);

    const bad = sale('G3');
    const g2 = (await pre(bad)).guard;
    await setProduct('G3', { is_draft: true, draft_codes: ['ITEM-BLOCK-001'] });
    const r2 = await ctx.app.inject({ method: 'POST', url: '/api/v1/documents/submit', payload: { document: bad, guard: g2 }, headers: { authorization: `Bearer ${ctx.token}` } });
    expect(r2.statusCode).toBe(400);
    expect(r2.json().error.message).toMatch(/IN-GUARD-001/);
  });
});
