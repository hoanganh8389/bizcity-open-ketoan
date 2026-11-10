// [2026-11-10 10:52 PM Johnny Chu - Chu Hoàng Anh] PHASE-022 — S022-22 (R-BLOCK-1 / 2, docs/rules/RULE-BLOCKED.md): SC-UI-1 — điều khiển bị chặn theo điều kiện phải nói lý do
/**
 * SC-UI-1: trong giao diện web (.tsx), một phần tử có `disabled` (hoặc `disabled={…}`) mà điều kiện KHÔNG chỉ là "đang xử lý"
 * (busy, pending, saving, loading… — R-BLOCK §1) thì phải mang lời giải thích: `title=`, `blocked=`, `reason=`,
 * `aria-describedby=`, hoặc nằm trong `<BlockedHint …>` (tối đa 3 dòng phía trên). Thiếu → phát hiện.
 * Bánh cóc: chỗ cũ ở baseline; chỗ mới phải có lý do. Khoá = điều kiện disabled (chuẩn hoá) + số thứ tự trong tệp, không có số dòng.
 * Phép kiểm tĩnh không thấy ô khoá bằng readOnly, nút bị giấu, dải thông báo đầu khối (R-BLOCK-4) — việc đó của RULE-REVIEW.
 */
const UNDER = ['apps/web/src'];
const BUSY_WORD = '[\\w.]*(?:busy|pending|ispending|saving|loading|submitting|working|running|uploading|exporting|importing|sending|posting|isfetching)\\w*';
const BUSY = new RegExp(`^!?${BUSY_WORD}(\\s*\\|\\|\\s*!?${BUSY_WORD})*$`, 'i');
const TAG = /<([A-Za-z][\w.]*)\b((?:[^<>{}]|\{(?:[^{}]|\{[^{}]*\})*\})*?)\bdisabled(?:=\{((?:[^{}]|\{[^{}]*\})*)\})?((?:[^<>{}]|\{(?:[^{}]|\{[^{}]*\})*\})*?)\/?>/gs;
const EXPLAINED = /\b(title|blocked|reason|aria-describedby)=/;

export default {
  id: 'SC-UI-1',
  title: 'Nút / ô bị chặn theo điều kiện nói vì sao và cách gỡ (title, blocked, BlockedHint) — R-BLOCK',
  gate: 'CONF-STATIC', contract: 'quality', rules: ['R-BLOCK-1', 'R-BLOCK-2'], tier: 1, enforce: 'ratchet', weight: 2, targets: ['repo'],
  run(ctx) {
    const files = ctx.repo.files({ under: UNDER, ext: ['.tsx'], not: /(^|\/)(test|tests|dist|node_modules)\/|\.test\.tsx$/ });
    const findings = []; let total = 0; let busy = 0; let explained = 0;
    for (const file of files) {
      const text = ctx.repo.read(file) ?? '';
      if (!text.includes('disabled')) continue;
      const seen = new Map();
      for (const m of text.matchAll(TAG)) {
        if (m[1] === 'BlockedHint') continue;
        total += 1;
        const expr = (m[3] ?? 'true').replace(/\s+/g, ' ').trim();
        if (BUSY.test(expr)) { busy += 1; continue; }
        const before = text.slice(Math.max(0, text.lastIndexOf('\n', Math.max(0, m.index - 1)) - 400), m.index);
        const wrapped = /<BlockedHint\b[^>]*>\s*$/.test(before.split('\n').slice(-3).join('\n'));
        if (EXPLAINED.test(m[2] + m[4]) || wrapped) { explained += 1; continue; }
        const n = (seen.get(expr) ?? 0) + 1; seen.set(expr, n);
        const line = text.slice(0, m.index).split('\n').length;
        findings.push(ctx.finding(file, line, `<${m[1]} disabled={${expr.slice(0, 80)}}> bị chặn mà không nói vì sao / cách gỡ — bọc <BlockedHint blocked={{ why, fix }}> hoặc ghi title (R-BLOCK-1)`, `${expr}#${n}`));
      }
    }
    return { examined: total, findings, metrics: { disabled: total, busy, explained, unexplained: findings.length }, notes: [`${total} chỗ disabled: ${busy} đang xử lý, ${explained} có lý do, ${findings.length} chưa có lý do`] };
  },
};
