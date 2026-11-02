// @bizcity-layer P module-sdk
// [2026-11-02 04:20 PM Johnny Chu - Chu Hoàng Anh] PHASE-011 — 3.13 (ADR-0011 D1, D2, CK-5, CK-6): vòng đời module của bản cài — danh mục module đi kèm (thư mục, phiên bản, năng lực), đồng bộ registry (cài / nâng cấp / băm lại, lịch sử), đổi trạng thái, kiểm năng lực
/**
 * VÒNG ĐỜI MODULE CỦA BẢN CÀI (ADR-0011 D1, D2; PHASES 3.13). Ghi `module_registry` bằng vai trò SỞ HỮU (job cài đặt
 * `db/setup.ts`, lệnh `module` — `src/cli/module.ts`); API (ketoan_app) chỉ đọc registry (`core/module-registry.ts`).
 *
 *   syncBundled()  module đi kèm mã nguồn (phân hệ + add-in): chưa có → cài (active); đổi phiên bản → upgrade; cùng phiên bản
 *                  mà hash khác → rehash (bản dựng mới của cùng mã nguồn). Chạy mỗi lần triển khai (job db-migrate), nên
 *                  hash trong registry = bản vừa dựng; sửa tệp module sau đó (không qua triển khai) → API bỏ module (D2).
 *   setStatus()    activate / deactivate trên CẢ bản cài; activate kiểm năng lực manifest cần (planned → từ chối, CK-5).
 *
 * Bật / tắt theo ĐƠN VỊ là action core.module.enable / disable (modules/system/module.actions.ts), không ở đây.
 */
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { sql } from 'kysely';
import { db, type Db } from '../db/client.js';
import { STANDARD } from '@bizcity/platform/core/version';
import { hashModuleDir } from '@bizcity/platform/core/module-registry';
import { MODULE_MANIFESTS } from '../phan-he/index.js';
import { ADDIN_MANIFESTS } from '../addins/index.js';
import { discoverSdkModules } from './sdk-modules.js';
import { listActions, runAction } from '@bizcity/platform/core/actions';
import { Errors } from '@bizcity/platform/core/errors';
import type { AuthContext } from '@bizcity/platform/core/auth';

/** Module không tắt được ở đơn vị (lõi kế toán, hệ thống); tắt cả bản cài cũng không. */
export const REQUIRED_MODULES: ReadonlySet<string> = new Set(['ke-toan', 'he-thong']);

export interface BundledModule {
  key: string;
  kind: 'module' | 'addin';
  version: string;
  label: string;
  dir: string;
  requires: string[];
}

// [2026-11-02 09:33 PM Johnny Chu - Chu Hoàng Anh] PHASE-014 — W1: + module SDK ở modules/<key>/ (registry, hash, bật / tắt như phân hệ)
/** Module đi kèm mã nguồn Core: 9 phân hệ + add-in, theo manifest đã nạp; + module SDK trong `modulesDir` (mặc định <gốc repo>/modules). */
export function bundledModules(modulesDir?: string): BundledModule[] {
  const mods = [...MODULE_MANIFESTS.values()].map((m) => ({ m, kind: 'module' as const, dir: new URL(`../phan-he/${m.key}/`, import.meta.url) }));
  const adds = [...ADDIN_MANIFESTS.values()].map((m) => ({ m, kind: 'addin' as const, dir: new URL(`../addins/${m.key}/`, import.meta.url) }));
  const sdk = discoverSdkModules(modulesDir).map((s) => ({ key: s.key, kind: 'module' as const, version: s.manifest.version, label: s.manifest.label, dir: s.dir, requires: s.manifest.requires?.capabilities ?? [] }));
  const inCore = new Set([...MODULE_MANIFESTS.keys(), ...ADDIN_MANIFESTS.keys()]);
  const clash = sdk.filter((s) => inCore.has(s.key)).map((s) => s.key);
  if (clash.length) throw new Error(`Module SDK trùng mã phân hệ / add-in của Core: ${clash.join(', ')}`);
  return [...[...mods, ...adds].map(({ m, kind, dir }) => ({
    key: m.key, kind, version: m.version, label: m.label, dir: fileURLToPath(dir), requires: m.requires?.capabilities ?? [],
  })), ...sdk];
}

/** Năng lực manifest cần mà Core chưa có (`planned` hoặc không có trong bizcity-standard.json). */
export function missingCapabilities(requires: string[]): string[] {
  const caps = new Map(((STANDARD?.capabilities ?? []) as { id: string; status: string }[]).map((c) => [c.id, c.status]));
  return requires.filter((c) => caps.get(c) !== 'available');
}

const historyAppend = (entry: Record<string, unknown>) => sql<unknown>`history || ${JSON.stringify([entry])}::jsonb`;

export interface SyncChange { key: string; action: 'install' | 'upgrade' | 'rehash'; from?: string; to: string }

