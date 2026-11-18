// @bizcity-layer P permissions
// [2026-11-17 05:30 PM khanhtd] NT-HT-003 — GĐ4 (§14, H13): Core tự đăng ký màn × thao tác của module mới (manifest extensions.screens[]) vào sổ màn — module không import apps/*
/**
 * MÀN CỦA MODULE MỚI (`modules/<key>`): module khai màn ở manifest (`extensions.screens[]`, kiểm ở `defineModule` — quyền đã khai,
 * đúng tiền tố, có `xem`). Lúc nạp module, Core gọi `dangKyManHinh` thay module, với `khongKeoTheo`: quyền màn module KHÔNG được quyền
 * Core (documents:read / write…) kéo theo — giữ mặc định cấm của quyền module (ADR-0027 D-AUTH-03). Màn hiện ở GET /api/v1/man-hinh và
 * lưới HT12 như màn phân hệ cũ; action của module vẫn gác bằng `permission` của chính nó (không cần `lenh`).
 * Trả cảnh báo cho action GHI không thuộc thao tác màn nào (nút có trên màn mà HT12 không phân quyền được) — NT-HT-003 §16 câu 5: cảnh báo.
 */
import { dangKyManHinh, type LoaiThaoTac } from './man-hinh.js';

interface ScreenLike { key: string; code?: string; group?: string; label: string; path?: string; operations: Record<string, { permission: string; label: string; kind: LoaiThaoTac }> }
interface ActionLike { id: string; permission: string; effect: string }

export function dangKyManHinhModule(key: string, label: string, manifest: object, actions: readonly ActionLike[]): string[] {
  const screens = (((manifest as { extensions?: unknown }).extensions as { screens?: ScreenLike[] } | undefined)?.screens ?? []);
  for (const s of screens) {
    dangKyManHinh({
      key: s.key, ma: s.code ?? s.key, nhom: s.group ?? label, nhan: s.label, duongDan: s.path ?? `/app/${key}`, khongKeoTheo: true,
      thaoTac: Object.fromEntries(Object.entries(s.operations).map(([k, o]) => [k, { quyen: o.permission, nhan: o.label, loai: o.kind }])),
    });
  }
  if (!screens.length) return [];
  const perms = new Set(screens.flatMap((s) => Object.values(s.operations).map((o) => o.permission)));
  return actions
    .filter((a) => a.effect === 'write' && a.permission !== 'public' && !perms.has(a.permission))
    .map((a) => `Module ${key}: action ghi ${a.id} (quyền ${a.permission}) không thuộc thao tác màn nào — HT12 không phân quyền được nút này (khai vào extensions.screens[])`);
}
