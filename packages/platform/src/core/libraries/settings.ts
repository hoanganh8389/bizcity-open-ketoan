// @bizcity-layer P bizcity.config
// [2026-11-08 07:30 PM Johnny Chu - Chu Hoàng Anh] PHASE-030 — S030-49b (B3b, PHASE-030 · 26 §7.1): cấu hình thư viện theo đơn vị có phiên bản (library_settings, chỉ thêm) — kiểm khuôn, chặn kỳ đã khoá cho ghi đè, đọc bản hiện hành / lịch sử
/**
 * config = { enabled?, atPolicy?, ruleLevels?, overrides? } (chữ chốt 26 §7.1):
 *   enabled: false      chỉ với thư viện khai `optional: true`; tắt thì bộ kiểm / ô chọn trả NOT_FOUND cho đơn vị
 *   atPolicy            docDate (mặc định) | today — chỉ thư viện param
 *   ruleLevels          { mã luật của thư viện: warn | info } — CHỈ HẠ; không áp LIB-* chuẩn
 *   overrides           { mã mục: [{ from, value, reason, basisKey? }] } — chỉ mục có effective[]; giá trị đúng khuôn của mục;
 *                       `from` mới rơi vào kỳ đã khoá → PERIOD_LOCKED (như HT13)
 * Không đổi thư viện gốc. Bộ kiểm đọc: ghi đè đơn vị có hiệu lực tại ngày → thư viện tại ngày (D-LIB-8).
 */
import { sql } from 'kysely';
import type { Db } from '../../db/client.js';
import { Errors } from '../errors.js';
import { lockedPeriodAt } from '../settings.js';
import { checkSchema, overrideAt, valueSchemaOf } from './engine.js';
import type { FindingLevel, Library } from './types.js';

export interface OverrideEntry { from: string; value: unknown; reason: string; basisKey?: string }
export interface LibraryConfig {
  enabled?: boolean;
  atPolicy?: 'docDate' | 'today';
  ruleLevels?: Record<string, 'warn' | 'info'>;
  overrides?: Record<string, OverrideEntry[]>;
}
export interface LibraryConfigVersion { version: number; config: LibraryConfig; reason: string; createdBy: string; createdAt: string }

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const RANK: Record<FindingLevel, number> = { block: 3, warn: 2, info: 1 };

/** Lỗi khuôn của cấu hình (rỗng = hợp lệ). basisKeys: mã + bí danh của vn.can-cu-phap-ly. */
export function checkLibraryConfig(lib: Library, cfg: LibraryConfig, basisKeys?: Set<string>): string[] {
  const errs: string[] = [];
  const known = new Set(['enabled', 'atPolicy', 'ruleLevels', 'overrides']);
  for (const k of Object.keys(cfg)) if (!known.has(k)) errs.push(`khoá cấu hình lạ: ${k}`);
  if (cfg.enabled === false && !lib.optional) errs.push(`thư viện ${lib.id} không phải tuỳ chọn — không tắt được`);
  if (cfg.atPolicy !== undefined) {
    if (!['docDate', 'today'].includes(cfg.atPolicy)) errs.push('atPolicy phải là docDate hoặc today');
    else if (lib.kind !== 'param') errs.push('atPolicy chỉ dùng cho thư viện tham số (param)');
  }
  for (const [code, level] of Object.entries(cfg.ruleLevels ?? {})) {
    const rule = (lib.rules ?? []).find((r) => r.code === code);
    if (!rule) { errs.push(`ruleLevels: ${code} không phải luật của thư viện (mã LIB-* chuẩn không hạ được)`); continue; }
    if (!['warn', 'info'].includes(level)) errs.push(`ruleLevels.${code}: chỉ warn hoặc info`);
    else if (RANK[level] >= RANK[rule.level]) errs.push(`ruleLevels.${code}: chỉ được hạ mức (gốc ${rule.level})`);
  }
  for (const [code, list] of Object.entries(cfg.overrides ?? {})) {
    const item = lib.items.find((i) => i.code === code);
    if (!item) { errs.push(`overrides: ${code} không có trong thư viện (dùng mã chuẩn)`); continue; }
    if (!item.effective?.length) { errs.push(`overrides.${code}: mục không có giá trị theo ngày — không ghi đè được`); continue; }
    if (!Array.isArray(list) || !list.length) { errs.push(`overrides.${code}: cần ít nhất một khoảng`); continue; }
    const vs = valueSchemaOf(lib, item);
    const froms = new Set<string>();
    list.forEach((o, i) => {
      const at = `overrides.${code}[${i}]`;
      if (!DATE_RE.test(o.from ?? '') || Number.isNaN(Date.parse(o.from))) errs.push(`${at}.from phải là ngày YYYY-MM-DD`);
      if (froms.has(o.from)) errs.push(`${at}.from trùng ngày`);
      froms.add(o.from);
      if (typeof o.reason !== 'string' || o.reason.trim().length < 5) errs.push(`${at}.reason bắt buộc (≥ 5 ký tự)`);
      if (vs) for (const e of checkSchema(vs, o.value)) errs.push(`${at}.value ${e.message}`);
      if (o.basisKey !== undefined && basisKeys && !basisKeys.has(o.basisKey)) errs.push(`${at}.basisKey ${o.basisKey} không có trong vn.can-cu-phap-ly`);
    });
  }
  return errs;
}

