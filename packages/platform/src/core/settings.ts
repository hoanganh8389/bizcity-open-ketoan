// @bizcity-layer P bizcity.config
// [2026-11-02 12:30 AM Johnny Chu - Chu Hoàng Anh] PHASE-011 — settings.get theo registry (PHASES 3.6): ctx.settings.get đọc khoá đã khai, đúng chủ sở hữu, trong giao dịch của action
/**
 * CẤU HÌNH THEO REGISTRY (bizcity_settings@1, docs/contracts/bizcity-settings.registry.json; PHASES 3.6, năng lực settings.registry).
 *
 * Module đọc cấu hình đơn vị bằng `ctx.settings.get(key)` thay vì đọc thẳng `tenants.settings`:
 *   - khoá phải có trong registry (kiểu, mặc định, chỗ lưu, người sở hữu) — khoá lạ là lỗi, không trả undefined;
 *   - module chỉ đọc khoá mình sở hữu (`owner` = mã module) — không đọc cấu hình của module khác hay của Core
 *     (Core có khoá chứa bí mật: kết nối, khoá API). Core đọc khoá Core qua service của nó như cũ;
 *   - chỉ khoá phạm vi đơn vị lưu ở `tenants.settings.<đường>`; khoá cài đặt (env) không đọc qua đây;
 *   - đọc trong giao dịch của action → cùng ảnh chụp dữ liệu với phần còn lại của action, RLS theo đơn vị.
 * [2026-11-06 12:40 AM Johnny Chu - Chu Hoàng Anh] PHASE-029 — E2 đợt 1 (bizcity_settings@1 1.1.0-draft §2): một đường đọc `getSetting`,
 * một đường ghi `setSetting` trên kho `setting_values` (0076) — phạm vi user → branch → accounting_unit → tenant → mặc định, ngày hiệu lực,
 * phiên bản, chỉ thêm; khoá cũ ở tenants.settings ghi song song ở phạm vi đơn vị; `tenants.config_version` tăng mỗi lần ghi.
 * [2026-11-06 01:45 AM Johnny Chu - Chu Hoàng Anh] PHASE-029 — E2: migration đổi số 0076 → 0074 (chủ dự án chọn: ai merge trước lấy số trước).
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { sql } from 'kysely';
import type { Db } from '../db/client.js';
import { writeAudit } from './audit.js';
import { Errors } from './errors.js';

export interface SettingEntry {
  key: string;
  owner: string;
  scopes: string[];
  storage: string;
  default?: string | null;
  /** A ảnh hưởng sổ · B vận hành · C hiển thị (R-MATRIX-1). */
  class?: 'A' | 'B' | 'C';
  /** Quyền để ghi (registry); đường chung còn đòi settings:write ở action. */
  permission?: string;
  /** Khuôn máy đọc (§1 1.1): có trường này mới ghi / liệt kê qua đường chung. */
  valueType?: string;
  /** Căn cứ mặc định của khoá (1.2): văn bản, điều, khoản… — căn cứ của một phiên bản (setting_values.basis) thắng căn cứ này. */
  basis?: SettingBasis;
  /** Nơi đọc khoá (1.2), để màn HT13 trả lời "đổi khoá này ảnh hưởng gì". */
  usedBy?: SettingUse[];
}

/** Căn cứ pháp lý / quy tắc (bizcity_settings@1 1.2.0 §1). */
export interface SettingBasis { doc: string; article?: string; clause?: string; point?: string; url?: string; effectiveFrom?: string }
export type SettingUseKind = 'gate' | 'action' | 'form' | 'report';
export interface SettingUse { kind: SettingUseKind; ref: string }

const BASIS_TEXT_MAX = 500;
const BASIS_FIELDS = ['doc', 'article', 'clause', 'point', 'url', 'effectiveFrom'] as const;

/**
 * Kiểm khuôn căn cứ. Trả câu lỗi (tiếng Việt) hoặc null khi hợp lệ: đối tượng có `doc` (chuỗi 1..500), các trường còn lại tuỳ chọn
 * (chuỗi ≤ 500; `url` bắt đầu `https://`; `effectiveFrom` YYYY-MM-DD); trường lạ bị từ chối.
 */
