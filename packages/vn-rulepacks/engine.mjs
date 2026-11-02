// [2026-11-02 03:10 AM Johnny Chu - Chu Hoàng Anh] PHASE-020 — bộ đánh giá thuần dùng chung cho --certify (CI) và Conformance Engine trên bản cài (Kernel): chọn rulepack 4 bước, 6 trạng thái ca, fail closed; tách từ tests/conformance/lib/certify.mjs để không có hai bộ đánh giá (ADR-0012 T1, T7).
// [2026-11-02 10:45 AM Johnny Chu - Chu Hoàng Anh] PHASE-020 — S020-19: báo cáo giữ lớp của từng ca và thêm layer_results (kết quả riêng cho Module · Cấu hình · Doanh nghiệp, cùng luật overall).
// [2026-11-02 02:40 PM Johnny Chu - Chu Hoàng Anh] PHASE-020 — S020-20: ca trong báo cáo mang title, rulepack, legal_basis (nguồn + điều khoản + trạng thái rà) cho màn Kiểm chuẩn.
/**
 * @bizcity/vn-rulepacks/engine — BỘ ĐÁNH GIÁ THUẦN (ADR-0012 T7: gói chứa dữ liệu luật + một bộ đánh giá không phụ thuộc gói ngoài).
 *
 *   loadKitFromDir(dir?)          đọc registry / catalog / rulepack / ca của gói (mặc định thư mục chứa tệp này) — chỉ đọc tệp của gói
 *   resolve(kit, profile)         bốn bước chọn rulepack (R-VNC-4)
 *   evaluate({ kit, profile, evidence, layers, runtimeOnly })   6 trạng thái cho từng ca, fail closed (R-VNC-3)
 *   evidenceFromDiagnostics(results, diagCodes)   kết quả tự chẩn đoán trên bản cài → bằng chứng DG-* (diag-codes.json)
 *   overall(cases) · buildReport(...)             bizcity_vn_conformance_report@1
 *
 * Không ghi gì, không mở CSDL, không gọi mạng. Kết luận chỉ để người dùng ra quyết định (R-VNC-10): không chặn, không sửa.
 * Thiếu căn cứ / mơ hồ / rulepack chưa approved / duyệt hết hạn ⇒ REVIEW_REQUIRED; không bằng chứng ⇒ NOT_TESTED;
 * REVIEW_REQUIRED và NOT_TESTED không bao giờ là PASS (R-VNC-8).
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const PACKAGE_DIR = path.dirname(fileURLToPath(import.meta.url));
/** Nguồn pháp lý đã rà quá số ngày này tính là duyệt hết hạn (LEGAL-SOURCE-REGISTRY §2). */
export const REVIEW_VALID_DAYS = 365;
const TAX_DOMAINS = new Set(['tax', 'invoice', 'tax_admin', 'payroll']);
const OK = new Set(['pass', 'debt', 'warn']);
export const DISCLAIMER = 'Kết quả chỉ có giá trị trong phạm vi, ngày, phiên bản phần mềm, phiên bản rulepack và bộ test đã thực thi. Không phải chứng nhận của Bộ Tài chính hay cơ quan Thuế; không phải ý kiến pháp lý.';

/* ───────────── đọc kho của gói ───────────── */

const readJson = (f) => JSON.parse(fs.readFileSync(f, 'utf8'));

/** Kho rulepack của gói: { version, registry, catalog, rulepacks[], sources: Map, diagCodes }. */
export function loadKitFromDir(dir = PACKAGE_DIR) {
  const at = (...p) => path.join(dir, ...p);
  const registry = fs.existsSync(at('registry', 'legal-sources.json')) ? readJson(at('registry', 'legal-sources.json')) : { sources: [] };
  const catalog = fs.existsSync(at('catalog.json')) ? readJson(at('catalog.json')) : { items: [] };
  const diagCodes = fs.existsSync(at('diag-codes.json')) ? readJson(at('diag-codes.json')).codes ?? {} : {};
  const version = fs.existsSync(at('package.json')) ? readJson(at('package.json')).version ?? null : null;
  const packsDir = at('rulepacks');
  const rulepacks = (fs.existsSync(packsDir) ? fs.readdirSync(packsDir).sort() : [])
    .filter((d) => fs.existsSync(path.join(packsDir, d, 'rulepack.json')))
    .map((d) => {
      const pack = readJson(path.join(packsDir, d, 'rulepack.json'));
      const cases = (pack.cases ?? []).map((rel) => {
        const f = path.join(packsDir, d, rel);
        return fs.existsSync(f) ? { ...readJson(f), _file: `rulepacks/${d}/${rel}` } : { id: `${pack.id}:${rel}`, _file: `rulepacks/${d}/${rel}`, _missing: true };
      });
      return { ...pack, _dir: `rulepacks/${d}`, _cases: cases };
    });
  return makeKit({ version, registry, catalog, rulepacks, diagCodes });
}

