// [2026-11-01 04:13 PM Johnny Chu - Chu Hoàng Anh] ADR-0010 — OpenTelemetry từ lõi (PHASE-018 W5): span ở khớp nối Platform + cổng Kernel, lọc thuộc tính, traceparent qua outbox
/**
 * SC-OBS-2 — truy vết theo ADR-0010 (R-OBS-7, R-OBS-8):
 *   1. Chỉ packages/platform/src/core/tracing.ts import @opentelemetry/*. Kernel, module, add-in tạo span qua Platform (withSpan, traced,
 *      ctx.trace.step) — tên span / thuộc tính đồng đều, không lộ dữ liệu, không thêm phụ thuộc vào Kernel (R-KER-8).
 *   2. Khoá thuộc tính `bizcity.*` viết trong mã (khoá đối tượng, setAttribute) ở tệp dùng core/tracing phải có trong
 *      TRACE_ATTRIBUTES của core/tracing.ts. Bộ lọc lúc chạy vẫn bỏ khoá lạ — check này báo sớm ở PR để không ai tưởng
 *      thuộc tính đã ra Tempo, và để thêm khoá mới phải sửa danh sách + bảng OBSERVABILITY §1.1 cùng PR.
 */
// [2026-11-01 05:30 PM Johnny Chu - Chu Hoàng Anh] PHASE-010 — tracing.ts theo Platform sang packages/platform; quét cả apps/api và hai gói
const SRCS = ['apps/api/src', 'packages/platform/src', 'packages/kernel/src'];
const TRACING = 'packages/platform/src/core/tracing.ts';
const OTEL_IMPORT = /(?:from\s+|import\s*\(\s*)['"]@opentelemetry\//;
const ATTR_KEY = /['"](bizcity\.[a-z0-9_.]+)['"]\s*:|setAttribute\(\s*['"](bizcity\.[a-z0-9_.]+)['"]/g;

export default {
  id: 'SC-OBS-2',
  title: 'Truy vết: chỉ core/tracing.ts import @opentelemetry/*; thuộc tính bizcity.* của span có trong danh sách cho phép',
  gate: 'CONF-STATIC', contract: 'quality', rules: ['R-OBS-7', 'R-OBS-8'], conf: [], tier: 1, enforce: 'block', weight: 2, targets: ['repo'],
  run(ctx) {
    const files = ctx.repo.files({ under: SRCS, ext: ['.ts'] });
    if (!files.length) return { examined: 0, findings: [], notes: [`chưa có ${SRCS[0]}`] };
    const tracingText = ctx.repo.read(TRACING);
    const block = tracingText ? /TRACE_ATTRIBUTES[^=]*=\s*new Set\(\[([\s\S]*?)\]\)/.exec(tracingText)?.[1] : undefined;
    const allowed = new Set([...(block ?? '').matchAll(/['"]([a-z0-9_.]+)['"]/g)].map((m) => m[1]));

    const findings = [];
    for (const f of files) {
      if (f === TRACING) continue;
      const text = ctx.repo.read(f) ?? '';
      const lines = text.split('\n');
      lines.forEach((line, i) => {
        if (OTEL_IMPORT.test(line)) {
          findings.push(ctx.finding(f, i + 1, 'import @opentelemetry/* ngoài core/tracing.ts — tạo span qua withSpan / ctx.trace.step (R-OBS-7)', `import:${f}`));
        }
      });
      if (!block || !/tracing\.js['"]/.test(text)) continue;
      lines.forEach((line, i) => {
        for (const m of line.matchAll(ATTR_KEY)) {
          const key = m[1] ?? m[2];
          if (!allowed.has(key)) {
            findings.push(ctx.finding(f, i + 1, `thuộc tính span ${key} không có trong TRACE_ATTRIBUTES (core/tracing.ts) — bộ lọc sẽ bỏ; thêm khoá thì sửa danh sách + OBSERVABILITY §1.1 (R-OBS-8)`, `attr:${key}`));
          }
        }
      });
    }
    return { examined: files.length, findings, ...(block ? {} : { notes: [`${TRACING} chưa có TRACE_ATTRIBUTES: bỏ qua kiểm thuộc tính`] }) };
  },
};
