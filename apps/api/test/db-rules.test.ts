/**
 * Luật bảo vệ sổ cái ở tầng cơ sở dữ liệu PostgreSQL (trigger, CHECK) và quy ước mã id bigint tự tăng.
 * Chạy trên PostgreSQL thật: thử ghi thẳng vào bảng, bỏ qua tầng nghiệp vụ, để chắc trigger chặn được.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { sql, type Transaction } from 'kysely';
import { db } from '../src/db/client.js';
import { LEDGER_DIAGNOSTICS } from '@bizcity/kernel/modules/ledger/ledger.diagnostics';
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

  // [2026-11-08 04:40 PM Johnny Chu - Chu Hoàng Anh] PHASE-004 — S004-12 (D004-9, review R1 RV-R1-01): cờ allow_ledger_purge đã gỡ khỏi trigger (0086); đặt cờ không còn mở được sổ
  it('S004-12: đặt cờ allow_ledger_purge cũng KHÔNG xoá / sửa / TRUNCATE được sổ (cờ đã gỡ khỏi trigger, 0086)', async () => {
    // Không lọc theo đơn vị: đơn vị của tệp này có thể không có dòng ở bảng đó, khi đó trigger theo dòng không kích hoạt và ca thử không chứng minh gì.
    // Luôn lùi giao dịch: nếu một câu lệnh lọt qua, ca thử trả 'ĐÃ CHẠY ĐƯỢC' (test đỏ) mà không phá dữ liệu.
    const ROLLBACK = new Error('lùi giao dịch thử');
    const withFlag = (run: (trx: Transaction<any>) => Promise<unknown>) =>
      db.transaction().execute(async (trx) => {
        await sql`SELECT set_config('ketoan.allow_ledger_purge', 'on', true)`.execute(trx);
        await run(trx);
        throw ROLLBACK;
      }).catch((e) => { if (e === ROLLBACK) return 'ĐÃ CHẠY ĐƯỢC'; throw e; });
    const attempts: Array<[string, string, RegExp]> = [
      ['DELETE ledger_lines', 'DELETE FROM ledger_lines', /chỉ được thêm/],
      ['UPDATE ledger_lines', "UPDATE ledger_lines SET description = 'sửa lén'", /chỉ được thêm/],
      ['DELETE ledger_entries', 'DELETE FROM ledger_entries', /chỉ được thêm/],
      ['DELETE ledger_links', 'DELETE FROM ledger_links', /chỉ được thêm/],
      ['DELETE accounting_events', 'DELETE FROM accounting_events', /không được xoá|chỉ được thêm/],
      ['DELETE accounting_event_versions', 'DELETE FROM accounting_event_versions', /chỉ được thêm|chỉ thêm|không sửa/i],
      ['TRUNCATE ledger_lines', 'TRUNCATE ledger_lines CASCADE', /TRUNCATE|chỉ được thêm/i],
      ['TRUNCATE ledger_entries', 'TRUNCATE ledger_entries CASCADE', /TRUNCATE|chỉ được thêm/i],
      ['TRUNCATE accounting_events', 'TRUNCATE accounting_events CASCADE', /TRUNCATE|chỉ được thêm/i],
      ['TRUNCATE accounting_event_versions', 'TRUNCATE accounting_event_versions CASCADE', /TRUNCATE|chỉ được thêm/i],
    ];
    for (const [name, stmt, deny] of attempts) {
      await expect(withFlag((trx) => sql.raw(stmt).execute(trx)), name).rejects.toThrow(deny);
    }
  });

  // [2026-11-08 04:40 PM Johnny Chu - Chu Hoàng Anh] PHASE-004 — S004-12 (D004-9): chẩn đoán LEDGER_TRIGGERS báo trigger còn nhắc cờ thoát (chống tái phạm)
  it('S004-12: chẩn đoán LEDGER_TRIGGERS xanh khi sạch, và ĐỎ nếu một trigger bị đưa lại mệnh đề cờ allow_ledger_purge', async () => {
    const check = LEDGER_DIAGNOSTICS.find((c) => c.code === 'LEDGER_TRIGGERS')!;
    const ROLLBACK = new Error('lùi giao dịch thử');
    const clean = await db.transaction().execute((trx) => check.run(trx, {} as never));
    expect(clean.count, JSON.stringify(clean.sample)).toBe(0);
    const probe = await db.transaction().execute(async (trx) => {
      await sql`CREATE TEMP TABLE bypass_probe (id int)`.execute(trx);
      await sql`CREATE TRIGGER bypass_probe_no_update BEFORE DELETE OR UPDATE ON bypass_probe FOR EACH ROW
                WHEN ((current_setting('ketoan.allow_ledger_purge'::text, true) IS DISTINCT FROM 'on'::text)) EXECUTE FUNCTION forbid_ledger_mutation()`.execute(trx);
      const res = await check.run(trx, {} as never);
      throw Object.assign(ROLLBACK, { res });
    }).catch((e) => { if (e === ROLLBACK) return (e as typeof ROLLBACK & { res: { count: number; sample?: string[] } }).res; throw e; });
    expect(probe.count).toBe(1);
    expect(probe.sample?.[0]).toMatch(/^cờ thoát:.*bypass_probe_no_update/);
  });

  // P0-1 (AUDIT-2026-11-01, migration 0049): đầu bút toán và sự việc kế toán bị khoá ở tầng CSDL.
  it('không xoá được đầu bút toán, không đổi tiền / ngày / trạng thái ngoài ba lối của Kernel', async () => {
    const e = await db.selectFrom('ledger_entries').select(['id', 'posting_date']).where('tenant_id', '=', tenantId).executeTakeFirstOrThrow();
    const deny = /chỉ được thêm/;
    await expect(sql`DELETE FROM ledger_entries WHERE id = ${e.id}`.execute(db)).rejects.toThrow(deny);
    await expect(sql`UPDATE ledger_entries SET total = total + 1 WHERE id = ${e.id}`.execute(db)).rejects.toThrow(deny);
    await expect(sql`UPDATE ledger_entries SET posting_date = posting_date + 1 WHERE id = ${e.id}`.execute(db)).rejects.toThrow(deny);
    await expect(sql`UPDATE ledger_entries SET status = 'draft' WHERE id = ${e.id}`.execute(db)).rejects.toThrow(deny);
    await expect(sql`UPDATE ledger_entries SET entry_no = entry_no || 'X' WHERE id = ${e.id}`.execute(db)).rejects.toThrow(deny);
    await expect(sql`UPDATE ledger_entries SET is_reversal = true WHERE id = ${e.id}`.execute(db)).rejects.toThrow(deny);
    // E2 đổi thông tin đầu kèm tiền: chặn
    await expect(sql`UPDATE ledger_entries SET description = 'x', total = total + 1 WHERE id = ${e.id}`.execute(db)).rejects.toThrow(deny);
    // E1 không bật cost_overwrite: không đổi được total
    await expect(db.transaction().execute(async (trx) => {
      await sql`SELECT set_config('ketoan.cost_overwrite', 'off', true)`.execute(trx);
      await sql`UPDATE ledger_entries SET total = total WHERE id = ${e.id}`.execute(trx); // không đổi gì — được
      await sql`UPDATE ledger_entries SET total = total + 1 WHERE id = ${e.id}`.execute(trx);
    })).rejects.toThrow(deny);
  });

  it('ba lối của Kernel vẫn chạy: thông tin đầu (E2), điền giá vốn (E1), đảo posted → reversed', async () => {
    // Chạy trong giao dịch rồi huỷ: không để lại thay đổi trên sổ của tệp test.
    const rollback = new Error('rollback');
    await expect(db.transaction().execute(async (trx) => {
      const e = await trx.selectFrom('ledger_entries').select(['id', 'total']).where('tenant_id', '=', tenantId).where('status', '=', 'posted').where('is_reversal', '=', false).executeTakeFirstOrThrow();
      await sql`UPDATE ledger_entries SET description = 'Thông tin đầu mới', invoice_no = 'HD-1' WHERE id = ${e.id}`.execute(trx);
      await sql`SELECT set_config('ketoan.cost_overwrite', 'on', true)`.execute(trx);
      await sql`UPDATE ledger_entries SET total = total + 0 WHERE id = ${e.id}`.execute(trx);
      await sql`SELECT set_config('ketoan.cost_overwrite', 'off', true)`.execute(trx);
      await sql`UPDATE ledger_entries SET status = 'reversed' WHERE id = ${e.id}`.execute(trx);
      // đã reversed thì không quay lại posted
      await expect(sql`UPDATE ledger_entries SET status = 'posted' WHERE id = ${e.id}`.execute(trx)).rejects.toThrow(/chỉ được thêm/);
      throw rollback;
    })).rejects.toBe(rollback);
  });

  it('sự việc kế toán không xoá được, không đổi doc_key, không lùi phiên bản; bản cất phiên bản cũ chỉ thêm', async () => {
    const ev = await db.selectFrom('accounting_events').select(['id', 'version']).where('tenant_id', '=', tenantId).executeTakeFirstOrThrow();
    const deny = /không được xoá|chỉ được thêm/;
    await expect(sql`DELETE FROM accounting_events WHERE id = ${ev.id}`.execute(db)).rejects.toThrow(deny);
    await expect(sql`UPDATE accounting_events SET doc_key = doc_key || ':x' WHERE id = ${ev.id}`.execute(db)).rejects.toThrow(deny);
    await expect(sql`UPDATE accounting_events SET version = ${ev.version - 1} WHERE id = ${ev.id}`.execute(db)).rejects.toThrow(deny);
    await expect(sql`TRUNCATE accounting_events CASCADE`.execute(db)).rejects.toThrow(/TRUNCATE|permission denied/);
    await expect(sql`UPDATE accounting_event_versions SET payload = '{}'::jsonb WHERE event_id = ${ev.id}`.execute(db)).resolves.toBeDefined(); // không dòng nào: không lỗi
    await expect(db.transaction().execute(async (trx) => {
      await trx.insertInto('accounting_event_versions').values({ event_id: ev.id, version: 999999, payload: '{}', received_at: new Date() }).execute();
      await sql`UPDATE accounting_event_versions SET payload = '{"x":1}'::jsonb WHERE event_id = ${ev.id} AND version = 999999`.execute(trx);
    })).rejects.toThrow(/chỉ được thêm/);
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
    await expect(sql`TRUNCATE ledger_lines`.execute(db)).rejects.toThrow(/TRUNCATE|permission denied/);
    await expect(sql`TRUNCATE ledger_entries CASCADE`.execute(db)).rejects.toThrow(/TRUNCATE|permission denied/);
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
      // [2026-11-08 04:40 PM Johnny Chu - Chu Hoàng Anh] PHASE-004 — S004-12 (D004-8): dọn dòng thử bằng đường của E3 (superuser, bỏ trigger trong giao dịch), không dùng cờ allow_ledger_purge nữa
      await sql`SET LOCAL session_replication_role = replica`.execute(trx);
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
