// [2026-11-03 10:40 PM Johnny Chu - Chu Hoàng Anh] FLOW — SC-FLOW-1: bảng giữ chỗ docs/phases/CLAIMS.md đúng khuôn và các dòng không chồng phạm vi (R-FLOW-1 / 3 / 6)
/**
 * Kiểm TĨNH bảng giữ chỗ (check chỉ đọc qua ctx, không gọi git). Phần cần git — nhánh đang làm đã có dòng trên origin/main chưa,
 * tệp đổi có nằm trong phạm vi đã giữ chỗ không, đổi thứ dùng chung đã có chữ chốt chưa, nhánh đã gộp main và không xung đột —
 * ở `node scripts/nhan-viec.mjs kiem` (cùng cách với `so-tiep-theo.mjs kiem` cho số migration).
 */
import { CLAIMS_FILE, checkRegistry } from './flow.lib.mjs';
import { parseAllChecklists, viecProblems } from './board.lib.mjs';
import { readChecklists } from './board.check.mjs';

const RULE_FILE = 'docs/rules/RULE-FLOW.md';

export default {
  id: 'SC-FLOW-1',
  title: 'Bảng giữ chỗ CLAIMS.md đúng khuôn, các dòng đang làm không chồng phạm vi và mỗi nhánh một dòng (R-FLOW-1 / 3 / 6)',
  gate: 'DOCS', contract: 'docs', rules: ['R-FLOW-1', 'R-FLOW-3', 'R-FLOW-6'], conf: [], tier: 1, enforce: 'block', weight: 2, targets: ['repo'],
  run(ctx) {
    const md = ctx.repo.read(CLAIMS_FILE);
    if (md == null) {
      // Chưa có luật thì chưa có bảng (kho mẫu, module bên ngoài). Có luật mà mất bảng là lỗi.
      if (!ctx.repo.exists(RULE_FILE)) return { examined: 0, findings: [], notes: ['chưa có luật R-FLOW và bảng giữ chỗ'] };
      return { examined: 0, findings: [ctx.finding(CLAIMS_FILE, null, `thiếu ${CLAIMS_FILE} dù đã có ${RULE_FILE}`, 'missing')] };
    }
    const { rows, problems } = checkRegistry(md);
    // [2026-11-03 11:52 PM Johnny Chu - Chu Hoàng Anh] FLOW — FLOW-2: cột Việc — mã có thật trong checklist, không hai dòng cùng giữ (R-FLOW-8)
    const checklists = readChecklists(ctx);
    if (checklists.length) problems.push(...viecProblems(rows, parseAllChecklists(checklists).items));
    return {
      examined: rows.length,
      findings: problems.map((p) => ctx.finding(CLAIMS_FILE, p.line, p.message, p.key)),
      notes: [`${rows.length} dòng đang giữ chỗ`],
    };
  },
};
