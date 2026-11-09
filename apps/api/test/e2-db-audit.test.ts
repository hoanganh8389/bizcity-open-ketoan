// [2026-11-09 08:30 AM Johnny Chu - Chu Hoàng Anh] PHASE-004 — S004-14 (D004-11, D004-12): UPDATE thẳng vào các cột E2 bằng ketoan_app để lại dấu vết ở CSDL; T004-DB-1…5
/**
 * Yêu cầu của chủ dự án (2026-11-08): "UPDATE ledger_entries viết thẳng bằng ketoan_app vào 7 cột này vẫn được trigger cho phép và cần phải để
 * lại dấu vết". Trigger \`ledger_entries_header_audit\` (0089) ghi audit_logs mọi thay đổi bảy cột, từ mọi đường. Mọi ca chạy dưới
 * \`SET LOCAL ROLE ketoan_app\` trong một giao dịch rồi ROLLBACK (không để lại thay đổi trên sổ của tệp test).
 *   T004-DB-1  UPDATE thẳng nhiều cột ⇒ đúng một dòng audit_logs, before / after chỉ cột đổi, _source = db, _role = ketoan_app, _txid
 *   T004-DB-2  mỗi trong bảy cột đổi đều bị ghi (không cột nào lọt)
 *   T004-DB-3  UPDATE không đổi giá trị cột nào (hoặc chỉ đổi cột ngoài bảy cột) ⇒ không thêm dòng
 *   T004-DB-4  ketoan_app không tắt / gỡ được trigger, không xoá / sửa được dòng nhật ký để xoá dấu vết
 *   T004-DB-5  chẩn đoán LEDGER_TRIGGERS biết trigger mới: tắt trigger thì báo
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { PoolClient } from 'pg';
import { sql } from 'kysely';
import { db, pool } from '../src/db/client.js';
import { E2_DB_COLUMNS } from '@bizcity/kernel/modules/posting/posting.service';
import { LEDGER_DIAGNOSTICS } from '@bizcity/kernel/modules/ledger/ledger.diagnostics';
import { saleDoc, setupTenant, type TestCtx } from './helpers.js';

let ctx: TestCtx;
let tenantId = '';
let entryId = '';

/** Chạy `fn` dưới vai trò ketoan_app trong giao dịch rồi ROLLBACK; trả kết quả hoặc lỗi. */
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
const headerAudit = async (c: PoolClient) =>
  (await c.query<{ before_data: Record<string, unknown>; after_data: Record<string, unknown>; actor: string; actor_via: string }>(
    `SELECT before_data, after_data, actor, actor_via FROM audit_logs WHERE tenant_id = $1 AND object_id = $2 AND action = 'ledger.entry.header_update' ORDER BY id`, [tenantId, entryId])).rows;

beforeAll(async () => {
  ctx = await setupTenant();
  tenantId = (await db.selectFrom('tenants').select('id').where('code', '=', ctx.tenantCode).executeTakeFirstOrThrow()).id;
  const posted = await ctx.app.inject({ method: 'POST', url: '/api/v1/documents', payload: saleDoc({ docKey: 'pos:CN01:DB1', docNo: 'DB1' }) as never, headers: { 'x-api-key': ctx.apiKey } });
  expect(posted.json().data.status).toBe('posted');
  entryId = String((await db.selectFrom('ledger_entries').select('id').where('tenant_id', '=', tenantId).where('is_reversal', '=', false).executeTakeFirstOrThrow()).id);
});
afterAll(async () => {
  await ctx.app.close();
});

