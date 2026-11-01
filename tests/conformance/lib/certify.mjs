// [2026-11-02 12:10 AM Johnny Chu - Chu Hoàng Anh] PHASE-020 — chế độ --certify: một lệnh kiểm tương thích + bảo mật (lane tĩnh), bất biến kế toán (lane diagnostics), tuân thủ VN theo rulepack đã công bố, chọn theo phiên bản + ngày hiệu lực (R-VNC-4); báo cáo bizcity_vn_conformance_report@1 + JUnit + chứng chỉ (VNCONF-003 W1a).
// [2026-11-02 01:40 AM Johnny Chu - Chu Hoàng Anh] PHASE-020 — evaluate() chỉ gồm lớp Module + Cấu hình khi chứng nhận; lớp Doanh nghiệp ra NOT_APPLICABLE có lý do (đánh giá trên bản cài theo đơn vị).
// [2026-11-02 01:30 AM Johnny Chu - Chu Hoàng Anh] PHASE-020 — lớp enterprise (ADR-0012): check mức info có phát hiện (warn) là ca KHÔNG đạt — ở lớp này phát hiện chính là tình trạng doanh nghiệp
/**
 * CHỨNG NHẬN (certify) — thuần dữ liệu, không ghi gì, không mở CSDL. selfcheck.mjs gọi sau khi đã có kết quả hai lane.
 *
 *   loadKit(core)                      đọc registry / catalog / rulepack / ca ở tests/conformance/vietnam/
 *   resolve(kit, profile)              bốn bước chọn rulepack (R-VNC-4): hồ sơ đơn vị → chế độ → ngày hiệu lực thuế / hoá đơn → đúng một bản approved
 *   evaluate({ kit, profile, evidence })  trạng thái 6 mức cho từng ca từ bằng chứng (check SC-* / DG-*, test vitest), fail closed
 *   buildReport(...)                   bizcity_vn_conformance_report@1
 *   renderJUnit(report) · renderCertificate(...)
 *
 * Nguyên tắc: thiếu căn cứ / mơ hồ / rulepack chưa approved / duyệt hết hạn ⇒ REVIEW_REQUIRED; không bằng chứng ⇒ NOT_TESTED;
 * REVIEW_REQUIRED và NOT_TESTED không bao giờ là PASS (R-VNC-3, R-VNC-8).
 */
import path from 'node:path';

export const VN_DIR = 'tests/conformance/vietnam';
export const PROFILE_DEFAULT = `${VN_DIR}/profiles/default.json`;
export const REPORT_SCHEMA = `${VN_DIR}/schemas/report.schema.json`;
export const PROFILE_SCHEMA = `${VN_DIR}/schemas/profile.schema.json`;
/** Nguồn pháp lý đã rà quá số ngày này tính là duyệt hết hạn (LEGAL-SOURCE-REGISTRY §2: 6 tháng rà lại, 12 tháng hết hạn). */
export const REVIEW_VALID_DAYS = 365;
const TAX_DOMAINS = new Set(['tax', 'invoice', 'tax_admin', 'payroll']);
const OK = new Set(['pass', 'debt', 'warn']);
const DISCLAIMER = 'Kết quả chỉ có giá trị trong phạm vi, ngày, phiên bản phần mềm, phiên bản rulepack và bộ test đã thực thi. Không phải chứng nhận của Bộ Tài chính hay cơ quan Thuế; không phải ý kiến pháp lý.';

/* ───────────── đọc kho ───────────── */

