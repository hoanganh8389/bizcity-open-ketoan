// [2026-11-03 11:52 PM Johnny Chu - Chu Hoàng Anh] FLOW — FLOW-2 (R-FLOW-8): SC-FLOW-3 bảng việc sinh khớp nguồn; SC-FLOW-4 dòng checklist đúng khuôn
/**
 * Kiểm tĩnh, chỉ đọc qua ctx. Nguồn: docs/phases/*\/40-MASTER-CHECKLIST.md + docs/phases/CLAIMS.md. Khuôn: docs/rules/RULE-FLOW.md §4.
 */
import { BOARD_JSON, BOARD_MD, CHECKLIST_RE, README_RE, buildBoard, parseAllChecklists, renderJson, renderMd } from './board.lib.mjs';
import { CLAIMS_FILE, parseClaims } from './flow.lib.mjs';

/** Đọc mọi checklist của kho đang kiểm. */
export function readChecklists(ctx) {
  // [2026-11-11 04:00 AM Johnny Chu - Chu Hoàng Anh] PHASE-035 — B1 (S035-3, R-FLOW-10): mỗi việc mang phân hệ (README phase `**Phân hệ:**`, dòng việc ghi đè `{key}`) và mặt F1..F8 theo từ khoá — nguồn cho HT11 Modules & mức đạt
  return ctx.repo.files({ under: ['docs/phases'], ext: ['.md'] }).filter((f) => CHECKLIST_RE.test(f) || README_RE.test(f)).map((f) => ({ path: f, text: ctx.repo.read(f) ?? '' }));
}

export const checks = [
  {
    id: 'SC-FLOW-3',
    title: 'Bảng việc docs/phases/BANG-VIEC.md + bang-viec.json khớp nguồn (checklist phase + CLAIMS.md) — R-FLOW-8',
    gate: 'DOCS', contract: 'docs', rules: ['R-FLOW-8'], conf: [], tier: 1, enforce: 'block', weight: 2, targets: ['repo'],
    run(ctx) {
      const files = readChecklists(ctx);
      if (!files.length) return { examined: 0, findings: [], notes: ['chưa có checklist phase nào'] };
      const { items } = parseAllChecklists(files);
      const { rows } = parseClaims(ctx.repo.read(CLAIMS_FILE) ?? '');
      const board = buildBoard(items, rows);
      const findings = [];
      const fix = 'chạy node scripts/bang-viec.mjs --write rồi commit';
      for (const [file, want] of [[BOARD_MD, renderMd(board)], [BOARD_JSON, renderJson(board)]]) {
        const have = ctx.repo.read(file);
        if (have == null) findings.push(ctx.finding(file, null, `thiếu tệp sinh ${file} — ${fix}`, `thieu:${file}`));
        else if (have.replace(/\r\n/g, '\n') !== want) findings.push(ctx.finding(file, null, `${file} lệch nguồn (đổi checklist / CLAIMS mà chưa sinh lại) — ${fix}`, `lech:${file}`));
      }
      return { examined: items.length, findings, notes: [`${items.length} việc trong ${files.length} checklist`] };
    },
  },
  {
    id: 'SC-FLOW-4',
    title: 'Dòng việc S###-n trong checklist phase đúng khuôn: đủ ô theo tiêu đề, ô trạng thái bắt đầu bằng ☐ 🟡 ✅ ⛔ ⏸, mã không trùng — R-FLOW-8',
    gate: 'DOCS', contract: 'docs', rules: ['R-FLOW-8'], conf: [], tier: 1, enforce: 'block', weight: 1, targets: ['repo'],
    run(ctx) {
      const files = readChecklists(ctx);
      const { items, problems } = parseAllChecklists(files);
      return { examined: items.length + problems.length, findings: problems.map((p) => ctx.finding(p.file, p.line, p.message, p.key)) };
    },
  },
];
