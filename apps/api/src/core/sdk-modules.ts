// @bizcity-layer P module-sdk
// [2026-11-02 09:33 PM Johnny Chu - Chu Hoàng Anh] PHASE-014 — W1: chỗ nạp module SDK (modules/<key>/) — tìm, đọc manifest, nạp defineModule; route dưới /api/v1/m/<key>/ (BIZCITY-EXTENSION §3)
/**
 * MODULE SDK CỦA BẢN CÀI (PHASE-014 W1). Module viết bằng @bizcity/module-sdk nằm ở `<gốc repo>/modules/<key>/`:
 *
 *   bizcity.module.json   manifest bizcity_module@1, kind "module", key = tên thư mục
 *   api/index.ts          export default defineModule({ manifest, actions, subscribers })
 *   dist/api/index.js     bản dựng (`npm run build` trong thư mục module) — API bản thật nạp tệp này
 *   migrations/*.sql      chạy bằng `npm run module -w @ketoan/api -- migrate <key>` (vai trò mod_<key>_owner)
 *
 * Thư mục chỉ có mã dùng chung (vd modules/mua-hang/domain, không có bizcity.module.json ở gốc) không phải module, bỏ qua.
 * Đường gốc đổi được bằng BIZCITY_MODULES_DIR (test, bản cài đặt module ở chỗ khác).
 *
 * Tìm và đọc manifest là đồng bộ (registry, lệnh `module` dùng); nạp mã là bất đồng bộ (app.ts). Khoá trùng phân hệ / add-in → dừng.
 */
import { existsSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import type { ModuleDef } from '@bizcity/module-sdk';
import { env } from '../config/env.js';
import { loadModuleManifest, type ModuleManifest } from './module-manifest.js';

export interface SdkModule {
  key: string;
  dir: string;
  manifest: ModuleManifest;
}

/** Thư mục gốc chứa module: BIZCITY_MODULES_DIR hoặc <gốc repo>/modules (src/core và dist/core cùng độ sâu). */
export function modulesRoot(): string {
  return env.BIZCITY_MODULES_DIR ? path.resolve(env.BIZCITY_MODULES_DIR) : fileURLToPath(new URL('../../../../modules/', import.meta.url));
}

/** Module SDK có trong bản cài, theo tên thư mục. Manifest hỏng / lệch key → lỗi (bản cài hỏng, như phân hệ). */
export function discoverSdkModules(root = modulesRoot()): SdkModule[] {
  if (!existsSync(root)) return [];
  const out: SdkModule[] = [];
  for (const e of readdirSync(root, { withFileTypes: true })) {
    if (!e.isDirectory()) continue;
    const dir = path.join(root, e.name);
    const file = path.join(dir, 'bizcity.module.json');
    if (!existsSync(file)) continue;
    out.push({ key: e.name, dir, manifest: loadModuleManifest(pathToFileURL(file), { key: e.name, kind: 'module' }) });
  }
  return out.sort((a, b) => (a.key < b.key ? -1 : 1));
}

/** Mã module: dist/api/index.js (bản dựng); chưa dựng thì api/index.ts (vitest, tsx khi dev). */
function entryOf(dir: string): string | null {
  for (const f of ['dist/api/index.js', 'api/index.ts']) if (existsSync(path.join(dir, f))) return path.join(dir, f);
  return null;
}

/** Nạp mã module; default export phải là defineModule(...) của đúng manifest này. */
export async function importSdkModule(m: SdkModule): Promise<ModuleDef> {
  const entry = entryOf(m.dir);
  if (!entry) throw new Error(`module ${m.key}: không có api/index.ts hoặc dist/api/index.js`);
  const mod = (await import(pathToFileURL(entry).href)) as { default?: ModuleDef };
  const def = mod.default;
  if (!def || !Array.isArray(def.actions) || !def.manifest) throw new Error(`module ${m.key}: ${path.relative(m.dir, entry)} phải export default defineModule({...})`);
  if (def.manifest.key !== m.key) throw new Error(`module ${m.key}: defineModule nhận manifest key "${def.manifest.key}"`);
  return def;
}
