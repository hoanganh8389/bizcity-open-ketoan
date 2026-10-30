/**
 * Đóng / mở kỳ theo lưới chi nhánh × loại chứng từ (KT-10) và khoá dữ liệu theo ngày (KT-07).
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { todayVN } from '../src/core/date-rules.js';
import { call, setupTenant, type TestCtx } from './helpers.js';

let ctx: TestCtx;
let kt: TestCtx;
let ktt: TestCtx;
const voucher = (docDate: string, branchCode = 'CN01') => ({ docType: 'payment', branchCode, docDate, description: 'Chi phí', lines: [{ debitAccount: '64211', creditAccount: '1111', amount: 100000 }] });
const daysAgo = (n: number) => new Date(Date.parse(`${todayVN()}T00:00:00Z`) - n * 86_400_000).toISOString().slice(0, 10);

async function userCtx(email: string, role: string): Promise<TestCtx> {
  expect((await call(ctx, 'POST', '/api/v1/users', { email, fullName: email.split('@')[0], role, password: 'Pass@12345' })).status).toBe(201);
  const res = await ctx.app.inject({ method: 'POST', url: '/api/v1/auth/login', payload: { tenantCode: ctx.tenantCode, email, password: 'Pass@12345' } });
  return { ...ctx, token: res.json().data.token };
}

beforeAll(async () => {
  ctx = await setupTenant();
  await call(ctx, 'POST', '/api/v1/branches', { code: 'CN02', name: 'Cửa hàng 02' });
  kt = await userCtx('kt@ketoan.local', 'accountant');
  ktt = await userCtx('ktt@ketoan.local', 'chief_accountant');
});
afterAll(async () => {
  await ctx.app.close();
});

describe('Đóng / mở kỳ theo lưới', () => {
  it('khoá từng ô; chỉ chặn đúng chi nhánh, đúng loại; mở khoá phải có lý do và ghi nhật ký', async () => {
    const period = { year: 2026, month: 8 };
    const r = await call(ctx, 'PUT', '/api/v1/periods/locks', { ...period, changes: [{ branchCode: 'CN01', docType: 'payment', locked: true }, { branchCode: 'CN01', docType: 'manual', locked: true }] });
    expect(r.status, JSON.stringify(r.body)).toBe(200);
    expect(r.body.data).toEqual({ locked: 2, unlocked: 0 });
    // Ghi lại lần nữa: không tạo trùng.
    expect((await call(ctx, 'PUT', '/api/v1/periods/locks', { ...period, changes: [{ branchCode: 'CN01', docType: 'payment', locked: true }] })).body.data).toEqual({ locked: 0, unlocked: 0 });

    const grid = (await call(ctx, 'GET', '/api/v1/periods/lock-grid?year=2026&month=8')).body.data;
    expect(grid.branches.map((b: { code: string }) => b.code)).toEqual(['CN01', 'CN02']);
    expect(grid.locks.map((l: { branch: string; docType: string }) => `${l.branch}|${l.docType}`).sort()).toEqual(['CN01|manual', 'CN01|payment']);

    const blocked = await call(ctx, 'POST', '/api/v1/vouchers', voucher('2026-08-15'));
    expect(blocked.status).toBe(409);
    expect(blocked.body.error.code).toBe('PERIOD_LOCKED');
    expect((await call(ctx, 'POST', '/api/v1/vouchers', voucher('2026-08-15', 'CN02'))).status).toBe(201);
    expect((await call(ctx, 'POST', '/api/v1/vouchers', { ...voucher('2026-08-15'), docType: 'receipt', lines: [{ debitAccount: '1111', creditAccount: '51111', amount: 1000 }] })).status).toBe(201);

    const unlockNoReason = await call(ctx, 'PUT', '/api/v1/periods/locks', { ...period, changes: [{ branchCode: 'CN01', docType: 'payment', locked: false }] });
    expect(unlockNoReason.status).toBe(400);
    const unlock = await call(ctx, 'PUT', '/api/v1/periods/locks', { ...period, changes: [{ branchCode: 'CN01', docType: 'payment', locked: false }], reason: 'Sửa phiếu chi ngày 15' });
    expect(unlock.body.data).toEqual({ locked: 0, unlocked: 1 });
    expect((await call(ctx, 'POST', '/api/v1/vouchers', voucher('2026-08-15'))).status).toBe(201);

    const events = (await call(ctx, 'GET', '/api/v1/periods/lock-events?year=2026&month=8')).body.data;
    expect(events).toHaveLength(3);
    expect(events[0]).toMatchObject({ action: 'unlock', branch: 'CN01', docType: 'payment', reason: 'Sửa phiếu chi ngày 15', period: '2026-08' });

    // Kế toán viên không có quyền khoá.
    expect((await call(kt, 'PUT', '/api/v1/periods/locks', { ...period, changes: [{ branchCode: 'CN02', docType: 'payment', locked: true }] })).status).toBe(403);
  });

  it('khoá chung: mở khoá bắt buộc lý do', async () => {
    expect((await call(ctx, 'POST', '/api/v1/periods/locks', { year: 2026, month: 7 })).status).toBe(200);
    const lock = (await call(ctx, 'GET', '/api/v1/periods/lock-grid?year=2026&month=7')).body.data.locks[0];
    expect(lock).toMatchObject({ branch: null, docType: '*' });
    expect((await call(ctx, 'DELETE', `/api/v1/periods/locks/${lock.id}`)).status).toBe(400);
    expect((await call(ctx, 'DELETE', `/api/v1/periods/locks/${lock.id}?reason=${encodeURIComponent('Nhập bổ sung hoá đơn')}`)).status).toBe(200);
    const events = (await call(ctx, 'GET', '/api/v1/periods/lock-events?year=2026&month=7')).body.data;
    expect(events.map((e: { action: string }) => e.action)).toEqual(['unlock', 'lock']);
  });

  it('bảng kiểm trước khi khoá', async () => {
    const r = await call(ctx, 'GET', '/api/v1/periods/check?year=2026&month=8');
    expect(r.status, JSON.stringify(r.body)).toBe(200);
    const byKey = Object.fromEntries(r.body.data.map((c: { key: string; count: number }) => [c.key, c]));
    expect(Object.keys(byKey)).toEqual(['integrity', 'errors', 'entryMismatch', 'balanceMismatch', 'orphanReturns', 'paymentRequests', 'cogs', 'closing', 'closingStale', 'closingResidual']);
    // Sổ đúng: tự chẩn đoán L3 không có lỗi (R-DIAG-4 — có lỗi thì khoá kỳ bị chặn, xem diagnostics.test.ts).
    expect(byKey.integrity).toMatchObject({ count: 0 });
    // Tháng 8 có phiếu chi ở CN01, CN02 nhưng chưa kết chuyển.
    expect(byKey.closing).toMatchObject({ count: 2, detail: 'CN01, CN02' });
  });
});

describe('Khoá dữ liệu theo ngày', () => {
  it('khoá đến ngày, chỉ sửa trong N ngày: chặn kế toán viên, không chặn kế toán trưởng', async () => {
    const lock = await call(ctx, 'PUT', '/api/v1/settings/data-lock', { lockUntil: daysAgo(20), editWithinDays: 10 });
    expect(lock.status, JSON.stringify(lock.body)).toBe(200);
    expect((await call(kt, 'PUT', '/api/v1/settings/data-lock', { lockUntil: null })).status).toBe(403);
    expect((await call(kt, 'GET', '/api/v1/settings/data-lock')).body.data).toMatchObject({ lockUntil: daysAgo(20), editWithinDays: 10, todayOnly: false, bypass: false });

    const old = await call(kt, 'POST', '/api/v1/vouchers', voucher(daysAgo(25)));
    expect(old.status).toBe(403);
    expect(old.body.error.message).toContain('Dữ liệu đang khoá đến ngày');
    const mid = await call(kt, 'POST', '/api/v1/vouchers', voucher(daysAgo(15)));
    expect(mid.status).toBe(403);
    expect(mid.body.error.message).toContain('trong 10 ngày gần nhất');
    expect((await call(ktt, 'POST', '/api/v1/vouchers', voucher(daysAgo(25)))).status).toBe(201);

    // Phiếu kế toán viên lập hôm nay; sửa lùi ngày về trước mốc khoá thì bị chặn.
    const own = await call(kt, 'POST', '/api/v1/vouchers', voucher(daysAgo(1)));
    expect(own.status).toBe(201);
    expect((await call(kt, 'PUT', `/api/v1/vouchers/${own.body.data.id}`, voucher(daysAgo(25)))).status).toBe(403);
    expect((await call(kt, 'PUT', `/api/v1/vouchers/${own.body.data.id}`, voucher(daysAgo(2)))).status).toBe(200);
  });

  it('chỉ lập phiếu hôm nay, cấm kế toán viên huỷ; chi tiết phiếu báo lý do bị chặn', async () => {
    await call(ctx, 'PUT', '/api/v1/settings/data-lock', { lockUntil: null, editWithinDays: 0, todayOnly: true, noCancelForAccountant: true });
    const y = await call(kt, 'POST', '/api/v1/vouchers', voucher(daysAgo(1)));
    expect(y.status).toBe(403);
    expect(y.body.error.message).toContain('ngày hôm nay');
    const today = await call(kt, 'POST', '/api/v1/vouchers', voucher(todayVN()));
    expect(today.status).toBe(201);
    const cancel = await call(kt, 'POST', '/api/v1/documents/cancel', { docKey: today.body.data.docKey, reason: 'thử' });
    expect(cancel.status).toBe(403);
    expect(cancel.body.error.message).toContain('không có quyền huỷ');
    expect((await call(ktt, 'POST', '/api/v1/documents/cancel', { docKey: today.body.data.docKey, reason: 'KTT huỷ' })).status).toBe(200);

    const byKtt = await call(ktt, 'POST', '/api/v1/vouchers', voucher(daysAgo(3)));
    expect(byKtt.status).toBe(201);
    await call(ctx, 'PUT', '/api/v1/settings/data-lock', { lockUntil: daysAgo(5) });
    const ownOld = (await call(ctx, 'POST', '/api/v1/vouchers', voucher(daysAgo(6)))).body.data;
    // Chủ đơn vị lập (kế toán viên không sửa được phiếu người khác) — dùng kế toán trưởng xem để chắc không bị chặn.
    expect((await call(ktt, 'GET', `/api/v1/documents/${ownOld.id}`)).body.data).toMatchObject({ canModify: true, modifyBlockedReason: null });
    await call(ctx, 'PUT', '/api/v1/settings/data-lock', { lockUntil: daysAgo(5), noCancelForAccountant: false, todayOnly: false });
    const mine = await call(kt, 'POST', '/api/v1/vouchers', voucher(daysAgo(2)));
    expect(mine.status).toBe(201);
    await call(ctx, 'PUT', '/api/v1/settings/data-lock', { lockUntil: daysAgo(1) });
    const detail = (await call(kt, 'GET', `/api/v1/documents/${mine.body.data.id}`)).body.data;
    expect(detail.canModify).toBe(false);
    expect(detail.modifyBlockedReason).toContain('Dữ liệu đang khoá đến ngày');
  });
});
