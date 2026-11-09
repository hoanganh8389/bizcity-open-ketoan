#!/usr/bin/env node
// [2026-11-08 01:30 AM Johnny Chu - Chu Hoàng Anh] PHASE-030 — S030-45 (ADR-0032 D-LIB-10): thư viện authz.tgs-chuc-nang — 349 mã chức năng TGS đưa về khuôn bizcity_library@1; đọc tệp sinh của W5 đợt 2 (docs/standard/phan-quyen/tgs-ma-chuc-nang.json), không sửa tệp đó
/**
 *   node libraries/authz.tgs-chuc-nang/build.mjs          sinh lại library.json
 *   node libraries/authz.tgs-chuc-nang/build.mjs --check  chỉ so
 * Nguồn thật vẫn là bảng CSV + scripts/phan-quyen/tgs-anh-xa.mjs (SC-AUTH-04 giữ ánh xạ đúng); thư viện này chỉ là bề mặt chung
 * để tra, chọn, kiểm mã TGS (ô chọn, LIB-UNKNOWN-001 gợi ý mã gần nhất). Đổi nguồn → chạy lại script này (SC-LIB-1 so).
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { serialize, stamp } from '../../scripts/thu-vien/thu-vien.mjs';

const DIR = path.dirname(fileURLToPath(import.meta.url));
export const SOURCE = '../../docs/standard/phan-quyen/tgs-ma-chuc-nang.json';
const OPS = ['read', 'create', 'update', 'cancel', 'print', 'export', 'grant']; // grant: cấp cờ (#…), chỉ khi bảng gốc có Thêm / Sửa / Xóa
const RANK = { cao: 3, vua: 2, thap: 1 };

export function build(readSource, prev) {
  const src = JSON.parse(readSource(SOURCE));
  if (src.contract !== 'bizcity_authz_tgs_codes@1') throw new Error(`nguồn không phải bizcity_authz_tgs_codes@1: ${src.contract}`);
  const items = src.items.map((c) => {
    const best = c.mapsTo.filter((m) => m.status === 'core').reduce((a, m) => Math.max(a, RANK[m.confidence] ?? 0), 0);
    return {
      code: c.code,
      name: c.names[0],
      ...(c.names.length > 1 ? { aliases: c.names.slice(1) } : {}),
      group: c.area,
      status: 'active',
      verified: c.verified === 'da-duyet',
      confidence: best === 3 ? 'cao' : best === 2 ? 'vua' : 'thap',
      payload: { kind: c.kind, ops: c.ops, mapsTo: c.mapsTo, groups: c.groups },
      ...(c.notes.length ? { hints: c.notes.map((text) => ({ kind: 'warning', text })) } : {}),
    };
  });
  const lib = {
    contract: 'bizcity_library@1',
    id: 'authz.tgs-chuc-nang',
    kind: 'code-list',
    title: 'Mã chức năng phân quyền mẫu (TGS)',
    description: '349 mã chức năng của bảng phân quyền TGS: loại (chức năng, báo cáo, nhập, cờ, phạm vi, điều kiện), khu nghiệp vụ, thao tác có nghĩa, ánh xạ sang quyền của Core kèm độ tin cậy. Không mã nào thành quyền thật khi chưa duyệt (D-AUTH-08).',
    version: '1.0.0',
    owner: 'Nhóm Lõi + kế toán trưởng (duyệt ánh xạ)',
    sources: [{ title: 'Bảng phân quyền TGS 03.11.2026 (docs/standard/phan-quyen/tgs-nguon.csv)', kind: 'reference', date: '2026-11-07', note: 'Chủ dự án xác nhận được công bố làm thư viện mẫu; ánh xạ do scripts/phan-quyen/tgs-anh-xa.mjs sinh (ADR-0027 Phụ lục A, W5 đợt 2)' }],
    generatedBy: 'libraries/authz.tgs-chuc-nang/build.mjs',
    optional: true, // [2026-11-08 07:30 PM Johnny Chu - Chu Hoàng Anh] PHASE-030 — S030-49b: thư viện mẫu — đơn vị tắt được
    codePrefix: 'TGS',
    itemSchema: {
      type: 'object',
      required: ['kind', 'ops', 'mapsTo', 'groups'],
      additionalProperties: false,
      properties: {
        kind: { enum: ['function', 'report', 'import', 'flag', 'scope', 'condition'], description: 'chức năng, báo cáo, nhập, cờ (#…), phạm vi kho, điều kiện hạn xem' },
        ops: { type: 'array', items: { enum: OPS } },
        mapsTo: {
          type: 'array',
          items: {
            type: 'object', required: ['op', 'permission', 'status', 'confidence'], additionalProperties: false,
            properties: { op: { enum: OPS }, permission: { type: 'string' }, status: { enum: ['core', 'module', 'de-xuat'] }, confidence: { enum: ['cao', 'vua', 'thap'] } },
          },
        },
        groups: { type: 'integer', minimum: 0, description: 'số nhóm của bảng gốc có dòng cho mã này' },
      },
    },
    selector: {
      value: 'code',
      label: '{code} · {name}',
      search: ['code', 'name', 'aliases'],
      group: 'group',
      filters: [{ field: 'group', label: 'Khu' }, { field: 'payload.kind', label: 'Loại' }],
      sort: ['group', 'code'],
    },
    rules: [
      {
        code: 'TGS-REPORT-001',
        level: 'warn',
        title: 'Cấp Thêm / Sửa / Xóa cho mã báo cáo',
        why: 'Báo cáo chỉ đọc: có nghĩa với Tìm, In, Xuất. Bảng gốc có chỗ đánh Thêm / Sửa / Xóa trên báo cáo; thư viện bỏ các thao tác đó khi suy quyền.',
        fix: 'Chỉ cấp Tìm / In / Xuất cho mã báo cáo; quyền ghi cấp ở mã chức năng (phiếu, danh mục) tương ứng.',
        when: { all: [{ field: 'item.payload.kind', op: 'eq', value: 'report' }, { field: 'input.op', op: 'in', value: ['create', 'update', 'cancel'] }] },
        basis: [{ ref: 'ADR-0027 Phụ lục A, W5 đợt 2 — báo cáo chỉ Tìm / In / Xuất', key: 'NOI-BO', verified: true }],
      },
      {
        code: 'TGS-FLAG-001',
        level: 'info',
        title: 'Cờ chỉ cấp khi có Thêm / Sửa / Xóa',
        why: 'Cờ (#…) như "được phép sửa dữ liệu trong quá khứ" là quyền rủi ro cao; chỉ Tìm / In / Xuất không đủ để cấp (đóng an toàn).',
        fix: 'Muốn cấp cờ, đánh Sửa (hoặc Thêm / Xóa) ở dòng cờ và để quản trị viên duyệt vai trò ở HT12.',
        when: { all: [{ field: 'item.payload.kind', op: 'eq', value: 'flag' }, { field: 'input.op', op: 'in', value: ['read', 'print', 'export'] }] },
        basis: [{ ref: 'ADR-0027 Phụ lục A, W5 đợt 2 — cờ đóng an toàn', key: 'NOI-BO', verified: true }],
      },
    ],
    items,
  };
  return stamp(lib, prev, { date: '2026-11-08', notes: 'Bản đầu: 349 mã từ thư viện phân quyền mẫu TGS (W5 đợt 2, #160)' });
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const file = path.join(DIR, 'library.json');
  const current = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : null;
  const next = serialize(build((n) => fs.readFileSync(path.join(DIR, n), 'utf8'), current ? JSON.parse(current) : null));
  if (process.argv.includes('--check')) { if (next !== current) { console.error('library.json lệch bản sinh lại'); process.exit(1); } console.log('khớp'); process.exit(0); }
  if (next !== current) fs.writeFileSync(file, next);
  console.log(`${next === current ? 'không đổi' : 'đã ghi'} libraries/authz.tgs-chuc-nang/library.json`);
}
