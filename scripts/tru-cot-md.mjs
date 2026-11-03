#!/usr/bin/env node
// [2026-11-04 02:00 AM Johnny Chu - Chu Hoàng Anh] PHASE-026 — sinh bảng đánh giá mức đạt (10-DANH-GIA-ADAPT.md) từ docs/standard/tru-cot.json — một nguồn, hai mặt (màn HT10 và tài liệu)
/**
 * Dùng: node scripts/tru-cot-md.mjs            → ghi docs/phases/PHASE-026-MASTER-DATA-GOVERNANCE/10-DANH-GIA-ADAPT.md
 *       node scripts/tru-cot-md.mjs --kiem     → chỉ kiểm: tệp .md đang khớp với .json chưa (dùng trong kiem-chuan)
 */
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const src = path.join(root, 'docs/standard/tru-cot.json');
const out = path.join(root, 'docs/phases/PHASE-026-MASTER-DATA-GOVERNANCE/10-DANH-GIA-ADAPT.md');
const board = JSON.parse(readFileSync(src, 'utf8'));
const W = { dat: 1, 'mot-phan': 0.5, 'tai-lieu': 0.25, chua: 0 };
const LABEL = { dat: '✅ Đạt', 'mot-phan': '🟡 Một phần', 'tai-lieu': '📄 Tài liệu', chua: '☐ Chưa' };
const pct = (cs) => Math.round((cs.reduce((s, c) => s + W[c.status], 0) / (cs.length || 1)) * 100);
const esc = (s) => String(s ?? '').replace(/\|/g, '\\|');

const lines = [];
lines.push('# PHASE-026 · 10 — Đánh giá mức adapt: trụ cột × tiêu chí × mức đạt');
lines.push(`<!-- [2026-11-04 02:00 AM Johnny Chu - Chu Hoàng Anh] PHASE-026 — SINH TỰ ĐỘNG từ docs/standard/tru-cot.json (${board.contract} ${board.version}, cập nhật ${board.updated}) bằng scripts/tru-cot-md.mjs — sửa ở tệp JSON rồi chạy lại, không sửa tay ở đây -->`);
lines.push('');
lines.push('Cùng một nguồn với màn **HT10 Trụ cột & mức đạt** và thẻ **Trụ cột** ở trang chủ phân hệ. Mức đạt đi theo bằng chứng (migration, test, check); không ai tích tay (R-CONT-7). Trọng số: đạt 1 · một phần ½ · tài liệu ¼ · chưa 0.');
lines.push('');
lines.push('## Tổng quan');
lines.push('');
lines.push('| Tầng | Trụ cột | Mức | Đạt | Một phần | Tài liệu | Chưa |');
lines.push('|---|---|---|---|---|---|---|');
for (const p of board.pillars) {
  const n = (st) => p.criteria.filter((c) => c.status === st).length;
  lines.push(`| ${p.role === 'nền móng' ? 'Nền móng' : p.id} | ${esc(p.title)} | **${pct(p.criteria)} %** | ${n('dat')} | ${n('mot-phan')} | ${n('tai-lieu')} | ${n('chua')} |`);
}
lines.push('');
for (const p of board.pillars) {
  lines.push(`## ${p.role === 'nền móng' ? 'Nền móng' : `Trụ cột ${p.id}`} · ${p.title} — ${pct(p.criteria)} %`);
  lines.push('');
  lines.push(`> ${p.one}`);
  lines.push('');
  lines.push('| Mã | Tiêu chí | Mức | Bằng chứng | Khoảng cách | Việc tiếp | Ưu tiên |');
  lines.push('|---|---|---|---|---|---|---|');
  for (const c of p.criteria) lines.push(`| ${c.id} | ${esc(c.text)} | ${LABEL[c.status]} | ${esc(c.evidence) || '—'} | ${esc(c.gap) || '—'} | ${c.next ? `${c.next} (${c.phase})` : '—'} | ${c.level} |`);
  lines.push('');
}
const md = lines.join('\n');
if (process.argv.includes('--kiem')) {
  let cur = '';
  try { cur = readFileSync(out, 'utf8'); } catch { /* chưa có */ }
  if (cur !== md) { console.error('10-DANH-GIA-ADAPT.md lệch với tru-cot.json — chạy: node scripts/tru-cot-md.mjs'); process.exit(1); }
  console.log('ok: 10-DANH-GIA-ADAPT.md khớp tru-cot.json');
} else {
  writeFileSync(out, md);
  console.log(`đã ghi ${path.relative(root, out)}`);
}
