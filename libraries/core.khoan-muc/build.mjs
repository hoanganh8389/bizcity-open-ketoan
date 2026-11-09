#!/usr/bin/env node
// [2026-11-09 03:30 PM Johnny Chu - Chu Hoàng Anh] PHASE-030 — S030-52 (PHASE-030 · 26 §11.1): sinh thư viện core.khoan-muc từ danh mục khoản mục chuẩn của công ty (cây cha – con); không dữ liệu của đơn vị, verified: false
/**
 *   node libraries/core.khoan-muc/build.mjs          sinh lại library.json
 *   node libraries/core.khoan-muc/build.mjs --check  chỉ so
 * Nguồn: sources/khoan-muc.jsonl (bản chép của db/seeds/khoan-muc.jsonl — cột code, name, parent_code, note, is_active).
 * Mã là khoản mục; `group` là khoản mục gốc của nhánh; payload giữ mã cha và cấp.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { serialize, stamp } from '../../scripts/thu-vien/thu-vien.mjs';

const DIR = path.dirname(fileURLToPath(import.meta.url));
export const SOURCE = 'sources/khoan-muc.jsonl';
const COLS = ['code', 'name', 'parent_code', 'note', 'is_active'];

export function build(readSource, prev) {
  const lines = readSource(SOURCE).replace(/^﻿/, '').split(/\r?\n/).filter((l) => l.trim());
  const head = JSON.parse(lines.shift());
  if (head._bang !== 'khoan-muc' || head._cot.join('|') !== COLS.join('|')) throw new Error(`tiêu đề nguồn lạ: ${JSON.stringify(head._cot)}`);
  const rows = lines.map((l) => JSON.parse(l));
  const byCode = new Map(rows.map((r) => [r.code, r]));
  const rootOf = (r, seen = new Set()) => {
    if (seen.has(r.code)) throw new Error(`${r.code}: cây khoản mục có vòng`);
    seen.add(r.code);
    if (!r.parent_code) return r.code;
    const p = byCode.get(r.parent_code);
    if (!p) throw new Error(`${r.code}: khoản mục cha ${r.parent_code} không có trong nguồn`);
    return rootOf(p, seen);
  };
  const levelOf = (r) => (r.parent_code ? 1 + levelOf(byCode.get(r.parent_code)) : 1);
  const items = rows.map((r) => ({
    code: r.code,
    name: r.name,
    group: rootOf(r),
    status: r.is_active === false ? 'deprecated' : 'active',
    verified: false,
    payload: { parentCode: r.parent_code ?? null, level: levelOf(r) },
    ...(r.note ? { hints: [{ kind: 'how', text: r.note }] } : {}),
  }));
  const lib = {
    contract: 'bizcity_library@1',
    id: 'core.khoan-muc',
    kind: 'code-list',
    title: 'Khoản mục chi phí',
    description: 'Cây khoản mục chi phí chuẩn (cha – con): mã khoản mục gắn vào bút toán chi phí để lên báo cáo theo khoản mục. Chỉ danh mục chuẩn — không có số tài khoản và không có dữ liệu của đơn vị.',
    version: '1.0.0',
    owner: 'kế toán trưởng',
    sources: [{ title: 'Danh mục khoản mục (ACC24) trong db/seeds/khoan-muc.jsonl', kind: 'internal', date: '2026-11-09', note: 'Danh mục mẫu của công ty cung cấp; chưa kế toán trưởng nào đối chiếu (verified: false)' }],
    generatedBy: 'libraries/core.khoan-muc/build.mjs',
    itemSchema: {
      type: 'object',
      required: ['parentCode', 'level'],
      additionalProperties: false,
      properties: {
        parentCode: { type: ['string', 'null'], description: 'mã khoản mục cha; null = khoản mục gốc' },
        level: { type: 'integer', minimum: 1, description: 'cấp trong cây, gốc = 1' },
      },
    },
    selector: { value: 'code', label: '{code} · {name}', search: ['code', 'name'], group: 'group', filters: [{ field: 'group', label: 'Khoản mục gốc' }], sort: ['code'] },
    items,
  };
  return stamp(lib, prev, { date: '2026-11-09', notes: `Bản đầu: ${items.length} khoản mục từ db/seeds` });
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const file = path.join(DIR, 'library.json');
  const current = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : null;
  const next = serialize(build((n) => fs.readFileSync(path.join(DIR, n), 'utf8'), current ? JSON.parse(current) : null));
  if (process.argv.includes('--check')) { if (next !== current) { console.error('library.json lệch bản sinh lại'); process.exit(1); } console.log('khớp'); process.exit(0); }
  if (next !== current) fs.writeFileSync(file, next);
  console.log(`${next === current ? 'không đổi' : 'đã ghi'} libraries/core.khoan-muc/library.json`);
}
