// [2026-11-02 12:10 AM Johnny Chu - Chu Hoàng Anh] PHASE-020 — chế độ --certify: một lệnh kiểm tương thích + bảo mật (lane tĩnh), bất biến kế toán (lane diagnostics), tuân thủ VN theo rulepack đã công bố, chọn theo phiên bản + ngày hiệu lực (R-VNC-4); báo cáo bizcity_vn_conformance_report@1 + JUnit + chứng chỉ (VNCONF-003 W1a).
// [2026-11-02 03:10 AM Johnny Chu - Chu Hoàng Anh] PHASE-020 — phần đánh giá (applies, resolve, evaluate, overall, buildReport) chuyển sang packages/vn-rulepacks/engine.mjs dùng chung với Kernel; ở đây chỉ còn đọc kho qua repo helper và xuất JUnit / chứng chỉ.
// [2026-11-02 01:40 AM Johnny Chu - Chu Hoàng Anh] PHASE-020 — evaluate() chỉ gồm lớp Module + Cấu hình khi chứng nhận; lớp Doanh nghiệp ra NOT_APPLICABLE có lý do (đánh giá trên bản cài theo đơn vị).
// [2026-11-02 01:30 AM Johnny Chu - Chu Hoàng Anh] PHASE-020 — lớp enterprise (ADR-0012): check mức info có phát hiện (warn) là ca KHÔNG đạt — ở lớp này phát hiện chính là tình trạng doanh nghiệp
/**
 * CHỨNG NHẬN (certify) — thuần dữ liệu, không ghi gì, không mở CSDL. selfcheck.mjs gọi sau khi đã có kết quả hai lane.
 * Bộ đánh giá ở packages/vn-rulepacks/engine.mjs (một bộ cho CI và bản cài).
 *
 *   loadKit(core)                      đọc registry / catalog / rulepack / ca ở packages/vn-rulepacks/
 *   resolve(kit, profile)              bốn bước chọn rulepack (R-VNC-4): hồ sơ đơn vị → chế độ → ngày hiệu lực thuế / hoá đơn → đúng một bản approved
 *   evaluate({ kit, profile, evidence })  trạng thái 6 mức cho từng ca từ bằng chứng (check SC-* / DG-*, test vitest), fail closed
 *   buildReport(...)                   bizcity_vn_conformance_report@1
 *   renderJUnit(report) · renderCertificate(...)
 *
 * Nguyên tắc: thiếu căn cứ / mơ hồ / rulepack chưa approved / duyệt hết hạn ⇒ REVIEW_REQUIRED; không bằng chứng ⇒ NOT_TESTED;
 * REVIEW_REQUIRED và NOT_TESTED không bao giờ là PASS (R-VNC-3, R-VNC-8).
 */
import path from 'node:path';
// Bộ đánh giá thuần ở gói dữ liệu luật — một bộ duy nhất cho CI và bản cài (ADR-0012 T1, T7). Đường tương đối: không cần npm install.
import { addDays, applies, buildReport, evaluate, fiscalYearStart, makeKit, overall, resolve, REVIEW_VALID_DAYS, today } from '../../../packages/vn-rulepacks/engine.mjs';

export { addDays, applies, buildReport, evaluate, fiscalYearStart, overall, resolve, REVIEW_VALID_DAYS, today };
export const VN_DIR = 'packages/vn-rulepacks';
export const PROFILE_DEFAULT = `${VN_DIR}/profiles/default.json`;
export const REPORT_SCHEMA = `${VN_DIR}/schemas/report.schema.json`;
export const PROFILE_SCHEMA = `${VN_DIR}/schemas/profile.schema.json`;

/** Đọc kho qua repo helper của bộ kiểm (để kiểm được cả thư mục fixture), rồi dựng bằng makeKit của engine. */
export function loadKit(core) {
  const registry = core.exists(`${VN_DIR}/registry/legal-sources.json`) ? core.json(`${VN_DIR}/registry/legal-sources.json`) : { sources: [] };
  const catalog = core.exists(`${VN_DIR}/catalog.json`) ? core.json(`${VN_DIR}/catalog.json`) : { items: [] };
  const diagCodes = core.exists(`${VN_DIR}/diag-codes.json`) ? core.json(`${VN_DIR}/diag-codes.json`).codes ?? {} : {};
  const version = core.exists(`${VN_DIR}/package.json`) ? core.json(`${VN_DIR}/package.json`).version ?? null : null;
  const rulepacks = core.files({ under: [`${VN_DIR}/rulepacks`], match: /\/rulepack\.json$/ }).map((file) => {
    const dir = path.posix.dirname(file);
    const pack = core.json(file);
    const cases = (pack.cases ?? []).map((rel) => {
      const f = path.posix.join(dir, rel);
      return core.exists(f) ? { ...core.json(f), _file: f } : { id: `${pack.id}:${rel}`, _file: f, _missing: true };
    });
    return { ...pack, _dir: dir, _file: file, _cases: cases };
  });
  return makeKit({ version, registry, catalog, rulepacks, diagCodes });
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
