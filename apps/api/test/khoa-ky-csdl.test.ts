// [2026-11-07 03:57 PM Johnny Chu - Chu Hoàng Anh] PHASE-029 — gói K3 đợt 1 (S029-17): T029-K3-3..5 — khoá kỳ ở CSDL (chữ chốt: docs/phases/PHASE-029-CHUAN-HOA-CHUNG-TU-GOC-TRUY-VET/35-GOI-K3.md)
/**
 *   T029-K3-3  chèn thẳng (bỏ qua ứng dụng) một bút toán vào kỳ đã khoá chung → CSDL từ chối, câu PERIOD_LOCKED nêu kỳ
 *   T029-K3-4  khoá riêng chi nhánh khác / loại chứng từ khác không chặn; khoá đúng loại chứng từ thì chặn (cùng điều kiện isLocked)
 *   T029-K3-5  mở khoá (xoá dòng khoá) → chèn được lại; ứng dụng vẫn trả PERIOD_LOCKED như trước khi gửi chứng từ vào kỳ khoá
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { sql } from 'kysely';
import { db } from '../src/db/client.js';
import { saleDoc, setupTenant, type TestCtx } from './helpers.js';

let ctx: TestCtx;
let tenantId = '';
let orig: Record<string, unknown>;
const send = (doc: unknown) => ctx.app.inject({ method: 'POST', url: '/api/v1/documents', payload: doc as never, headers: { 'x-api-key': ctx.apiKey } });
let n = 0;
/** Chèn thẳng một bản chép của bút toán thật rồi LÙI giao dịch: đo CSDL có chặn không, sổ không giữ lại dòng thử. */
const ROLLBACK = new Error('lùi giao dịch thử');
const insertCopy = () => db.transaction().execute(async (trx) => {
  await trx.insertInto('ledger_entries').values({ ...orig, id: undefined as never, entry_no: `K3-KK-${++n}`, created_at: undefined as never } as never).execute();
  throw ROLLBACK;
}).catch((e) => { if (e === ROLLBACK) return 'chèn được'; throw e; });
const lock = async (branchId: string | null, docType: string) =>
  (await sql<{ id: string }>`INSERT INTO period_locks (tenant_id, period_id, branch_id, doc_type, locked_by) VALUES (${tenantId}, ${orig.period_id as string}, ${branchId}::bigint, ${docType}, 'test') RETURNING id`.execute(db)).rows[0]!.id;
const unlock = (id: string) => sql`DELETE FROM period_locks WHERE id = ${id}`.execute(db);

beforeAll(async () => {
  ctx = await setupTenant();
  tenantId = (await db.selectFrom('tenants').select('id').where('code', '=', ctx.tenantCode).executeTakeFirstOrThrow()).id;
  expect((await send(saleDoc({ docKey: 'pos:CN01:KK1', docNo: 'KK1' }))).json().data.status).toBe('posted');
  orig = await db.selectFrom('ledger_entries').selectAll().where('tenant_id', '=', tenantId).executeTakeFirstOrThrow() as never;
});
afterAll(async () => {
  await ctx.app.close();
});

describe('T029-K3 — khoá kỳ ở CSDL', () => {
  it('T029-K3-3 chèn thẳng vào kỳ đã khoá chung → CSDL từ chối', async () => {
    const id = await lock(null, '*');
    const p = (await sql<{ y: number; m: number }>`SELECT year AS y, month AS m FROM fiscal_periods WHERE id = ${orig.period_id as string}`.execute(db)).rows[0]!;
    await expect(insertCopy()).rejects.toThrow(new RegExp(`PERIOD_LOCKED: kỳ ${String(p.m).padStart(2, '0')}/${p.y} đã khoá`));
    await unlock(id);
  });

  it('T029-K3-4 khoá chi nhánh khác / loại khác không chặn; đúng loại thì chặn', async () => {
    const otherBranch = (await sql<{ id: string }>`INSERT INTO branches (tenant_id, code, name) VALUES (${tenantId}, 'CN-K3', 'Chi nhánh khác') RETURNING id`.execute(db)).rows[0]!.id;
    const other = await lock(otherBranch, '*');
    expect(await insertCopy()).toBe('chèn được');
    await unlock(other);
    const otherType = await lock(null, 'khong-phai-loai-nay');
    expect(await insertCopy()).toBe('chèn được');
    await unlock(otherType);
    const sameType = await lock(null, orig.doc_type as string);
    await expect(insertCopy()).rejects.toThrow(/PERIOD_LOCKED/);
    await unlock(sameType);
    const sameBranch = await lock(orig.branch_id as string, '*');
    await expect(insertCopy()).rejects.toThrow(/PERIOD_LOCKED/);
    await unlock(sameBranch);
  });

  it('T029-K3-5 mở khoá thì chèn được; ứng dụng vẫn chặn PERIOD_LOCKED khi gửi chứng từ vào kỳ khoá', async () => {
    const id = await lock(null, '*');
    const r = await send(saleDoc({ docKey: 'pos:CN01:KK2', docNo: 'KK2' }));
    expect(r.json().data?.error?.code, r.body).toBe('PERIOD_LOCKED'); // chặn ở ứng dụng như cũ, trước khi tới trigger
    await unlock(id);
    expect(await insertCopy()).toBe('chèn được');
    expect((await send(saleDoc({ docKey: 'pos:CN01:KK3', docNo: 'KK3' }))).json().data.status).toBe('posted');
  });
});
