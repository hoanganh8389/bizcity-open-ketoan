// [2026-10-29 11:31 PM Johnny Chu - Chu Hoàng Anh] PHASE-001 — lộ trình máy đọc bám Phase, ma trận mảng × Phase.
/**
 * docs/standard/roadmap.json (bizcity_roadmap@1) đúng khuôn và khớp PHASES.md — để tiến độ trên bảng điểm đáng tin.
 */
import { discover } from '../../lib/discover.mjs';
import { ROADMAP_FILE } from '../../lib/roadmap.mjs';

const SCHEMA = 'tests/conformance/schema/roadmap.schema.json';
const SIGNAL_KINDS = ['check', 'noFinding', 'readiness', 'capability', 'file', 'noFile', 'glob', 'fileContains', 'coverage', 'standardStable', 'manual'];

export default {
  id: 'SC-RMP-1',
  title: 'Lộ trình máy đọc: đúng khuôn, tín hiệu trỏ check / năng lực có thật, thứ tự không vòng, khớp PHASES.md',
  gate: 'DOCS', contract: 'docs', rules: [], conf: [], tier: 1, enforce: 'block', weight: 2, targets: ['repo'],
  async run(ctx) {
    const rm = ctx.repo.json(ROADMAP_FILE);
    if (!rm) return { examined: 0, findings: [ctx.finding(ROADMAP_FILE, null, 'thiếu tệp lộ trình', 'missing')] };
    const findings = [];
    const add = (msg, key) => findings.push(ctx.finding(ROADMAP_FILE, null, msg, key));
    for (const e of ctx.validate(SCHEMA, rm)) add(`schema ${e.path}: ${e.message}`, `schema:${e.path}:${e.keyword}`);
    if (findings.length) return { examined: 1, unitBy: 'key', findings };

    const checkIds = new Set((await discover()).map((c) => c.id));
    const caps = new Set(ctx.standard().capabilities.map((c) => c.id));
    const phases = new Set(rm.phases.map((p) => p.id));
    const ids = new Map();
    for (const it of rm.items) {
      if (ids.has(it.id)) add(`việc ${it.id} khai hai lần`, `dup:${it.id}`);
      ids.set(it.id, it);
      if (!phases.has(it.phase)) add(`việc ${it.id}: phase ${it.phase} không có`, `phase:${it.id}`);
      if (!it.id.startsWith(`${it.phase}.`)) add(`việc ${it.id} không thuộc phase ${it.phase}`, `phase-id:${it.id}`);
      for (const a of it.areas) if (!(a in rm.areas)) add(`việc ${it.id}: mảng "${a}" chưa khai trong areas`, `area:${it.id}:${a}`);
      for (const s of it.done) {
        const kinds = SIGNAL_KINDS.filter((k) => k in s);
        if (kinds.length !== 1) add(`việc ${it.id}: mỗi tín hiệu đúng một loại (đang có ${kinds.join(', ') || 'không loại nào'})`, `kind:${it.id}`);
        const ref = s.check ?? s.noFinding?.check ?? s.readiness?.check;
        if (ref && !checkIds.has(ref)) add(`việc ${it.id}: check ${ref} không tồn tại`, `check:${it.id}:${ref}`);
        if (s.capability && !caps.has(s.capability)) add(`việc ${it.id}: năng lực ${s.capability} không có trong bizcity-standard.json`, `cap:${it.id}:${s.capability}`);
        if (s.doneAt && !s.manual) add(`việc ${it.id}: doneAt chỉ dùng cho tín hiệu manual`, `doneAt:${it.id}`);
        if (s.manual && s.doneAt && !s.by) add(`việc ${it.id}: việc tay đánh dấu xong phải ghi "by"`, `by:${it.id}`);
      }
    }
    for (const it of rm.items) for (const a of it.after ?? []) if (!ids.has(a)) add(`việc ${it.id}: after ${a} không có`, `after:${it.id}:${a}`);
    // vòng trong after
    const state = new Map();
    const visit = (id, path) => {
      if (state.get(id) === 'done') return;
      if (state.get(id) === 'open') { add(`vòng thứ tự: ${[...path, id].join(' → ')}`, `cycle:${id}`); return; }
      state.set(id, 'open');
      for (const a of ids.get(id)?.after ?? []) visit(a, [...path, id]);
      state.set(id, 'done');
    };
    for (const id of ids.keys()) visit(id, []);

    // Khớp PHASES.md: mọi mã việc trong bảng PHASES có trong roadmap và ngược lại
    const phasesMd = ctx.repo.read('docs/standard/PHASES.md');
    if (phasesMd) {
      const inMd = new Set([...phasesMd.matchAll(/^\|\s*(\d+\.\d+[a-z]?)\s*\|/gm)].map((m) => m[1]));
      for (const id of inMd) if (!ids.has(id)) add(`PHASES.md có việc ${id} nhưng roadmap.json không`, `md-only:${id}`);
      for (const id of ids.keys()) if (!inMd.has(id)) add(`roadmap.json có việc ${id} nhưng PHASES.md không`, `json-only:${id}`);
    }
    return { examined: rm.items.length, unitBy: 'key', findings, metrics: { items: rm.items.length, phases: rm.phases.length } };
  },
};