export function checkSettingBasis(b: unknown): string | null {
  if (b === null || typeof b !== 'object' || Array.isArray(b)) return 'phải là đối tượng { doc, article?, clause?, point?, url?, effectiveFrom? }';
  const o = b as Record<string, unknown>;
  const extra = Object.keys(o).filter((k) => !(BASIS_FIELDS as readonly string[]).includes(k));
  if (extra.length) return `có trường lạ: ${extra.join(', ')}`;
  if (typeof o.doc !== 'string' || !o.doc.trim() || o.doc.length > BASIS_TEXT_MAX) return 'doc (văn bản) bắt buộc, chuỗi 1..500 ký tự';
  for (const k of ['article', 'clause', 'point'] as const) {
    if (o[k] !== undefined && (typeof o[k] !== 'string' || (o[k] as string).length > BASIS_TEXT_MAX)) return `${k} phải là chuỗi ≤ ${BASIS_TEXT_MAX} ký tự`;
  }
  if (o.url !== undefined && (typeof o.url !== 'string' || !/^https:\/\/\S{1,480}$/.test(o.url))) return 'url phải bắt đầu https://';
  if (o.effectiveFrom !== undefined && (typeof o.effectiveFrom !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(o.effectiveFrom))) return 'effectiveFrom phải là YYYY-MM-DD';
  return null;
}

const REGISTRY_FILE = 'docs/contracts/bizcity-settings.registry.json';
// Như core/version.ts: chạy từ src (tsx) hay dist (node) thì gốc repo đều cách 4 cấp.
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../..');

let registry: Map<string, SettingEntry> | null = null;

/** Registry khoá cấu hình (đọc một lần). Image api chép kèm tệp registry; thiếu tệp → mọi lần đọc báo lỗi rõ. */
export function settingsRegistry(): Map<string, SettingEntry> {
  if (registry) return registry;
  let entries: SettingEntry[] = [];
  try {
    entries = (JSON.parse(readFileSync(path.join(root, REGISTRY_FILE), 'utf8')) as { settings: SettingEntry[] }).settings;
  } catch {
    entries = [];
  }
  registry = new Map(entries.map((e) => [e.key, e]));
  return registry;
}

const TENANT_STORAGE = /^tenants\.settings\.([A-Za-z0-9_]+(?:\.[A-Za-z0-9_]+)*)$/;

// [2026-11-02 10:40 PM Johnny Chu - Chu Hoàng Anh] PHASE-014 — W4 (G2): khoá cấu hình do module SDK khai (modules/<key>/settings.registry.json) gộp vào registry lúc nạp module
/**
 * Gộp khoá của một module vào registry. Mỗi khoá: `owner` = mã module, `key` dưới `bizcity.<module_gạch_dưới>.`, lưu ở
 * `tenants.settings.*`, phạm vi `tenant`, có trong `declared` (manifest `settings`). Trùng khoá của Core / module khác → lỗi.
 */
export function registerModuleSettings(module: string, entries: SettingEntry[], declared: readonly string[]): void {
  const reg = settingsRegistry();
  const prefix = `bizcity.${module.replace(/-/g, '_')}.`;
  const bad: string[] = [];
  for (const e of entries) {
    if (e.owner !== module) bad.push(`${e.key}: owner phải là "${module}"`);
    if (!e.key.startsWith(prefix)) bad.push(`${e.key}: phải dưới "${prefix}"`);
    if (!declared.includes(e.key)) bad.push(`${e.key}: chưa khai ở settings của manifest`);
    if (!TENANT_STORAGE.test(e.storage)) bad.push(`${e.key}: storage phải là tenants.settings.<đường>`);
    if (!(e.scopes ?? []).includes('tenant')) bad.push(`${e.key}: scopes phải có "tenant"`);
    const cur = reg.get(e.key);
    if (cur && cur.owner !== module) bad.push(`${e.key}: trùng khoá của ${cur.owner}`);
  }
  for (const k of declared) if (!entries.some((e) => e.key === k) && !reg.has(k)) bad.push(`${k}: khai ở manifest nhưng thiếu trong settings.registry.json của module`);
  if (bad.length) throw new Error(`Cấu hình module ${module}: ${bad.join('; ')}`);
  for (const e of entries) reg.set(e.key, e);
}

/** Giá trị mặc định khai trong registry (chuỗi JSON nếu đọc được, không thì giữ nguyên chuỗi). */
function parseDefault(v: string | null | undefined): unknown {
  if (v == null) return null;
  try {
    return JSON.parse(v);
  } catch {
    return v;
  }
}

/**
 * Đọc một khoá cấu hình của đơn vị cho module `module`. Lỗi:
 *   VALIDATION_ERROR  khoá không có trong registry / không lưu theo đơn vị;
 *   FORBIDDEN         khoá của module khác hoặc của Core.
 */
