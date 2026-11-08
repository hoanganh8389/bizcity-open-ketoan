#!/usr/bin/env node
// [2026-11-07 10:20 PM Johnny Chu - Chu Hoàng Anh] PHASE-030 — S030-45 (ADR-0032, phần 1–2 của S030-35): sinh thư viện vn.tham-so-phap-ly từ tệp lfood-legal-params v1 (chủ dự án xuất từ Erp-vn 07/11) — giữ mã gốc, giá trị theo ngày, căn cứ verified: false
/**
 *   node libraries/vn.tham-so-phap-ly/build.mjs          sinh lại library.json (giữ phiên bản khi nội dung không đổi)
 *   node libraries/vn.tham-so-phap-ly/build.mjs --check  chỉ so, lệch thì thoát 1
 * SC-LIB-1 gọi build() và so với library.json trong repo.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { serialize, stamp } from '../../scripts/thu-vien/thu-vien.mjs';

const DIR = path.dirname(fileURLToPath(import.meta.url));
export const SOURCE = 'sources/tham-so-phap-ly-2026-11-07.json';

/** Nhóm của Erp-vn → nhóm của thư viện (tiếng Việt không dấu, gạch ngang). */
const GROUPS = {
  accounting: 'ke-toan', asset: 'tai-san', cit: 'thue-tndn', insurance: 'bao-hiem', labor: 'lao-dong',
  other: 'khac', pit: 'thue-tncn', salary: 'luong', vat: 'thue-gtgt',
};
const VALUE_TYPES = { number: 'number', percent: 'percent', amount: 'money' };

export function build(readSource, prev) {
  const src = JSON.parse(readSource(SOURCE));
  if (src.format !== 'lfood-legal-params' || src.version !== 1) throw new Error(`nguồn không phải lfood-legal-params v1: ${src.format} ${src.version}`);
  const items = src.params.map((p) => {
    const group = GROUPS[p.group];
    const valueType = VALUE_TYPES[p.value_type];
    if (!group || !valueType) throw new Error(`${p.code}: nhóm ${p.group} / kiểu ${p.value_type} chưa ánh xạ`);
    const hints = [];
    if (p.description?.trim()) hints.push({ kind: 'why', text: p.description.trim() });
    if (p.kind === 'policy') hints.push({ kind: 'how', text: 'Tham số chính sách: đơn vị được ghi đè bằng cấu hình (setting_values, bắt lý do); giá trị ở đây là mặc định.' });
    return {
      code: p.code,
      name: p.name,
      group,
      status: 'active',
      verified: false,
      payload: { valueType, kind: p.kind },
      effective: p.values.map((v) => ({
        from: v.date_from,
        to: v.date_to ?? null,
        value: v.value,
        basis: v.legal_ref?.trim() ? [{ ref: v.legal_ref.trim(), verified: false }] : [],
        ...(v.note?.trim() ? { note: v.note.trim() } : {}),
      })),
      ...(hints.length ? { hints } : {}),
    };
  });
  const lib = {
    contract: 'bizcity_library@1',
    id: 'vn.tham-so-phap-ly',
    kind: 'param',
    title: 'Tham số pháp lý Việt Nam',
    description: 'Lương cơ sở, lương tối thiểu vùng, tỷ lệ bảo hiểm, thuế TNCN / TNDN / GTGT nhà thầu, giới hạn lao động… mỗi giá trị có ngày hiệu lực và căn cứ. Mặc định chung mọi đơn vị; đơn vị ghi đè ở cấu hình.',
    version: '1.0.0',
    owner: 'kế toán trưởng (S030-12)',
    sources: [{ title: 'Tham số pháp lý xuất từ Erp-vn (lfood-legal-params v1)', kind: 'reference', date: '2026-11-07', note: 'Chủ dự án xuất; căn cứ ghi theo nguồn, chưa đối chiếu văn bản gốc' }],
    generatedBy: 'libraries/vn.tham-so-phap-ly/build.mjs',
    codePrefix: 'TSPL',
    itemSchema: {
      type: 'object',
      required: ['valueType', 'kind'],
      additionalProperties: false,
      properties: {
        valueType: { enum: ['number', 'percent', 'money'], description: 'kiểu giá trị: số, phần trăm (có thể trên 100, vd làm thêm 150), tiền đồng' },
        kind: { enum: ['law', 'policy'], description: 'law = theo luật, đơn vị không đổi; policy = mặc định, đơn vị được ghi đè' },
      },
    },
    selector: {
      value: 'code',
      label: '{name}',
      search: ['code', 'name'],
      group: 'group',
      filters: [{ field: 'group', label: 'Nhóm' }, { field: 'payload.kind', label: 'Loại' }],
      sort: ['group', 'code'],
      showValueAt: true,
    },
    rules: [
      {
        code: 'TSPL-LAW-001',
        level: 'warn',
        title: 'Ghi đè tham số theo luật',
        why: 'Tham số loại luật áp như nhau cho mọi đơn vị; giá trị khác thư viện thường là nhập nhầm hoặc văn bản đã đổi mà thư viện chưa cập nhật.',
        fix: 'Dùng giá trị thư viện tại ngày; nếu văn bản mới đã thay, ghi căn cứ và báo người giữ thư viện cập nhật.',
        when: { all: [{ field: 'item.payload.kind', op: 'eq', value: 'law' }, { field: 'input.override', op: 'eq', value: true }] },
        basis: [{ ref: 'Quy ước phần mềm (ADR-0032 D-LIB-8)', key: 'NOI-BO', verified: true }],
      },
    ],
    items,
  };
  return stamp(lib, prev, { date: '2026-11-07', notes: 'Bản đầu: 120 tham số từ lfood-legal-params v1 (07/11/2026), căn cứ chưa đối chiếu' });
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const file = path.join(DIR, 'library.json');
  const current = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : null;
  const next = serialize(build((n) => fs.readFileSync(path.join(DIR, n), 'utf8'), current ? JSON.parse(current) : null));
  if (process.argv.includes('--check')) { if (next !== current) { console.error('library.json lệch bản sinh lại'); process.exit(1); } console.log('khớp'); process.exit(0); }
  if (next !== current) fs.writeFileSync(file, next);
  console.log(`${next === current ? 'không đổi' : 'đã ghi'} libraries/vn.tham-so-phap-ly/library.json`);
}
