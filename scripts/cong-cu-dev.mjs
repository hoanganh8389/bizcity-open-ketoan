#!/usr/bin/env node
// [2026-11-11 12:30 AM Johnny Chu - Chu Hoàng Anh] PHASE-034 — B5a (S034-8): sinh tiêu chí T1..T6 của docs/standard/cong-cu-dev.json từ repo
/**
 *   node scripts/cong-cu-dev.mjs           # in bảng, không ghi
 *   node scripts/cong-cu-dev.mjs --write   # ghi lại trường `criteria` của từng công cụ
 * Phần khai báo (code, page, api, sources, singleInstall) sửa tay; phần `criteria` chỉ do script này ghi — SC-DEV-2 báo khi lệch.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { CRITERIA, computeCriteria } from '../tests/conformance/checks/devtools/devtools.lib.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const FILE = 'docs/standard/cong-cu-dev.json';
const abs = (rel) => path.join(root, rel);
const walk = (dir, out = []) => {
  let ents = []; try { ents = fs.readdirSync(abs(dir), { withFileTypes: true }); } catch { return out; }
  for (const e of ents) { const rel = `${dir}/${e.name}`; if (e.name === 'node_modules' || e.name === 'dist') continue; if (e.isDirectory()) walk(rel, out); else out.push(rel); }
  return out;
};
const r = {
  read: (rel) => { try { return fs.readFileSync(abs(rel), 'utf8'); } catch { return null; } },
  exists: (rel) => fs.existsSync(abs(rel)),
  files: ({ under, ext }) => under.flatMap((u) => walk(u)).filter((f) => !ext || ext.some((x) => f.endsWith(x))),
};
const board = JSON.parse(r.read(FILE));
for (const t of board.tools) t.criteria = computeCriteria(r, t);
for (const t of board.tools) console.log(`${t.code.padEnd(6)} ${t.label.padEnd(18)} ${CRITERIA.map(([k]) => (t.criteria[k].state === 'co' ? '✓' : '·')).join(' ')}`);
if (process.argv.includes('--write')) { fs.writeFileSync(abs(FILE), JSON.stringify(board, null, 2) + '\n'); console.log(`\nĐã ghi ${FILE}`); }
else console.log('\n(không ghi; --write để ghi)');