export async function readSetting<T = unknown>(trx: Db, tenantId: string, module: string, key: string): Promise<T> {
  const entry = settingsRegistry().get(key);
  if (!entry) throw Errors.validation(`Khoá cấu hình "${key}" không có trong registry (docs/contracts/bizcity-settings.registry.json)`);
  if (entry.owner !== module) throw Errors.forbidden(`Module ${module} không đọc được khoá "${key}" của ${entry.owner}`);
  if (!entry.scopes.includes('tenant') || !(TENANT_STORAGE.test(entry.storage) || entry.storage === VALUES_STORAGE)) {
    throw Errors.validation(`Khoá "${key}" không lưu theo đơn vị (${entry.storage}) — không đọc qua ctx.settings`);
  }
  return (await getSetting(trx, tenantId, key)).value as T;
}

// ── Một đường đọc / ghi (bizcity_settings@1 1.1.0-draft §2) ─────────────────────────────────────────────────────────────

/** Khoá mới chỉ lưu ở kho giá trị (không có nhánh JSON cũ). */
export const VALUES_STORAGE = 'setting_values';
export type SettingScopeType = 'tenant' | 'accounting_unit' | 'branch' | 'user';
/** Thứ tự giải: hẹp thắng trước. */
const SCOPE_ORDER: readonly SettingScopeType[] = ['user', 'branch', 'accounting_unit', 'tenant'];

export interface SettingScope { accountingUnitId?: string; branchId?: string; userId?: string; date?: string }
export type SettingSource = { scope: SettingScopeType; scopeId: string; validFrom: string; version: number } | 'legacy' | 'default';
export interface SettingRead { key: string; value: unknown; source: SettingSource; configVersion: number; /** Căn cứ của phiên bản đang áp (1.2); null khi nguồn là giá trị cũ / mặc định hoặc phiên bản chưa khai căn cứ. */ basis?: SettingBasis | null }
export interface SettingVersion { scope: SettingScopeType; scopeId: string; value: unknown; validFrom: string; version: number; reason: string | null; basis: SettingBasis | null; by: string; at: string }

/** Hôm nay theo giờ Việt Nam (YYYY-MM-DD) — ngày hiệu lực của cấu hình tính theo lịch Việt Nam như ngày chứng từ. */
export function settingsToday(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Ho_Chi_Minh', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function knownEntry(key: string): SettingEntry {
  const entry = settingsRegistry().get(key);
  if (!entry) throw Errors.validation(`Khoá cấu hình "${key}" không có trong registry (docs/contracts/bizcity-settings.registry.json)`);
  return entry;
}

/** Đường nhánh JSON cũ của khoá (`tenants.settings.<đường>`), null nếu khoá không lưu ở đó. */
function legacyPath(entry: SettingEntry): string[] | null {
  const m = TENANT_STORAGE.exec(entry.storage);
  return m ? m[1]!.split('.') : null;
}

/**
 * Kiểm một giá trị theo `valueType`. Trả câu lỗi (tiếng Việt) hoặc null khi hợp lệ.
 * Khuôn: boolean · integer[min..max] · integer · string · string[] · enum(a|b) · enum[](a|b).
 */
export function checkSettingValue(valueType: string, v: unknown): string | null {
  if (valueType === 'boolean') return typeof v === 'boolean' ? null : 'phải là true / false';
  if (valueType === 'string') return typeof v === 'string' && v.length <= 2000 ? null : 'phải là chuỗi (≤ 2000 ký tự)';
  if (valueType === 'string[]') return Array.isArray(v) && v.length <= 200 && v.every((x) => typeof x === 'string') ? null : 'phải là mảng chuỗi';
  const int = /^integer(?:\[(-?\d+)\.\.(-?\d+)\])?$/.exec(valueType);
  if (int) {
    if (typeof v !== 'number' || !Number.isInteger(v)) return 'phải là số nguyên';
    if (int[1] !== undefined && (v < Number(int[1]) || v > Number(int[2]))) return `phải trong khoảng ${int[1]}..${int[2]}`;
    return null;
  }
  const en = /^enum(\[\])?\(([^)]+)\)$/.exec(valueType);
  if (en) {
    const set = en[2]!.split('|');
    if (en[1]) return Array.isArray(v) && v.every((x) => typeof x === 'string' && set.includes(x)) && new Set(v).size === v.length ? null : `phải là mảng không trùng, mỗi phần tử thuộc ${set.join(' / ')}`;
    return typeof v === 'string' && set.includes(v) ? null : `phải là một trong ${set.join(' / ')}`;
  }
  return `valueType "${valueType}" không nhận ra — sửa registry`;
}

