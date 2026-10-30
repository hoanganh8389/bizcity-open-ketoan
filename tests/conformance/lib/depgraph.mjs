/**
 * Đồ thị phụ thuộc theo lớp (PHASES 1.4, TARGET-LAYOUT §2): nút = thư mục / tệp lõi của apps/api/src kèm lớp ở bảng
 * lib/layers.mjs; cạnh = import tương đối giữa hai nút. Cạnh ngược chiều lớp là nợ cần gỡ ở Phase 2–3 (SC-LAYER-2).
 * Không phụ thuộc gói ngoài: dùng chung cho check (ctx.repo) và scripts/do-thi-phu-thuoc.mjs (fs).
 */
import path from 'node:path';
import { LAYER_ROOTS, expectedLayer } from './layers.mjs';

/** Lớp nguồn được import lớp đích (TARGET-LAYOUT §2, ADR-0005). D → D chỉ trong cùng module. */
export const ALLOW = {
  P: ['P', 'M'], // LAYOUT-1: Platform không biết Kernel; data (gồm danh mục chuẩn) là gói thấp nhất
  M: ['M', 'P'], // ADR-0005: danh mục chuẩn ở packages/data, không import Kernel
  K: ['K', 'P', 'M'],
  D: ['D', 'K', 'P', 'M', 'U'], // LAYOUT-2 (qua module-sdk ở Phase 3)
  A: ['A', 'K', 'P', 'M'], // LAYOUT-4: Kernel / module không cần adapter; adapter không import module
  U: ['U', 'P'],
};
/** Đích lắp ráp (LAYOUT-6): được import mọi lớp. */
export const ASSEMBLY = new Set(['apps/api']);

const IMPORT_RE = /(?:^|\n)\s*(?:import|export)\s+(?:type\s+)?(?:[^'";]*?\s+from\s+)?['"](\.{1,2}\/[^'"]+)['"]|import\(\s*['"](\.{1,2}\/[^'"]+)['"]\s*\)/g;

/** Nhóm: modules/<x>, phan-he/<x>, addins/<x>, core/security; tệp lẻ ở gốc / core / db là một nút. */
export function groupOf(file) {
  const root = LAYER_ROOTS.find((r) => file.startsWith(r + '/'));
  const parts = file.slice(root.length + 1).replace(/\.tsx?$/, '').split('/');
  if (['modules', 'phan-he', 'addins'].includes(parts[0]) && parts.length > 2) return `${parts[0]}/${parts[1]}`;
  if (parts[0] === 'core' && parts[1] === 'security') return 'core/security';
  if (parts[0] === 'config') return 'config';
  return parts.join('/');
}

const layersOf = (tag) => tag.layer.split('+');

/** Cạnh from → to có đúng chiều lớp không. */
export function edgeAllowed(from, to) {
  if (ASSEMBLY.has(from.target)) return true;
  for (const lf of layersOf(from)) for (const lt of layersOf(to)) {
    if (!ALLOW[lf]?.includes(lt)) continue;
    if (lf === 'D' && lt === 'D' && from.target !== to.target) continue;
    return true;
  }
  return false;
}

/**
 * buildGraph({ files: string[], read: (file) => string|null }) →
 *   { nodes: [{ id, group, layer, target, files }], edges: [{ from, to, count, allowed, samples: [{ file, line, spec }] }] }
 */
export function buildGraph({ files, read }) {
  const src = files.filter((f) => /\.tsx?$/.test(f) && LAYER_ROOTS.some((r) => f.startsWith(r + '/')));
  const known = new Set(src);
  const nodeOf = new Map();
  const nodes = new Map();
  for (const file of src) {
    const tag = expectedLayer(file);
    if (!tag) continue;
    const group = groupOf(file);
    const id = `${group}|${tag.layer}|${tag.target}`;
    if (!nodes.has(id)) nodes.set(id, { id, group, layer: tag.layer, target: tag.target, files: 0 });
    nodes.get(id).files++;
    nodeOf.set(file, id);
  }
  const edges = new Map();
  for (const file of src) {
    const from = nodeOf.get(file);
    if (!from) continue;
    const text = read(file) ?? '';
    for (const m of text.matchAll(IMPORT_RE)) {
      const spec = m[1] ?? m[2];
      const base = path.posix.normalize(path.posix.join(path.posix.dirname(file), spec));
      const target = [base.replace(/\.js$/, '.ts'), base.replace(/\.js$/, '.tsx'), base, `${base}.ts`, `${base}/index.ts`].find((c) => known.has(c));
      const to = target && nodeOf.get(target);
      if (!to || to === from) continue;
      const key = `${from}->${to}`;
      if (!edges.has(key)) edges.set(key, { from, to, count: 0, allowed: edgeAllowed(nodes.get(from), nodes.get(to)), samples: [] });
      const e = edges.get(key);
      e.count++;
      if (e.samples.length < 3) e.samples.push({ file, line: text.slice(0, m.index).split('\n').length + (m[0].startsWith('\n') ? 1 : 0), spec });
    }
  }
  return {
    nodes: [...nodes.values()].sort((a, b) => a.id.localeCompare(b.id)),
    edges: [...edges.values()].sort((a, b) => a.from.localeCompare(b.from) || a.to.localeCompare(b.to)),
  };
}

/** Nhãn nút: nhóm, kèm đích khi đích không suy ra được từ tên nhóm. */
export const nodeLabel = (n) => (n.target === 'apps/api' || n.group.startsWith('phan-he/') ? n.group : `${n.group} → ${n.target}`);