describe('T004-DB — UPDATE thẳng bằng ketoan_app vào bảy cột E2 để lại dấu vết', () => {
  it('T004-DB-1 UPDATE thẳng ⇒ đúng một dòng audit_logs, trước / sau chỉ cột đổi, nguồn db, vai trò, txid', async () => {
    const r = await asApp(async (c) => {
      const upd = await c.query(`UPDATE ledger_entries SET event_version = NULL, description = 'sửa lén bằng SQL' WHERE id = $1`, [entryId]);
      expect(upd.rowCount).toBe(1); // trigger E2 cho qua: đây chính là kẽ hở cần có dấu vết
      return headerAudit(c);
    });
    expect(r.error?.message).toBeUndefined();
    const rows = r.value!;
    expect(rows).toHaveLength(1);
    const a = rows[0]!;
    expect(Object.keys(a.before_data).sort()).toEqual(['description', 'event_version']);
    expect(a.before_data.event_version).toBe(1);
    expect(a.after_data).toMatchObject({ description: 'sửa lén bằng SQL', event_version: null, _source: 'db', _role: 'ketoan_app' });
    expect(String(a.after_data._txid)).toMatch(/^\d+$/);
    expect(a.actor_via).toBe('db-trigger');
  });

  it('T004-DB-2 mỗi trong chín cột đổi đều bị ghi (bảy cột E2 + partner_name, partner_attr_id của 0087)', async () => {
    const values: Record<(typeof E2_DB_COLUMNS)[number], string> = {
      doc_no: `'DB1-SUA'`, invoice_no: `'HD-SUA'`, reason_code: `'ly-do-sua'`, partner_id: 'NULL', description: `'mô tả sửa'`, content_hash: `'sha256:sua'`, event_version: '99',
      partner_name: `'Tên đối tượng sửa lén'`, partner_attr_id: 'NULL',
    };
    for (const col of E2_DB_COLUMNS) {
      const r = await asApp(async (c) => {
        await c.query(`UPDATE ledger_entries SET ${col} = ${values[col]} WHERE id = $1`, [entryId]);
        return headerAudit(c);
      });
      expect(r.error?.message, col).toBeUndefined();
      expect(r.value, col).toHaveLength(1);
      expect(Object.keys(r.value![0]!.before_data), col).toEqual([col]);
      expect(r.value![0]!.after_data, col).toHaveProperty('_source', 'db');
    }
  });

  it('T004-DB-3 UPDATE không đổi giá trị bảy cột (hoặc chỉ cột khác): không thêm dòng', async () => {
    const r = await asApp(async (c) => {
      await c.query(`UPDATE ledger_entries SET description = description, doc_no = doc_no WHERE id = $1`, [entryId]);
      await c.query(`UPDATE ledger_entries SET status = status WHERE id = $1`, [entryId]); // total không còn UPDATE được bằng ketoan_app (0091, S004-17)
      return headerAudit(c);
    });
    expect(r.error?.message).toBeUndefined();
    expect(r.value).toHaveLength(0);
  });

  it('T004-DB-4 ketoan_app không tắt / gỡ được trigger, không xoá / sửa được dòng nhật ký để xoá dấu vết', async () => {
    const off = await asApp((c) => c.query('ALTER TABLE ledger_entries DISABLE TRIGGER ledger_entries_header_audit'));
    expect(off.error?.message).toMatch(/must be owner|phải là chủ/i);
    const drop = await asApp((c) => c.query('DROP TRIGGER ledger_entries_header_audit ON ledger_entries'));
    expect(drop.error?.message).toMatch(/must be owner|phải là chủ/i);
    const repl = await asApp((c) => c.query('SET session_replication_role = replica'));
    expect(repl.error?.message).toMatch(/permission denied|không có quyền/i);
    // Sửa rồi cố xoá dấu vết ngay trong cùng giao dịch
    const wipe = await asApp(async (c) => {
      await c.query(`UPDATE ledger_entries SET description = 'xoá dấu vết' WHERE id = $1`, [entryId]);
      await c.query(`DELETE FROM audit_logs WHERE tenant_id = $1 AND object_id = $2 AND action = 'ledger.entry.header_update'`, [tenantId, entryId]);
    });
    expect(wipe.error?.message).toMatch(/chỉ được thêm|chỉ thêm|không sửa/i);
    const alter = await asApp(async (c) => {
      await c.query(`UPDATE ledger_entries SET description = 'sửa nhật ký' WHERE id = $1`, [entryId]);
      await c.query(`UPDATE audit_logs SET after_data = '{}'::jsonb WHERE tenant_id = $1 AND object_id = $2 AND action = 'ledger.entry.header_update'`, [tenantId, entryId]);
    });
    expect(alter.error?.message).toMatch(/chỉ được thêm|chỉ thêm|không sửa/i);
  });

  it('T004-DB-5 chẩn đoán LEDGER_TRIGGERS biết trigger mới: tắt trigger thì báo "tắt:…"', async () => {
    const check = LEDGER_DIAGNOSTICS.find((c) => c.code === 'LEDGER_TRIGGERS')!;
    const ROLLBACK = new Error('lùi giao dịch thử');
    const clean = await db.transaction().execute((trx) => check.run(trx, {} as never));
    expect(clean.count, JSON.stringify(clean.sample)).toBe(0);
    const off = await db.transaction().execute(async (trx) => {
      await sql`ALTER TABLE ledger_entries DISABLE TRIGGER ledger_entries_header_audit`.execute(trx);
      const res = await check.run(trx, {} as never);
      throw Object.assign(ROLLBACK, { res });
    }).catch((e) => { if (e === ROLLBACK) return (e as typeof ROLLBACK & { res: { count: number; sample?: string[] } }).res; throw e; });
    expect(off.count).toBe(1);
    expect(off.sample?.[0]).toBe('tắt:ledger_entries.ledger_entries_header_audit');
  });
});
