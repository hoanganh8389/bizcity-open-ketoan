// [2026-11-09 10:20 PM Johnny Chu - Chu Hoàng Anh] PHASE-004 — S004-17 (D004-15, Q004-4): E1 qua hàm SECURITY DEFINER; T004-E1-1…6
/**
 * Điền giá vốn (E1) chỉ đi qua hàm ledger_fill_cost_lines / ledger_fill_entry_totals (chủ ketoan_ledger_cost, migration 0091).
 * Mọi ca chạy dưới `SET LOCAL ROLE ketoan_app` trong giao dịch rồi ROLLBACK.
 *   T004-E1-1  cờ phiên cũ vô tác dụng: UPDATE thẳng số tiền dòng / total bút toán bị từ chối vì quyền cột
 *   T004-E1-2  qua hàm: dòng giá vốn chờ đổi được, total cộng delta, mỗi hàm ghi audit_logs 'ledger.cost_fill'
 *   T004-E1-3  hàm từ chối dòng không phải giá vốn chờ, số âm, mảng lệch độ dài, id trùng, total xuống âm
 *   T004-E1-4  ketoan_app không đổi vai sang chủ hàm, không thay / sửa hàm; vẫn UPDATE được cột đầu (E2)
 *   T004-E1-5  đặt cờ cũ rồi UPDATE: vẫn bị từ chối; qua hàm: được
 *   T004-E1-6  điền xong vẫn cân Nợ = Có theo bút toán
 *   T004-E1-7  đường thật của mã: ledgerService.overwriteCostPairs gọi hai hàm, số tiền, tổng bút toán và số dư theo ngày cùng đổi
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { PoolClient } from 'pg';
import { db, pool } from '../src/db/client.js';
import { ledgerService } from '@bizcity/kernel/modules/ledger/ledger.service';
import { postingConfigRepository } from '@bizcity/kernel/modules/posting-config/posting-config.repository';
import { call, setupTenant, type TestCtx } from './helpers.js';

let ctx: TestCtx;
let tenantId = '';
let costLineIds: string[] = [];
let costEntryId = '';
let plainLineId = '';

const post = (doc: unknown) => call(ctx, 'POST', '/api/v1/documents', doc);
const purchase = {
  docType: 'purchase', docKey: 'E1-PUR', branchCode: 'CN01', docNo: 'E1-PUR', docDate: '2026-10-02',
  partner: { code: 'NCC-01', name: 'Nhà cung cấp 01' },
  lines: [{ lineKey: 'l1', sku: 'SUA01', name: 'Sữa bột 900g', unit: 'Hộp', qty: 10, amountBeforeTax: 700000, taxCode: 'V08', taxAmount: 0 }],
  totals: { beforeTax: 700000, tax: 0, total: 700000 },
};
const sale = {
  docType: 'sale', docKey: 'E1-SALE', branchCode: 'CN01', docNo: 'E1-SALE', docDate: '2026-10-04',
  lines: [{ lineKey: 'l1', sku: 'SUA01', name: 'Sữa bột 900g', unit: 'Hộp', qty: 2, amountBeforeTax: 200000, taxCode: 'R08', taxAmount: 16000 }],
  payments: [{ methodCode: 'TM', amount: 216000 }],
  totals: { beforeTax: 200000, tax: 16000, total: 216000 },
};

/** Chạy `fn` dưới vai ketoan_app trong giao dịch rồi ROLLBACK; trả kết quả hoặc lỗi. */
async function asApp<T>(fn: (c: PoolClient) => Promise<T>): Promise<{ value?: T; error?: Error }> {
  const c = await pool.connect();
  try {
    await c.query('BEGIN');
    await c.query('SET LOCAL ROLE ketoan_app');
    return { value: await fn(c) };
  } catch (e) {
    return { error: e as Error };
  } finally {
    await c.query('ROLLBACK').catch(() => undefined);
    c.release();
  }
}
const costAudit = async (c: PoolClient) =>
  (await c.query<{ object_type: string; actor_via: string; before_data: Record<string, unknown>; after_data: Record<string, unknown> }>(
    `SELECT object_type, actor_via, before_data, after_data FROM audit_logs WHERE tenant_id = $1 AND action = 'ledger.cost_fill' ORDER BY id`, [tenantId])).rows;
const fillLines = (c: PoolClient, ids: unknown[], debits: number[], credits: number[]) =>
  c.query(`SELECT ledger_fill_cost_lines($1::bigint[], $2::numeric[], $3::numeric[]) AS n`, [ids, debits, credits]);

