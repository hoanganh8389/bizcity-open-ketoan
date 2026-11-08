// @bizcity-layer P bizcity.config
// [2026-11-07 10:20 PM Johnny Chu - Chu Hoàng Anh] PHASE-030 — S030-45 (ADR-0032, BIZCITY-LIBRARY-v1 §10): bộ nạp thư viện dùng chung — đọc libraries/*/library.json một lần, bỏ thư viện băm lệch (đóng an toàn), tra theo id, mã luật riêng cho thư viện phát hiện
/**
 * Máy chủ đọc thư viện từ tệp (không CSDL), giữ trong bộ nhớ theo version + contentHash. Image api chép thư mục `libraries/`.
 * Thư viện có contentHash lệch nội dung KHÔNG được phục vụ (ghi vào `libraryLoadErrors()`): dữ liệu tham chiếu sai im lặng
 * nguy hiểm hơn thiếu.
 *
 *   listLibraries()            phong bì (không items) của mọi thư viện nạp được
 *   getLibrary(id)             thư viện đầy đủ, hoặc undefined
 *   validateInLibrary(id, …)   validateAgainstLibrary với tra chéo thư viện khác (suggest.fromLibrary)
 *   libraryRuleFindings()      mã luật riêng (cổng L, source bizcity_library:<id>) cho GET /api/v1/findings
 */
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { hashItems, validateAgainstLibrary } from './engine.js';
import type { Library, LibraryInput, ValidateResult } from './types.js';

export * from './types.js';
export { canonical, checkSchema, effectiveAt, hashItems, nearest, selectorRows, validateAgainstLibrary } from './engine.js';

// Chạy từ src (tsx) hay dist (node) thì gốc repo đều cách 5 cấp (core/libraries → core → src|dist → platform → packages → gốc).
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../../..');
export const LIBRARIES_DIR = path.join(ROOT, 'libraries');

let cache: { libs: Map<string, Library>; errors: { id: string; message: string }[] } | null = null;

function load() {
  if (cache) return cache;
  const libs = new Map<string, Library>();
  const errors: { id: string; message: string }[] = [];
  const dirs = existsSync(LIBRARIES_DIR) ? readdirSync(LIBRARIES_DIR, { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name).sort() : [];
  for (const d of dirs) {
    const file = path.join(LIBRARIES_DIR, d, 'library.json');
    if (!existsSync(file)) continue;
    try {
      const lib = JSON.parse(readFileSync(file, 'utf8')) as Library;
      if (lib.contract !== 'bizcity_library@1' || lib.id !== d) { errors.push({ id: d, message: 'sai contract hoặc id khác tên thư mục' }); continue; }
      if (hashItems(lib.items) !== lib.contentHash) { errors.push({ id: d, message: 'contentHash lệch nội dung — không phục vụ' }); continue; }
      libs.set(lib.id, lib);
    } catch (e) {
      errors.push({ id: d, message: `JSON hỏng: ${(e as Error).message}` });
    }
  }
  cache = { libs, errors };
  return cache;
}

/** Nạp lại (test). */
export function resetLibraries(): void {
  cache = null;
}

export function listLibraries(): Omit<Library, 'items' | 'rules' | 'itemSchema'>[] {
  return [...load().libs.values()].map(({ items: _i, rules: _r, itemSchema: _s, ...env }) => env);
}

export const getLibrary = (id: string): Library | undefined => load().libs.get(id);

export const libraryLoadErrors = () => [...load().errors];

export function validateInLibrary(id: string, input: LibraryInput, opts: { at?: string } = {}): ValidateResult | undefined {
  const lib = getLibrary(id);
  return lib ? validateAgainstLibrary(lib, input, { at: opts.at, lookup: getLibrary }) : undefined;
}

/** Mã luật riêng của mọi thư viện, theo khuôn FindingEntry của bizcity_findings@1 (cổng L). */
export function libraryRuleFindings() {
  return [...load().libs.values()].flatMap((lib) => (lib.rules ?? []).map((r) => ({
    code: r.code, gate: 'L' as const, level: r.level, step: lib.id, title: r.title, why: r.why, fix: r.fix ?? '', rule: 'ADR-0032',
    learn: `libraries/${lib.id}/README.md`, status: 'approved' as const, basis: (r.basis ?? []).map((b) => ({ key: b.key ?? 'NOI-BO', title: b.ref, page: 'docs/can-cu/01-danh-muc-van-ban.md' })),
    source: `bizcity_library:${lib.id}` as const,
  })));
}

/** README của thư viện (hướng dẫn bắt buộc, D-LIB-6), hoặc null. */
export function libraryReadme(id: string): string | null {
  const f = path.join(LIBRARIES_DIR, id, 'README.md');
  return getLibrary(id) && existsSync(f) ? readFileSync(f, 'utf8') : null;
}

// [2026-11-08 03:30 PM Johnny Chu - Chu Hoàng Anh] PHASE-030 — S030-48: bộ đếm lượt dùng thư viện (B2)
export { flushLibraryUsage, libraryUsage, normalizeSource, outcomeOf, pendingUsageRows, recordLibraryUsage, resetLibraryUsage, shouldFlush, type UsageReport } from './usage.js';
