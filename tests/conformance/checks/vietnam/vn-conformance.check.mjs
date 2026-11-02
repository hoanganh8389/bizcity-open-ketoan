// [2026-11-02 03:10 AM Johnny Chu - Chu Hoàng Anh] PHASE-020 — dữ liệu về packages/vn-rulepacks; SC-VNC-2 kiểm diag-codes.json (DG-* ↔ mã tự chẩn đoán trong app) cho Conformance Engine trên bản cài.
// [2026-11-02 01:40 AM Johnny Chu - Chu Hoàng Anh] PHASE-020 — SC-VNC-2 nhận cả check khai dạng bảng bộ (DG-PLAN-1..4 trong ledger.diag.mjs); trước đây báo nhầm verified_by không có thật.
// [2026-11-02 12:50 AM Johnny Chu - Chu Hoàng Anh] PHASE-020 — SC-VNC-1 kiểm thêm profile.schema.json và profiles/*.json (hồ sơ đơn vị giả lập cho --certify).
// [2026-11-01 10:58 PM Johnny Chu - Chu Hoàng Anh] PHASE-020 — bộ kiểm chuẩn pháp lý Việt Nam (VNCONF-002): kho nguồn pháp lý, rulepack, ca, báo cáo đúng schema; cổng phê duyệt fail-closed (SC-VNC-1, SC-VNC-2).
/**
 * Bộ kiểm chuẩn Việt Nam — lớp DỮ LIỆU (packages/vn-rulepacks/), PHASE-020, luật R-VNC (docs/rules/RULE-VN-CONFORMANCE.md).
 *
 *   SC-VNC-1  Schema: 4 schema hợp lệ với bộ kiểm JSON Schema rút gọn; registry, catalog, rulepack, case, báo cáo mẫu đúng schema.
 *   SC-VNC-2  Cổng phê duyệt (fail closed): status approved chỉ khi căn cứ đã rà (không REVIEW_REQUIRED, nguồn registry reviewed),
 *             đủ người duyệt (kế toán; thêm thuế với miền thuế / hoá đơn / quản lý thuế / lương), approved_at, golden hash khớp fixture,
 *             rules_hash khi phát hành; id duy nhất; căn cứ trỏ nguồn có thật; verified_by trỏ check / test có thật; fixture tiền không
 *             dùng số thực; catalog khớp thư mục; báo cáo mẫu: REVIEW_REQUIRED / NOT_TESTED / FAIL / ERROR ở ca P0 không cho result PASS.
 *
 * Schema đọc từ ctx.core (repo lõi) để kiểm được fixture repo-bad; dữ liệu đọc từ ctx.repo. Không ghi gì. Runner chạy thật (VNCONF-003)
 * là lane riêng, không ở đây.
 */
import { createHash } from 'node:crypto';
import path from 'node:path';
import { AGENT_RE } from '../../lib/framework-files.mjs';

const VN = 'packages/vn-rulepacks';
const SCHEMAS = {
  registry: `${VN}/schemas/legal-source.schema.json`,
  rulepack: `${VN}/schemas/rulepack.schema.json`,
  case: `${VN}/schemas/case.schema.json`,
  report: `${VN}/schemas/report.schema.json`,
  profile: `${VN}/schemas/profile.schema.json`,
};
const REGISTRY = `${VN}/registry/legal-sources.json`;
const CATALOG = `${VN}/catalog.json`;
const DIAG_CODES = `${VN}/diag-codes.json`;
const TAX_DOMAINS = new Set(['tax', 'invoice', 'tax_admin', 'payroll']);
const P0_PASSING = new Set(['PASS', 'NOT_APPLICABLE']);

/** Đọc JSON an toàn: trả { data } hoặc { error }. */
function readJson(repo, file) {
  try { const data = repo.json(file); return data === undefined ? { error: 'không có tệp' } : { data }; }
  catch (e) { return { error: `JSON không đọc được: ${e.message}` }; }
}

/** Mọi rulepack.json của repo đang kiểm: [{ dir, file, pack }] (pack = undefined khi lỗi JSON). */
function loadPacks(ctx) {
  return ctx.repo.files({ under: [`${VN}/rulepacks`], match: /\/rulepack\.json$/ }).map((file) => {
    const dir = path.posix.dirname(file);
    const { data, error } = readJson(ctx.repo, file);
    return { dir, file, pack: data, error };
  });
}