export { overrideAt };

/** Bản cấu hình hiện hành của đơn vị cho một thư viện (null = chưa cấu hình). */
export async function currentLibraryConfig(db: Db, tenantId: string | number, libraryId: string): Promise<LibraryConfigVersion | null> {
  const r = await sql<{ version: number; config: LibraryConfig; reason: string; created_by: string; created_at: Date }>`
    SELECT version, config, reason, created_by, created_at FROM library_settings
    WHERE tenant_id = ${String(tenantId)}::bigint AND library_id = ${libraryId} ORDER BY version DESC LIMIT 1`.execute(db);
  const x = r.rows[0];
  return x ? { version: x.version, config: x.config, reason: x.reason, createdBy: x.created_by, createdAt: new Date(x.created_at).toISOString() } : null;
}

/** Cấu hình hiện hành của mọi thư viện ở đơn vị (map id → config). */
export async function tenantLibraryConfigs(db: Db, tenantId: string | number): Promise<Map<string, LibraryConfigVersion>> {
  const r = await sql<{ library_id: string; version: number; config: LibraryConfig; reason: string; created_by: string; created_at: Date }>`
    SELECT DISTINCT ON (library_id) library_id, version, config, reason, created_by, created_at FROM library_settings
    WHERE tenant_id = ${String(tenantId)}::bigint ORDER BY library_id, version DESC`.execute(db);
  return new Map(r.rows.map((x) => [x.library_id, { version: x.version, config: x.config, reason: x.reason, createdBy: x.created_by, createdAt: new Date(x.created_at).toISOString() }]));
}

export async function libraryConfigHistory(db: Db, tenantId: string | number, libraryId: string): Promise<LibraryConfigVersion[]> {
  const r = await sql<{ version: number; config: LibraryConfig; reason: string; created_by: string; created_at: Date }>`
    SELECT version, config, reason, created_by, created_at FROM library_settings
    WHERE tenant_id = ${String(tenantId)}::bigint AND library_id = ${libraryId} ORDER BY version DESC LIMIT 100`.execute(db);
  return r.rows.map((x) => ({ version: x.version, config: x.config, reason: x.reason, createdBy: x.created_by, createdAt: new Date(x.created_at).toISOString() }));
}

/**
 * Lưu một phiên bản cấu hình mới (chỉ thêm). Kiểm khuôn; mọi khoảng ghi đè MỚI (chưa có ở bản trước) có `from` rơi vào kỳ đã khoá
 * → PERIOD_LOCKED. Trả phiên bản vừa ghi.
 */
export async function saveLibraryConfig(
  db: Db, tenantId: string | number, lib: Library, cfg: LibraryConfig, reason: string, actor: string, basisKeys?: Set<string>,
): Promise<LibraryConfigVersion> {
  const errs = checkLibraryConfig(lib, cfg, basisKeys);
  if (errs.length) throw Errors.validation(`Cấu hình thư viện ${lib.id} không hợp lệ: ${errs.join('; ')}`);
  const prev = await currentLibraryConfig(db, tenantId, lib.id);
  const old = new Set(Object.entries(prev?.config.overrides ?? {}).flatMap(([c, l]) => l.map((o) => `${c}|${o.from}|${JSON.stringify(o.value)}`)));
  for (const [code, list] of Object.entries(cfg.overrides ?? {})) {
    for (const o of list) {
      if (old.has(`${code}|${o.from}|${JSON.stringify(o.value)}`)) continue;
      const locked = await lockedPeriodAt(db, String(tenantId), o.from, null);
      if (locked) throw Errors.periodLocked(`Ghi đè ${code} từ ${o.from} rơi vào kỳ ${String(locked.month).padStart(2, '0')}/${locked.year} đã khoá — chọn ngày trong kỳ đang mở, hoặc mở khoá kỳ trước`);
    }
  }
  const version = (prev?.version ?? 0) + 1;
  await sql`INSERT INTO library_settings (tenant_id, library_id, version, config, reason, created_by)
    VALUES (${String(tenantId)}::bigint, ${lib.id}, ${version}, ${JSON.stringify(cfg)}::jsonb, ${reason.trim()}, ${actor})`.execute(db);
  return { version, config: cfg, reason: reason.trim(), createdBy: actor, createdAt: new Date().toISOString() };
}
