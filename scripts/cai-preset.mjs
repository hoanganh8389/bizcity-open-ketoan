#!/usr/bin/env node
/**
 * Cài nhanh một preset theo ngành (bizcity_preset@1, docs/contracts/BIZCITY-PRESET-v1.md): cấu hình chế độ ghi sổ + dữ liệu mẫu
 * hư cấu (chi nhánh, đối tượng, mặt hàng, chứng từ). CHỈ đi qua HTTP API — chứng từ mẫu vào sổ qua đúng một cửa POST /documents,
 * được định khoản, kiểm, ghi bằng chứng như chứng từ thật. Chạy lại được: dữ liệu đã có thì bỏ qua, chứng từ cùng docKey → unchanged.
 *
 *   node scripts/cai-preset.mjs --list
 *   node scripts/cai-preset.mjs thuong-mai-ban-le --api http://localhost:8088 --tenant demo --email admin@ketoan.local --password '…'
 *   node scripts/cai-preset.mjs thuong-mai-ban-le --api http://localhost:8088 --token <JWT>
 *   … --no-sample   chỉ cấu hình, không nạp dữ liệu mẫu      … --dry-run   chỉ in việc sẽ làm
 * Mật khẩu có thể đặt ở biến BIZCITY_PASSWORD thay cho --password (không lưu vào lịch sử lệnh).
 */
import fs from 'node:fs';
import path from 'node:path';
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
  process.exit(args[0] && !args[0].startsWith('--') ? 0 : flag('--list') ? 0 : 1);
}

const id = args[0];
const dir = path.join(PRESETS, id);
if (!fs.existsSync(path.join(dir, 'preset.json'))) { console.error(`Không có preset ${id} (presets/${id}/preset.json)`); process.exit(1); }
const preset = JSON.parse(fs.readFileSync(path.join(dir, 'preset.json'), 'utf8'));
if (preset.contract !== 'bizcity_preset@1') { console.error(`presets/${id}/preset.json không phải bizcity_preset@1`); process.exit(1); }
if (preset.sample?.fictional !== true) { console.error('Dữ liệu mẫu phải khai fictional: true (repo công khai, R-SEC-10)'); process.exit(1); }
const api = (opt('--api', 'http://localhost:8088')).replace(/\/$/, '');
const dryRun = flag('--dry-run');
const withSample = !flag('--no-sample');
const readSample = (rel) => (rel ? JSON.parse(fs.readFileSync(path.join(dir, rel), 'utf8')) : []);

/** "@today", "@today-N" → ngày YYYY-MM-DD theo giờ máy chạy lệnh (chứng từ mẫu luôn rơi vào kỳ đang mở). */
const day = (n) => { const d = new Date(); d.setDate(d.getDate() - n); return d.toLocaleDateString('sv-SE'); };
const fillDates = (v) => typeof v === 'string' ? v.replace(/^@today(?:-(\d+))?$/, (_m, n) => day(Number(n ?? 0)))
  : Array.isArray(v) ? v.map(fillDates) : v && typeof v === 'object' ? Object.fromEntries(Object.entries(v).map(([k, x]) => [k, fillDates(x)])) : v;

let token = opt('--token');
async function http(method, url, body) {
  const res = await fetch(api + url, {
    method,
    headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}), ...(method === 'GET' ? {} : { 'idempotency-key': `preset-${id}-${Math.random().toString(36).slice(2, 14)}` }) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const json = await res.json().catch(() => ({}));
  return { status: res.status, json };
}
const fail = (what, r) => { console.error(`✘ ${what}: HTTP ${r.status} ${r.json?.error?.code ?? ''} ${r.json?.error?.message ?? ''} (requestId ${r.json?.error?.requestId ?? '—'})`); };

console.log(`Preset ${preset.id} ${preset.version} — ${preset.title}`);
console.log(`API ${api}${dryRun ? '  (chạy thử: không ghi gì)' : ''}`);

