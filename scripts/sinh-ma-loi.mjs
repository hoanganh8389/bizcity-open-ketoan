#!/usr/bin/env node
// [2026-11-07 10:20 PM Johnny Chu - Chu Hoàng Anh] PHASE-030 — S030-45 (ADR-0032): thêm cổng L — bảy mã LIB-* và mã luật riêng của từng thư viện (libraries/*/library.json)
// [2026-11-03 02:00 PM Johnny Chu - Chu Hoàng Anh] PHASE-024 — ADR-0020: cột Căn cứ (R-GATE-11); bỏ ghi chú nháp chờ kế toán trưởng
// [2026-11-02 11:40 PM Johnny Chu - Chu Hoàng Anh] PHASE-024 — S024-27 (ADR-0019, R-GATE-5): sinh trang tra mã docs/huong-dan/ma-loi/README.md từ thư viện phát hiện bizcity_findings@1
/**
 * Trang tra mã cho người đọc: mọi mã của hai cổng kiểm chuẩn, một bảng mỗi cổng, sinh từ packages/contracts (đọc `dist` — chạy
 * `npm run build -w @ketoan/contracts` trước). SC-FIND-1 báo khi trang thiếu / thừa mã so với danh mục nguồn.
 *
 *   node scripts/sinh-ma-loi.mjs           in khác biệt (không ghi)
 *   node scripts/sinh-ma-loi.mjs --write   ghi trang
 */
import { readFileSync, writeFileSync, mkdirSync, readdirSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'docs/huong-dan/ma-loi/README.md');
const { FINDINGS_LIBRARY } = await import(new URL('../packages/contracts/dist/findings.js', import.meta.url).href);

const LEVEL = { block: '✘ chặn', warn: '⚠ cảnh báo', info: 'ℹ nhắc' };
const cell = (s) => String(s ?? '').replace(/\|/g, '\\|').replace(/\n/g, ' ');
const LIB_DIR = path.join(ROOT, 'libraries');
/** Mã luật riêng của từng thư viện, theo thứ tự thư mục rồi thứ tự khai. */
const LIB_RULES = (existsSync(LIB_DIR) ? readdirSync(LIB_DIR).sort() : []).flatMap((d) => {
  const file = path.join(LIB_DIR, d, 'library.json');
  if (!existsSync(file)) return [];
  const lib = JSON.parse(readFileSync(file, 'utf8'));
  return (lib.rules ?? []).map((r) => ({ ...r, library: lib.id }));
});
const ruleTable = () => [
  '| Mã | Mức | Thư viện | Nghĩa | Vì sao | Cách sửa | Căn cứ |',
  '|---|---|---|---|---|---|---|',
  ...LIB_RULES.map((r) =>
    `| \`${r.code}\` | ${LEVEL[r.level]} | [\`${r.library}\`](../../../libraries/${r.library}/README.md) | ${cell(r.title)} | ${cell(r.why)} | ${cell(r.fix) || '—'} | ${(r.basis ?? []).map((b) => cell(b.ref)).join('; ') || '—'} |`),
].join('\n');
const table = (gate) => [
  '| Mã | Mức | Bước | Nghĩa | Vì sao | Cách sửa | Luật | Căn cứ |',
  '|---|---|---|---|---|---|---|---|',
  ...FINDINGS_LIBRARY.filter((f) => f.gate === gate).map((f) =>
    `| \`${f.code}\` | ${LEVEL[f.level]} | ${f.step} | ${cell(f.title)} | ${cell(f.why)} | ${cell(f.fix) || '—'} | ${cell(f.rule)}${f.learn && f.learn.startsWith('docs/') ? ` · [học](../../../${f.learn})` : ''} | ${f.basis.map((b) => b.title).join('; ')} |`),
].join('\n');

const text = `# Tra mã phát hiện — hai cổng kiểm chuẩn
<!-- TỆP SINH TỰ ĐỘNG bởi scripts/sinh-ma-loi.mjs từ packages/contracts/src/{catalog-hint,intake-findings,library-findings}.ts và libraries/*/library.json — không sửa tay; SC-FIND-1 kiểm. -->
<!-- [2026-11-02 11:40 PM Johnny Chu - Chu Hoàng Anh] PHASE-024 — trang tra mã bizcity_findings@1 (ADR-0019, R-GATE-5) -->

> Gặp một mã trong thông báo, trong phản hồi API hay ở Trạm kiểm tra đầu vào: tìm mã ở đây. Máy đọc: \`GET /api/v1/findings/<mã>\`
> (\`core.findings.explain\`, có cho trợ lý AI qua MCP). Luật: [R-GATE](../../rules/RULE-GATE.md) · hợp đồng
> [bizcity_findings@1](../../contracts/BIZCITY-FINDINGS-v1.md).
>
> **Mức:** ✘ chặn — giữ lại (danh mục → bản nháp; chứng từ → bể chờ), hết khi dữ liệu đúng · ⚠ cảnh báo — qua cổng khi ghi lý do,
> có bằng chứng · ℹ nhắc — chỉ để biết. **Căn cứ:** văn bản trong [danh mục căn cứ pháp lý](../../can-cu/01-danh-muc-van-ban.md), "Quy ước phần mềm" = quy ước kỹ thuật của Core.

## Gate A — khai báo danh mục (${FINDINGS_LIBRARY.filter((f) => f.gate === 'A').length} mã)

${table('A')}

## Gate B — chứng từ trước khi ghi sổ (${FINDINGS_LIBRARY.filter((f) => f.gate === 'B').length} mã)

Bước L1 khuôn · L2 số học · L3 danh mục · L4 nghiệp vụ · L5 định khoản thử ([R-INTAKE](../../rules/RULE-INTAKE.md)).

${table('B')}

## Cổng L — thư viện dùng chung (${FINDINGS_LIBRARY.filter((f) => f.gate === 'L').length} mã chung · ${LIB_RULES.length} mã luật)

Bộ kiểm của mọi thư viện [bizcity_library@1](../../contracts/BIZCITY-LIBRARY-v1.md) trả các mã này kèm **gợi ý** lấy từ chính thư viện (mã gần nhất, mã thay thế, giá trị đúng ngày). Máy đọc: \`POST /api/v1/libraries/<id>/validate\`.

${table('L')}

### Mã luật riêng của từng thư viện

${ruleTable()}
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
