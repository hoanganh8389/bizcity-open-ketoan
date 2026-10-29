/**
 * Kết nối CSDL cho lane diagnostics. CHỈ ĐỌC: mọi truy vấn chạy trong giao dịch `READ ONLY`.
 * Không tự dò CSDL — phải chỉ rõ một trong hai cách:
 *
 *   BIZCITY_PSQL="docker exec -i ketoan-db-1 psql -U ketoan -d ketoan"   (hoặc --psql "<lệnh>")
 *   DATABASE_URL=postgres://…   + gói `pg` đã cài (npm install)
 *
 * Không có → lane diagnostics `skip`, selfcheck vẫn chạy.
 */
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import path from 'node:path';

export async function openDb({ psql, url, root }) {
  if (psql) return psqlDriver(psql);
  if (url) {
    let pg;
    for (const from of ['apps/api/package.json', 'package.json']) {
      try { pg = createRequire(path.join(root, from))('pg'); break; } catch { /* thử chỗ khác */ }
    }
    if (!pg) return unavailable('có DATABASE_URL nhưng chưa cài gói pg (npm install) — dùng BIZCITY_PSQL thay thế');
    return pgDriver(pg, url);
  }
  return unavailable('chưa chỉ CSDL: đặt BIZCITY_PSQL hoặc DATABASE_URL (xem tests/conformance/README.md §4)');
}

const unavailable = (reason) => ({ available: false, reason, async query() { throw new Error(reason); }, async close() {} });

/** Bọc truy vấn để mọi driver trả cùng một dạng: mảng dòng JSON. */
const asJson = (sql) => `SELECT coalesce(json_agg(q), '[]'::json) FROM (${sql.trim().replace(/;\s*$/, '')}) q`;

function psqlDriver(cmd) {
  const [bin, ...base] = cmd.trim().split(/\s+/);
  return {
    available: true,
    label: `psql (${cmd})`,
    query(sql) {
      const args = [...base, '-X', '-q', '-A', '-t', '-v', 'ON_ERROR_STOP=1',
        '-c', 'SET default_transaction_read_only = on', '-c', asJson(sql)];
      return new Promise((resolve, reject) => {
        const p = spawn(bin, args, { stdio: ['ignore', 'pipe', 'pipe'] });
        let out = ''; let err = '';
        p.stdout.on('data', (d) => { out += d; });
        p.stderr.on('data', (d) => { err += d; });
        p.on('error', reject);
        p.on('close', (code) => {
          if (code !== 0) return reject(new Error(err.trim() || `psql thoát ${code}`));
          try { resolve(JSON.parse(out.trim() || '[]')); } catch (e) { reject(new Error(`không đọc được kết quả psql: ${out.slice(0, 200)}`)); }
        });
      });
    },
    async close() {},
  };
}

function pgDriver(pg, url) {
  const pool = new pg.Pool({ connectionString: url, max: 4 });
  return {
    available: true,
    label: 'pg (DATABASE_URL)',
    async query(sql) {
      const c = await pool.connect();
      try {
        await c.query('BEGIN READ ONLY');
        const r = await c.query(asJson(sql));
        await c.query('ROLLBACK');
        return r.rows[0]?.coalesce ?? [];
      } catch (e) { await c.query('ROLLBACK').catch(() => {}); throw e; } finally { c.release(); }
    },
    close: () => pool.end(),
  };
}
