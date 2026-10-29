/**
 * Tìm và nạp check. Một tệp `*.check.mjs` (lane selfcheck) hoặc `*.diag.mjs` (lane diagnostics) xuất
 * `default` (một check) hoặc `checks` (mảng). Khuôn check: schema/check.schema.json (`bizcity_check@1`).
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

export const SUITE_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

export async function loadChecks(url) {
  const mod = await import(url);
  const list = mod.checks ?? (mod.default ? [mod.default] : []);
  return list;
}

export async function discover() {
  const out = [];
  for (const [dir, lane] of [['checks', 'selfcheck'], ['diagnostics', 'diagnostics']]) {
    for (const file of walk(path.join(SUITE_DIR, dir))) {
      if (!/\.(check|diag)\.mjs$/.test(file)) continue;
      for (const c of await loadChecks(pathToFileURL(file).href)) out.push({ ...c, lane: c.lane ?? lane, file });
    }
  }
  return out.sort((a, b) => a.id.localeCompare(b.id, 'en', { numeric: true }));
}

function walk(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = path.join(dir, e.name);
    return e.isDirectory() ? walk(p) : [p];
  }).sort();
}
