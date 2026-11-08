// [2026-11-08 02:05 PM Johnny Chu - Chu Hoàng Anh] PHASE-029 — S029-33: golden ánh xạ lỗi trigger sổ cái đúng BIZCITY-ERRORS-v1 §5 (1.3.0-draft), dùng lỗi THẬT của PostgreSQL
/**
 * T029-ERR-1…5 — lỗi do trigger sổ cái ném ra (cân, khoá kỳ, chỉ thêm) ra đúng mã hợp đồng, không bị gộp thành POSTING_FAILED.
 * Khác observability.test.ts (dùng lỗi giả `P0001`): ở đây lỗi sinh ra từ chính trigger trên CSDL thật, nên SQLSTATE (23514 / 42501) và câu chữ
 * là cái trigger thật ném. Đổi câu của trigger mà không đổi bảng §5 thì test này đỏ.
 *   T029-ERR-1  bút toán không cân (23514)          → UNBALANCED_ENTRY, 422
 *   T029-ERR-2  sửa dòng sổ đã ghi (42501)          → CONFLICT, 409, details.reason LEDGER_APPEND_ONLY
 *   T029-ERR-3  chèn vào kỳ đã khoá (23514)         → PERIOD_LOCKED, 409
 *   T029-ERR-4  CHECK / quyền khác (23514 / 42501)  → vẫn POSTING_FAILED, 422
 *   T029-ERR-5  errorCodeOf (trace) cho cùng mã với bộ xử lý lỗi HTTP
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import Fastify from 'fastify';
import { sql } from 'kysely';
import { ERROR_CODES } from '@ketoan/contracts';
import { db } from '../src/db/client.js';
import { errorCodeOf } from '../src/core/errors.js';
import { registerErrorHandler } from '../src/core/http.js';
import { saleDoc, setupTenant, type TestCtx } from './helpers.js';

let ctx: TestCtx;
let tenantId = '';
let entry: Record<string, unknown>;
const ROLLBACK = new Error('lùi giao dịch thử');

/** Chạy một thao tác dự kiến thất bại ở CSDL và trả đúng lỗi pg đã ném. */
async function dbError(run: () => Promise<unknown>): Promise<Error & { code?: string }> {
  try { await run(); } catch (e) { return e as Error & { code?: string }; }
  throw new Error('thao tác lẽ ra bị CSDL từ chối nhưng đã chạy được');
}

/** Cho lỗi đi qua bộ xử lý lỗi HTTP thật của Platform rồi trả phản hồi. */
async function viaHandler(err: Error) {
  const app = Fastify();
  registerErrorHandler(app);
  app.get('/loi', async () => { throw err; });
  const res = await app.inject({ method: 'GET', url: '/loi' });
  await app.close();
  return { status: res.statusCode, error: res.json().error as { code: string; message: string; details?: { reason?: string } } };
}

beforeAll(async () => {
  ctx = await setupTenant();
  tenantId = (await db.selectFrom('tenants').select('id').where('code', '=', ctx.tenantCode).executeTakeFirstOrThrow()).id;
  const posted = await ctx.app.inject({ method: 'POST', url: '/api/v1/documents', payload: saleDoc({ docKey: 'pos:CN01:ERR1', docNo: 'ERR1' }) as never, headers: { 'x-api-key': ctx.apiKey } });
  expect(posted.json().data.status).toBe('posted');
  entry = await db.selectFrom('ledger_entries').selectAll().where('tenant_id', '=', tenantId).executeTakeFirstOrThrow() as never;
});
afterAll(async () => {
  await ctx.app.close();
});

