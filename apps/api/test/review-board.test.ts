/**
 * PHASE-022 W4 — Bàn đánh giá (HT08): GET /api/v1/system/review-board?persona=, …/recheck?code=
 *   T022-W4-1  ba vai cùng dữ liệu, khác thứ tự nhóm và lời mở đầu; không điểm %, có dòng miễn trừ
 *   T022-W4-2  gây quỹ âm ⇒ F22-CASH-01 "Cảnh báo" kèm remedy (bước, màn ACC55, mã kiểm lại); sửa ⇒ kiểm lại một mã ra pass
 *   T022-W4-3  ca 🛡 = "Chặn đúng", ca chưa có kiểm = "Chưa kiểm được" (không tính là đạt)
 *   T022-W4-4  mã kiểm không có ⇒ 404; mã sai dạng ⇒ 400
 *   T022-W4-5  vai trò auditor: xem được Bàn đánh giá, không ghi chứng từ (403); viewer không xem được Bàn đánh giá (403)
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { call, saleDoc, setupTenant, type TestCtx } from './helpers.js';

let ctx: TestCtx;
const board = async (persona: string) => {
  const r = await call(ctx, 'GET', `/api/v1/system/review-board?persona=${persona}`);
  expect(r.status, JSON.stringify(r.body)).toBe(200);
  return r.body.data;
};
const findCase = (b: any, id: string) => b.groups.flatMap((g: any) => g.cases).find((c: any) => c.id === id);
const voucher = async (docType: string, docDate: string, debitAccount: string, creditAccount: string, amount: number) => {
  const r = await call(ctx, 'POST', '/api/v1/vouchers', { docType, branchCode: 'CN01', docDate, description: 'PHASE-022 W4', lines: [{ debitAccount, creditAccount, amount }] });
  expect(r.status, JSON.stringify(r.body)).toBeLessThan(300);
};
const loginAs = async (email: string, password: string) =>
  (await ctx.app.inject({ method: 'POST', url: '/api/v1/auth/login', payload: { tenantCode: ctx.tenantCode, email, password } })).json().data.token as string;

beforeAll(async () => {
  ctx = await setupTenant();
});
afterAll(async () => {
  await ctx.app.close();
});

describe('Bàn đánh giá', () => {
  it('T022-W4-1: ba vai — khác thứ tự nhóm, cùng dữ liệu; có miễn trừ, không điểm %', async () => {
    const ktt = await board('chief_accountant');
    const ks = await board('auditor');
    const tt = await board('tax_inspector');
    expect(ktt.groups[0].key).toBe('DOC');
    expect(ks.groups[0].key).toBe('LEDGER');
    expect(tt.groups[0].key).toBe('TAX');
    expect(ks.onlyTodo).toBe(false);
    expect(tt.intro).toMatch(/Không phải kết luận/);
    expect(ktt.disclaimer).toMatch(/Không có điểm tuân thủ/);
    expect(JSON.stringify(ktt)).not.toMatch(/"score"|"percent"/);
    const sum = Object.values(ktt.counts as Record<string, number>).reduce((a, b) => a + b, 0);
    expect(sum).toBe(ktt.groups.reduce((n: number, g: any) => n + g.cases.length, 0));
    // vai thanh tra đặt ca mình là vai chính lên trước trong nhóm
    const cash = tt.groups.find((g: any) => g.key === 'CASH');
    expect(cash.cases[0].primary).toBe(true);
  });

  it('T022-W4-2: quỹ âm ⇒ Cảnh báo kèm cách khắc phục; thu bù ⇒ kiểm lại một mã ra đạt', async () => {
    await voucher('payment', '2026-03-10', '64211', '1111', 500000);
    const c = findCase(await board('chief_accountant'), 'F22-CASH-01');
    expect(c).toMatchObject({ status: 'warn', count: 1, verifyCode: 'CASH_NEGATIVE', sample: ['CN01:1111@2026-03-10'] });
    expect(c.remedy.steps.length).toBeGreaterThan(0);
    expect(c.remedy.steps[0].screen.code).toBe('ACC55');
    expect(c.consequence.length).toBeGreaterThan(0);
    const before = await call(ctx, 'GET', '/api/v1/system/review-board/recheck?code=CASH_NEGATIVE');
    expect(before.body.data).toMatchObject({ code: 'CASH_NEGATIVE', level: 'warn', count: 1 });
    await voucher('receipt', '2026-03-09', '1111', '5158', 2000000);
    const after = await call(ctx, 'GET', '/api/v1/system/review-board/recheck?code=CASH_NEGATIVE');
    expect(after.body.data).toMatchObject({ code: 'CASH_NEGATIVE', level: 'pass', count: 0 });
    expect(findCase(await board('chief_accountant'), 'F22-CASH-01').status).toBe('ok');
  });

  it('T022-W4-3: ca Kernel chặn = Chặn đúng; ca chưa có kiểm = Chưa kiểm được, có lý do', async () => {
    const all = (await board('auditor')).groups.flatMap((g: any) => g.cases);
    const blocked = all.filter((c: any) => c.status === 'block_ok');
    expect(blocked.length).toBeGreaterThan(0);
    expect(blocked.every((c: any) => c.note)).toBe(true);
    const untested = all.filter((c: any) => c.status === 'untested');
    expect(untested.length).toBeGreaterThan(0);
    expect(untested.every((c: any) => c.note)).toBe(true);
    // chưa có kiểm ⇒ không có mã kiểm lại; có kiểm nhưng chưa có dữ liệu ⇒ vẫn kiểm lại được
    expect(untested.some((c: any) => !c.verifyCode)).toBe(true);
  });

  it('T022-W4-4: mã kiểm không có ⇒ 404; sai dạng ⇒ 400', async () => {
    expect((await call(ctx, 'GET', '/api/v1/system/review-board/recheck?code=KHONG_CO_MA')).status).toBe(404);
    expect((await call(ctx, 'GET', '/api/v1/system/review-board/recheck?code=drop%20table')).status).toBe(400);
  });

  it('T022-W4-5: auditor xem Bàn đánh giá, không ghi chứng từ; viewer không xem được', async () => {
    expect((await call(ctx, 'POST', '/api/v1/users', { email: 'ks@ketoan.local', fullName: 'Ban kiểm soát', role: 'auditor', password: 'Ks@123456' })).status).toBe(201);
    expect((await call(ctx, 'POST', '/api/v1/users', { email: 'xem@ketoan.local', fullName: 'Người xem', role: 'viewer', password: 'Xem@12345' })).status).toBe(201);
    const ks = { authorization: `Bearer ${await loginAs('ks@ketoan.local', 'Ks@123456')}` };
    const xem = { authorization: `Bearer ${await loginAs('xem@ketoan.local', 'Xem@12345')}` };
    expect((await ctx.app.inject({ method: 'GET', url: '/api/v1/system/review-board?persona=auditor', headers: ks })).statusCode).toBe(200);
    expect((await ctx.app.inject({ method: 'GET', url: '/api/v1/accounts', headers: ks })).statusCode).toBe(200);
    expect((await ctx.app.inject({ method: 'POST', url: '/api/v1/documents', headers: { ...ks, 'idempotency-key': 'ks-1' }, payload: saleDoc() })).statusCode).toBe(403);
    expect((await ctx.app.inject({ method: 'GET', url: '/api/v1/system/review-board?persona=auditor', headers: xem })).statusCode).toBe(403);
  });
});