/** Dựng kho từ dữ liệu đã đọc (bộ kiểm đọc qua repo helper của nó rồi gọi hàm này). */
export function makeKit({ version = null, registry, catalog, rulepacks, diagCodes = {} }) {
  return { version, registry, catalog, rulepacks, diagCodes, sources: new Map((registry?.sources ?? []).map((s) => [s.id, s])) };
}

/* ───────────── ngày tháng (chuỗi YYYY-MM-DD, không múi giờ) ───────────── */

export const today = () => new Date().toISOString().slice(0, 10);
export function addDays(d, n) { const t = new Date(`${d}T00:00:00Z`); t.setUTCDate(t.getUTCDate() + n); return t.toISOString().slice(0, 10); }

/** Ngày bắt đầu năm tài chính chứa asOf, với fiscal_year_start = 'MM-DD'. */
export function fiscalYearStart(mmdd, asOf) {
  const y = Number(asOf.slice(0, 4));
  const sameYear = `${y}-${mmdd}`;
  return sameYear <= asOf ? sameYear : `${y - 1}-${mmdd}`;
}

/* ───────────── áp dụng ───────────── */

/**
 * Một phạm vi (applies_to của rulepack hoặc ca) có áp cho hồ sơ không. Trả { applies: true | false | null, reason }.
 * null = không xác định được vì hồ sơ chưa khai (chế độ / loại pháp nhân) ⇒ REVIEW_REQUIRED, không đoán.
 * Miền thuế / hoá đơn / quản lý thuế: theo NGÀY GIAO DỊCH (as_of), không theo chế độ kế toán (R-VNC-4 bước 3).
 * Miền kế toán: theo chế độ + năm tài chính bắt đầu (bước 2).
 */
