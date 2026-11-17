// [2026-11-17 09:10 PM Johnny Chu - Chu Hoàng Anh] PHASE-036 — S036-7 B5b (ADR-0034): scripts/xoa-cong-ty-mau.sql — xoá sạch đơn vị mẫu đã nạp gói; từ chối đơn vị thật, không xoá dòng nào
/**
 * Chạy đúng tệp scripts/xoa-cong-ty-mau.sql (bỏ dòng \set của psql, thay :'tenant' bằng mã) bằng kết nối superuser của CSDL test
 * (cơ chế E3 cần session_replication_role). Dữ liệu là gói mẫu hư cấu.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { createSampleTenant } from '../src/modules/system/setup-run.js';
import { seed } from '../src/kernel/public.js';
import { setupTenant, type TestCtx } from './helpers.js';

const SQL = fs.readFileSync(path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../scripts/xoa-cong-ty-mau.sql'), 'utf8');
const sqlFor = (code: string) => SQL.split('\n').filter((l) => !l.startsWith('\\set')).join('\n').replace(":'tenant'", `'${code.replace(/'/g, "''")}'`);
let ctx: TestCtx;
let client: pg.Client;

/** Số dòng của đơn vị ở mọi bảng có tenant_id + bốn bảng con (theo id cha đã ghi lại trước khi xoá). */
async function rowsOf(tid: string, parents: { events: string[]; invoices: string[]; assets: string[] }): Promise<Record<string, number>> {
  const tables = (await client.query<{ s: string; t: string }>(`SELECT c.table_schema s, c.table_name t FROM information_schema.columns c
      JOIN information_schema.tables tb ON tb.table_schema = c.table_schema AND tb.table_name = c.table_name
     WHERE c.column_name = 'tenant_id' AND tb.table_type = 'BASE TABLE' AND c.table_schema NOT IN ('pg_catalog', 'information_schema')`)).rows;
  const out: Record<string, number> = {};
  for (const { s, t } of tables) {
    const n = Number((await client.query(`SELECT count(*) n FROM "${s}"."${t}" WHERE tenant_id = $1`, [tid])).rows[0].n);
    if (n) out[`${s}.${t}`] = n;
  }
  const child = async (name: string, q: string, ids: string[]) => { const n = ids.length ? Number((await client.query(q, [ids])).rows[0].n) : 0; if (n) out[name] = n; };
  await child('accounting_event_versions', 'SELECT count(*) n FROM accounting_event_versions WHERE event_id = ANY($1::bigint[])', parents.events);
  await child('tax_invoice_lines', 'SELECT count(*) n FROM tax_invoice_lines WHERE tax_invoice_id = ANY($1::bigint[])', parents.invoices);
  await child('asset_allocations', 'SELECT count(*) n FROM asset_allocations WHERE asset_id = ANY($1::bigint[])', parents.assets);
  await child('asset_depreciation_overrides', 'SELECT count(*) n FROM asset_depreciation_overrides WHERE asset_id = ANY($1::bigint[])', parents.assets);
  const t = Number((await client.query('SELECT count(*) n FROM tenants WHERE id = $1', [tid])).rows[0].n);
  if (t) out.tenants = t;
  return out;
}
const parentsOf = async (tid: string) => ({
  events: (await client.query('SELECT id FROM accounting_events WHERE tenant_id = $1', [tid])).rows.map((r) => String(r.id)),
  invoices: (await client.query('SELECT id FROM tax_invoices WHERE tenant_id = $1', [tid])).rows.map((r) => String(r.id)),
  assets: (await client.query('SELECT id FROM assets WHERE tenant_id = $1', [tid])).rows.map((r) => String(r.id)),
});

beforeAll(async () => {
  ctx = await setupTenant();
  client = new pg.Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
}, 60_000);
afterAll(async () => { await client.end(); await ctx.app.close(); });

describe('scripts/xoa-cong-ty-mau.sql (ADR-0034)', () => {
  it('đơn vị mẫu đã nạp gói → xoá sạch cả đơn vị, kể cả bốn bảng con', async () => {
    const code = `mau${Date.now().toString(36)}x`;
    const r = await createSampleTenant({ presetId: 'thuong-mai-ban-le', code, adminPassword: 'Mau@Xoa12345' }, seed);
    expect(r.run?.status).toBe('done');
    const parents = await parentsOf(r.tenantId);
    expect(parents.events.length).toBeGreaterThan(0);
    const before = await rowsOf(r.tenantId, parents);
    expect(before['public.ledger_lines']).toBeGreaterThan(0);
    expect(before['public.inventory_movements']).toBeGreaterThan(0);
    expect(parents.invoices.length).toBeGreaterThan(0);
    expect(parents.assets.length).toBeGreaterThan(0);
    await client.query(sqlFor(code));
    expect(await rowsOf(r.tenantId, parents)).toEqual({});
  }, 300_000);

  it('đơn vị thật → báo lỗi, không xoá dòng nào', async () => {
    const tid = String((await client.query('SELECT id FROM tenants WHERE code = $1', [ctx.tenantCode])).rows[0].id);
    const parents = await parentsOf(tid);
    const before = await rowsOf(tid, parents);
    expect(before.tenants).toBe(1);
    await expect(client.query(sqlFor(ctx.tenantCode))).rejects.toThrow(/chỉ xoá đơn vị is_sample/);
    await client.query('ROLLBACK').catch(() => undefined);
    expect(await rowsOf(tid, parents)).toEqual(before);
  });
});
