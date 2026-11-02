// [2026-10-30 10:29 AM Johnny Chu - Chu Hoàng Anh] PHASE-003 — tự chẩn đoán L1 / L3, diagnostic_runs, khoá kỳ chặn khi sổ lỗi (PHASES 2.10).
// [2026-11-01 04:20 PM Johnny Chu - Chu Hoàng Anh] PHASE-010 — quét mã chẩn đoán trên LAYER_ROOTS (gồm packages/platform)
// [2026-11-02 03:10 AM Johnny Chu - Chu Hoàng Anh] PHASE-020 — nhận cả mã tầng L5 (Conformance Engine): kiểm L5 trong app cũng phải có bản lane DG-*
/**
 * R-DIAG-9 + R-DIAG-1: mỗi kiểm tự chẩn đoán trong app (apps/api/src: `code: 'X', layer: 'L1' | 'L3'`) có bản cùng mã trong lane
 * diagnostics của bộ kiểm (tests/conformance/diagnostics/*.diag.mjs, `code: 'X'`) — để chạy được trên bản sao trước khi vào endpoint,
 * và hai nơi nói cùng một mã. Mã chỉ có ở lane (chưa vào endpoint) thì không sao.
 */
import { LAYER_ROOTS } from '../../lib/layers.mjs';
const APP_CODE = /\bcode:\s*'([A-Z][A-Z0-9_]+)',\s*layer:\s*'L[0-5]'/g;
const LANE_CODE = /\bcode:\s*'([A-Z][A-Z0-9_]+)'/g;

export default {
  id: 'SC-DIAG-1',
  title: 'Mã tự chẩn đoán trong app có bản cùng mã ở lane diagnostics của bộ kiểm',
  gate: 'CONF-STATIC', contract: 'kernel', rules: ['R-DIAG-9', 'R-DIAG-1'], tier: 1, enforce: 'block', weight: 2, targets: ['repo'],
  run(ctx) {
    const lane = new Set();
    for (const f of ctx.repo.files({ under: ['tests/conformance/diagnostics'], ext: ['.mjs'] })) for (const m of (ctx.repo.read(f) ?? '').matchAll(LANE_CODE)) lane.add(m[1]);
    const findings = [];
    let examined = 0;
    for (const f of ctx.repo.files({ under: LAYER_ROOTS, ext: ['.ts'] })) {
      const text = ctx.repo.read(f) ?? '';
      for (const m of text.matchAll(APP_CODE)) {
        examined++;
        if (!lane.has(m[1])) {
          const line = text.slice(0, m.index).split('\n').length;
          findings.push(ctx.finding(f, line, `kiểm ${m[1]} có trong app nhưng không có check DG-* cùng mã ở tests/conformance/diagnostics/ (R-DIAG-9)`, m[1]));
        }
      }
    }
    return { examined, findings, metrics: { lane: lane.size } };
  },
};
