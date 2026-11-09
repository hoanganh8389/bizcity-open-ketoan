#!/usr/bin/env node
// [2026-11-08 01:30 AM Johnny Chu - Chu Hoàng Anh] PHASE-030 — S030-45 (ADR-0032 D-LIB-10): thư viện authz.tgs-nhom — 28 nhóm vai trò mẫu TGS đưa về khuôn bizcity_library@1; đọc tệp sinh của W5 đợt 2 (docs/standard/phan-quyen/tgs-nhom.json), không sửa tệp đó
/**
 *   node libraries/authz.tgs-nhom/build.mjs          sinh lại library.json
 *   node libraries/authz.tgs-nhom/build.mjs --check  chỉ so
 * Thư viện chỉ để tra / chọn nhóm mẫu. Nạp vào đơn vị vẫn qua scripts/phan-quyen/nap-vai-tro-tgs.mjs (vai trò bản nháp vô hiệu,
 * D-AUTH-08) — thư viện không cấp quyền (D-LIB-8).
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { serialize, stamp } from '../../scripts/thu-vien/thu-vien.mjs';

const DIR = path.dirname(fileURLToPath(import.meta.url));
export const SOURCE = '../../docs/standard/phan-quyen/tgs-nhom.json';
const OPS = ['read', 'create', 'update', 'cancel', 'print', 'export', 'grant']; // grant: cấp cờ (#…), chỉ khi bảng gốc có Thêm / Sửa / Xóa

export function build(readSource, prev) {
  const src = JSON.parse(readSource(SOURCE));
  if (src.contract !== 'bizcity_authz_tgs_groups@1') throw new Error(`nguồn không phải bizcity_authz_tgs_groups@1: ${src.contract}`);
  const items = src.items.map((g) => ({
    code: g.code,
    name: g.label,
    status: 'active',
    verified: false,
    payload: { sheet: g.sheet, baseRole: g.baseRole, functions: g.functions, grants: g.grants, derived: g.derived, anomalies: g.anomalies },
    hints: [
      { kind: 'how', text: 'Nạp vào đơn vị bằng scripts/phan-quyen/nap-vai-tro-tgs.mjs: vai trò bản nháp, vô hiệu cho tới khi quản trị viên xem ở HT12 và bật.' },
      ...g.anomalies.map((text) => ({ kind: 'warning', text })),
    ],
  }));
  const lib = {
    contract: 'bizcity_library@1',
    id: 'authz.tgs-nhom',
    kind: 'permission-template',
    title: 'Nhóm vai trò mẫu (TGS)',
    description: '28 nhóm vai trò của bảng phân quyền TGS: thao tác được cấp theo từng mã chức năng (đã chuẩn hoá), quyền Core suy ra, bất thường của bảng gốc để người duyệt quyết.',
    version: '1.0.0',
    owner: 'Nhóm Lõi + quản trị viên đơn vị (duyệt khi bật vai trò)',
    sources: [{ title: 'Bảng phân quyền TGS 03.11.2026 (docs/standard/phan-quyen/tgs-nguon.csv)', kind: 'reference', date: '2026-11-07', note: 'Chủ dự án xác nhận được công bố làm thư viện mẫu (ADR-0027 Phụ lục A, W5 đợt 2)' }],
    generatedBy: 'libraries/authz.tgs-nhom/build.mjs',
    optional: true, // [2026-11-08 07:30 PM Johnny Chu - Chu Hoàng Anh] PHASE-030 — S030-49b: thư viện mẫu — đơn vị tắt được
    itemSchema: {
      type: 'object',
      required: ['sheet', 'baseRole', 'functions', 'grants', 'derived', 'anomalies'],
      additionalProperties: false,
      properties: {
        sheet: { type: 'string' },
        baseRole: { enum: ['viewer'] },
        functions: { type: 'integer', minimum: 0 },
        grants: { type: 'object', additionalProperties: { type: 'array', items: { enum: OPS } } },
        derived: { type: 'array', items: { type: 'string', pattern: '^[a-z][a-z0-9-]*:[a-z][a-z0-9-]*$' } },
        anomalies: { type: 'array', items: { type: 'string' } },
      },
    },
    selector: { value: 'code', label: '{name}', search: ['code', 'name', 'payload.sheet'], filters: [{ field: 'payload.baseRole', label: 'Vai trò nền' }], sort: ['name'] },
    items,
  };
  return stamp(lib, prev, { date: '2026-11-08', notes: 'Bản đầu: 28 nhóm từ thư viện phân quyền mẫu TGS (W5 đợt 2, #160)' });
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const file = path.join(DIR, 'library.json');
  const current = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : null;
  const next = serialize(build((n) => fs.readFileSync(path.join(DIR, n), 'utf8'), current ? JSON.parse(current) : null));
  if (process.argv.includes('--check')) { if (next !== current) { console.error('library.json lệch bản sinh lại'); process.exit(1); } console.log('khớp'); process.exit(0); }
  if (next !== current) fs.writeFileSync(file, next);
  console.log(`${next === current ? 'không đổi' : 'đã ghi'} libraries/authz.tgs-nhom/library.json`);
}
