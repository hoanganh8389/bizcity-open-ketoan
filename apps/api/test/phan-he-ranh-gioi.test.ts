/**
 * Ranh giới phân hệ: mã trong src/phan-he/<A>/ (máy chủ) và apps/web/src/phan-he/<A>/ (giao diện) KHÔNG được import
 * thư mục phân hệ khác — chỉ import lõi. Cần dùng chung thì đưa về lõi (xem docs/phat-trien.md "Cấu trúc theo phân hệ").
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const here = path.dirname(fileURLToPath(import.meta.url));
const WEB_SRC = path.resolve(here, '../../web/src');
const ROOTS = [path.resolve(here, '../src/phan-he'), path.join(WEB_SRC, 'phan-he')];

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((f) => {
    const p = path.join(dir, f);
    return statSync(p).isDirectory() ? files(p) : /\.tsx?$/.test(f) ? [p] : [];
  });
}

describe('Ranh giới phân hệ', () => {
  it('phân hệ không import phân hệ khác', () => {
    const bad: string[] = [];
    for (const root of ROOTS) {
      for (const file of files(root)) {
        const own = path.relative(root, file).split(path.sep);
        if (own.length < 2) continue; // tệp lắp ráp ở gốc phan-he (index, types, icons, loi)
        for (const m of readFileSync(file, 'utf8').matchAll(/from\s+['"]((?:\.{1,2}\/|@\/)[^'"]+)['"]/g)) {
          const spec = m[1]!;
          const target = spec.startsWith('@/') ? path.join(WEB_SRC, spec.slice(2)) : path.resolve(path.dirname(file), spec);
          const rel = path.relative(root, target).split(path.sep);
          if (rel[0] !== '..' && rel.length > 1 && rel[0] !== own[0]) bad.push(`${path.relative(root, file)} → ${spec}`);
        }
      }
    }
    expect(bad).toEqual([]);
  });
});
