// @bizcity-layer P bizcity.config
// [2026-11-09 11:00 AM Johnny Chu - Chu Hoàng Anh] PHASE-030 — S030-51a (B5a, PHASE-030 · 26 §4.1 ①): ctx.libraries trong action — validate / require theo thư viện dùng chung, đã áp cấu hình đơn vị; ghi bằng chứng, đếm sử dụng, cảnh báo qua ctx.meta
/**
 * `ctx.libraries` của action (bizcity_action@1 1.4.0-draft). Cùng bộ kiểm với POST /api/v1/libraries/:id/validate:
 *
 *   validate(id, input, { at?, field? })  → ValidateResult | null   không ném lỗi; handler tự quyết
 *   require(id, input, { at?, field? })   → ValidateResult | null   `block` → Errors.validation (LIB-*); `warn` → ctx.meta('libraryWarnings')
 *
 * `null` = đơn vị đã tắt thư viện tuỳ chọn này (bỏ qua, ghi outcome 'off'). `at` bắt buộc khi manifest của module khai
 * `libraries[].at = "docDate"` (không đoán ngày chứng từ); không khai thì mặc định hôm nay. Mọi lần gọi ghi `ctx.evidence.note('libraries', […])`
 * (chỉ mã mục và giá trị thư viện — không ghi giá trị người nhập) và đếm một lượt (nguồn `modules/<key>`), trừ khi chạy thử (dryRun).
 */
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Db } from '../../db/client.js';
import { env } from '../../config/env.js';
import { Errors } from '../errors.js';
import { getLibrary, validateInLibrary } from './index.js';
import { flushLibraryUsage, recordLibraryUsage, shouldFlush } from './usage.js';
import { currentLibraryConfig, type LibraryConfig } from './settings.js';
import type { LibraryFinding, LibraryInput, ValidateResult } from './types.js';

