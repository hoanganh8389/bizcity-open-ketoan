// @bizcity-layer P ui-kit
// [2026-11-02 09:33 PM Johnny Chu - Chu Hoàng Anh] PHASE-014 — W2 (PHASES 3.8): @bizcity/ui-kit — mặt tiền giao diện cho module; bản thật do apps/web cung cấp (provideUiKit)
/**
 * @bizcity/ui-kit (BIZCITY-EXTENSION §3, STD-EXT): phần web của module chỉ import gói này, không import `apps/web/src/*`.
 *
 *   Thành phần   PageHeader · Loading · ErrorBox · Empty · Field · Modal · Money · StatusBadge
 *   Dữ liệu      useApi() — client API có phiên đăng nhập, lệnh ghi tự gắn Idempotency-Key; errorText(err)
 *                useQuery / useMutation / useQueryClient — cùng bộ đệm với khung giao diện
 *   Quyền        useCan()(permission) — ẩn nút theo quyền (máy chủ vẫn kiểm lại)
 *   Lớp CSS      `btn` `btn-primary` `btn-xs` · `card` `card-body` · `grid` (bảng) · `input` · `badge` `badge-ok|warn|bad|info|gray` · `muted`
 *
 * Mặt tiền mỏng: mỗi thành phần chuyển sang bản thật khung giao diện đăng ký bằng provideUiKit lúc khởi động — giao diện của
 * module giống hệt màn của Core, không nhân đôi bộ thiết kế. Đổi giao diện Core không làm vỡ module (chữ ký ở đây là hợp đồng).
 */
import { createElement, type ComponentType, type ReactNode } from 'react';

export type ApiQuery = Record<string, string | number | boolean | null | undefined>;

export interface UiKitApi {
  get<T>(path: string, query?: ApiQuery): Promise<T>;
  post<T>(path: string, body?: unknown): Promise<T>;
  put<T>(path: string, body: unknown): Promise<T>;
  delete<T>(path: string): Promise<T>;
}

export interface PageHeaderProps { title: string; code?: string; subtitle?: string; actions?: ReactNode }
export interface FieldProps { label: string; children: ReactNode; full?: boolean; hint?: string }
export interface ModalProps { title: ReactNode; onClose: () => void; children: ReactNode; footer?: ReactNode; wide?: boolean }
export interface MoneyProps { value: number | null | undefined; blankZero?: boolean; bold?: boolean }

/** Bản thật khung giao diện cung cấp. */
export interface UiKitImpl {
  PageHeader: ComponentType<PageHeaderProps>;
  Loading: ComponentType<{ text?: string }>;
  ErrorBox: ComponentType<{ error: string | null | undefined }>;
  Empty: ComponentType<{ text?: string }>;
  Field: ComponentType<FieldProps>;
  Modal: ComponentType<ModalProps>;
  Money: ComponentType<MoneyProps>;
  StatusBadge: ComponentType<{ status: string }>;
  api: UiKitApi;
  errorText(err: unknown): string;
  useCan(): (permission: string) => boolean;
}

let impl: UiKitImpl | null = null;

/** Khung giao diện gọi một lần lúc khởi động, trước khi vẽ màn của module. */
export function provideUiKit(i: UiKitImpl): void {
  impl = i;
}

function kit(): UiKitImpl {
  if (!impl) throw new Error('@bizcity/ui-kit: khung giao diện chưa gọi provideUiKit');
  return impl;
}

export const PageHeader = (p: PageHeaderProps) => createElement(kit().PageHeader, p);
export const Loading = (p: { text?: string }) => createElement(kit().Loading, p);
export const ErrorBox = (p: { error: string | null | undefined }) => createElement(kit().ErrorBox, p);
export const Empty = (p: { text?: string }) => createElement(kit().Empty, p);
export const Field = (p: FieldProps) => createElement(kit().Field, p);
export const Modal = (p: ModalProps) => createElement(kit().Modal, p);
export const Money = (p: MoneyProps) => createElement(kit().Money, p);
export const StatusBadge = (p: { status: string }) => createElement(kit().StatusBadge, p);

/** Client API có phiên đăng nhập. Đường dẫn module: `/api/v1/m/<key>/…`. */
export function useApi(): UiKitApi {
  return kit().api;
}
export function errorText(err: unknown): string {
  return kit().errorText(err);
}
export function useCan(): (permission: string) => boolean {
  return kit().useCan();
}

export { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
