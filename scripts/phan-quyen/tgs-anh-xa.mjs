#!/usr/bin/env node
// [2026-11-07 11:30 AM Johnny Chu - Chu Hoàng Anh] PHASE-028 — W5 đợt 2 (ADR-0027 Phụ lục A, W5 đợt 2): sinh thư viện phân quyền mẫu từ bảng TGS — 349 mã chức năng, 28 nhóm; máy suy ra, người duyệt (D-AUTH-08)
/**
 * Đọc bảng "Chi tiết phân quyền" của TGS (CSV) → hai tệp JSON ở docs/standard/phan-quyen/:
 *   tgs-ma-chuc-nang.json   mỗi mã: loại, khu, thao tác có nghĩa, ánh xạ sang quyền (core / module / de-xuat), độ tin cậy, trạng thái duyệt
 *   tgs-nhom.json           mỗi nhóm: mã vai trò đơn vị, thao tác được cấp (đã chuẩn hoá), quyền suy ra, bất thường
 * Không chỉnh tay JSON: sửa luật ở đây rồi sinh lại. Ánh xạ "cao" CHỈ lấy từ bí danh tgs:* trong sổ quyền của code
 * (packages/platform/src/core/authz/catalog.ts) — một nguồn sự thật.
 *
 *   node scripts/phan-quyen/tgs-anh-xa.mjs                 sinh lại từ docs/standard/phan-quyen/tgs-nguon.csv
 *   node scripts/phan-quyen/tgs-anh-xa.mjs --check         chỉ so: JSON trong repo có khớp bản sinh lại không (thoát 1 nếu lệch)
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
export const DIR = 'docs/standard/phan-quyen';
export const SOURCE = `${DIR}/tgs-nguon.csv`;
export const OUT_CODES = `${DIR}/tgs-ma-chuc-nang.json`;
export const OUT_GROUPS = `${DIR}/tgs-nhom.json`;
const CATALOG = 'packages/platform/src/core/authz/catalog.ts';

// ── CSV ────────────────────────────────────────────────────────────────────────────────────────────────────────────
export function parseCsv(t) {
  const rows = []; let row = []; let cell = ''; let q = false;
  const s = t.replace(/^﻿/, '');
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (q) { if (c === '"') { if (s[i + 1] === '"') { cell += '"'; i++; } else q = false; } else cell += c; continue; }
    if (c === '"') q = true; else if (c === ',') { row.push(cell); cell = ''; } else if (c === '\n') { row.push(cell.replace(/\r$/, '')); rows.push(row); row = []; cell = ''; } else cell += c;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  return rows;
}

const OPS = ['read', 'create', 'update', 'cancel', 'print', 'export'];
const COLS = { read: 4, create: 5, update: 6, cancel: 7, print: 8, export: 9 };

/** Bản ghi của bảng nguồn: dòng có STT là số, sau dòng tiêu đề "STT". */
export function readRecords(csvText) {
  const all = parseCsv(csvText);
  const h = all.findIndex((r) => r[0] === 'STT');
  if (h < 0) throw new Error('Không thấy dòng tiêu đề STT trong CSV');
  return all.slice(h + 1).filter((r) => /^\d+$/.test(r[0])).map((r) => ({
    row: Number(r[0]), group: r[1].trim(), code: r[2].trim(), name: r[3].trim().replace(/\s+/g, ' '), sheet: (r[12] ?? '').replace(/^'|'$/g, '').trim(),
    granted: OPS.filter((op) => r[COLS[op]] === 'Có'), count: Number(r[10]),
  }));
}

// ── luật ánh xạ ────────────────────────────────────────────────────────────────────────────────────────────────────
/** Bí danh tgs:* của quyền Core (đọc văn bản catalog.ts — không chạy TS). */
export function catalogAliases(catalogText) {
  const out = new Map();
  for (const m of catalogText.matchAll(/'([a-z][a-z0-9-]*:[a-z][a-z0-9-]*)':\s*\{([^}]*?)aliases:\s*\[([^\]]*)\]/g)) {
    const read = /operation:\s*'read'/.test(m[2]);
    for (const a of m[3].matchAll(/'tgs:([^']+)'/g)) out.set(a[1], { permission: m[1], read });
  }
  return out;
}

/** Thao tác của bảng TGS mà một quyền Core "đọc" / "ghi" ứng với. Đọc: Tìm, In. Ghi / quản trị / cấu hình: Thêm, Sửa, Xóa. */
const READ_OPS = ['read', 'print'];
const WRITE_OPS = ['create', 'update', 'cancel'];