/** Đồng bộ module đi kèm vào registry. Chạy bằng vai trò sở hữu (job cài đặt / lệnh `module sync`). */
export async function syncBundled(by: string, trx: Db = db, modulesDir?: string): Promise<SyncChange[]> {
  const changes: SyncChange[] = [];
  const at = new Date().toISOString();
  for (const m of bundledModules(modulesDir)) {
    const hash = hashModuleDir(m.dir);
    const row = await trx.selectFrom('module_registry').select(['version', 'build_hash']).where('key', '=', m.key).executeTakeFirst();
    if (!row) {
      await trx.insertInto('module_registry').values({
        key: m.key, kind: m.kind, version: m.version, source: 'bundled', build_hash: hash, status: 'active',
        history: JSON.stringify([{ at, by, action: 'install', to: m.version }]),
      }).execute();
      changes.push({ key: m.key, action: 'install', to: m.version });
    } else if (row.version !== m.version || row.build_hash !== hash) {
      const action = row.version !== m.version ? 'upgrade' : 'rehash';
      await trx.updateTable('module_registry')
        .set({ version: m.version, build_hash: hash, updated_at: new Date(), history: historyAppend({ at, by, action, from: row.version, to: m.version }) })
        .where('key', '=', m.key).execute();
      changes.push({ key: m.key, action, from: row.version, to: m.version });
    }
  }
  return changes;
}

// [2026-11-02 06:20 PM Johnny Chu - Chu Hoàng Anh] PHASE-011 — 3.17 (ADR-0015 Q4): chạy seed[] của manifest — từng lời gọi core.*.upsert qua runAction (quyền, bằng chứng, idempotency riêng)
/** Action được phép trong `seed[]` (danh mục chuẩn; module không ghi bảng danh mục). */
export const SEED_ACTIONS: ReadonlySet<string> = new Set(['core.partner.upsert', 'core.product.upsert']);

/**
 * Chạy `seed[]` của module cho đơn vị của người gọi. Mỗi lời gọi là một runAction riêng (giao dịch, bằng chứng, khoá
 * idempotency `seed:<module>:<thứ tự>:<băm nội dung>` — chạy lại không tạo trùng, đổi nội dung seed không xung đột). `dryRun` → chạy thử từng lời gọi, không lưu.
 */
export async function runModuleSeed(key: string, auth: AuthContext, opts: { dryRun?: boolean; requestId: string }): Promise<{ key: string; calls: number; results: { action: string; ok: boolean; error?: string }[] }> {
  const m = MODULE_MANIFESTS.get(key) ?? ADDIN_MANIFESTS.get(key);
  if (!m) throw Errors.notFound(`module "${key}"`);
  const seed = m.seed ?? [];
  const results: { action: string; ok: boolean; error?: string }[] = [];
  for (const [n, s] of seed.entries()) {
    if (!SEED_ACTIONS.has(s.action)) throw Errors.validation(`seed của ${key}: action ${s.action} không được phép (chỉ ${[...SEED_ACTIONS].join(', ')})`);
    const def = listActions().find((a) => a.id === s.action);
    if (!def) throw Errors.notReady(`Chưa đăng ký action ${s.action}`);
    try {
      await runAction(def, s.input, { auth, requestId: opts.requestId, dryRun: opts.dryRun, idempotencyKey: `seed:${key}:${n}:${createHash('sha256').update(JSON.stringify(s)).digest('hex').slice(0, 16)}${opts.dryRun ? ':thu' : ''}` });
      results.push({ action: s.action, ok: true });
    } catch (err) {
      results.push({ action: s.action, ok: false, error: (err as Error).message });
    }
  }
  return { key, calls: seed.length, results };
}

/** activate / deactivate module trên cả bản cài. activate kiểm năng lực (CK-5); module bắt buộc không deactivate được. */
export async function setStatus(key: string, status: 'active' | 'disabled', by: string, trx: Db = db): Promise<{ key: string; status: string; changed: boolean }> {
  const m = bundledModules().find((x) => x.key === key);
  const row = await trx.selectFrom('module_registry').select(['status']).where('key', '=', key).executeTakeFirst();
  if (!row) throw new Error(`Module ${key} chưa có trong registry — chạy "module sync" trước`);
  if (status === 'disabled' && REQUIRED_MODULES.has(key)) throw new Error(`Module ${key} là lõi, không tắt được`);
  if (status === 'active' && m) {
    const missing = missingCapabilities(m.requires);
    if (missing.length) throw new Error(`Module ${key} cần năng lực Core chưa có: ${missing.join(', ')} (CAPABILITY_MISSING)`);
  }
  if (row.status === status) return { key, status, changed: false };
  await trx.updateTable('module_registry')
    .set({ status, updated_at: new Date(), history: historyAppend({ at: new Date().toISOString(), by, action: status === 'active' ? 'activate' : 'deactivate', from: row.status, to: status }) })
    .where('key', '=', key).execute();
  return { key, status, changed: true };
}
