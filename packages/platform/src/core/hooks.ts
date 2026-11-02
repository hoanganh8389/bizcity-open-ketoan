// @bizcity-layer P module-sdk
// [2026-11-02 10:40 PM Johnny Chu - Chu Hoàng Anh] PHASE-014 — W4 (G3): điểm móc của Core cho module (BIZCITY-EXTENSION §4) — masterdata.referenceCheck
/**
 * ĐIỂM MÓC (hook) — Core hỏi module trước một thao tác của Core. Danh sách đóng (HOOKS); module khai bằng defineHook, chạy trong
 * giao dịch của thao tác, bằng vai trò mod_<key>_rw (đọc bảng của chính module). Module tắt ở đơn vị → không hỏi.
 *
 *   masterdata.referenceCheck   trước khi xoá đối tượng / mặt hàng: module trả câu "đang dùng ở …" (hoặc null) — có câu thì Core
 *                               từ chối xoá (CONFLICT), người dùng bỏ "Theo dõi" để khoá thay vì xoá.
 *
 * Hook chỉ được TRẢ LỜI (đọc), không ghi: handler nhận giao dịch đọc của module, lỗi trong hook → thao tác của Core huỷ (an toàn).
 */
import type { Db } from '../db/client.js';
import { asModuleRole } from '../db/module-db.js';
import { disabledModules } from './module-registry.js';

export const HOOKS = ['masterdata.referenceCheck'] as const;
export type HookName = (typeof HOOKS)[number];

export interface ReferenceCheckInput { kind: 'partner' | 'product'; code: string }

export interface HookContext {
  tenantId: string;
  /** Đọc bảng của chính module (mod_<key>.*) bằng vai trò mod_<key>_rw. */
  module<T>(fn: (tx: Db) => Promise<T>): Promise<T>;
}

export interface HookDef {
  id: string;
  module: string;
  hook: 'masterdata.referenceCheck';
  /** null = không dùng; chuỗi = câu báo cho người dùng (vd "hợp đồng HD-2026-0001"). */
  handle(ctx: HookContext, input: ReferenceCheckInput): Promise<string | null>;
}

const hooks = new Map<string, HookDef>();

export function defineHook(def: HookDef): HookDef {
  if (!(HOOKS as readonly string[]).includes(def.hook)) throw new Error(`Hook "${def.hook}" không có trong danh sách (${HOOKS.join(', ')})`);
  if (!def.id.startsWith(`${def.module}.`)) throw new Error(`Hook ${def.id} phải bắt đầu "${def.module}."`);
  return def;
}

export function registerHooks(defs: readonly HookDef[]): void {
  for (const d of defs) {
    const cur = hooks.get(d.id);
    if (cur && cur !== d) throw new Error(`Trùng mã hook: ${d.id}`);
    hooks.set(d.id, d);
  }
}

/** Hỏi mọi module bật ở đơn vị: đối tượng / mặt hàng này còn dùng ở đâu. Trả các câu "đang dùng ở …" (rỗng = xoá được). */
export async function referenceChecks(trx: Db, tenantId: string, input: ReferenceCheckInput): Promise<string[]> {
  const list = [...hooks.values()].filter((h) => h.hook === 'masterdata.referenceCheck');
  if (!list.length) return [];
  const off = await disabledModules(tenantId, trx);
  const out: string[] = [];
  for (const h of list) {
    if (off.has(h.module)) continue;
    const r = await h.handle({ tenantId, module: (fn) => asModuleRole(trx, h.module, fn) }, input);
    if (r) out.push(`${h.module}: ${r}`);
  }
  return out;
}