if (!token) {
  const tenantCode = opt('--tenant'); const email = opt('--email'); const password = opt('--password', process.env.BIZCITY_PASSWORD);
  if (!tenantCode || !email || !password) { console.error('Cần --token, hoặc --tenant + --email + --password (hoặc BIZCITY_PASSWORD).'); process.exit(1); }
  const r = await http('POST', '/api/v1/auth/login', { tenantCode, email, password });
  if (r.status !== 200) { fail('đăng nhập', r); process.exit(1); }
  token = r.json.data.token;
}

// 1. Năng lực Core + phân hệ
const cap = await http('GET', '/api/v1/system/capabilities');
if (cap.status !== 200) { fail('đọc /system/capabilities', cap); process.exit(1); }
const available = new Set(cap.json.data.capabilities.filter((c) => c.status === 'available').map((c) => c.id));
const missing = preset.requires.capabilities.filter((c) => !available.has(c));
if (missing.length) { console.error(`✘ Core chưa có năng lực: ${missing.join(', ')} — nâng cấp Core trước.`); process.exit(1); }
const off = preset.modules.filter((m) => !cap.json.data.enabledModules.includes(m));
console.log(`✔ Core ${cap.json.data.build.version}, Standard ${cap.json.data.standard.version}: đủ năng lực ${preset.requires.capabilities.join(', ')}`);
if (off.length) console.log(`! Phân hệ chưa bật: ${off.join(', ')} — đặt ENABLED_MODULES=${preset.modules.join(',')} trong .env rồi khởi động lại api`);
if (preset.postingPack) console.log(`ℹ Gói định khoản ${preset.postingPack.id}: xem trước / cài ở màn Cấu hình định khoản (cài gói tự động: PHASES 3, templates.posting)`);

const counts = { ok: 0, skipped: 0, failed: 0 };
const step = async (what, run) => {
  if (dryRun) { console.log(`  · ${what}`); return; }
  const r = await run();
  if (r === 'skip') { counts.skipped++; console.log(`  = ${what} (đã có)`); }
  else if (r.status >= 200 && r.status < 300) { counts.ok++; console.log(`  ✔ ${what}${r.json?.data?.status ? ` → ${r.json.data.status}` : ''}`); }
  else { counts.failed++; fail(what, r); }
};

// 2. Cấu hình
if (preset.settings?.postingModes) {
  console.log('Cấu hình:');
  await step('chế độ ghi sổ theo loại chứng từ', async () => {
    const cur = await http('GET', '/api/v1/settings/posting-modes');
    return http('PUT', '/api/v1/settings/posting-modes', { ...(cur.json.data ?? {}), ...preset.settings.postingModes });
  });
}

// 3. Dữ liệu mẫu
if (withSample) {
  console.log('Dữ liệu mẫu (hư cấu):');
  for (const b of readSample(preset.sample.branches)) {
    await step(`chi nhánh ${b.code}`, async () => { const r = await http('POST', '/api/v1/branches', b); return r.status === 409 ? 'skip' : r; });
  }
  for (const { code, ...p } of readSample(preset.sample.partners)) {
    await step(`đối tượng ${code}`, () => http('PUT', `/api/v1/partners/${encodeURIComponent(code)}`, p));
  }
  for (const { sku, ...p } of readSample(preset.sample.products)) {
    await step(`mặt hàng ${sku}`, async () => {
      const r = await http('PUT', `/api/v1/catalog/products/${encodeURIComponent(sku)}?new=true`, p);
      return r.status === 409 ? 'skip' : r;
    });
  }
  for (const d of readSample(preset.sample.documents).map(fillDates)) {
    await step(`chứng từ ${d.docType} ${d.docNo}`, () => http('POST', '/api/v1/documents', d));
  }
}

console.log(dryRun ? 'Chạy thử xong.' : `Xong: ${counts.ok} ghi, ${counts.skipped} đã có, ${counts.failed} lỗi.`);
if (!dryRun && withSample) console.log(`Mở ${api} → Sổ sách (bảng cân đối phát sinh), Kho, Công nợ để xem dữ liệu mẫu; tự chẩn đoán: ${api}/api/v1/system/diagnostics`);
process.exit(counts.failed ? 1 : 0);
