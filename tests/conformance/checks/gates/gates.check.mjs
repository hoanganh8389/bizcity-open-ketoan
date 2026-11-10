// [2026-11-11 02:10 AM Johnny Chu - Chu Hoàng Anh] PHASE-034 — B3b (S034-6, D034-11): SC-GATE-1 — sổ cổng kiểm (cong-kiem.json) khớp repo: trụ cột có thật, mọi mã có trụ cột, phần sinh khớp lần sinh lại
/**
 * SC-GATE-1 — docs/standard/cong-kiem.json (bizcity_gates@1):
 *   1. Mỗi `map[].pillars` là id có ở docs/standard/tru-cot.json.
 *   2. Mọi mã script dò được (chẩn đoán, cổng A / B / L, SC-* / DG-*, trigger CSDL) khớp ít nhất một dòng `map[]` — mã mới thì gắn trụ cột.
 *   3. `generated` đúng bằng lần sinh lại từ repo (gates.lib.mjs) — chạy `node scripts/cong-kiem.mjs --write` khi lệch (không sửa tay, R-CONT-7).
 */
import { generate, pillarsOf } from './gates.lib.mjs';

const FILE = 'docs/standard/cong-kiem.json';

export const checks = [
  {
    id: 'SC-GATE-1',
    title: 'Sổ cổng kiểm (cong-kiem.json) khớp repo: trụ cột có thật, mọi mã kiểm có trụ cột, phần sinh khớp lần sinh lại',
    gate: 'DOCS', contract: 'quality', rules: ['R-CONT-7'], conf: [], tier: 1, enforce: 'block', weight: 2, targets: ['repo'],
    run(ctx) {
      const findings = [];
      const b = ctx.repo.json(FILE);
      if (!b) return { examined: 0, unitBy: 'key', findings };
      const f = (msg, key) => findings.push(ctx.finding(FILE, null, msg, key));
      const pillars = new Set((ctx.repo.json('docs/standard/tru-cot.json')?.pillars ?? []).map((p) => p.id));
      (b.map ?? []).forEach((row, i) => { for (const p of row.pillars ?? []) if (!pillars.has(p)) f(`map[${i}] (${[].concat(row.match).join(', ')}): trụ cột "${p}" không có ở tru-cot.json`, `pillar:${i}:${p}`); });
      const r = { read: (x) => ctx.repo.read(x), exists: (x) => ctx.repo.exists(x), files: (o) => ctx.repo.files(o) };
      const g = generate(r);
      const all = [...g.codes.diag, ...g.codes.finding, ...g.ci.map((c) => c.id), ...g.triggers.map((t) => t.name)];
      for (const c of all) if (!pillarsOf(b.map, c)) f(`${c} chưa gắn trụ cột — thêm mẫu vào map[] của ${FILE}`, `unmapped:${c}`);
      for (const k of ['codes', 'tests', 'ci', 'triggers']) {
        if (JSON.stringify(g[k]) !== JSON.stringify(b.generated?.[k] ?? null)) f(`generated.${k} lệch với repo — chạy node scripts/cong-kiem.mjs --write rồi commit (không sửa tay)`, `stale:${k}`);
      }
      return { examined: all.length, unitBy: 'key', findings };
    },
  },
];