beforeAll(async () => {
  ctx = await setupTenant();
  tenantId = (await db.selectFrom('tenants').select('id').where('code', '=', ctx.tenantCode).executeTakeFirstOrThrow()).id;
  expect((await post(purchase)).status).toBe(200);
  expect((await post(sale)).status).toBe(200);
  // Không còn quy tắc định khoản nào sinh cặp giá vốn chờ (chỉ dữ liệu cũ có): dựng một cặp 0 / 0 mang cost_fill trên bút toán của phiếu bán (INSERT được phép)
  const base = await db.selectFrom('ledger_lines').selectAll().where('tenant_id', '=', tenantId).orderBy('id').executeTakeFirstOrThrow();
  costEntryId = String(base.entry_id);
  for (const [lineNo, side] of [[90, 'debit'], [91, 'credit']] as const) {
    await db.insertInto('ledger_lines')
      .values({ ...base, id: undefined as never, line_no: lineNo, pair_no: 90, part: base.part, debit: 0, credit: 0, product_sku: 'SUA01', cost_fill: side, dims: JSON.stringify(base.dims) })
      .execute();
  }
  costLineIds = (await pool.query<{ id: string }>(`SELECT id::text FROM ledger_lines WHERE entry_id = $1 AND cost_fill IS NOT NULL ORDER BY cost_fill DESC`, [costEntryId])).rows.map((r) => r.id);
  expect(costLineIds).toHaveLength(2);
  plainLineId = (await pool.query<{ id: string }>(`SELECT id::text FROM ledger_lines WHERE tenant_id = $1 AND cost_fill IS NULL LIMIT 1`, [tenantId])).rows[0]!.id;
});
afterAll(async () => {
  await ctx.app.close();
});

