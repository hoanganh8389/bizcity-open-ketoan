// [2026-10-30 09:58 AM Johnny Chu - Chu Hoàng Anh] PHASE-002 — nhãn lớp @bizcity-layer, đồ thị phụ thuộc mốc, bản nháp API module-sdk.
/**
 * Nhãn lớp đầu tệp (PHASES 1.2, R-BOUND-10): mọi tệp apps/api/src có `// @bizcity-layer <lớp> <đích>` khớp bảng lớp
 * lib/layers.mjs (REUSE-MAP §3). Tệp mới thiếu nhãn → `node scripts/gan-nhan-lop.mjs --write`; bảng chưa phủ → thêm dòng.
 */
import { LAYER_ROOTS, expectedLayer, readTag } from '../../lib/layers.mjs';

export default {
  id: 'SC-LAYER-1',
  title: 'Mọi tệp apps/api/src có nhãn @bizcity-layer khớp bảng lớp (REUSE-MAP)',
  gate: 'CONF-STATIC', contract: 'bizcity_module', rules: ['R-BOUND-10'], tier: 1, enforce: 'block', weight: 2, targets: ['repo'],
  run(ctx) {
    const files = ctx.repo.files({ under: LAYER_ROOTS, ext: ['.ts', '.tsx'] });
    const findings = [];
    const byLayer = {};
    for (const file of files) {
      const want = expectedLayer(file);
      if (!want) { findings.push(ctx.finding(file, null, 'bảng lớp chưa phủ tệp này: thêm dòng vào tests/conformance/lib/layers.mjs (theo REUSE-MAP §3)', `unmapped:${file}`)); continue; }
      byLayer[want.layer] = (byLayer[want.layer] ?? 0) + 1;
      const have = readTag(ctx.repo.read(file) ?? '');
      if (!have) findings.push(ctx.finding(file, 1, `thiếu nhãn dòng đầu "// @bizcity-layer ${want.layer} ${want.target}" — chạy node scripts/gan-nhan-lop.mjs --write`, `missing:${file}`));
      else if (have.layer !== want.layer || have.target !== want.target) findings.push(ctx.finding(file, 1, `nhãn "${have.layer} ${have.target}" lệch bảng lớp "${want.layer} ${want.target}"`, `wrong:${file}`));
    }
    return { examined: files.length, findings, metrics: byLayer };
  },
};
