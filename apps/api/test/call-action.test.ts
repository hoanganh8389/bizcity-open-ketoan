/**
 * Gọi action công khai của module khác theo mã (STD-MOD-3): callAction cho service cũ, ctx.actions.call trong action.
 * Thuế lấy B02 / bảng ngắn – dài hạn B01 của ke-toan theo đường này, không import báo cáo (SC-MOD-1).
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { z } from 'zod';
import { db } from '../src/db/client.js';
import { callAction, defineAction, runAction } from '../src/core/actions.js';
import type { AuthContext, Permission } from '../src/core/auth.js';
import { call, setupTenant, type TestCtx } from './helpers.js';

let ctx: TestCtx;
let tenantId: string;
const authWith = (perms: Permission[]): AuthContext => ({ tenantId, actor: 'user:test', actorName: 'Test', kind: 'user', role: null, permissions: new Set(perms) });

beforeAll(async () => {
  ctx = await setupTenant();
  tenantId = String((await db.selectFrom('tenants').select('id').where('code', '=', ctx.tenantCode).executeTakeFirstOrThrow()).id);
});
afterAll(async () => {
  await ctx.app.close();
});

describe('callAction', () => {
  it('chạy action đọc của module khác với quyền người gọi', async () => {
    const rules = await callAction<{ prefix: string; asset: [string, string] | null }[]>('accounting.report.term-rules', {}, authWith(['catalog:read']));
    expect(rules.find((r) => r.prefix === '131')?.asset).toEqual(['131', '211']);
    const is = await callAction<{ rows: { code: string; current: number }[] }>('accounting.report.income-statement', { from: '2026-01-01', to: '2026-12-31' }, authWith(['reports:read']));
    expect(is.rows.map((r) => r.code)).toEqual(expect.arrayContaining(['10', '50', '60']));
  });

  it('thiếu quyền → FORBIDDEN; mã không có → NOT_FOUND; input sai → lỗi kiểm', async () => {
    await expect(callAction('accounting.report.income-statement', { from: '2026-01-01', to: '2026-12-31' }, authWith(['catalog:read']))).rejects.toMatchObject({ code: 'FORBIDDEN' });
    await expect(callAction('ke-toan.khong-co.xem', {}, authWith(['reports:read']))).rejects.toMatchObject({ code: 'NOT_FOUND' });
    await expect(callAction('accounting.report.income-statement', { from: '01/2026', to: '2026-12-31' }, authWith(['reports:read']))).rejects.toThrow();
  });

  it('không gọi action ghi', async () => {
    await expect(callAction('quy.payment-request.create', {}, authWith(['documents:write']))).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
  });
});

describe('ctx.actions.call trong action', () => {
  it('action của module gọi action đọc của module khác', async () => {
    const def = defineAction({
      id: 'thue.quy-tac-dai-han.xem', title: 'Quy tắc dài hạn (test)', permission: 'catalog:read', effect: 'read', idempotency: 'none',
      input: z.object({ account: z.string() }), output: z.string().nullable(), expose: {},
      handler: async (c, input) => {
        const rules = await c.actions.call<{ prefix: string; label: string }[]>('accounting.report.term-rules', {});
        return rules.filter((r) => input.account.startsWith(r.prefix)).sort((a, b) => b.prefix.length - a.prefix.length)[0]?.label ?? null;
      },
    });
    const res = await runAction(def, { account: '3387' }, { auth: authWith(['catalog:read']), requestId: 'ca-1' });
    expect(res.data).toBe('Doanh thu chờ phân bổ');
  });
});

describe('thuế qua HTTP', () => {
  it('bảng nhóm dài hạn và tờ khai TNDN vẫn dựng được', async () => {
    const rules = await call(ctx, 'GET', '/api/v1/long-term-balances/rules');
    expect(rules.body.data?.length, JSON.stringify(rules.body)).toBeGreaterThan(10);
    const cit = await call(ctx, 'GET', '/api/v1/cit-returns/build?year=2026');
    expect(cit.body.ok, JSON.stringify(cit.body)).toBe(true);
    expect(cit.body.data.auto).toHaveProperty('A1');
  });

  it('add-in Bảng tính AI lấy cân đối phát sinh qua action', async () => {
    const r = await call(ctx, 'GET', '/api/v1/addins/spreadsheet-ai/dataset?kind=trial-balance&from=2026-10-01&to=2026-10-31');
    expect(r.body.ok, JSON.stringify(r.body)).toBe(true);
    expect(r.body.data.columns[0]).toBe('Số TK');
    expect(Array.isArray(r.body.data.rows)).toBe(true);
  });
});
