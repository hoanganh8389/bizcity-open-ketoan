#!/usr/bin/env node
// [2026-11-02 06:49 PM Johnny Chu - Chu Hoàng Anh] TIEN-DO — cột "Tiến độ" của docs/phases/README.md tính từ lộ trình máy đọc, không gõ tay
/**
 * Cột "Tiến độ" trong bảng docs/phases/README.md = trung bình tiến độ các việc lộ trình mà README của phase khai ở dòng
 * `> **Việc lộ trình:** …` — tiến độ từng việc lấy từ chính phép chấm lộ trình của bộ kiểm chuẩn (tests/conformance/lib/roadmap.mjs:
 * tín hiệu check / năng lực / tay trong docs/standard/roadmap.json). Phase không khai việc lộ trình nào (mở rộng, chờ đưa vào lộ trình)
 * thì ghi "—": tiến độ của nó đọc ở 40-MASTER-CHECKLIST.md của phase.
 *
 *   node scripts/tien-do-phase.mjs           # chạy bộ kiểm, in bảng cũ → mới, không ghi
 *   node scripts/tien-do-phase.mjs --write   # ghi cột Tiến độ vào docs/phases/README.md
 *
 * Cột "Trạng thái" vẫn viết tay (câu ngắn: còn gì, chờ ai) — script chỉ báo dòng nào có số lệch để người sửa câu cho khớp.
 */
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const README = path.join(ROOT, 'docs/phases/README.md');
const SCOREBOARD = path.join(ROOT, 'tests/conformance/output/latest/scoreboard.json');
const write = process.argv.includes('--write');

// 1. Chấm lộ trình bằng bộ kiểm (ghi tests/conformance/output/latest/scoreboard.json).
const run = spawnSync(process.execPath, [path.join(ROOT, 'tests/conformance/selfcheck.mjs')], { cwd: ROOT, encoding: 'utf8' });
if (!fs.existsSync(SCOREBOARD)) {
  console.error('Bộ kiểm không ghi được bảng điểm:\n' + (run.stderr || run.stdout).slice(-2000));
  process.exit(2);
}
const roadmap = JSON.parse(fs.readFileSync(SCOREBOARD, 'utf8')).roadmap;
if (!roadmap?.items) {
  console.error('Bảng điểm không có phần lộ trình (docs/standard/roadmap.json?)');
  process.exit(2);
}
const progress = new Map(roadmap.items.map((i) => [i.id, i.progress]));

// 2. Mỗi phase: việc lộ trình khai trong README của phase → trung bình.
const phaseDir = path.join(ROOT, 'docs/phases');
const pct = new Map();
for (const d of fs.readdirSync(phaseDir).filter((x) => /^PHASE-\d{3}-/.test(x))) {
  const text = fs.readFileSync(path.join(phaseDir, d, 'README.md'), 'utf8');
  const line = text.match(/^> \*\*Việc lộ trình:\*\*(.*)$/m)?.[1] ?? '';
  const ids = [...line.matchAll(/\b\d+\.\d+b?\b/g)].map((m) => m[0]).filter((id) => progress.has(id));
  pct.set(d, ids.length ? `${Math.round(ids.reduce((s, id) => s + progress.get(id), 0) / ids.length)}%` : '—');
}

// 3. Cột thứ 6 (Tiến độ) của từng dòng bảng.
const lines = fs.readFileSync(README, 'utf8').split('\n');
const changes = [];
const out = lines.map((l) => {
  const dir = l.match(/^\| \[\d{3} [^\]]*\]\((PHASE-\d{3}-[^/)]+)\/README\.md\)/)?.[1];
  if (!dir || !pct.has(dir)) return l;
  const cells = l.split(' | ');
  if (cells.length !== 7) { console.warn(`bỏ qua (không đủ 7 cột): ${dir}`); return l; }
  const want = pct.get(dir);
  if (cells[5].trim() === want) return l;
  changes.push([dir, cells[5].trim(), want]);
  cells[5] = want;
  return cells.join(' | ');
});

console.log(`Lộ trình: ${roadmap.overall}% · đang ở Phase ${roadmap.currentPhase}`);
if (!changes.length) {
  console.log('Cột Tiến độ đã khớp.');
} else {
  for (const [d, a, b] of changes) console.log(`  ${d.padEnd(48)} ${a.padStart(5)} → ${b}`);
  if (write) {
    fs.writeFileSync(README, out.join('\n'));
    console.log(`Đã ghi ${changes.length} dòng. Xem lại cột Trạng thái của các dòng trên cho khớp số mới.`);
  } else {
    console.log('Chưa ghi — chạy lại với --write.');
  }
}