export interface LibraryDecl { id: string; fields?: string[]; at?: 'docDate' | 'today'; required?: boolean }
export interface LibraryCallOpts { at?: string; field?: string }
export interface ActionLibraries {
  validate(id: string, input: LibraryInput, opts?: LibraryCallOpts): Promise<ValidateResult | null>;
  require(id: string, input: LibraryInput, opts?: LibraryCallOpts): Promise<ValidateResult | null>;
}
export interface LibraryEvidenceRow {
  library: string; version: string; hash: string; at: string; field?: string; code?: string; value?: unknown;
  valueSource: 'library' | 'tenant'; outcome: 'pass' | 'warn' | 'block' | 'off';
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
// Cùng cách tính gốc repo với index.ts (core/libraries → core → src|dist → platform → packages → gốc).
const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../../..');
const modulesDir = (): string => (env.BIZCITY_MODULES_DIR ? path.resolve(env.BIZCITY_MODULES_DIR) : path.join(REPO, 'modules'));

const declCache = new Map<string, LibraryDecl[]>();
/** `libraries[]` trong bizcity.module.json của module (theo thư mục modules/<key>); module không có manifest → []. */
export function moduleLibraryDecls(moduleKey: string): LibraryDecl[] {
  const dir = modulesDir();
  const k = `${dir}\u0001${moduleKey}`;
  const hit = declCache.get(k);
  if (hit) return hit;
  let out: LibraryDecl[] = [];
  const file = path.join(dir, moduleKey, 'bizcity.module.json');
  if (/^[a-z][a-z0-9-]{1,31}$/.test(moduleKey) && existsSync(file)) {
    try {
      const m = JSON.parse(readFileSync(file, 'utf8')) as { libraries?: LibraryDecl[] };
      if (Array.isArray(m.libraries)) out = m.libraries.filter((d) => d && typeof d.id === 'string');
    } catch { /* manifest hỏng đã bị bộ kiểm khởi động / SC-MOD chặn; ở đây coi như không khai */ }
  }
  declCache.set(k, out);
  return out;
}
/** Nạp lại (test). */
export function resetModuleLibraryDecls(): void {
  declCache.clear();
}

/** Mã chuẩn của mục đã khớp (sau bí danh); không có khi mã lạ. Không bao giờ ghi giá trị người nhập. */
function itemCodeOf(r: ValidateResult, input: LibraryInput): string | undefined {
  if (r.findings.some((f) => f.code === 'LIB-UNKNOWN-001' || (f.code === 'LIB-SCHEMA-001' && f.path === 'code'))) return undefined;
  if (r.resolved) return r.resolved;
  const code = typeof input === 'string' ? input : input?.code;
  return typeof code === 'string' && code.trim() ? code.trim().slice(0, 80) : undefined;
}

const today = (): string => new Date().toISOString().slice(0, 10);

export interface LibraryContextDeps {
  trx: Db;
  tenantId: string;
  /** Mã action `<module>.<việc>` — module = tiền tố. */
  actionId: string;
  dryRun: boolean;
  note: (key: string, value: unknown) => void;
  meta: (key: string, value: unknown) => void;
}

export function makeLibraryContext(deps: LibraryContextDeps): ActionLibraries {
  const moduleKey = deps.actionId.split('.')[0]!;
  const rows: LibraryEvidenceRow[] = [];
  const warnings: { library: string; code: string; path: string; message: string; field?: string }[] = [];
  const configs = new Map<string, LibraryConfig | undefined>();

  async function run(mode: 'validate' | 'require', id: string, input: LibraryInput, opts: LibraryCallOpts = {}): Promise<ValidateResult | null> {
    const lib = getLibrary(id);
    if (!lib) throw Errors.notFound(`thư viện ${id} (xem GET /api/v1/libraries)`);
    if (opts.at !== undefined && !DATE_RE.test(opts.at)) throw Errors.validation(`ctx.libraries: at "${opts.at}" phải là YYYY-MM-DD`);
    const decl = moduleLibraryDecls(moduleKey).find((d) => d.id === id);
    if (!configs.has(id)) configs.set(id, (await currentLibraryConfig(deps.trx, deps.tenantId, id))?.config);
    const config = configs.get(id);
    // Đơn vị chọn "đọc theo hôm nay" (atPolicy) thì thắng ngày chứng từ — cùng quy tắc với POST /api/v1/libraries/:id/validate.
    if (opts.at === undefined && decl?.at === 'docDate' && config?.atPolicy !== 'today') {
      throw Errors.validation(`ctx.libraries: ${deps.actionId} dùng ${id} theo ngày chứng từ (libraries[].at = docDate) — truyền { at: <ngày chứng từ> }`);
    }
    const at = config?.atPolicy === 'today' ? today() : (opts.at ?? today());
    if (config?.enabled === false) {
      rows.push({ library: id, version: lib.version, hash: lib.contentHash, at, ...(opts.field ? { field: opts.field } : {}), valueSource: 'library', outcome: 'off' });
      deps.note('libraries', rows);
      return null;
    }
    const result = validateInLibrary(id, input, { at, config })!;
    if (!deps.dryRun) recordLibraryUsage(deps.tenantId, result, input, `modules/${moduleKey}`);
    const worst = result.findings.find((f) => f.level === 'block') ?? result.findings.find((f) => f.level === 'warn');
    rows.push({
      library: id, version: result.library.version, hash: result.library.hash, at, ...(opts.field ? { field: opts.field } : {}),
      ...(itemCodeOf(result, input) ? { code: itemCodeOf(result, input) } : {}), ...(result.value !== undefined ? { value: result.value } : {}),
      valueSource: result.valueSource ?? 'library', outcome: worst ? (worst.level === 'block' ? 'block' : 'warn') : 'pass',
    });
    deps.note('libraries', rows);
    if (mode === 'require') {
      const block = result.findings.find((f) => f.level === 'block');
      if (block) throw Errors.validation(`${block.code}: ${block.message}`, { library: id, code: block.code, path: block.path, ...(opts.field ? { field: opts.field } : {}), suggestions: block.suggestions });
      const warns: LibraryFinding[] = result.findings.filter((f) => f.level === 'warn');
      if (warns.length) {
        for (const w of warns) warnings.push({ library: id, code: w.code, path: w.path, message: w.message, ...(opts.field ? { field: opts.field } : {}) });
        deps.meta('libraryWarnings', warnings);
      }
    }
    return result;
  }

  return {
    validate: (id, input, opts) => run('validate', id, input, opts),
    require: (id, input, opts) => run('require', id, input, opts),
  };
}

/** Ghi bộ đếm sử dụng khi đủ 30 giây / 200 dòng (SC-EVT-1: không hẹn giờ — gom theo lượt). Lỗi ghi: bỏ lô, không làm hỏng action. */
export async function flushLibraryUsageIfDue(db: Db): Promise<void> {
  if (!shouldFlush()) return;
  await flushLibraryUsage(db).catch(() => undefined);
}
