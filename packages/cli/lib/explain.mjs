// [2026-11-03 02:05 PM Johnny Chu - Chu Hoàng Anh] G3-01 — `bizcity explain <MÃ>`: một mã → vì sao, sửa ở đâu, ai sửa, theo vai dev / KTT / KS / TT
/**
 * GIẢI THÍCH MỘT MÃ (skill explain-accounting-error). Tra theo thứ tự, mỗi nguồn là danh mục gốc của repo:
 *   1. FINDINGS_LIBRARY (IN-*, ACC-*, PART-*) + INTAKE_REMEDIES (bước sửa, việc cấm, ai sửa, kiểm lại)
 *   2. ERROR_CATALOG (mã lỗi API), ERROR_REASONS (details.reason), MCP_ERROR_CATALOG
 *   3. FAULT_CATALOG (F22-*): ca nào có mã này trong "Phát hiện" → hậu quả + phương án theo vai
 *   4. diag-codes.json (DG-* ↔ mã tự chẩn đoán)
 *   5. máy chủ đang chạy: GET /api/v1/findings/:code (khi không có bản dựng)
 * Không có ở nguồn nào → known=false. Không đoán nghĩa mã, không tự nghĩ tài khoản hay luật thuế.
 */
import { loadContracts, loadDiagCodes, loadFaults, BUILD_HINT } from './sources.mjs';

export const ROLES = {
  dev: 'Dev / hệ thống gửi',
  chief_accountant: 'Kế toán trưởng',
  auditor: 'Kiểm soát nội bộ',
  tax_inspector: 'Thanh tra thuế (tự rà trước)',
};
const OWNER_LABEL = { creator: 'người lập / hệ thống gửi', accountant: 'kế toán viên', chief_accountant: 'kế toán trưởng', owner: 'chủ đơn vị', operator: 'vận hành', core_team: 'nhóm Lõi' };
const LEVEL_OF_CATEGORY = { input: 'block', auth: 'block', state: 'block', ledger: 'block', platform: 'warn', server: 'error' };

export async function explainCode(raw, { server, key, fetchImpl = globalThis.fetch } = {}) {
  const code = String(raw ?? '').trim().toUpperCase();
  const r = { code, known: false, kinds: [], level: null, title: null, why: null, fix: null, steps: [], forbid: [], owner: null, verify: null,
    rule: null, learn: null, http: null, retryable: null, stopTheLine: false, faults: [], diag: [], sources: [], missing: [] };
  if (!code) return r;
  const hit = (kind, source) => { r.known = true; if (!r.kinds.includes(kind)) r.kinds.push(kind); if (!r.sources.includes(source)) r.sources.push(source); };

  const c = await loadContracts();
  if (c.mod) {
    const f = c.mod.explainFinding?.(code);
    if (f) {
      hit(f.gate === 'B' ? 'intake' : 'catalog', 'FINDINGS_LIBRARY');
      Object.assign(r, { level: f.level, title: f.title, why: f.why, fix: f.fix || null, rule: f.rule, learn: f.learn, status: f.status, step: f.step });
    }
    const rem = c.mod.INTAKE_REMEDIES?.[code];
    if (rem) {
      r.steps = rem.steps.map((s) => ({ text: s.text, role: s.role ?? rem.owner, screen: s.screen ? `${s.screen.code} ${s.screen.path}` : null }));
      r.forbid = rem.forbid ?? [];
      r.owner = rem.owner;
      r.verify = rem.verify?.code ?? rem.verify?.screen?.code ?? null;
      r.stopTheLine = rem.stopTheLine === true;
    }
    const e = c.mod.ERROR_CATALOG?.[code];
    if (e) {
      hit('api', 'ERROR_CATALOG');
      r.title ??= e.message;
      r.fix ??= e.hint;
      r.level ??= LEVEL_OF_CATEGORY[e.category] ?? 'block';
      Object.assign(r, { http: e.http, retryable: e.retryable, category: e.category, errorOwner: e.owner });
    }
    const reason = c.mod.ERROR_REASONS?.[code];
    if (reason) { hit('reason', 'ERROR_REASONS'); r.title ??= reason; }
    const mcp = c.mod.MCP_ERROR_CATALOG?.[code];
    if (mcp) { hit('mcp', 'MCP_ERROR_CATALOG'); r.title ??= mcp.message; r.fix ??= mcp.hint; r.retryable ??= mcp.retryable; }
  } else {
    r.missing.push(`${c.missing} (${BUILD_HINT})`);
  }

  const d = loadDiagCodes();
  const appCodes = new Set([code]);
  if (d.codes) {
    if (d.codes[code]) { hit('diag', 'diag-codes.json'); r.diag.push({ dg: code, app: d.codes[code] }); appCodes.add(d.codes[code]); }
    for (const [dg, app] of Object.entries(d.codes)) if (app === code) { hit('diag', 'diag-codes.json'); r.diag.push({ dg, app }); }
  }

  const fc = await loadFaults();
  if (fc.catalog) {
    for (const k of fc.catalog.cases) {
      if (k.id === code || k.detectors.some((x) => appCodes.has(x))) {
        hit(k.id === code ? 'fault' : 'fault-detector', 'FAULT_CATALOG');
        r.faults.push({ id: k.id, title: k.title, level: k.level, personas: k.personas, primary: k.primary, consequence: k.consequence,
          remedy: k.remedyText, verify: k.verifyText, status: k.status });
        if (k.id === code) { r.title ??= k.title; r.level ??= k.level; r.fix ??= k.remedyText; r.why ??= k.consequence; }
      }
    }
    // Mã tự chẩn đoán (COGS_STALE, INVENTORY_NEGATIVE…) chỉ có nghĩa qua ca F22 phát hiện nó: lấy tiêu đề + hậu quả của ca
    if (!r.title && r.faults.length) {
      r.title = r.faults.map((f) => f.title).join(' · ');
      r.why ??= r.faults.map((f) => f.consequence).join(' · ');
    }
  } else r.missing.push(fc.missing);

  if (!r.sources.includes('FINDINGS_LIBRARY') && server && key && /^(IN|ACC|PART|ITEM)-/.test(code)) {
    try {
      const res = await fetchImpl(`${server.replace(/\/$/, '')}/api/v1/findings/${encodeURIComponent(code)}`, { headers: { 'X-Api-Key': key } });
      const body = await res.json().catch(() => null);
      const f = body?.data?.code ? body.data : body?.data?.item;
      if (res.ok && f) {
        hit(f.gate === 'B' ? 'intake' : 'catalog', 'GET /api/v1/findings/:code');
        Object.assign(r, { level: r.level ?? f.level, title: r.title ?? f.title, why: r.why ?? f.why, fix: r.fix ?? (f.fix || null), rule: r.rule ?? f.rule, learn: r.learn ?? f.learn });
      }
    } catch (err) {
      r.missing.push(`máy chủ không trả lời: ${err.message}`);
    }
  }
  return r;
}

