// [2026-10-30 09:58 AM Johnny Chu - Chu Hoàng Anh] PHASE-002 — nhãn lớp @bizcity-layer, đồ thị phụ thuộc mốc, bản nháp API module-sdk.
/**
 * Chiều phụ thuộc giữa các lớp (TARGET-LAYOUT §2: LAYOUT-1, LAYOUT-2, LAYOUT-4; ADR-0005) trên apps/api/src, đo bằng đồ thị
 * import của lib/depgraph.mjs. Cạnh ngược chiều có sẵn lúc mở check (mốc docs/audits/deps-2026-10-30.*) nằm trong baseline;
 * cạnh mới là đỏ. Thay dependency-cruiser ở PHASES 1.4 cho đến khi có packages/* thật.
 */
import { buildGraph, nodeLabel } from '../../lib/depgraph.mjs';

export default {
  id: 'SC-LAYER-2',
  title: 'Import giữa các lớp đúng chiều: Platform không biết Kernel, danh mục không import Kernel, module không import module khác',
  gate: 'CONF-STATIC', contract: 'bizcity_module', rules: ['R-BOUND-10', 'R-BOUND-1'], tier: 1, enforce: 'ratchet', weight: 3, targets: ['repo'],
  run(ctx) {
    const g = buildGraph({ files: ctx.repo.files({ under: ['apps/api/src'] }), read: (f) => ctx.repo.read(f) });
    const byId = new Map(g.nodes.map((n) => [n.id, n]));
    const findings = [];
    for (const e of g.edges) {
      if (e.allowed) continue;
      const from = byId.get(e.from); const to = byId.get(e.to);
      const s = e.samples[0];
      findings.push(ctx.finding(s.file, s.line,
        `${from.layer} ${nodeLabel(from)} import ${to.layer} ${nodeLabel(to)} (${e.count} chỗ) — ngược chiều lớp TARGET-LAYOUT §2`,
        `${from.group}[${from.layer}]->${to.group}[${to.layer}]`));
    }
    return { examined: g.edges.length, findings, metrics: { nodes: g.nodes.length, edges: g.edges.length } };
  },
};
