// [2026-11-14 03:31 PM Johnny Chu - Chu Hoàng Anh] PHASE-036 — S036-3 (B1): đơn vị trắng — tenantEmptiness() + core.setup.status (chữ chốt PHASE-036 · 00 §10)
/**
 * Đơn vị mới (chỉ có danh mục của seed()) → trắng. Mỗi loại chứng từ, kể cả nháp / bể chờ, làm đơn vị hết trắng.
 * Đơn vị khác không thấy. canSetup theo quyền settings:write. Dữ liệu trong test là giả lập.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { sql } from 'kysely';
import { db } from '../src/db/client.js';
import { EMPTINESS_PROBES, tenantEmptiness } from '../src/modules/system/setup-status.js';
import { call, saleDoc, setupTenant, type TestCtx } from './helpers.js';

const opened: TestCtx[] = [];
async function fresh(): Promise<{ ctx: TestCtx; id: string }> {
  const ctx = await setupTenant();
  opened.push(ctx);
  const id = (await db.selectFrom('tenants').select('id').where('code', '=', ctx.tenantCode).executeTakeFirstOrThrow()).id;
  return { ctx, id };
}
const status = async (c: TestCtx) => {
  const r = await call(c, 'GET', '/api/v1/setup/status');
  expect(r.status, JSON.stringify(r.body)).toBe(200);
  return r.body.data as { empty: boolean; kinds: string[]; canSetup: boolean };
};
async function viewerOf(c: TestCtx): Promise<TestCtx> {
  const email = `xem${Date.now()}@setup.local`;
  const r = await call(c, 'POST', '/api/v1/users', { email, fullName: 'Người xem', role: 'viewer', password: 'Pass@12345' });
  expect(r.status, JSON.stringify(r.body)).toBe(201);
  const login = await c.app.inject({ method: 'POST', url: '/api/v1/auth/login', payload: { tenantCode: c.tenantCode, email, password: 'Pass@12345' } });
  return { ...c, token: login.json().data.token };
}

afterAll(async () => { for (const c of opened) await c.app.close(); });

describe('Đơn vị trắng (core.setup.status)', () => {
  let a: { ctx: TestCtx; id: string };
  let b: { ctx: TestCtx; id: string };
  beforeAll(async () => { a = await fresh(); b = await fresh(); });

  it('đơn vị mới (chỉ danh mục của seed) → trắng; chủ đơn vị canSetup, người xem không', async () => {
    expect(await status(a.ctx)).toEqual({ empty: true, kinds: [], canSetup: true, runs: [] });
    const v = await viewerOf(a.ctx);
    expect(await status(v)).toEqual({ empty: true, kinds: [], canSetup: false, runs: [] });
  });

  it('nạp danh mục (Quay về dữ liệu gốc) vẫn trắng', async () => {
    const p = await call(a.ctx, 'POST', '/api/v1/default-data/cost_item/restore?dryRun=1', { confirm: true });
    const r = await call(a.ctx, 'POST', '/api/v1/default-data/cost_item/restore', { confirm: true, previewToken: p.body.meta.previewToken });
    expect(r.status, JSON.stringify(r.body)).toBe(200);
    expect((await status(a.ctx)).empty).toBe(true);
  });

  it('chứng từ qua cửa nạp → hết trắng (event + ledger); đơn vị khác vẫn trắng', async () => {
    const r = await call(a.ctx, 'POST', '/api/v1/documents', saleDoc());
    expect(r.status, JSON.stringify(r.body)).toBeLessThan(300);
    const s = await status(a.ctx);
    expect(s.empty).toBe(false);
    expect(s.kinds).toContain('event');
    expect((await status(b.ctx)).empty).toBe(true);
  });

  it('chứng từ nháp / bể chờ / phiếu mua nháp / đề nghị thanh toán nháp đều làm hết trắng', async () => {
    const cases: [string, (t: string) => Promise<unknown>][] = [
      ['event', async (t) => {
        const br = await db.selectFrom('branches').select('id').where('tenant_id', '=', t).executeTakeFirstOrThrow();
        return sql`INSERT INTO accounting_events (tenant_id, doc_key, doc_type, branch_id, doc_no, doc_date, payload, status, total, created_by)
          VALUES (${t}, 'gl-nhap-1', 'sale', ${br.id}, 'NHAP-1', '2026-10-12', '{}'::jsonb, 'cancelled', 1000, 'test')`.execute(db);
      }],
      ['intake', (t) => sql`INSERT INTO intake_inbox (tenant_id, channel, actor, doc_key, doc_type, payload_raw, payload_hash, payload_bytes, score, status)
        VALUES (${t}, 'api', 'user:1', 'gl-cho-1', 'sale', '{}'::jsonb, 'h-gl-cho-1', 2, 50, 'open')`.execute(db)],
      ['purchase', (t) => sql`INSERT INTO purchase_documents (tenant_id, kind, status, doc_no, doc_date, branch_code, partner_code, total, created_by)
        VALUES (${t}, 'receipt', 'draft', 'PM-NHAP-1', '2026-10-12', 'CN01', 'NCC-GL', 1000, 'test')`.execute(db)],
      ['payment_request', async (t) => {
        const p = await db.selectFrom('partners').select('id').where('tenant_id', '=', t).executeTakeFirst();
        const pid = p?.id ?? (await sql<{ id: string }>`INSERT INTO partners (tenant_id, code, name) VALUES (${t}, 'GL-DT', 'Đối tượng giả lập') RETURNING id`.execute(db)).rows[0]!.id;
        return sql`INSERT INTO payment_requests (tenant_id, request_no, request_date, branch_code, partner_id, amount, status, created_by)
          VALUES (${t}, 'DN-NHAP-1', '2026-10-12', 'CN01', ${pid}, 1000, 'draft', 'test')`.execute(db);
      }],
    ];
    for (const [kind, insert] of cases) {
      const t = await fresh();
      expect((await status(t.ctx)).empty, kind).toBe(true);
      await insert(t.id);
      const s = await status(t.ctx);
      expect(s, kind).toMatchObject({ empty: false, kinds: [kind] });
    }
  });

  it('danh sách loại đóng, không trùng; khoá theo đơn vị chạy được trong giao dịch', async () => {
    const kinds = EMPTINESS_PROBES.map((p) => p.kind);
    expect(new Set(kinds).size).toBe(kinds.length);
    const r = await db.transaction().execute((trx) => tenantEmptiness(trx, b.id, { lock: true }));
    expect(r).toEqual({ empty: true, kinds: [] });
  });
});
