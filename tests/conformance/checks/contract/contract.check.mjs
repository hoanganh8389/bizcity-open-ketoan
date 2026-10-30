// [2026-10-29 10:24 PM Johnny Chu - Chu Hoàng Anh] INIT — khởi tạo Bizcity Core Framework: sổ cái chỉ thêm, cửa nạp sự việc, CANON, hợp đồng, bộ kiểm chuẩn.
// [2026-10-29 10:39 PM Johnny Chu - Chu Hoàng Anh] PHASE-001 — chuẩn MCP, gói định khoản theo ngành, kết nối Cell.
/**
 * Hợp đồng: schema, manifest (CONF-MAN), JSON mẫu, bảng năng lực, mã luật, mã lỗi, cấu hình.
 * Mọi hợp đồng kiểm ở MỘT chỗ này — không viết test hợp đồng rải rác nơi khác.
 */
import { STAMP_RE } from '../../lib/framework-files.mjs';

const MODULE_SCHEMA = 'docs/contracts/BIZCITY-MODULE-v1.schema.json';
const INTAKE_SCHEMA = 'docs/contracts/BIZCITY-LEDGER-INTAKE-v1.schema.json';
const STANDARD = 'docs/standard/bizcity-standard.json';

export const checks = [
  {
    id: 'SC-CON-1',
    title: 'Schema hợp đồng hợp lệ: 2020-12, có $id, title = mã@N, chỉ từ khoá được hỗ trợ, $ref không gãy',
    gate: 'DOCS', contract: 'contracts', rules: ['R-QG-9'], conf: [], tier: 1, enforce: 'block', weight: 3, targets: ['repo'],
    run(ctx) {
      const files = ctx.repo.files({ under: ['docs/contracts', 'tests/conformance/schema'], ext: ['.schema.json'] });
      const findings = [];
      for (const f of files) {
        let s;
        try { s = ctx.repo.json(f); } catch (e) { findings.push(ctx.finding(f, null, `JSON sai: ${e.message}`, 'parse')); continue; }
        if (s.$schema !== 'https://json-schema.org/draft/2020-12/schema') findings.push(ctx.finding(f, null, '$schema phải là draft 2020-12', '$schema'));
        if (!s.$id) findings.push(ctx.finding(f, null, 'thiếu $id', '$id'));
        if (!/^bizcity_[a-z_]+@\d+$/.test(s.title ?? '')) findings.push(ctx.finding(f, null, `title "${s.title}" phải dạng bizcity_<tên>@N`, 'title'));
        for (const p of ctx.lintSchema(s)) findings.push(ctx.finding(f, null, p, p));
      }
      return { examined: files.length, findings };
    },
  },
  {
    id: 'SC-CON-2',
    title: 'Manifest module: đúng schema, năng lực có thật, quyền / action / sự kiện / cấu hình đúng tiền tố, slot / hook có trong chuẩn',
    gate: 'CONF-MAN', contract: 'bizcity_module', rules: ['STD-MOD-1', 'STD-MOD-4', 'STD-MOD-5', 'STD-EXT-1', 'R-MATRIX-3'],
    conf: ['CONF-MAN-1', 'CONF-MAN-2', 'CONF-MAN-3', 'CONF-MAN-4', 'CONF-MAN-6', 'CONF-MAN-7'], tier: 1, enforce: 'block', weight: 5, targets: ['repo', 'module'], scope: 'module',
    run(ctx) {
      const files = ctx.mode === 'module'
        ? ['bizcity.module.json']
        : ctx.repo.files({ match: /(^|\/)([a-z0-9-]+\.)?bizcity\.module\.json$/ });
      const std = ctx.standard();
      const caps = new Map(std.capabilities.map((c) => [c.id, c]));
      const intake = ctx.schema(INTAKE_SCHEMA);
      const docTypes = new Set(Object.values(intake.$defs).map((d) => d?.properties?.docType?.const).filter(Boolean));
      const slots = new Set(std.extensionPoints?.slots ?? []);
      const hooks = new Set((std.extensionPoints?.hooks ?? []).map((h) => h.id));
      const coreEvents = new Set(std.coreEvents?.types ?? []);
      const groups = new Set(std.documentStatusGroups ?? []);
      const findings = [];
      const metrics = { manifests: 0, capabilitiesRequired: 0, capabilitiesAvailable: 0, blockedBy: [] };

      for (const file of files) {
        if (!ctx.repo.exists(file)) {
          // Thư mục chỉ chứa gói định khoản (kiểm bằng SC-TPL-1) thì không đòi manifest module.
          if (ctx.mode === 'module' && ctx.repo.files({ match: /posting-pack.json$/ }).length) continue;
          findings.push(ctx.finding(file, null, 'thiếu bizcity.module.json ở gốc module', 'missing')); continue;
        }
        const isExample = file.startsWith('docs/');
        const m = ctx.repo.json(file);
        metrics.manifests++;
        const add = (msg, key) => findings.push(ctx.finding(file, null, msg, key ?? msg));

        for (const e of ctx.validate(MODULE_SCHEMA, m)) add(`schema ${e.path}: ${e.message}`, `schema:${e.path}:${e.keyword}`);
        if (typeof m !== 'object' || !m) continue;
        const key = m.key ?? '';
        const under = key.replace(/-/g, '_');

        if (ctx.mode === 'module') {
          const dir = ctx.repo.root.split(/[\\/]/).pop();
          if (dir !== key) add(`key "${key}" phải trùng tên thư mục "${dir}"`, 'key-dir');
        }
        // CONF-MAN-2: chuẩn + năng lực
        const major = /^\^?(\d+)/.exec(m.standard ?? '')?.[1];
        if (major && major !== String(std.version).split('.')[0]) add(`standard "${m.standard}" không khớp Core ${std.version}`, 'standard');
        for (const c of m.requires?.capabilities ?? []) {
          metrics.capabilitiesRequired++;
          const cap = caps.get(c);
          if (!cap) add(`năng lực "${c}" không có trong bizcity-standard.json`, `cap-unknown:${c}`);
          else if (cap.status === 'available') metrics.capabilitiesAvailable++;
          else {
            metrics.blockedBy.push(`${c} (Phase ${cap.phase ?? '?'})`);
            if (!isExample) add(`năng lực "${c}" đang ${cap.status} — Core trả CAPABILITY_MISSING khi cài`, `cap-planned:${c}`);
          }
        }
        // CONF-MAN-3: quyền
        const perms = new Set((m.permissions ?? []).map((p) => p.key));
        for (const p of perms) if (!p.startsWith(`${key}:`)) add(`quyền "${p}" phải có tiền tố "${key}:"`, `perm-prefix:${p}`);
        for (const item of [...(m.extensions?.menu ?? []), ...(m.extensions?.slots ?? [])]) {
          if (item.permission && !perms.has(item.permission) && item.permission.startsWith(`${key}:`)) add(`quyền "${item.permission}" dùng ở extensions nhưng chưa khai trong permissions`, `perm-undeclared:${item.permission}`);
        }
        // Tiền tố định danh
        for (const a of m.actions ?? []) if (!a.startsWith(`${key}.`)) add(`action "${a}" phải bắt đầu "${key}."`, `action-prefix:${a}`);
        for (const d of m.documents ?? []) if (!String(d.type).startsWith(`${key}.`)) add(`loại chứng từ "${d.type}" phải bắt đầu "${key}."`, `doc-prefix:${d.type}`);
        for (const e of m.events?.emits ?? []) if (!String(e.type).startsWith(`${key}.`)) add(`sự kiện phát "${e.type}" phải bắt đầu "${key}."`, `emit-prefix:${e.type}`);
        for (const e of m.events?.subscribes ?? []) if (String(e.type).startsWith('bizcity.') && !coreEvents.has(e.type)) add(`sự kiện lõi "${e.type}" không có trong coreEvents`, `sub-unknown:${e.type}`);
        for (const s of m.settings ?? []) if (!String(s).startsWith(`bizcity.${under}.`)) add(`khoá cấu hình "${s}" phải dưới "bizcity.${under}." (R-MATRIX-3)`, `setting-prefix:${s}`);
        if (m.data?.schema && m.data.schema !== `mod_${under}`) add(`data.schema phải là "mod_${under}"`, 'data-schema');
        // CONF-MAN-6: sổ cái
        const submits = new Set((m.ledger?.submits ?? []).map((s) => s.docType));
        for (const s of submits) if (!docTypes.has(s)) add(`docType "${s}" không có trong bizcity_ledger_intake@1`, `doctype-unknown:${s}`);
        for (const d of m.documents ?? []) for (const l of d.ledger ?? []) if (!submits.has(l.docType)) add(`${d.type} nộp "${l.docType}" nhưng ledger.submits không khai`, `doctype-undeclared:${l.docType}`);
        // CONF-MAN-7: slot, hook
        for (const s of m.extensions?.slots ?? []) if (!slots.has(s.slot)) add(`slot "${s.slot}" không có trong Extension §3`, `slot:${s.slot}`);
        for (const h of m.extensions?.hooks ?? []) if (!hooks.has(h.hook)) add(`hook "${h.hook}" không có trong Extension §4`, `hook:${h.hook}`);
        // CONF-MAN-4: workflow (chỉ khi tệp có thật — ví dụ trong docs không kèm tệp YAML)
        for (const d of m.documents ?? []) {
          if (!d.workflow) continue;
          const wf = isExample ? null : ctx.repo.read(d.workflow);
          if (wf == null) { if (!isExample) add(`không thấy tệp workflow ${d.workflow}`, `wf-missing:${d.workflow}`); continue; }
          for (const g of wf.matchAll(/group:\s*([a-z_]+)/g)) if (!groups.has(g[1])) add(`${d.workflow}: nhóm trạng thái "${g[1]}" ngoài 5 nhóm chuẩn`, `wf-group:${g[1]}`);
        }
      }
      return { examined: metrics.manifests, findings, metrics };
    },
  },
  {
    id: 'SC-CON-3',
    title: 'JSON mẫu docs/api/vi-du hợp lệ theo bizcity_ledger_intake@1',
    gate: 'DOCS', contract: 'bizcity_ledger_intake', rules: ['R-QG-7', 'R-EVENT-7'], conf: [], tier: 1, enforce: 'ratchet', weight: 3, targets: ['repo'],
    run(ctx) {
      const files = ctx.repo.files({ under: ['docs/api/vi-du'], ext: ['.json'] });
      const findings = [];
      for (const f of files) {
        const data = ctx.repo.json(f);
        if (!data.docType && data.docKey && data.reason !== undefined) continue; // mẫu huỷ (POST /documents/cancel), khuôn khác
        for (const e of ctx.validate(INTAKE_SCHEMA, data).slice(0, 3)) findings.push(ctx.finding(f, null, `${e.path}: ${e.message}`, `${e.path}:${e.keyword}`));
      }
      return { examined: files.length, findings, notes: ['Phần chạy thật (gửi vào và đòi posted) vẫn là apps/api/test/api-examples.test.ts'] };
    },
  },
  {
    id: 'SC-CON-4',
    title: 'Bảng năng lực và danh mục hợp đồng nhất quán (bizcity-standard.json ↔ tệp ↔ README ↔ CANON)',
    gate: 'DOCS', contract: 'contracts', rules: ['R-QG-9'], conf: ['CONF-MAN-2'], tier: 1, enforce: 'block', weight: 3, targets: ['repo'],
    run(ctx) {
      const std = ctx.repo.json(STANDARD);
      const findings = [];
      const add = (msg, key) => findings.push(ctx.finding(STANDARD, null, msg, key ?? msg));
      const readme = ctx.repo.read('docs/contracts/README.md') ?? '';
      const canon = ctx.repo.read('docs/00-CANON.md') ?? '';
      for (const [name, c] of Object.entries({ ...std.contracts, ...std.kernelContracts })) {
        if (c.doc && !ctx.repo.exists(c.doc)) add(`${name}: không thấy ${c.doc}`, `doc:${name}`);
        if (c.schema && !ctx.repo.exists(c.schema)) add(`${name}: không thấy ${c.schema}`, `schema:${name}`);
        if (!readme.includes(`${name}@`)) add(`${name} chưa có trong docs/contracts/README.md`, `readme:${name}`);
        if (!canon.includes(`${name}@`)) add(`${name} chưa có trong docs/00-CANON.md §4`, `canon:${name}`);
        if (c.doc) {
          // Đầu tệp = 6 dòng đầu, không tính dòng dấu thay đổi R-SIG đặt ngay dưới tiêu đề (docs/rules/RULE-SIGNATURE.md).
          const head = (ctx.repo.read(c.doc) ?? '').split('\n').filter((l) => !STAMP_RE.test(l)).slice(0, 6).join('\n');
          if (c.version && !head.includes(c.version)) add(`${name}: đầu tệp ${c.doc} không ghi phiên bản ${c.version}`, `version:${name}`);
        }
      }
      const ids = new Set();
      for (const cap of std.capabilities) {
        if (ids.has(cap.id)) add(`năng lực "${cap.id}" khai hai lần`, `dup:${cap.id}`);
        ids.add(cap.id);
        if (!['available', 'planned', 'deprecated'].includes(cap.status)) add(`năng lực "${cap.id}": trạng thái lạ ${cap.status}`, `status:${cap.id}`);
        if (cap.status === 'planned' && !cap.phase) add(`năng lực "${cap.id}" planned nhưng không ghi phase`, `phase:${cap.id}`);
        if (cap.contract && !(cap.contract in { ...std.contracts, ...std.kernelContracts })) add(`năng lực "${cap.id}" trỏ hợp đồng lạ ${cap.contract}`, `contract:${cap.id}`);
      }
      const available = std.capabilities.filter((c) => c.status === 'available').length;
      return { examined: std.capabilities.length + Object.keys(std.contracts).length, findings, metrics: { capabilities: std.capabilities.length, available } };
    },
  },
  {
    id: 'SC-CON-5',
    title: 'Mã luật (R-*, STD-*, CONF-*) khai đúng một lần, liên tục; mọi mã được nhắc tới đều có định nghĩa',
    gate: 'DOCS', contract: 'contracts', rules: [], conf: [], tier: 2, enforce: 'ratchet', weight: 2, targets: ['repo'],
    run(ctx) {
      const files = ctx.repo.files({ under: ['docs', 'AGENTS.md', 'tests/conformance'], ext: ['.md', '.mjs'] });
      const defined = new Map(); const findings = [];
      for (const f of files.filter((x) => x.endsWith('.md'))) {
        ctx.repo.lines(f).forEach((t, i) => {
          // Ô đầu chỉ chứa mã (có thể kèm *(T0)*) mới là định nghĩa; ô "<mã> (một phần)" là nhắc lại.
          const m = /^\|\s*\*{0,2}((?:R|STD|CONF)-[A-Z]+-\d+)\*{0,2}\s*(?:\*\([^)]*\)\*)?\s*\|/.exec(t);
          if (!m) return;
          if (defined.has(m[1])) findings.push(ctx.finding(f, i + 1, `${m[1]} đã khai ở ${defined.get(m[1])}`, `dup:${m[1]}`));
          else defined.set(m[1], `${f}:${i + 1}`);
        });
      }
      const groups = new Map();
      for (const id of defined.keys()) { const p = id.replace(/-\d+$/, ''); groups.set(p, [...(groups.get(p) ?? []), Number(id.split('-').pop())]); }
      for (const [p, nums] of groups) {
        const max = Math.max(...nums);
        for (let n = 1; n <= max; n++) if (!nums.includes(n)) findings.push(ctx.finding(defined.get(`${p}-${max}`).split(':')[0], null, `${p}-${n} bị hở (có tới ${p}-${max})`, `gap:${p}-${n}`));
      }
      for (const f of files) {
        ctx.repo.lines(f).forEach((t, i) => {
          for (const m of t.matchAll(/\b((?:R|STD|CONF)-[A-Z]+-\d+)\b/g)) {
            // Mã luật của hệ sinh thái (plugin bizcity-twin-ai, Hub) được trích dẫn, không định nghĩa ở repo này.
            if (/^R-(SETUP|LLM|TOKEN|USAGE|WALLET|MCP|TAA)-/.test(m[1])) continue;
            if (!defined.has(m[1])) findings.push(ctx.finding(f, i + 1, `nhắc ${m[1]} nhưng không nơi nào định nghĩa`, `undef:${m[1]}`));
          }
        });
      }
      return { examined: defined.size, findings: dedupe(findings), metrics: { rules: defined.size, prefixes: groups.size } };
    },
  },
  {
    id: 'SC-CON-6',
    title: 'Mã lỗi: tài liệu ↔ ERROR_CODES ↔ bảng năng lực khớp nhau',
    gate: 'DOCS', contract: 'bizcity_api', rules: ['R-API-2', 'STD-ACT-5'], conf: [], tier: 1, enforce: 'block', weight: 2, targets: ['repo'],
    run(ctx) {
      const src = ctx.repo.read('packages/contracts/src/api.ts') ?? '';
      const block = /ERROR_CODES\s*=\s*\{([\s\S]*?)\}/.exec(src)?.[1] ?? '';
      const code = new Set([...block.matchAll(/:\s*'([A-Z_]+)'/g)].map((m) => m[1]));
      const std = ctx.repo.json(STANDARD).errorCodes ?? { available: [], planned: [] };
      const doc = ctx.repo.read('docs/contracts/BIZCITY-API-v1.md') ?? '';
      const findings = [];
      for (const c of std.available) if (!code.has(c)) findings.push(ctx.finding(STANDARD, null, `${c} ghi available nhưng không có trong ERROR_CODES`, `missing:${c}`));
      for (const c of code) {
        if (!std.available.includes(c)) findings.push(ctx.finding('packages/contracts/src/api.ts', null, `${c} có trong code nhưng bảng năng lực không ghi available`, `unlisted:${c}`));
        if (!doc.includes(c)) findings.push(ctx.finding('docs/contracts/BIZCITY-API-v1.md', null, `${c} chưa có trong bảng mã lỗi của bizcity_api@1`, `undocumented:${c}`));
      }
      return { examined: code.size + std.planned.length, findings, metrics: { available: code.size, planned: std.planned.length } };
    },
  },
  {
    id: 'SC-CON-7',
    title: 'Biến môi trường đọc trong code có trong .env.example hoặc settings registry',
    gate: 'DOCS', contract: 'bizcity_settings', rules: ['R-MATRIX-2', 'R-MATRIX-8'], conf: [], tier: 1, enforce: 'ratchet', weight: 2, targets: ['repo'],
    run(ctx) {
      // Nơi được coi là "đã khai": mẫu .env, registry, compose, tài liệu vận hành.
      const known = ['.env.example', 'docs/contracts/bizcity-settings.registry.json', 'docker-compose.yml', ...ctx.repo.files({ under: ['docs/ops'], ext: ['.md'] })]
        .map((f) => ctx.repo.read(f) ?? '').join('\n');
      const vars = new Map();
      for (const h of ctx.repo.grep(/process\.env\.[A-Z_]+/, { under: ['apps/api/src'], ext: ['.ts'] })) {
        for (const m of h.text.matchAll(/process\.env\.([A-Z][A-Z0-9_]+)/g)) if (!vars.has(m[1])) vars.set(m[1], h);
      }
      const envTs = ctx.repo.read('apps/api/src/config/env.ts') ?? '';
      for (const m of envTs.matchAll(/^\s+([A-Z][A-Z0-9_]+):/gm)) if (!vars.has(m[1])) vars.set(m[1], { file: 'apps/api/src/config/env.ts', line: null });
      const findings = [];
      for (const [v, h] of vars) if (!new RegExp(`\\b${v}\\b`).test(known)) findings.push(ctx.finding(h.file, h.line, `${v} chưa khai ở .env.example, registry, docker-compose.yml hay docs/ops`, v));
      return { examined: vars.size, findings };
    },
  },
];

function dedupe(list) {
  const seen = new Set();
  return list.filter((f) => { const k = `${f.file}|${f.key}`; if (seen.has(k)) return false; seen.add(k); return true; });
}