export function loadKit(core) {
  const registry = core.exists(`${VN_DIR}/registry/legal-sources.json`) ? core.json(`${VN_DIR}/registry/legal-sources.json`) : { sources: [] };
  const catalog = core.exists(`${VN_DIR}/catalog.json`) ? core.json(`${VN_DIR}/catalog.json`) : { items: [] };
  const rulepacks = core.files({ under: [`${VN_DIR}/rulepacks`], match: /\/rulepack\.json$/ }).map((file) => {
    const dir = path.posix.dirname(file);
    const pack = core.json(file);
    const cases = (pack.cases ?? []).map((rel) => {
      const f = path.posix.join(dir, rel);
      return core.exists(f) ? { ...core.json(f), _file: f } : { id: `${pack.id}:${rel}`, _file: f, _missing: true };
    });
    return { ...pack, _dir: dir, _file: file, _cases: cases };
  });
  return { registry, catalog, rulepacks, sources: new Map((registry.sources ?? []).map((s) => [s.id, s])) };
}

/* ───────────── ngày tháng (chuỗi YYYY-MM-DD, không múi giờ) ───────────── */

export const today = () => new Date().toISOString().slice(0, 10);
const isDate = (s) => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s);
export function addDays(d, n) { const t = new Date(`${d}T00:00:00Z`); t.setUTCDate(t.getUTCDate() + n); return t.toISOString().slice(0, 10); }

/** Ngày bắt đầu năm tài chính chứa asOf, với fiscal_year_start = 'MM-DD'. */
export function fiscalYearStart(mmdd, asOf) {
  const y = Number(asOf.slice(0, 4));
  const sameYear = `${y}-${mmdd}`;
  return sameYear <= asOf ? sameYear : `${y - 1}-${mmdd}`;
}

/* ───────────── áp dụng ───────────── */

/**
 * Một phạm vi (applies_to của rulepack hoặc ca) có áp cho hồ sơ không. Trả { applies, reason }.
 * Miền thuế / hoá đơn / quản lý thuế: chọn theo NGÀY GIAO DỊCH (as_of), không theo chế độ kế toán (R-VNC-4 bước 3).
 * Miền kế toán: theo chế độ + năm tài chính bắt đầu (bước 2).
 */
export function applies(app, { profile, fyStart, domain, regime }) {
  if (!app) return { applies: true, reason: null };
  const et = app.entity_types ?? ['any'];
  if (!et.includes('any') && !et.includes(profile.entity_type)) return { applies: false, reason: `loại pháp nhân ${profile.entity_type} ngoài ${et.join(', ')}` };
  if (TAX_DOMAINS.has(domain)) {
    if (app.transaction_date_from && profile.as_of < app.transaction_date_from) return { applies: false, reason: `ngày ${profile.as_of} trước hiệu lực ${app.transaction_date_from}` };
    if (app.transaction_date_to && profile.as_of > app.transaction_date_to) return { applies: false, reason: `ngày ${profile.as_of} sau hết hạn ${app.transaction_date_to}` };
    return { applies: true, reason: null };
  }
  if (regime && regime !== 'neutral') {
    if (profile.accounting_regime === 'unknown') return { applies: null, reason: 'hồ sơ đơn vị chưa khai chế độ kế toán — không chọn được rulepack theo chế độ' };
    if (regime !== profile.accounting_regime) return { applies: false, reason: `chế độ ${regime} khác hồ sơ ${profile.accounting_regime}` };
  }
  if (app.fiscal_year_start_from && fyStart < app.fiscal_year_start_from) return { applies: false, reason: `năm tài chính bắt đầu ${fyStart} trước ${app.fiscal_year_start_from} — chưa áp (không tự chuyển giữa năm)` };
  if (app.transaction_date_from && profile.as_of < app.transaction_date_from) return { applies: false, reason: `ngày ${profile.as_of} trước ${app.transaction_date_from}` };
  if (app.transaction_date_to && profile.as_of > app.transaction_date_to) return { applies: false, reason: `ngày ${profile.as_of} sau ${app.transaction_date_to}` };
  return { applies: true, reason: null };
}

/* ───────────── bốn bước chọn rulepack (R-VNC-4) ───────────── */

/**
 * Trả cho mỗi rulepack: { pack, applies: true|false|null, reason, selected, blocked } — blocked là lý do REVIEW_REQUIRED:
 * chưa approved · nhiều bản approved cùng catalog · nguồn pháp lý chưa rà / rà quá hạn · thiếu nguồn.
 */
