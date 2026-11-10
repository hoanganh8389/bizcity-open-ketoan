// [2026-11-03 11:52 PM Johnny Chu - Chu Hoàng Anh] FLOW — FLOW-2 (R-FLOW-8): bảng việc sinh từ main — đọc checklist phase, nối giữ chỗ, sinh BANG-VIEC.md + bang-viec.json
/**
 * Hàm thuần (không đọc đĩa, không gọi git). Dùng chung cho:
 *   - scripts/bang-viec.mjs           đọc đĩa, ghi / kiểm hai tệp sinh
 *   - SC-FLOW-1 / 3 / 4 (flow.check.mjs) đọc qua ctx.repo
 *   - workflow GitHub Pages           dựng lại bang-viec.json, dừng nếu lệch
 * Khuôn: docs/rules/RULE-FLOW.md §4.
 */

export const BOARD_MD = 'docs/phases/BANG-VIEC.md';
export const BOARD_JSON = 'docs/phases/bang-viec.json';
export const CHECKLIST_RE = /^docs\/phases\/(PHASE-\d{3})[^/]*\/40-MASTER-CHECKLIST\.md$/;
// [2026-11-11 04:00 AM Johnny Chu - Chu Hoàng Anh] PHASE-035 — B1 (S035-3, R-FLOW-10): mỗi việc mang phân hệ (README phase `**Phân hệ:**`, dòng việc ghi đè `{key}`) và mặt F1..F8 theo từ khoá — nguồn cho HT11 Modules & mức đạt
export const README_RE = /^docs\/phases\/(PHASE-\d{3})[^/]*\/README\.md$/;
/** Khoá phân hệ (docs/standard/modules.json, PHASE-035 · 00 §2). */
export const MODULE_KEYS = ['danh-muc', 'mua-hang', 'kho', 'ban-hang', 'quy', 'chung-tu', 'cong-no', 'tong-hop', 'thue', 'tai-san', 'bao-cao', 'he-thong'];
/** Tám mặt của một phân hệ (PHASE-035 · 00 §3). */
export const FACETS = { F1: 'Chứng từ & nghiệp vụ', F2: 'Danh mục & cấu hình', F3: 'Lõi tính (engine)', F4: 'Báo cáo & sổ', F5: 'Bộ kiểm', F6: 'Bàn làm việc & dashboard', F7: 'Tài liệu & hướng dẫn', F8: 'API / SDK / module hoá' };
const MODULES_LINE_RE = /^>\s*\*\*Phân hệ:\*\*\s*(.+?)\s*$/m;
/** Dòng `> **Phân hệ:** kho · mua-hang` ở README hay checklist của phase → danh sách khoá (giữ thứ tự, bỏ trùng, chỉ nhận khoá có thật). */
export function parsePhaseModules(md) {
  const m = MODULES_LINE_RE.exec(String(md ?? ''));
  if (!m) return [];
  return [...new Set(m[1].split(/[·,;]/).map((x) => x.replace(/<!--.*?-->/g, '').replace(/[`*]/g, '').trim()).filter((x) => MODULE_KEYS.includes(x)))];
}
/** Ghi đè phân hệ ở cuối ô Việc: `… {kho, mua-hang}` → { modules, title } (title đã bỏ phần ghi đè). */
export function splitRowModules(title) {
  const m = /\s*\{([a-z-]+(?:\s*,\s*[a-z-]+)*)\}\s*$/.exec(title);
  if (!m) return { modules: null, title };
  const keys = [...new Set(m[1].split(',').map((x) => x.trim()).filter((x) => MODULE_KEYS.includes(x)))];
  // `{code}` trong tên số đo, `{reason}`… không phải ghi đè: giữ nguyên tiêu đề, theo phân hệ của phase.
  if (!keys.length) return { modules: null, title };
  return { modules: keys, title: title.slice(0, m.index).trim() };
}
/** Mặt theo từ khoá của tiêu đề việc (ô liệt kê tay trong modules.json thắng luật này). Thứ tự kiểm: F5 F6 F7 F8 F3 F4 F2, còn lại F1. */
export function facetOf(title) {
  const t = String(title ?? '').toLowerCase();
  if (/\bsc-|\bdg-|\bct-|\bin-|\bpc-\d|kiểm|chẩn đoán|cổng|validator|diagnos|selfcheck|golden|parity|bất biến/.test(t)) return 'F5';
  if (/\bthẻ\b|bàn làm việc|dashboard|việc hôm nay|bàn điều hành|bảng điểm|scoreboard|ht08|ht10|ht11|bàn đánh giá/.test(t)) return 'F6';
  if (/hướng dẫn|tài liệu|\badr\b|\bluật\b|readme|chữ chốt|bản mẫu|mockup|docs\/|changelog|canon/.test(t)) return 'F7';
  if (/\bapi\b|\bsdk\b|hợp đồng|\bmodule\b|plugin|\bcli\b|\bmcp\b|bizcity_\w+@|manifest|add-in|phân hệ|tách gói|cổng công khai/.test(t)) return 'F8';
  if (/engine|tính giá|giá vốn|kết chuyển|khấu hao|phân bổ|\blớp\b|fifo|fefo|costing|phân lô|chính sách|policy|quy tắc định khoản|định khoản tự động|posting/.test(t)) return 'F3';
  if (/báo cáo|\bsổ\b|bảng kê|\bin\b|xuất excel|tờ khai|bảng cân đối|lưu chuyển|thuyết minh/.test(t)) return 'F4';
  if (/danh mục|cấu hình|phân loại|định danh|mã hàng|\bitem\b|catalog|chế độ|đơn vị tính|tài khoản|đối tượng|nhóm hàng|biến thể/.test(t)) return 'F2';
  return 'F1';
}

/** Mã việc: S###-n, có thể thêm một chữ cái (S010-1a) khi tách việc. */
export const TASK_ID_RE = /^S\d{3}-\d+[a-z]?$/;

/** Ký hiệu trạng thái của ô cuối dòng việc (R-FLOW §4 mục 2). */
export const STATUS_SYMBOLS = { '☐': 'todo', '🟡': 'partial', '✅': 'done', '⛔': 'blocked', '⏸': 'paused' };

/** Bảy cột của bảng, đúng thứ tự (R-FLOW §4 mục 3). */
export const COLUMNS = [
  { key: 'doing', label: 'Đang làm' },
  { key: 'merging', label: 'Chờ merge' },
  { key: 'blocked', label: 'Bị chặn' },
  { key: 'todo', label: 'Chưa ai nhận' },
  { key: 'partial', label: 'Chờ đủ tín hiệu' },
  { key: 'paused', label: 'Hoãn' },
  { key: 'done', label: 'Xong' },
];

/** Tách ô bảng Markdown; `\|` là dấu | trong nội dung, không tách. */
export function cells(line) {
  const s = line.trim().replace(/^\|/, '').replace(/\|\s*$/, '');
  const out = [];
  let cur = '';
  for (let i = 0; i < s.length; i++) {
    if (s[i] === '\\' && s[i + 1] === '|') { cur += '|'; i++; continue; }
    if (s[i] === '|') { out.push(cur.trim()); cur = ''; continue; }
    cur += s[i];
  }
  out.push(cur.trim());
  return out;
}

const isSep = (l) => /^\s*\|(\s*:?-{3,}:?\s*\|)+\s*$/.test(l);
const symbolOf = (s) => Object.keys(STATUS_SYMBOLS).find((k) => s.startsWith(k)) ?? null;

/** Chữ thường để hiện: bỏ chú thích HTML, đậm / nghiêng, dấu `, link Markdown; cắt ngắn. */
export function plain(s, max = 160) {
  const t = String(s)
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/[*_`]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  return t.length > max ? `${t.slice(0, max - 1)}…` : t;
}

/**
 * Đọc các dòng việc `| S###-n | … |` của một checklist. Mỗi bảng tự có tiêu đề; cột lấy theo tên tiêu đề.
 * Trả { items, problems } — problems là lỗi khuôn (SC-FLOW-4).
 */
export function parseChecklist(md, file) {
  const L = String(md ?? '').split(/\r?\n/);
  const items = [];
  const problems = [];
  const seen = new Map();
  let head = null;
  for (let i = 0; i < L.length; i++) {
    const t = L[i];
    // Dòng chỉ có chú thích HTML (dấu thay đổi R-SIG) chen giữa bảng: bỏ qua, vẫn thuộc bảng đang đọc.
    if (/^\s*<!--.*-->\s*$/.test(t)) continue;
    if (!t.trim().startsWith('|')) { head = null; continue; }
    if (isSep(t)) continue;
    if (L[i + 1] && isSep(L[i + 1])) { head = cells(t); continue; }
    const c = cells(t);
    if (!TASK_ID_RE.test(c[0])) continue;
    const id = c[0];
    const line = i + 1;
    if (!head) { problems.push({ file, line, message: `${id}: dòng việc không nằm trong bảng có tiêu đề`, key: `nohead:${id}` }); continue; }
    if (c.length !== head.length) {
      problems.push({ file, line, message: `${id}: dòng có ${c.length} ô, tiêu đề có ${head.length} — dấu | trong nội dung viết \\|`, key: `cot:${id}` });
      continue;
    }
    const statusCell = c[c.length - 1];
    const sym = symbolOf(statusCell);
    if (!sym) problems.push({ file, line, message: `${id}: ô trạng thái phải bắt đầu bằng ${Object.keys(STATUS_SYMBOLS).join(' ')} (đang là "${plain(statusCell, 30)}")`, key: `ky-hieu:${id}` });
    if (seen.has(id)) problems.push({ file, line, message: `${id}: trùng mã với dòng ${seen.get(id)}`, key: `trung:${id}` });
    seen.set(id, line);
    const col = (name) => { const k = head.findIndex((h) => plain(h).toLowerCase() === name); return k >= 0 ? c[k] : ''; };
    const row = splitRowModules(plain(col('việc') || c[1]));
    items.push({ id, title: row.title, priority: plain(col('ưu tiên')) || null, status: sym ? STATUS_SYMBOLS[sym] : 'unknown', statusText: plain(statusCell, 120), file, line, modules: row.modules, facet: facetOf(row.title) });
  }
  return { items, problems };
}

/**
 * Đọc mọi checklist. `files`: [{ path, text }] — có thể kèm README.md của phase: dòng `**Phân hệ:**` ở README (hoặc ở chính checklist)
 * là phân hệ mặc định của mọi việc trong phase; dòng việc ghi đè bằng `{key}` (R-FLOW-10). Việc không có cả hai → `modules: []`.
 */
export function parseAllChecklists(files) {
  const items = [];
  const problems = [];
  const byPhase = new Map();
  for (const f of files) { const m = README_RE.exec(f.path); if (m) byPhase.set(m[1], parsePhaseModules(f.text)); }
  for (const f of files) {
    const m = CHECKLIST_RE.exec(f.path);
    if (!m) continue;
    const r = parseChecklist(f.text, f.path);
    const phaseModules = byPhase.get(m[1])?.length ? byPhase.get(m[1]) : parsePhaseModules(f.text);
    for (const it of r.items) items.push({ ...it, phase: m[1], modules: it.modules ?? phaseModules });
    problems.push(...r.problems);
  }
  return { items, problems };
}

/** SC-FLOW-1 phần cột Việc: mã có thật, không hai dòng giữ cùng mã. `rows` từ parseClaims. */
export function viecProblems(rows, items) {
  const ids = new Set(items.map((i) => i.id));
  const holder = new Map();
  const out = [];
  for (const r of rows) {
    for (const id of r.viec) {
      if (!ids.has(id)) out.push({ line: r.line, message: `"${r.dot.slice(0, 40)}": mã việc ${id} không có trong checklist nào (docs/phases/*/40-MASTER-CHECKLIST.md)`, key: `viec-la:${id}` });
      if (holder.has(id)) out.push({ line: r.line, message: `mã việc ${id} đang được hai dòng giữ: "${holder.get(id).slice(0, 30)}" và "${r.dot.slice(0, 30)}"`, key: `viec-hai:${id}` });
      else holder.set(id, r.dot);
    }
  }
  return out;
}

const num = (s) => Number(String(s).replace(/\D+/g, ''));
const byId = (a, b) => num(a.phase) - num(b.phase) || num(a.id.split('-')[0]) - num(b.id.split('-')[0]) || num(a.id.split('-')[1]) - num(b.id.split('-')[1]) || a.id.localeCompare(b.id) || a.line - b.line;

/** Dựng bảng (bizcity_task_board@1). Không ghi giờ sinh, không mã commit: cùng nguồn → cùng tệp. */
export function buildBoard(items, rows) {
  const claim = new Map();
  for (const r of rows) for (const id of r.viec) if (!claim.has(id)) claim.set(id, { who: r.nguoi, branch: r.nhanh, state: r.trangthai, since: r.tu, dot: plain(r.dot, 100) });
  const out = [...items].sort(byId).map((it) => {
    const c = claim.get(it.id) ?? null;
    const column = c ? (c.state === 'chờ merge' ? 'merging' : 'doing') : it.status === 'unknown' ? 'todo' : it.status;
    return { id: it.id, phase: it.phase, title: it.title, priority: it.priority, status: it.status, column, claim: c, modules: it.modules ?? [], facet: it.facet ?? facetOf(it.title), file: it.file, line: it.line };
  });
  return {
    contract: 'bizcity_task_board@1',
    note: 'Sinh bằng `node scripts/bang-viec.mjs --write` từ docs/phases/*/40-MASTER-CHECKLIST.md và docs/phases/CLAIMS.md trên main. Không sửa tay (R-FLOW-8).',
    columns: COLUMNS.map((c) => ({ ...c, count: out.filter((i) => i.column === c.key).length })),
    items: out,
  };
}

export const renderJson = (board) => `${JSON.stringify(board, null, 2)}\n`;

const esc = (s) => String(s ?? '').replace(/\|/g, '\\|');

/** Bảng Markdown: tổng theo cột, rồi từng cột nhóm theo phase. Bỏ cột Xong ở phần chi tiết (chỉ đếm) để tệp gọn. */
export function renderMd(board) {
  const L = [];
  L.push('# Bảng việc');
  L.push('<!-- [2026-11-03 11:52 PM Johnny Chu - Chu Hoàng Anh] FLOW — tệp sinh (R-FLOW-8): node scripts/bang-viec.mjs --write; không sửa tay -->');
  L.push('');
  L.push('> **Tệp sinh tự động** từ `docs/phases/*/40-MASTER-CHECKLIST.md` và [CLAIMS.md](CLAIMS.md) — **không sửa tay**. Đổi trạng thái: sửa checklist / CLAIMS rồi chạy `node scripts/bang-viec.mjs --write` trong cùng PR (SC-FLOW-3). Luật: [R-FLOW-8](../rules/RULE-FLOW.md). Màn kanban chỉ đọc: GitHub Pages của repo.');
  L.push('');
  L.push('| Cột | Số việc |');
  L.push('|---|---|');
  for (const c of board.columns) L.push(`| ${c.label} | ${c.count} |`);
  L.push(`| **Tổng** | **${board.items.length}** |`);
  // [2026-11-11 04:10 AM Johnny Chu - Chu Hoàng Anh] PHASE-035 — B1: bảng việc theo phân hệ (R-FLOW-10) — HT11 đọc bang-viec.json; bảng này để người đọc main nhìn nhanh
  L.push('');
  L.push('## Theo phân hệ (R-FLOW-10)');
  L.push('');
  L.push('| Phân hệ | Xong | Chờ đủ tín hiệu | Đang làm | Còn lại | Tổng |');
  L.push('|---|---|---|---|---|---|');
  const keys = [...MODULE_KEYS, ''];
  for (const k of keys) {
    const its = board.items.filter((i) => (k ? i.modules.includes(k) : !i.modules.length));
    if (!its.length) continue;
    const n = (col) => its.filter((i) => i.column === col).length;
    L.push(`| ${k || '*(chưa gắn phân hệ)*'} | ${n('done')} | ${n('partial')} | ${n('doing') + n('merging')} | ${its.length - n('done') - n('partial') - n('doing') - n('merging')} | ${its.length} |`);
  }
  for (const c of board.columns) {
    const its = board.items.filter((i) => i.column === c.key);
    L.push('');
    L.push(`## ${c.label} (${its.length})`);
    if (c.key === 'done') { L.push(''); L.push('Chỉ đếm; xem từng việc ở checklist của phase.'); continue; }
    if (!its.length) { L.push(''); L.push('—'); continue; }
    L.push('');
    L.push('| Mã | Phase | Phân hệ | Việc | Ưu tiên | Người giữ · nhánh |');
    L.push('|---|---|---|---|---|---|');
    for (const i of its) {
      const who = i.claim ? `${esc(i.claim.who)} · \`${i.claim.branch}\`` : '—';
      const link = `[${i.id}](${i.file.replace(/^docs\/phases\//, '')}#L${i.line})`;
      L.push(`| ${link} | ${i.phase} | ${i.modules.length ? i.modules.join(' · ') : '—'} | ${esc(plain(i.title, 110))} | ${esc(i.priority ?? '—')} | ${who} |`);
    }
  }
  return `${L.join('\n')}\n`;
}