export function applies(app, { profile, fyStart, domain, regime }) {
  if (!app) return { applies: true, reason: null };
  const et = app.entity_types ?? ['any'];
  if (!et.includes('any')) {
    if (profile.entity_type === 'unknown') return { applies: null, reason: 'hồ sơ đơn vị chưa khai loại pháp nhân — không xác định được phạm vi áp dụng' };
    if (!et.includes(profile.entity_type)) return { applies: false, reason: `loại pháp nhân ${profile.entity_type} ngoài ${et.join(', ')}` };
  }
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
 * chưa approved · nhiều bản approved cùng catalog · nguồn pháp lý chưa rà / rà quá hạn · thiếu nguồn · hồ sơ chưa khai.
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

/* ───────────── bằng chứng ───────────── */

/**
 * Kết quả tự chẩn đoán trên bản cài ([{ code, level }], level: pass | empty | info | warn | error) → Map(DG-id → trạng thái kiểu
 * bộ kiểm): pass → pass · empty → skip (đạt rỗng không phải đạt, R-DIAG-7) · info / warn → warn · error → fail.
 */
export function evidenceFromDiagnostics(results, diagCodes) {
  const byCode = new Map(results.map((r) => [r.code, r.level]));
  const checks = new Map();
  for (const [id, code] of Object.entries(diagCodes ?? {})) {
    const level = byCode.get(code);
    if (level === undefined) continue;
    checks.set(id, level === 'pass' ? 'pass' : level === 'empty' ? 'skip' : level === 'error' ? 'fail' : 'warn');
  }
  return checks;
}

/** Một bằng chứng: trả ['ok' | 'bad' | 'error' | 'unknown', chữ]. */
function evidenceOf(ref, ev, layer) {
  if (ref.endsWith('.test.ts')) {
    if (!ev.runtime) return ['unknown', `${ref}: lane runtime chưa chạy (--runtime)`];
    const s = ev.tests?.get(ref);
    if (s === 'pass') return ['ok', `${ref}: vitest đạt`];
    if (s === 'fail') return ['bad', `${ref}: vitest KHÔNG đạt`];
    if (s === 'error') return ['error', `${ref}: vitest lỗi khi chạy`];
    return ['unknown', `${ref}: không có kết quả vitest`];
  }
  const s = ev.checks?.get(ref);
  if (!s) return ['unknown', `${ref}: kiểm không chạy trong lượt này`];
  // Lớp Cấu hình / Doanh nghiệp: phát hiện của kiểm mức warn chính là tình trạng được đánh giá ⇒ không đạt.
  // Lớp Module: kiểm mức info (vd sự kiện dead) là ngữ cảnh vận hành, không làm hỏng ca chất lượng mã.
  if (s === 'warn' && (layer === 'enterprise' || layer === 'configuration')) return ['bad', `${ref}: có phát hiện (lớp ${layer === 'enterprise' ? 'Doanh nghiệp' : 'Cấu hình'})`];
  if (OK.has(s)) return ['ok', `${ref}: ${s}`];
  if (s === 'fail') return ['bad', `${ref}: fail`];
  if (s === 'error') return ['error', `${ref}: error`];
  if (s === 'skip') return ['unknown', `${ref}: ${ref.startsWith('DG-') ? 'đạt rỗng / chưa có dữ liệu để xét' : 'bỏ qua'}`];
  return ['unknown', `${ref}: ${s}`];
}

/* ───────────── đánh giá ca ───────────── */

/**
 * evidence = { checks: Map(id → status), tests?: Map(file → pass|fail|error), runtime?: bool }
 * layers      — lớp được đánh giá trong lượt này (chứng nhận: module + configuration; bản cài: tuỳ màn)
 * runtimeOnly — bản cài: chỉ tính bằng chứng có được lúc chạy (DG-*); SC-* / test là bằng chứng build, liệt kê nhưng không tính
 * Trả { fyStart, resolution, cases: [{ id, version, priority, status, reason, evidence, legal_basis_ids, rulepack, layer, technical }] }.
 */
export function evaluate({ kit, profile, evidence, layers = ['module', 'configuration'], runtimeOnly = false, buildOnlyLayers = [] }) {
  const resolution = resolve(kit, profile);
  const cases = [];
  for (const row of resolution.rows) {
    const { pack } = row;
    for (const k of pack._cases ?? []) {
      const basis = k.legal_basis?.length ? k.legal_basis : pack.legal_basis ?? [];
      const base = {
        id: k.id, version: k.version ?? '0.0.0', priority: k.priority ?? pack.priority, rulepack: pack.id, layer: pack.layer ?? null, title: k.title ?? null,
        legal_basis_ids: basis.map((b) => b.source_id),
        legal_basis: basis.map((b) => { const s = kit.sources?.get(b.source_id); return { source_id: b.source_id, label: s ? `${s.title} ${s.number ?? ''}`.trim() : b.source_id, provision_ref: b.provision_ref ?? null, review_status: b.review_status ?? 'pending' }; }),
        evidence: [],
      };
      if (pack.layer && !layers.includes(pack.layer)) { cases.push({ ...base, status: 'NOT_APPLICABLE', reason: `lớp ${pack.layer} không thuộc lượt đánh giá này`, technical: 'NOT_TESTED' }); continue; }
      if (k._missing) { cases.push({ ...base, status: 'ERROR', reason: `tệp ca ${k._file} không có`, technical: 'ERROR' }); continue; }
      if (k.status === 'deprecated') { cases.push({ ...base, status: 'NOT_APPLICABLE', reason: 'ca đã deprecated', technical: 'NOT_TESTED' }); continue; }
      if (row.applies === false) { cases.push({ ...base, status: 'NOT_APPLICABLE', reason: `rulepack không áp: ${row.reason}`, technical: 'NOT_TESTED' }); continue; }
      const ca = applies(k.applies_to, { profile, fyStart: resolution.fyStart, domain: pack.domain, regime: pack.regime });
      if (ca.applies === false) { cases.push({ ...base, status: 'NOT_APPLICABLE', reason: `ca không áp: ${ca.reason}`, technical: 'NOT_TESTED' }); continue; }

      // Kỹ thuật: gom bằng chứng.
      const all = k.scenario?.verified_by ?? [];
      // buildOnlyLayers (chứng nhận với hồ sơ giả lập): kiểm DG-* của lớp đó mô tả cấu hình / dữ liệu của MỘT bản cài, không nói gì
      // về chất lượng mã ⇒ chỉ tính bằng chứng build ở lớp đó.
      const buildOnly = buildOnlyLayers.includes(pack.layer);
      const refs = runtimeOnly ? all.filter((r) => r.startsWith('DG-')) : buildOnly ? all.filter((r) => !r.startsWith('DG-')) : all;
      const build = runtimeOnly ? all.filter((r) => !r.startsWith('DG-')) : [];
      const install = buildOnly ? all.filter((r) => r.startsWith('DG-')) : [];
      const lines = [];
      if (install.length) lines.push(`bằng chứng bản cài (chỉ dùng trên bản cài với hồ sơ thật): ${install.join(', ')}`);
      const states = refs.map((r) => { const [s, t] = evidenceOf(r, evidence, pack.layer); lines.push(t); return s; });
      const technical = !refs.length ? 'NOT_TESTED'
        : states.includes('error') ? 'ERROR' : states.includes('bad') ? 'FAIL' : states.includes('unknown') ? 'NOT_TESTED' : 'PASS';
      if (build.length) lines.push(`bằng chứng build (chạy ở CI / --certify, không chạy trên bản cài): ${build.join(', ')}`);
      if (!refs.length) lines.push((runtimeOnly ? 'không có kiểm chạy được trên bản cài' : 'verified_by rỗng — không có bằng chứng') + (k.scenario?.gap ? `; khoảng trống: ${k.scenario.gap}` : ''));

      // Pháp lý: fail closed.
      let status, reason;
      const blocked = row.blocked ?? ca.reason;
      // Phạm vi chưa xác định (hồ sơ chưa khai chế độ / loại pháp nhân): không kết luận FAIL cho quy định chưa biết có áp hay không —
      // REVIEW_REQUIRED kèm việc cần làm (ADR-0013 §4: không đoán). FAIL / ERROR kỹ thuật chỉ nâng lên khi phạm vi đã rõ.
      const undetermined = row.applies === null || ca.applies === null;
      if (blocked || k.status !== 'approved') {
        status = !undetermined && (technical === 'FAIL' || technical === 'ERROR') ? technical : 'REVIEW_REQUIRED';
        reason = blocked ?? `ca còn ${k.status} — chưa được duyệt`;
        if (status === 'REVIEW_REQUIRED') reason += ` · kỹ thuật: ${technical}`;
      } else {
        status = technical;
        reason = status === 'PASS' ? '' : status === 'NOT_TESTED' ? (k.scenario?.gap ?? 'không có bằng chứng đủ') : lines.filter((l) => /KHÔNG|fail|error|lỗi|phát hiện/i.test(l)).join('; ');
      }
      cases.push({ ...base, status, reason, technical, evidence: lines, evaluated_at: profile.as_of });
    }
  }
  return { fyStart: resolution.fyStart, resolution, cases, layers: [...layers] };
}

/** Kết quả chung của báo cáo từ danh sách ca (R-VNC-8). */
export function overall(cases) {
  const p0 = cases.filter((c) => c.priority === 'P0');
  if (p0.some((c) => c.status === 'FAIL' || c.status === 'ERROR')) return 'FAIL';
  if (p0.every((c) => c.status === 'PASS' || c.status === 'NOT_APPLICABLE') && p0.some((c) => c.status === 'PASS')) return 'PASS';
  return 'REVIEW_REQUIRED';
}

/**
 * bizcity_vn_conformance_report@1. run = { runId, at, gitSha, db, runtime? }; target = { kind, package, version }.
 * profile.simulated = false khi hồ sơ là hồ sơ thật của đơn vị (bản cài).
 */
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
    runtime: run.runtime ?? { os: process.platform, node: process.version, postgres: run.db ?? null },
    target,
    tenant_profile: { jurisdiction: 'VN', accounting_regime: profile.accounting_regime, fiscal_year_start: profile.fiscal_year_start, entity_type: profile.entity_type, simulated: profile.simulated !== false },
    scope,
    rulepacks: kit.rulepacks.map((p) => ({ id: p.id, version: p.version, status: p.status, rules_hash: p.release?.rules_hash ?? null })),
    cases: evaluation.cases.map(({ technical, ...c }) => c),
    known_exclusions: known,
    reviewer_status: approved ? `${approved}/${kit.rulepacks.length} rulepack approved` : 'Chưa rulepack nào được chuyên gia kế toán / thuế duyệt',
    result,
    // Ba câu hỏi khác nhau (ADR-0012): mỗi lớp được đánh giá một kết quả, cùng luật overall; lớp không thuộc lượt thì không có khoá.
    layer_results: Object.fromEntries((evaluation.layers ?? []).map((l) => [l, overall(evaluation.cases.filter((c) => c.layer === l))])),
    label: result === 'PASS' ? `Passed Bizcity VN Conformance [${scope.join(',')}/${kit.rulepacks.map((p) => `${p.id}@${p.version}`).join(',')}/${profile.as_of}]` : result === 'FAIL' ? 'Not passed' : 'Review required',
    disclaimer: DISCLAIMER,
  };
}
