// [2026-11-03 02:00 PM Johnny Chu - Chu Hoàng Anh] PHASE-024 — ADR-0020 (R-GATE-10): SC-FIND-2 — mọi thông báo của Core dựng từ thư viện mã, không câu chữ tự do
/**
 * Tôn chỉ Core (ADR-0020, CANON §0): một ngôn ngữ là thư viện mã `bizcity_findings@1`. Code Core (Kernel, Platform, danh mục, route
 * hệ thống) gửi thông báo qua `notifyFinding` (dựng từ một mã: câu ngắn, vì sao, cách sửa, căn cứ), không gọi `sendNotification`
 * với câu chữ tự do. Được phép: chính core/notify.ts (định nghĩa + notifyFinding), và cửa `ctx.notify.send` cho module
 * (core/actions.ts, core/events.ts — câu chữ của module do module chịu, STD-*).
 */
const UNDER = ['packages/kernel/src', 'packages/platform/src', 'apps/api/src'];
const ALLOW = new Set(['packages/platform/src/core/notify.ts', 'packages/platform/src/core/actions.ts', 'packages/platform/src/core/events.ts']);

export default {
  id: 'SC-FIND-2',
  title: 'Thông báo của Core dựng từ thư viện mã (notifyFinding), không câu chữ tự do',
  gate: 'DOCS', contract: 'contracts', rules: ['R-GATE-10'], tier: 1, enforce: 'block', weight: 2, targets: ['repo'],
  run(ctx) {
    const opts = { under: UNDER, ext: ['.ts'], not: /(\/test\/|\.test\.ts$|\/phan-he\/)/ };
    const hits = ctx.repo.grep(/\bsendNotification\(/, { ...opts, skipComments: true }).filter((h) => !ALLOW.has(h.file));
    return {
      examined: ctx.repo.files(opts).length,
      findings: hits.map((h) => ctx.finding(h.file, h.line, 'gửi thông báo bằng câu chữ tự do — dùng notifyFinding(…, finding) với một mã của thư viện (R-GATE-10)', `free-text:${h.file}`)),
    };
  },
};