const AREA_BY_PREFIX = [
  ['BCAD', 'bao-cao'], ['ADHT', 'he-thong'], ['DSNCC', 'ke-hoach'], ['DSKH', 'ke-hoach'], ['DSMH', 'ke-hoach'], ['DSNV', 'ke-hoach'], ['CRM', 'khach-hang'],
  ['THU', 'quy'], ['ACC', 'ke-toan'], ['BC', 'bao-cao'], ['BH', 'ban-hang'], ['MH', 'mua-hang'], ['CH', 'danh-muc'], ['HT', 'he-thong'], ['AD', 'tien-ich'],
  ['CK', 'kho'], ['KK', 'kho'], ['KM', 'ban-hang'], ['CC', 'kiem-tra'], ['CP', 'quy'], ['NH', 'quy'], ['Q', 'quy'],
];
export const areaOf = (code) => AREA_BY_PREFIX.find(([p]) => code.startsWith(p))?.[1] ?? 'khac';

/** Mã cờ là phạm vi / điều kiện (không phải quyền). */
const SCOPE_FLAGS = new Set(['HT11', 'HT34']);
const CONDITION_FLAGS = new Map([['HT55', 'view_window_days']]);
/** Gợi ý ánh xạ cờ ngoài bí danh (độ tin cậy "vừa" — người duyệt quyết). */
const FLAG_HINTS = new Map([['HT22', 'documents:edit-all'], ['HT53', 'documents:edit-all'], ['HT16', 'reports:read'], ['BH10', 'reports:read']]);
/** Danh mục: các mã CH* là danh mục, trừ những mã là cấu hình / công cụ. */
const CATALOG_IMPORTS = new Set(['CH7', 'ACC17', 'ACC18', 'ACC36']);
const LEDGER_READ_CODES = new Set(['ACC1', 'ACC12', 'ACC89']);

const REPORT_RE = /^(báo cáo|bc\b|bcth\b|th\b|sổ |sổ$|bảng kê|bảng cân đối|bảng tổng hợp|tổng hợp|phân tích|theo dõi|lịch sử|tk chi phí|danh sách các báo cáo|công nợ|đối chiếu|tăng trưởng|lợi nhuận|tồn kho|hết hàng|thu-chi)/i;

export function kindOf(code, names) {
  if (names.some((n) => n.startsWith('#'))) return SCOPE_FLAGS.has(code) ? 'scope' : CONDITION_FLAGS.has(code) ? 'condition' : 'flag';
  if (names.some((n) => /^import\b/i.test(n))) return 'import';
  if (names.every((n) => REPORT_RE.test(n))) return 'report';
  return 'function';
}

const OPS_OF = { report: ['read', 'print', 'export'], import: ['read', 'create', 'update'], function: OPS, flag: ['grant'], scope: ['grant'], condition: ['grant'] };
const slug = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

/** Ánh xạ một mã: mapsTo[] (op → permission, status, confidence). */
export function mapCode(code, kind, area, aliases) {
  const proposed = (op) => ({ op, permission: `${area}:${slug(code)}${op === 'grant' ? '' : `-${op}`}`, status: 'de-xuat', confidence: 'thap' });
  const alias = aliases.get(code);
  if (kind === 'scope' || kind === 'condition') return [];
  if (kind === 'flag') {
    if (alias) return [{ op: 'grant', permission: alias.permission, status: 'core', confidence: 'cao' }];
    if (FLAG_HINTS.has(code)) return [{ op: 'grant', permission: FLAG_HINTS.get(code), status: 'core', confidence: 'vua' }];
    return [proposed('grant')];
  }
  // Bí danh: quyền "đọc" ứng với Tìm / In; quyền ghi / quản trị / cấu hình ứng với Thêm / Sửa / Xóa — xem màn không phải là quản trị được.
  if (alias) {
    const ops = alias.read ? READ_OPS : WRITE_OPS;
    return OPS_OF[kind].map((op) => (ops.includes(op) ? { op, permission: alias.permission, status: 'core', confidence: 'cao' } : proposed(op)));
  }
  if (kind === 'report') {
    const read = LEDGER_READ_CODES.has(code) ? 'ledger:read' : 'reports:read';
    return [{ op: 'read', permission: read, status: 'core', confidence: 'cao' }, { op: 'print', permission: read, status: 'core', confidence: 'vua' }, proposed('export')];
  }
  const isCatalog = area === 'danh-muc' || CATALOG_IMPORTS.has(code);
  const read = isCatalog ? 'catalog:read' : LEDGER_READ_CODES.has(code) ? 'ledger:read' : 'documents:read';
  const write = isCatalog ? 'catalog:write' : 'documents:write';
  if (kind === 'import') return [{ op: 'read', permission: read, status: 'core', confidence: 'vua' }, { op: 'create', permission: write, status: 'core', confidence: 'vua' }, { op: 'update', permission: write, status: 'core', confidence: 'vua' }];
  return [
    { op: 'read', permission: read, status: 'core', confidence: 'vua' },
    { op: 'create', permission: write, status: 'core', confidence: 'vua' },
    { op: 'update', permission: write, status: 'core', confidence: 'vua' },
    // Xóa = huỷ / đảo bút toán, không xoá thật (ECP-13).
    { op: 'cancel', permission: write, status: 'core', confidence: 'vua' },
    { op: 'print', permission: read, status: 'core', confidence: 'vua' },
    proposed('export'),
  ];
}

