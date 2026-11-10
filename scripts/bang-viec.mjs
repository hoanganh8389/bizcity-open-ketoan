#!/usr/bin/env node
// [2026-11-03 11:52 PM Johnny Chu - Chu Hoàng Anh] FLOW — FLOW-2 (R-FLOW-8): bảng việc sinh từ main — BANG-VIEC.md + bang-viec.json từ checklist phase và CLAIMS.md
/**
 * Một bảng việc cho cả dự án, sinh từ nguồn trên main (docs/rules/RULE-FLOW.md §4). Không sửa tay hai tệp sinh.
 *
 *   node scripts/bang-viec.mjs            # in tổng số theo cột + lỗi khuôn checklist; không ghi
 *   node scripts/bang-viec.mjs --write    # ghi docs/phases/BANG-VIEC.md và docs/phases/bang-viec.json
 *   node scripts/bang-viec.mjs --check    # thoát 1 nếu tệp sinh lệch nguồn (dùng ở workflow GitHub Pages; selfcheck có SC-FLOW-3)
 *
 * Đổi trạng thái việc: sửa 40-MASTER-CHECKLIST.md của phase hoặc CLAIMS.md, rồi --write trong cùng PR.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { BOARD_JSON, BOARD_MD, CHECKLIST_RE, README_RE, buildBoard, parseAllChecklists, renderJson, renderMd, viecProblems } from '../tests/conformance/checks/flow/board.lib.mjs';
import { CLAIMS_FILE, parseClaims } from '../tests/conformance/checks/flow/flow.lib.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = new Set(process.argv.slice(2));
const read = (rel) => { try { return fs.readFileSync(path.join(ROOT, rel), 'utf8').replace(/\r\n/g, '\n'); } catch { return null; } };

const phasesDir = path.join(ROOT, 'docs/phases');
const files = fs.readdirSync(phasesDir, { withFileTypes: true })
  .filter((d) => d.isDirectory())
  .flatMap((d) => [`docs/phases/${d.name}/40-MASTER-CHECKLIST.md`, `docs/phases/${d.name}/README.md`])
  // [2026-11-11 04:00 AM Johnny Chu - Chu Hoàng Anh] PHASE-035 — B1 (S035-3, R-FLOW-10): mỗi việc mang phân hệ (README phase `**Phân hệ:**`, dòng việc ghi đè `{key}`) và mặt F1..F8 theo từ khoá — nguồn cho HT11 Modules & mức đạt
  .filter((f) => (CHECKLIST_RE.test(f) || README_RE.test(f)) && read(f) != null)
  .sort()
  .map((f) => ({ path: f, text: read(f) }));

const { items, problems } = parseAllChecklists(files);
const claims = parseClaims(read(CLAIMS_FILE) ?? '');
const board = buildBoard(items, claims.rows);
const out = { [BOARD_MD]: renderMd(board), [BOARD_JSON]: renderJson(board) };
const issues = [...problems.map((p) => `${p.file}:${p.line}  ${p.message}`), ...claims.problems.map((p) => `${CLAIMS_FILE}:${p.line ?? ''}  ${p.message}`), ...viecProblems(claims.rows, items).map((p) => `${CLAIMS_FILE}:${p.line}  ${p.message}`)];

console.log(`Bảng việc: ${items.length} việc trong ${files.filter((f) => CHECKLIST_RE.test(f.path)).length} checklist · ${items.filter((i) => i.modules?.length).length} việc có phân hệ · ${claims.rows.length} dòng giữ chỗ`);
for (const c of board.columns) console.log(`  ${c.label.padEnd(16)} ${String(c.count).padStart(4)}`);
if (issues.length) {
  console.log(`\n${issues.length} lỗi khuôn (SC-FLOW-1 / SC-FLOW-4) — sửa ở nguồn:`);
  for (const s of issues) console.log(`  ✘ ${s}`);
}

if (args.has('--write')) {
  for (const [rel, text] of Object.entries(out)) fs.writeFileSync(path.join(ROOT, rel), text);
  console.log(`\nĐã ghi ${BOARD_MD}, ${BOARD_JSON}.`);
} else if (args.has('--check')) {
  const stale = Object.entries(out).filter(([rel, text]) => read(rel) !== text).map(([rel]) => rel);
  if (stale.length) {
    console.log(`\n✘ lệch nguồn: ${stale.join(', ')} — chạy node scripts/bang-viec.mjs --write rồi commit`);
    process.exit(1);
  }
  console.log('\n✔ tệp sinh khớp nguồn');
} else {
  console.log('\n(không ghi; --write để ghi, --check để kiểm)');
}
if (issues.length && (args.has('--check') || args.has('--write'))) process.exitCode = 1;