/** Phạm vi đã khai được dùng cho đọc: (loại, mã) theo thứ tự hẹp → rộng, chỉ phạm vi registry cho phép. */
function scopeChain(entry: SettingEntry, scope: SettingScope): { type: SettingScopeType; id: string }[] {
  const given: Record<SettingScopeType, string | undefined> = { user: scope.userId, branch: scope.branchId, accounting_unit: scope.accountingUnitId, tenant: '' };
  return SCOPE_ORDER.filter((t) => entry.scopes.includes(t) && given[t] !== undefined).map((t) => ({ type: t, id: given[t]! }));
}

async function configVersion(trx: Db, tenantId: string): Promise<number> {
  const r = await sql<{ v: string }>`SELECT config_version AS v FROM tenants WHERE id = ${tenantId}`.execute(trx);
  return Number(r.rows[0]?.v ?? 0);
}

async function legacyValue(trx: Db, tenantId: string, parts: string[]): Promise<unknown> {
  const r = await sql<{ v: unknown }>`SELECT settings #> ${parts}::text[] AS v FROM tenants WHERE id = ${tenantId}`.execute(trx);
  return r.rows[0]?.v ?? null;
}

/**
 * Giá trị hiệu lực của `key` cho đơn vị ở phạm vi / ngày cho trước. Hẹp → rộng; ở mỗi phạm vi lấy phiên bản `valid_from ≤ ngày`
 * mới nhất. Khoá còn nhánh JSON cũ: ở phạm vi đơn vị, ngày hôm nay trở đi, nhánh JSON là giá trị hiện hành (đường ghi cũ còn chạy).
 */
export async function getSetting(trx: Db, tenantId: string, key: string, scope: SettingScope = {}): Promise<SettingRead> {
  const entry = knownEntry(key);
  const today = settingsToday();
  const date = scope.date ?? today;
  if (!DATE_RE.test(date)) throw Errors.validation(`Ngày "${date}" sai khuôn YYYY-MM-DD`);
  const cv = await configVersion(trx, tenantId);
  const legacy = legacyPath(entry);
  for (const s of scopeChain(entry, scope)) {
    if (s.type === 'tenant' && legacy && date >= today) {
      const v = await legacyValue(trx, tenantId, legacy);
      if (v !== null) {
        // Giá trị hiện hành lấy từ nhánh JSON cũ (bản sao của phiên bản mới nhất): căn cứ vẫn là của phiên bản hiện hành trong setting_values.
        const b = await sql<{ basis: SettingBasis | null }>`
          SELECT basis FROM setting_values WHERE tenant_id = ${tenantId} AND key = ${key} AND scope_type = 'tenant' AND scope_id = '' AND valid_from <= ${date}::date
          ORDER BY valid_from DESC, version DESC LIMIT 1`.execute(trx);
        return { key, value: v, source: 'legacy', configVersion: cv, basis: b.rows[0]?.basis ?? null };
      }
    }
    const r = await sql<{ value: unknown; valid_from: string; version: number; basis: SettingBasis | null }>`
      SELECT value, to_char(valid_from, 'YYYY-MM-DD') AS valid_from, version, basis FROM setting_values
      WHERE tenant_id = ${tenantId} AND key = ${key} AND scope_type = ${s.type} AND scope_id = ${s.id} AND valid_from <= ${date}::date
      ORDER BY valid_from DESC, version DESC LIMIT 1`.execute(trx);
    const row = r.rows[0];
    if (row) return { key, value: row.value, source: { scope: s.type, scopeId: s.id, validFrom: row.valid_from, version: Number(row.version) }, configVersion: cv, basis: row.basis ?? null };
    // Ngày quá khứ chưa có phiên bản nào: giá trị nhánh JSON cũ là điều duy nhất biết được (có từ trước khi có lịch sử).
    if (s.type === 'tenant' && legacy) {
      const v = await legacyValue(trx, tenantId, legacy);
      if (v !== null) return { key, value: v, source: 'legacy', configVersion: cv };
    }
  }
  return { key, value: parseDefault(entry.default), source: 'default', configVersion: cv };
}

