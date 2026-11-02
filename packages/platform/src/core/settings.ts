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
 * Ghi cấu hình chưa có ở v1 (vẫn qua route / action riêng của module).
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { sql } from 'kysely';
import type { Db } from '../db/client.js';
import { Errors } from './errors.js';

export interface SettingEntry {
  key: string;
  owner: string;
  scopes: string[];
  storage: string;
  default?: string | null;
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
  const m = TENANT_STORAGE.exec(entry.storage);
  if (!entry.scopes.includes('tenant') || !m) throw Errors.validation(`Khoá "${key}" không lưu theo đơn vị (${entry.storage}) — không đọc qua ctx.settings`);
  const pathParts = m[1]!.split('.');
  const row = await sql<{ v: unknown }>`SELECT settings #> ${pathParts}::text[] AS v FROM tenants WHERE id = ${tenantId}`.execute(trx);
  const v = row.rows[0]?.v;
  return (v === null || v === undefined ? parseDefault(entry.default) : v) as T;
}