export function resolve(kit, profile) {
  const fyStart = fiscalYearStart(profile.fiscal_year_start, profile.as_of);
  const rows = kit.rulepacks.map((pack) => {
    const a = applies(pack.applies_to, { profile, fyStart, domain: pack.domain, regime: pack.regime });
    const row = { pack, applies: a.applies, reason: a.reason, selected: false, blocked: null };
    if (a.applies === null) row.blocked = a.reason;
    if (a.applies === false) return row;
    if (pack.status === 'deprecated') { row.applies = false; row.reason = 'rulepack đã deprecated'; return row; }
    if (pack.status !== 'approved') row.blocked ??= `rulepack ${pack.id}@${pack.version} còn ${pack.status} — chưa được chuyên gia duyệt`;
    for (const b of pack.legal_basis ?? []) {
      const src = kit.sources.get(b.source_id);
      if (!src) { row.blocked ??= `căn cứ ${b.source_id} không có trong kho nguồn pháp lý`; break; }
      if (src.review?.status !== 'reviewed') { row.blocked ??= `nguồn ${b.source_id} chưa rà (${src.review?.status ?? '?'})`; break; }
      if (!src.review.reviewed_at || addDays(src.review.reviewed_at, REVIEW_VALID_DAYS) < profile.as_of) { row.blocked ??= `nguồn ${b.source_id} rà ngày ${src.review.reviewed_at ?? '?'} đã quá ${REVIEW_VALID_DAYS} ngày so với ${profile.as_of} — duyệt hết hạn`; break; }
    }
    return row;
  });
  // Bước 4: đúng MỘT bản approved cho mỗi catalog_id trong các bản áp dụng.
  const byCatalog = new Map();
  for (const r of rows) if (r.applies && !r.blocked) byCatalog.set(r.pack.catalog_id, [...(byCatalog.get(r.pack.catalog_id) ?? []), r]);
  for (const [cid, list] of byCatalog) {
    if (list.length === 1) list[0].selected = true;
    else for (const r of list) r.blocked = `${list.length} rulepack approved cùng áp cho ${cid} (${list.map((x) => `${x.pack.id}@${x.pack.version}`).join(', ')}) — chọn không tất định`;
  }
  return { fyStart, rows };
}

/* ───────────── đánh giá ca ───────────── */

/** Một bằng chứng: trả 'ok' | 'bad' | 'error' | 'unknown' kèm chữ. */
function evidenceOf(ref, ev, layer) {
  if (ref.endsWith('.test.ts')) {
    if (!ev.runtime) return ['unknown', `${ref}: lane runtime chưa chạy (--runtime)`];
    const s = ev.tests.get(ref);
    if (s === 'pass') return ['ok', `${ref}: vitest đạt`];
    if (s === 'fail') return ['bad', `${ref}: vitest KHÔNG đạt`];
    if (s === 'error') return ['error', `${ref}: vitest lỗi khi chạy`];
    return ['unknown', `${ref}: không có kết quả vitest`];
  }
  const s = ev.checks.get(ref);
  if (!s) return ['unknown', `${ref}: check không chạy trong lượt này`];
  if (s === 'warn' && layer === 'enterprise') return ['bad', `${ref}: có phát hiện (lớp Doanh nghiệp)`];
  if (OK.has(s)) return ['ok', `${ref}: ${s}`];
  if (s === 'fail') return ['bad', `${ref}: fail`];
  if (s === 'error') return ['error', `${ref}: error`];
  if (s === 'skip') return ['unknown', `${ref}: bỏ qua (${ref.startsWith('DG-') ? 'chưa chỉ CSDL' : 'skip'})`];
  return ['unknown', `${ref}: ${s}`];
}

