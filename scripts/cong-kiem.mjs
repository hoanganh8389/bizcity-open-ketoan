#!/usr/bin/env node
// [2026-11-11 02:00 AM Johnny Chu - Chu Hoàng Anh] PHASE-034 — B3b (S034-6, D034-11): sinh phần `generated` của docs/standard/cong-kiem.json từ repo
/**
 *   node scripts/cong-kiem.mjs           # in số đếm + mã chưa gắn trụ cột, không ghi
 *   node scripts/cong-kiem.mjs --write   # ghi lại `generated` (mã, test của mã, bộ kiểm CI, trigger)
 * `map[]` (họ mã → trụ cột) sửa tay; `generated` chỉ do script này ghi — SC-GATE-1 báo khi lệch.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { generate, pillarsOf } from '../tests/conformance/checks/gates/gates.lib.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const FILE = 'docs/standard/cong-kiem.json';
const abs = (rel) => path.join(root, rel);
const walk = (dir, out = []) => {
  let ents = []; try { ents = fs.readdirSync(abs(dir), { withFileTypes: true }); } catch { return out; }
  for (const e of ents) { const rel = `${dir}/${e.name}`; if (['node_modules', 'dist', '.git'].includes(e.name)) continue; if (e.isDirectory()) walk(rel, out); else out.push(rel); }
  return out;
};
const r = {
  read: (rel) => { try { return fs.readFileSync(abs(rel), 'utf8'); } catch { return null; } },
  exists: (rel) => fs.existsSync(abs(rel)),
  files: ({ under, ext }) => under.flatMap((u) => walk(u)).filter((f) => !ext || ext.some((x) => f.endsWith(x))),
};
const board = JSON.parse(r.read(FILE));
board.generated = generate(r);
const g = board.generated;
const all = [...g.codes.diag, ...g.codes.finding, ...g.ci.map((c) => c.id), ...g.triggers.map((t) => t.name)];
const unmapped = all.filter((c) => !pillarsOf(board.map, c));
console.log(`mã chẩn đoán ${g.codes.diag.length} · mã cổng A/B/L ${g.codes.finding.length} · có test ${Object.keys(g.tests).length} · CI ${g.ci.length} (tự kiểm ${g.ci.filter((c) => c.selftest).length}) · trigger ${g.triggers.length}`);
if (unmapped.length) console.log(`chưa gắn trụ cột (${unmapped.length}): ${unmapped.join(', ')}`);
if (process.argv.includes('--write')) { fs.writeFileSync(abs(FILE), JSON.stringify(board, null, 2) + '\n'); console.log(`Đã ghi ${FILE}`); }
else console.log('(không ghi; --write để ghi)');
