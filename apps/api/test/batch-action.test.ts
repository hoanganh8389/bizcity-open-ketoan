// [2026-11-03 10:40 AM Johnny Chu - Chu Hoàng Anh] PHASE-014 — W6 đợt 6: action theo lô — mỗi mục một SAVEPOINT
/**
 * inSavepoint / ctx.data.item: mục lỗi chỉ huỷ phần của nó, giao dịch ngoài dùng tiếp được; mục đúng lưu khi cả lô commit,
 * lô huỷ (lỗi ngoài mục) thì không mục nào được lưu.
 */
import { afterAll, describe, expect, it } from 'vitest';
import { sql } from 'kysely';
import { db } from '../src/db/client.js';
import { inSavepoint, itemMessage } from '@bizcity/platform/core/actions';

afterAll(async () => {
  await sql`DROP TABLE IF EXISTS bz_batch_probe`.execute(db);
});

describe('Action theo lô (SAVEPOINT)', () => {
  it('mục lỗi huỷ riêng phần của nó; mục đúng lưu khi lô commit', async () => {
    await sql`CREATE TABLE IF NOT EXISTS bz_batch_probe (k text PRIMARY KEY)`.execute(db);
    await sql`TRUNCATE bz_batch_probe`.execute(db);
    const results = await db.transaction().execute(async (trx) => {
      const out = [];
      for (const k of ['a', 'b', 'a', 'c']) {
        out.push(await inSavepoint(trx, async (t) => {
          await sql`INSERT INTO bz_batch_probe (k) VALUES (${k})`.execute(t);
          if (k === 'b') throw new Error('mục b sai');
          return k;
        }));
      }
      return out;
    });
    expect(results.map((r) => (r.ok ? r.value : itemMessage(r.error)))).toEqual(['a', 'mục b sai', expect.stringMatching(/duplicate key/), 'c']);
    const rows = await sql<{ k: string }>`SELECT k FROM bz_batch_probe ORDER BY k`.execute(db);
    expect(rows.rows.map((r) => r.k)).toEqual(['a', 'c']);
  });

  it('lô huỷ thì không mục nào được lưu', async () => {
    await sql`TRUNCATE bz_batch_probe`.execute(db);
    await expect(db.transaction().execute(async (trx) => {
      await inSavepoint(trx, (t) => sql`INSERT INTO bz_batch_probe (k) VALUES ('x')`.execute(t));
      throw new Error('lỗi của cả lô');
    })).rejects.toThrow('lỗi của cả lô');
    expect((await sql`SELECT 1 FROM bz_batch_probe`.execute(db)).rows).toHaveLength(0);
  });
});
