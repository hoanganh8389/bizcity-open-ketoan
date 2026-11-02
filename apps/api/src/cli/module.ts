// @bizcity-layer P cli
// [2026-11-02 04:20 PM Johnny Chu - Chu Hoàng Anh] PHASE-011 — 3.13 (ADR-0011 D1, D2, CK-6): lệnh `module` cho người quản trị bản cài — list, sync (cài / nâng cấp / băm lại module đi kèm), activate, deactivate, verify
/**
 * LỆNH MODULE (ADR-0011 D1, D2). Chạy bằng vai trò SỞ HỮU CSDL (DATABASE_URL của job cài đặt), không bằng ketoan_app.
 *
 *   npm run module -w @ketoan/api -- list               registry + hash thư mục đang có + kết quả nạp lần gần nhất
 *   npm run module -w @ketoan/api -- sync               cài / nâng cấp / băm lại module đi kèm (job db-migrate tự chạy)
 *   npm run module -w @ketoan/api -- activate <key>     bật trên cả bản cài (kiểm năng lực Core)
 *   npm run module -w @ketoan/api -- deactivate <key>   tắt trên cả bản cài (API khởi động lại thì không nạp)
 *   npm run module -w @ketoan/api -- verify             hash thư mục ≠ registry → thoát mã 1 (dùng trong CI / trước khi khởi động)
 *   npm run module -w @ketoan/api -- migrate <key> [dir] migration của module bằng vai trò mod_<key>_owner (ADR-0011 D4); mặc định
 *                                                        <gốc repo>/modules/<key>/migrations, khung nhìn đọc từ manifest data.reads
 *
 * Không có lệnh "tải gói": module là mã nguồn trong bản cài, dựng lại rồi `sync` (ADR-0011 D3, CK-13).
 */
// [2026-11-02 04:55 PM Johnny Chu - Chu Hoàng Anh] PHASE-011 — 3.10: lệnh module migrate <key> (ADR-0011 D4)
import { userInfo } from 'node:os';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { DB_DIR } from '@bizcity/platform/db/paths';
import { runModuleMigrations } from '@bizcity/platform/db/module-db';
import { db, pool } from '../db/client.js';
import { hashModuleDir } from '@bizcity/platform/core/module-registry';
import { bundledModules, setStatus, syncBundled } from '../core/module-lifecycle.js';

const by = `cli:${userInfo().username}`;

async function main(argv: string[]): Promise<number> {
  const [cmd, key] = argv;
  switch (cmd) {
    case 'list': {
      const rows = await db.selectFrom('module_registry').selectAll().orderBy('key').execute();
      const code = new Map(bundledModules().map((b) => [b.key, hashModuleDir(b.dir)]));
      for (const r of rows) {
        const h = code.get(r.key);
        const hashState = !h ? 'không có mã' : h === r.build_hash ? 'khớp' : 'LỆCH';
        console.log(`${r.key.padEnd(16)} ${r.kind.padEnd(6)} ${r.version.padEnd(10)} ${r.status.padEnd(9)} hash ${hashState.padEnd(11)} nạp: ${r.last_load_result ?? '—'}`);
      }
      for (const k of code.keys()) if (!rows.some((r) => r.key === k)) console.log(`${k.padEnd(16)} chưa cài — chạy "module sync"`);
      return 0;
    }
    case 'sync': {
      const changes = await syncBundled(by);
      console.log(changes.length ? changes.map((c) => `${c.action} ${c.key} ${c.from ? `${c.from} → ` : ''}${c.to}`).join('\n') : 'Registry đã khớp, không đổi gì');
      return 0;
    }
    case 'activate':
    case 'deactivate': {
      if (!key) { console.error(`Thiếu khoá module: module ${cmd} <key>`); return 2; }
      const r = await setStatus(key, cmd === 'activate' ? 'active' : 'disabled', by);
      console.log(r.changed ? `${key}: ${r.status} (khởi động lại API để có hiệu lực)` : `${key}: đã ${r.status}, không đổi`);
      return 0;
    }
    case 'verify': {
      const rows = new Map((await db.selectFrom('module_registry').select(['key', 'build_hash', 'status']).execute()).map((r) => [r.key, r]));
      let bad = 0;
      for (const b of bundledModules()) {
        const r = rows.get(b.key);
        const h = hashModuleDir(b.dir);
        if (!r) { console.error(`${b.key}: chưa có trong registry`); bad++; } else if (r.build_hash !== h) { console.error(`${b.key}: hash lệch registry`); bad++; }
      }
      console.log(bad ? `${bad} module lệch` : 'Mọi module khớp registry');
      return bad ? 1 : 0;
    }
    case 'migrate': {
      if (!key) { console.error('Thiếu khoá module: module migrate <key> [dir]'); return 2; }
      const root = path.resolve(DB_DIR, '..', 'modules', key);
      const dir = argv[2] ? path.resolve(argv[2]) : path.join(root, 'migrations');
      const manifest = path.join(root, 'bizcity.module.json');
      const reads = existsSync(manifest) ? ((JSON.parse(readFileSync(manifest, 'utf8')) as { data?: { reads?: string[] } }).data?.reads ?? []) : [];
      const applied = await runModuleMigrations(key, dir, { reads, log: (m) => console.log(m) });
      console.log(applied.length ? `Module ${key}: đã áp ${applied.length} migration` : `Module ${key}: CSDL đã mới nhất`);
      return 0;
    }
    default:
      console.error('Dùng: module list | sync | activate <key> | deactivate <key> | verify | migrate <key> [dir]');
      return 2;
  }
}

main(process.argv.slice(2))
  .then(async (code) => { await pool.end(); process.exit(code); })
  .catch(async (err: unknown) => { console.error((err as Error).message); await pool.end(); process.exit(1); });