/** Việc của từng vai với mã này (bốn góc nhìn). */
export function viewsOf(r) {
  const devLines = [];
  if (r.fix) devLines.push(r.fix);
  for (const s of r.steps) if (!s.role || s.role === 'creator') devLines.push(s.text);
  if (r.retryable === false) devLines.push('Không tự thử lại: lỗi không tự hết. Hiện mã + thông báo cho người dùng, giữ chứng từ ở hệ thống gửi.');
  if (r.retryable === true) devLines.push('Được thử lại có giãn nhịp, giữ nguyên Idempotency-Key và docKey + version.');
  for (const f of r.forbid) devLines.push(`CẤM: ${f}`);
  const views = { dev: [...new Set(devLines)] };
  for (const role of ['chief_accountant', 'auditor', 'tax_inspector']) {
    const own = r.steps.filter((s) => s.role === role || (role === 'chief_accountant' && s.role === 'accountant')).map((s) => s.text + (s.screen ? ` (${s.screen})` : ''));
    const cases = r.faults.filter((f) => f.personas.includes(role)).map((f) =>
      `${f.id}${f.primary.includes(role) ? ' ★' : ''}: ${f.consequence} → ${f.remedy} · kiểm lại: ${f.verify}`);
    views[role] = [...own, ...cases];
  }
  return views;
}

export function formatExplain(r, { role } = {}) {
  const L = [];
  if (!r.known) {
    L.push(`✘ ${r.code || '(trống)'}: không có trong danh mục nào (FINDINGS_LIBRARY, ERROR_CATALOG, ERROR_REASONS, F22, DG).`);
    L.push('  Không đoán nghĩa. Kiểm lại chính tả mã, hoặc đọc error.details của phản hồi gốc.');
    for (const m of r.missing) L.push(`  SKIP nguồn: ${m}`);
    return L.join('\n');
  }
  L.push(`${r.code} · ${r.kinds.join(', ')}${r.level ? ` · mức ${r.level}` : ''}${r.http ? ` · HTTP ${r.http}` : ''}`);
  if (r.title) L.push(`  Nghĩa:     ${r.title}`);
  if (r.why) L.push(`  Vì sao:    ${r.why}`);
  if (r.owner) L.push(`  Ai sửa:    ${OWNER_LABEL[r.owner] ?? r.owner}`);
  if (r.stopTheLine) L.push('  ⛔ DỪNG GHI SỔ: báo nhóm Lõi kèm requestId trước mọi việc khác.');
  const views = viewsOf(r);
  for (const [k, label] of Object.entries(ROLES)) {
    if (role && role !== k) continue;
    if (!views[k]?.length) continue;
    L.push(`  ── ${label}`);
    for (const line of views[k]) L.push(`     • ${line}`);
  }
  if (r.verify) L.push(`  Kiểm lại:  chạy lại để không còn ${r.verify}`);
  if (r.diag.length) L.push(`  Tự chẩn đoán: ${r.diag.map((x) => `${x.dg} ↔ ${x.app}`).join(', ')}`);
  if (r.rule) L.push(`  Luật gốc:  ${r.rule}`);
  if (r.learn) L.push(`  Học thêm:  ${r.learn}`);
  L.push(`  Nguồn:     ${r.sources.join(', ')}`);
  for (const m of r.missing) L.push(`  SKIP nguồn: ${m}`);
  return L.join('\n');
}
