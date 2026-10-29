/**
 * `ctx` mà mỗi check nhận. Một check chỉ được đọc qua ctx — không tự mở tệp ngoài gốc, không ghi gì.
 *
 *   ctx.repo   gốc ĐANG BỊ KIỂM (repo, hoặc thư mục module khi chạy --module)
 *   ctx.core   gốc Core (chuẩn, schema, bảng năng lực) — trùng ctx.repo khi kiểm cả repo
 *   ctx.mode   'repo' | 'module'
 */
import { createRepo } from './repo.mjs';
import { lintSchema, validate } from './jsonschema.mjs';
import { parseMigrations } from './sql.mjs';

export function createContext({ root, core, mode = 'repo', args = {}, db = null }) {
  const repo = createRepo(root);
  const coreRepo = core && core !== root ? createRepo(core) : repo;
  let migrations;
  const schemas = new Map();

  return {
    repo,
    core: coreRepo,
    mode,
    args,
    db,
    migrations: () => (migrations ??= parseMigrations(repo)),
    standard: () => coreRepo.json('docs/standard/bizcity-standard.json'),
    schema(rel) { if (!schemas.has(rel)) schemas.set(rel, coreRepo.json(rel)); return schemas.get(rel); },
    validate(schemaRel, data) { return validate(this.schema(schemaRel), data); },
    lintSchema,
    /** Tạo một phát hiện. `key` là dấu vân tay ổn định (không chứa số dòng) để so với baseline. */
    finding(file, line, message, key) {
      return { file: file ?? null, line: line ?? null, message, key: key ?? null };
    },
  };
}
