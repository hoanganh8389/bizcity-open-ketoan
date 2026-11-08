#!/usr/bin/env node
// [2026-11-07 10:20 PM Johnny Chu - Chu Hoàng Anh] PHASE-030 — S030-45 (ADR-0032, S030-35 lịch nghỉ lễ): sinh thư viện vn.ngay-nghi-le từ bảng ngày nghỉ (chủ dự án xuất từ Erp-vn 07/11) — mã là ngày, căn cứ verified: false
/**
 *   node libraries/vn.ngay-nghi-le/build.mjs          sinh lại library.json
 *   node libraries/vn.ngay-nghi-le/build.mjs --check  chỉ so
 * Nguồn CSV: Ngày,Tên ngày nghỉ,Loại,Căn cứ. Dùng cho đếm ngày làm việc (K-030-10).
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { serialize, stamp } from '../../scripts/thu-vien/thu-vien.mjs';

const DIR = path.dirname(fileURLToPath(import.meta.url));
export const SOURCE = 'sources/ngay-nghi-le.csv';
const KINDS = { 'Ngày lễ, Tết': 'le-tet', 'Nghỉ bù': 'nghi-bu' };

/** Tách một dòng CSV có ngoặc kép. */
function cells(line) {
  const out = []; let cur = ''; let q = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (q) { if (ch === '"' && line[i + 1] === '"') { cur += '"'; i++; } else if (ch === '"') q = false; else cur += ch; }
    else if (ch === '"') q = true; else if (ch === ',') { out.push(cur); cur = ''; } else cur += ch;
  }
  out.push(cur);
  return out.map((s) => s.trim());
}

export function build(readSource, prev) {
  const rows = readSource(SOURCE).replace(/^﻿/, '').split(/\r?\n/).filter((l) => l.trim());
  const head = cells(rows.shift());
  if (head.join('|') !== 'Ngày|Tên ngày nghỉ|Loại|Căn cứ') throw new Error(`tiêu đề CSV lạ: ${head.join(', ')}`);
  const items = rows.map((l) => {
    const [date, name, kindText, basis] = cells(l);
    const kind = KINDS[kindText];
    if (!kind) throw new Error(`${date}: loại "${kindText}" chưa ánh xạ`);
    return {
      code: date,
      name,
      group: date.slice(0, 4),
      status: 'active',
      verified: false,
      payload: { date, kind },
      basis: basis ? basis.split(';').map((s) => ({ ref: s.trim(), verified: false })).filter((b) => b.ref) : [],
    };
  });
  const lib = {
    contract: 'bizcity_library@1',
    id: 'vn.ngay-nghi-le',
    kind: 'calendar',
    title: 'Ngày nghỉ lễ, Tết',
    description: 'Ngày nghỉ hưởng nguyên lương theo Bộ luật Lao động 2019 Điều 112 và lịch nghỉ hằng năm. Dùng để đếm ngày làm việc (hạn thanh toán, chấm công, hạn nộp).',
    version: '1.0.0',
    owner: 'kế toán trưởng / nhân sự',
    sources: [{ title: 'Ngày nghỉ lễ Tết (lfood.holiday) xuất từ Erp-vn', kind: 'reference', date: '2026-11-07', note: 'Chưa đủ: thiếu Giỗ Tổ Hùng Vương và Quốc khánh 2026 — bổ sung theo thông báo lịch nghỉ chính thức' }],
    generatedBy: 'libraries/vn.ngay-nghi-le/build.mjs',
    itemSchema: {
      type: 'object',
      required: ['date', 'kind'],
      additionalProperties: false,
      properties: {
        date: { type: 'string', format: 'date' },
        kind: { enum: ['le-tet', 'nghi-bu'], description: 'le-tet = ngày lễ, Tết theo luật; nghi-bu = nghỉ bù khi lễ trùng ngày nghỉ hằng tuần' },
      },
    },
    selector: { value: 'code', label: '{code} · {name}', search: ['code', 'name'], group: 'group', filters: [{ field: 'group', label: 'Năm' }], sort: ['code'] },
    items,
  };
  return stamp(lib, prev, { date: '2026-11-07', notes: `Bản đầu: ${items.length} ngày từ Erp-vn (07/11/2026)` });
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const file = path.join(DIR, 'library.json');
  const current = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : null;
  const next = serialize(build((n) => fs.readFileSync(path.join(DIR, n), 'utf8'), current ? JSON.parse(current) : null));
  if (process.argv.includes('--check')) { if (next !== current) { console.error('library.json lệch bản sinh lại'); process.exit(1); } console.log('khớp'); process.exit(0); }
  if (next !== current) fs.writeFileSync(file, next);
  console.log(`${next === current ? 'không đổi' : 'đã ghi'} libraries/vn.ngay-nghi-le/library.json`);
}
