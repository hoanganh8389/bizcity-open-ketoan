// @bizcity-layer P module-sdk
// [2026-11-02 04:20 PM Johnny Chu - Chu Hoàng Anh] PHASE-011 — 3.13 (ADR-0011 D1, D2): registry module — hash thư mục module, quyết định nạp (active + hash khớp), ghi kết quả nạp, bật / tắt theo đơn vị (bộ đệm ngắn), cổng MODULE_DISABLED cho route
/**
 * REGISTRY MODULE (ADR-0011 D1, D2; PHASES 3.13). Hai mức bật:
 *
 *   Bản cài — module_registry (0052): job cài đặt / lệnh `module` ghi phiên bản, hash, trạng thái. Lúc khởi động API chỉ nạp
 *     module `active` có hash thư mục khớp (`decideLoad`); lệch → bỏ RIÊNG module đó (không sập API), ghi `last_load_result`,
 *     DG-MOD-1 đỏ. Registry trống (bản cài cũ, chưa chạy job) → nạp như cũ + cảnh báo. Ngoài bản thật (NODE_ENV ≠ production)
 *     hoặc BIZCITY_DEV_MODULES=1: hash lệch chỉ cảnh báo (sửa mã khi dev là chuyện thường).
 *   Đơn vị — tenant_modules (0052): không có dòng = bật. `moduleGate(keys)` chặn route của module tắt (MODULE_DISABLED) — route
 *     dùng chung nhiều module chỉ bị chặn khi MỌI module sở hữu đều tắt. Sự kiện tới subscriber của module tắt: events.ts giao
 *     'skipped'. Bộ đệm 30 giây theo đơn vị; đổi trong tiến trình này thì xoá ngay (`forgetTenantModules`).
 *
 * Không có đường nạp mã từ ngoài mã nguồn: module là import tĩnh trong mã đã dựng (ADR-0011 D3, không drop-in).
 */
import { createHash } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { db, type Db } from '../db/client.js';
import { Errors } from './errors.js';

/** sha256 của thư mục: mỗi tệp `đường-dẫn-tương-đối \0 kích-thước \0 nội-dung`, sắp theo đường dẫn (dấu `/`). */
// [2026-11-02 09:33 PM Johnny Chu - Chu Hoàng Anh] PHASE-014 — W1: bỏ node_modules (module SDK là gói npm riêng)
export function hashModuleDir(dir: string): string {
  const files: string[] = [];
  const walk = (d: string) => {
    for (const e of readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) { if (e.name !== 'node_modules') walk(p); }
      else if (e.isFile()) files.push(p);
    }
  };
  walk(dir);
  const rel = files.map((f) => [path.relative(dir, f).split(path.sep).join('/'), f] as const).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  const h = createHash('sha256');
  for (const [r, f] of rel) {
    const buf = readFileSync(f);
    h.update(r).update('\0').update(String(buf.length)).update('\0').update(buf);
  }
  return `sha256:${h.digest('hex')}`;
}

export interface RegistryRow {
  key: string;
  kind: 'module' | 'addin';
  version: string;
  source: 'bundled' | 'local';
  build_hash: string;
  status: 'installed' | 'active' | 'disabled';
}

/** Registry của bản cài; `null` khi bảng trống hoặc chưa có (bản cài cũ / chưa chạy job cài đặt). */
export async function readRegistry(): Promise<Map<string, RegistryRow> | null> {
  try {
    const rows = await db.selectFrom('module_registry').select(['key', 'kind', 'version', 'source', 'build_hash', 'status']).execute();
    return rows.length ? new Map(rows.map((r) => [r.key, r as RegistryRow])) : null;
  } catch {
    return null;
  }
}

export type LoadResult = 'loaded' | 'skipped_status' | 'skipped_hash' | 'skipped_missing';
export interface LoadDecision { key: string; load: boolean; result: LoadResult; hash: string; warning?: string }

/**
 * Nạp module này không? `registry = null` → nạp (bootstrap). Không có dòng → không nạp (chưa cài). Không `active` → không.
 * Hash lệch → không nạp khi `enforceHash`, ngược lại nạp kèm cảnh báo.
 */
export function decideLoad(key: string, hash: string, registry: Map<string, RegistryRow> | null, enforceHash: boolean): LoadDecision {
  if (!registry) return { key, load: true, result: 'loaded', hash, warning: 'registry module trống — nạp như cũ; chạy job cài đặt (setup) để ghi registry' };
  const row = registry.get(key);
  if (!row) return { key, load: false, result: 'skipped_status', hash, warning: `module ${key} chưa cài vào registry (lệnh: module sync / install)` };
  if (row.status !== 'active') return { key, load: false, result: 'skipped_status', hash, warning: `module ${key} trạng thái ${row.status}` };
  if (row.build_hash !== hash) {
    const warning = `module ${key}: hash thư mục ${hash.slice(0, 19)}… ≠ registry ${row.build_hash.slice(0, 19)}… (mã đổi mà chưa chạy module upgrade)`;
    return enforceHash ? { key, load: false, result: 'skipped_hash', hash, warning } : { key, load: true, result: 'loaded', hash, warning };
  }
  return { key, load: true, result: 'loaded', hash };
}

/** Ghi kết quả lần nạp (API chạy bằng ketoan_app: chỉ được cột last_load_*). Lỗi ghi không chặn khởi động. */
export async function recordLoad(decisions: LoadDecision[], missingInCode: string[] = []): Promise<void> {
  const now = new Date();
  try {
    for (const d of decisions) {
      await db.updateTable('module_registry').set({ last_load_at: now, last_load_result: d.result, last_load_hash: d.hash }).where('key', '=', d.key).execute();
    }
    if (missingInCode.length) {
      await db.updateTable('module_registry').set({ last_load_at: now, last_load_result: 'skipped_missing', last_load_hash: null }).where('key', 'in', missingInCode).execute();
    }
  } catch {
    /* registry chưa có (bản cài cũ) */
  }
}

// ── Bật / tắt theo đơn vị ──────────────────────────────────────────────────────────────────────────────────────────────────
const TTL_MS = 30_000;
const cache = new Map<string, { at: number; off: Set<string> }>();

/** Module đang TẮT ở đơn vị (dòng enabled = false). Đọc trong `trx` khi có (giao sự kiện), không thì qua pool. */
export async function disabledModules(tenantId: string, trx: Db = db): Promise<Set<string>> {
  const c = cache.get(tenantId);
  if (c && Date.now() - c.at < TTL_MS) return c.off;
  const rows = await trx.selectFrom('tenant_modules').select('module_key').where('tenant_id', '=', tenantId).where('enabled', '=', false).execute();
  const off = new Set(rows.map((r) => r.module_key));
  cache.set(tenantId, { at: Date.now(), off });
  return off;
}

export function forgetTenantModules(tenantId?: string): void {
  if (tenantId) cache.delete(tenantId);
  else cache.clear();
}

/**
 * preHandler cho route của module: đơn vị đã tắt MỌI module trong `owners` → MODULE_DISABLED. Không có đơn vị (route công
 * khai) → cho qua. Đăng ký ở phạm vi bọc route của module (app.ts), chạy sau xác thực.
 */
export function moduleGate(owners: string[]) {
  return async (req: FastifyRequest, _reply: FastifyReply): Promise<void> => {
    const tenantId = req.auth?.tenantId;
    if (!tenantId) return;
    const off = await disabledModules(tenantId);
    if (owners.length && owners.every((k) => off.has(k))) throw Errors.moduleDisabled(owners[0]!);
  };
}