describe('T029-ERR — lỗi trigger sổ cái ra đúng mã hợp đồng (ERRORS §5)', () => {
  it('T029-ERR-1 bút toán không cân (23514) → UNBALANCED_ENTRY 422', async () => {
    const line = await db.selectFrom('ledger_lines').selectAll().where('tenant_id', '=', tenantId).where('debit', '>', '0').executeTakeFirstOrThrow();
    const err = await dbError(() => db.insertInto('ledger_lines').values({ ...line, id: undefined as never, line_no: 98, debit: 1, credit: 0, dims: JSON.stringify(line.dims) }).execute());
    expect(err.code).toBe('23514');
    const r = await viaHandler(err);
    expect([r.status, r.error.code]).toEqual([422, ERROR_CODES.UNBALANCED]);
    expect(r.error.message).toMatch(/không cân/);
    expect(errorCodeOf(err)).toBe(ERROR_CODES.UNBALANCED);
  });

  it('T029-ERR-2 sửa dòng sổ đã ghi (42501) → CONFLICT 409 + LEDGER_APPEND_ONLY', async () => {
    const err = await dbError(() => sql`UPDATE ledger_lines SET description = 'sửa lén' WHERE tenant_id = ${tenantId}`.execute(db));
    expect(err.code).toBe('42501');
    const r = await viaHandler(err);
    expect([r.status, r.error.code, r.error.details?.reason]).toEqual([409, ERROR_CODES.CONFLICT, 'LEDGER_APPEND_ONLY']);
    expect(r.error.message).toMatch(/chỉ được thêm/);
    expect(errorCodeOf(err)).toBe(ERROR_CODES.CONFLICT);
  });

  it('T029-ERR-3 chèn vào kỳ đã khoá (23514) → PERIOD_LOCKED 409', async () => {
    const lockId = (await sql<{ id: string }>`INSERT INTO period_locks (tenant_id, period_id, branch_id, doc_type, locked_by) VALUES (${tenantId}, ${entry.period_id as string}, NULL, '*', 'test') RETURNING id`.execute(db)).rows[0]!.id;
    try {
      const err = await dbError(() => db.transaction().execute(async (trx) => {
        await trx.insertInto('ledger_entries').values({ ...entry, id: undefined as never, entry_no: 'ERR-KK-1', created_at: undefined as never } as never).execute();
        throw ROLLBACK;
      }));
      expect(err.code).toBe('23514');
      expect(err.message).toMatch(/^PERIOD_LOCKED:/);
      const r = await viaHandler(err);
      expect([r.status, r.error.code]).toEqual([409, ERROR_CODES.PERIOD_LOCKED]);
      expect(errorCodeOf(err)).toBe(ERROR_CODES.PERIOD_LOCKED);
    } finally {
      await sql`DELETE FROM period_locks WHERE id = ${lockId}`.execute(db);
    }
  });

  it('T029-ERR-4 CHECK / quyền khác (23514 / 42501) vẫn là POSTING_FAILED 422', async () => {
    for (const code of ['23514', '42501']) {
      const err = Object.assign(new Error('new row violates check constraint "x_check"'), { code });
      const r = await viaHandler(err);
      expect([r.status, r.error.code, r.error.details?.reason]).toEqual([422, ERROR_CODES.POSTING_FAILED, undefined]);
      expect(errorCodeOf(err)).toBe(ERROR_CODES.POSTING_FAILED);
    }
  });

  it('T029-ERR-5 P0001 + "không cân" vẫn UNBALANCED_ENTRY; P0001 khác vẫn CONFLICT (dòng cũ của §5 giữ nguyên)', async () => {
    const a = Object.assign(new Error('Bút toán 12 không cân: Nợ 100 ≠ Có 90'), { code: 'P0001' });
    expect([(await viaHandler(a)).error.code, errorCodeOf(a)]).toEqual([ERROR_CODES.UNBALANCED, ERROR_CODES.UNBALANCED]);
    const b = Object.assign(new Error('Sự kiện miền không sửa được'), { code: 'P0001' });
    const rb = await viaHandler(b);
    expect([rb.status, rb.error.code, rb.error.details?.reason, errorCodeOf(b)]).toEqual([409, ERROR_CODES.CONFLICT, 'LEDGER_APPEND_ONLY', ERROR_CODES.CONFLICT]);
  });
});
