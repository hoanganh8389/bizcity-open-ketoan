#!/usr/bin/env node
// [2026-11-02 11:40 PM Johnny Chu - Chu Hoàng Anh] PHASE-024 — S024-27 (ADR-0019, R-GATE-5): sinh trang tra mã docs/huong-dan/ma-loi/README.md từ thư viện phát hiện bizcity_findings@1
/**
 * Trang tra mã cho người đọc: mọi mã của hai cổng kiểm chuẩn, một bảng mỗi cổng, sinh từ packages/contracts (đọc `dist` — chạy
 * `npm run build -w @ketoan/contracts` trước). SC-FIND-1 báo khi trang thiếu / thừa mã so với danh mục nguồn.
 *
 *   node scripts/sinh-ma-loi.mjs           in khác biệt (không ghi)
 *   node scripts/sinh-ma-loi.mjs --write   ghi trang
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'docs/huong-dan/ma-loi/README.md');
const { FINDINGS_LIBRARY } = await import(new URL('../packages/contracts/dist/findings.js', import.meta.url).href);

const LEVEL = { block: '✘ chặn', warn: '⚠ cảnh báo', info: 'ℹ nhắc' };
const cell = (s) => String(s ?? '').replace(/\|/g, '\\|').replace(/\n/g, ' ');
const table = (gate) => [
  '| Mã | Mức | Bước | Nghĩa | Vì sao | Cách sửa | Luật |',
  '|---|---|---|---|---|---|---|',
  ...FINDINGS_LIBRARY.filter((f) => f.gate === gate).map((f) =>
    `| \`${f.code}\` | ${LEVEL[f.level]} | ${f.step} | ${cell(f.title)}${f.status === 'draft' ? ' *(nháp)*' : ''} | ${cell(f.why)} | ${cell(f.fix) || '—'} | ${cell(f.rule)}${f.learn && f.learn.startsWith('docs/') ? ` · [học](../../../${f.learn})` : ''} |`),
].join('\n');

const text = `# Tra mã phát hiện — hai cổng kiểm chuẩn
<!-- TỆP SINH TỰ ĐỘNG bởi scripts/sinh-ma-loi.mjs từ packages/contracts/src/{catalog-hint,intake-findings}.ts — không sửa tay; SC-FIND-1 kiểm. -->
<!-- [2026-11-02 11:40 PM Johnny Chu - Chu Hoàng Anh] PHASE-024 — trang tra mã bizcity_findings@1 (ADR-0019, R-GATE-5) -->

> Gặp một mã trong thông báo, trong phản hồi API hay ở Trạm kiểm tra đầu vào: tìm mã ở đây. Máy đọc: \`GET /api/v1/findings/<mã>\`
> (\`core.findings.explain\`, có cho trợ lý AI qua MCP). Luật: [R-GATE](../../rules/RULE-GATE.md) · hợp đồng
> [bizcity_findings@1](../../contracts/BIZCITY-FINDINGS-v1.md).
>
> **Mức:** ✘ chặn — giữ lại (danh mục → bản nháp; chứng từ → bể chờ), hết khi dữ liệu đúng · ⚠ cảnh báo — qua cổng khi ghi lý do,
> có bằng chứng · ℹ nhắc — chỉ để biết. *(nháp)* = nội dung chờ kế toán trưởng duyệt.

## Gate A — khai báo danh mục (${FINDINGS_LIBRARY.filter((f) => f.gate === 'A').length} mã)

${table('A')}

## Gate B — chứng từ trước khi ghi sổ (${FINDINGS_LIBRARY.filter((f) => f.gate === 'B').length} mã)

Bước L1 khuôn · L2 số học · L3 danh mục · L4 nghiệp vụ · L5 định khoản thử ([R-INTAKE](../../rules/RULE-INTAKE.md)).

${table('B')}
`;

let current = '';
try { current = readFileSync(OUT, 'utf8'); } catch { /* chưa có */ }
if (current === text) { console.log('Trang tra mã đã khớp thư viện.'); process.exit(0); }
if (process.argv.includes('--write')) {
  mkdirSync(path.dirname(OUT), { recursive: true });
  writeFileSync(OUT, text);
  console.log(`Đã ghi ${path.relative(ROOT, OUT)} (${FINDINGS_LIBRARY.length} mã).`);
} else {
  console.log(`Trang tra mã lệch thư viện (${FINDINGS_LIBRARY.length} mã). Chạy lại với --write.`);
  process.exit(1);
}
