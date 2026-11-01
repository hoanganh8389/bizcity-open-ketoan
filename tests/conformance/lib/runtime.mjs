// [2026-11-02 12:10 AM Johnny Chu - Chu Hoàng Anh] PHASE-020 — lane runtime cho --certify: chạy đúng các tệp vitest mà ca rulepack dẫn làm bằng chứng (verified_by) trên PostgreSQL thật qua cổng công khai; đọc báo cáo JSON của vitest (VNCONF-003 W1a).
/**
 * Lane RUNTIME (CONF-RUN, R-VNC-7): bằng chứng chạy thật là bộ test vitest có sẵn của Core — đi qua cửa thật
 * (POST /api/v1/documents, action, MCP), mỗi tệp một đơn vị giả lập riêng, afterAll kiểm bất biến sổ (assertLedgerInvariants).
 * Không viết harness ghi sổ riêng: runner chỉ CHỌN tệp test mà rulepack dẫn và đọc kết quả.
 *
 * Cần: npm install đã chạy, DATABASE_URL trỏ CSDL test (không phải CSDL thật), JWT_SECRET. Thiếu → trả { ran: false, reason }.
 */
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const API_DIR = 'apps/api';

export function runtimeAvailable(root, env = process.env) {
  if (!env.DATABASE_URL) return { ok: false, reason: 'chưa đặt DATABASE_URL (CSDL test) cho lane runtime' };
  if (/\/ketoan(\?|$)/.test(env.DATABASE_URL) && !env.BIZCITY_ALLOW_PROD_DB) return { ok: false, reason: 'DATABASE_URL trỏ CSDL "ketoan" (bản chính) — lane runtime chỉ chạy trên CSDL test (vd ketoan_test)' };
  if (!fs.existsSync(path.join(root, 'node_modules', 'vitest'))) return { ok: false, reason: 'chưa cài vitest (npm ci)' };
  return { ok: true };
}

/**
 * Chạy vitest cho danh sách tệp (tên trong apps/api/test). Trả { ran, reason?, tests: Map(file → 'pass'|'fail'|'error'), ms, summary }.
 */
export async function runVitest(files, { root, env = process.env, log = () => {} } = {}) {
  const avail = runtimeAvailable(root, env);
  if (!avail.ok) return { ran: false, reason: avail.reason, tests: new Map(), ms: 0 };
  const unique = [...new Set(files)].filter((f) => fs.existsSync(path.join(root, API_DIR, 'test', f)));
  if (!unique.length) return { ran: true, tests: new Map(), ms: 0, summary: 'không có tệp test nào để chạy' };
  const out = path.join(os.tmpdir(), `bizcity-vn-vitest-${process.pid}-${Date.now()}.json`);
  const bin = path.join(root, 'node_modules', 'vitest', 'vitest.mjs');
  const args = [bin, 'run', ...unique.map((f) => `test/${f}`), '--reporter=json', `--outputFile=${out}`];
  const t = Date.now();
  log(`lane runtime: vitest ${unique.length} tệp (${unique.join(', ')})`);
  const code = await new Promise((res) => {
    const p = spawn(process.execPath, args, { cwd: path.join(root, API_DIR), env: { ...env, NODE_ENV: 'test', CI: '1' }, stdio: ['ignore', 'ignore', 'pipe'] });
    let err = '';
    p.stderr.on('data', (d) => { err += d; });
    p.on('close', (c) => res({ c, err }));
    p.on('error', (e) => res({ c: -1, err: String(e) }));
  });
  const tests = new Map();
  let summary = `exit ${code.c}`;
  try {
    const rep = JSON.parse(fs.readFileSync(out, 'utf8'));
    for (const r of rep.testResults ?? []) {
      const name = path.basename(r.name);
      tests.set(name, r.status === 'passed' ? 'pass' : r.status === 'failed' ? 'fail' : 'error');
    }
    summary = `${rep.numPassedTests ?? '?'} test đạt · ${rep.numFailedTests ?? '?'} lỗi · ${rep.numTotalTestSuites ?? '?'} tệp`;
  } catch {
    for (const f of unique) tests.set(f, 'error');
    summary = `không đọc được báo cáo vitest (${code.err.split('\n').find(Boolean) ?? 'không rõ'})`;
  } finally { try { fs.unlinkSync(out); } catch { /* đã xoá */ } }
  for (const f of unique) if (!tests.has(f)) tests.set(f, 'error');
  return { ran: true, tests, ms: Date.now() - t, summary };
}