/**
 * evidence = { checks: Map(id → status), tests: Map(file → pass|fail|error), runtime: bool }
 * Trả { fyStart, resolution, cases: [{ id, version, priority, status, reason, evidence, legal_basis_ids, rulepack, technical }] }.
 * `technical` = kết luận kỹ thuật thuần (PASS/FAIL/ERROR/NOT_TESTED) bất kể trạng thái duyệt — để người đọc thấy "kỹ thuật đạt, pháp lý chưa".
 */
export function evaluate({ kit, profile, evidence, layers = ['module', 'configuration'] }) {
  const resolution = resolve(kit, profile);
  const cases = [];
  for (const row of resolution.rows) {
    const { pack } = row;
    for (const k of pack._cases ?? []) {
      const base = { id: k.id, version: k.version ?? '0.0.0', priority: k.priority ?? pack.priority, rulepack: pack.id, legal_basis_ids: (k.legal_basis?.length ? k.legal_basis : pack.legal_basis ?? []).map((b) => b.source_id), evidence: [] };
      // Chứng nhận module / Kernel chỉ gồm lớp Module + Cấu hình. Lớp Doanh nghiệp đánh giá dữ liệu MỘT đơn vị trên bản cài
      // (Hệ thống → Kiểm chuẩn, ADR-0012) — dữ liệu của CSDL test không nói gì về chất lượng module.
      if (pack.layer && !layers.includes(pack.layer)) { cases.push({ ...base, status: 'NOT_APPLICABLE', reason: `lớp ${pack.layer} đánh giá dữ liệu một đơn vị trên bản cài (Hệ thống → Kiểm chuẩn), không thuộc lượt chứng nhận này`, technical: 'NOT_TESTED' }); continue; }
      if (k._missing) { cases.push({ ...base, status: 'ERROR', reason: `tệp ca ${k._file} không có`, technical: 'ERROR' }); continue; }
      if (k.status === 'deprecated') { cases.push({ ...base, status: 'NOT_APPLICABLE', reason: 'ca đã deprecated', technical: 'NOT_TESTED' }); continue; }
      if (row.applies === false) { cases.push({ ...base, status: 'NOT_APPLICABLE', reason: `rulepack không áp: ${row.reason}`, technical: 'NOT_TESTED' }); continue; }
      const ca = applies(k.applies_to, { profile, fyStart: resolution.fyStart, domain: pack.domain, regime: pack.regime });
      if (ca.applies === false) { cases.push({ ...base, status: 'NOT_APPLICABLE', reason: `ca không áp: ${ca.reason}`, technical: 'NOT_TESTED' }); continue; }

      // Kỹ thuật: gom bằng chứng.
      const refs = k.scenario?.verified_by ?? [];
      const lines = [];
      let technical;
      if (!refs.length) technical = k.scenario?.expected_fixture ? 'NOT_TESTED' : 'NOT_TESTED';
      const states = refs.map((r) => { const [s, t] = evidenceOf(r, evidence, pack.layer); lines.push(t); return s; });
      if (refs.length) technical = states.includes('error') ? 'ERROR' : states.includes('bad') ? 'FAIL' : states.includes('unknown') ? 'NOT_TESTED' : 'PASS';
      if (k.scenario?.expected_fixture && refs.length === 0) lines.push(`${k.scenario.expected_fixture}: runner fixture chưa có (VNCONF-003)`);
      if (!refs.length) lines.push('verified_by rỗng — không có bằng chứng' + (k.scenario?.gap ? `; khoảng trống: ${k.scenario.gap}` : ''));

      // Pháp lý: fail closed.
      let status, reason;
      const blocked = row.blocked ?? ca.reason;
      if (blocked || k.status !== 'approved') {
        status = technical === 'FAIL' || technical === 'ERROR' ? technical : 'REVIEW_REQUIRED';
        reason = blocked ?? `ca còn ${k.status} — chưa được duyệt`;
        if (status === 'REVIEW_REQUIRED') reason += ` · kỹ thuật: ${technical}`;
      } else {
        status = technical;
        reason = status === 'PASS' ? '' : status === 'NOT_TESTED' ? (k.scenario?.gap ?? 'không có bằng chứng đủ') : lines.filter((l) => /KHÔNG|fail|error|lỗi/i.test(l)).join('; ');
      }
      cases.push({ ...base, status, reason, technical, evidence: lines, evaluated_at: profile.as_of });
    }
  }
  return { fyStart: resolution.fyStart, resolution, cases };
}