export interface SetSettingInput {
  value: unknown;
  scope?: SettingScopeType;
  scopeId?: string;
  validFrom?: string;
  reason?: string;
  /** Căn cứ của phiên bản này (1.2), tuỳ chọn — kể cả khoá loại A (D030-12). */
  basis?: SettingBasis | null;
}

/**
 * Ghi một phiên bản mới của `key` (đường ghi duy nhất của khoá có `valueType`). Quyền settings:write do action kiểm; ở đây kiểm
 * quyền riêng của khoá (`can`), phạm vi, khuôn giá trị, lý do, ngày. Rồi: thêm dòng, ghi song song nhánh JSON cũ (phạm vi đơn vị,
 * hiệu lực ≤ hôm nay), tăng `config_version`, ghi nhật ký trước / sau.
 */
export async function setSetting(
  trx: Db,
  who: { tenantId: string; actor: string; can: (permission: string) => boolean },
  key: string,
  input: SetSettingInput,
): Promise<SettingRead & { before: unknown }> {
  const entry = knownEntry(key);
  if (!entry.valueType) throw Errors.validation(`Khoá "${key}" chưa có valueType trong registry — ghi qua đường riêng (${entry.storage})`);
  if (entry.permission && !who.can(entry.permission)) throw Errors.forbidden(`Ghi "${key}" cần quyền ${entry.permission}`);
  const scope = input.scope ?? 'tenant';
  const scopeId = scope === 'tenant' ? '' : (input.scopeId ?? '').trim();
  if (!entry.scopes.includes(scope)) throw Errors.validation(`Khoá "${key}" không đặt theo phạm vi ${scope} (chỉ: ${entry.scopes.join(', ')})`);
  if (scope !== 'tenant' && !/^\d+$/.test(scopeId)) throw Errors.validation(`Phạm vi ${scope} cần scopeId là định danh số`);
  const bad = checkSettingValue(entry.valueType, input.value);
  if (bad) throw Errors.validation(`Giá trị của "${key}" ${bad}`);
  const today = settingsToday();
  const validFrom = input.validFrom ?? today;
  if (!DATE_RE.test(validFrom)) throw Errors.validation(`validFrom "${validFrom}" sai khuôn YYYY-MM-DD`);
  const reason = input.reason?.trim() || null;
  if ((entry.class === 'A' || validFrom < today) && (!reason || reason.length < 3)) {
    throw Errors.validation(entry.class === 'A' ? `Khoá loại A "${key}" ảnh hưởng sổ — cần lý do (≥ 3 ký tự)` : 'Hiệu lực lùi về trước hôm nay — cần lý do (≥ 3 ký tự)');
  }
  if (input.basis != null) {
    const badBasis = checkSettingBasis(input.basis);
    if (badBasis) throw Errors.validation(`Căn cứ của "${key}" ${badBasis}`);
  }
  const basis = input.basis ?? null;
  const legacy = legacyPath(entry);
  if (legacy && validFrom > today) throw Errors.validation(`Khoá "${key}" còn đường đọc cũ (${entry.storage}) — chưa nhận ngày hiệu lực tương lai (đợt 2)`);
  if (scope !== 'tenant') await assertScopeExists(trx, who.tenantId, scope, scopeId);

  const before = (await getSetting(trx, who.tenantId, key, scopeFor(scope, scopeId, validFrom))).value;
  const next = await sql<{ v: number }>`
    SELECT COALESCE(MAX(version), 0) + 1 AS v FROM setting_values
    WHERE tenant_id = ${who.tenantId} AND key = ${key} AND scope_type = ${scope} AND scope_id = ${scopeId}`.execute(trx);
  const version = Number(next.rows[0]!.v);
  await sql`
    INSERT INTO setting_values (tenant_id, key, scope_type, scope_id, value, valid_from, version, reason, basis, created_by)
    VALUES (${who.tenantId}, ${key}, ${scope}, ${scopeId}, ${JSON.stringify(input.value)}::jsonb, ${validFrom}::date, ${version}, ${reason}, ${basis === null ? null : JSON.stringify(basis)}::jsonb, ${who.actor})`.execute(trx);
  // Ghi song song nhánh JSON cũ chỉ khi phiên bản này là hiện hành (không có phiên bản đơn vị hiệu lực muộn hơn mà đã tới ngày).
  const newer = await sql<{ n: number }>`
    SELECT count(*)::int AS n FROM setting_values WHERE tenant_id = ${who.tenantId} AND key = ${key} AND scope_type = 'tenant'
      AND valid_from > ${validFrom}::date AND valid_from <= ${today}::date`.execute(trx);
  if (legacy && scope === 'tenant' && !newer.rows[0]?.n) {
    // jsonb_set chỉ tạo khoá lá: dựng từng nhánh cha còn thiếu trước (vd `item` của `item.autoCreate`).
    for (let i = 1; i < legacy.length; i++) {
      const parent = legacy.slice(0, i);
      await sql`UPDATE tenants SET settings = jsonb_set(COALESCE(settings, '{}'::jsonb), ${parent}::text[], COALESCE(settings #> ${parent}::text[], '{}'::jsonb), true) WHERE id = ${who.tenantId}`.execute(trx);
    }
    await sql`UPDATE tenants SET settings = jsonb_set(COALESCE(settings, '{}'::jsonb), ${legacy}::text[], ${JSON.stringify(input.value)}::jsonb, true) WHERE id = ${who.tenantId}`.execute(trx);
  }
  await sql`UPDATE tenants SET config_version = config_version + 1 WHERE id = ${who.tenantId}`.execute(trx);
  await writeAudit(trx, {
    tenantId: who.tenantId, actor: who.actor, action: 'settings.set', objectType: 'setting', objectId: key,
    before: { value: before }, after: { value: input.value, scope, scopeId, validFrom, version, reason, basis },
  });
  const cv = await configVersion(trx, who.tenantId);
  return { key, value: input.value, before, source: { scope, scopeId, validFrom, version }, configVersion: cv, basis };
}