describe('T004-E1 — điền giá vốn qua hàm SECURITY DEFINER', () => {
  it('T004-E1-1 cờ phiên cũ vô tác dụng: UPDATE thẳng số tiền bị từ chối vì quyền', async () => {
    const line = await asApp(async (c) => {
      await c.query(`SELECT set_config('ketoan.cost_overwrite', 'on', true)`);
      await c.query(`UPDATE ledger_lines SET debit = 1, credit = 0 WHERE id = $1`, [costLineIds[0]]);
    });
    expect(line.error?.message).toMatch(/permission denied|không có quyền/i);
    const entry = await asApp(async (c) => {
      await c.query(`SELECT set_config('ketoan.cost_overwrite', 'on', true)`);
      await c.query(`UPDATE ledger_entries SET total = total + 1 WHERE id = $1`, [costEntryId]);
    });
    expect(entry.error?.message).toMatch(/permission denied|không có quyền/i);
  });

  it('T004-E1-2 qua hàm: đổi được dòng giá vốn chờ và total; mỗi hàm ghi audit_logs ledger.cost_fill', async () => {
    const r = await asApp(async (c) => {
      const n1 = Number((await fillLines(c, costLineIds, [12345, 0], [0, 12345])).rows[0]!.n);
      const entryBefore = Number((await c.query<{ total: string }>(`SELECT total FROM ledger_entries WHERE id = $1`, [costEntryId])).rows[0]!.total);
      const n2 = Number((await c.query<{ n: number }>(`SELECT ledger_fill_entry_totals($1::bigint[], $2::numeric[]) AS n`, [[costEntryId], [12345]])).rows[0]!.n);
      const after = (await c.query<{ debit: string; credit: string }>(`SELECT debit, credit FROM ledger_lines WHERE id = ANY($1::bigint[])`, [costLineIds])).rows;
      const entryAfter = Number((await c.query<{ total: string }>(`SELECT total FROM ledger_entries WHERE id = $1`, [costEntryId])).rows[0]!.total);
      return { after, n1, n2, entryBefore, entryAfter, audit: await costAudit(c) };
    });
    expect(r.error?.message).toBeUndefined();
    const v = r.value!;
    expect(v.n1).toBe(2);
    expect(v.n2).toBe(1);
    expect(v.entryAfter - v.entryBefore).toBe(12345);
    expect(v.after.reduce((s, x) => s + Number(x.debit), 0)).toBe(12345);
    expect(v.after.reduce((s, x) => s + Number(x.credit), 0)).toBe(12345);
    expect(v.audit).toHaveLength(2);
    expect(v.audit.map((a) => a.object_type)).toEqual(['ledger_lines', 'ledger_entries']);
    expect(v.audit.every((a) => a.actor_via === 'db-function')).toBe(true);
    expect(v.audit[0]!.after_data).toMatchObject({ lines: 2, debit: 12345, credit: 12345, _function: 'ledger_fill_cost_lines' });
    expect(v.audit[1]!.after_data).toMatchObject({ entries: 1, _function: 'ledger_fill_entry_totals' });
  });

  it('T004-E1-3 hàm từ chối dòng không phải giá vốn chờ, số âm, mảng lệch độ dài, id trùng, total xuống âm', async () => {
    const notSlot = await asApp((c) => fillLines(c, [plainLineId], [1], [0]));
    expect(notSlot.error?.message).toMatch(/dòng giá vốn chờ/);
    const negative = await asApp((c) => fillLines(c, costLineIds, [-1, 0], [0, -1]));
    expect(negative.error?.message).toMatch(/âm|rỗng/);
    const lengths = await asApp((c) => fillLines(c, costLineIds, [1], [1, 1]));
    expect(lengths.error?.message).toMatch(/cùng độ dài/);
    const dup = await asApp((c) => fillLines(c, [costLineIds[0], costLineIds[0]], [1, 1], [0, 0]));
    expect(dup.error?.message).toMatch(/trùng/);
    const underflow = await asApp((c) => c.query(`SELECT ledger_fill_entry_totals($1::bigint[], $2::numeric[])`, [[costEntryId], [-999999999]]));
    expect(underflow.error?.message).toMatch(/không để âm|hiệu lực/);
  });

  it('T004-E1-4 ketoan_app không đổi vai sang chủ hàm, không thay / sửa hàm; vẫn đổi được cột đầu', async () => {
    // SET ROLE kiểm theo vai ĐĂNG NHẬP (ở đây là superuser của test), nên kiểm tư cách thành viên: ketoan_app không thể đổi vai sang chủ hàm khi nó là vai đăng nhập
    const member = await pool.query<{ m: boolean; u: boolean }>(`SELECT pg_has_role('ketoan_app', 'ketoan_ledger_cost', 'MEMBER') AS m, pg_has_role('ketoan_app', 'ketoan_ledger_cost', 'USAGE') AS u`);
    expect(member.rows[0]).toEqual({ m: false, u: false });
    const replace = await asApp((c) => c.query(`CREATE OR REPLACE FUNCTION ledger_fill_cost_lines(bigint[], numeric[], numeric[]) RETURNS integer LANGUAGE sql AS 'SELECT 0'`));
    expect(replace.error?.message).toMatch(/must be owner|phải là chủ|permission denied/i);
    const alter = await asApp((c) => c.query(`ALTER FUNCTION ledger_fill_cost_lines(bigint[], numeric[], numeric[]) SECURITY INVOKER`));
    expect(alter.error?.message).toMatch(/must be owner|phải là chủ|permission denied/i);
    const e2 = await asApp(async (c) => (await c.query(`UPDATE ledger_entries SET description = 'E2 vẫn chạy' WHERE id = $1`, [costEntryId])).rowCount);
    expect(e2.error?.message).toBeUndefined();
    expect(e2.value).toBe(1);
  });

  it('T004-E1-5 đặt cờ cũ rồi UPDATE vẫn bị từ chối; qua hàm thì được', async () => {
    const viaFlag = await asApp(async (c) => {
      await c.query(`SELECT set_config('ketoan.cost_overwrite', 'on', true)`);
      return c.query(`UPDATE ledger_lines SET debit = debit WHERE id = $1`, [costLineIds[0]]);
    });
    expect(viaFlag.error?.message).toMatch(/permission denied|không có quyền/i);
    const viaFn = await asApp((c) => fillLines(c, costLineIds, [1, 0], [0, 1]));
    expect(viaFn.error?.message).toBeUndefined();
  });

  it('T004-E1-6 điền xong vẫn cân Nợ = Có theo bút toán', async () => {
    const r = await asApp(async (c) => {
      await fillLines(c, costLineIds, [777, 0], [0, 777]);
      return (await c.query<{ d: string; c: string }>(`SELECT sum(debit) d, sum(credit) c FROM ledger_lines WHERE entry_id = $1`, [costEntryId])).rows[0]!;
    });
    expect(r.error?.message).toBeUndefined();
    expect(Number(r.value!.d)).toBe(Number(r.value!.c));
  });

  it('T004-E1-7 đường thật của mã: overwriteCostPairs qua hai hàm, số tiền, tổng bút toán và số dư theo ngày cùng đổi', async () => {
    const STOP = new Error('lùi giao dịch thử');
    let out: { changed: number; entryDelta: number; pair: number[] } | undefined;
    await db.transaction().execute(async (trx) => {
      const cfg = await postingConfigRepository.loadPostingConfig(trx, tenantId, [], {});
      const before = Number((await pool.query<{ total: string }>(`SELECT total FROM ledger_entries WHERE id = $1`, [costEntryId])).rows[0]!.total);
      const changed = await ledgerService.overwriteCostPairs(trx, tenantId, [{ entryId: costEntryId, pairNo: 90, amount: 5000 }], cfg.accounts);
      const { sql } = await import('kysely');
      const after = Number((await sql<{ total: string }>`SELECT total FROM ledger_entries WHERE id = ${costEntryId}`.execute(trx)).rows[0]!.total);
      const pair = (await sql<{ debit: string; credit: string }>`SELECT debit, credit FROM ledger_lines WHERE entry_id = ${costEntryId} AND pair_no = 90 ORDER BY cost_fill DESC`.execute(trx)).rows;
      out = { changed, entryDelta: after - before, pair: pair.flatMap((r) => [Number(r.debit), Number(r.credit)]) };
      throw STOP;
    }).catch((e) => { if (e !== STOP) throw e; });
    expect(out).toEqual({ changed: 1, entryDelta: 5000, pair: [5000, 0, 0, 5000] });
  });
});