/** Kết quả chung của báo cáo từ danh sách ca (R-VNC-8). */
export function overall(cases) {
  const p0 = cases.filter((c) => c.priority === 'P0');
  if (p0.some((c) => c.status === 'FAIL' || c.status === 'ERROR')) return 'FAIL';
  if (p0.every((c) => c.status === 'PASS' || c.status === 'NOT_APPLICABLE') && p0.some((c) => c.status === 'PASS')) return 'PASS';
  return 'REVIEW_REQUIRED';
}

export function buildReport({ kit, profile, evaluation, run, target, exclusions = [] }) {
  const result = overall(evaluation.cases);
  const scope = profile.scope?.length ? profile.scope : [...new Set(kit.rulepacks.map((p) => p.catalog_id))].sort();
  const known = [
    ...(kit.catalog.items ?? []).filter((i) => i.status === 'planned').map((i) => ({ scope: i.id, reason: `rulepack ${i.rulepack} chưa có (${i.ticket ?? 'chưa có ticket'})` })),
    ...exclusions,
  ];
  const approved = kit.rulepacks.filter((p) => p.status === 'approved').length;
  return {
    contract: 'bizcity_vn_conformance_report@1',
    run_id: run.runId,
    executed_at: run.at,
    git_sha: run.gitSha,
    runtime: { os: process.platform, node: process.version, postgres: run.db ?? null },
    target,
    tenant_profile: { jurisdiction: 'VN', accounting_regime: profile.accounting_regime, fiscal_year_start: profile.fiscal_year_start, entity_type: profile.entity_type, simulated: true },
    scope,
    rulepacks: kit.rulepacks.map((p) => ({ id: p.id, version: p.version, status: p.status, rules_hash: p.release?.rules_hash ?? null })),
    cases: evaluation.cases.map(({ technical, rulepack, ...c }) => c),
    known_exclusions: known,
    reviewer_status: approved ? `${approved}/${kit.rulepacks.length} rulepack approved` : 'Chưa rulepack nào được chuyên gia kế toán / thuế duyệt',
    result,
    label: result === 'PASS' ? `Passed Bizcity VN Conformance [${scope.join(',')}/${kit.rulepacks.map((p) => `${p.id}@${p.version}`).join(',')}/${profile.as_of}]` : result === 'FAIL' ? 'Not passed' : 'Review required',
    disclaimer: DISCLAIMER,
  };
}

/* ───────────── xuất ───────────── */

const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');

export function renderJUnit(report, evaluation) {
  const byPack = new Map();
  for (const c of evaluation.cases) byPack.set(c.rulepack, [...(byPack.get(c.rulepack) ?? []), c]);
  const suites = [...byPack].map(([pack, cs]) => {
    const tests = cs.map((c) => {
      const body = c.status === 'FAIL' ? `<failure message="${esc(c.reason)}"/>` : c.status === 'ERROR' ? `<error message="${esc(c.reason)}"/>` : c.status === 'PASS' ? '' : `<skipped message="${esc(`${c.status}: ${c.reason}`)}"/>`;
      return `    <testcase classname="${esc(pack)}" name="${esc(c.id)}">${body}</testcase>`;
    });
    return `  <testsuite name="${esc(pack)}" tests="${cs.length}" failures="${cs.filter((c) => c.status === 'FAIL').length}" errors="${cs.filter((c) => c.status === 'ERROR').length}" skipped="${cs.filter((c) => !['PASS', 'FAIL', 'ERROR'].includes(c.status)).length}">\n${tests.join('\n')}\n  </testsuite>`;
  });
  return `<?xml version="1.0" encoding="UTF-8"?>\n<testsuites name="bizcity-vn-conformance ${esc(report.run_id)}" result="${report.result}">\n${suites.join('\n')}\n</testsuites>\n`;
}

