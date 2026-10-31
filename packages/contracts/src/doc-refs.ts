// [2026-11-01 12:16 AM Johnny Chu - Chu Hoàng Anh] PHASE-010 — documents.* (PHASES 2.7): docRef, vai trò liên kết, kiểu phiên bản / đính kèm dùng chung API, runtime action, giao diện
// [2026-11-01 12:47 AM Johnny Chu - Chu Hoàng Anh] PHASE-010 — AttachmentRef.sha256 có thể null (tệp Mua hàng chuyển ở 0046)
/**
 * Chứng từ dùng chung (bizcity_document@1 §3, §7). Mọi chứng từ gọi bằng docRef = <module>.<loại>:<id>
 * (vd hop-dong.contract:42); sự việc kế toán của Kernel = ledger.event:<docKey>.
 * Máy chủ: apps/api/src/core/documents.ts; module gọi ctx.documents.*.
 */
import { z } from 'zod';

/** Khớp ràng buộc CHECK doc_ref ở migration 0045. */
export const DOC_REF_RE = /^[a-z][a-z0-9-]*\.[a-z][a-z0-9_-]*:\S{1,200}$/;
export const docRefSchema = z.string().regex(DOC_REF_RE, 'docRef dạng <module>.<loại>:<id>, vd hop-dong.contract:42');
export type DocRef = string;

/** Vai trò liên kết from → to (bizcity_document@1 §3). */
export const DOC_LINK_ROLES = ['source', 'reverses', 'replaces', 'settles', 'attachesTo', 'ledger'] as const;
export type DocLinkRole = (typeof DOC_LINK_ROLES)[number];

/** Mã module của docRef: phần trước dấu chấm đầu. */
export const docRefModule = (ref: DocRef): string => ref.slice(0, ref.indexOf('.'));

export interface DocumentVersion {
  version: number;
  contentHash: string;
  createdBy: string;
  createdAt: string;
  snapshot?: unknown;
}

export interface DocumentLink {
  from: DocRef;
  to: DocRef;
  role: DocLinkRole;
  createdBy: string;
  createdAt: string;
}

export interface AttachmentRef {
  id: string;
  docRef: DocRef;
  kind: string;
  fileName: string;
  contentType: string;
  sizeBytes: number;
  /** null: tệp chuyển từ đính kèm Mua hàng cũ (0046), chưa tải lần nào — máy chủ băm ở lần tải đầu. */
  sha256: string | null;
  note: string;
  createdBy: string;
  createdAt: string;
}

/** Tệp gửi lên: nội dung base64 (HTTP) hoặc Buffer (máy chủ). */
export interface FileInput {
  fileName: string;
  contentType?: string;
  data: Uint8Array;
}
