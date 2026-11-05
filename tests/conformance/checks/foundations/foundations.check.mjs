// [2026-11-05 11:20 PM Johnny Chu - Chu Hoàng Anh] PHASE-029 — E1: SC-CORE-1 (ADR-0028 D028-11..13, chữ chốt PHASE-029 · 30 §4) — repo giữ sáu năng lực lõi; mức đạt đi theo tín hiệu chạy được (R-ECP-SCORE)
/**
 * Nguồn: `docs/standard/nen-mong.json` (bizcity_foundations@1). Không đọc mã để đoán — chỉ đối chiếu điều tệp khai với repo:
 *   1. đúng sáu lõi C1..C6; capability có trong bizcity-standard.json; lõi `dat` thì mọi capability `available`;
 *   2. đường dẫn mã tồn tại; hợp đồng có trong CANON §4;
 *   3. đúng 17 trụ cột 01..17, mỗi trụ cột thuộc một lõi (hoặc `SDK`) và một nhóm A–D; đủ ECP-01..13, mỗi ECP có trụ cột;
 *   4. tín hiệu `co` trỏ tới check / mã chẩn đoán / tệp test có thật; tín hiệu `nhanh` / `chua` đã có thật thì phải nâng lên `co`;
 *   5. trụ cột hoặc lõi mức `dat` không còn tín hiệu `chua` (lõi tính qua các trụ cột của nó).
 */

const SOURCE = 'docs/standard/nen-mong.json';
const STANDARD = 'docs/standard/bizcity-standard.json';
const CANON = 'docs/00-CANON.md';
const CORES = ['C1', 'C2', 'C3', 'C4', 'C5', 'C6'];
const PILLARS = Array.from({ length: 17 }, (_, i) => String(i + 1).padStart(2, '0'));
const ECPS = Array.from({ length: 13 }, (_, i) => `ECP-${String(i + 1).padStart(2, '0')}`);
const GROUPS = ['A', 'B', 'C', 'D'];
const STATUSES = ['dat', 'mot-phan', 'tai-lieu', 'chua'];
const STATES = ['co', 'nhanh', 'chua'];
const KINDS = ['check', 'diag', 'test'];
/** Nơi tìm mã chẩn đoán (chuỗi `'MA_CHAN_DOAN'` trong mã nguồn). */
const DIAG_ROOTS = ['packages', 'apps/api/src'];

const lineOf = (lines, needle) => Math.max(1, lines.findIndex((l) => l.includes(needle)) + 1);