/** Mọi ca trong một thư mục rulepack (kể cả ca không được khai trong pack.cases). */
function loadCases(ctx, dir) {
  return ctx.repo.files({ under: [`${dir}/cases`], ext: ['.json'] }).map((file) => {
    const { data, error } = readJson(ctx.repo, file);
    return { file, rel: path.posix.relative(dir, file), kase: data, error };
  });
}

/** Mã check SC-* / DG-* đang có trong bộ kiểm (đọc ở repo lõi). */
function knownCheckIds(ctx) {
  const ids = new Set();
  for (const f of ctx.core.files({ under: ['tests/conformance/checks', 'tests/conformance/diagnostics'], match: /\.(check|diag)\.mjs$/ })) {
    // Hai dạng khai: { id: 'SC-X-1', … } và bảng bộ [ ['DG-PLAN-3', 'CODE', …], … ] (ledger.diag.mjs).
    for (const m of (ctx.core.read(f) ?? '').matchAll(/(?:\bid:\s*|\[\s*)'((?:SC|DG)-[A-Z]+-\d+)'/g)) ids.add(m[1]);
  }
  return ids;
}

/** Mã code của từng check DG-* trong lane diagnostics (hai dạng khai: sqlCheck({ id, code }) và bảng bộ ['DG-X', 'CODE', …]). */
function laneCodes(ctx) {
  const m = new Map();
  for (const f of ctx.core.files({ under: ['tests/conformance/diagnostics'], match: /\.diag\.mjs$/ })) {
    const t = ctx.core.read(f) ?? '';
    for (const x of t.matchAll(/id:\s*'(DG-[A-Z]+-\d+)',\s*code:\s*'([A-Z][A-Z0-9_]+)'/g)) m.set(x[1], x[2]);
    for (const x of t.matchAll(/\[\s*'(DG-[A-Z]+-\d+)',\s*'([A-Z][A-Z0-9_]+)'/g)) m.set(x[1], x[2]);
  }
  return m;
}

/** Số thực (có phần lẻ) trong một cây JSON → đường dẫn JSON pointer. */
function nonIntegerNumbers(node, at = '') {
  const out = [];
  if (typeof node === 'number') { if (!Number.isInteger(node)) out.push(at || '/'); return out; }
  if (Array.isArray(node)) node.forEach((v, i) => out.push(...nonIntegerNumbers(v, `${at}/${i}`)));
  else if (node && typeof node === 'object') for (const [k, v] of Object.entries(node)) out.push(...nonIntegerNumbers(v, `${at}/${k}`));
  return out;
}

const sha256 = (text) => 'sha256:' + createHash('sha256').update(text.replace(/\r\n/g, '\n')).digest('hex');
const before = (a, b) => a && b && a > b; // ngày dạng YYYY-MM-DD so sánh theo chuỗi

export const checks = [
  {
    id: 'SC-VNC-1',
    title: 'Bộ kiểm chuẩn Việt Nam: schema hợp lệ; kho nguồn pháp lý, catalog, rulepack, ca và báo cáo mẫu đúng schema',
    gate: 'DOCS', contract: 'contracts', rules: ['R-VNC-1', 'R-VNC-2'], conf: [], tier: 1, enforce: 'block', weight: 3, targets: ['repo'],
    run(ctx) {
      const findings = [];
      const add = (file, msg, key) => findings.push(ctx.finding(file, null, msg, key));
      let examined = 0;

      // 1. Schema tự hợp lệ (từ khoá bộ kiểm hỗ trợ, $ref tới được, pattern đúng) — đọc ở repo lõi.
      for (const rel of Object.values(SCHEMAS)) {
        const schema = ctx.core.json(rel);
        examined++;
        if (!schema) { add(rel, 'thiếu schema', `schema-missing:${rel}`); continue; }
        if (!/^bizcity_vn_[a-z_]+@\d+$/.test(schema.title ?? '')) add(rel, `title phải dạng bizcity_vn_<tên>@N (đang "${schema.title}")`, `schema-title:${rel}`);
        for (const p of ctx.lintSchema(schema)) add(rel, p, `schema-lint:${rel}:${p.split(':')[0]}`);
      }
      const validate = (schemaRel, data, file, keyPrefix, max = 10) => {
        const errs = ctx.validate(schemaRel, data);
        for (const e of errs.slice(0, max)) add(file, `${e.path}: ${e.message}`, `${keyPrefix}:${e.path}`);
        return errs.length === 0;
      };

      // 2. Kho nguồn pháp lý.
      if (ctx.repo.exists(REGISTRY)) {
        examined++;
        const { data, error } = readJson(ctx.repo, REGISTRY);
        if (error) add(REGISTRY, error, `json:${REGISTRY}`); else validate(SCHEMAS.registry, data, REGISTRY, 'registry', 15);
      }
      // 3. Catalog.
      if (ctx.repo.exists(CATALOG)) {
        examined++;
        const { data, error } = readJson(ctx.repo, CATALOG);
        if (error) add(CATALOG, error, `json:${CATALOG}`);
        else {
          if (data.contract !== 'bizcity_vn_catalog@1' || !Array.isArray(data.items)) add(CATALOG, 'catalog phải có contract bizcity_vn_catalog@1 và items[]', 'catalog:/contract');
          for (const it of data.items ?? []) {
            if (!/^C\d{2}$/.test(it.id ?? '')) add(CATALOG, `id "${it.id}" phải dạng Cnn`, `catalog:/items/${it.id}/id`);
            if (!['planned', 'draft', 'approved', 'deprecated'].includes(it.status)) add(CATALOG, `${it.id}: status "${it.status}" không hợp lệ`, `catalog:/items/${it.id}/status`);
            if (!['P0', 'P1'].includes(it.priority)) add(CATALOG, `${it.id}: priority "${it.priority}" không hợp lệ`, `catalog:/items/${it.id}/priority`);
          }
        }
      }
      // 4. Rulepack + ca.
      for (const { dir, file, pack, error } of loadPacks(ctx)) {
        examined++;
        if (error) { add(file, error, `json:${file}`); continue; }
        validate(SCHEMAS.rulepack, pack, file, `pack:${pack.id ?? path.posix.basename(dir)}`);
        for (const c of loadCases(ctx, dir)) {
          examined++;
          if (c.error) { add(c.file, c.error, `json:${c.file}`); continue; }
          validate(SCHEMAS.case, c.kase, c.file, `case:${c.rel}`);
        }
      }
      // 5b. Hồ sơ đơn vị giả lập (profiles/*.json).
      for (const f of ctx.repo.files({ under: [`${VN}/profiles`], ext: ['.json'] })) {
        examined++;
        const { data, error } = readJson(ctx.repo, f);
        if (error) add(f, error, `json:${f}`); else validate(SCHEMAS.profile, data, f, `profile:${path.posix.basename(f)}`);
      }
      // 5. Báo cáo mẫu (schemas/examples/*.json của repo đang kiểm).
      for (const f of ctx.repo.files({ under: [`${VN}/schemas/examples`], ext: ['.json'] })) {
        examined++;
        const { data, error } = readJson(ctx.repo, f);
        if (error) add(f, error, `json:${f}`); else validate(SCHEMAS.report, data, f, `report:${path.posix.basename(f)}`);
      }
      return { examined, findings, metrics: { schemas: Object.keys(SCHEMAS).length } };
    },
  },
  {
    id: 'SC-VNC-2',
    title: 'Cổng phê duyệt rulepack fail-closed: approved chỉ khi căn cứ đã rà, đủ người duyệt, golden hash khớp; id duy nhất; căn cứ và bằng chứng trỏ nơi có thật; fixture tiền không dùng số thực',
    gate: 'DOCS', contract: 'contracts', rules: ['R-VNC-3', 'R-VNC-6', 'R-VNC-8'], conf: [], tier: 0, enforce: 'block', weight: 4, targets: ['repo'],
    run(ctx) {
      const findings = [];
      const add = (file, msg, key) => findings.push(ctx.finding(file, null, msg, key));
      let examined = 0;

      // Kho nguồn pháp lý: id duy nhất, ngày hợp lý, reviewed thì phải có link chính thức và người duyệt không phải agent.
      const sources = new Map();
      const reg = ctx.repo.exists(REGISTRY) ? readJson(ctx.repo, REGISTRY).data : undefined;
      for (const s of reg?.sources ?? []) {
        examined++;
        if (!s?.id) continue;
        if (sources.has(s.id)) add(REGISTRY, `nguồn ${s.id} khai hai lần`, `dup-source:${s.id}`); else sources.set(s.id, s);
        if (before(s.effective_from, s.effective_to)) add(REGISTRY, `${s.id}: effective_to trước effective_from`, `dates:${s.id}`);
        for (const p of s.provisions ?? []) if (before(p.effective_from, p.effective_to)) add(REGISTRY, `${s.id} ${p.ref}: effective_to trước effective_from`, `dates:${s.id}:${p.ref}`);
        if (s.review?.status === 'reviewed') {
          if (!s.official_url) add(REGISTRY, `${s.id}: đã rà (reviewed) nhưng không có official_url — nguồn thứ cấp / tìm kiếm web không là căn cứ (R-VNC-1)`, `source-url:${s.id}`);
          if (!s.review.reviewed_by || !s.review.reviewed_at) add(REGISTRY, `${s.id}: reviewed nhưng thiếu reviewed_by / reviewed_at`, `source-reviewer:${s.id}`);
          if (!s.snapshot?.sha256) add(REGISTRY, `${s.id}: reviewed nhưng chưa có ảnh chụp băm sha256`, `source-snapshot:${s.id}`);
        }
        if (s.review?.reviewed_by && AGENT_RE.test(s.review.reviewed_by)) add(REGISTRY, `${s.id}: reviewed_by là agent / model ("${s.review.reviewed_by}") — người có trách nhiệm mới được rà`, `agent-name:${s.id}`);
      }

      const checkIds = knownCheckIds(ctx);
      const tests = new Set(ctx.core.list('apps/api/test'));
      const ids = new Map();
      const packs = loadPacks(ctx);
      const packIds = new Map();

      const reviewGate = (file, doc, label, domain) => {
        const basisPending = (doc.legal_basis ?? []).filter((b) => b.review_status !== 'reviewed' || /REVIEW_REQUIRED/i.test(b.provision_ref ?? ''));
        if (basisPending.length) add(file, `${label}: approved nhưng ${basisPending.length} căn cứ chưa rà / còn REVIEW_REQUIRED (fail closed, R-VNC-3)`, `approved-basis:${doc.id}`);
        for (const b of doc.legal_basis ?? []) {
          const src = sources.get(b.source_id);
          if (src && src.review?.status !== 'reviewed') add(file, `${label}: approved trên nguồn ${b.source_id} mà registry còn ${src.review?.status ?? '?'}`, `approved-source:${doc.id}:${b.source_id}`);
        }
        const r = doc.review ?? {};
        const needTax = TAX_DOMAINS.has(domain);
        if (!r.accounting_reviewer || !r.approved_at || (needTax && !r.tax_reviewer)) {
          add(file, `${label}: approved nhưng thiếu ${[!r.accounting_reviewer && 'accounting_reviewer', needTax && !r.tax_reviewer && 'tax_reviewer (miền thuế / hoá đơn)', !r.approved_at && 'approved_at'].filter(Boolean).join(', ')}`, `approved-review:${doc.id}`);
        }
      };
      const agentGate = (file, doc) => {
        for (const k of ['accounting_reviewer', 'tax_reviewer']) {
          const v = doc.review?.[k];
          if (v && AGENT_RE.test(v)) add(file, `${doc.id}: ${k} là agent / model ("${v}")`, `agent-name:${doc.id}:${k}`);
        }
      };

      for (const { dir, file, pack, error } of packs) {
        if (error || !pack) continue;
        examined++;
        const folder = path.posix.basename(dir);
        if (pack.id && pack.id !== folder) add(file, `id "${pack.id}" khác tên thư mục "${folder}"`, `pack-folder:${folder}`);
        if (ids.has(pack.id)) add(file, `id ${pack.id} trùng với ${ids.get(pack.id)}`, `dup:${pack.id}`); else ids.set(pack.id, file);
        packIds.set(pack.id, pack);
        for (const b of pack.legal_basis ?? []) if (!sources.has(b.source_id)) add(file, `căn cứ trỏ nguồn ${b.source_id} không có trong registry`, `source-missing:${pack.id}:${b.source_id}`);
        agentGate(file, pack);
        if (pack.status === 'approved') {
          reviewGate(file, pack, `rulepack ${pack.id}`, pack.domain);
          if (!pack.release?.rules_hash || !pack.release?.released_at) add(file, `rulepack ${pack.id}: approved nhưng chưa phát hành bất biến (rules_hash / released_at)`, `approved-golden:${pack.id}`);
        }
        if (pack.status !== 'approved' && pack.release?.rules_hash) add(file, `rulepack ${pack.id}: có rules_hash nhưng status ${pack.status} — chỉ bản approved mới phát hành`, `release-status:${pack.id}`);
        if (before(pack.applies_to?.transaction_date_from, pack.applies_to?.transaction_date_to)) add(file, `${pack.id}: transaction_date_to trước transaction_date_from`, `dates:${pack.id}`);

        const declared = new Set(pack.cases ?? []);
        const found = loadCases(ctx, dir);
        const foundRel = new Set(found.map((c) => c.rel));
        for (const rel of declared) if (!foundRel.has(rel)) add(file, `khai ${rel} nhưng không có tệp`, `case-missing:${pack.id}:${rel}`);
        for (const c of found) {
          if (c.error || !c.kase) continue;
          examined++;
          const k = c.kase;
          if (!declared.has(c.rel)) add(c.file, `ca ${k.id} không được khai trong ${file} (ca mồ côi không được chạy)`, `case-orphan:${c.rel}`);
          if (k.rulepack !== pack.id) add(c.file, `ca ${k.id} khai rulepack "${k.rulepack}" nhưng nằm trong ${pack.id}`, `case-pack:${c.rel}`);
          if (k.id && !String(k.id).startsWith(`vn.${pack.id}.`)) add(c.file, `id ${k.id} phải bắt đầu bằng vn.${pack.id}.`, `case-id:${c.rel}`);
          if (ids.has(k.id)) add(c.file, `id ${k.id} trùng với ${ids.get(k.id)}`, `dup:${k.id}`); else ids.set(k.id, c.file);
          for (const b of k.legal_basis ?? []) if (!sources.has(b.source_id)) add(c.file, `căn cứ trỏ nguồn ${b.source_id} không có trong registry`, `source-missing:${k.id}:${b.source_id}`);
          for (const ref of k.scenario?.verified_by ?? []) {
            const ok = ref.endsWith('.test.ts') ? tests.has(ref) : checkIds.has(ref);
            if (!ok) add(c.file, `verified_by trỏ ${ref} — không có check / test này trong repo lõi`, `verified:${k.id}:${ref}`);
          }
          if (k.status === 'approved' && !(k.scenario?.verified_by?.length) && !k.scenario?.expected_fixture) add(c.file, `${k.id}: approved nhưng không có bằng chứng (verified_by rỗng, không fixture) — là NOT_TESTED`, `approved-evidence:${k.id}`);
          for (const kind of ['input_fixture', 'expected_fixture']) {
            const rel = k.scenario?.[kind];
            if (!rel) continue;
            const fx = path.posix.join(dir, rel);
            if (!ctx.repo.exists(fx)) { add(c.file, `${kind} ${rel} không có tệp`, `fixture-missing:${k.id}:${kind}`); continue; }
            const { data, error } = readJson(ctx.repo, fx);
            if (error) { add(fx, error, `json:${fx}`); continue; }
            for (const p of nonIntegerNumbers(data).slice(0, 5)) add(fx, `số thực ${p} — tiền phải là số nguyên (đơn vị nhỏ nhất) hoặc chuỗi thập phân (R-VNC-6)`, `float:${rel}:${p}`);
            if (kind === 'expected_fixture' && k.status === 'approved') {
              const h = k.golden?.hash;
              if (!h) add(c.file, `${k.id}: approved nhưng golden.hash null`, `approved-golden:${k.id}`);
              else if (h !== sha256(ctx.repo.read(fx))) add(c.file, `${k.id}: golden.hash không khớp ${rel} — fixture bị sửa ngoài quy trình duyệt`, `golden-mismatch:${k.id}`);
            }
          }
          agentGate(c.file, k);
          if (k.status === 'approved') reviewGate(c.file, k, `ca ${k.id}`, pack.domain);
          if (k.status === 'approved' && pack.status !== 'approved') add(c.file, `ca ${k.id} approved trong rulepack ${pack.id} còn ${pack.status}`, `approved-in-draft:${k.id}`);
        }
      }

      // diag-codes.json: mỗi DG-* có thật và khớp mã của nó; mọi DG-* mà ca dẫn đều có ánh xạ (Engine trên bản cài cần).
      if (ctx.repo.exists(DIAG_CODES)) {
        const { data: dc, error } = readJson(ctx.repo, DIAG_CODES);
        if (error) add(DIAG_CODES, error, `json:${DIAG_CODES}`);
        else {
          const lane = laneCodes(ctx);
          for (const [id, code] of Object.entries(dc.codes ?? {})) {
            examined++;
            if (!lane.has(id)) add(DIAG_CODES, `${id} không có trong lane diagnostics`, `diag-unknown:${id}`);
            else if (lane.get(id) !== code) add(DIAG_CODES, `${id} có mã ${lane.get(id)}, ánh xạ ghi ${code}`, `diag-code:${id}`);
          }
          const used = new Set();
          for (const { dir, pack } of packs) if (pack) for (const c of loadCases(ctx, dir)) for (const r of c.kase?.scenario?.verified_by ?? []) if (r.startsWith('DG-')) used.add(r);
          for (const id of used) if (!(id in (dc.codes ?? {}))) add(DIAG_CODES, `ca dẫn ${id} nhưng diag-codes.json không có ánh xạ — Engine trên bản cài không lấy được bằng chứng`, `diag-missing:${id}`);
        }
      }

      // Catalog ↔ thư mục rulepack.
      const cat = ctx.repo.exists(CATALOG) ? readJson(ctx.repo, CATALOG).data : undefined;
      for (const it of cat?.items ?? []) {
        examined++;
        const pack = packIds.get(it.rulepack);
        if (it.status !== 'planned' && !pack) add(CATALOG, `${it.id}: status ${it.status} nhưng không có rulepacks/${it.rulepack}/rulepack.json`, `catalog-pack:${it.id}`);
        if (pack && pack.catalog_id !== it.id) add(CATALOG, `${it.id}: rulepack ${it.rulepack} khai catalog_id ${pack.catalog_id}`, `catalog-id:${it.id}`);
        if (it.status === 'approved' && pack && pack.status !== 'approved') add(CATALOG, `${it.id}: catalog ghi approved nhưng rulepack còn ${pack.status}`, `catalog-status:${it.id}`);
        if (pack && it.priority !== pack.priority) add(CATALOG, `${it.id}: priority ${it.priority} khác rulepack (${pack.priority})`, `catalog-priority:${it.id}`);
      }

      // Báo cáo mẫu: luật kết quả (R-VNC-8).
      for (const f of ctx.repo.files({ under: [`${VN}/schemas/examples`], ext: ['.json'] })) {
        const { data: r } = readJson(ctx.repo, f);
        if (!r?.cases) continue;
        examined++;
        const name = path.posix.basename(f);
        const p0Bad = r.cases.filter((c) => c.priority === 'P0' && !P0_PASSING.has(c.status));
        if (r.result === 'PASS' && p0Bad.length) add(f, `result PASS nhưng ${p0Bad.length} ca P0 ở trạng thái ${[...new Set(p0Bad.map((c) => c.status))].join(', ')} — REVIEW_REQUIRED / NOT_TESTED / FAIL / ERROR không tính PASS`, `report-result:${name}`);
        if (r.result === 'PASS' && !/^Passed Bizcity VN Conformance \[/.test(r.label ?? '')) add(f, 'result PASS thì label phải là "Passed Bizcity VN Conformance [scope/version/date]"', `report-label:${name}`);
        if (r.result !== 'PASS' && /^Passed/.test(r.label ?? '')) add(f, `result ${r.result} nhưng label ghi Passed`, `report-label:${name}`);
        for (const c of r.cases) if (c.status !== 'PASS' && !(c.reason ?? '').trim()) add(f, `ca ${c.id} ${c.status} không có reason`, `report-reason:${name}:${c.id}`);
        if (r.result === 'PASS' && r.rulepacks?.some((p) => p.status !== 'approved')) add(f, 'result PASS trên rulepack chưa approved — chỉ rulepack approved mới chứng nhận', `report-rulepack:${name}`);
        if (/Bộ Tài chính|cơ quan Thuế|Ministry of Finance|certified by/i.test(r.label ?? '')) add(f, 'label không được tự nhận chứng nhận của cơ quan nhà nước', `report-claim:${name}`);
      }

      return { examined, unitBy: 'key', findings, metrics: { sources: sources.size, rulepacks: packIds.size, cases: ids.size - packIds.size } };
    },
  },
];