/** Quyền Core rủi ro cao (đọc từ catalog.ts lúc dựng). */
let HIGH_RISK = new Set();
const ROLE_RE = /^[a-z][a-z0-9_-]{1,39}$/;
const SYSTEM_ROLES = new Set(['owner', 'chief_accountant', 'accountant', 'viewer', 'developer', 'auditor']);
/** Mã vai trò đơn vị từ tên nhóm: chữ thường không dấu, '-' nối, tiền tố tgs- (không trùng vai trò hệ thống). */
export function roleCode(group) {
  const base = group.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  const code = `tgs-${base}`.slice(0, 40).replace(/-$/, '');
  if (!ROLE_RE.test(code) || SYSTEM_ROLES.has(code)) throw new Error(`Mã vai trò không hợp lệ từ nhóm "${group}": ${code}`);
  return code;
}

// ── dựng thư viện ──────────────────────────────────────────────────────────────────────────────────────────────────
export function build(csvText, catalogText) {
  const recs = readRecords(csvText);
  const aliases = catalogAliases(catalogText);
  HIGH_RISK = new Set([...catalogText.matchAll(/'([a-z][a-z0-9-]*:[a-z][a-z0-9-]*)':\s*\{[^}]*?risk:\s*'high'/g)].map((m) => m[1]));
  const byCode = new Map();
  for (const r of recs) {
    const e = byCode.get(r.code) ?? { names: new Set(), groups: new Set(), rows: [] };
    e.names.add(r.name); e.groups.add(r.group); e.rows.push(r.row);
    byCode.set(r.code, e);
  }
  const nameToCodes = new Map();
  for (const [code, e] of byCode) for (const n of e.names) { const k = n.toLowerCase(); nameToCodes.set(k, [...new Set([...(nameToCodes.get(k) ?? []), code])]); }

  const codes = [...byCode.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([code, e]) => {
    const names = [...e.names].sort();
    const kind = kindOf(code, names);
    const area = areaOf(code);
    const notes = [];
    if (names.length > 1) notes.push(`một mã nhiều tên giữa các sheet: ${names.join(' | ')}`);
    for (const n of names) { const same = (nameToCodes.get(n.toLowerCase()) ?? []).filter((c) => c !== code); if (same.length) notes.push(`cùng tên với ${same.join(', ')}`); }
    if (kind === 'scope') notes.push('phạm vi kho: dùng lần gán có phạm vi (requireScope), không phải quyền');
    if (kind === 'condition') notes.push(`điều kiện ${CONDITION_FLAGS.get(code)} (hạn chế), không phải quyền`);
    let mapsTo = mapCode(code, kind, area, aliases);
    if (notes.some((n) => n.startsWith('một mã') || n.startsWith('cùng tên'))) mapsTo = mapsTo.map((m) => (m.confidence === 'cao' ? m : { ...m, confidence: 'thap' }));
    return { code, names, kind, area, ops: OPS_OF[kind], mapsTo, verified: 'chua-duyet', groups: e.groups.size, notes };
  });
  const codeOf = new Map(codes.map((c) => [c.code, c]));

  const groupNames = [...new Set(recs.map((r) => r.group))];
  const groups = groupNames.map((g) => {
    const rows = recs.filter((r) => r.group === g);
    const grants = {}; const anomalies = []; const derived = new Set();
    for (const r of rows) {
      const c = codeOf.get(r.code);
      if (r.granted.length && !r.granted.includes('read') && c.kind !== 'flag') anomalies.push(`dòng ${r.row} ${r.code}: có ${r.granted.join(', ')} mà không có Tìm`);
      const dropped = r.granted.filter((op) => c.kind === 'report' && ['create', 'update', 'cancel'].includes(op));
      if (dropped.length) anomalies.push(`dòng ${r.row} ${r.code}: báo cáo có ${dropped.join(', ')} — bỏ`);
      // Cờ: chỉ tính là được cấp khi bảng gốc có Thêm / Sửa / Xóa ("bật"); chỉ Tìm / In / Xuất thì không cấp (đóng an toàn, ghi bất thường).
      const flagLike = c.kind === 'flag' || c.kind === 'scope' || c.kind === 'condition';
      const flagOn = r.granted.some((op) => WRITE_OPS.includes(op));
      if (flagLike && r.granted.length && !flagOn) anomalies.push(`dòng ${r.row} ${r.code}: cờ chỉ có ${r.granted.join(', ')} — coi như chưa cấp`);
      const ops = flagLike ? (flagOn ? ['grant'] : []) : r.granted.filter((op) => c.ops.includes(op));
      if (!ops.length) continue;
      grants[r.code] = ops;
      for (const m of c.mapsTo) if (ops.includes(m.op) && (m.status === 'core' || m.status === 'module') && (m.confidence === 'cao' || c.verified === 'da-duyet')) derived.add(m.permission);
    }
    for (const p of derived) if (HIGH_RISK.has(p)) anomalies.push(`quyền rủi ro cao suy ra: ${p} — kiểm kỹ trước khi bật vai trò`);
    return { code: roleCode(g), label: g, sheet: rows[0].sheet, baseRole: 'viewer', functions: rows.length, grants, derived: [...derived].sort(), anomalies };
  });

  const meta = { source: SOURCE, title: 'Bảng phân quyền tổng hợp TGS – 03.11.2026 · Chi tiết phân quyền', rows: recs.length, codes: codes.length, groups: groups.length, generatedBy: 'scripts/phan-quyen/tgs-anh-xa.mjs', rule: 'ADR-0027 Phụ lục A, W5 đợt 2; D-AUTH-08: không mã nào thành quyền thật khi chưa duyệt; cờ chỉ tính khi có Thêm / Sửa / Xóa (đóng an toàn); bí danh đọc ứng Tìm / In, bí danh ghi ứng Thêm / Sửa / Xóa' };
  return {
    codes: { contract: 'bizcity_authz_tgs_codes@1', ...meta, items: codes },
    groups: { contract: 'bizcity_authz_tgs_groups@1', ...meta, items: groups },
  };
}