export const checks = [
  {
    id: 'SC-CORE-1',
    title: 'Sáu năng lực lõi (nen-mong.json) khớp repo: capability, mã, hợp đồng, 17 trụ cột, ECP; tín hiệu "chạy được" có thật; "đạt" không còn tín hiệu "chưa có" (R-ECP-SCORE)',
    // R-ECP-SCORE-1 / -2 có mã hai đoạn, lược đồ check@1 chỉ nhận R-XXX-n — dẫn luật ở tiêu đề.
    gate: 'CONF-STATIC', contract: 'contracts', rules: [], conf: [], tier: 1, enforce: 'block', weight: 3, targets: ['repo'],
    run(ctx) {
      const r = ctx.repo;
      const findings = [];
      const add = (needle, msg, key) => findings.push(ctx.finding(SOURCE, lineOf(lines, needle), msg, key));
      if (!r.exists(SOURCE)) return { examined: 0, findings: [ctx.finding(SOURCE, 1, `thiếu ${SOURCE} — bản đồ sáu năng lực lõi (ADR-0028 D028-11)`, 'source:missing')] };
      const lines = r.lines(SOURCE);
      let D;
      try { D = r.json(SOURCE); } catch (e) { return { examined: 1, findings: [ctx.finding(SOURCE, 1, `JSON hỏng: ${e.message}`, 'source:json')] }; }

      // Tra cứu repo một lần.
      const caps = new Map();
      const std = r.exists(STANDARD) ? r.json(STANDARD) : {};
      const capList = Array.isArray(std.capabilities) ? std.capabilities : Object.entries(std.capabilities ?? {}).map(([id, v]) => ({ id, ...v }));
      for (const c of capList) caps.set(c.id ?? c.key, c.status);
      const canon = r.read(CANON) ?? '';
      const checkIds = new Set();
      for (const f of r.files({ under: ['tests/conformance/checks', 'tests/conformance/diagnostics'], ext: ['.mjs'] })) {
        for (const m of (r.read(f) ?? '').matchAll(/\bid:\s*'((?:SC|DG)-[A-Z]+-\d+)'/g)) checkIds.add(m[1]);
      }
      let diagText = null;
      const diagExists = (code) => {
        diagText ??= r.files({ under: DIAG_ROOTS, ext: ['.ts'], not: /\.test\.ts$|\/test\/|node_modules|\/dist\// }).map((f) => r.read(f) ?? '').join('\n');
        return diagText.includes(`'${code}'`);
      };
      /** null = tham chiếu tự do (chưa có thật, không kiểm được); true / false = có / không. */
      const resolve = (s) => {
        if (s.kind === 'check') return /^(SC|DG)-[A-Z]+-\d+$/.test(s.ref) ? checkIds.has(s.ref) : null;
        if (s.kind === 'diag') return /^[A-Z][A-Z0-9_]+$/.test(s.ref) ? diagExists(s.ref) : null;
        if (s.kind === 'test') return /^[\w./-]+\.test\.(ts|mjs)$/.test(s.ref) ? r.exists(s.ref) : null;
        return null;
      };

      // 1–2. Lõi
      const cores = Array.isArray(D.cores) ? D.cores : [];
      const coreIds = cores.map((c) => c.id);
      for (const id of CORES) if (!coreIds.includes(id)) add('"cores"', `thiếu năng lực lõi ${id} — Core phải giữ đủ sáu (ADR-0028 D028-11)`, `core:missing:${id}`);
      for (const c of cores) {
        if (!CORES.includes(c.id)) add(`"id": "${c.id}"`, `lõi lạ ${c.id} — chỉ có C1..C6`, `core:unknown:${c.id}`);
        if (!STATUSES.includes(c.status)) add(`"id": "${c.id}"`, `lõi ${c.id}: mức "${c.status}" không hợp lệ`, `core:status:${c.id}`);
        if (!(c.capabilities ?? []).length) add(`"id": "${c.id}"`, `lõi ${c.id} không khai capability nào`, `core:nocap:${c.id}`);
        for (const cap of c.capabilities ?? []) {
          if (!caps.has(cap)) add(`"${cap}"`, `lõi ${c.id}: capability ${cap} không có trong ${STANDARD}`, `cap:unknown:${c.id}:${cap}`);
          else if (c.status === 'dat' && caps.get(cap) !== 'available') add(`"${cap}"`, `lõi ${c.id} ghi "đạt" nhưng capability ${cap} còn ${caps.get(cap)}`, `cap:planned:${c.id}:${cap}`);
        }
        for (const p of c.code ?? []) if (!r.exists(p)) add(`"${p}"`, `lõi ${c.id}: đường dẫn mã ${p} không có — sửa nen-mong.json cùng PR dời mã`, `code:${c.id}:${p}`);
        for (const k of c.contracts ?? []) if (!canon.includes(`\`${k}\``)) add(`"${k}"`, `lõi ${c.id}: hợp đồng ${k} không có trong CANON §4`, `contract:${c.id}:${k}`);
      }

      // 3. Trụ cột, nhóm, ECP
      const pillars = Array.isArray(D.pillars) ? D.pillars : [];
      const pids = pillars.map((p) => p.id);
      const missing = PILLARS.filter((id) => !pids.includes(id));
      const extra = pids.filter((id) => !PILLARS.includes(id) || pids.indexOf(id) !== pids.lastIndexOf(id));
      if (missing.length || extra.length) add('"pillars"', `phải đúng 17 trụ cột 01..17 — thiếu: ${missing.join(', ') || '—'}; lạ / trùng: ${[...new Set(extra)].join(', ') || '—'}`, 'pillars:set');
      const ecps = (D.ecp ?? []).map((e) => e.id);
      const ecpMissing = ECPS.filter((id) => !ecps.includes(id));
      if (ecpMissing.length) add('"ecp"', `thiếu nguyên tắc ${ecpMissing.join(', ')} (CANON §0.3)`, 'ecp:set');
      for (const e of ecps) if (!pillars.some((p) => (p.ecp ?? []).includes(e))) add(`"id": "${e}"`, `${e} không có trụ cột nào thi hành`, `ecp:uncovered:${e}`);

      // 4–5. Tín hiệu và mức
      const pillarHasGap = new Map();
      for (const p of pillars) {
        const at = `"id": "${p.id}"`;
        if (![...CORES, 'SDK'].includes(p.core)) add(at, `trụ cột ${p.id}: lõi "${p.core}" không hợp lệ (C1..C6 hoặc SDK)`, `pillar:core:${p.id}`);
        if (!GROUPS.includes(p.group)) add(at, `trụ cột ${p.id}: nhóm "${p.group}" không hợp lệ (A–D)`, `pillar:group:${p.id}`);
        if (!STATUSES.includes(p.status)) add(at, `trụ cột ${p.id}: mức "${p.status}" không hợp lệ`, `pillar:status:${p.id}`);
        for (const e of p.ecp ?? []) if (!ECPS.includes(e)) add(at, `trụ cột ${p.id}: nguyên tắc lạ ${e}`, `pillar:ecp:${p.id}:${e}`);
        let gap = false;
        for (const s of p.signals ?? []) {
          const key = `${p.id}:${s.kind}:${s.ref}`;
          if (!KINDS.includes(s.kind) || !STATES.includes(s.state)) { add(`"${s.ref}"`, `trụ cột ${p.id}: tín hiệu ${s.ref} sai khuôn (kind ${KINDS.join(' / ')}, state ${STATES.join(' / ')})`, `signal:shape:${key}`); continue; }
          const real = resolve(s);
          if (s.state === 'co' && real !== true) add(`"${s.ref}"`, `trụ cột ${p.id}: tín hiệu "chạy được" ${s.kind} ${s.ref} không có thật trong repo`, `signal:absent:${key}`);
          if (s.state !== 'co' && real === true) add(`"${s.ref}"`, `trụ cột ${p.id}: ${s.kind} ${s.ref} đã có trong repo — nâng trạng thái lên "co"`, `signal:stale:${key}`);
          if (s.state === 'chua') gap = true;
        }
        pillarHasGap.set(p.id, gap);
        if (p.status === 'dat' && gap) add(at, `trụ cột ${p.id} ghi "đạt" nhưng còn tín hiệu "chưa có" (R-ECP-SCORE-1)`, `dat:pillar:${p.id}`);
      }
      for (const c of cores) {
        if (c.status !== 'dat') continue;
        const open = pillars.filter((p) => p.core === c.id && pillarHasGap.get(p.id)).map((p) => p.id);
        if (open.length) add(`"id": "${c.id}"`, `lõi ${c.id} ghi "đạt" nhưng trụ cột ${open.join(', ')} còn tín hiệu "chưa có" (R-ECP-SCORE-1)`, `dat:core:${c.id}`);
      }
      return { examined: cores.length + pillars.length, findings };
    },
  },
];
