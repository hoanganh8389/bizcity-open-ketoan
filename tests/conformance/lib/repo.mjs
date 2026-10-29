/**
 * Chỉ mục tệp của một gốc (repo hoặc thư mục module) + trợ giúp đọc / grep. Mỗi worker tự dựng một bản, có cache.
 * Đường dẫn trả ra luôn là tương đối, dấu '/'.
 */
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';

const IGNORE_DIRS = new Set(['node_modules', 'dist', '.git', 'coverage', 'backups', '.bizcity', '.vite', '.turbo']);
/** Không bao giờ quét: kết quả chạy và bộ dữ liệu cố ý sai của chính bộ kiểm. */
const DEFAULT_EXCLUDE = ['tests/conformance/output', 'tests/conformance/fixtures', 'apps/api/data', 'data'];

export function createRepo(root, { exclude = DEFAULT_EXCLUDE } = {}) {
  root = path.resolve(root);
  const text = new Map();
  let index = null;

  const toRel = (abs) => path.relative(root, abs).split(path.sep).join('/');
  const toAbs = (rel) => path.join(root, ...rel.split('/'));
  const excluded = (rel) => exclude.some((x) => rel === x || rel.startsWith(x + '/'));

  function walk(dir, out) {
    let entries;
    try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return out; }
    for (const e of entries) {
      if (IGNORE_DIRS.has(e.name)) continue;
      const abs = path.join(dir, e.name);
      const rel = toRel(abs);
      if (excluded(rel)) continue;
      if (e.isDirectory()) walk(abs, out);
      else if (e.isFile()) out.push(rel);
    }
    return out;
  }

  const all = () => (index ??= walk(root, []).sort());

  /** files({ under: ['apps/api/src'], ext: ['.ts'], match: /regex/, not: /regex/ }) */
  function files({ under, ext, match, not } = {}) {
    return all().filter((f) =>
      (!under || under.some((u) => u === '.' || f === u || f.startsWith(u.replace(/\/$/, '') + '/'))) &&
      (!ext || ext.some((x) => f.endsWith(x))) &&
      (!match || match.test(f)) &&
      (!not || !not.test(f)));
  }

  function read(rel) {
    if (!text.has(rel)) {
      try { text.set(rel, fs.readFileSync(toAbs(rel), 'utf8').replace(/^﻿/, '')); } catch { text.set(rel, null); }
    }
    return text.get(rel);
  }

  const lines = (rel) => (read(rel) ?? '').split(/\r?\n/);
  const exists = (rel) => fs.existsSync(toAbs(rel));
  const isDir = (rel) => { try { return fs.statSync(toAbs(rel)).isDirectory(); } catch { return false; } };
  const json = (rel) => { const t = read(rel); return t == null ? undefined : JSON.parse(t); };
  const list = (rel) => { try { return fs.readdirSync(toAbs(rel)).sort(); } catch { return []; } };
  /** Băm nội dung đã chuẩn hoá xuống dòng (CRLF trên Windows không làm đổi băm). */
  const hash = (rel) => 'sha256:' + createHash('sha256').update((read(rel) ?? '').replace(/\r\n/g, '\n')).digest('hex');

  /**
   * Grep từng dòng. `re` không cần cờ g. Trả { file, line, text }.
   * `skipComments`: bỏ dòng chỉ là chú thích (//, *, --).
   */
  function grep(re, opts = {}) {
    const out = [];
    for (const f of files(opts)) {
      const ls = lines(f);
      for (let i = 0; i < ls.length; i++) {
        const t = ls[i];
        if (opts.skipComments && /^\s*(\/\/|\*|\/\*|--)/.test(t)) continue;
        if (re.test(t)) out.push({ file: f, line: i + 1, text: t.trim().slice(0, 200) });
      }
    }
    return out;
  }

  return { root, files, read, lines, exists, isDir, json, list, hash, grep, toAbs };
}

/** Khoá phân hệ / add-in / module mà một tệp thuộc về (dùng cho bảng điểm theo module). */
export function moduleOf(file) {
  if (!file) return null;
  let m = /^apps\/(?:api|web)\/src\/phan-he\/([^/]+)\//.exec(file);
  if (m) return `phan-he:${m[1]}`;
  m = /^apps\/(?:api|web)\/src\/addins\/([^/]+)\//.exec(file);
  if (m) return `addin:${m[1]}`;
  m = /^modules\/([^/]+)\//.exec(file); // cây đích Phase 3
  if (m) return `module:${m[1]}`;
  return null;
}
