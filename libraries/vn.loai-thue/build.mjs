#!/usr/bin/env node
// [2026-11-09 03:30 PM Johnny Chu - Chu Hoàng Anh] PHASE-030 — S030-52 (PHASE-030 · 26 §11.1): sinh thư viện vn.loai-thue từ danh mục loại thuế GTGT chuẩn; KHÔNG mang account_code (tài khoản đi qua AccountResolver), verified: false
/**
 *   node libraries/vn.loai-thue/build.mjs          sinh lại library.json
 *   node libraries/vn.loai-thue/build.mjs --check  chỉ so
 * Nguồn: sources/loai-thue.jsonl (bản chép của db/seeds/loai-thue.jsonl — cột code, name, rate, direction, account_code, report_group, is_active).
 * `account_code` bị bỏ có chủ đích: thư viện không mang số tài khoản (26 §11.1).
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { serialize, stamp } from '../../scripts/thu-vien/thu-vien.mjs';

const DIR = path.dirname(fileURLToPath(import.meta.url));
export const SOURCE = 'sources/loai-thue.jsonl';
const COLS = ['code', 'name', 'rate', 'direction', 'account_code', 'report_group', 'is_active'];
const GROUPS = ['KCT', 'KKK', '0', '5', '8', '10'];
const DIRECTION_TEXT = { output: 'đầu ra', input: 'đầu vào' };

export function build(readSource, prev) {
  const lines = readSource(SOURCE).replace(/^﻿/, '').split(/\r?\n/).filter((l) => l.trim());
  const head = JSON.parse(lines.shift());
  if (head._bang !== 'loai-thue' || head._cot.join('|') !== COLS.join('|')) throw new Error(`tiêu đề nguồn lạ: ${JSON.stringify(head._cot)}`);
  const items = lines.map((l) => JSON.parse(l)).map((r) => {
    if (!GROUPS.includes(String(r.report_group))) throw new Error(`${r.code}: nhóm bảng kê "${r.report_group}" chưa ánh xạ`);
    if (!DIRECTION_TEXT[r.direction]) throw new Error(`${r.code}: chiều "${r.direction}" chưa ánh xạ`);
    return {
      code: r.code,
      name: r.name,
      group: DIRECTION_TEXT[r.direction],
      status: r.is_active === false ? 'deprecated' : 'active',
      verified: false,
      payload: { rate: Number(r.rate), direction: r.direction, reportGroup: String(r.report_group) },
    };
  });
  const lib = {
    contract: 'bizcity_library@1',
    id: 'vn.loai-thue',
    kind: 'code-list',
    title: 'Loại thuế GTGT',
    description: 'Loại thuế GTGT chuẩn: mã, tên, thuế suất, chiều (đầu ra / đầu vào) và nhóm trên bảng kê. Không mang số tài khoản — tài khoản thuế lấy từ chính sách hạch toán qua AccountResolver.',
    version: '1.0.0',
    owner: 'kế toán thuế',
    sources: [{ title: 'Danh mục loại thuế (ACC43) trong db/seeds/loai-thue.jsonl', kind: 'internal', date: '2026-11-09', note: 'Danh mục mẫu của công ty cung cấp; chưa đối chiếu với văn bản thuế hiện hành (verified: false). Cột account_code của nguồn không đưa vào thư viện.' }],
    generatedBy: 'libraries/vn.loai-thue/build.mjs',
    itemSchema: {
      type: 'object',
      required: ['rate', 'direction', 'reportGroup'],
      additionalProperties: false,
      properties: {
        rate: { type: 'number', minimum: 0, maximum: 100, description: 'thuế suất %, 0 cho loại không chịu thuế / không kê khai' },
        direction: { enum: ['output', 'input'], description: 'output = thuế đầu ra (bán); input = thuế đầu vào (mua)' },
        reportGroup: { enum: GROUPS, description: 'nhóm trên bảng kê: KCT không chịu thuế · KKK không kê khai · 0 · 5 · 8 · 10 (%)' },
      },
    },
    selector: { value: 'code', label: '{code} · {name}', search: ['code', 'name'], group: 'group', filters: [{ field: 'group', label: 'Chiều' }], sort: ['code'] },
    items,
  };
  return stamp(lib, prev, { date: '2026-11-09', notes: `Bản đầu: ${items.length} loại thuế từ db/seeds (không số tài khoản)` });
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const file = path.join(DIR, 'library.json');
  const current = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : null;
  const next = serialize(build((n) => fs.readFileSync(path.join(DIR, n), 'utf8'), current ? JSON.parse(current) : null));
  if (process.argv.includes('--check')) { if (next !== current) { console.error('library.json lệch bản sinh lại'); process.exit(1); } console.log('khớp'); process.exit(0); }
  if (next !== current) fs.writeFileSync(file, next);
  console.log(`${next === current ? 'không đổi' : 'đã ghi'} libraries/vn.loai-thue/library.json`);
}
