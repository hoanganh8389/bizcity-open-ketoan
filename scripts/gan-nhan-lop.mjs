#!/usr/bin/env node
/**
 * Gắn nhãn lớp `// @bizcity-layer <lớp> <đích>` ở dòng đầu mọi tệp apps/api/src (PHASES 1.2), theo bảng
 * tests/conformance/lib/layers.mjs (chép từ REUSE-MAP §3).
 *
 *   node scripts/gan-nhan-lop.mjs           đếm: bao nhiêu tệp có nhãn đúng / sai / thiếu / bảng chưa phủ
 *   node scripts/gan-nhan-lop.mjs --write   ghi nhãn (thêm dòng đầu, hoặc sửa nhãn cũ lệch bảng)
 *
 * Mã thoát 1 khi còn tệp thiếu / sai nhãn hoặc bảng chưa phủ (để CI dùng được). Check SC-LAYER-1 kiểm cùng điều này.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { LAYER_ROOTS, expectedLayer, readTag, tagLine } from '../tests/conformance/lib/layers.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const write = process.argv.includes('--write');

function walk(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const abs = path.join(dir, e.name);
    if (e.isDirectory()) walk(abs, out);
    else if (/\.tsx?$/.test(e.name)) out.push(path.relative(ROOT, abs).split(path.sep).join('/'));
  }
  return out;
}

const stat = { ok: 0, added: 0, fixed: 0, missing: [], wrong: [], unmapped: [] };
const byLayer = {};
for (const file of LAYER_ROOTS.flatMap((r) => walk(path.join(ROOT, r))).sort()) {
  const want = expectedLayer(file);
  if (!want) { stat.unmapped.push(file); continue; }
  byLayer[want.layer] = (byLayer[want.layer] ?? 0) + 1;
  const abs = path.join(ROOT, file);
  const text = fs.readFileSync(abs, 'utf8');
  const have = readTag(text);
  if (have && have.layer === want.layer && have.target === want.target) { stat.ok++; continue; }
  if (!write) { (have ? stat.wrong : stat.missing).push(have ? `${file}: ${have.layer} ${have.target} ≠ ${want.layer} ${want.target}` : file); continue; }
  const eol = text.includes('\r\n') ? '\r\n' : '\n';
  const body = text.replace(/^﻿/, '');
  const next = have ? tagLine(want) + body.slice(body.split(/\r?\n/, 1)[0].length) : tagLine(want) + eol + body;
  fs.writeFileSync(abs, next);
  have ? stat.fixed++ : stat.added++;
}

const total = stat.ok + stat.added + stat.fixed + stat.missing.length + stat.wrong.length + stat.unmapped.length;
const good = stat.ok + stat.added + stat.fixed;
console.log(`Nhãn @bizcity-layer: ${good}/${total} tệp (${total ? Math.round((good / total) * 100) : 100}%)` +
  (write ? ` — thêm ${stat.added}, sửa ${stat.fixed}` : ''));
console.log(`Theo lớp: ${Object.entries(byLayer).map(([k, v]) => `${k} ${v}`).join(' · ')}`);
for (const [label, list] of [['Thiếu nhãn', stat.missing], ['Nhãn lệch bảng', stat.wrong], ['Bảng lớp chưa phủ (thêm vào tests/conformance/lib/layers.mjs)', stat.unmapped]]) {
  if (!list.length) continue;
  console.log(`${label} (${list.length}):`);
  for (const x of list) console.log(`  ${x}`);
}
if (!write && (stat.missing.length || stat.wrong.length)) console.log('Chạy lại với --write để ghi nhãn.');
process.exit(stat.missing.length || stat.wrong.length || stat.unmapped.length ? 1 : 0);