const ICON = { PASS: '✔', FAIL: '✘', ERROR: '!', NOT_APPLICABLE: '–', NOT_TESTED: '○', REVIEW_REQUIRED: '◔' };

/** Chứng chỉ cho người đọc: ba cổng + bảng ca. tier = certified | compatible | fail. */
export function renderCertificate({ report, evaluation, tier, gates, profile }) {
  const counts = Object.fromEntries(Object.keys(ICON).map((s) => [s, evaluation.cases.filter((c) => c.status === s).length]));
  const L = [];
  L.push(`# Chứng nhận Bizcity Conformance — ${report.target.package}@${report.target.version}`);
  L.push('');
  L.push(`> **Kết luận:** ${tier === 'certified' ? '🟢 **CERTIFIED** — tương thích kỹ thuật và ' + report.label : tier === 'compatible' ? '🟡 **COMPATIBLE** — tương thích kỹ thuật; tuân thủ VN: *' + report.label + '* (chưa chứng nhận pháp lý)' : '🔴 **FAIL** — chưa được công nhận tương thích'}`);
  L.push(`> Lần chạy \`${report.run_id}\` · ${report.executed_at} · commit \`${report.git_sha.slice(0, 7)}\` · Node ${report.runtime.node} · CSDL: ${report.runtime.postgres ?? 'không'}`);
  L.push(`> Hồ sơ đơn vị giả lập: ${profile.accounting_regime} · năm tài chính bắt đầu ${profile.fiscal_year_start} (năm hiện tại từ ${evaluation.fyStart}) · ${profile.entity_type} · ngày đánh giá ${profile.as_of}`);
  L.push('');
  L.push('## Ba cổng');
  L.push('');
  L.push('| Cổng | Kiểm | Kết quả |');
  L.push('|---|---|---|');
  for (const g of gates) L.push(`| ${g.name} | ${g.what} | ${g.ok ? '✔ ĐẠT' : g.skipped ? '· bỏ qua — ' + g.skipped : '✘ KHÔNG ĐẠT'}${g.detail ? ' — ' + g.detail : ''} |`);
  L.push('');
  L.push(`## Tuân thủ Việt Nam — ${report.result} (${counts.PASS} PASS · ${counts.FAIL} FAIL · ${counts.ERROR} ERROR · ${counts.REVIEW_REQUIRED} REVIEW_REQUIRED · ${counts.NOT_TESTED} NOT_TESTED · ${counts.NOT_APPLICABLE} N/A)`);
  L.push('');
  L.push(`Rulepack: ${report.rulepacks.map((p) => `\`${p.id}@${p.version}\` (${p.status})`).join(' · ')} — ${report.reviewer_status}.`);
  L.push('');
  L.push('| Rulepack | Áp dụng? | Chặn |');
  L.push('|---|---|---|');
  for (const r of evaluation.resolution.rows) L.push(`| \`${r.pack.id}@${r.pack.version}\` | ${r.applies === true ? 'có' : r.applies === false ? 'không — ' + r.reason : 'không xác định — ' + r.reason} | ${r.blocked ?? (r.selected ? 'được chọn' : '')} |`);
  L.push('');
  L.push('| Ca | P | Pháp lý | Kỹ thuật | Lý do |');
  L.push('|---|---|---|---|---|');
  for (const c of evaluation.cases) L.push(`| \`${c.id}\` | ${c.priority} | ${ICON[c.status]} ${c.status} | ${c.technical} | ${c.reason.replace(/\|/g, '\\|')} |`);
  if (report.known_exclusions.length) {
    L.push('');
    L.push('## Ngoài phạm vi');
    L.push('');
    for (const k of report.known_exclusions) L.push(`- **${k.scope}** — ${k.reason}`);
  }
  L.push('');
  L.push(`> ${report.disclaimer}`);
  return L.join('\n') + '\n';
}
