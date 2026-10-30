/**
 * docs/phases/PHASE-NNN-*: mỗi việc lộ trình (roadmap.json) và mỗi mã checklist công bố (CONG-BO-KIEN-TRUC §6, G1-..G3-..) thuộc
 * đúng một thư mục phase — để kế hoạch, checklist con và bằng chứng của một việc có một chỗ, không trùng, không sót.
 * README của phase khai hai dòng: `> **Việc lộ trình:** 2.1, 2.14` và `> **Checklist công bố:** G1-05` (không có thì ghi —).
 */
import { ROADMAP_FILE } from '../../lib/roadmap.mjs';

const DIR = 'docs/phases';
const CONG_BO = 'docs/CONG-BO-KIEN-TRUC.md';
const NAME = /^PHASE-\d{3}-[A-Z0-9]+(?:-[A-Z0-9]+)*$/;

export default {
  id: 'SC-PHASE-1',
  title: 'Thư mục phase: mỗi việc lộ trình và mã checklist G thuộc đúng một phase, phase có README + 40-MASTER-CHECKLIST',
  gate: 'DOCS', contract: 'docs', rules: [], conf: [], tier: 1, enforce: 'block', weight: 1, targets: ['repo'],
  async run(ctx) {
    if (!ctx.repo.isDir(DIR)) return { examined: 0, findings: [], notes: [`chưa có ${DIR}`] };
    const findings = [];
    const add = (file, msg, key) => findings.push(ctx.finding(file, null, msg, key));

    const roadmap = new Set((ctx.repo.json(ROADMAP_FILE)?.items ?? []).map((i) => i.id));
    const congBo = ctx.repo.read(CONG_BO);
    const gIds = congBo == null ? null : new Set([...congBo.matchAll(/^\| (G\d-\d\d) \|/gm)].map((m) => m[1]));
    const owner = new Map();

    const dirs = ctx.repo.list(DIR).filter((d) => d.startsWith('PHASE') && ctx.repo.isDir(`${DIR}/${d}`));
    for (const d of dirs) {
      const readme = `${DIR}/${d}/README.md`;
      if (!NAME.test(d)) { add(`${DIR}/${d}`, `tên thư mục phải dạng PHASE-NNN-TEN-VIET-HOA (đang "${d}")`, `name:${d}`); continue; }
      if (!ctx.repo.exists(`${DIR}/${d}/40-MASTER-CHECKLIST.md`)) add(`${DIR}/${d}`, 'thiếu 40-MASTER-CHECKLIST.md', `checklist:${d}`);
      const text = ctx.repo.read(readme);
      if (text == null) { add(readme, 'thiếu README.md', `readme:${d}`); continue; }
      const rLine = text.match(/^> \*\*Việc lộ trình:\*\*(.*)$/m);
      const gLine = text.match(/^> \*\*Checklist công bố:\*\*(.*)$/m);
      if (!rLine || !gLine) { add(readme, 'thiếu dòng "> **Việc lộ trình:**" hoặc "> **Checklist công bố:**"', `meta:${d}`); continue; }
      const ids = [...rLine[1].matchAll(/\b\d+\.\d+b?\b/g)].map((m) => m[0]);
      const gs = [...gLine[1].matchAll(/\bG\d-\d\d\b/g)].map((m) => m[0]);
      for (const id of ids) if (!roadmap.has(id)) add(readme, `việc ${id} không có trong ${ROADMAP_FILE}`, `unknown:${d}:${id}`);
      if (gIds) for (const g of gs) if (!gIds.has(g)) add(readme, `${g} không có trong ${CONG_BO} §6`, `unknown:${d}:${g}`);
      for (const id of [...ids, ...gs]) {
        if (owner.has(id) && owner.get(id) !== d) add(readme, `${id} đã thuộc ${owner.get(id)}`, `dup:${id}`);
        else owner.set(id, d);
      }
    }
    for (const id of roadmap) if (!owner.has(id)) add(ROADMAP_FILE, `việc ${id} chưa thuộc thư mục phase nào trong ${DIR}`, `unassigned:${id}`);
    if (gIds) for (const g of gIds) if (!owner.has(g)) add(CONG_BO, `${g} chưa thuộc thư mục phase nào trong ${DIR}`, `unassigned:${g}`);
    return { examined: dirs.length, unitBy: 'key', findings };
  },
};
