#!/usr/bin/env node
// [2026-10-30 09:58 AM Johnny Chu - Chu Hoàng Anh] PHASE-002 — nhãn lớp @bizcity-layer, đồ thị phụ thuộc mốc, bản nháp API module-sdk.
/**
 * Đồ thị phụ thuộc theo lớp của apps/api/src (PHASES 1.4) → docs/audits/deps-<ngày>.{svg,md,json}.
 * Nút tô màu theo lớp (K P M D A U, bảng tests/conformance/lib/layers.mjs); cạnh đỏ = import ngược chiều lớp
 * (TARGET-LAYOUT §2), cũng là các phát hiện của check SC-LAYER-2. Không cần gói ngoài.
 *
 *   node scripts/do-thi-phu-thuoc.mjs                 ghi mốc ngày hôm nay
 *   node scripts/do-thi-phu-thuoc.mjs --date 2026-10-30
 *   node scripts/do-thi-phu-thuoc.mjs --out <thư mục>
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRepo } from '../tests/conformance/lib/repo.mjs';
import { buildGraph, nodeLabel, ALLOW } from '../tests/conformance/lib/depgraph.mjs';
import { LAYERS } from '../tests/conformance/lib/layers.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const arg = (name) => { const i = process.argv.indexOf(name); return i > 0 ? process.argv[i + 1] : undefined; };
const date = arg('--date') ?? new Date().toLocaleDateString('sv-SE');
const outDir = path.resolve(ROOT, arg('--out') ?? 'docs/audits');

const repo = createRepo(ROOT);
const g = buildGraph({ files: repo.files({ under: ['apps/api/src'] }), read: repo.read });
const byId = new Map(g.nodes.map((n) => [n.id, n]));
const bad = g.edges.filter((e) => !e.allowed);

// ── SVG ─────────────────────────────────────────────────────────────────────
const NAMES = { K: 'Kernel', P: 'Platform', M: 'Danh mục chuẩn', D: 'Module nghiệp vụ', A: 'Adapter', U: 'UI kit' };
const FILL = { K: '#c7d2fe', P: '#e5e7eb', M: '#bbf7d0', D: '#fde68a', A: '#fbcfe8', U: '#bae6fd', ASM: '#ffffff' };
const COLUMNS = [
  { key: 'ASM', title: 'Lắp ráp (apps/api)' },
  { key: 'D', title: 'D · Module nghiệp vụ' },
  { key: 'A', title: 'A · Adapter' },
  { key: 'K', title: 'K · Kernel' },
  { key: 'M', title: 'M · Danh mục chuẩn' },
  { key: 'P', title: 'P · Platform  /  U · UI kit' },
];
const colOf = (n) => (n.target === 'apps/api' ? 'ASM' : n.layer[0] === 'U' ? 'P' : n.layer[0]);
const W = 236, H = 20, GAP = 6, COLW = 300, TOP = 96, LEFT = 24;
const pos = new Map();
let maxY = 0;
COLUMNS.forEach((c, ci) => {
  const nodes = g.nodes.filter((n) => colOf(n) === c.key).sort((a, b) => (a.layer[0] === 'U') - (b.layer[0] === 'U') || a.group.localeCompare(b.group));
  nodes.forEach((n, i) => {
    const y = TOP + i * (H + GAP);
    pos.set(n.id, { x: LEFT + ci * COLW, y, col: ci });
    maxY = Math.max(maxY, y + H);
  });
});
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const short = (s, n = 38) => (s.length > n ? s.slice(0, n - 1) + '…' : s);

function edgePath(e) {
  const a = pos.get(e.from), b = pos.get(e.to);
  const ya = a.y + H / 2, yb = b.y + H / 2;
  if (b.col > a.col) { const x1 = a.x + W, x2 = b.x; const d = (x2 - x1) / 2; return `M${x1},${ya} C${x1 + d},${ya} ${x2 - d},${yb} ${x2},${yb}`; }
  if (b.col < a.col) { const x1 = a.x, x2 = b.x + W; const d = (x1 - x2) / 2; return `M${x1},${ya} C${x1 - d},${ya} ${x2 + d},${yb} ${x2},${yb}`; }
  const x = a.x + W, bulge = 18 + Math.min(40, Math.abs(yb - ya) / 6);
  return `M${x},${ya} C${x + bulge},${ya} ${x + bulge},${yb} ${x},${yb}`;
}

const width = LEFT * 2 + COLUMNS.length * COLW - (COLW - W);
const height = maxY + 40;
const svg = [];
svg.push(`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" font-family="system-ui, -apple-system, 'Segoe UI', sans-serif">`);
svg.push(`<title>Đồ thị phụ thuộc apps/api/src theo lớp — ${date}</title>`);
svg.push('<defs><marker id="a" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="6" markerHeight="6" orient="auto"><path d="M0,0 L8,4 L0,8 z" fill="#9ca3af"/></marker>' +
  '<marker id="r" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="7" markerHeight="7" orient="auto"><path d="M0,0 L8,4 L0,8 z" fill="#dc2626"/></marker></defs>');
svg.push(`<rect width="100%" height="100%" fill="#ffffff"/>`);
svg.push(`<text x="${LEFT}" y="28" font-size="16" font-weight="600" fill="#111827">Phụ thuộc apps/api/src theo lớp · ${date}</text>`);
svg.push(`<text x="${LEFT}" y="48" font-size="12" fill="#4b5563">${g.nodes.length} nút · ${g.edges.length} cạnh import · <tspan fill="#dc2626" font-weight="600">${bad.length} cạnh ngược chiều lớp (đỏ, SC-LAYER-2)</tspan> · luật: TARGET-LAYOUT §2 · nguồn: scripts/do-thi-phu-thuoc.mjs</text>`);
COLUMNS.forEach((c, ci) => svg.push(`<text x="${LEFT + ci * COLW}" y="${TOP - 12}" font-size="12" font-weight="600" fill="#374151">${esc(c.title)}</text>`));
for (const e of g.edges.filter((x) => x.allowed)) {
  svg.push(`<path d="${edgePath(e)}" fill="none" stroke="#9ca3af" stroke-opacity="0.35" stroke-width="${(0.6 + Math.log2(e.count) * 0.4).toFixed(2)}" marker-end="url(#a)"><title>${esc(`${byId.get(e.from).group} → ${byId.get(e.to).group} (${e.count})`)}</title></path>`);
}
for (const e of bad) {
  svg.push(`<path d="${edgePath(e)}" fill="none" stroke="#dc2626" stroke-width="1.8" marker-end="url(#r)"><title>${esc(`NGƯỢC CHIỀU: ${nodeLabel(byId.get(e.from))} → ${nodeLabel(byId.get(e.to))} (${e.count}) · ${e.samples[0].file}:${e.samples[0].line}`)}</title></path>`);
}
for (const n of g.nodes) {
  const p = pos.get(n.id);
  const asm = n.target === 'apps/api';
  const hot = bad.some((e) => e.from === n.id || e.to === n.id);
  svg.push(`<g><title>${esc(`${n.layer} ${nodeLabel(n)} · ${n.files} tệp`)}</title>` +
    `<rect x="${p.x}" y="${p.y}" width="${W}" height="${H}" rx="4" fill="${asm ? FILL.ASM : FILL[n.layer[0]]}" stroke="${hot ? '#dc2626' : '#6b7280'}" stroke-width="${hot ? 1.4 : 0.6}"${asm ? ' stroke-dasharray="3 2"' : ''}/>` +
    `<text x="${p.x + 6}" y="${p.y + 14}" font-size="11" fill="#111827"><tspan font-weight="700">${esc(n.layer)}</tspan> ${esc(short(nodeLabel(n)))}</text></g>`);
}
svg.push('</svg>');

// ── Báo cáo Markdown + JSON ─────────────────────────────────────────────────
const matrix = {};
for (const e of g.edges) {
  const lf = byId.get(e.from).target === 'apps/api' ? 'lắp ráp' : byId.get(e.from).layer;
  const lt = byId.get(e.to).layer;
  const cell = ((matrix[lf] ??= {})[lt] ??= { ok: 0, bad: 0 });
  e.allowed ? cell.ok += e.count : cell.bad += e.count;
}
const cols = [...new Set(g.nodes.map((n) => n.layer))].sort();
const rows = ['lắp ráp', ...cols];
const md = [];
md.push(`# Đồ thị phụ thuộc apps/api/src — mốc ${date}`);
md.push('');
md.push(`> PHASES 1.4. Sinh bởi \`node scripts/do-thi-phu-thuoc.mjs --date ${date}\` từ bảng lớp [\`tests/conformance/lib/layers.mjs\`](../../tests/conformance/lib/layers.mjs) (chép [REUSE-MAP §3](../standard/REUSE-MAP.md)) và luật chiều [TARGET-LAYOUT §2](../standard/TARGET-LAYOUT.md#2-luật-phụ-thuộc-tier-0-với-kernel-tier-1-còn-lại). Không sửa tay — chạy lại script. Cạnh ngược chiều là phát hiện của check **SC-LAYER-2** (ratchet: cạnh có trong mốc này nằm ở \`baseline.json\`, cạnh mới là đỏ).`);
md.push('');
md.push(`![Đồ thị phụ thuộc](deps-${date}.svg)`);
md.push('');
md.push(`**${g.nodes.length}** nút · **${g.edges.length}** cạnh · **${bad.length}** cạnh ngược chiều lớp.`);
md.push('');
md.push('## 1. Luật chiều đang đo');
md.push('');
md.push('| Lớp nguồn | Được import | Căn cứ |');
md.push('|---|---|---|');
const BASIS = { P: 'LAYOUT-1: Platform không biết Kernel', M: 'ADR-0005: danh mục chuẩn ở packages/data', K: 'Kernel dùng mọi gói Platform', D: 'LAYOUT-2; D → D chỉ trong cùng module', A: 'LAYOUT-4: Kernel / module chạy được khi gỡ adapter', U: 'ui-kit chỉ dựa Platform' };
for (const l of LAYERS) md.push(`| **${l}** ${NAMES[l]} | ${ALLOW[l].join(', ')} | ${BASIS[l]} |`);
md.push('| lắp ráp (`apps/api`) | mọi lớp | LAYOUT-6 |');
md.push('');
md.push('## 2. Ma trận import (số câu import, `đúng / ngược`)');
md.push('');
md.push(`| nguồn \\ đích | ${cols.join(' | ')} |`);
md.push(`|---|${cols.map(() => '---').join('|')}|`);
for (const r of rows) {
  if (!matrix[r]) continue;
  md.push(`| **${r}** | ${cols.map((c) => { const x = matrix[r][c]; return !x ? '' : x.bad ? `${x.ok} / **${x.bad}**` : `${x.ok}`; }).join(' | ')} |`);
}
md.push('');
md.push('## 3. Cạnh ngược chiều lớp (nợ cần gỡ)');
md.push('');
md.push('| # | Nguồn | Đích | Số import | Ví dụ | Hướng gỡ |');
md.push('|---|---|---|---|---|---|');
function hint(f, t) {
  if (f.layer.includes('A') && t.layer.includes('D')) return 'adapter gọi module → module đăng ký qua extension point (Phase 3)';
  if (t.layer.includes('A')) return 'đảo phụ thuộc: adapter đăng ký vào cổng Platform / sự kiện (LAYOUT-4)';
  if (f.layer === 'D' && t.layer === 'D') return 'module dùng chung → đưa phần chung về Kernel `ledger.query` hoặc khai `includes` (R-BOUND-4)';
  if (t.layer.includes('D')) return 'Kernel / Platform không biết module: chuyển route / hàm sang module, hoặc registry';
  if ((f.layer === 'P' || f.layer === 'M') && t.layer.includes('K')) return 'Platform / danh mục không import Kernel: Kernel đăng ký vào Platform (ADR-0005)';
  return '—';
}
bad.forEach((e, i) => {
  const f = byId.get(e.from), t = byId.get(e.to), s = e.samples[0];
  md.push(`| ${i + 1} | ${f.layer} \`${nodeLabel(f)}\` | ${t.layer} \`${nodeLabel(t)}\` | ${e.count} | [${s.file.replace('apps/api/src/', '')}:${s.line}](../../${s.file}#L${s.line}) | ${hint(f, t)} |`);
});
md.push('');
md.push('## 4. Nút');
md.push('');
md.push('| Lớp | Nút | Đích | Tệp | Import ra | Được import |');
md.push('|---|---|---|---|---|---|');
for (const n of g.nodes) {
  const out = g.edges.filter((e) => e.from === n.id).length, inn = g.edges.filter((e) => e.to === n.id).length;
  md.push(`| ${n.layer} | \`${n.group}\` | ${n.target} | ${n.files} | ${out} | ${inn} |`);
}
md.push('');

fs.mkdirSync(outDir, { recursive: true });
const base = path.join(outDir, `deps-${date}`);
fs.writeFileSync(`${base}.svg`, svg.join('\n') + '\n');
fs.writeFileSync(`${base}.md`, md.join('\n'));
// Một nút / một cạnh mỗi dòng: so hai mốc bằng git diff được.
const lines = (xs) => xs.map((x) => '  ' + JSON.stringify(x)).join(',\n');
fs.writeFileSync(`${base}.json`, `{"contract":"bizcity_depgraph@1","date":"${date}",\n "nodes":[\n${lines(g.nodes)}\n ],\n "edges":[\n` +
  `${lines(g.edges.map(({ samples, ...e }) => ({ ...e, at: `${samples[0].file}:${samples[0].line}` })))}\n ]}\n`);
console.log(`Đã ghi ${path.relative(ROOT, base)}.{svg,md,json}: ${g.nodes.length} nút, ${g.edges.length} cạnh, ${bad.length} ngược chiều lớp.`);
