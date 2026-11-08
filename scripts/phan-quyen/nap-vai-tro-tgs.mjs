#!/usr/bin/env node
// [2026-11-07 11:30 AM Johnny Chu - Chu Hoàng Anh] PHASE-028 — W5 đợt 2 (ADR-0027 Phụ lục A, W5 đợt 2 mục 4): nạp 28 nhóm TGS thành vai trò của đơn vị BẢN NHÁP (vô hiệu) qua API — không ai có thêm quyền cho tới khi quản trị viên duyệt và bật ở HT12
/**
 * Mỗi nhóm trong docs/standard/phan-quyen/tgs-nhom.json → một vai trò của đơn vị:
 *   POST  /api/v1/roles                 mã tgs-…, nền viewer, loại job
 *   POST  /api/v1/roles/:id/rules       luật Cho = `derived` trừ quyền vai trò nền đã có (chỉ quyền có thật trong sổ quyền)
 *   PATCH /api/v1/roles/:id             is_active = false ("bản nháp TGS — chờ duyệt", D-AUTH-08)
 * Chỉ qua HTTP API (như STD-PRE-3): không SQL. Chạy lại không tạo trùng — mã vai trò đã có thì bỏ qua.
 * Quyền rủi ro cao đòi nhập lại mật khẩu của người chạy (biến BIZCITY_PASSWORD hoặc --password).
 *
 *   node scripts/phan-quyen/nap-vai-tro-tgs.mjs --api http://localhost:8088 --tenant <mã> --email <email> [--password <mk>]
 *   node scripts/phan-quyen/nap-vai-tro-tgs.mjs --api … --token <JWT> --password <mk>
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
export const GROUPS_FILE = 'docs/standard/phan-quyen/tgs-nhom.json';
const REASON = 'Nạp vai trò mẫu từ bảng phân quyền TGS (bản nháp, chờ duyệt — D-AUTH-08)';

/**
 * Nạp vai trò. `request(method, url, body)` trả `{ status, body }` (body là JSON của API: { data, error }). Không ném khi một vai trò lỗi:
 * ghi vào `failed` và đi tiếp. Trả tóm tắt.
 */
export async function seedTgsRoles(request, groups, opts = {}) {
  const out = { created: [], skipped: [], failed: [] };
  const roles = await request('GET', '/api/v1/roles');
  if (roles.status !== 200) throw new Error(`GET /api/v1/roles → ${roles.status}: ${JSON.stringify(roles.body?.error ?? roles.body)}`);
  const existing = new Set((roles.body.data ?? []).map((r) => r.code));
  const matrix = await request('GET', '/api/v1/roles/matrix');
  const baseHas = new Set(matrix.status === 200 ? matrix.body.data.cells['system:viewer']?.allow ?? [] : []);
  for (const g of groups) {
    if (existing.has(g.code)) { out.skipped.push(g.code); continue; }
    const label = `${g.label} (TGS · bản nháp)`.slice(0, 120);
    const c = await request('POST', '/api/v1/roles', { code: g.code, label, kind: 'job', baseRole: g.baseRole ?? 'viewer', reason: REASON });
    if (c.status !== 201) { out.failed.push({ code: g.code, step: 'create', status: c.status, error: c.body?.error?.message }); continue; }
    const { id } = c.body.data;
    let ok = true;
    for (const permission of g.derived.filter((p) => !baseHas.has(p))) {
      const r = await request('POST', `/api/v1/roles/${id}/rules`, { permission, effect: 'allow', note: 'TGS', reason: REASON, ...(opts.confirmPassword ? { confirmPassword: opts.confirmPassword } : {}) });
      if (r.status !== 201) { out.failed.push({ code: g.code, step: `rule ${permission}`, status: r.status, error: r.body?.error?.message }); ok = false; }
    }
    // Vô hiệu ngay sau khi dựng xong luật (luật chỉ thêm được khi vai trò đang bật): bản nháp không cấp gì.
    const detail = await request('GET', `/api/v1/roles/${id}`);
    const off = await request('PATCH', `/api/v1/roles/${id}`, { isActive: false, version: detail.body.data.version, reason: REASON });
    if (off.status !== 200) { out.failed.push({ code: g.code, step: 'deactivate', status: off.status, error: off.body?.error?.message }); continue; }
    if (ok) out.created.push(g.code);
  }
  return out;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const argv = process.argv.slice(2);
  const opt = (k, d) => { const i = argv.indexOf(k); return i >= 0 ? argv[i + 1] : d; };
  const api = (opt('--api') ?? '').replace(/\/$/, '');
  if (!api) { console.error('Dùng: node scripts/phan-quyen/nap-vai-tro-tgs.mjs --api <địa chỉ> (--token <JWT> | --tenant <mã> --email <email>) [--password <mk>]'); process.exit(1); }
  const password = opt('--password', process.env.BIZCITY_PASSWORD);
  let token = opt('--token');
  const request = async (method, url, body) => {
    const res = await fetch(api + url, {
      method, body: body === undefined ? undefined : JSON.stringify(body),
      headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}), ...(method === 'GET' ? {} : { 'idempotency-key': `tgs-${Math.random().toString(36).slice(2, 14)}` }) },
    });
    return { status: res.status, body: await res.json().catch(() => null) };
  };
  if (!token) {
    const tenantCode = opt('--tenant'); const email = opt('--email');
    if (!tenantCode || !email || !password) { console.error('Cần --token, hoặc --tenant + --email + --password (hoặc BIZCITY_PASSWORD).'); process.exit(1); }
    const r = await request('POST', '/api/v1/auth/login', { tenantCode, email, password });
    if (r.status !== 200) { console.error('Đăng nhập không được:', r.body?.error?.message ?? r.status); process.exit(1); }
    token = r.body.data.token;
  }
  const groups = JSON.parse(fs.readFileSync(path.join(ROOT, GROUPS_FILE), 'utf8')).items;
  const res = await seedTgsRoles(request, groups, { confirmPassword: password });
  console.log(`✔ tạo ${res.created.length} vai trò bản nháp (vô hiệu) · bỏ qua ${res.skipped.length} (đã có)`);
  for (const f of res.failed) console.log(`✘ ${f.code} · ${f.step} · ${f.status} · ${f.error ?? ''}`);
  console.log('Vai trò bản nháp không cấp quyền gì cho tới khi quản trị viên xem ở HT12 (Phân quyền → Vai trò) và bật.');
  process.exit(res.failed.length ? 1 : 0);
}