const scopeFor = (scope: SettingScopeType, id: string, date: string): SettingScope =>
  scope === 'user' ? { userId: id, date } : scope === 'branch' ? { branchId: id, date } : scope === 'accounting_unit' ? { accountingUnitId: id, date } : { date };

/** Phạm vi hẹp phải trỏ tới một bản ghi có thật của đơn vị (định danh, không phải mã — ECP-04). */
async function assertScopeExists(trx: Db, tenantId: string, scope: SettingScopeType, id: string): Promise<void> {
  const table = scope === 'user' ? sql`users` : scope === 'branch' ? sql`branches` : sql`accounting_units`;
  const r = await sql<{ n: number }>`SELECT count(*)::int AS n FROM ${table} WHERE tenant_id = ${tenantId} AND id = ${id}::bigint`.execute(trx);
  if (!r.rows[0]?.n) throw Errors.notFound(`${scope} ${id} của đơn vị`);
}

/** Mọi phiên bản của `key` trong đơn vị (mới trước). */
export async function settingHistory(trx: Db, tenantId: string, key: string): Promise<SettingVersion[]> {
  knownEntry(key);
  const r = await sql<{ scope_type: SettingScopeType; scope_id: string; value: unknown; valid_from: string; version: number; reason: string | null; basis: SettingBasis | null; created_by: string; created_at: Date }>`
    SELECT scope_type, scope_id, value, to_char(valid_from, 'YYYY-MM-DD') AS valid_from, version, reason, basis, created_by, created_at
    FROM setting_values WHERE tenant_id = ${tenantId} AND key = ${key} ORDER BY created_at DESC, id DESC LIMIT 500`.execute(trx);
  return r.rows.map((x) => ({ scope: x.scope_type, scopeId: x.scope_id, value: x.value, validFrom: x.valid_from, version: Number(x.version), reason: x.reason, basis: x.basis ?? null, by: x.created_by, at: new Date(x.created_at).toISOString() }));
}

// [2026-11-03 12:10 AM Johnny Chu - Chu Hoàng Anh] PHASE-014 — W5 (SC-MOD-2): ghi một mục cấu hình của module trong tenants.settings — phân hệ không UPDATE bảng tenants
/**
 * Ghi mục `section` (vd "purchase" của phân hệ Mua hàng) trong tenants.settings của đơn vị: thay cả mục, giữ các mục khác.
 * Chỉ cho mục cấu hình riêng của một module (không phải khoá registry của Core); quyền ghi do route / action gọi kiểm.
 */
export async function writeTenantSection(trx: Db, tenantId: string, section: string, value: unknown): Promise<void> {
  if (!/^[a-z][a-z0-9_]*$/.test(section)) throw Errors.validation(`Mục cấu hình "${section}" sai khuôn`);
  await sql`UPDATE tenants SET settings = jsonb_set(COALESCE(settings, '{}'::jsonb), ARRAY[${section}]::text[], ${JSON.stringify(value)}::jsonb) WHERE id = ${tenantId}`.execute(trx);
}
