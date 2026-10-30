/**
 * Cô lập đơn vị (PHASE-007, PHASES 2.4, G1-05, G3-06; STD-DATA-1, migration 0041): thử tấn công chéo đơn vị.
 *   - API / MCP: người của đơn vị A không đọc, không đề xuất huỷ được chứng từ của đơn vị B.
 *   - CSDL (RLS): một truy vấn "quên" lọc tenant_id trong yêu cầu của A không thấy, không ghi được dòng của B; việc nền (chưa gắn
 *     đơn vị) vẫn thấy đủ. Kiểm dưới vai trò ketoan_app (superuser luôn vượt RLS — không dùng để kiểm).
 *   - Pool của API (db/client.ts) gắn đơn vị theo yêu cầu: chỉ có hiệu lực khi kết nối không phải superuser (DB_SET_ROLE / DB_APP_USER).
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { sql } from 'kysely';
import { db } from '../src/db/client.js';
import { env } from '../src/config/env.js';
import { withRequestContext } from '../src/core/request-context.js';
import { call, saleDoc, setupTenant, type TestCtx } from './helpers.js';

let a: TestCtx, b: TestCtx;
let tenantA = '', tenantB = '';
const docB = saleDoc({ docKey: 'pos:CN01:HD-B-1', docNo: 'HD-B-1' });
const idOf = (code: string) => db.selectFrom('tenants').select('id').where('code', '=', code).executeTakeFirstOrThrow().then((r) => r.id);

/** Chạy fn trong giao dịch dưới vai trò ketoan_app, kết nối gắn đơn vị `tenant` ('' = chưa gắn); giao dịch luôn huỷ. */
async function asApp<T>(tenant: string, fn: (trx: typeof db) => Promise<T>): Promise<T> {
  let out!: T;
  await db.transaction().execute(async (trx) => {
    await sql`SET LOCAL ROLE ketoan_app`.execute(trx);
    await sql`SELECT set_config('bizcity.tenant_id', ${tenant}, true)`.execute(trx);
    out = await fn(trx as unknown as typeof db);
    throw new RollbackSignal();
  }).catch((e) => { if (!(e instanceof RollbackSignal)) throw e; });
  return out;
}
class RollbackSignal extends Error {}

beforeAll(async () => {
  a = await setupTenant();
  b = await setupTenant();
  tenantA = await idOf(a.tenantCode);
  tenantB = await idOf(b.tenantCode);
  expect((await call(b, 'POST', '/api/v1/documents', docB)).body.data.status).toBe('posted');
});
afterAll(async () => {
  await a.app.close();
  await b.app.close();
});

describe('Cô lập đơn vị', () => {
  it('API: A không xem được chứng từ của B theo id; danh sách của A không có chứng từ của B', async () => {
    const idB = (await db.selectFrom('accounting_events').select('id').where('tenant_id', '=', tenantB).where('doc_key', '=', docB.docKey).executeTakeFirstOrThrow()).id;
    expect((await call(a, 'GET', `/api/v1/documents/${idB}`)).status).toBe(404);
    const list = await call(a, 'GET', `/api/v1/documents?search=${encodeURIComponent(docB.docNo)}`);
    expect(list.body.data ?? []).toEqual([]);
  });

  it('MCP: A không đề xuất huỷ được chứng từ của B', async () => {
    const res = await a.app.inject({
      method: 'POST', url: '/mcp', headers: { authorization: `Bearer ${a.token}` },
      payload: { jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'accounting.entry.reverse', arguments: { docKey: docB.docKey, reason: 'Thử tấn công chéo đơn vị' } } } as never,
    });
    expect(res.json().result.structuredContent.code).toBe('NOT_FOUND');
    expect((await db.selectFrom('accounting_events').select('cancel_requested_at').where('tenant_id', '=', tenantB).where('doc_key', '=', docB.docKey).executeTakeFirstOrThrow()).cancel_requested_at).toBeNull();
  });

  it('RLS: truy vấn quên lọc tenant_id trong yêu cầu của A không thấy dòng của B (sổ, chứng từ, bằng chứng, đối tượng)', async () => {
    const seen = await asApp(tenantA, async (trx) => ({
      events: Number((await sql<{ n: string }>`SELECT count(*) AS n FROM accounting_events WHERE tenant_id = ${tenantB}`.execute(trx)).rows[0]!.n),
      entries: Number((await sql<{ n: string }>`SELECT count(*) AS n FROM ledger_entries WHERE tenant_id = ${tenantB}`.execute(trx)).rows[0]!.n),
      lines: Number((await sql<{ n: string }>`SELECT count(*) AS n FROM ledger_lines WHERE tenant_id = ${tenantB}`.execute(trx)).rows[0]!.n),
      audit: Number((await sql<{ n: string }>`SELECT count(*) AS n FROM audit_logs WHERE tenant_id = ${tenantB}`.execute(trx)).rows[0]!.n),
      own: Number((await sql<{ n: string }>`SELECT count(*) AS n FROM accounts WHERE tenant_id = ${tenantA}`.execute(trx)).rows[0]!.n),
    }));
    expect(seen).toMatchObject({ events: 0, entries: 0, lines: 0, audit: 0 });
    expect(seen.own).toBeGreaterThan(0);
  });

  it('RLS: A không ghi được dòng mang tenant_id của B (WITH CHECK), không sửa được dòng của B', async () => {
    await expect(asApp(tenantA, (trx) => sql`INSERT INTO partners (tenant_id, code, name) VALUES (${tenantB}, 'CHEO', 'Ghi chéo đơn vị')`.execute(trx)))
      .rejects.toThrow(/row-level security/);
    const updated = await asApp(tenantA, async (trx) => Number((await sql`UPDATE partners SET name = 'đổi trộm' WHERE tenant_id = ${tenantB}`.execute(trx)).numAffectedRows ?? 0n));
    expect(updated).toBe(0);
  });

  it('RLS: việc nền (kết nối chưa gắn đơn vị) vẫn thấy đủ — dispatcher, migration, đối soát chạy như cũ', async () => {
    const n = await asApp('', async (trx) => Number((await sql<{ n: string }>`SELECT count(*) AS n FROM accounting_events WHERE tenant_id IN (${tenantA}, ${tenantB})`.execute(trx)).rows[0]!.n));
    expect(n).toBeGreaterThan(0);
  });

  it.runIf(!!env.DB_SET_ROLE)('pool API gắn đơn vị theo yêu cầu: truy vấn quên lọc trong ngữ cảnh A không thấy dòng của B', async () => {
    const n = await withRequestContext({ requestId: 'req-rls-test', correlationId: 'req-rls-test', tenantId: tenantA },
      async () => (await db.selectFrom('accounting_events').select('id').where('tenant_id', '=', tenantB).execute()).length);
    expect(n).toBe(0);
  });
});
