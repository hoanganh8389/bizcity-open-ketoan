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
    items.push({ id, title: plain(col('việc') || c[1]), priority: plain(col('ưu tiên')) || null, status: sym ? STATUS_SYMBOLS[sym] : 'unknown', statusText: plain(statusCell, 120), file, line });
  }
  return { items, problems };
}

/** Đọc mọi checklist. `files`: [{ path, text }]. */
export function parseAllChecklists(files) {
  const items = [];
  const problems = [];
  for (const f of files) {
    const m = CHECKLIST_RE.exec(f.path);
    if (!m) continue;
    const r = parseChecklist(f.text, f.path);
    for (const it of r.items) items.push({ ...it, phase: m[1] });
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
    return { id: it.id, phase: it.phase, title: it.title, priority: it.priority, status: it.status, column, claim: c, file: it.file, line: it.line };
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
  for (const c of board.columns) {
    const its = board.items.filter((i) => i.column === c.key);
    L.push('');
    L.push(`## ${c.label} (${its.length})`);
    if (c.key === 'done') { L.push(''); L.push('Chỉ đếm; xem từng việc ở checklist của phase.'); continue; }
    if (!its.length) { L.push(''); L.push('—'); continue; }
    L.push('');
    L.push('| Mã | Phase | Việc | Ưu tiên | Người giữ · nhánh |');
    L.push('|---|---|---|---|---|');
    for (const i of its) {
      const who = i.claim ? `${esc(i.claim.who)} · \`${i.claim.branch}\`` : '—';
      const link = `[${i.id}](${i.file.replace(/^docs\/phases\//, '')}#L${i.line})`;
      L.push(`| ${link} | ${i.phase} | ${esc(plain(i.title, 110))} | ${esc(i.priority ?? '—')} | ${who} |`);
    }
  }
  return `${L.join('\n')}\n`;
}