const json = (o) => `${JSON.stringify(o, null, 2)}\n`;

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  const check = args.includes('--check');
  const csv = args.find((a) => !a.startsWith('--')) ?? path.join(ROOT, SOURCE);
  const out = build(fs.readFileSync(csv, 'utf8'), fs.readFileSync(path.join(ROOT, CATALOG), 'utf8'));
  if (check) {
    const same = [[OUT_CODES, out.codes], [OUT_GROUPS, out.groups]].every(([f, o]) => fs.existsSync(path.join(ROOT, f)) && fs.readFileSync(path.join(ROOT, f), 'utf8') === json(o));
    console.log(same ? '✔ thư viện TGS khớp bản sinh lại' : '✘ thư viện TGS lệch bản sinh lại — chạy: node scripts/phan-quyen/tgs-anh-xa.mjs');
    process.exit(same ? 0 : 1);
  }
  fs.mkdirSync(path.join(ROOT, DIR), { recursive: true });
  fs.writeFileSync(path.join(ROOT, OUT_CODES), json(out.codes));
  fs.writeFileSync(path.join(ROOT, OUT_GROUPS), json(out.groups));
  const by = (k) => out.codes.items.reduce((a, c) => ((a[c[k]] = (a[c[k]] ?? 0) + 1), a), {});
  console.log(`✔ ${out.codes.items.length} mã · ${out.groups.items.length} nhóm · ${out.codes.rows} dòng`);
  console.log('  loại:', JSON.stringify(by('kind')));
  console.log('  có bí danh (cao):', out.codes.items.filter((c) => c.mapsTo.some((m) => m.confidence === 'cao')).length);
}
