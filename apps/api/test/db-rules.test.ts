/**
 * Luật bảo vệ sổ cái ở tầng cơ sở dữ liệu PostgreSQL (trigger, CHECK) và quy ước mã id bigint tự tăng.
 * Chạy trên PostgreSQL thật: thử ghi thẳng vào bảng, bỏ qua tầng nghiệp vụ, để chắc trigger chặn được.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { sql } from 'kysely';
import { db } from '../src/db/client.js';
import { call, saleDoc, setupTenant, type TestCtx } from './helpers.js';

let ctx: TestCtx;
let tenantId: string;

beforeAll(async () => {
  ctx = await setupTenant();
  const res = await ctx.app.inject({ method: 'POST', url: '/api/v1/documents', payload: saleDoc() as never, headers: { 'x-api-key': ctx.apiKey } });
  expect(res.json().data.status).toBe('posted');
  tenantId = (await db.selectFrom('tenants').select('id').where('code', '=', ctx.tenantCode).executeTakeFirstOrThrow()).id;
});
afterAll(async () => {
  await ctx.app.close();
});

describe('Mã id', () => {
  it('id là số tự tăng (chuỗi số), không dùng UUID', async () => {
    const list = await call(ctx, 'GET', '/api/v1/documents?from=2026-10-01&to=2026-10-31');
    const id = list.body.data[0].id as string;
    expect(id).toMatch(/^[1-9][0-9]*$/);
    const detail = await call(ctx, 'GET', `/api/v1/documents/${id}`);
    expect(detail.status).toBe(200);
    expect(detail.body.data.docKey).toBe('pos:CN01:HD0001');
    for (const e of detail.body.data.entries) expect(String(e.id)).toMatch(/^[1-9][0-9]*$/);
  });

  it('bút toán hiện đúng người lập (tra theo id số của khoá API / người dùng)', async () => {
    const list = await call(ctx, 'GET', '/api/v1/documents?from=2026-10-01&to=2026-10-31');
    const detail = await call(ctx, 'GET', `/api/v1/documents/${list.body.data[0].id}`);
    const entry = await call(ctx, 'GET', `/api/v1/ledger/entries/${detail.body.data.entries[0].id}`);
    expect(entry.status).toBe(200);
    expect(entry.body.data.createdByName).toMatch(/^Tự động — /);
  });

  it('mã id không phải số bị từ chối (400), không lọt xuống cơ sở dữ liệu', async () => {
    const res = await call(ctx, 'GET', '/api/v1/documents/d25688cf-e2ec-458b-97ad-0ee5bb51f4fd');
    expect(res.status).toBe(400);
  });
});

describe('Sổ cái chỉ được thêm (trigger)', () => {
  it('không sửa được dòng sổ đã ghi', async () => {
    await expect(sql`UPDATE ledger_lines SET description = 'sửa lén' WHERE tenant_id = ${tenantId}`.execute(db)).rejects.toThrow(/chỉ được thêm/);
  });

  it('không xoá được dòng sổ đã ghi', async () => {
    await expect(sql`DELETE FROM ledger_lines WHERE tenant_id = ${tenantId}`.execute(db)).rejects.toThrow(/chỉ được thêm/);
  });

  it('số âm chỉ được ghi trong bút toán đảo', async () => {
    const line = await db.selectFrom('ledger_lines').selectAll().where('tenant_id', '=', tenantId).where('debit', '>', '0').executeTakeFirstOrThrow();
    await expect(
      db
        .insertInto('ledger_lines')
        .values({ ...line, id: undefined as never, line_no: 99, debit: -1, credit: 0, dims: JSON.stringify(line.dims) })
        .execute(),
    ).rejects.toThrow(/bút toán đảo/);
  });

  it('không TRUNCATE được sổ cái', async () => {
    await expect(sql`TRUNCATE ledger_lines`.execute(db)).rejects.toThrow(/TRUNCATE/);
    await expect(sql`TRUNCATE ledger_entries CASCADE`.execute(db)).rejects.toThrow(/TRUNCATE/);
  });

  it('một bút toán chỉ bị đảo (ghi số âm) một lần', async () => {
    const orig = await db.selectFrom('ledger_entries').selectAll().where('tenant_id', '=', tenantId).executeTakeFirstOrThrow();
    const copy = (no: string) => ({ ...orig, id: undefined as never, entry_no: no, is_reversal: true, reverses_entry_id: orig.id, created_at: undefined as never });
    await expect(
      db.transaction().execute(async (trx) => {
        await trx.insertInto('ledger_entries').values(copy('TEST-DAO-1')).execute();
        await trx.insertInto('ledger_entries').values(copy('TEST-DAO-2')).execute();
      }),
    ).rejects.toThrow(/ledger_entries_reversed_once/);
  });

  it('dòng sổ phải có đúng một bên Nợ hoặc Có (CHECK)', async () => {
    const line = await db.selectFrom('ledger_lines').selectAll().where('tenant_id', '=', tenantId).executeTakeFirstOrThrow();
    await expect(
      db
        .insertInto('ledger_lines')
        .values({ ...line, id: undefined as never, line_no: 98, debit: 5, credit: 5, dims: JSON.stringify(line.dims) })
        .execute(),
    ).rejects.toThrow();
  });

  it('dòng số 0 chỉ được khi gắn mặt hàng (hàng khuyến mãi, thuế 0%) hoặc chờ giá vốn; dòng tiền không mặt hàng thì không', async () => {
    const line = await db.selectFrom('ledger_lines').selectAll().where('tenant_id', '=', tenantId).executeTakeFirstOrThrow();
    await expect(
      db.insertInto('ledger_lines')
        .values({ ...line, id: undefined as never, line_no: 96, debit: 0, credit: 0, product_sku: null, cost_fill: null, dims: JSON.stringify(line.dims) })
        .execute(),
    ).rejects.toThrow(/ledger_lines_one_side/);
    await db.transaction().execute(async (trx) => {
      await trx.insertInto('ledger_lines')
        .values({ ...line, id: undefined as never, line_no: 95, debit: 0, credit: 0, product_sku: 'KM01', cost_fill: null, dims: JSON.stringify(line.dims) })
        .execute();
      await sql`SELECT set_config('ketoan.allow_ledger_purge', 'on', true)`.execute(trx);
      await trx.deleteFrom('ledger_lines').where('entry_id', '=', line.entry_id).where('line_no', '=', 95).execute();
    });
  });
});

describe('Bút toán phải cân (trigger hoãn tới cuối giao dịch)', () => {
  it('thêm một dòng lẻ làm lệch Nợ / Có thì giao dịch bị huỷ', async () => {
    const line = await db.selectFrom('ledger_lines').selectAll().where('tenant_id', '=', tenantId).where('debit', '>', '0').executeTakeFirstOrThrow();
    await expect(
      db.insertInto('ledger_lines').values({ ...line, id: undefined as never, line_no: 97, debit: 1, credit: 0, dims: JSON.stringify(line.dims) }).execute(),
    ).rejects.toThrow(/không cân/);
  });
});

describe('Tên bảng chuẩn hoá (migration 0010)', () => {
  it('không còn bảng, chỉ mục, trigger mang tên cũ', async () => {
    const old = await sql<{ name: string }>`
      SELECT relname AS name FROM pg_class WHERE relnamespace = 'public'::regnamespace
         AND relname ~ '^(gl_|source_document|entry_sequences|doc_sequences)'
      UNION ALL
      SELECT tgname FROM pg_trigger WHERE tgname ~ '^gl_'
      UNION ALL
      SELECT conname FROM pg_constraint WHERE connamespace = 'public'::regnamespace AND conname ~ '^(gl_|source_document)'
      UNION ALL
      SELECT table_name || '.' || column_name FROM information_schema.columns
       WHERE table_schema = 'public' AND column_name IN ('source_document_id', 'source_version')`.execute(db);
    expect(old.rows.map((r) => r.name)).toEqual([]);
  });

  it('API cấu trúc dữ liệu trả bảng kèm giải thích, khoá ngoại, trigger', async () => {
    const res = await call(ctx, 'GET', '/api/v1/system/schema');
    expect(res.status).toBe(200);
    const tables = res.body.data.tables as { name: string; group: string; label: string; columns: { name: string; references: { table: string } | null }[]; triggers: { name: string; note: string | null }[]; referencedBy: { table: string }[] }[];
    const lines = tables.find((t) => t.name === 'ledger_lines')!;
    expect(lines.group).toBe('ledger');
    expect(lines.label).toBe('Dòng bút toán');
    expect(lines.columns.find((c) => c.name === 'entry_id')?.references?.table).toBe('ledger_entries');
    expect(lines.triggers.map((t) => t.name)).toEqual(expect.arrayContaining(['ledger_lines_balanced', 'ledger_lines_no_update', 'ledger_lines_no_truncate']));
    expect(lines.triggers.every((t) => t.note)).toBe(true);
    const events = tables.find((t) => t.name === 'accounting_events')!;
    expect(events.referencedBy.map((r) => r.table)).toContain('ledger_entries');
    // Mọi bảng đều đã khai báo nhóm trong danh mục
    expect(tables.filter((t) => t.group === 'other' && t.name !== 'schema_migrations').map((t) => t.name)).toEqual([]);
  });
});

describe('Số dư theo ngày khớp sổ cái', () => {
  it('tổng Nợ = tổng Có, và bằng tổng dòng sổ', async () => {
    const lines = await sql<{ d: string; c: string }>`SELECT SUM(debit) AS d, SUM(credit) AS c FROM ledger_lines WHERE tenant_id = ${tenantId}`.execute(db);
    const bal = await sql<{ d: string; c: string }>`SELECT SUM(debit) AS d, SUM(credit) AS c FROM ledger_balances_daily WHERE tenant_id = ${tenantId}`.execute(db);
    expect(lines.rows[0]!.d).toBe(lines.rows[0]!.c);
    expect(bal.rows[0]!.d).toBe(lines.rows[0]!.d);
    expect(bal.rows[0]!.c).toBe(lines.rows[0]!.c);
  });
});
