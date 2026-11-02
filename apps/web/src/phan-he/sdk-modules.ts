// [2026-11-02 09:33 PM Johnny Chu - Chu Hoàng Anh] PHASE-014 — W2: phần web của module SDK (modules/<key>/web/index.tsx, defineWebModule) — mục Tổng quan, nhóm menu, route
/**
 * Module viết bằng @bizcity/module-sdk có phần giao diện ở `<gốc repo>/modules/<key>/web/index.tsx` (`export default defineWebModule(...)`);
 * biểu tượng, màu, thứ tự, mô tả lấy ở manifest (`ui`, `description`). Vite gom lúc dựng: module là mã nguồn của bản cài, thêm module
 * thì dựng lại web (ADR-0011 D3). Máy chủ tắt module ở đơn vị → /api/v1/system/modules không trả → giao diện ẩn như phân hệ.
 */
import type { ComponentType } from 'react';
import { webModuleParts, type WebModuleDef, type WebModuleParts, type WebSlot } from '@bizcity/module-sdk/web';

type Manifest = { key: string; description?: string; ui?: { icon?: string; color?: string; order?: number } };

// vite.config.ts (chạy trong Node, xuất erp-menu.json) cũng nạp tệp này qua layout/menu: ở đó không có import.meta.glob và không
// có window → không gom module SDK (erp-menu.json chỉ có menu Core).
const inBrowser = typeof window !== 'undefined';
const defs = inBrowser ? import.meta.glob<{ default: WebModuleDef<ComponentType> }>('../../../../modules/*/web/index.tsx', { eager: true }) : {};
const manifests = inBrowser ? import.meta.glob<Manifest>('../../../../modules/*/bizcity.module.json', { eager: true, import: 'default' }) : {};

// [2026-11-02 10:40 PM Johnny Chu - Chu Hoàng Anh] PHASE-014 — W4 (G5)
export interface SdkSlot { module: string; label: string; component: ComponentType<Record<string, unknown>>; permission?: string }
const SLOTS: Record<string, SdkSlot[]> = {};

export const SDK_WEB: WebModuleParts<ComponentType>[] = Object.entries(defs).map(([file, mod]) => {
  const m = manifests[file.replace(/web\/index\.tsx$/, 'bizcity.module.json')];
  if (!m || m.key !== mod.default.key) throw new Error(`Module ${file}: thiếu bizcity.module.json hoặc key khác defineWebModule`);
  for (const s of mod.default.slots ?? []) (SLOTS[s.slot] ??= []).push({ module: mod.default.key, label: s.label ?? mod.default.label, component: s.component as ComponentType<Record<string, unknown>>, permission: s.permission });
  return webModuleParts(mod.default, { description: m.description, ...m.ui });
});

/** Thành phần module cắm vào một điểm (slot) của màn Core. Khung giao diện lọc theo module bật + quyền. */
export function sdkSlots(slot: WebSlot): SdkSlot[] {
  return SLOTS[slot] ?? [];
}
