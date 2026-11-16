#!/usr/bin/env node
// [2026-10-30 12:10 PM Johnny Chu - Chu Hoàng Anh] ADR-0007 — chuẩn hoá mã lỗi, quan sát, bộ giám sát, cài nhanh, kiến trúc, đóng góp.
// [2026-10-30 01:11 PM Johnny Chu - Chu Hoàng Anh] CONG-BO — tuyên bố tối thượng, 7 nguyên tắc AP, ba lớp kiểm soát, ma trận tuân thủ, kiểm nâng cấp migration.
// [2026-11-14 05:53 PM Johnny Chu - Chu Hoàng Anh] PHASE-036 — S036-4 (00 §11): vỏ mỏng — máy chủ chạy gói (core.setup.plan → POST /setup/presets/:id/apply → core.setup.run), không còn tự gọi từng API
/**
 * Cài nhanh một preset theo ngành (bizcity_preset@1, docs/contracts/BIZCITY-PRESET-v1.md). Máy chủ chạy gói (PHASE-036 · 00 §11):
 * mỗi bản ghi đi qua action Core với quyền người đăng nhập — chứng từ mẫu qua cửa nạp, được định khoản, kiểm, ghi bằng chứng như thật.
 * Chỉ nạp vào đơn vị trắng (hoặc đã từng chạy cùng gói). Chạy lại được: danh mục đã có thì bỏ qua, chứng từ cùng docKey → unchanged.
 *
 *   node scripts/cai-preset.mjs --list
 *   node scripts/cai-preset.mjs thuong-mai-ban-le --api http://localhost:8088 --tenant demo --email admin@ketoan.local --password '…'
 *   node scripts/cai-preset.mjs thuong-mai-ban-le --api http://localhost:8088 --token <JWT>
 *   … --no-sample   chỉ cấu hình, không nạp dữ liệu mẫu      … --dry-run   chỉ xem trước (core.setup.plan), không ghi gì
 * Mật khẩu có thể đặt ở biến BIZCITY_PASSWORD thay cho --password (không lưu vào lịch sử lệnh).
 */
import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PRESETS = path.join(ROOT, 'presets');
const args = process.argv.slice(2);
const opt = (name, def) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : def; };
const flag = (name) => args.includes(name);

if (flag('--list') || !args[0] || args[0].startsWith('--')) {
  console.log('Preset có sẵn:');
  for (const d of fs.readdirSync(PRESETS, { withFileTypes: true }).filter((e) => e.isDirectory())) {
    const p = JSON.parse(fs.readFileSync(path.join(PRESETS, d.name, 'preset.json'), 'utf8'));
    console.log(`  ${p.id.padEnd(24)} ${p.title} — phân hệ: ${p.modules.join(', ')}`);
  }
  console.log('\nDùng: node scripts/cai-preset.mjs <id> --api <địa chỉ> (--token <JWT> | --tenant <mã> --email <email> --password <mk>)');
  process.exit(flag('--list') ? 0 : 1);
}

const id = args[0];
const api = opt('--api', 'http://localhost:8088').replace(/\/$/, '');
const dryRun = flag('--dry-run');
const sample = flag('--no-sample') ? '0' : '1';

let token = opt('--token');
async function http(method, url, body, headers = {}) {
  const res = await fetch(api + url, {
    method,
    headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}), ...headers },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const json = await res.json().catch(() => ({}));
  return { status: res.status, json };
}
const fail = (what, r) => { console.error(`✘ ${what}: HTTP ${r.status} ${r.json?.error?.code ?? ''} ${r.json?.error?.message ?? ''} (requestId ${r.json?.error?.requestId ?? '—'})`); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

console.log(`Preset ${id} — API ${api}${dryRun ? '  (xem trước: không ghi gì)' : ''}`);

if (!token) {
  const tenantCode = opt('--tenant'); const email = opt('--email'); const password = opt('--password', process.env.BIZCITY_PASSWORD);
  if (!tenantCode || !email || !password) { console.error('Cần --token, hoặc --tenant + --email + --password (hoặc BIZCITY_PASSWORD).'); process.exit(1); }
  const r = await http('POST', '/api/v1/auth/login', { tenantCode, email, password });
  if (r.status !== 200) { fail('đăng nhập', r); process.exit(1); }
  token = r.json.data.token;
}

// 1. Xem trước (máy chủ đọc presets/<id>/, đếm đã có / sẽ thêm, kiểm năng lực Core)
const plan = await http('GET', `/api/v1/setup/presets/${encodeURIComponent(id)}/plan?sample=${sample}`);
if (plan.status !== 200) { fail('xem trước', plan); process.exit(1); }
const p = plan.json.data;
console.log(`${p.title} ${p.presetVersion}`);
for (const b of p.blocks) console.log(`  · ${b.label.padEnd(36)} ${String(b.total).padStart(4)} (đã có ${b.existing}, sẽ thêm ${b.toAdd})`);
if (!p.allowed) { console.error(`✘ Không nạp được: ${p.reason}`); process.exit(1); }
if (dryRun) { console.log('Xem trước xong.'); process.exit(0); }

// 2. Chạy (nền) + hỏi tiến độ
const start = await http('POST', `/api/v1/setup/presets/${encodeURIComponent(id)}/apply?sample=${sample}`, {}, { 'idempotency-key': `cai-preset-${id}-${randomUUID()}` });
if (start.status !== 202) { fail('bắt đầu nạp', start); process.exit(1); }
const runId = start.json.data.runId;
let run;
for (let i = 0; i < 1800; i++) {
  const r = await http('GET', `/api/v1/setup/runs/${runId}`);
  if (r.status !== 200) { fail('đọc tiến độ', r); process.exit(1); }
  run = r.json.data;
  if (run.status !== 'running') break;
  await sleep(1000);
}
let failed = 0, written = 0, skipped = 0;
for (const s of run.steps) {
  written += s.written; skipped += s.skipped; failed += s.failed;
  console.log(`  ${s.failed ? '✘' : '✔'} ${s.label.padEnd(36)} ghi ${s.written}, đã có ${s.skipped}, lỗi ${s.failed}`);
  if (s.firstError) console.log(`      lỗi đầu: ${s.firstError.code} ${s.firstError.message} (requestId ${s.firstError.requestId})`);
}
if (run.status !== 'done') console.error(`✘ Lần chạy ${runId}: ${run.status}${run.error ? ` — ${run.error}` : ''}`);
console.log(`Xong: ${written} ghi, ${skipped} đã có, ${failed} lỗi.`);
if (sample === '1' && run.status === 'done') console.log(`Mở ${api} → Sổ sách (bảng cân đối phát sinh), Kho, Công nợ để xem dữ liệu mẫu; tự chẩn đoán: ${api}/api/v1/system/diagnostics`);
process.exit(run.status === 'done' && !failed ? 0 : 1);
