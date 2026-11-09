// [2026-11-10 11:20 AM Johnny Chu - Chu Hoàng Anh] PHASE-022 — S022-17 (RV-R1-06, BIZCITY-ERRORS-v1 §4b, 1.4.0-draft): details.context + details.remedy của lỗi Kernel; T022-EC-1…6
/**
 *   T022-EC-1  PERIOD_LOCKED qua REST thật: context đủ (period, branchCode, docType, postingDate, docKey, step), scope, remedy
 *   T022-EC-2  UNBALANCED_ENTRY: context + debit / credit / difference + remedy (đường Errors + withErrorContext, qua bộ xử lý lỗi thật)
 *   T022-EC-3  lỗi từ trigger CSDL (không cân, chỉ thêm, khoá kỳ, CHECK) mang step = db-trigger + remedy
 *   T022-EC-4  withErrorContext chỉ bổ sung khoá thiếu: không ghi đè, không đổi code / message; lỗi lạ, mã ngoài danh sách, details dạng mảng đi nguyên vẹn
 *   T022-EC-5  remedy khớp ERROR_REMEDY (reason thắng code) và mọi bước dẫn tới màn có thật
 *   T022-EC-6  khuôn cũ còn nguyên: UNBALANCED vẫn có debit / credit; PERIOD_LOCKED giữ HTTP 409, UNBALANCED 422
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import Fastify from 'fastify';
import { ERROR_CODES, ERROR_CONTEXT_KEYS, ERROR_REMEDY, ERROR_STEPS, SCREENS } from '@ketoan/contracts';
import { db } from '../src/db/client.js';
import { AppError, Errors, withErrorContext } from '../src/core/errors.js';
import { registerErrorHandler } from '../src/core/http.js';
import { call, saleDoc, setupTenant, type TestCtx } from './helpers.js';

let ctx: TestCtx;
let tenantId = '';
type Body = { code: string; message: string; details?: { reason?: string; context?: Record<string, unknown>; remedy?: { steps: unknown[]; owner: string; verify: unknown; stopTheLine?: boolean }; scope?: string; debit?: number; credit?: number; difference?: number } };

async function viaHandler(err: Error): Promise<{ status: number; error: Body }> {
  const app = Fastify();
  registerErrorHandler(app);
  app.get('/loi', async () => { throw err; });
  const res = await app.inject({ method: 'GET', url: '/loi' });
  await app.close();
  return { status: res.statusCode, error: res.json().error as Body };
}
async function dbError(run: () => Promise<unknown>): Promise<Error & { code?: string }> {
  try { await run(); } catch (e) { return e as Error & { code?: string }; }
  throw new Error('thao tác lẽ ra bị CSDL từ chối nhưng đã chạy được');
}
let k = 0;
const sale = (docDate: string) => { k += 1; return saleDoc({ docKey: `ec:CN01:${k}`, docNo: `EC${k}`, docDate }); };

beforeAll(async () => {
  ctx = await setupTenant();
  tenantId = (await db.selectFrom('tenants').select('id').where('code', '=', ctx.tenantCode).executeTakeFirstOrThrow()).id;
});
afterAll(async () => {
  await ctx.app.close();
});

describe('T022-EC — ngữ cảnh và phương án khắc phục của lỗi Kernel', () => {
  it('T022-EC-1 PERIOD_LOCKED qua REST (phiếu kế toán → eventStore → sổ cái): context, scope (doc-type / period), remedy', async () => {
    const voucher = (docDate: string) => ({ docType: 'manual', branchCode: 'CN01', docDate, description: 'Thu khác', lines: [{ debitAccount: '1111', creditAccount: '7118', amount: 1000 }] });
    // Khoá theo loại chứng từ của một chi nhánh (03/2027): scope doc-type
    expect((await call(ctx, 'PUT', '/api/v1/periods/locks', { year: 2027, month: 3, changes: [{ branchCode: 'CN01', docType: 'manual', locked: true }] })).status).toBe(200);
    const byType = await call(ctx, 'POST', '/api/v1/vouchers', voucher('2027-03-10'));
    expect(byType.status, JSON.stringify(byType.body)).toBe(409);
    const e1 = byType.body.error as Body;
    expect(e1.code).toBe(ERROR_CODES.PERIOD_LOCKED);
    expect(e1.details?.context).toMatchObject({ period: '2027-03', branchCode: 'CN01', docType: 'manual', postingDate: '2027-03-10', step: 'period-check' });
    expect(String(e1.details?.context?.eventId)).toMatch(/^[0-9]+$/);
    expect(e1.details?.scope).toBe('doc-type');
    expect(e1.details?.remedy).toEqual(JSON.parse(JSON.stringify(ERROR_REMEDY.PERIOD_LOCKED)));
    // Khoá cả kỳ (04/2027): scope period
    expect((await call(ctx, 'POST', '/api/v1/periods/locks', { year: 2027, month: 4 })).status).toBe(200);
    const whole = await call(ctx, 'POST', '/api/v1/vouchers', voucher('2027-04-12'));
    expect(whole.status, JSON.stringify(whole.body)).toBe(409);
    expect((whole.body.error as Body).details).toMatchObject({ scope: 'period', context: { period: '2027-04', step: 'period-check' } });
  });

  it('T022-EC-2 UNBALANCED_ENTRY: context + debit / credit / difference + remedy, HTTP 422', async () => {
    const err = withErrorContext(Errors.unbalanced(undefined, { debit: 100, credit: 90.5 }), { docKey: 'ec:CN01:X', docType: 'sale', docNo: 'X', eventId: '77', postingDate: '2026-10-01', step: 'ledger-validate' });
    const r = await viaHandler(err);
    expect([r.status, r.error.code]).toEqual([422, ERROR_CODES.UNBALANCED]);
    expect(r.error.details).toMatchObject({ debit: 100, credit: 90.5, difference: 9.5, context: { docKey: 'ec:CN01:X', docType: 'sale', docNo: 'X', eventId: '77', postingDate: '2026-10-01', step: 'ledger-validate' } });
    expect(r.error.details?.remedy?.stopTheLine).toBe(true);
  });

  it('T022-EC-3 lỗi từ trigger CSDL mang step = db-trigger và remedy', async () => {
    const line = await db.selectFrom('ledger_lines').selectAll().where('tenant_id', '=', tenantId).limit(1).executeTakeFirst();
    expect((await call(ctx, 'POST', '/api/v1/documents', sale('2026-10-05'))).status).toBe(200);
    const l = await db.selectFrom('ledger_lines').selectAll().where('tenant_id', '=', tenantId).where('debit', '>', '0').executeTakeFirstOrThrow();
    void line;
    const unbalanced = await dbError(() => db.insertInto('ledger_lines').values({ ...l, id: undefined as never, line_no: 98, debit: 1, credit: 0, dims: JSON.stringify(l.dims) }).execute());
    const a = await viaHandler(unbalanced);
    expect(a.error.code).toBe(ERROR_CODES.UNBALANCED);
    expect(a.error.details).toMatchObject({ context: { step: 'db-trigger' } });
    expect(a.error.details?.remedy?.owner).toBe('core_team');
    const appendOnly = await dbError(() => db.updateTable('ledger_lines').set({ description: 'sửa lén' }).where('id', '=', l.id).execute());
    const b = await viaHandler(appendOnly);
    expect(b.error.code).toBe(ERROR_CODES.CONFLICT);
    expect(b.error.details).toMatchObject({ reason: 'LEDGER_APPEND_ONLY', context: { step: 'db-trigger' } });
    expect(b.error.details?.remedy).toEqual(JSON.parse(JSON.stringify(ERROR_REMEDY.LEDGER_APPEND_ONLY)));
    const check = Object.assign(new Error('vi phạm ràng buộc kiểm tra'), { code: '23514' });
    const c = await viaHandler(check);
    expect(c.error.code).toBe(ERROR_CODES.POSTING_FAILED);
    expect(c.error.details).toMatchObject({ context: { step: 'db-trigger' } });
    expect(c.error.details?.remedy).toBeDefined();
  });

  it('T022-EC-4 withErrorContext chỉ bổ sung khoá thiếu; lỗi lạ, mã ngoài danh sách, details dạng mảng đi nguyên vẹn', () => {
    const base = Errors.periodLocked(undefined, { scope: 'branch' });
    const first = withErrorContext(base, { period: '2026-10', docKey: 'a:b:1' });
    const second = withErrorContext(first, { period: '2099-01', docKey: 'zzz', branchCode: 'CN09', step: 'period-check' });
    expect(second).toBeInstanceOf(AppError);
    expect((second as AppError).code).toBe(ERROR_CODES.PERIOD_LOCKED);
    expect((second as AppError).message).toBe(base.message);
    expect((second as AppError).details).toMatchObject({ scope: 'branch', context: { period: '2026-10', docKey: 'a:b:1', branchCode: 'CN09', step: 'period-check' } });
    const plain = new Error('lỗi lạ');
    expect(withErrorContext(plain, { docKey: 'x' })).toBe(plain);
    const forbidden = Errors.forbidden('không quyền');
    expect(withErrorContext(forbidden, { docKey: 'x' })).toBe(forbidden);
    const listed = Errors.posting('Bút toán không hợp lệ', ['Tài khoản 111 đã ngừng sử dụng']);
    expect(withErrorContext(listed, { docKey: 'x' })).toBe(listed);
    expect((listed as AppError).details).toEqual(['Tài khoản 111 đã ngừng sử dụng']);
    const unknownKey = withErrorContext(Errors.posting('x'), { docKey: 'k', ...({ secret: 'a' } as object) });
    expect(Object.keys(((unknownKey as AppError).details as { context: object }).context)).toEqual(['docKey']);
  });

  it('T022-EC-5 remedy khớp ERROR_REMEDY; reason thắng code; mọi bước dẫn tới màn có thật', async () => {
    expect(ERROR_STEPS).toContain('db-trigger');
    expect(ERROR_CONTEXT_KEYS).toHaveLength(10);
    const screens = new Set<string>(Object.values(SCREENS).map((s) => s.path));
    for (const [key, remedy] of Object.entries(ERROR_REMEDY)) {
      expect(remedy!.steps.length, key).toBeGreaterThan(0);
      for (const s of remedy!.steps) if (s.screen) expect(screens.has(s.screen.path), `${key}: ${s.screen.path}`).toBe(true);
    }
    const conflict = await viaHandler(Object.assign(new Error('Sổ cái chỉ được thêm'), { code: '42501' }));
    expect(conflict.error.details?.reason).toBe('LEDGER_APPEND_ONLY');
    expect(conflict.error.details?.remedy).toEqual(JSON.parse(JSON.stringify(ERROR_REMEDY.LEDGER_APPEND_ONLY)));
  });

  it('T022-EC-6 khuôn cũ còn nguyên: debit / credit, HTTP 422 / 409', async () => {
    const r = await viaHandler(Errors.unbalanced(undefined, { debit: 10, credit: 8 }));
    expect([r.status, r.error.details?.debit, r.error.details?.credit]).toEqual([422, 10, 8]);
    const p = await viaHandler(Errors.periodLocked());
    expect([p.status, p.error.code]).toEqual([409, ERROR_CODES.PERIOD_LOCKED]);
    expect(p.error.details?.remedy).toBeDefined();
  });
});
